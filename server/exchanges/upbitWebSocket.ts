import WebSocket from "ws";
import { redis } from "../_core/redis.ts";

export type UpbitTickerPrice = {
  symbol: string;
  price: number;
  changeRate: number;
  volume24h: number;
  timestamp: number;
};

type UpbitTickerMessage = {
  type?: string;
  code?: string;
  trade_price?: number;
  signed_change_rate?: number;
  acc_trade_volume_24h?: number;
  timestamp?: number;
};

const UPBIT_WEBSOCKET_URL = "wss://api.upbit.com/websocket/v1";
const RECONNECT_DELAY_MS = 3000;

export class UpbitRealtimeFeed {
  private socket: WebSocket | null = null;
  private symbols: string[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualDisconnect = false;

  connect(symbols: string[]): Promise<void> {
    if (symbols.length === 0) {
      return Promise.reject(new Error("Upbit WebSocket requires at least one symbol"));
    }

    this.symbols = symbols;
    this.manualDisconnect = false;
    this.clearReconnectTimer();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.subscribe(symbols);
      return Promise.resolve();
    }

    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = new WebSocket(UPBIT_WEBSOCKET_URL);

    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error("Failed to create Upbit WebSocket"));
        return;
      }

      const handleOpen = () => {
        try {
          this.subscribe(symbols);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const handleInitialError = (error: Error) => {
        reject(new Error(`Upbit WebSocket connection failed: ${error.message}`));
      };

      socket.once("open", handleOpen);
      socket.once("error", handleInitialError);

      socket.on("message", (data) => {
        void this.handleMessage(data);
      });

      socket.on("error", (error) => {
        console.warn("[UpbitWebSocket] Error:", error.message);
      });

      socket.on("close", () => {
        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      });
    });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
  }

  private subscribe(symbols: string[]): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Upbit WebSocket is not connected");
    }

    const payload = [
      { ticket: `google-tg-${Date.now()}` },
      {
        type: "ticker",
        codes: symbols,
        isOnlyRealtime: true,
      },
    ];

    this.socket.send(JSON.stringify(payload));
  }

  private async handleMessage(data: WebSocket.RawData): Promise<void> {
    try {
      const raw = Buffer.isBuffer(data) ? data.toString("utf8") : data.toString();
      const message = JSON.parse(raw) as UpbitTickerMessage;
      if (message.type !== "ticker" || !message.code) return;

      const update: UpbitTickerPrice = {
        symbol: message.code,
        price: Number(message.trade_price ?? 0),
        changeRate: Number(message.signed_change_rate ?? 0),
        volume24h: Number(message.acc_trade_volume_24h ?? 0),
        timestamp: Number(message.timestamp ?? Date.now()),
      };
      const serialized = JSON.stringify(update);

      await redis.hset("upbit:prices", update.symbol, serialized);
      await redis.publish("price:update", serialized);
    } catch (error) {
      console.warn("[UpbitWebSocket] Failed to process ticker:", error instanceof Error ? error.message : String(error));
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.symbols.length === 0 || this.manualDisconnect) return;
      this.connect(this.symbols).catch((error) => {
        console.warn("[UpbitWebSocket] Reconnect failed:", error instanceof Error ? error.message : String(error));
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

export const upbitFeed = new UpbitRealtimeFeed();
