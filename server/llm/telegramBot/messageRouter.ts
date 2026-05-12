import type { Telegraf } from "telegraf";
import { handleDealFile, isDealFileMessage } from "../../deals/telegramDealFileHandler.ts";
import { getConversationByTelegramChatId, getOrCreateTelegramConversation, saveMessage } from "../../db-chat.ts";
import { formatIntentRouteMessage, routeIntentMessage } from "../../intent/intentService.ts";
import { formatCitationFooter, searchLocalNotes } from "../../rag/localMdSearch.ts";
import type LLMCaller from "../caller.ts";
import { getModel } from "../models.ts";
import type { SessionManager } from "../session.ts";
import { ADMIN_USER_ID, getConnectedGoogleUserId, saveAssistantMessage, type BotContext } from "./utils.ts";
import { handleWorkspaceCommand } from "./workspaceCommands.ts";

// Phase 4-C: 약하게 매칭된 인텐트(confidence < 임계치)는 LLM fallback + RAG 로 다운그레이드.
// 0.55 같은 광범위 키워드 매칭이 자연 질의(예: "한남 PF 진행상황")를 가로채는 것을 방지.
// execute 타입(requiresConfirmation)은 임계치와 무관하게 확인 단계 진행.
const INTENT_CONFIDENCE_THRESHOLD = 0.7;

