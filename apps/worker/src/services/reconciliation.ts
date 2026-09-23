/**
 * Reconciliation service for Request Manager
 *
 * Recovers jobs that are persisted in Supabase but missing from BullMQ queue.
 * Handles cases where:
 * - Worker crashed before enqueuing a new job
 * - Job was removed from queue but request not marked as failed
 * - Network split caused queue and DB desync
 *
 * Uses distributed lock to ensure only one reconciliation runs across multiple worker instances.
 */

import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, Logger, QueueJob } from 'request-manager-shared';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('ReconciliationService');

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes - min age before considering as orphan
const BATCH_SIZE = 100; // Process in batches to avoid overwhelming system
const LOCK_KEY = 'reconciliation:lock';
const LOCK_TTL = 60; // 60 seconds - must be longer than max cycle time
const MAX_ATTEMPTS_PER_CYCLE = 500; // Safety limit on recovery attempts per cycle

export interface ReconciliationStats {
  checked: number;
  recovered: number;
  errors: number;
  duration: number;
  lockAcquired: boolean;
}

export class ReconciliationService {
  private supabase;
  private queue: Queue | null = null;
  private redis: Redis;
  private lastRun: number = 0;
  private isRunning: boolean = false;
  private lockId: string = uuidv4(); // Unique ID for this instance's locks

  constructor(redis: Redis, queue: Queue) {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
    this.queue = queue;
    this.redis = redis;
  }

  /**
   * Start the reconciliation service
   * Runs every RECONCILIATION_INTERVAL_MS
   */
  start(): void {
    logger.info('Reconciliation service started', {
      intervalMs: RECONCILIATION_INTERVAL_MS,
      gracePeriodMs: GRACE_PERIOD_MS,
      lockId: this.lockId,
    });

    // Run immediately on startup
    this.reconcile().catch((error) => {
      logger.error('Initial reconciliation failed', error as Error);
    });

    // Then run periodically
    setInterval(() => {
      this.reconcile().catch((error) => {
        logger.error('Scheduled reconciliation failed', error as Error);
      });
    }, RECONCILIATION_INTERVAL_MS);
  }

