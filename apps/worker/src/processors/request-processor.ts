/**
 * Request processor for BullMQ jobs.
 * Handles HTTP forwarding to destinations and result persistence.
 */

import axios, { AxiosError } from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, QueueJob, Logger, ProcessingResult } from 'request-manager-shared';
import Redis from 'ioredis';
import { RateLimitingService } from '../services/rate-limiting.js';

const logger = new Logger('RequestProcessor');

export interface ProcessingResultWithDelay extends ProcessingResult {
  delayMs?: number; // If > 0, job should be retried with this delay
  delayReason?: 'rate_limit' | 'concurrency_limit' | 'min_interval' | 'redis_unavailable' | 'retry_after'; // Reason for delay
}

export class RequestProcessor {
  private supabase;
  private rateLimitingService: RateLimitingService | null = null;

  constructor(redis?: Redis) {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);

    if (redis) {
      this.rateLimitingService = new RateLimitingService(redis);
    }
  }

  /**
   * Process a single request job
   * Returns ProcessingResult with optional delayMs if rate limited
   */
  async processJob(job: QueueJob): Promise<ProcessingResultWithDelay> {
    const { requestId, destinationId, payload, headers, method, contentType } = job;

    logger.info('Processing request', { requestId, destinationId });

    // Fetch destination config
      const { data: destination, error: destError } = await this.supabase
        .from('destinations')
        .select('*')
        .eq('id', destinationId)
        .single();

      if (destError || !destination) {
        logger.error('Destination not found', destError || new Error('Destination not found'), { requestId, destinationId });
        return {
          success: false,
          error: `Destination ${destinationId} not found`,
          duration: 0,
          retryable: false,
        };
      }

      if (!destination.enabled) {
        logger.warn('Destination is disabled', { requestId, destinationId });
        return {
          success: false,
          error: 'Destination is disabled',
          duration: 0,
          retryable: false,
        };
      }

      // Check rate limiting and concurrency
      let concurrencyAcquired = false;

      if (this.rateLimitingService) {
        const rateLimitConfig = destination.rate_limit_value ? {
          value: destination.rate_limit_value,
          unit: (destination.rate_limit_unit || 'second') as 'second' | 'minute' | 'hour',
          minIntervalMs: destination.min_interval_ms,
        } : undefined;

        const waitMs = await this.rateLimitingService.canProcessRequest(
          destinationId,
          rateLimitConfig,
          destination.concurrency_limit
        );

        if (waitMs > 0) {
          const delayReason = this.getDelayReason(waitMs, rateLimitConfig, destination.concurrency_limit);
          logger.info('Request rate limited', { requestId, destinationId, waitMs, reason: delayReason });
          return {
            success: false,
            error: 'Rate limited',
            duration: 0,
            retryable: true,
            delayMs: waitMs,
            delayReason,
          };
        }

        // Only mark as acquired if we got past all checks (waitMs === 0)
        // and concurrency limit is configured
        concurrencyAcquired = destination.concurrency_limit > 0;
      }

      let requestSucceeded = false;

      try {
        // Update status to processing
        await this.updateStatus(requestId, 'processing');

        // Prepare request
        const url = destination.url;
        const requestMethod = method || destination.http_method || 'POST';
        const requestHeaders = {
          'Content-Type': contentType || 'application/json',
          ...destination.headers,
          ...headers,
        };

        const startTime = Date.now();

        logger.debug('Sending request', {
          requestId,
          url,
          method: requestMethod,
          timeout: destination.timeout_ms,
        });

        // Send HTTP request
        const response = await axios({
          method: requestMethod.toUpperCase(),
          url,
          data: ['GET', 'DELETE'].includes(requestMethod.toUpperCase()) ? undefined : payload,
          headers: requestHeaders,
          timeout: destination.timeout_ms || 30000,
          validateStatus: () => true, // Don't throw on any status code
        });

        const duration = Date.now() - startTime;
        const statusCode = response.status;
        const success = statusCode >= 200 && statusCode < 300;

        logger.info('Request sent', {
          requestId,
          statusCode,
          duration,
          success,
        });

        // Record attempt
        await this.recordAttempt(requestId, statusCode, duration);

        if (success) {
          // Update status to succeeded
          await this.updateStatus(requestId, 'succeeded', statusCode);
          requestSucceeded = true;
          return {
            success: true,
            httpStatus: statusCode,
            duration,
            retryable: false,
          };
        }

        // Determine if retryable
        const retryable = this.isRetryable(statusCode);

        if (retryable) {
          await this.updateStatus(requestId, 'retrying', statusCode);
        } else {
          await this.updateStatus(requestId, 'failed', statusCode, `HTTP ${statusCode}: ${response.statusText}`);
        }

        return {
          success: false,
          httpStatus: statusCode,
          error: `HTTP ${statusCode}: ${response.statusText}`,
          duration,
          retryable,
        };
      } catch (error) {
        const duration = 0;
        let errorMessage = 'Unknown error';

        if (error instanceof AxiosError) {
          errorMessage = error.message;
          if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused';
          } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout';
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        logger.error('Request processing failed', error as Error, { requestId, destinationId });

        // Determine if retryable (connection errors are retryable)
        const retryable = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(
          (error as AxiosError)?.code || ''
        );

        // Update status
        await this.updateStatus(requestId, retryable ? 'retrying' : 'failed', undefined, errorMessage);

        return {
          success: false,
          error: errorMessage,
          duration,
          retryable,
        };
      } finally {
        // Always manage concurrency slot
        if (concurrencyAcquired && this.rateLimitingService) {
          if (requestSucceeded) {
            await this.rateLimitingService.recordSuccess(destinationId, Date.now() - Date.now());
          } else {
            await this.rateLimitingService.recordFailure(destinationId);
          }
        }
      }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async updateStatus(requestId: string, status: string, httpStatus?: number, error?: string): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
    };

    if (httpStatus !== undefined) {
      updates.last_http_status = httpStatus;
    }

    if (error) {
      updates.last_error = this.sanitizeError(error);
    }

    if (['succeeded', 'failed'].includes(status)) {
      updates.completed_at = new Date().toISOString();
    }

    if (status === 'processing') {
      updates.started_at = new Date().toISOString();
    }

    const { error: dbError } = await this.supabase.from('requests').update(updates).eq('id', requestId);

    if (dbError) {
      logger.error('Failed to update request status', dbError, { requestId, status });
    }
  }

  private async recordAttempt(requestId: string, httpStatus: number, durationMs: number): Promise<void> {
    // Get current attempt number
    const { data: current } = await this.supabase
      .from('requests')
      .select('attempts')
      .eq('id', requestId)
      .single();

    const attemptNumber = (current?.attempts || 0) + 1;

    const { error } = await this.supabase.from('request_attempts').insert([
      {
        request_id: requestId,
        attempt_number: attemptNumber,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        http_status: httpStatus,
        duration_ms: durationMs,
      },
    ]);

    if (error) {
      logger.error('Failed to record attempt', error, { requestId });
    }

    // Update request attempts counter
    await this.supabase.from('requests').update({ attempts: attemptNumber }).eq('id', requestId);
  }

  private isRetryable(statusCode: number): boolean {
    // Retry on server errors (5xx) and specific client errors
    return statusCode >= 500 || [408, 429].includes(statusCode);
  }

  private sanitizeError(error: string): string {
    // Remove sensitive information from error messages
    const sanitized = error
      .replace(/bearer\s+[^\s]+/gi, 'bearer [REDACTED]')
      .replace(/token\s*=\s*[^\s&]+/gi, 'token=[REDACTED]')
      .replace(/key\s*=\s*[^\s&]+/gi, 'key=[REDACTED]')
      .replace(/authorization:\s*[^\s]+/gi, 'authorization: [REDACTED]');

    return sanitized.substring(0, 500); // Limit error message length
  }

  private getDelayReason(
    waitMs: number,
    rateLimitConfig?: { value: number; unit: string; minIntervalMs?: number },
    concurrencyLimit?: number
  ): 'rate_limit' | 'concurrency_limit' | 'min_interval' | 'redis_unavailable' | 'retry_after' {
    // Determine why the request is being delayed
    // This helps distinguish between different types of delays for logging and metrics

    // Note: This is called AFTER canProcessRequest has already checked and potentially released
    // So we need to infer which limit was hit based on waitMs value

    // Heuristic: concurrency limit returns 5000ms, so if waitMs === 5000, it's concurrency
    if (waitMs === 5000 && concurrencyLimit && concurrencyLimit > 0) {
      return 'concurrency_limit';
    }

    if (rateLimitConfig) {
      // Could be rate_limit, min_interval, or redis_unavailable
      // Default to rate_limit as the most common case
      return 'rate_limit';
    }

    return 'rate_limit';
  }
}

export const processor = new RequestProcessor();