export function setupMessageRouter(
  bot: Telegraf<BotContext>,
  sessionManager: SessionManager,
  llmCaller: LLMCaller
): void {
  bot.on("message", async (ctx) => {
    if (!ctx.session?.userId) {
      return await ctx.reply("❌ 세션 오류");
    }

    const userMessage = (ctx.message as any)?.text as string | undefined;
    if (isDealFileMessage(ctx)) {
      try {
        await ctx.sendChatAction("typing");
        const response = await handleDealFile(ctx, bot.telegram);
        await ctx.reply(response, { reply_parameters: { message_id: ctx.message.message_id } });
      } catch (err) {
        console.error("[Telegram] deal file error:", err);
        await ctx.reply("⚠️ 딜 자료 저장 중 오류가 발생했습니다.");
      }
      return;
    }
    if (!userMessage) return;

    try {
      await ctx.sendChatAction("typing");
      const conversationId = await persistUserMessage(ctx, userMessage);

      // /tg Knowledge Pipeline 2단계 응답 — 1차 ack (Phase B-1, CURRENT_TASK §8.6)
      if (/^\/tg(\s|$)/i.test(userMessage.trim())) {
        try {
          await ctx.reply("📝 Wiki 저장 처리중...", {
            reply_parameters: { message_id: ctx.message.message_id },
          });
        } catch (e) {
          // ack 실패해도 본 흐름 진행
          console.warn("[Telegram] tg ack send failed:", (e as Error).message);
        }
      }

      // Step 1: routeIntentMessage 우선 — 웹 채팅과 동일한 경로
      const routingUserId = (await getConnectedGoogleUserId()) ?? ctx.session.userId;
      console.log("[TG INTENT] routeIntentMessage userId:", routingUserId, "msg:", userMessage.slice(0, 60));
      const routed = await routeIntentMessage({
        userId: routingUserId,
        message: userMessage,
        allowExecute: true,
      });
      console.log("[TG INTENT] result: domain=", routed.intent.domain, "action=", routed.intent.action, "handled=", routed.handled);

      const isStrongMatch = routed.handled && routed.intent.confidence >= INTENT_CONFIDENCE_THRESHOLD;
      const isExecuteConfirm = routed.requiresConfirmation && !!routed.response;
      if (isStrongMatch || isExecuteConfirm) {
        const routedText = formatIntentRouteMessage(routed) || routed.response;
        console.log("[TG INTENT] returning result, length:", routedText.length);
        if (routedText && routed.intent.domain !== "chat") {
          const sentMessage = await ctx.reply(routedText, {
            reply_parameters: { message_id: ctx.message.message_id },
          });
          await saveAssistantMessage(conversationId, routedText, sentMessage.message_id);
          return;
        }
      } else if (routed.handled) {
        // Phase 4-C: 약한 매칭 — 결과 폐기하고 LLM + RAG 로 fall-through
        console.log(
          "[TG INTENT] weak match (confidence",
          routed.intent.confidence.toFixed(2),
          "<",
          INTENT_CONFIDENCE_THRESHOLD,
          ") — falling through to RAG + LLM"
        );
      }

      // Step 2: handleWorkspaceCommand 폴백 — send_drive_file 등 Telegram 전용 액션 처리
      if (routed.intent.domain === "google" || routed.intent.action.startsWith("google_")) {
        const workspaceResult = await handleWorkspaceCommand(userMessage, ctx.chat?.id ?? 0, bot.telegram);
        if (workspaceResult !== null) {
          const sentMessage = await ctx.reply(workspaceResult, {
            reply_parameters: { message_id: ctx.message.message_id },
          });
          await saveAssistantMessage(conversationId, workspaceResult, sentMessage.message_id);
          return;
        }
      }

      await replyWithLlm(ctx, sessionManager, llmCaller, userMessage, conversationId);
    } catch (error) {
      console.error("Error processing message:", error);
      await ctx.reply(`❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  });
}

async function persistUserMessage(ctx: BotContext, userMessage: string): Promise<number | null> {
  try {
    const telegramChatId = ctx.chat?.id;
    let conversation = telegramChatId ? await getConversationByTelegramChatId(telegramChatId) : null;
    if (!conversation) {
      conversation = await getOrCreateTelegramConversation(ADMIN_USER_ID, telegramChatId || 0);
    }
    await saveMessage(conversation.id, "user", userMessage, "telegram", (ctx.message as any).message_id);
    return conversation.id;
  } catch (dbErr) {
    console.warn("[Telegram] DB unavailable, skipping message persistence:", (dbErr as Error).message);
    return null;
  }
}

async function replyWithLlm(
  ctx: BotContext,
  sessionManager: SessionManager,
  llmCaller: LLMCaller,
  userMessage: string,
  conversationId: number | null
): Promise<void> {
  const userId = ctx.session?.userId;
  if (!userId) {
    await ctx.reply("❌ 세션 오류");
    return;
  }

  const session = await sessionManager.getSession(userId);
  await sessionManager.addMessage(userId, "user", userMessage);
  const history = await sessionManager.getHistory(userId, 10);
  const currentDate = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const currentModel = getModel(session.engine, session.modelKey);
  const baseSystemPrompt = `당신은 에스턴 워크스테이션의 텔레그램 비서입니다. Gmail/캘린더/Drive/Sheets 등 Google Workspace 와 회장님의 개인 지식 저장소(Aston Wiki) 를 통합 운영합니다. 한국어로 간결하고 정확하게 답변하세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}

규칙:
- "내위키", "위키", "회수 자료", "노트북" 등은 회장님의 Aston Wiki(개인 지식 저장소) 를 가리킵니다. 외부 위키 사이트(newiki.com / 나무위키 / 위키피디아 등) 설명으로 빠지지 마세요. Aston Wiki 자체 설명이 필요하면 "/wiki 페이지·텔레그램·드라이브 회수가 통합된 회장님 개인 지식 허브" 한 줄로만 답하세요.
- Google Drive 링크, 공유 URL, file ID 는 절대 임의로 생성하지 마세요. 실제 조회 결과가 없으면 "직접 첨부는 불가능합니다 — '/wiki' 페이지에서 확인하시거나 '드라이브 검색 <키워드>' 로 조회해주세요" 라고만 답하세요. \`drive.google.com/file/d/...\` 같은 가짜 ID 출력 금지.
- 확인하지 못한 값은 예시나 자리표시자로 꾸미지 말고, 회수 자료 없음을 한 문장으로 말하세요.
- 실행/변경 작업은 회장님 명시적 승인 없이 완료했다고 말하지 마세요.`;

  // Phase 4-C: 로컬 NotebookLM 회수 자료 RAG 검색 (실패해도 일반 대화 진행)
  const ragHits = await searchLocalNotes(userMessage, { k: 3 }).catch((err) => {
    console.warn("[TG RAG] local search failed:", err);
    return [];
  });
  console.log("[TG RAG] hits:", ragHits.length);

  const ragContextBlock = ragHits.length
    ? `\n\n참고할 회수 자료(${ragHits.length}건):\n${ragHits
        .map((h, i) => `[${i + 1}] ${h.project}/${h.fileName}\n${h.snippet}`)
        .join("\n\n")}\n\n위 자료를 우선 참고하되, 자료에 없는 사실을 만들어내지 마세요.`
    : "";

  const systemPrompt = `${baseSystemPrompt}${ragContextBlock}`;

  const { injectAttachments } = await import("../attachmentInject.ts");
  const injected = await injectAttachments(systemPrompt, userMessage);

  const response = await llmCaller.call(
    session.engine,
    session.modelKey,
    history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    injected.systemPrompt
  );

  const finalResponse = response.content + formatCitationFooter(ragHits);

  await sessionManager.addMessage(userId, "assistant", finalResponse);
  const sentMessage = await ctx.reply(finalResponse, {
    reply_parameters: { message_id: (ctx.message as any).message_id },
  });

  if (injected.warnings.length > 0) {
    await ctx.reply("⚠️ " + injected.warnings.join("\n"));
  }

  await saveAssistantMessage(conversationId, finalResponse, sentMessage.message_id);
}
