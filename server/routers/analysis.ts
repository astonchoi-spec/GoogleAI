import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { gateioConnector } from "../exchanges/gateioConnector.ts";
import { kiwoomConnector } from "../exchanges/kiwoomConnector.ts";
import {
  type OhlcvData,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcEMA,
  calcATR,
  getFullAnalysis,
} from "../trading/technicalAnalysis.ts";

const exchangeSchema = z.enum(["gateio", "kiwoom"]);

async function fetchOHLCVData(
  exchange: "gateio" | "kiwoom",
  symbol: string,
  timeframe: string = "1h"
): Promise<OhlcvData> {
  if (exchange === "gateio") {
    // Gate.io: use CCXT fetchOHLCV
    const ohlcv = await gateioConnector.fetchOHLCV(symbol, timeframe);
    return ohlcv.map((candle) => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
    }));
  } else if (exchange === "kiwoom") {
    // TODO: Implement Kiwoom chart API
    // For now, return sample data
    console.warn(`Kiwoom chart data not yet implemented for ${symbol}`);
    const now = Date.now();
    return Array.from({ length: 100 }, (_, i) => ({
      timestamp: now - (100 - i) * 60 * 60 * 1000,
      open: 50000 + Math.random() * 1000,
      high: 51000 + Math.random() * 1000,
      low: 49000 + Math.random() * 1000,
      close: 50500 + Math.random() * 1000,
      volume: 1000000 + Math.random() * 100000,
    }));
  }
  throw new Error(`Unsupported exchange: ${exchange}`);
}

export const analysisRouter = router({
  indicators: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      const analysis = getFullAnalysis(data);
      return analysis;
    }),

  rsi: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
        period: z.number().int().positive().default(14),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      return calcRSI(data, input.period);
    }),

  macd: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      return calcMACD(data);
    }),

  bollingerBands: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
        period: z.number().int().positive().default(20),
        stdDev: z.number().positive().default(2),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      return calcBollingerBands(data, input.period, input.stdDev);
    }),

  ema: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
        period: z.number().int().positive().default(50),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      return calcEMA(data, input.period);
    }),

  atr: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1),
        exchange: exchangeSchema,
        timeframe: z.string().default("1h"),
        period: z.number().int().positive().default(14),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchOHLCVData(input.exchange, input.symbol, input.timeframe);
      return calcATR(data, input.period);
    }),
});
