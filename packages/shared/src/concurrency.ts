/**
 * Concurrency control using Redis semaphore.
 * Tracks in-progress jobs per destination and enforces limits.
 */

import Redis from 'ioredis';
import Logger from './logger.js';

const logger = new Logger('ConcurrencyManager');

const CONCURRENCY_KEY_PREFIX = 'concurrency:in_progress:';
const CONCURRENCY_TTL = 86400; // 24 hours for safety

export class ConcurrencyManager {
  private redis: Redis | null = null;

  setRedisClient(client: Redis): void {
    this.redis = client;
  }

  /**
   * Try to acquire a concurrency slot for a destination
   * Returns true if slot acquired, false if limit reached or Redis unavailable
   * Note: Fails closed (rejects acquisition) if Redis is unavailable
   */
  async tryAcquire(destinationId: string, limit: number): Promise<boolean> {
    if (!this.redis) {
      logger.error('Redis client not set for concurrency control - failing closed');
      return false; // Fail closed: reject if Redis unavailable
    }

    try {
      const key = CONCURRENCY_KEY_PREFIX + destinationId;
      const current = await this.redis.incr(key);

      // Set TTL on first increment
      if (current === 1) {
        await this.redis.expire(key, CONCURRENCY_TTL);
      }

      if (current > limit) {
        // Limit reached, decrement back
        await this.redis.decr(key);

        logger.debug('Concurrency limit reached', {
          destinationId,
          current: current - 1,
          limit,
        });

        return false;
      }

      logger.debug('Concurrency slot acquired', {
        destinationId,
        current,
        limit,
      });

      return true;
    } catch (error) {
      logger.error('Concurrency check failed', error as Error, { destinationId });
      // Fail closed: reject if error occurs
      return false;
    }
  }

  /**
   * Release a concurrency slot (call when job completes or fails)
   */
  async release(destinationId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const key = CONCURRENCY_KEY_PREFIX + destinationId;
      const current = await this.redis.decr(key);

      if (current < 0) {
        // Safety: shouldn't go below 0
        await this.redis.set(key, '0', 'EX', CONCURRENCY_TTL);
        logger.warn('Concurrency counter went negative, reset to 0', { destinationId });
      } else {
        logger.debug('Concurrency slot released', { destinationId, remaining: current });
      }
    } catch (error) {
      logger.error('Failed to release concurrency slot', error as Error, { destinationId });
    }
  }

  /**
   * Get current count of in-progress jobs
   */
  async getCurrentCount(destinationId: string): Promise<number> {
    if (!this.redis) return 0;

    try {
      const key = CONCURRENCY_KEY_PREFIX + destinationId;
      const current = await this.redis.get(key);
      return parseInt(current || '0', 10);
    } catch (error) {
      logger.error('Failed to get concurrency count', error as Error, { destinationId });
      return 0;
    }
  }

  /**
   * Reset concurrency counter (for testing/recovery)
   */
  async reset(destinationId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const key = CONCURRENCY_KEY_PREFIX + destinationId;
      await this.redis.del(key);
      logger.info('Concurrency counter reset', { destinationId });
    } catch (error) {
      logger.error('Failed to reset concurrency counter', error as Error, { destinationId });
    }
  }

  /**
   * Reset all concurrency counters (for cleanup)
   */
  async resetAll(): Promise<void> {
    if (!this.redis) return;

    try {
      const pattern = CONCURRENCY_KEY_PREFIX + '*';
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('All concurrency counters reset', { count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to reset all concurrency counters', error as Error);
    }
  }
}

export const concurrencyManager = new ConcurrencyManager();
