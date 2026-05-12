import { randomUUID } from "crypto";

import type { Express, Request, Response } from "express";

import { redis } from "../_core/redis.ts";
import { forwardToTelegram } from "../telegram-service.ts";

// TradingView Alert payload interface (spec-defined).
export interface TvAlert {
  secret: string;
  ticker: string;
  exchange: string;
  side: string;
  price: number;
  timeframe: string;
  strategy?: string;
  message: string;
}

export type StoredTvAlert = TvAlert & {
  id: string;
  receivedAt: string;
};

const TV_ALERTS_REDIS_KEY = "tv-alerts";
const TV_ALERTS_MAX = 100;

// ---------- helpers ----------

function formatAlertMessage(alert: TvAlert): string {
  const side = alert.side.toUpperCase();
  const sideLabel =
    side === "BUY" || side === "LONG" ? "LONG"
    : side === "SELL" || side === "SHORT" ? "SHORT"
    : side;

  const priceFormatted = Number(alert.price).toLocaleString("ko-KR");

  const lines = [
    "📊 TradingView Alert",
    `종목: ${alert.ticker} (${alert.exchange})`,
    `방향: ${sideLabel}`,
    `가격: ${priceFormatted}`,
  ];

  if (alert.strategy) {
    lines.push(`전략: ${alert.strategy}`);
  }

  lines.push(`메시지: ${alert.message}`);
  return lines.join("\n");
}

async function persistAlert(storedAlert: StoredTvAlert): Promise<void> {
  const raw = await redis.get(TV_ALERTS_REDIS_KEY);
  let list: StoredTvAlert[] = [];
  if (raw) {
    try {
      list = JSON.parse(raw) as StoredTvAlert[];
    } catch {
      list = [];
    }
  }
  list.unshift(storedAlert);
  if (list.length > TV_ALERTS_MAX) {
    list = list.slice(0, TV_ALERTS_MAX);
  }
  await redis.set(TV_ALERTS_REDIS_KEY, JSON.stringify(list));
}

function resolveChatId(): number | null {
  const candidate =
    process.env.TV_WEBHOOK_TELEGRAM_CHAT_ID ??
    process.env.OWNER_TELEGRAM_CHAT_ID ??
    null;
  const numeric = Number(candidate);
  return Number.isFinite(numeric) && numeric !== 0 ? numeric : null;
}

// ---------- exported helpers ----------

/** Returns the most recent TV webhook alerts from Redis. */
export async function getTvWebhookHistory(limit = 20): Promise<StoredTvAlert[]> {
  const raw = await redis.get(TV_ALERTS_REDIS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as StoredTvAlert[];
    const capped = Math.max(1, Math.min(TV_ALERTS_MAX, limit));
    return list.slice(0, capped);
  } catch {
    return [];
  }
}

// ---------- Express route registration ----------

/**
 * Registers POST /api/tv-webhook on the given Express app.
 * Call this from server/_core/index.ts after the body-parser middleware.
 */
export function registerTvWebhookRoutes(app: Express): void {
  app.post("/api/tv-webhook", async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;

      // --- secret validation ---
      const providedSecret =
        typeof body.secret === "string" ? body.secret.trim() : undefined;

      if (!providedSecret) {
        return res.status(401).json({ ok: false, error: "Missing secret" });
      }

      const configuredSecret = process.env.TV_WEBHOOK_SECRET?.trim();
      if (configuredSecret && providedSecret !== configuredSecret) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // --- parse payload ---
      const alert: TvAlert = {
        secret: providedSecret,
        ticker:
          typeof body.ticker === "string" ? body.ticker : "unknown",
        exchange:
          typeof body.exchange === "string" ? body.exchange : "unknown",
        side:
          typeof body.side === "string" ? body.side : "unknown",
        price:
          typeof body.price === "number"
            ? body.price
            : Number(body.price ?? 0),
        timeframe:
          typeof body.timeframe === "string" ? body.timeframe : "unknown",
        strategy:
          typeof body.strategy === "string" ? body.strategy : undefined,
        message:
          typeof body.message === "string" ? body.message : "",
      };

      const stored: StoredTvAlert = {
        ...alert,
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
      };

      // --- persist to Redis ---
      await persistAlert(stored);

      // --- forward to Telegram ---
      const formatted = formatAlertMessage(alert);
      const chatId = resolveChatId();
      let telegramForwarded = false;

      if (chatId !== null) {
        telegramForwarded = await forwardToTelegram(chatId, formatted);

        // Fallback: raw Telegram Bot API if the Telegraf instance is unavailable.
        if (!telegramForwarded) {
          const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
          if (token) {
            try {
              const apiRes = await fetch(
                `https://api.telegram.org/bot${token}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, text: formatted }),
                }
              );
              telegramForwarded = apiRes.ok;
            } catch {
              // best-effort; failure logged below
            }
          }
        }
      }

      return res.json({ ok: true, alertId: stored.id, telegramForwarded });
    } catch (error) {
      console.error("[TV Webhook] Error:", error);
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });
}
