import axios, { AxiosError, type AxiosInstance } from "axios";

export type KiwoomMarket = "kr-stock" | "kr-futures" | "us-futures";

export type KiwoomQuote = {
  market: KiwoomMarket;
  symbol: string;
  price: number | null;
  change: number | null;
  changeRate: number | null;
  volume: number | null;
  timestamp: string | null;
  raw: Record<string, unknown>;
};

export type KiwoomBalance = {
  market: KiwoomMarket;
  accountNo: string;
  cash: number | null;
  available: number | null;
  evaluationAmount: number | null;
  raw: Record<string, unknown>;
};

export type KiwoomPosition = {
  market: KiwoomMarket;
  symbol: string;
  name: string | null;
  side: "long" | "short" | null;
  quantity: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  raw: Record<string, unknown>;
};

export type KiwoomTrade = {
  market: KiwoomMarket;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  cost: number;
  fee: number;
  timestamp: number;
  raw: Record<string, unknown>;
};

type MarketApiConfig = {
  balancePath: string;
  balanceTrId: string;
  positionsPath: string;
  positionsTrId: string;
  quotePath: string;
  quoteTrId: string;
  tradesPath: string;
  tradesTrId: string;
};

type KiwoomCredentials = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  accountNo: string;
  htsId: string;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

const DEFAULT_MARKET_CONFIG: Record<KiwoomMarket, MarketApiConfig> = {
  "kr-stock": {
    balancePath: process.env.KIWOOM_KR_STOCK_BALANCE_PATH ?? "/api/dostk/acnt",
    balanceTrId: process.env.KIWOOM_KR_STOCK_BALANCE_TR_ID ?? "KTTC8434R",
    positionsPath: process.env.KIWOOM_KR_STOCK_POSITIONS_PATH ?? "/api/dostk/inquire-balance",
    positionsTrId: process.env.KIWOOM_KR_STOCK_POSITIONS_TR_ID ?? "TTTC8434R",
    quotePath: process.env.KIWOOM_KR_STOCK_QUOTE_PATH ?? "/api/dostk/quote",
    quoteTrId: process.env.KIWOOM_KR_STOCK_QUOTE_TR_ID ?? "FHKST01010100",
    tradesPath: process.env.KIWOOM_KR_STOCK_TRADES_PATH ?? "/api/dostk/inquire-daily-ccld",
    tradesTrId: process.env.KIWOOM_KR_STOCK_TRADES_TR_ID ?? "TTTC8001R",
  },
  "kr-futures": {
    balancePath: process.env.KIWOOM_KR_FUTURES_BALANCE_PATH ?? "/api/domestic-futureoption/inquire-deposit",
    balanceTrId: process.env.KIWOOM_KR_FUTURES_BALANCE_TR_ID ?? "FOCCQ10800",
    positionsPath: process.env.KIWOOM_KR_FUTURES_POSITIONS_PATH ?? "/api/domestic-futureoption/inquire-balance",
    positionsTrId: process.env.KIWOOM_KR_FUTURES_POSITIONS_TR_ID ?? "FOCCQ33600",
    quotePath: process.env.KIWOOM_KR_FUTURES_QUOTE_PATH ?? "/api/domestic-futureoption/quote",
    quoteTrId: process.env.KIWOOM_KR_FUTURES_QUOTE_TR_ID ?? "FHKIF01010100",
    tradesPath: process.env.KIWOOM_KR_FUTURES_TRADES_PATH ?? "/api/domestic-futureoption/inquire-ccld",
    tradesTrId: process.env.KIWOOM_KR_FUTURES_TRADES_TR_ID ?? "FOCCQ33601",
  },
  "us-futures": {
    balancePath: process.env.KIWOOM_US_FUTURES_BALANCE_PATH ?? "/api/overseas-futureoption/inquire-deposit",
    balanceTrId: process.env.KIWOOM_US_FUTURES_BALANCE_TR_ID ?? "OTFM3004R",
    positionsPath: process.env.KIWOOM_US_FUTURES_POSITIONS_PATH ?? "/api/overseas-futureoption/inquire-balance",
    positionsTrId: process.env.KIWOOM_US_FUTURES_POSITIONS_TR_ID ?? "OTFM1412R",
    quotePath: process.env.KIWOOM_US_FUTURES_QUOTE_PATH ?? "/api/overseas-futureoption/quote",
    quoteTrId: process.env.KIWOOM_US_FUTURES_QUOTE_TR_ID ?? "HHDFC55030000",
    tradesPath: process.env.KIWOOM_US_FUTURES_TRADES_PATH ?? "/api/overseas-futureoption/inquire-ccld",
    tradesTrId: process.env.KIWOOM_US_FUTURES_TRADES_TR_ID ?? "OTFM1413R",
  },
};

