import type { Context } from "telegraf";
import { approveAgentTask, rejectAgentTask } from "../../agents/index.ts";

function ownerChatId(): string | null {
  return process.env.OWNER_TELEGRAM_CHAT_ID?.trim() || process.env.TELEGRAM_CHAT_ID?.trim() || null;
}

function getChatId(ctx: Context): string | null {
  return ctx.from?.id ? String(ctx.from.id) : null;
}

export async function handleAgentCallback(ctx: Context, kind: "approve" | "reject", id: string): Promise<void> {
  const owner = ownerChatId();
  const from = getChatId(ctx);
  if (owner && from && owner !== from) {
    await ctx.answerCbQuery("권한이 없습니다", { show_alert: true });
    return;
  }
  const task = kind === "approve" ? approveAgentTask(id) : rejectAgentTask(id, "회장 승인 거부");
  if (!task) {
    await ctx.answerCbQuery("작업을 찾지 못했습니다", { show_alert: true });
    return;
  }
  const text = kind === "approve"
    ? `✅ 에이전트 실행 승인\n📋 ${task.templateLabel}\n🆔 ${task.id}\n🎯 ${task.target}`
    : `❌ 에이전트 실행 거부\n📋 ${task.templateLabel}\n🆔 ${task.id}`;
  await ctx.editMessageText(text).catch(async () => {
    await ctx.reply(text);
  });
  await ctx.answerCbQuery(kind === "approve" ? "승인했습니다" : "거부했습니다");
}
