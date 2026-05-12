import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { exchangeConnector, type SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { gateioConnector } from "../exchanges/gateioConnector.ts"; // MODIFIED: add Gate.io connector.
import { kiwoomConnector } from "../exchanges/kiwoomConnector.ts"; // MODIFIED: add Kiwoom connector.
import { taEngine } from "../trading/technicalAnalysis.ts";
import { calculateFuturesRisk, calculateRisk, formatRiskReport, formatRiskReportFromResult, type RiskInput } from "../trading/riskCalculator.ts";
import { TradeJournal } from "../trading/tradeJournal.ts";
import { addAlert, getAlerts, removeAlert, startAlertScheduler } from "../alerts/alertEngine.ts";
import { googleAuthManager } from "./google-workspace.ts";
import { redis } from "../_core/redis.ts"; // MODIFIED: reuse cached Upbit prices for kimchi premium query endpoint.

const exchangeSchema = z.enum(["binance", "upbit", "bybit"]);
const KIMCHI_FX_RATE = 1380; // MODIFIED: baseline KRW/USD conversion for premium estimation.

function spreadsheetIdFromEnv(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID is missing");
  }
  return spreadsheetId;
}

async function createTradeJournal(userId: string): Promise<TradeJournal> {
  const auth = await googleAuthManager.getAuthenticatedClient(userId);
  return new TradeJournal(auth, spreadsheetIdFromEnv());
}

