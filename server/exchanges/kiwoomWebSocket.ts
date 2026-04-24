import WebSocket from "ws";
import axios, { AxiosError } from "axios";
import { redis } from "../_core/redis.ts";
import type { KiwoomMarket } from "./kiwoomRest.ts";

const RECONNECT_DELAY_MS = 3_000;
const MARKET_SUFFIX: Record<KiwoomMarket, string> = {
  "kr-stock": "kr-stock",
  "kr-futures": "kr-futures",
  "us-futures": "us-futures",
};

type FeedState = {
  socket: WebSocket | null;
  symbols: string[];
  reconnectTimer: NodeJS.Timeout | null;
  manualDisconnect: boolean;
  approvalKey: string | null;
};

export type KiwoomRealtimePrice = {
  market: KiwoomMarket;
  symbol: string;
  price: number | null;
  change: number | null;
  changeRate: number | null;
  volume: number | null;
  timestamp: number;
  raw: string;
};

type JsonMessage = Record<string, unknown>;

export class KiwoomRealtimeFeed {
  private readonly states: Record<KiwoomMarket, FeedState> = {
    "kr-stock": { socket: null, symbols: [], reconnectTimer: null, manualDisconnect: false, approvalKey: null },
    "kr-futures": { socket: null, symbols: [], reconnectTimer: null, manualDisconnect: false, approvalKey: null },
    "us-futures": { socket: null, symbols: [], reconnectTimer: null, manualDisconnect: false, approvalKey: null },
  };

  isConfigured(): boolean {
    return Boolean(this.wsUrl() && this.baseUrl() && this.appKey() && this.appSecret());
  }

  async connect(market: KiwoomMarket, symbols: string[]): Promise<void> {
    const normalizedSymbols = symbols.map((symbol) => symbol.trim()).filter(Boolean);
    if (normalizedSymbols.length === 0) {
      throw new Error("Kiwoom WebSocket requires at least one symbol");
    }

    this.requireConfigured();
    const state = this.states[market];
    state.symbols = normalizedSymbols;
    state.manualDisconnect = false;
    this.clearReconnectTimer(market);

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      await this.subscribe(market, normalizedSymbols);
      return;
    }

    state.socket?.removeAllListeners();
    state.socket?.close();
    state.socket = new WebSocket(this.wsUrl());

