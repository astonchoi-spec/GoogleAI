import { z } from "zod";
import { randomUUID } from "crypto";

import { protectedProcedure, router } from "../../_core/trpc.ts";
import { addAlert, getAlerts, removeAlert } from "../../alerts/alertEngine.ts";
import { exchangeConnector, type SupportedExchangeId } from "../../exchanges/exchangeConnector.ts";
import { kiwoomRestConnector } from "../../exchanges/kiwoomRest.ts";
import { kiwoomRealtimeFeed } from "../../exchanges/kiwoomWebSocket.ts";
import { upbitFeed } from "../../exchanges/upbitWebSocket.ts";
import { redis } from "../../_core/redis.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import { getOrCreateConversation } from "../../db-chat.ts";
import { calculateFuturesRisk, formatRiskReport } from "../../trading/riskCalculator.ts";
import { taEngine, type OhlcvArray } from "../../trading/technicalAnalysis.ts";
import { TradeJournal } from "../../trading/tradeJournal.ts";

const exchangeSchema = z.enum(["gate", "binance", "upbit", "bybit"]);
const kiwoomMarketSchema = z.enum(["kr-stock", "kr-futures", "us-futures"]);
const upbitSymbolSchema = z.string().regex(/^KRW-[A-Z0-9]+$/, "UPBIT symbol must be like KRW-BTC");
const manualTradeSchema = z.object({
  date: z.string().min(1),
  market: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  entryPrice: z.number().nonnegative(),
  exitPrice: z.number().nonnegative(),
  fee: z.number().nonnegative().optional(),
  note: z.string().optional(),
});
const alertTypeSchema = z.enum(["price", "rsi", "funding", "kimchi_premium"]);
const alertOperatorSchema = z.enum(["above", "below"]);

function getWorkspaceSpreadsheetId(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID is required");
  }
  return spreadsheetId;
}

