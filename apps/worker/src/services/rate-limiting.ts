/**
 * Rate limiting service for the worker.
 * Integrates RateLimiter and ConcurrencyManager.
 */

import Redis from 'ioredis';
import { rateLimiter, RateLimitConfig, concurrencyManager, BackoffCalculator, Logger } from 'request-manager-shared';

const logger = new Logger('RateLimitingService');

export class RateLimitingService {
  constructor(redis: Redis) {
    rateLimiter.setRedisClient(redis);
    concurrencyManager.setRedisClient(redis);
  }

  /**
   * Check if a request can be processed immediately
   * Returns wait time in ms if rate limited, 0 if allowed
   */
  async canProcessRequest(destinationId: string, rateLimitConfig?: RateLimitConfig, concurrencyLimit?: number): Promise<number> {
    // Check concurrency first (faster)
    if (concurrencyLimit && concurrencyLimit > 0) {
      const allowed = await concurrencyManager.tryAcquire(destinationId, concurrencyLimit);
      if (!allowed) {
        logger.debug('Concurrency limit reached', { destinationId, limit: concurrencyLimit });
        return 5000; // Wait 5 seconds before retrying
      }
    }

    // Check rate limits
    if (rateLimitConfig) {
      const waitMs = await rateLimiter.checkRateLimit(destinationId, rateLimitConfig);
      if (waitMs > 0) {
        // Release concurrency slot if we acquired it
        if (concurrencyLimit && concurrencyLimit > 0) {
          await concurrencyManager.release(destinationId);
        }

        logger.debug('Rate limit reached', { destinationId, waitMs });
        return waitMs;
      }
    }

    return 0; // Allowed
  }

  /**
   * Record successful send and release concurrency slot
   */
  async recordSuccess(destinationId: string, _durationMs: number): Promise<void> {
    await rateLimiter.recordSent(destinationId);
    await concurrencyManager.release(destinationId);
    logger.debug('Request success recorded', { destinationId });
  }

  /**
   * Release concurrency slot on failure
   */
  async recordFailure(destinationId: string): Promise<void> {
    await concurrencyManager.release(destinationId);
    logger.debug('Concurrency slot released on failure', { destinationId });
  }

  /**
   * Calculate backoff for retry
   */
  calculateBackoffDelay(
    attemptNumber: number,
    httpStatus?: number,
    retryAfterHeader?: string
  ): { delayMs: number; isRetryable: boolean } {
    const retryAfterMs = retryAfterHeader ? BackoffCalculator.parseRetryAfter(retryAfterHeader) : undefined;
    const delayMs = BackoffCalculator.calculateDelay(attemptNumber, undefined, retryAfterMs);
    const isRetryable = BackoffCalculator.isRetryable(httpStatus);

    return { delayMs, isRetryable };
  }
}
