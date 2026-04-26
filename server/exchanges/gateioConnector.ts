import ccxt from "ccxt";

export interface GateBalance {
  total: Record<string, number>;
  free: Record<string, number>;
  used: Record<string, number>;
}

export interface GatePosition {
  symbol: string;
  side: string;
  contracts: number;
  contractSize: number;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  percentage: number | null;
  leverage: number | null;
}

export interface GateTrade {
  id: string;
  timestamp: number;
  symbol: string;
  side: string;
  price: number;
  amount: number;
  cost: number;
  fee: { currency: string; cost: number } | null;
}

export interface GateTicker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

export class GateioConnector {
  private exchange: any = null;

  constructor() {
    this.initializeExchange();
  }

  private initializeExchange(): void {
    try {
      const config: Record<string, unknown> = {
        enableRateLimit: true,
      };

      const apiKey = process.env.GATEIO_API_KEY;
      const apiSecret = process.env.GATEIO_API_SECRET;

      if (apiKey && apiSecret) {
        config.apiKey = apiKey;
        config.secret = apiSecret;
      }

      this.exchange = new ccxt.gate(config);
    } catch (error) {
      console.error("Failed to initialize Gate.io exchange:", error);
      this.exchange = null;
    }
  }

  private getExchange(): any {
    if (!this.exchange) {
      throw new Error("Gate.io exchange not initialized. Check GATEIO_API_KEY and GATEIO_API_SECRET.");
    }
    return this.exchange;
  }

  private handleError(context: string, error: unknown): Error {
    if (error instanceof ccxt.AuthenticationError) {
      return new Error(`Gate.io 인증 실패 (${context}): API 키를 확인하세요.`);
    }
    if (error instanceof ccxt.NetworkError) {
      return new Error(`Gate.io 네트워크 오류 (${context}): 잠시 후 다시 시도하세요.`);
    }
    if (error instanceof Error) {
      return new Error(`Gate.io ${context}: ${error.message}`);
    }
    return new Error(`Gate.io ${context}: 알 수 없는 오류`);
  }

  async getSpotBalance(): Promise<GateBalance> {
    try {
      const exchange = this.getExchange();
      const balance = await exchange.fetchBalance({ type: "spot" });
      return {
        total: this.normalizeBalanceMap(balance.total),
        free: this.normalizeBalanceMap(balance.free),
        used: this.normalizeBalanceMap(balance.used),
      };
    } catch (error) {
      throw this.handleError("현물 잔고 조회", error);
    }
  }

  async getFuturesBalance(): Promise<GateBalance> {
    try {
      const exchange = this.getExchange();
      const balance = await exchange.fetchBalance({ type: "swap", settle: "usdt" });
      return {
        total: this.normalizeBalanceMap(balance.total),
        free: this.normalizeBalanceMap(balance.free),
        used: this.normalizeBalanceMap(balance.used),
      };
    } catch (error) {
      throw this.handleError("선물 잔고 조회", error);
    }
  }

  async getPositions(): Promise<GatePosition[]> {
    try {
      const exchange = this.getExchange();
      if (!exchange.has.fetchPositions) {
        return [];
      }
      const positions = await exchange.fetchPositions();
      return positions
        .filter((p: any) => (p.contracts ?? 0) > 0)
        .map((p: any) => ({
          symbol: p.symbol ?? "",
          side: p.side ?? "",
          contracts: Number(p.contracts ?? 0),
          contractSize: Number(p.contractSize ?? 0),
          entryPrice: this.nullableNumber(p.entryPrice),
          markPrice: this.nullableNumber(p.markPrice),
          unrealizedPnl: this.nullableNumber(p.unrealizedPnl),
          percentage: this.nullableNumber(p.percentage),
          leverage: this.nullableNumber(p.leverage),
        }));
    } catch (error) {
      throw this.handleError("포지션 조회", error);
    }
  }

  async getTicker(symbol: string): Promise<GateTicker> {
    try {
      const exchange = this.getExchange();
      const ticker = await exchange.fetchTicker(symbol);
      return {
        symbol: ticker.symbol ?? symbol,
        last: Number(ticker.last ?? 0),
        bid: Number(ticker.bid ?? 0),
        ask: Number(ticker.ask ?? 0),
        high: Number(ticker.high ?? 0),
        low: Number(ticker.low ?? 0),
        volume: Number(ticker.volume ?? 0),
        quoteVolume: Number(ticker.quoteVolume ?? 0),
      };
    } catch (error) {
      throw this.handleError(`${symbol} 가격 조회`, error);
    }
  }

  async getMyTrades(symbol: string, since?: number, limit?: number): Promise<GateTrade[]> {
    try {
      const exchange = this.getExchange();
      const trades = await exchange.fetchMyTrades(symbol, since, limit);
      return trades.map((t: any) => ({
        id: t.id ?? "",
        timestamp: t.timestamp ?? 0,
        symbol: t.symbol ?? symbol,
        side: t.side ?? "",
        price: Number(t.price ?? 0),
        amount: Number(t.amount ?? 0),
        cost: Number(t.cost ?? 0),
        fee: t.fee
          ? { currency: t.fee.currency ?? "USDT", cost: Number(t.fee.cost ?? 0) }
          : null,
      }));
    } catch (error) {
      throw this.handleError(`${symbol} 거래 내역 조회`, error);
    }
  }

  async placeOrder(
    symbol: string,
    type: "market" | "limit",
    side: "buy" | "sell",
    amount: number,
    price?: number
  ): Promise<any> {
    try {
      const exchange = this.getExchange();
      return await exchange.createOrder(symbol, type, side, amount, price);
    } catch (error) {
      throw this.handleError(`${symbol} ${side} 주문 (${type})`, error);
    }
  }

  private normalizeBalanceMap(balanceMap: Record<string, any>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(balanceMap)) {
      if (typeof value === "number") {
        result[key] = value;
      } else if (value && typeof value === "object" && "total" in value) {
        result[key] = Number(value.total ?? 0);
      } else {
        result[key] = Number(value ?? 0);
      }
    }
    return result;
  }

  private nullableNumber(value: any): number | null {
    const num = Number(value ?? null);
    return isFinite(num) ? num : null;
  }
}

export const gateioConnector = new GateioConnector();
