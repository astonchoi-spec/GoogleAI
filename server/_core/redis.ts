import { createClient, type RedisClientType } from "redis";

class RedisService {
  private client: RedisClientType | null = null;
  private connecting: Promise<RedisClientType> | null = null;
  private warnedUnavailable = false;
  private readonly memoryHashes = new Map<string, Map<string, string>>();
  private readonly memoryStrings = new Map<string, string>();

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
    } finally {
      this.connecting = null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      const client = await this.getClient();
      return client.hSet(key, field, value);
    } catch (error) {
      this.noteUnavailable(error);
      const hash = this.getMemoryHash(key);
      const existed = hash.has(field);
      hash.set(field, value);
      return existed ? 0 : 1;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return client.hGet(key, field);
    } catch (error) {
      this.noteUnavailable(error);
      return this.memoryHashes.get(key)?.get(field) ?? null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const client = await this.getClient();
      return client.hGetAll(key);
    } catch (error) {
      this.noteUnavailable(error);
      return Object.fromEntries(this.memoryHashes.get(key)?.entries() ?? []);
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    try {
      const client = await this.getClient();
      return client.hDel(key, field);
    } catch (error) {
      this.noteUnavailable(error);
      const deleted = this.memoryHashes.get(key)?.delete(field) ?? false;
      return deleted ? 1 : 0;
    }
  }

  async publish(channel: string, message: string): Promise<number> {
    try {
      const client = await this.getClient();
      return client.publish(channel, message);
    } catch (error) {
      this.noteUnavailable(error);
      return 0;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return client.get(key);
    } catch (error) {
      this.noteUnavailable(error);
      return this.memoryStrings.get(key) ?? null;
    }
  }

  async set(key: string, value: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return client.set(key, value);
    } catch (error) {
      this.noteUnavailable(error);
      this.memoryStrings.set(key, value);
      return "OK";
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client?.isOpen) return;
    await this.client.quit();
    this.client = null;
  }

  private async createAndConnectClient(): Promise<RedisClientType> {
    const client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    client.on("error", (error) => {
      this.noteUnavailable(error);
    });

    await client.connect();
    return client as RedisClientType;
  }

  private getMemoryHash(key: string): Map<string, string> {
    let hash = this.memoryHashes.get(key);
    if (!hash) {
      hash = new Map<string, string>();
      this.memoryHashes.set(key, hash);
    }
    return hash;
  }

  private noteUnavailable(error: unknown): void {
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] Unavailable, using in-memory fallback: ${message}`);
  }
}

export const redis = new RedisService();