  /**
   * Execute reconciliation cycle
   * Find requests in DB that are missing from queue and re-enqueue
   */
  async reconcile(): Promise<ReconciliationStats> {
    if (this.isRunning) {
      logger.warn('Reconciliation already running locally, skipping');
      return { checked: 0, recovered: 0, errors: 0, duration: 0, lockAcquired: false };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Try to acquire distributed lock
      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        logger.debug('Could not acquire reconciliation lock (another instance is running)');
        return { checked: 0, recovered: 0, errors: 0, duration: 0, lockAcquired: false };
      }

      const stats = await this.performReconciliation();
      const duration = Date.now() - startTime;

      logger.info('Reconciliation cycle completed', {
        ...stats,
        duration,
        lockId: this.lockId,
      });

      this.lastRun = Date.now();
      await this.releaseLock();
      return { ...stats, duration, lockAcquired: true };
    } catch (error) {
      logger.error('Reconciliation cycle failed', error as Error);
      await this.releaseLock();
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Try to acquire distributed lock using Redis SET NX
   * Returns true if lock was acquired, false if already held by another instance
   */
  private async acquireLock(): Promise<boolean> {
    try {
      // SET key value NX EX ttl - atomic operation
      // Only succeeds if key doesn't exist
      const result = await (this.redis as any).set(
        LOCK_KEY,
        this.lockId,
        'PX', // Milliseconds
        LOCK_TTL * 1000,
        'NX'  // Only set if key doesn't exist
      );

      if (result === 'OK') {
        logger.debug('Reconciliation lock acquired', { lockId: this.lockId });
        return true;
      }

      logger.debug('Reconciliation lock held by another instance');
      return false;
    } catch (error) {
      logger.error('Failed to acquire reconciliation lock', error as Error);
      // On Redis error, skip this cycle to avoid concurrent reconciliation
      return false;
    }
  }

  /**
   * Release distributed lock (only if we still own it)
   */
  private async releaseLock(): Promise<void> {
    try {
      // Use Lua script to ensure only we can release our lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, 1, LOCK_KEY, this.lockId);
      logger.debug('Reconciliation lock released', { lockId: this.lockId });
    } catch (error) {
      logger.error('Failed to release reconciliation lock', error as Error);
      // Lock will expire on its own via TTL
    }
  }

  /**
   * Find requests that are missing from queue and re-enqueue them
   */
  private async performReconciliation(): Promise<Omit<ReconciliationStats, 'duration' | 'lockAcquired'>> {
    const stats = {
      checked: 0,
      recovered: 0,
      errors: 0,
    };

    try {
      let offset = 0;
      let hasMore = true;

      while (hasMore && stats.checked < MAX_ATTEMPTS_PER_CYCLE) {
        // Fetch candidates in batches
        const candidates = await this.findOrphanedRequestsBatch(offset, BATCH_SIZE);

        if (candidates.length === 0) {
          hasMore = false;
          break;
        }

        stats.checked += candidates.length;

        // For each candidate, check if job exists in queue
        for (const request of candidates) {
          try {
            // Check if job already exists (avoids race condition)
            const existingJob = await this.queue?.getJob(request.id);

            if (existingJob) {
              logger.debug('Job already in queue, skipping', { requestId: request.id, jobId: existingJob.id });
              continue;
            }

            // Re-enqueue the request
            await this.reenqueueRequest(request);
            stats.recovered++;
          } catch (error) {
            stats.errors++;
            logger.error('Failed to reconcile request', error as Error, { requestId: request.id });
          }
        }

        if (candidates.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error during reconciliation', error as Error);
      throw error;
    }
  }

  /**
   * Find orphaned requests in a single batch
   * Uses grace period to avoid flagging very recent requests
   */
  private async findOrphanedRequestsBatch(offset: number, limit: number): Promise<any[]> {
    try {
      const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS);

      const { data: requests, error } = await this.supabase
        .from('requests')
        .select('*, destinations(*)')
        .in('status', ['queued', 'processing', 'retrying'])
        .lt('updated_at', graceCutoff.toISOString())
        .order('updated_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to query requests', error);
        throw error;
      }

      logger.debug('Fetched orphaned request batch', {
        count: requests?.length || 0,
        offset,
      });

      return requests || [];
    } catch (error) {
      logger.error('Error finding orphaned requests', error as Error);
      throw error;
    }
  }

  /**
   * Re-enqueue a single request
   * Creates job with deterministic ID (same as request ID)
   */
  private async reenqueueRequest(request: any): Promise<void> {
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }

    try {
      const jobData: QueueJob = {
        requestId: request.id || '',
        destinationId: request.destination_id || '',
        payload: request.payload,
        headers: undefined,
        method: request.destinations?.http_method || 'POST',
        contentType: request.content_type || 'application/json',
      };

      // Add job with deterministic ID to prevent duplicates
      // BullMQ will handle if job with same ID already exists
      const job = await this.queue.add('process-request', jobData, {
        jobId: request.id,
      });

      logger.info('Request re-enqueued', {
        requestId: request.id,
        jobId: job.id,
        status: request.status,
        attempts: request.attempts,
      });

      // Update request status to 'queued' if it was 'processing' or 'retrying'
      if (request.status !== 'queued') {
        await this.supabase
          .from('requests')
          .update({ status: 'queued', updated_at: new Date().toISOString() })
          .eq('id', request.id);
      }
    } catch (error) {
      logger.error('Failed to re-enqueue request', error as Error, {
        requestId: request.id,
      });
      throw error;
    }
  }

  /**
   * Stop the reconciliation service
   */
  stop(): void {
    logger.info('Reconciliation service stopped', { lockId: this.lockId });
    this.isRunning = false;
  }

  /**
   * Get status of reconciliation service
   */
  getStatus(): {
    isRunning: boolean;
    lastRun: number;
    timeSinceLastRun: number;
    lockId: string;
  } {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      timeSinceLastRun: Date.now() - this.lastRun,
      lockId: this.lockId,
    };
  }
}

export const createReconciliationService = (redis: Redis, queue: Queue): ReconciliationService => {
  return new ReconciliationService(redis, queue);
};
