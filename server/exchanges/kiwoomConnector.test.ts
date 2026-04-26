import { describe, it, expect, beforeEach, vi } from "vitest";
import { KiwoomConnector } from "./kiwoomConnector";

// Mock axios
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(async (url: string, data: Record<string, unknown>) => {
        if (url === "oauth2/tokenP") {
          return {
            data: {
              access_token: "mock_token_12345",
              token_type: "Bearer",
              expires_in: 3600,
            },
          };
        }
        throw new Error("Unexpected request");
      }),
      request: vi.fn(async (config: any) => {
        const trId = config.headers?.["tr-id"];

        if (trId === "CTRP6414R") {
          return {
            data: {
              output1: {
                dnca_tot_amt: 100000,
                tot_asst_amt: 500000,
              },
              output2: [
                {
                  pdno: "005930",
                  prdt_name: "삼성전자",
                  hldg_qty: 10,
                  pchs_avg_pric: 70000,
                  prpr: 75000,
                  evlu_pfls_amt: 50000,
                  evlu_pfls_rt: 7.14,
                },
              ],
            },
          };
        }

        if (trId === "FHKST01010100") {
          return {
            data: {
              output: {
                hts_kor_isnm: "삼성전자",
                stck_prpr: 75000,
                cntg_vrts: 1000,
                prdy_ctrt: 1.33,
                acml_vol: 100000,
                stck_hgpr: 76000,
                stck_lwpr: 74000,
                stck_oprc: 74500,
              },
            },
          };
        }

        return { data: {} };
      }),
      isAxiosError: (error: any) => error?.response !== undefined,
    })),
  },
  AxiosError: class AxiosError extends Error {},
}));

describe("KiwoomConnector", () => {
  let connector: KiwoomConnector;

  beforeEach(() => {
    connector = new KiwoomConnector();
  });

  it("getAccessToken() should return valid token object", async () => {
    const token = await connector["getAccessToken"]();

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(token).toBe("mock_token_12345");
  });

  it("token should auto-refresh when expired", async () => {
    const token1 = await connector["getAccessToken"]();
    expect(token1).toBe("mock_token_12345");

    // Simulate token expiration
    connector["tokenExpiresAt"] = Date.now() - 1000;

    const token2 = await connector["getAccessToken"]();
    expect(token2).toBe("mock_token_12345");
  });

  it("getQuote() should return quote data with correct structure", async () => {
    const quote = await connector.getQuote("005930");

    expect(quote).toHaveProperty("stockCode");
    expect(quote).toHaveProperty("stockName");
    expect(quote).toHaveProperty("price");
    expect(quote).toHaveProperty("change");
    expect(quote).toHaveProperty("changePercent");
    expect(quote).toHaveProperty("volume");

    expect(quote.stockCode).toBe("005930");
    expect(quote.price).toBe(75000);
    expect(typeof quote.volume).toBe("number");
  });

  it("getBalance() should return balance with holdings array", async () => {
    const balance = await connector.getBalance();

    expect(balance).toHaveProperty("totalAsset");
    expect(balance).toHaveProperty("cashBalance");
    expect(balance).toHaveProperty("holdings");

    expect(typeof balance.totalAsset).toBe("number");
    expect(Array.isArray(balance.holdings)).toBe(true);

    if (balance.holdings.length > 0) {
      const holding = balance.holdings[0];
      expect(holding).toHaveProperty("stockCode");
      expect(holding).toHaveProperty("quantity");
      expect(holding).toHaveProperty("currentPrice");
    }
  });

  // Integration tests with real API are skipped by default
  describe.skip("Real API integration tests", () => {
    it("should fetch real balance from Kiwoom", async () => {
      const balance = await connector.getBalance();
      expect(balance).toHaveProperty("totalAsset");
    });

    it("should fetch real quote data from Kiwoom", async () => {
      const quote = await connector.getQuote("005930");
      expect(quote.stockCode).toBe("005930");
    });

    it("should fetch real orderbook from Kiwoom", async () => {
      const orderbook = await connector.getOrderbook("005930");
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);
    });

    it("should place real order on Kiwoom", async () => {
      const order = await connector.placeOrder({
        stockCode: "005930",
        side: "buy",
        qty: 1,
        price: 70000,
        orderType: "limit",
      });
      expect(order).toHaveProperty("orderId");
    });
  });
});
