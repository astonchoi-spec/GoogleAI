import ccxt from "ccxt";

export type SupportedExchangeId = "gate" | "binance" | "upbit" | "bybit";

export type ExchangeConfig = {
  id: SupportedExchangeId;
  apiKey?: string;
  secret?: string;
  password?: string;
  sandbox?: boolean;
};

export type NormalizedBalance = {
  total: Record<string, number>;
  free: Record<string, number>;
  used: Record<string, number>;
};

export type NormalizedPosition = {
  symbol: string;
  side: string;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  leverage: number | null;
  liquidationPrice: number | null;
};

type ExchangeInstance =
  | InstanceType<typeof ccxt.gate>
  | InstanceType<typeof ccxt.binance>
  | InstanceType<typeof ccxt.upbit>
  | InstanceType<typeof ccxt.bybit>;

const exchangeConstructors = {
  gate: ccxt.gate,
  binance: ccxt.binance,
  upbit: ccxt.upbit,
  bybit: ccxt.bybit,
} satisfies Record<SupportedExchangeId, new (config?: Record<string, unknown>) => ExchangeInstance>;

export class ExchangeConnector {
  private readonly exchanges = new Map<SupportedExchangeId, ExchangeInstance>();

  constructor() {
    this.addExchangeFromEnv("gate", "GATE_API_KEY", "GATE_SECRET");
    this.addExchangeFromEnv("binance", "BINANCE_API_KEY", "BINANCE_SECRET");
    this.addExchangeFromEnv("upbit", "UPBIT_API_KEY", "UPBIT_SECRET");
    this.addExchangeFromEnv("bybit", "BYBIT_API_KEY", "BYBIT_SECRET");
  }

  addExchange(config: ExchangeConfig): ExchangeInstance {
    try {
      const ExchangeClass = exchangeConstructors[config.id];
      if (!ExchangeClass) {
        throw new Error(`Unsupported exchange id: ${config.id}`);
      }

      const exchangeConfig: Record<string, unknown> = {
        apiKey: config.apiKey,
        secret: config.secret,
        password: config.password,
        enableRateLimit: true,
        ...(["binance", "gate"].includes(config.id) ? { options: { defaultType: "future" } } : {}),
      };

      const exchange = new ExchangeClass(exchangeConfig);
      if (config.sandbox && typeof exchange.setSandboxMode === "function") {
        exchange.setSandboxMode(true);
      }

      this.exchanges.set(config.id, exchange);
      console.log(`${config.id} exchange added successfully`);
      return exchange;
    } catch (error) {
      throw new Error(`Failed to add exchange "${config.id}": ${this.getErrorMessage(error)}`);
    }
  }

  async getBalance(exchangeId: SupportedExchangeId): Promise<NormalizedBalance> {
    try {
      const exchange = this.getRequiredExchange(exchangeId);
      const balance = await exchange.fetchBalance();
      return {
        total: this.numberMap(balance.total),
        free: this.numberMap(balance.free),
        used: this.numberMap(balance.used),
      };
    } catch (error) {
      throw new Error(`Failed to fetch balance from "${exchangeId}": ${this.getErrorMessage(error)}`);
    }
  }

  async getPositions(exchangeId: SupportedExchangeId): Promise<NormalizedPosition[]> {
    try {
      const exchange = this.getRequiredExchange(exchangeId);
      if (!exchange.has.fetchPositions) {
        throw new Error(`Exchange "${exchangeId}" does not support position fetching`);
      }

      const positions = await exchange.fetchPositions();
      return positions
        .filter((position) => Number(position.contracts ?? 0) > 0)
        .map((position) => ({
          symbol: position.symbol ?? "",
          side: position.side ?? "",
          entryPrice: this.nullableNumber(position.entryPrice),
          markPrice: this.nullableNumber(position.markPrice),
          unrealizedPnl: this.nullableNumber(position.unrealizedPnl),
          leverage: this.nullableNumber(position.leverage),
          liquidationPrice: this.nullableNumber(position.liquidationPrice),
        }));
    } catch (error) {
      throw new Error(`Failed to fetch positions from "${exchangeId}": ${this.getErrorMessage(error)}`);
    }
  }

  async getMyTrades(
    exchangeId: SupportedExchangeId,
    symbol: string,
    since?: number,
    limit?: number
  ) {
    try {
      const exchange = this.getRequiredExchange(exchangeId);
      return await exchange.fetchMyTrades(symbol, since, limit);
    } catch (error) {
      throw new Error(`Failed to fetch trades from "${exchangeId}" for "${symbol}": ${this.getErrorMessage(error)}`);
    }
  }

  async getCandles(
    exchangeId: SupportedExchangeId,
    symbol: string,
    timeframe: string = "1m",
    limit: number = 100
  ) {
    try {
      const exchange = this.getRequiredExchange(exchangeId);
      return await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (error) {
      throw new Error(`Failed to fetch candles from "${exchangeId}" for "${symbol}": ${this.getErrorMessage(error)}`);
    }
  }

  async getFundingRate(exchangeId: SupportedExchangeId, symbol: string) {
    try {
      const exchange = this.getRequiredExchange(exchangeId);
      if (!exchange.has.fetchFundingRate) {
        throw new Error(`Exchange "${exchangeId}" does not support funding rate fetching`);
      }
      return await exchange.fetchFundingRate(symbol);
    } catch (error) {
      throw new Error(`Failed to fetch funding rate from "${exchangeId}" for "${symbol}": ${this.getErrorMessage(error)}`);
    }
  }

  getExchange(exchangeId: SupportedExchangeId): ExchangeInstance {
    try {
      return this.getRequiredExchange(exchangeId);
    } catch (error) {
      throw new Error(`Failed to get exchange "${exchangeId}": ${this.getErrorMessage(error)}`);
    }
  }

  private addExchangeFromEnv(id: SupportedExchangeId, apiKeyName: string, secretName: string): void {
    const apiKey = process.env[apiKeyName];
    const secret = process.env[secretName];
    if (!apiKey || !secret) return;

    try {
      this.addExchange({ id, apiKey, secret });
    } catch (error) {
      console.error(`Failed to add exchange "${id}":`, this.getErrorMessage(error));
    }
  }

  private getRequiredExchange(exchangeId: SupportedExchangeId): ExchangeInstance {
    const exchange = this.exchanges.get(exchangeId);
    if (!exchange) {
      throw new Error(
        `Exchange "${exchangeId}" is not connected. Call addExchange() or set the required ${exchangeId.toUpperCase()} API keys in .env.`
      );
    }
    return exchange;
  }

  private numberMap(values: object | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(values ?? {})) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        result[key] = numeric;
      }
    }
    return result;
  }

  private nullableNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const exchangeConnector = new ExchangeConnector();
