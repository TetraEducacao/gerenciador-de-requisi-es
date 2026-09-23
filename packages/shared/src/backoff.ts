/**
 * Backoff strategy calculator for retry logic.
 * Implements exponential backoff with jitter.
 */

import Logger from './logger.js';

const logger = new Logger('BackoffCalculator');

export interface BackoffStrategy {
  baseDelayMs: number; // Initial delay
  maxDelayMs: number; // Maximum delay cap
  factor: number; // Exponential factor (typically 2)
  jitterFactor: number; // Random factor (0.5-1.5 recommended)
}

/**
 * Default exponential backoff strategy
 * Delay = min(base * (factor ^ attempt), max) * random(0.5, 1.5)
 */
export const DEFAULT_BACKOFF: BackoffStrategy = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  factor: 2,
  jitterFactor: 1,
};

export class BackoffCalculator {
  /**
   * Calculate backoff delay for a given attempt number
   * @param attemptNumber - 1-indexed attempt number
   * @param strategy - Backoff strategy configuration
   * @param retryAfterMs - Optional Retry-After header value (takes precedence)
   */
  static calculateDelay(
    attemptNumber: number,
    strategy: BackoffStrategy = DEFAULT_BACKOFF,
    retryAfterMs?: number
  ): number {
    // If Retry-After header provided, respect it
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      logger.debug('Using Retry-After header', { retryAfterMs });
      return retryAfterMs;
    }

    // Exponential backoff: base * (factor ^ (attempt - 1))
    const exponentialDelay = strategy.baseDelayMs * Math.pow(strategy.factor, attemptNumber - 1);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, strategy.maxDelayMs);

    // Add jitter: multiply by random factor between 0.5 and 1.5
    const jitter = 0.5 + Math.random() * 1.0; // Random between 0.5 and 1.5
    const finalDelay = Math.floor(cappedDelay * jitter);

    logger.debug('Backoff calculated', {
      attemptNumber,
      exponentialDelay: Math.floor(exponentialDelay),
      cappedDelay,
      jitter: jitter.toFixed(2),
      finalDelay,
    });

    return finalDelay;
  }

  /**
   * Parse Retry-After header (can be in seconds or HTTP-date format)
   * Returns milliseconds to wait, or undefined if invalid
   */
  static parseRetryAfter(retryAfterHeader?: string): number | undefined {
    if (!retryAfterHeader) {
      return undefined;
    }

    // Try parsing as seconds (most common)
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    try {
      const date = new Date(retryAfterHeader);
      if (!isNaN(date.getTime())) {
        const now = Date.now();
        const waitMs = date.getTime() - now;

        // Only return positive values
        if (waitMs > 0) {
          return waitMs;
        }
      }
    } catch (e) {
      // Invalid date format
    }

    logger.warn('Failed to parse Retry-After header', { retryAfterHeader });
    return undefined;
  }

  /**
   * Check if error is worth retrying
   */
  static isRetryable(httpStatus?: number, error?: string): boolean {
    if (!httpStatus && !error) {
      return true; // Network error, assume retryable
    }

    if (!httpStatus) {
      return true; // No HTTP status, likely connection error
    }

    // 5xx errors are always retryable
    if (httpStatus >= 500) {
      return true;
    }

    // Specific 4xx errors that are retryable
    if (httpStatus === 408) return true; // Request Timeout
    if (httpStatus === 429) return true; // Too Many Requests

    // Other 4xx errors are not retryable (permanent failure)
    if (httpStatus >= 400 && httpStatus < 500) {
      return false;
    }

    // 3xx and 2xx should not reach here, but if they do, not retryable
    return false;
  }
}

/**
 * Create a custom backoff strategy
 */
export function createBackoffStrategy(overrides: Partial<BackoffStrategy> = {}): BackoffStrategy {
  return {
    ...DEFAULT_BACKOFF,
    ...overrides,
  };
}
