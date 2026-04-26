import { describe, it, expect, beforeEach, vi } from "vitest";
import { GateioConnector, type GateBalance, type GatePosition, type GateTicker } from "./gateioConnector";

// Mock ccxt.gate
vi.mock("ccxt", () => ({
  gate: vi.fn(function (config?: Record<string, unknown>) {
    return {
      has: { fetchPositions: true },
      fetchBalance: vi.fn(async (opts?: Record<string, unknown>) => {
        if (opts?.type === "spot") {
          return {
            total: { BTC: 1.5, USDT: 10000 },
            free: { BTC: 1.0, USDT: 9000 },
            used: { BTC: 0.5, USDT: 1000 },
          };
        } else if (opts?.type === "swap") {
          return {
            total: { BTC: 0.5, USDT: 5000 },
            free: { BTC: 0.3, USDT: 4000 },
            used: { BTC: 0.2, USDT: 1000 },
          };
        }
        return { total: {}, free: {}, used: {} };
      }),
      fetchPositions: vi.fn(async () => [
        {
          symbol: "BTC/USDT",
          side: "long",
          contracts: 10,
          contractSize: 0.001,
          entryPrice: 45000,
          markPrice: 46000,
          unrealizedPnl: 1000,
          percentage: 0.022,
          leverage: 10,
        },
      ]),
      fetchTicker: vi.fn(async (symbol: string) => ({
        symbol,
        last: 46000,
        bid: 45999,
        ask: 46001,
        high: 47000,
        low: 44000,
        volume: 1000,
        quoteVolume: 46000000,
      })),
      fetchMyTrades: vi.fn(async (symbol: string) => [
        {
          id: "trade1",
          timestamp: Date.now(),
          symbol,
          side: "buy",
          price: 45000,
          amount: 0.5,
          cost: 22500,
          fee: { currency: "USDT", cost: 11.25 },
        },
      ]),
      createOrder: vi.fn(async (symbol: string, type: string, side: string, amount: number, price?: number) => ({
        id: "order1",
        symbol,
        type,
        side,
        amount,
        price,
        status: "closed",
      })),
    };
  }),
  AuthenticationError: class AuthenticationError extends Error {},
  NetworkError: class NetworkError extends Error {},
}));

describe("GateioConnector", () => {
  let connector: GateioConnector;

  beforeEach(() => {
    // Create a fresh instance for each test
    connector = new GateioConnector();
  });

  it("getSpotBalance() should return normalized balance object", async () => {
    const balance = await connector.getSpotBalance();

    expect(balance).toHaveProperty("total");
    expect(balance).toHaveProperty("free");
    expect(balance).toHaveProperty("used");

    expect(balance.total).toEqual({ BTC: 1.5, USDT: 10000 });
    expect(balance.free).toEqual({ BTC: 1.0, USDT: 9000 });
    expect(balance.used).toEqual({ BTC: 0.5, USDT: 1000 });
  });

  it("getPositions() should return array of positions", async () => {
    const positions = await connector.getPositions();

    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBe(1);

    const position = positions[0];
    expect(position).toHaveProperty("symbol");
    expect(position).toHaveProperty("side");
    expect(position).toHaveProperty("contracts");
    expect(position).toHaveProperty("entryPrice");
    expect(position).toHaveProperty("markPrice");
    expect(position).toHaveProperty("leverage");

    expect(position.symbol).toBe("BTC/USDT");
    expect(position.side).toBe("long");
    expect(position.leverage).toBe(10);
  });

  it("getTicker() should return ticker data with correct structure", async () => {
    const ticker = await connector.getTicker("BTC/USDT");

    expect(ticker).toHaveProperty("symbol");
    expect(ticker).toHaveProperty("last");
    expect(ticker).toHaveProperty("bid");
    expect(ticker).toHaveProperty("ask");
    expect(ticker).toHaveProperty("high");
    expect(ticker).toHaveProperty("low");
    expect(ticker).toHaveProperty("volume");
    expect(ticker).toHaveProperty("quoteVolume");

    expect(ticker.symbol).toBe("BTC/USDT");
    expect(ticker.last).toBe(46000);
    expect(typeof ticker.bid).toBe("number");
    expect(typeof ticker.ask).toBe("number");
  });

  // Integration tests with real API are skipped by default
  describe.skip("Real API integration tests", () => {
    it("should fetch real spot balance from Gate.io", async () => {
      const balance = await connector.getSpotBalance();
      expect(balance).toHaveProperty("total");
    });

    it("should fetch real positions from Gate.io", async () => {
      const positions = await connector.getPositions();
      expect(Array.isArray(positions)).toBe(true);
    });

    it("should fetch real ticker data from Gate.io", async () => {
      const ticker = await connector.getTicker("BTC/USDT");
      expect(ticker.symbol).toBe("BTC/USDT");
    });
  });
});
