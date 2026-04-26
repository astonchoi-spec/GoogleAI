import express, { type Express } from "express";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock Redis before importing the module under test ---
vi.mock("../_core/redis.ts", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
  },
}));

// --- Mock Telegram service ---
const forwardToTelegramMock = vi.fn(async (_chatId: number, _text: string): Promise<boolean> => true);
vi.mock("../telegram-service.ts", () => ({
  forwardToTelegram: (...args: [number, string]) => forwardToTelegramMock(...args),
  getTelegramBot: vi.fn(() => null),
  registerTelegramBot: vi.fn(),
}));

// Import AFTER mocks are registered
import { registerTvWebhookRoutes } from "../alerts/tvWebhookServer.ts";

// ── helpers ────────────────────────────────────────────────────────────────────

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerTvWebhookRoutes(app);
  return app;
}

async function post(
  app: Express,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const req = Object.assign(
      {},
      {
        method: "POST",
        url: "/api/tv-webhook",
        headers: { "content-type": "application/json" },
        body,
      }
    );

    // Use supertest-style direct invocation via http module
    const { createServer } = require("http") as typeof import("http");
    const server = createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const rawBody = JSON.stringify(body);

      const http = require("http") as typeof import("http");
      const options = {
        hostname: "127.0.0.1",
        port,
        path: "/api/tv-webhook",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
        },
      };

      const httpReq = http.request(options, (res) => {
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          server.close();
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
            });
          } catch (e) {
            reject(e);
          }
        });
      });
      httpReq.on("error", reject);
      httpReq.write(rawBody);
      httpReq.end();
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/tv-webhook", () => {
  const VALID_SECRET = "test-secret-123";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TV_WEBHOOK_SECRET = VALID_SECRET;
    // Make sure there is a chat ID so the Telegram path is exercised.
    process.env.TV_WEBHOOK_TELEGRAM_CHAT_ID = "999888777";
  });

  afterEach(() => {
    delete process.env.TV_WEBHOOK_SECRET;
    delete process.env.TV_WEBHOOK_TELEGRAM_CHAT_ID;
  });

  // ── test a: correct secret → 200 + Telegram called ──────────────────────────
  it("a) 올바른 secret → 200 반환 및 Telegram 발송 호출", async () => {
    const app = buildApp();
    const result = await post(app, {
      secret: VALID_SECRET,
      ticker: "BTC/USDT",
      exchange: "Binance",
      side: "buy",
      price: 65000,
      timeframe: "1h",
      strategy: "EMA Cross",
      message: "Golden cross detected",
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(typeof result.body.alertId).toBe("string");

    // forwardToTelegram must have been called once with a non-empty message
    expect(forwardToTelegramMock).toHaveBeenCalledOnce();
    const [chatId, text] = forwardToTelegramMock.mock.calls[0] as [number, string];
    expect(chatId).toBe(999888777);
    expect(text).toContain("TradingView Alert");
    expect(text).toContain("BTC/USDT");
    expect(text).toContain("LONG");
  });

  // ── test b: wrong secret → 401 ───────────────────────────────────────────────
  it("b) 잘못된 secret → 401 반환", async () => {
    const app = buildApp();
    const result = await post(app, {
      secret: "wrong-secret",
      ticker: "ETH/USDT",
      exchange: "Binance",
      side: "sell",
      price: 3000,
      timeframe: "15m",
      message: "Signal fired",
    });

    expect(result.status).toBe(401);
    expect(result.body.ok).toBe(false);
    expect(forwardToTelegramMock).not.toHaveBeenCalled();
  });

  // ── test c: missing secret field → 401 ──────────────────────────────────────
  it("c) secret 필드 누락 → 401 반환", async () => {
    const app = buildApp();
    const result = await post(app, {
      ticker: "SOL/USDT",
      exchange: "Binance",
      side: "buy",
      price: 150,
      timeframe: "4h",
      message: "No secret here",
    });

    expect(result.status).toBe(401);
    expect(result.body.ok).toBe(false);
    expect(forwardToTelegramMock).not.toHaveBeenCalled();
  });
});
