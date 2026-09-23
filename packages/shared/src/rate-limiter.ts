/**
 * Rate limiter implementation using Redis.
 * Supports rate limiting by second, minute, or hour.
 * Uses token bucket algorithm for fair distribution.
 */

import Redis from 'ioredis';
import Logger from './logger.js';
import { RateLimitUnit } from './types.js';

const logger = new Logger('RateLimiter');

export interface RateLimitConfig {
  value: number; // max requests
  unit: RateLimitUnit;
  minIntervalMs?: number; // minimum ms between requests
}

export class RateLimiter {
  private redis: Redis | null = null;

  setRedisClient(client: Redis): void {
    this.redis = client;
  }

  /**
   * Check if a request is allowed based on rate limit config
   * Returns how long to wait if rate limit is hit, or 0 if allowed
   * Note: Fails closed (rejects requests) if Redis is unavailable
   */
  async checkRateLimit(destinationId: string, config: RateLimitConfig): Promise<number> {
    if (!this.redis) {
      logger.error('Redis client not set for rate limiting - failing closed');
      // Return large wait time to block requests when Redis is unavailable
      return 30000; // Wait 30 seconds
    }

    // Get unit in milliseconds
    const unitMs = this.getUnitMs(config.unit);
    const windowKey = `rate_limit_window:${destinationId}:${unitMs}`;
    const lastSentKey = `rate_limit_last_sent:${destinationId}`;

    try {
      // Check minimum interval between requests
      if (config.minIntervalMs && config.minIntervalMs > 0) {
        const lastSent = await this.redis.get(lastSentKey);
        if (lastSent) {
          const lastSentMs = parseInt(lastSent, 10);
          const now = Date.now();
          const elapsed = now - lastSentMs;

          if (elapsed < config.minIntervalMs) {
            const waitMs = config.minIntervalMs - elapsed;
            logger.debug('Min interval not met', {
              destinationId,
              waitMs,
              minIntervalMs: config.minIntervalMs,
            });
            return waitMs;
          }
        }
      }

      // Check rate limit (token bucket)
      const current = await this.redis.incr(windowKey);

      if (current === 1) {
        // First request in window, set expiry
        await this.redis.expire(windowKey, Math.ceil(unitMs / 1000));
      }

      if (current > config.value) {
        // Rate limit exceeded
        const ttl = await this.redis.ttl(windowKey);
        const waitMs = ttl > 0 ? ttl * 1000 : unitMs;

        logger.warn('Rate limit exceeded', {
          destinationId,
          current,
          limit: config.value,
          unit: config.unit,
          waitMs,
        });

        return waitMs;
      }

      logger.debug('Rate limit check passed', {
        destinationId,
        current,
        limit: config.value,
      });

      return 0;
    } catch (error) {
      logger.error('Rate limit check failed', error as Error, { destinationId });
      // On Redis error, fail closed (block request to protect destination)
      return 30000; // Wait 30 seconds
    }
  }

  /**
   * Record that a request was successfully sent
   */
  async recordSent(destinationId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const lastSentKey = `rate_limit_last_sent:${destinationId}`;
      // Store timestamp with high TTL for tracking
      await this.redis.set(lastSentKey, Date.now().toString(), 'EX', 86400); // 24h TTL
    } catch (error) {
      logger.error('Failed to record sent timestamp', error as Error, { destinationId });
    }
  }

  /**
   * Reset rate limit for a destination (for testing)
   */
  async reset(destinationId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const pattern = `rate_limit*:${destinationId}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Rate limit reset', { destinationId, keysDeleted: keys.length });
      }
    } catch (error) {
      logger.error('Failed to reset rate limit', error as Error, { destinationId });
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getUnitMs(unit: RateLimitUnit): number {
    switch (unit) {
      case 'second':
        return 1000;
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      default:
        return 1000;
    }
  }
}

export const rateLimiter = new RateLimiter();
