/**
 * Health check routes for monitoring.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger, getRedisConfig } from 'request-manager-shared';
import { getSupabaseClient } from '../lib/supabase-client.js';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { checkWorkerStatus } from '../services/worker-health.js';

const logger = new Logger('HealthRoutes');

let redis: Redis;

type HealthStatus = 'online' | 'degraded' | 'offline';

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  const config = getRedisConfig();
  redis = new Redis({
    ...config,
    tls: config.tls ? {} : undefined,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
  let lastWarning = 0;
  redis.on('error', (error) => {
    if (Date.now() - lastWarning > 30000) {
      logger.warn('Redis unavailable for health checks', { message: error.message });
      lastWarning = Date.now();
    }
  });
  const queue = new Queue('requests', { connection: redis });
  queue.on('error', () => { /* Redis errors are reported by the handler above. */ });
  fastify.addHook('onClose', async () => {
    await queue.close();
    redis.disconnect();
  });
  /**
   * GET /admin/health
   * Get aggregated health status
   */
  fastify.get('/admin/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = {
        api: 'online' as HealthStatus,
        redis: await checkRedis(),
        database: await checkDatabase(),
        worker: await checkWorkerStatus(queue),
      };

      return reply.send(health);
    } catch (error) {
      logger.error('Failed to get health status', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get health status',
        },
      });
    }
  });
}

async function checkRedis(): Promise<HealthStatus> {
  try {
    const result = await redis.ping();
    return result === 'PONG' ? 'online' : 'offline';
  } catch (_error) {
    return 'offline';
  }
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    const { error } = await getSupabaseClient().from('destinations').select('id').limit(1);
    return error ? 'offline' : 'online';
  } catch (_error) {
    return 'offline';
  }
}
