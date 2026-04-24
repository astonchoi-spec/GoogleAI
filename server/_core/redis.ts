import { createClient, type RedisClientType } from "redis";

class RedisService {
  private client: RedisClientType | null = null;
  private connecting: Promise<RedisClientType> | null = null;

  async getClient(): Promise<RedisClientType> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.createAndConnectClient();
    try {
      this.client = await this.connecting;
      return this.client;
    } catch (error) {
      throw this.wrapConnectionError(error); // MODIFIED: normalize Redis connection failures into actionable app-level errors.
    } finally {
      this.connecting = null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const client = await this.getClient();
    return client.hSet(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    const client = await this.getClient();
    return client.hGet(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const client = await this.getClient();
    return client.hGetAll(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    const client = await this.getClient();
    return client.hDel(key, field);
  }

  async publish(channel: string, message: string): Promise<number> {
    const client = await this.getClient();
    return client.publish(channel, message);
  }

  async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    return client.get(key);
  }

  async set(key: string, value: string): Promise<string | null> {
    const client = await this.getClient();
    return client.set(key, value);
  }

  async disconnect(): Promise<void> {
    if (!this.client?.isOpen) return;
    await this.client.quit();
    this.client = null;
  }

  private async createAndConnectClient(): Promise<RedisClientType> {
    const client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        connectTimeout: 2000, // MODIFIED: fail fast in local/dev when Redis is unavailable.
        reconnectStrategy: () => false, // MODIFIED: disable endless reconnect loops that block startup and diagnostics.
      },
    });

    client.on("error", (error) => {
      const baseMessage = error instanceof Error ? error.message : String(error); // MODIFIED: preserve direct message first.
      const detail = this.extractAggregateDetails(error); // MODIFIED: AggregateError often carries connection details in nested `errors`.
      const message = (baseMessage || detail || "unknown redis client error").trim();
      console.warn("[Redis] Client error:", message);
    });

    await client.connect();
    return client as RedisClientType;
  }

  private wrapConnectionError(error: unknown): Error {
    const aggregateDetails = this.extractAggregateDetails(error); // MODIFIED: recover nested ECONNREFUSED details from AggregateError.
    const rawMessage = error instanceof Error ? error.message : String(error); // MODIFIED: preserve original details for debugging.
    const combined = `${rawMessage} ${aggregateDetails}`.trim();
    const normalized = combined.toLowerCase();
    if (
      normalized.includes("econnrefused")
      || normalized.includes("connect")
      || normalized.includes("redis")
    ) {
      return new Error(
        "Redis connection failed. Start Redis on localhost:6379 or set REDIS_URL to a reachable instance."
      );
    }
    return new Error(`Redis operation failed: ${combined || "unknown error"}`);
  }

  private extractAggregateDetails(error: unknown): string {
    const maybeAggregate = error as { errors?: unknown[] } | null; // MODIFIED: safely inspect AggregateError-like shape without hard dependency.
    if (!maybeAggregate?.errors || !Array.isArray(maybeAggregate.errors)) return "";
    const joined = maybeAggregate.errors
      .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
      .filter((message) => message && message.trim().length > 0)
      .join(" | ");
    return joined;
  }
}

export const redis = new RedisService();
