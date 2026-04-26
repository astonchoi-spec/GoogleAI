// telegram.ts — tRPC router exposing Telegram bot status without throwing
import { router, publicProcedure } from "../_core/trpc.ts";
import { getTelegramBot } from "../telegram-service.ts";

export const telegramRouter = router({
  getStatus: publicProcedure.query(async () => {
    const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
    const bot = getTelegramBot(); // null if not initialized
    const botInitialized = !!bot;

    let botUsername: string | null = null;
    let webhookUrl: string | null = null;
    let mode: "webhook" | "polling" | "none" = "none";

    if (bot) {
      // Try to get bot info — don't throw if this fails
      try {
        const info = await bot.telegram.getMe();
        botUsername = info.username ?? null;
      } catch {}

      try {
        const webhookInfo = await bot.telegram.getWebhookInfo();
        webhookUrl = webhookInfo.url || null;
        mode = webhookInfo.url ? "webhook" : "polling";
      } catch {}
    }

    return {
      hasToken,
      botInitialized,
      botUsername,
      webhookUrl,
      mode,
      chatLink: botUsername ? `https://t.me/${botUsername}` : null,
      // overall status for UI
      status: !hasToken ? ("no_token" as const)
             : !botInitialized ? ("token_set" as const)
             : ("active" as const),
    };
  }),
});
