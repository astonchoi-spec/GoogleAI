import { createClient, type RedisClientType } from "redis";

class RedisService {
  private client: RedisClientType | null = null;
  private connecting: Promise<RedisClientType> | null = null;
  private mode: "redis" | "memory" = "redis"; // MODIFIED: allow in-memory fallback mode so dev server can run without local Redis.
  private memoryKv = new Map<string, string>(); // MODIFIED: provide basic key/value storage when Redis fallback mode is active.
  private memoryHash = new Map<string, Map<string, string>>(); // MODIFIED: provide hash storage for alert/cache features in fallback mode.
  private hasLoggedMemoryFallback = false; // MODIFIED: avoid repetitive fallback warning noise in local development logs.
  private readonly allowMemoryFallback =
    process.env.REDIS_FALLBACK !== "false" && process.env.NODE_ENV !== "production"; // MODIFIED: keep strict Redis behavior in production while defaulting to resilient dev mode.

  async getClient(): Promise<RedisClientType | null> {
    if (this.mode === "memory") { // MODIFIED: short-circuit Redis connect attempts while fallback mode is active.
      return null; // MODIFIED: indicate fallback mode so callers can use in-memory operations without throwing.
    }

    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.createAndConnectClient();
    try {
      this.client = await this.connecting;
      this.mode = "redis"; // MODIFIED: switch back to real Redis mode as soon as connection succeeds.
      return this.client;
    } catch (error) {
      if (this.allowMemoryFallback) { // MODIFIED: gracefully degrade to in-memory storage when Redis is down in development.
        this.mode = "memory";
        this.logMemoryFallback(error);
        return null; // MODIFIED: return null client to trigger in-memory operation path immediately on first failure.
      }
      throw this.wrapConnectionError(error); // MODIFIED: normalize Redis connection failures into actionable app-level errors.
    } finally {
      this.connecting = null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis hash set in fallback mode.
      const hash = this.memoryHash.get(key) ?? new Map<string, string>();
      const isNewField = !hash.has(field);
      hash.set(field, value);
      this.memoryHash.set(key, hash);
      return isNewField ? 1 : 0;
    }

    const client = await this.getClient();
    if (!client) return this.hset(key, field, value); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.hSet(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis hash get in fallback mode.
      return this.memoryHash.get(key)?.get(field) ?? null;
    }

    const client = await this.getClient();
    if (!client) return this.hget(key, field); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.hGet(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis hash getAll in fallback mode.
      const hash = this.memoryHash.get(key);
      if (!hash) return {};
      return Object.fromEntries(hash.entries());
    }

    const client = await this.getClient();
    if (!client) return this.hgetall(key); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.hGetAll(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis hash delete in fallback mode.
      const hash = this.memoryHash.get(key);
      if (!hash) return 0;
      const existed = hash.delete(field);
      if (hash.size === 0) this.memoryHash.delete(key);
      return existed ? 1 : 0;
    }

    const client = await this.getClient();
    if (!client) return this.hdel(key, field); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.hDel(key, field);
  }

  async publish(channel: string, message: string): Promise<number> {
    if (this.mode === "memory") { // MODIFIED: no-op publish in fallback mode to keep command paths non-blocking.
      return 0;
    }

    const client = await this.getClient();
    if (!client) return 0; // MODIFIED: publish remains no-op when fallback mode is enabled during initial connect attempt.
    return client.publish(channel, message);
  }

  async get(key: string): Promise<string | null> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis get in fallback mode.
      return this.memoryKv.get(key) ?? null;
    }

    const client = await this.getClient();
    if (!client) return this.get(key); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.get(key);
  }

  async set(key: string, value: string): Promise<string | null> {
    if (this.mode === "memory") { // MODIFIED: emulate Redis set in fallback mode.
      this.memoryKv.set(key, value);
      return "OK";
    }

    const client = await this.getClient();
    if (!client) return this.set(key, value); // MODIFIED: retry path routes to memory mode immediately after fallback activation.
    return client.set(key, value);
  }

  async disconnect(): Promise<void> {
    if (this.mode === "memory") { // MODIFIED: clear fallback cache on explicit disconnect for predictable local resets.
      this.memoryKv.clear();
      this.memoryHash.clear();
      this.mode = "redis";
      return;
    }

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

  private logMemoryFallback(error: unknown): void {
    if (this.hasLoggedMemoryFallback) return; // MODIFIED: log memory fallback activation once per process.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] Falling back to in-memory store: ${message}`);
    this.hasLoggedMemoryFallback = true;
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
