/**
 * Telegram Webhook Handler
 * Receives and processes Telegram messages
 */

import { Router, Request, Response } from "express";
import TelegramBot from "../llm/telegram-bot";
import { sessionManager } from "../llm/session";
import LLMCaller from "../llm/caller";

const router = Router();
const llmCaller = new LLMCaller();

let telegramBot: TelegramBot | null = null;

/**
 * Initialize Telegram bot
 */
export async function initializeTelegramBot(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn("[Telegram] Bot token not configured. Telegram bot will not start.");
    return;
  }

  try {
    telegramBot = new TelegramBot(botToken, sessionManager, llmCaller);
    await telegramBot.start();
    console.log("✅ Telegram bot initialized");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn("[Telegram] Failed to initialize bot (this is expected in sandbox):", errorMsg);
    console.warn("[Telegram] Telegram bot will be available after deployment to production.");
    // Don't throw - allow server to continue running
  }
}

/**
 * Webhook endpoint for Telegram updates
 * POST /api/webhooks/telegram
 */
router.post("/telegram", async (req: Request, res: Response) => {
  try {
    const update = req.body;

    if (!update.message) {
      return res.json({ ok: true });
    }

    // Forward to bot for processing
    if (telegramBot) {
      const bot = telegramBot.getBot();
      await bot.handleUpdate(update);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook] Error:", error);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/**
 * Health check endpoint
 * GET /api/webhooks/telegram/health
 */
router.get("/telegram/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    botRunning: !!telegramBot,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Set webhook URL for Telegram
 * POST /api/webhooks/telegram/set-webhook
 */
router.post("/telegram/set-webhook", async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: "webhookUrl is required" });
    }

    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not initialized" });
    }

    const bot = telegramBot.getBot();
    await bot.telegram.setWebhook(webhookUrl);

    res.json({
      ok: true,
      message: `Webhook set to ${webhookUrl}`,
    });
  } catch (error) {
    console.error("[Set Webhook] Error:", error);
    res.status(500).json({ ok: false, error: "Failed to set webhook" });
  }
});

/**
 * Get webhook info
 * GET /api/webhooks/telegram/webhook-info
 */
router.get("/telegram/webhook-info", async (req: Request, res: Response) => {
  try {
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not initialized" });
    }

    const bot = telegramBot.getBot();
    const webhookInfo = await bot.telegram.getWebhookInfo();

    res.json(webhookInfo);
  } catch (error) {
    console.error("[Get Webhook Info] Error:", error);
    res.status(500).json({ ok: false, error: "Failed to get webhook info" });
  }
});

export default router;