export const tradingRouter = router({
  getBalance: protectedProcedure
    .input(z.object({ exchange: exchangeSchema }))
    .query(async ({ input }) => {
      return exchangeConnector.getBalance(input.exchange);
    }),

  getPositions: protectedProcedure
    .input(z.object({ exchange: exchangeSchema }))
    .query(async ({ input }) => {
      return exchangeConnector.getPositions(input.exchange);
    }),

  getTechnicalAnalysis: protectedProcedure
    .input(z.object({
      exchange: exchangeSchema,
      symbol: z.string().min(1),
      timeframe: z.string().default("1h"),
      limit: z.number().int().min(30).max(500).default(200),
    }))
    .query(async ({ input }) => {
      const candles = await exchangeConnector.getCandles(input.exchange, input.symbol, input.timeframe, input.limit);
      const normalizedCandles = candles
        .filter((candle): candle is [number, number, number, number, number, number] => (
          Array.isArray(candle)
          && candle.length >= 6
          && candle.slice(0, 6).every((value) => typeof value === "number")
        ))
        .map((candle) => candle.slice(0, 6) as [number, number, number, number, number, number]);
      const analysis = taEngine.analyzeSymbol(normalizedCandles);
      const briefing = taEngine.generateBriefing(input.symbol, analysis);
      return { analysis, briefing };
    }),

  getKimchiPremium: protectedProcedure // MODIFIED: expose kimchi premium snapshot for dashboard card without relying on static UI data.
    .input(z.object({ symbol: z.string().min(1).default("BTC") }))
    .query(async ({ input }) => {
      const baseAsset = input.symbol.toUpperCase().replace("KRW-", "").replace("/USDT", "");
      const upbitSymbol = `KRW-${baseAsset}`;
      const binanceSymbol = `${baseAsset}/USDT`;
      const cached = await redis.hget("upbit:prices", upbitSymbol);
      if (!cached) {
        throw new Error(`Upbit cached price missing for ${upbitSymbol}`);
      }

      const parsed = JSON.parse(cached) as { price?: number };
      const upbitPrice = Number(parsed.price ?? 0);
      if (!Number.isFinite(upbitPrice) || upbitPrice <= 0) {
        throw new Error(`Invalid cached Upbit price for ${upbitSymbol}`);
      }

      const ticker = await exchangeConnector.getExchange("binance").fetchTicker(binanceSymbol);
      const binanceUsdt = Number(ticker.last ?? ticker.close ?? 0);
      if (!Number.isFinite(binanceUsdt) || binanceUsdt <= 0) {
        throw new Error(`Invalid Binance ticker price for ${binanceSymbol}`);
      }

      const binanceKrw = binanceUsdt * KIMCHI_FX_RATE;
      const premiumPercent = ((upbitPrice - binanceKrw) / binanceKrw) * 100;

      return {
        symbol: baseAsset,
        upbitPrice,
        binanceUsdt,
        fxRate: KIMCHI_FX_RATE,
        premiumPercent,
      };
    }),

  calculateRisk: protectedProcedure
    .input(z.object({
      entryPrice: z.number().positive(),
      leverage: z.number().positive(),
      side: z.enum(["long", "short"]),
      marginBalance: z.number().positive(),
      riskPercent: z.number().positive().max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = calculateFuturesRisk(input);
      return { result };
    }),

  syncTradeJournal: protectedProcedure
    .input(z.object({
      exchange: exchangeSchema,
      symbols: z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const journal = await createTradeJournal(userId);
      return journal.syncTrades(input.exchange as SupportedExchangeId, input.symbols);
    }),

  getTradeStats: protectedProcedure
    .input(z.object({ period: z.enum(["week", "month"]).default("week") }))
    .query(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const journal = await createTradeJournal(userId);
      return journal.getTradeStats(input.period);
    }),

  listAlerts: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    return getAlerts(userId);
  }),

  addAlert: protectedProcedure
    .input(z.object({
      telegramChatId: z.union([z.string().min(1), z.number()]),
      type: z.enum(["price", "rsi", "funding", "kimchi_premium"]),
      exchange: exchangeSchema,
      symbol: z.string().min(1),
      operator: z.enum(["above", "below"]),
      value: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await startAlertScheduler();
      const userId = String(ctx.user.id);
      const alert = await addAlert({
        id: crypto.randomUUID(),
        userId,
        telegramChatId: input.telegramChatId,
        type: input.type,
        exchange: input.exchange,
        symbol: input.symbol,
        operator: input.operator,
        value: input.value,
        active: true,
      });
      return alert;
    }),

  removeAlert: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await removeAlert(input.id);
      return { success: true };
    }),

  // MODIFIED: Gate.io connector namespace added.
  gateio: router({
    spotBalance: protectedProcedure.query(async () => {
      return gateioConnector.getSpotBalance();
    }),
    futuresBalance: protectedProcedure.query(async () => {
      return gateioConnector.getFuturesBalance();
    }),
    positions: protectedProcedure.query(async () => {
      return gateioConnector.getPositions();
    }),
    ticker: protectedProcedure
      .input(z.object({ symbol: z.string().min(1) }))
      .query(async ({ input }) => {
        return gateioConnector.getTicker(input.symbol);
      }),
    myTrades: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        since: z.number().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return gateioConnector.getMyTrades(input.symbol, input.since, input.limit);
      }),
    order: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        type: z.enum(["market", "limit"]),
        side: z.enum(["buy", "sell"]),
        amount: z.number().positive(),
        price: z.number().positive().optional(),
      }))
      .mutation(async ({ input }) => {
        return gateioConnector.placeOrder(input.symbol, input.type, input.side, input.amount, input.price);
      }),
  }),

  // MODIFIED: Kiwoom connector namespace added.
  kiwoom: router({
    balance: protectedProcedure.query(async () => {
      return kiwoomConnector.getBalance();
    }),
    quote: protectedProcedure
      .input(z.object({ stockCode: z.string().min(1) }))
      .query(async ({ input }) => {
        return kiwoomConnector.getQuote(input.stockCode);
      }),
    orderbook: protectedProcedure
      .input(z.object({ stockCode: z.string().min(1) }))
      .query(async ({ input }) => {
        return kiwoomConnector.getOrderbook(input.stockCode);
      }),
    order: protectedProcedure
      .input(z.object({
        stockCode: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        qty: z.number().positive(),
        price: z.number().positive(),
        orderType: z.enum(["limit", "market"]),
      }))
      .mutation(async ({ input }) => {
        return kiwoomConnector.placeOrder(input);
      }),
    executions: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return kiwoomConnector.getExecutions(input.startDate, input.endDate);
      }),
  }),

  // MODIFIED: Risk calculator namespace added.
  risk: router({
    calculate: protectedProcedure
      .input(z.object({
        entryPrice: z.number().positive(),
        accountBalance: z.number().positive(),
        riskPercent: z.number().positive().max(100),
        leverage: z.number().positive(),
        stopLossPrice: z.number().positive(),
        side: z.enum(["long", "short"]),
      }))
      .query(async ({ input }) => {
        return calculateRisk(input as RiskInput);
      }),

    report: protectedProcedure
      .input(z.object({
        entryPrice: z.number().positive(),
        accountBalance: z.number().positive(),
        riskPercent: z.number().positive().max(100),
        leverage: z.number().positive(),
        stopLossPrice: z.number().positive(),
        side: z.enum(["long", "short"]),
      }))
      .query(async ({ input }) => {
        const result = calculateRisk(input as RiskInput);
        const report = formatRiskReportFromResult(result, input as RiskInput);
        return report;
      }),
  }),
});
