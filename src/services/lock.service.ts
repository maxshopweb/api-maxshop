import redisClient, { isRedisEnabled } from '../config/redis.config';

interface LockEntry {
  key: string;
  timestamp: number;
  expiresAt: number;
}

class LockService {
  private memoryLocks: Map<string, LockEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private readonly DEFAULT_TTL_MS = 30000;
  private readonly CLEANUP_INTERVAL_MS = 60000;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredLocks(), this.CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredLocks(): void {
    const now = Date.now();
    for (const [key, lock] of this.memoryLocks.entries()) {
      if (lock.expiresAt < now) {
        this.memoryLocks.delete(key);
      }
    }
  }

  private async isRedisAvailable(): Promise<boolean> {
    if (!isRedisEnabled() || !redisClient) return false;
    try {
      const status = redisClient.status;
      return status === 'ready' || status === 'connect';
    } catch {
      return false;
    }
  }

  async acquireLock(key: string, ttlMs: number = this.DEFAULT_TTL_MS): Promise<boolean> {
    if (await this.isRedisAvailable() && redisClient) {
      try {
        const acquired = await redisClient.set(key, '1', 'PX', ttlMs, 'NX');
        return acquired === 'OK';
      } catch {
        return this.acquireMemoryLock(key, ttlMs);
      }
    }
    return this.acquireMemoryLock(key, ttlMs);
  }

  async releaseLock(key: string): Promise<void> {
    if (await this.isRedisAvailable() && redisClient) {
      try {
        await redisClient.del(key);
        return;
      } catch {
      }
    }
    this.memoryLocks.delete(key);
  }

  private acquireMemoryLock(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const existing = this.memoryLocks.get(key);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    this.memoryLocks.set(key, {
      key,
      timestamp: now,
      expiresAt: now + ttlMs,
    });
    return true;
  }

  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<T | null> {
    const acquired = await this.acquireLock(key, ttlMs);
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await this.releaseLock(key);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.memoryLocks.clear();
  }
}

export const lockService = new LockService();
export { LockService };
