import './env.js';

import { Worker, Job, Queue, DelayedError } from 'bullmq';
import Redis from 'ioredis';
import { getRedisConfig, QueueJob, Logger } from 'request-manager-shared';
import { processor } from './processors/request-processor.js';
import { createReconciliationService, ReconciliationService } from './services/reconciliation.js';

const logger = new Logger('Worker');
const redisConfig = getRedisConfig();

// Use the same parsed connection settings as the API.
const redisClient = new Redis({
  ...redisConfig,
  tls: redisConfig.tls ? {} : undefined,
});
let reconciliationService: ReconciliationService | null = null;

const worker = new Worker(
  'requests',
  async (job: Job<QueueJob>) => {
    try {
      logger.info('Processing job', { jobId: job.id, requestId: job.data.requestId });

      const result = await processor.processJob(job.data);

      if (result.success) {
        logger.info('Job processed successfully', { jobId: job.id, requestId: job.data.requestId });
        return result;
      }

      // Handle rate-limited / delayed jobs
      if (result.retryable && result.delayMs && result.delayMs > 0) {
        const delayReason = (result as any).delayReason || 'rate_limit';
        logger.info('Job rate-limited, rescheduling with delay', {
          jobId: job.id,
          requestId: job.data.requestId,
          delayMs: result.delayMs,
          reason: delayReason,
        });

        // Ensure job token exists (required for moveToDelayed)
        if (!job.token) {
          const errorMsg = 'Cannot reschedule job: missing lock token (job may have been stalled)';
          logger.error(errorMsg, undefined, { jobId: job.id });
          throw new Error(errorMsg);
        }

        // Move job to delayed state - it will be picked up after delay
        // This does NOT consume a processing attempt or increment HTTP attempts
        const delayedAt = Date.now() + result.delayMs;
        await job.moveToDelayed(delayedAt, job.token);

        // Throw DelayedError to signal to BullMQ that job was moved
        // This prevents Worker from attempting to complete/fail the job
        // BullMQ will handle the delayed job resumption automatically
        throw new DelayedError('Job delayed for rate limiting');
      }

      if (result.retryable) {
        logger.warn('Job processing failed (retryable)', {
          jobId: job.id,
          requestId: job.data.requestId,
          error: result.error,
        });
        throw new Error(`Retryable error: ${result.error}`);
      }

      logger.error('Job processing failed (non-retryable)', undefined, {
        jobId: job.id,
        requestId: job.data.requestId,
        error: result.error,
      });
      return result;
    } catch (error) {
      logger.error('Job handler exception', error as Error, {
        jobId: job.id,
        requestId: job.data.requestId,
      });
      throw error;
    }
  },
  { connection: redisClient }
);

worker.on('completed', (job) => {
  logger.info('Job completed', {
    jobId: job.id,
    requestId: (job.data as QueueJob).requestId,
  });
});

worker.on('failed', (job, error) => {
  logger.error('Job failed', error, {
    jobId: job?.id,
    requestId: (job?.data as QueueJob)?.requestId,
  });
});

worker.on('error', (error) => {
  logger.error('Worker error', error as Error);
});

// Initialize reconciliation service
const requestQueue = new Queue('requests', { connection: redisClient });

reconciliationService = createReconciliationService(redisClient, requestQueue);

// Start reconciliation in background (non-blocking)
try {
  reconciliationService.start();
} catch (error) {
  logger.error('Failed to start reconciliation service', error as Error);
}

logger.info('✓ Request Manager Worker started', {
  redis: `${redisConfig.host}:${redisConfig.port}`,
  environment: process.env.NODE_ENV || 'development',
  reconciliationEnabled: true,
});

const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down worker gracefully...');
  try {
    // Stop reconciliation service
    if (reconciliationService) {
      reconciliationService.stop();
      logger.info('Reconciliation service stopped');
    }

    // Close request queue
    await requestQueue.close();
    logger.info('Request queue closed');

    // Close worker
    await worker.close();
    logger.info('Worker closed successfully');

    // Close Redis client
    await redisClient.disconnect();
    logger.info('Redis client disconnected');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error as Error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
