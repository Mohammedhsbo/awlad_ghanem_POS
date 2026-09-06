import { createHash } from "node:crypto";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";

interface StoredValue {
  value: string;
  expiresAt: number;
}

@Injectable()
export class TokenStoreService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private readonly memory = new Map<string, StoredValue>();

  async onModuleInit() {
    if (!process.env.REDIS_URL) {
      return;
    }

    this.client = createClient({ url: process.env.REDIS_URL });
    this.client.on("error", (error) => {
      console.error("Redis error", error);
    });

    try {
      await this.client.connect();
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
      console.warn("Redis unavailable; using in-memory token store for local development.");
      this.client = null;
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async saveRefreshToken(userId: string, tokenId: string, token: string, ttlSeconds: number) {
    await this.set(`refresh_token:${userId}:${tokenId}`, this.hashToken(token), ttlSeconds);
  }

  async isRefreshTokenValid(userId: string, tokenId: string, token: string) {
    const storedHash = await this.get(`refresh_token:${userId}:${tokenId}`);
    return storedHash === this.hashToken(token);
  }

  async deleteRefreshToken(userId: string, tokenId: string) {
    await this.delete(`refresh_token:${userId}:${tokenId}`);
  }

  async deleteRefreshTokensForUser(userId: string, exceptTokenId?: string) {
    const prefix = `refresh_token:${userId}:`;

    if (this.client) {
      // scanIterator yields a BATCH of keys per step, not one key. Passing the
      // batch straight to del() stringified the array, so the wrong key was
      // deleted, and an empty batch made Redis reject the call outright —
      // leaving the user's other sessions alive.
      for await (const batch of this.client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
        const keys = (Array.isArray(batch) ? batch : [batch]).map(String);
        const doomed = keys.filter((key) => key.slice(prefix.length) !== exceptTokenId);

        if (doomed.length > 0) {
          await this.client.del(doomed);
        }
      }
      return;
    }

    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix) && key.slice(prefix.length) !== exceptTokenId) {
        this.memory.delete(key);
      }
    }
  }

  async blacklistToken(tokenId: string, ttlSeconds: number) {
    if (ttlSeconds <= 0) {
      return;
    }
    await this.set(`blacklist:${tokenId}`, "1", ttlSeconds);
  }

  async checkBlacklist(tokenId: string) {
    return (await this.get(`blacklist:${tokenId}`)) === "1";
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  async set(key: string, value: string, ttlSeconds: number) {
    if (this.client) {
      await this.client.set(key, value, { EX: ttlSeconds });
      return;
    }

    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async get(key: string) {
    if (this.client) {
      return this.client.get(key);
    }

    const stored = this.memory.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return stored.value;
  }

  async delete(key: string) {
    if (this.client) {
      await this.client.del(key);
      return;
    }

    this.memory.delete(key);
  }
}
