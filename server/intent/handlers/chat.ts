import {
  getOrCreateConversation,
  searchConversationMessages,
} from "../../db-chat.ts";
import { asNumber, type HandlerMap, type IntentHandler } from "../types.ts";

function formatTelegramTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

function previewContent(content: string, limit: number = 80): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, limit)}…`;
}

const recentTelegram: IntentHandler = async (intent, options) => {
  const limit = asNumber(intent.params.limit, 10);
  const userIdNum = Number(options.userId);
  if (!Number.isFinite(userIdNum)) {
    // Phase 6-D-5 — userId 미식별 분기. 짧은 안내. kind="text" + text="".
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "💬 사용자 식별이 안 되어 Telegram 메시지를 가져올 수 없습니다.",
      handlerResponse: {
        kind: "text",
        text: "",
        meta: {
          action: "chat_telegram_recent",
          status: "no_user_id",
          userIdValid: false,
        },
      },
    };
  }

  try {
    const conversation = await getOrCreateConversation(userIdNum);
    const msgs = await searchConversationMessages({
      conversationId: conversation.id,
      source: "telegram",
      limit,
    });
    if (msgs.length === 0) {
      // Phase 6-D-5 — 빈 메시지 분기. data.messages=[] 는 safeDisplayBody 가
      // 빈 문자열로 처리. kind="list" 로 의미적 일관성 유지 + text="" 마커.
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "💬 동기화된 Telegram 메시지가 없습니다.",
        data: { messages: [] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            status: "ok",
            messageCount: 0,
            isEmpty: true,
            limit,
          },
        },
      };
    }
    const lines = msgs.map((m, i) => {
      const time = formatTelegramTime(m.createdAt);
      const role = m.role === "assistant" ? "🤖" : "👤";
      return `${i + 1}. ${time} ${role} ${previewContent(m.content)}`;
    });
    // Phase 6-D-5 — 정상 분기. response 헤더 + lines 통합형.
    // data.messages 는 {id, role, content, createdAt} 객체 배열로 raw 노출 위험
    // 영역. formatReply 의 safeDisplayBody 가 객체로 인식해 빈 문자열로 처리하여
    // 사용자 응답에 노출되지 않음 (기존 동작 보존). kind="list" + text="" 마커.
    // conversationId 는 내부 DB id 라 meta 에서 명시적으로 제외.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `💬 최근 Telegram 메시지 ${msgs.length}건\n\n${lines.join("\n")}`,
      data: {
        conversationId: conversation.id,
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      },
      handlerResponse: {
        kind: "list",
        text: "",
        meta: {
          action: "chat_telegram_recent",
          status: "ok",
          messageCount: msgs.length,
          isEmpty: false,
          limit,
          source: "telegram",
        },
      },
    };
  } catch (err) {
    console.error("[chat] recentTelegram error:", err);
    // Phase 7-A — 에러 분기를 kind="error" 로 정식 재분류. byte-for-byte 동일.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `💬 Telegram 메시지 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "chat_telegram_recent",
          status: "error",
          errorType: err instanceof Error ? err.name : "unknown",
        },
      },
    };
  }
};

export const chatHandlers: HandlerMap = {
  chat_telegram_recent: recentTelegram,
};
