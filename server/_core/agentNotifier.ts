import type { AgentNotifier, AgentTask } from "../agents/index.ts";

function getOwnerChatId(): string | null {
  const candidates = [process.env.OWNER_TELEGRAM_CHAT_ID, process.env.TELEGRAM_CHAT_ID];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = getOwnerChatId();
  if (!token || !chatId) {
    console.warn("[agentNotifier] Telegram token or chat id missing — skip");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[agentNotifier] send failed:", response.status, detail);
    }
  } catch (err) {
    console.error("[agentNotifier] send error:", err);
  }
}

function formatStart(task: AgentTask): string {
  return [
    "🤖 에이전트 작업 시작",
    `📋 ${task.templateLabel}`,
    `🆔 ${task.id}`,
    `🎯 ${task.target}`,
  ].join("\n");
}

function formatComplete(task: AgentTask): string {
  const seconds = task.durationMs ? (task.durationMs / 1000).toFixed(1) : "?";
  const lines = [
    "✅ 에이전트 작업 완료",
    `📋 ${task.templateLabel}`,
    `🆔 ${task.id}`,
    `⏱ 소요 ${seconds}초`,
  ];
  if (task.resultPreview) {
    lines.push("", "📄 미리보기");
    lines.push(task.resultPreview);
  }
  if (task.result?.wikiPath) lines.push("", `🔗 ${task.result.wikiPath}`);
  return lines.join("\n");
}

function formatFail(task: AgentTask): string {
  return [
    "❌ 에이전트 작업 실패",
    `📋 ${task.templateLabel}`,
    `🆔 ${task.id}`,
    `사유: ${task.error ?? "알 수 없는 오류"}`,
    "재시도: 에이전트 실행 명령으로 다시 등록해주세요.",
  ].join("\n");
}

export const agentTelegramNotifier: AgentNotifier = {
  onStart: async (task) => sendTelegram(formatStart(task)),
  onComplete: async (task) => sendTelegram(formatComplete(task)),
  onFail: async (task) => sendTelegram(formatFail(task)),
};