export class KiwoomRestConnector {
  private readonly creds: KiwoomCredentials | null;
  private readonly http: AxiosInstance | null;
  private tokenCache: TokenCache | null = null;

  constructor() {
    this.creds = readCredentials();
    this.http = this.creds
      ? axios.create({
          baseURL: this.creds.baseUrl,
          timeout: 15_000,
        })
      : null;
  }

  isConfigured(): boolean {
    return Boolean(this.creds && this.http);
  }

  async getBalance(market: KiwoomMarket): Promise<KiwoomBalance> {
    const data = await this.marketRequest(market, "balance");
    const payload = firstRecord(data, ["output1", "output2", "balance", "data"]);

    return {
      market,
      accountNo: this.requiredCreds().accountNo,
      cash: pickNumber(payload, ["cash", "dnca_tot_amt", "ord_psbl_cash", "deposit"]),
      available: pickNumber(payload, ["available", "ord_psbl_cash", "prvs_rcdl_excc_amt", "withdrawable"]),
      evaluationAmount: pickNumber(payload, ["evaluationAmount", "tot_evlu_amt", "tot_asst_amt", "equity"]),
      raw: payload,
    };
  }

  async getPositions(market: KiwoomMarket): Promise<KiwoomPosition[]> {
    const data = await this.marketRequest(market, "positions");
    const rows = records(data, ["output1", "output2", "positions", "data"]);

    return rows.map((row) => ({
      market,
      symbol: pickString(row, ["symbol", "pdno", "iscd", "futs_shrn_iscd", "ovrs_pdno"]) ?? "",
      name: pickString(row, ["name", "prdt_name", "prdt_abrv_name", "hts_kor_isnm"]),
      side: normalizePositionSide(pickString(row, ["side", "trad_dvsn_name", "sll_buy_dvsn_cd"])),
      quantity: pickNumber(row, ["quantity", "hldg_qty", "cblc_qty", "ovrs_cblc_qty"]),
      entryPrice: pickNumber(row, ["entryPrice", "pchs_avg_pric", "avg_prvs", "ccld_avg_unpr3"]),
      currentPrice: pickNumber(row, ["currentPrice", "prpr", "last", "ovrs_now_pric"]),
      unrealizedPnl: pickNumber(row, ["unrealizedPnl", "evlu_pfls_amt", "evlu_pfls_smtl_amt", "tot_evlu_pfls_amt"]),
      raw: row,
    }));
  }

  async getQuote(market: KiwoomMarket, symbol: string): Promise<KiwoomQuote> {
    if (!symbol.trim()) {
      throw new Error("symbol is required");
    }

    const data = await this.marketRequest(market, "quote", { symbol });
    const payload = firstRecord(data, ["output1", "output", "quote", "data"]);

    return {
      market,
      symbol,
      price: pickNumber(payload, ["price", "stck_prpr", "futs_prpr", "ovrs_nmix_prpr"]),
      change: pickNumber(payload, ["change", "prdy_vrss", "futs_prdy_vrss"]),
      changeRate: pickNumber(payload, ["changeRate", "prdy_ctrt", "futs_prdy_ctrt"]),
      volume: pickNumber(payload, ["volume", "acml_vol", "tot_ccld_qty"]),
      timestamp: pickString(payload, ["timestamp", "stck_cntg_hour", "bsop_date", "trd_tm"]),
      raw: payload,
    };
  }

