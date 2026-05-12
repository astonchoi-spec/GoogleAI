import type { Telegraf } from "telegraf";
import { handleAgentCallback } from "../../intent/handlers/agentCallback.ts";
import { handleApprovalCallback } from "../../intent/handlers/approval.ts";
import { handleFileCallback } from "../../intent/handlers/fileCallback.ts";
import type { BotContext } from "./utils.ts";

export function setupCallbackRouter(bot: Telegraf<BotContext>): void {
  bot.action(/^(kakao|gmail|dl):/, async (ctx) =>
    handleFileCallback(ctx).catch(async (err) => {
      console.error("[Telegram] file callback error:", err);
      await ctx.answerCbQuery("처리 중 오류 발생", { show_alert: true }).catch(() => {});
    })
  );

  bot.action(/^(approve|reject|detail):(.+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const kind = match[1] as "approve" | "reject" | "detail";
    const id = match[2];
    try {
      await handleApprovalCallback(ctx, kind, id);
    } catch (err) {
      console.error("[Telegram] approval callback error:", err);
      try {
        await ctx.answerCbQuery("처리 중 오류 발생", { show_alert: true });
      } catch {}
    }
  });

  bot.action(/^agent_(approve|reject):(.+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const kind = match[1] as "approve" | "reject";
    const id = match[2];
    try {
      await handleAgentCallback(ctx, kind, id);
    } catch (err) {
      console.error("[Telegram] agent callback error:", err);
      try {
        await ctx.answerCbQuery("처리 중 오류 발생", { show_alert: true });
      } catch {}
    }
  });
}
