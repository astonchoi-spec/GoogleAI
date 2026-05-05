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
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "💬 사용자 식별이 안 되어 Telegram 메시지를 가져올 수 없습니다.",
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
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "💬 동기화된 Telegram 메시지가 없습니다.",
        data: { messages: [] },
      };
    }
    const lines = msgs.map((m, i) => {
      const time = formatTelegramTime(m.createdAt);
      const role = m.role === "assistant" ? "🤖" : "👤";
      return `${i + 1}. ${time} ${role} ${previewContent(m.content)}`;
    });
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
    };
  } catch (err) {
    console.error("[chat] recentTelegram error:", err);
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `💬 Telegram 메시지 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

export const chatHandlers: HandlerMap = {
  chat_telegram_recent: recentTelegram,
};