    await new Promise<void>((resolve, reject) => {
      const socket = state.socket;
      if (!socket) {
        reject(new Error("Failed to initialize Kiwoom WebSocket"));
        return;
      }

      const onOpen = () => {
        void this.subscribe(market, normalizedSymbols)
          .then(resolve)
          .catch(reject);
      };

      const onInitialError = (error: Error) => {
        reject(new Error(`Kiwoom WebSocket connection failed (${market}): ${error.message}`));
      };

      socket.once("open", onOpen);
      socket.once("error", onInitialError);

      socket.on("message", (message) => {
        void this.handleMessage(market, message);
      });

      socket.on("error", (error) => {
        console.warn(`[KiwoomWebSocket] ${market} error:`, error.message);
      });

      socket.on("close", () => {
        if (!state.manualDisconnect) {
          this.scheduleReconnect(market);
        }
      });
    });
  }

  disconnect(market: KiwoomMarket): void {
    const state = this.states[market];
    state.manualDisconnect = true;
    this.clearReconnectTimer(market);
    state.socket?.removeAllListeners();
    state.socket?.close();
    state.socket = null;
  }

  disconnectAll(): void {
    (Object.keys(this.states) as KiwoomMarket[]).forEach((market) => this.disconnect(market));
  }

  getStatus(): Array<{ market: KiwoomMarket; connected: boolean; symbols: string[] }> {
    return (Object.keys(this.states) as KiwoomMarket[]).map((market) => {
      const state = this.states[market];
      return {
        market,
        connected: state.socket?.readyState === WebSocket.OPEN,
        symbols: [...state.symbols],
      };
    });
  }

  async getCachedPrice(market: KiwoomMarket, symbol: string): Promise<KiwoomRealtimePrice | null> {
    const payload = await redis.hget(this.marketRedisKey(market), symbol);
    if (!payload) return null;
    try {
      return JSON.parse(payload) as KiwoomRealtimePrice;
    } catch {
      return null;
    }
  }

  async connectFromEnv(): Promise<void> {
    const marketSymbols: Record<KiwoomMarket, string[]> = {
      "kr-stock": splitSymbols(process.env.KIWOOM_WS_SYMBOLS_KR_STOCK),
      "kr-futures": splitSymbols(process.env.KIWOOM_WS_SYMBOLS_KR_FUTURES),
      "us-futures": splitSymbols(process.env.KIWOOM_WS_SYMBOLS_US_FUTURES),
    };

    const entries = Object.entries(marketSymbols) as Array<[KiwoomMarket, string[]]>;
    for (const [market, symbols] of entries) {
      if (symbols.length === 0) continue;
      await this.connect(market, symbols);
      console.log(`[KiwoomWebSocket] ${market} connected: ${symbols.join(", ")}`);
    }
  }

  private async subscribe(market: KiwoomMarket, symbols: string[]): Promise<void> {
    const state = this.states[market];
    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Kiwoom WebSocket is not connected (${market})`);
    }

    if (!state.approvalKey) {
      state.approvalKey = await this.fetchApprovalKey();
    }

    const trId = this.subscriptionTrId(market);
    for (const symbol of symbols) {
      const payload = {
        header: {
          approval_key: state.approvalKey,
          custtype: "P",
          tr_type: "1",
          "content-type": "utf-8",
        },
        body: {
          input: {
            tr_id: trId,
            tr_key: symbol,
          },
        },
      };
      socket.send(JSON.stringify(payload));
    }
  }

  private async handleMessage(market: KiwoomMarket, message: WebSocket.RawData): Promise<void> {
    try {
      const raw = Buffer.isBuffer(message) ? message.toString("utf8") : message.toString();
      const parsed = this.tryParseJson(raw);
      const symbol = this.extractSymbol(parsed, raw);
      if (!symbol) return;

      const update: KiwoomRealtimePrice = {
        market,
        symbol,
        price: this.extractNumber(parsed, raw, ["price", "last", "stck_prpr", "futs_prpr"]),
        change: this.extractNumber(parsed, raw, ["change", "prdy_vrss", "futs_prdy_vrss"]),
        changeRate: this.extractNumber(parsed, raw, ["changeRate", "prdy_ctrt", "futs_prdy_ctrt"]),
        volume: this.extractNumber(parsed, raw, ["volume", "acml_vol", "tot_ccld_qty"]),
        timestamp: Date.now(),
        raw,
      };

      const serialized = JSON.stringify(update);
      await redis.hset(this.marketRedisKey(market), symbol, serialized);
      await redis.publish("kiwoom:price:update", serialized);
    } catch (error) {
      console.warn(
        `[KiwoomWebSocket] Failed to process ${market} message:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private scheduleReconnect(market: KiwoomMarket): void {
    const state = this.states[market];
    this.clearReconnectTimer(market);
    state.reconnectTimer = setTimeout(() => {
      if (state.manualDisconnect || state.symbols.length === 0) return;
      this.connect(market, state.symbols).catch((error) => {
        console.warn(
          `[KiwoomWebSocket] ${market} reconnect failed:`,
          error instanceof Error ? error.message : String(error)
        );
        this.scheduleReconnect(market);
      });
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(market: KiwoomMarket): void {
    const timer = this.states[market].reconnectTimer;
    if (!timer) return;
    clearTimeout(timer);
    this.states[market].reconnectTimer = null;
  }

  private async fetchApprovalKey(): Promise<string> {
    try {
      const response = await axios.post<Record<string, unknown>>(
        `${this.baseUrl()}${this.approvalPath()}`,
        {
          grant_type: "client_credentials",
          appkey: this.appKey(),
          secretkey: this.appSecret(),
        },
        {
          timeout: 10_000,
        }
      );
      const data = response.data ?? {};
      const approvalKey = pickString(data, ["approval_key", "approvalKey", "key"]);
      if (!approvalKey) {
        throw new Error("approval_key is missing in response");
      }
      return approvalKey;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        throw new Error(`Kiwoom approval key request failed${status ? ` [HTTP ${status}]` : ""}: ${error.message}`);
      }
      throw error;
    }
  }

  private marketRedisKey(market: KiwoomMarket): string {
    return `kiwoom:prices:${MARKET_SUFFIX[market]}`;
  }

  private extractSymbol(parsed: JsonMessage | null, raw: string): string | null {
    if (parsed) {
      const root = parsed;
      const body = asRecord(root.body);
      const output = asRecord(root.output);
      const input = asRecord(body.input);
      const keys = [
        root.symbol,
        root.tr_key,
        root.shcode,
        root.code,
        body.symbol,
        body.tr_key,
        output.symbol,
        output.code,
        input.tr_key,
      ];
      for (const key of keys) {
        if (typeof key === "string" && key.trim()) return key.trim();
      }
    }

    const match = raw.match(/([A-Z0-9]{4,20})/);
    return match?.[1] ?? null;
  }

  private extractNumber(parsed: JsonMessage | null, raw: string, keys: string[]): number | null {
    if (parsed) {
      const containers = [parsed, asRecord(parsed.body), asRecord(parsed.output), asRecord(asRecord(parsed.body).output)];
      for (const container of containers) {
        const value = pickNumber(container, keys);
        if (value !== null) return value;
      }
    }

    const tokens = raw.split(/[|,^,]/).map((token) => token.trim()).filter(Boolean);
    for (const token of tokens) {
      const numeric = Number(token.replaceAll(",", ""));
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  }

  private tryParseJson(raw: string): JsonMessage | null {
    try {
      const data = JSON.parse(raw);
      return data && typeof data === "object" && !Array.isArray(data) ? (data as JsonMessage) : null;
    } catch {
      return null;
    }
  }

  private subscriptionTrId(market: KiwoomMarket): string {
    if (market === "kr-stock") return process.env.KIWOOM_WS_TR_ID_KR_STOCK ?? "H0STCNT0";
    if (market === "kr-futures") return process.env.KIWOOM_WS_TR_ID_KR_FUTURES ?? "H0IFASP0";
    return process.env.KIWOOM_WS_TR_ID_US_FUTURES ?? "HDFFF020";
  }

  private wsUrl(): string {
    return process.env.KIWOOM_WS_URL?.trim() ?? "";
  }

  private baseUrl(): string {
    return process.env.KIWOOM_BASE_URL?.trim() ?? "";
  }

  private approvalPath(): string {
    return process.env.KIWOOM_WS_APPROVAL_PATH?.trim() || "/oauth2/Approval";
  }

  private appKey(): string {
    return process.env.KIWOOM_APP_KEY?.trim() ?? "";
  }

  private appSecret(): string {
    return process.env.KIWOOM_APP_SECRET?.trim() ?? "";
  }

  private requireConfigured(): void {
    if (this.isConfigured()) return;
    throw new Error(
      "Kiwoom WebSocket is not configured. Set KIWOOM_WS_URL, KIWOOM_BASE_URL, KIWOOM_APP_KEY, KIWOOM_APP_SECRET."
    );
  }
}

export const kiwoomRealtimeFeed = new KiwoomRealtimeFeed();

function splitSymbols(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}