async function createTradeJournal(userId: number): Promise<TradeJournal> {
  const auth = await googleAuthManager.getAuthenticatedClient(String(userId));
  return new TradeJournal(auth, getWorkspaceSpreadsheetId());
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

  analyze: protectedProcedure
    .input(
      z.object({
        exchange: exchangeSchema,
        symbol: z.string().min(1),
        timeframe: z.string().min(1).default("1m"),
      })
    )
    .query(async ({ input }) => {
      const candles = await exchangeConnector.getCandles(input.exchange, input.symbol, input.timeframe, 250);
      const normalizedCandles = candles
        .filter((candle) => candle.every((value) => typeof value === "number"))
        .map((candle) => candle as OhlcvArray);
      const analysis = taEngine.analyzeSymbol(normalizedCandles);
      const briefing = taEngine.generateBriefing(input.symbol, analysis);

      return {
        symbol: input.symbol,
        exchange: input.exchange,
        timeframe: input.timeframe,
        candles: normalizedCandles.map((candle) => ({
          time: Math.floor(candle[0] / 1000),
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5],
        })),
        analysis,
        briefing,
      };
    }),

  getKimchiPremium: protectedProcedure
    .input(z.object({ symbols: z.array(z.string().min(1)).default(["BTC", "ETH"]) }))
    .query(async ({ input }) => {
      const fxRate = Number(process.env.KIMCHI_FX_RATE || 1380);
      const results = await Promise.all(
        input.symbols.map(async (symbol) => {
          const base = symbol.replace("KRW-", "").replace("/USDT", "").toUpperCase();
          const upbitSymbol = `KRW-${base}`;
          const binanceSymbol = `${base}/USDT`;
          const cached = await redis.hget("upbit:prices", upbitSymbol);
          const upbitPrice = parseCachedPrice(cached);
          const ticker = await exchangeConnector.getExchange("binance").fetchTicker(binanceSymbol);
          const binancePrice = Number(ticker.last ?? ticker.close ?? ticker.bid ?? ticker.ask);
          const binanceKrwPrice = binancePrice * fxRate;
          const premium =
            Number.isFinite(upbitPrice) && Number.isFinite(binanceKrwPrice) && binanceKrwPrice > 0
              ? ((Number(upbitPrice) - binanceKrwPrice) / binanceKrwPrice) * 100
              : null;

          return {
            symbol: base,
            upbitPrice,
            binancePrice,
            fxRate,
            premium,
          };
        })
      );

      return results;
    }),

  calculateRisk: protectedProcedure
    .input(
      z.object({
        entryPrice: z.number().positive(),
        leverage: z.number().positive(),
        side: z.enum(["long", "short"]),
        marginBalance: z.number().positive(),
        riskPercent: z.number().positive().max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      const result = calculateFuturesRisk(input);
      return {
        result,
        report: formatRiskReport(input, result),
      };
    }),

  setAlert: protectedProcedure
    .input(
      z.object({
        type: alertTypeSchema,
        exchange: exchangeSchema,
        symbol: z.string().min(1),
        operator: alertOperatorSchema,
        value: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await getOrCreateConversation(ctx.user.id);
      const alert = await addAlert({
        id: randomUUID(),
        userId: String(ctx.user.id),
        telegramChatId: conversation.telegramChatId ?? "",
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
    .input(z.object({ alertId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await removeAlert(input.alertId);
      return { success: true };
    }),

  getAlerts: protectedProcedure.query(async ({ ctx }) => {
    return getAlerts(String(ctx.user.id));
  }),

  syncJournal: protectedProcedure
    .input(
      z.object({
        exchange: exchangeSchema,
        symbols: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const journal = await createTradeJournal(ctx.user.id);
      return journal.syncTrades(input.exchange, input.symbols);
    }),

  getTradeStats: protectedProcedure
    .input(z.object({ period: z.enum(["week", "month"]) }))
    .query(async ({ ctx, input }) => {
      const journal = await createTradeJournal(ctx.user.id);
      return journal.getTradeStats(input.period);
    }),

  addManualTrades: protectedProcedure
    .input(
      z.object({
        trades: z.array(manualTradeSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const journal = await createTradeJournal(ctx.user.id);
      return journal.addManualTrades(input.trades);
    }),

  getManualTrades: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(async ({ ctx, input }) => {
      const journal = await createTradeJournal(ctx.user.id);
      return journal.getManualTrades(input?.limit ?? 200);
    }),

  importManualCsv: protectedProcedure
    .input(
      z.object({
        csvText: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trades = parseManualCsv(input.csvText);
      if (trades.length === 0) {
        return { saved: 0 };
      }
      const journal = await createTradeJournal(ctx.user.id);
      return journal.addManualTrades(trades);
    }),

  getKiwoomBalance: protectedProcedure
    .input(z.object({ market: kiwoomMarketSchema }))
    .query(async ({ input }) => {
      return kiwoomRestConnector.getBalance(input.market);
    }),

  getKiwoomPositions: protectedProcedure
    .input(z.object({ market: kiwoomMarketSchema }))
    .query(async ({ input }) => {
      return kiwoomRestConnector.getPositions(input.market);
    }),

  getKiwoomQuote: protectedProcedure
    .input(
      z.object({
        market: kiwoomMarketSchema,
        symbol: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return kiwoomRestConnector.getQuote(input.market, input.symbol);
    }),

  startKiwoomRealtime: protectedProcedure
    .input(
      z.object({
        market: kiwoomMarketSchema,
        symbols: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ input }) => {
      await kiwoomRealtimeFeed.connect(input.market, input.symbols);
      return {
        success: true as const,
        market: input.market,
        symbols: input.symbols,
      };
    }),

  stopKiwoomRealtime: protectedProcedure
    .input(z.object({ market: kiwoomMarketSchema }))
    .mutation(async ({ input }) => {
      kiwoomRealtimeFeed.disconnect(input.market);
      return {
        success: true as const,
        market: input.market,
      };
    }),

  getKiwoomRealtimeStatus: protectedProcedure.query(async () => {
    return kiwoomRealtimeFeed.getStatus();
  }),

  getKiwoomRealtimePrice: protectedProcedure
    .input(
      z.object({
        market: kiwoomMarketSchema,
        symbol: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return kiwoomRealtimeFeed.getCachedPrice(input.market, input.symbol);
    }),

  startUpbitRealtime: protectedProcedure
    .input(
      z.object({
        symbols: z.array(upbitSymbolSchema).min(1),
      })
    )
    .mutation(async ({ input }) => {
      await upbitFeed.connect(input.symbols);
      return {
        success: true as const,
        symbols: input.symbols,
      };
    }),

  stopUpbitRealtime: protectedProcedure.mutation(async () => {
    upbitFeed.disconnect();
    return {
      success: true as const,
    };
  }),

  getUpbitRealtimeStatus: protectedProcedure.query(async () => {
    return upbitFeed.getStatus();
  }),

  getUpbitRealtimePrice: protectedProcedure
    .input(
      z.object({
        symbol: upbitSymbolSchema,
      })
    )
    .query(async ({ input }) => {
      return upbitFeed.getCachedPrice(input.symbol);
    }),
});

export default tradingRouter;

function parseCachedPrice(cached: string | null): number | null {
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as { price?: unknown };
    const price = Number(parsed.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

function parseManualCsv(csvText: string): Array<z.infer<typeof manualTradeSchema>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());
  const rows = lines.slice(1);
  const trades: Array<z.infer<typeof manualTradeSchema>> = [];

  for (const row of rows) {
    const columns = row.split(",").map((column) => column.trim());
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = columns[index] ?? "";
    });

    const parsed = manualTradeSchema.safeParse({
      date: record.date,
      market: record.market,
      symbol: record.symbol,
      side: record.side?.toLowerCase(),
      quantity: Number(record.quantity ?? 0),
      entryPrice: Number(record.entryPrice ?? 0),
      exitPrice: Number(record.exitPrice ?? 0),
      fee: Number(record.fee ?? 0),
      note: record.note,
    });

    if (parsed.success) {
      trades.push(parsed.data);
    }
  }

  return trades;
}
