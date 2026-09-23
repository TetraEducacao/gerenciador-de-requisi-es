/**
 * Queue service for managing BullMQ with Redis.
 * Handles enqueueing and configuration of jobs.
 */

import { Queue, QueueOptions } from 'bullmq';
import { getRedisConfig, QueueJob, Logger } from 'request-manager-shared';

const logger = new Logger('QueueService');

export class QueueService {
  private requestQueue: Queue | null = null;
  private redisConfig;

  constructor() {
    this.redisConfig = getRedisConfig();
  }

  /**
   * Get or create the requests queue
   */
  getRequestQueue(): Queue {
    if (!this.requestQueue) {
      const queueOptions: QueueOptions = {
        connection: {
          host: this.redisConfig.host,
          port: this.redisConfig.port,
          password: this.redisConfig.password,
          username: this.redisConfig.username,
          tls: this.redisConfig.tls ? {} : undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      };

      this.requestQueue = new Queue('requests', queueOptions);

      this.requestQueue.on('error', (error) => {
        logger.error('Queue error', error);
      });

      logger.info('Request queue initialized', {
        host: this.redisConfig.host,
        port: this.redisConfig.port,
      });
    }

    return this.requestQueue;
  }

  /**
   * Enqueue a request for processing
   */
  async enqueueRequest(job: QueueJob): Promise<string> {
    const queue = this.getRequestQueue();

    try {
      const result = await queue.add('process-request', job, {
        jobId: job.requestId || undefined,
      });

      logger.info('Request enqueued', {
        jobId: result.id,
        requestId: job.requestId,
        destinationId: job.destinationId,
      });

      return result.id || '';
    } catch (error) {
      logger.error('Failed to enqueue request', error as Error, {
        requestId: job.requestId,
      });
      throw error;
    }
  }

  /**
   * Close queue connection
   */
  async close(): Promise<void> {
    if (this.requestQueue) {
      await this.requestQueue.close();
      logger.info('Request queue closed');
    }
  }
}

let queueServiceInstance: QueueService | null = null;

export function getQueueService(): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}
