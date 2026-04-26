import express from "express";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";

import { redis } from "../_core/redis.ts";
import { forwardToTelegram } from "../telegram-service.ts";

const router = express.Router();

const tradingViewWebhookSchema = z
  .object({
    secret: z.string().optional(),
    exchange: z.string().optional(),
    symbol: z.string().optional(),
    action: z.string().optional(),
    side: z.string().optional(),
    orderType: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    timeframe: z.string().optional(),
    strategy: z.string().optional(),
    message: z.string().optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
    chatId: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

type TradingViewWebhookPayload = z.infer<typeof tradingViewWebhookSchema>;

type TradingViewWebhookEvent = {
  id: string;
  receivedAt: string;
  payload: TradingViewWebhookPayload;
};

const EVENT_HASH_KEY = "tradingview:webhook:events";
const LAST_EVENT_KEY = "tradingview:webhook:last";

router.post("/tradingview", async (req: Request, res: Response) => {
  try {
    const parsed = tradingViewWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Invalid webhook payload",
        details: parsed.error.flatten(),
      });
    }

    const configuredSecret = process.env.TV_WEBHOOK_SECRET?.trim();
    const providedSecret = extractSecret(req, parsed.data);
    if (configuredSecret && providedSecret !== configuredSecret) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized webhook secret",
      });
    }

    const event: TradingViewWebhookEvent = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      payload: parsed.data,
    };

    const serialized = JSON.stringify(event);
    await redis.hset(EVENT_HASH_KEY, event.id, serialized);
    await redis.set(LAST_EVENT_KEY, serialized);
    await redis.publish("tradingview:webhook", serialized);

    const telegramResult = await tryForwardToTelegram(event.payload);

    return res.json({
      ok: true,
      eventId: event.id,
      telegramForwarded: telegramResult.forwarded,
      telegramReason: telegramResult.reason,
    });
  } catch (error) {
    console.error("[TradingView Webhook] Error:", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.get("/tradingview/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    hasSecret: Boolean(process.env.TV_WEBHOOK_SECRET),
    hasTelegramChatId: Boolean(process.env.TV_WEBHOOK_TELEGRAM_CHAT_ID),
  });
});

router.get("/tradingview/recent", async (req: Request, res: Response) => {
  const limitRaw = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

  try {
    const records = await redis.hgetall(EVENT_HASH_KEY);
    const events = Object.values(records)
      .map((value) => safeParseEvent(value))
      .filter((value): value is TradingViewWebhookEvent => value !== null)
      .sort((a, b) => Number(new Date(b.receivedAt)) - Number(new Date(a.receivedAt)))
      .slice(0, limit);

    return res.json({
      ok: true,
      count: events.length,
      events,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;

function extractSecret(req: Request, payload: TradingViewWebhookPayload): string | undefined {
  const headerSecret = req.header("x-tv-secret") ?? req.header("x-tradingview-secret");
  return headerSecret?.trim() || payload.secret?.trim();
}

async function tryForwardToTelegram(payload: TradingViewWebhookPayload): Promise<{ forwarded: boolean; reason: string }> {
  const chatId = resolveChatId(payload.chatId);
  if (!chatId) {
    return { forwarded: false, reason: "No chat ID configured" };
  }

  const message = formatTelegramMessage(payload);
  const forwarded = await forwardToTelegram(chatId, message);
  return {
    forwarded,
    reason: forwarded ? "ok" : "Telegram bot unavailable or send failed",
  };
}

function resolveChatId(raw: unknown): number | null {
  const candidate =
    raw ??
    process.env.TV_WEBHOOK_TELEGRAM_CHAT_ID ??
    process.env.OWNER_TELEGRAM_CHAT_ID ??
    null;
  const numeric = Number(candidate);
  return Number.isFinite(numeric) && numeric !== 0 ? numeric : null;
}

function formatTelegramMessage(payload: TradingViewWebhookPayload): string {
  const symbol = payload.symbol ?? "unknown";
  const exchange = payload.exchange ?? "unknown";
  const action = payload.action ?? payload.side ?? "signal";
  const timeframe = payload.timeframe ?? "-";
  const strategy = payload.strategy ?? "-";
  const price = toNumber(payload.price);
  const quantity = toNumber(payload.quantity);

  const lines = [
    "[TradingView Webhook]",
    `Symbol: ${symbol}`,
    `Exchange: ${exchange}`,
    `Action: ${action}`,
    `Timeframe: ${timeframe}`,
    `Strategy: ${strategy}`,
  ];

  if (price !== null) lines.push(`Price: ${price}`);
  if (quantity !== null) lines.push(`Quantity: ${quantity}`);
  if (payload.message) lines.push(`Message: ${payload.message}`);

  return lines.join("\n");
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeParseEvent(value: string): TradingViewWebhookEvent | null {
  try {
    const parsed = JSON.parse(value) as TradingViewWebhookEvent;
    if (!parsed?.id || !parsed?.receivedAt || !parsed?.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}
