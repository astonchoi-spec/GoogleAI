import type { Telegraf } from "telegraf";
import { handleDealFile, isDealFileMessage } from "../../deals/telegramDealFileHandler.ts";
import { getConversationByTelegramChatId, getOrCreateTelegramConversation, saveMessage } from "../../db-chat.ts";
import { classifyIntent, formatIntentRouteMessage, routeIntentMessage } from "../../intent/intentService.ts";
import type LLMCaller from "../caller.ts";
import { getModel } from "../models.ts";
import type { SessionManager } from "../session.ts";
import { ADMIN_USER_ID, getConnectedGoogleUserId, saveAssistantMessage, type BotContext } from "./utils.ts";
import { handleWorkspaceCommand } from "./workspaceCommands.ts";

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

      const preIntent = await classifyIntent(userMessage);
      const workspaceResult = preIntent.action.startsWith("google_")
        ? await handleWorkspaceCommand(userMessage, ctx.chat?.id ?? 0, bot.telegram)
        : null;
      if (workspaceResult !== null) {
        const sentMessage = await ctx.reply(workspaceResult, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
        await saveAssistantMessage(conversationId, workspaceResult, sentMessage.message_id);
        return;
      }

      const routingUserId = (await getConnectedGoogleUserId()) ?? ctx.session.userId;
      console.log("[TG INTENT] routeIntentMessage userId:", routingUserId, "msg:", userMessage.slice(0, 60));
      const routed = await routeIntentMessage({
        userId: routingUserId,
        message: userMessage,
        allowExecute: true,
      });
      console.log("[TG INTENT] result: domain=", routed.intent.domain, "action=", routed.intent.action, "handled=", routed.handled);

      if (routed.handled || (routed.requiresConfirmation && routed.response)) {
        const routedText = formatIntentRouteMessage(routed) || routed.response;
        console.log("[TG INTENT] returning result, length:", routedText.length);
        if (routedText && routed.intent.domain !== "chat") {
          const sentMessage = await ctx.reply(routedText, {
            reply_parameters: { message_id: ctx.message.message_id },
          });
          await saveAssistantMessage(conversationId, routedText, sentMessage.message_id);
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
  const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. Gmail 전송, 캘린더 일정 생성, Drive 파일 조회 등 Google Workspace 기능을 실행할 수 있습니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;

  const response = await llmCaller.call(
    session.engine,
    session.modelKey,
    history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    systemPrompt
  );

  await sessionManager.addMessage(userId, "assistant", response.content);
  const sentMessage = await ctx.reply(response.content, {
    reply_parameters: { message_id: (ctx.message as any).message_id },
  });
  await saveAssistantMessage(conversationId, response.content, sentMessage.message_id);
}
