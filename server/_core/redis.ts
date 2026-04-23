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

  async publish(channel: string, message: string): Promise<number> {
    const client = await this.getClient();
    return client.publish(channel, message);
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