  async getMyTrades(
    market: KiwoomMarket,
    symbol?: string,
    since?: number,
    limit: number = 100
  ): Promise<KiwoomTrade[]> {
    const data = await this.marketRequest(market, "trades", {
      ...(symbol ? { symbol } : {}),
    });
    const rows = records(data, ["output1", "output2", "trades", "data"]);

    return rows
      .map((row) => this.normalizeTrade(market, row))
      .filter((row): row is KiwoomTrade => row !== null)
      .filter((row) => (symbol ? row.symbol.toUpperCase() === symbol.toUpperCase() : true))
      .filter((row) => (since ? row.timestamp >= since : true))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(500, limit)));
  }

  private async marketRequest(
    market: KiwoomMarket,
    method: "balance" | "positions" | "quote" | "trades",
    extraParams: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const creds = this.requiredCreds();
    const http = this.requiredHttp();
    const token = await this.getAccessToken();
    const config = DEFAULT_MARKET_CONFIG[market];

    const requestInfo =
      method === "balance"
        ? { path: config.balancePath, trId: config.balanceTrId }
        : method === "positions"
          ? { path: config.positionsPath, trId: config.positionsTrId }
          : method === "quote"
            ? { path: config.quotePath, trId: config.quoteTrId }
            : { path: config.tradesPath, trId: config.tradesTrId };

    try {
      const response = await http.get<Record<string, unknown>>(requestInfo.path, {
        params: {
          accountNo: creds.accountNo,
          htsId: creds.htsId,
          ...extraParams,
        },
        headers: {
          authorization: `Bearer ${token}`,
          appkey: creds.appKey,
          appsecret: creds.appSecret,
          tr_id: requestInfo.trId,
          custtype: "P",
        },
      });

      const data = asRecord(response.data);
      assertApiSuccess(data);
      return data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        throw new Error(
          `Kiwoom ${method} request failed (${market})${status ? ` [HTTP ${status}]` : ""}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    const creds = this.requiredCreds();
    const http = this.requiredHttp();

    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }

    try {
      const response = await http.post<Record<string, unknown>>("/oauth2/token", {
        grant_type: "client_credentials",
        appkey: creds.appKey,
        appsecret: creds.appSecret,
      });
      const data = asRecord(response.data);
      const token = pickString(data, ["access_token", "token"]) ?? "";
      const expiresIn = pickNumber(data, ["expires_in", "access_token_token_expired"]) ?? 3600;

      if (!token) {
        throw new Error("Kiwoom token response did not contain access_token");
      }

      this.tokenCache = {
        token,
        expiresAt: Date.now() + Math.max(300, Number(expiresIn)) * 1000,
      };

      return token;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        throw new Error(`Kiwoom OAuth token request failed${status ? ` [HTTP ${status}]` : ""}: ${error.message}`);
      }
      throw error;
    }
  }

  private normalizeTrade(market: KiwoomMarket, row: Record<string, unknown>): KiwoomTrade | null {
    const symbol = pickString(row, ["symbol", "pdno", "iscd", "futs_shrn_iscd", "ovrs_pdno"]);
    const sideRaw = pickString(row, ["side", "trad_dvsn_name", "sll_buy_dvsn_cd", "bnst_tp_code"]);
    const side = sideRaw && ["sell", "short", "1", "매도"].includes(sideRaw.toLowerCase()) ? "sell" : "buy";
    const price = pickNumber(row, ["price", "ord_unpr", "ccld_unpr", "avg_prvs"]);
    const amount = pickNumber(row, ["amount", "ccld_qty", "ord_qty", "tot_ccld_qty"]);
    const fee = pickNumber(row, ["fee", "fee_amt", "trad_fee", "commission"]) ?? 0;
    const timestamp = this.parseTradeTimestamp(row);

    if (!symbol || price === null || amount === null || timestamp === null) {
      return null;
    }

    return {
      market,
      symbol,
      side,
      price,
      amount,
      cost: price * amount,
      fee,
      timestamp,
      raw: row,
    };
  }

  private parseTradeTimestamp(row: Record<string, unknown>): number | null {
    const date = pickString(row, ["date", "ord_dt", "trad_dt", "ccld_dt", "ord_date"]);
    const time = pickString(row, ["time", "ord_tmd", "trad_tm", "ccld_tm", "ord_time"]);
    if (date) {
      const normalizedDate = date.replaceAll("-", "").replaceAll("/", "");
      const normalizedTime = (time ?? "000000").replaceAll(":", "");
      if (/^\d{8}$/.test(normalizedDate) && /^\d{6}$/.test(normalizedTime)) {
        const iso = `${normalizedDate.slice(0, 4)}-${normalizedDate.slice(4, 6)}-${normalizedDate.slice(6, 8)}T${normalizedTime.slice(0, 2)}:${normalizedTime.slice(2, 4)}:${normalizedTime.slice(4, 6)}+09:00`;
        const timestamp = new Date(iso).getTime();
        if (Number.isFinite(timestamp)) return timestamp;
      }
    }

    const timestamp = pickNumber(row, ["timestamp", "ord_tmd", "ccld_tmd", "trad_timestamp"]);
    if (timestamp === null) return null;
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  }

  private requiredCreds(): KiwoomCredentials {
    if (!this.creds) {
      throw new Error(
        "Kiwoom connector is not configured. Set KIWOOM_BASE_URL, KIWOOM_APP_KEY, KIWOOM_APP_SECRET, KIWOOM_ACCOUNT_NO, KIWOOM_HTS_ID."
      );
    }
    return this.creds;
  }

  private requiredHttp(): AxiosInstance {
    if (!this.http) {
      throw new Error("Kiwoom HTTP client is not initialized");
    }
    return this.http;
  }
}

export const kiwoomRestConnector = new KiwoomRestConnector();

function readCredentials(): KiwoomCredentials | null {
  const baseUrl = process.env.KIWOOM_BASE_URL?.trim();
  const appKey = process.env.KIWOOM_APP_KEY?.trim();
  const appSecret = process.env.KIWOOM_APP_SECRET?.trim();
  const accountNo = process.env.KIWOOM_ACCOUNT_NO?.trim();
  const htsId = process.env.KIWOOM_HTS_ID?.trim();

  if (!baseUrl || !appKey || !appSecret || !accountNo || !htsId) {
    return null;
  }

  return { baseUrl, appKey, appSecret, accountNo, htsId };
}

function assertApiSuccess(data: Record<string, unknown>): void {
  const code = pickString(data, ["return_code", "rt_cd", "resultCode", "code"]);
  const message = pickString(data, ["return_msg", "msg1", "resultMsg", "message"]);
  if (!code) return;
  if (["0", "00", "success", "SUCCESS"].includes(code.toLowerCase())) return;
  throw new Error(`Kiwoom API error ${code}${message ? `: ${message}` : ""}`);
}

function records(data: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
    if (value && typeof value === "object") {
      return [asRecord(value)];
    }
  }
  return [];
}

function firstRecord(data: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) {
      return asRecord(value[0]);
    }
    if (value && typeof value === "object") {
      return asRecord(value);
    }
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const numberValue = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function normalizePositionSide(value: string | null): "long" | "short" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["buy", "long", "2", "매수"].includes(normalized)) return "long";
  if (["sell", "short", "1", "매도"].includes(normalized)) return "short";
  return null;
}
