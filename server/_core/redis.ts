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
    });

    client.on("error", (error) => {
      console.warn("[Redis] Client error:", error instanceof Error ? error.message : String(error));
    });

    await client.connect();
    return client as RedisClientType;
  }
}

export const redis = new RedisService();
