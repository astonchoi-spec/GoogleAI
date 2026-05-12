import { Queue, Worker, type Job } from "bullmq";

import { redis } from "../_core/redis.ts";
import { exchangeConnector, type SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { forwardToTelegram } from "../telegram-service.ts";
import { taEngine, type OhlcvArray } from "../trading/technicalAnalysis.ts";

export type AlertType = "price" | "rsi" | "funding" | "kimchi_premium";
export type AlertOperator = "above" | "below";

export type AlertCondition = {
  id: string;
  userId: string;
  telegramChatId: number | string;
  type: AlertType;
  exchange: SupportedExchangeId;
  symbol: string;
  operator: AlertOperator;
  value: number;
  active: boolean;
};

type AlertCheckResult = {
  checked: number;
  triggered: number;
};

type UpbitCachedPrice = {
  price: number;
  changeRate?: number;
  volume24h?: number;
  timestamp?: number;
};

const ALERT_HASH_KEY = "active:alerts";
const ALERT_QUEUE_NAME = "alerts";
const ALERT_REPEAT_JOB_NAME = "check-alerts";
const ALERT_REPEAT_JOB_ID = "alert-checker-10s";
const KIMCHI_FX_RATE = 1380;

let alertQueue: Queue | null = null; // MODIFIED: lazily create BullMQ queue to avoid Redis connection during app bootstrap.
let alertWorker: Worker | null = null;

export class AlertEngine {
  async addAlert(alert: AlertCondition): Promise<AlertCondition> {
    const normalized = { ...alert, active: alert.active ?? true };
    await redis.hset(ALERT_HASH_KEY, normalized.id, JSON.stringify(normalized));
    return normalized;
  }

  async removeAlert(alertId: string): Promise<void> {
    await redis.hdel(ALERT_HASH_KEY, alertId);
  }

  async getAlerts(userId: string): Promise<AlertCondition[]> {
    const alerts = await this.getAllAlerts();
    return alerts.filter((alert) => alert.userId === userId);
  }

  async checkAlerts(): Promise<AlertCheckResult> {
    const alerts = (await this.getAllAlerts()).filter((alert) => alert.active);
    let triggered = 0;

    for (const alert of alerts) {
      try {
        const currentValue = await this.resolveCurrentValue(alert);
        if (currentValue === null || !this.isTriggered(alert, currentValue)) {
          continue;
        }

        await this.sendTelegramAlert(alert, currentValue);
        await redis.hset(ALERT_HASH_KEY, alert.id, JSON.stringify({ ...alert, active: false }));
        triggered += 1;
      } catch (error) {
        console.warn(`[AlertEngine] Failed to check alert ${alert.id}:`, this.errorMessage(error));
      }
    }

    return { checked: alerts.length, triggered };
  }

  private async getAllAlerts(): Promise<AlertCondition[]> {
    const stored = await redis.hgetall(ALERT_HASH_KEY);
    return Object.values(stored)
      .map((value) => this.parseAlert(value))
      .filter((alert): alert is AlertCondition => alert !== null);
  }

  private parseAlert(value: string): AlertCondition | null {
    try {
      const parsed = JSON.parse(value) as AlertCondition;
      if (!parsed.id || !parsed.userId || !parsed.symbol || !parsed.type) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async resolveCurrentValue(alert: AlertCondition): Promise<number | null> {
    switch (alert.type) {
      case "price":
        return this.getTickerPrice(alert.exchange, alert.symbol);
      case "rsi":
        return this.getRsiValue(alert.exchange, alert.symbol);
      case "funding":
        return this.getFundingValue(alert.exchange, alert.symbol);
      case "kimchi_premium":
        return this.getKimchiPremium(alert.symbol);
      default:
        return null;
    }
  }

  private async getTickerPrice(exchangeId: SupportedExchangeId, symbol: string): Promise<number | null> {
    const ticker = await exchangeConnector.getExchange(exchangeId).fetchTicker(symbol);
    return this.toFiniteNumber(ticker.last ?? ticker.close ?? ticker.bid ?? ticker.ask);
  }

  private async getRsiValue(exchangeId: SupportedExchangeId, symbol: string): Promise<number | null> {
    const candles = await exchangeConnector.getCandles(exchangeId, symbol, "1m", 100);
    const normalizedCandles = candles
      .filter((candle) => candle.every((value) => typeof value === "number"))
      .map((candle) => candle as OhlcvArray);
    const analysis = taEngine.analyzeSymbol(normalizedCandles);
    return analysis.rsi.value;
  }

  private async getFundingValue(exchangeId: SupportedExchangeId, symbol: string): Promise<number | null> {
    const funding = await exchangeConnector.getFundingRate(exchangeId, symbol);
    return this.toFiniteNumber(funding.fundingRate ?? funding.info?.fundingRate ?? funding.info?.funding_rate);
  }

  private async getKimchiPremium(symbol: string): Promise<number | null> {
    const baseSymbol = this.baseAsset(symbol);
    const upbitSymbol = `KRW-${baseSymbol}`;
    const binanceSymbol = `${baseSymbol}/USDT`;
    const cached = await redis.hget("upbit:prices", upbitSymbol);

    if (!cached) {
      throw new Error(`Upbit cached price is missing for ${upbitSymbol}. Start upbitFeed first.`);
    }

    const upbitPrice = this.parseUpbitPrice(cached);
    const binancePrice = await this.getTickerPrice("binance", binanceSymbol);
    if (upbitPrice === null || binancePrice === null) return null;

    const binanceKrwPrice = binancePrice * KIMCHI_FX_RATE;
    return ((upbitPrice - binanceKrwPrice) / binanceKrwPrice) * 100;
  }

  private parseUpbitPrice(cached: string): number | null {
    try {
      const parsed = JSON.parse(cached) as UpbitCachedPrice;
      return this.toFiniteNumber(parsed.price);
    } catch {
      return null;
    }
  }

  private baseAsset(symbol: string): string {
    if (symbol.startsWith("KRW-")) return symbol.replace("KRW-", "").toUpperCase();
    if (symbol.includes("/")) return symbol.split("/")[0].toUpperCase();
    if (symbol.includes("-")) return symbol.split("-").at(-1)?.toUpperCase() ?? symbol.toUpperCase();
    return symbol.toUpperCase();
  }

  private isTriggered(alert: AlertCondition, currentValue: number): boolean {
    return alert.operator === "above" ? currentValue >= alert.value : currentValue <= alert.value;
  }

  private async sendTelegramAlert(alert: AlertCondition, currentValue: number): Promise<void> {
    const message = this.formatAlertMessage(alert, currentValue);
    const chatId = Number(alert.telegramChatId);
    const forwarded = await forwardToTelegram(chatId, message);
    if (forwarded) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is missing and no Telegram bot instance is registered.");
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: alert.telegramChatId,
        text: message,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
    }
  }

  private formatAlertMessage(alert: AlertCondition, currentValue: number): string {
    const operatorText = alert.operator === "above" ? "이상" : "이하";
    return [
      "[알림 발동]",
      `${alert.symbol} ${this.typeLabel(alert.type)} 조건이 충족됐습니다.`,
      `조건: ${alert.value} ${operatorText}`,
      `현재값: ${this.formatNumber(currentValue)}`,
      `거래소: ${alert.exchange}`,
    ].join("\n");
  }

  private typeLabel(type: AlertType): string {
    const labels: Record<AlertType, string> = {
      price: "가격",
      rsi: "RSI",
      funding: "펀딩비",
      kimchi_premium: "김프",
    };
    return labels[type];
  }

  private toFiniteNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private formatNumber(value: number): string {
    if (Math.abs(value) >= 1000) return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    if (Math.abs(value) >= 1) return value.toFixed(4);
    return value.toFixed(8);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const alertEngine = new AlertEngine();

function createBullConnection() {
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.replace("/", "") || 0),
  };
}

export async function startAlertScheduler(): Promise<void> {
  const bullConnection = createBullConnection(); // MODIFIED: create Redis connection config only when scheduler is explicitly requested.
  if (!alertQueue) { // MODIFIED: defer queue creation until first alert registration.
    alertQueue = new Queue(ALERT_QUEUE_NAME, {
      connection: bullConnection,
    });
  }

  if (!alertWorker) {
    alertWorker = new Worker(
      ALERT_QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== ALERT_REPEAT_JOB_NAME) return;
        await alertEngine.checkAlerts();
      },
      { connection: bullConnection }
    );

    alertWorker.on("failed", (job, error) => {
      console.warn(`[AlertEngine] Worker job failed: ${job?.id ?? "unknown"}`, error.message);
    });
  }

  await alertQueue.add(
    ALERT_REPEAT_JOB_NAME,
    {},
    {
      jobId: ALERT_REPEAT_JOB_ID,
      repeat: { every: 10_000 },
      removeOnComplete: true,
      removeOnFail: 20,
    }
  );
}

export async function addAlert(alert: AlertCondition): Promise<AlertCondition> {
  return alertEngine.addAlert(alert);
}

export async function removeAlert(alertId: string): Promise<void> {
  return alertEngine.removeAlert(alertId);
}

export async function getAlerts(userId: string): Promise<AlertCondition[]> {
  return alertEngine.getAlerts(userId);
}
