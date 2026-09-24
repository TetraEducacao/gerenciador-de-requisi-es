/**
 * Admin settings routes for configurable behavior
 */

import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { Logger } from 'request-manager-shared';

const logger = new Logger('SettingsRoutes');

interface WorkerSettings {
  requestIntervalMs: number;
}

export async function registerSettingsRoutes(
  fastify: FastifyInstance,
  redis: Redis
): Promise<void> {
  /**
   * GET /admin/settings
   * Retrieve current worker settings
   */
  fastify.get<{ Reply: WorkerSettings }>('/admin/settings', async () => {
    try {
      const intervalStr = await redis.get('request:interval:ms');
      const requestIntervalMs = intervalStr ? parseInt(intervalStr, 10) : 0;

      logger.debug('Retrieved settings', { requestIntervalMs });

      return {
        requestIntervalMs,
      };
    } catch (error) {
      logger.error('Failed to retrieve settings', error as Error);
      throw error;
    }
  });

  /**
   * PUT /admin/settings
   * Update worker settings (e.g., interval between requests)
   */
  fastify.put<{ Body: WorkerSettings }>('/admin/settings', async (request, reply) => {
    try {
      const { requestIntervalMs } = request.body;

      // Validate input
      if (typeof requestIntervalMs !== 'number') {
        return reply.status(400).send({
          error: 'Invalid input',
          message: 'requestIntervalMs must be a number',
        });
      }

      if (requestIntervalMs < 0) {
        return reply.status(400).send({
          error: 'Invalid input',
          message: 'requestIntervalMs must be >= 0',
        });
      }

      if (requestIntervalMs > 60000) {
        return reply.status(400).send({
          error: 'Invalid input',
          message: 'requestIntervalMs must be <= 60000 (1 minute)',
        });
      }

      // Save to Redis
      await redis.set('request:interval:ms', requestIntervalMs.toString());

      logger.info('Settings updated', { requestIntervalMs });

      return {
        requestIntervalMs,
      };
    } catch (error) {
      logger.error('Failed to update settings', error as Error);
      throw error;
    }
  });

  /**
   * POST /admin/settings/request-interval
   * Quick endpoint to set request interval
   */
  fastify.post<{ Body: { intervalMs: number } }>('/admin/settings/request-interval', async (request, reply) => {
    try {
      const { intervalMs } = request.body;

      if (typeof intervalMs !== 'number' || intervalMs < 0 || intervalMs > 60000) {
        return reply.status(400).send({
          error: 'Invalid interval',
          message: 'intervalMs must be a number between 0 and 60000',
        });
      }

      await redis.set('request:interval:ms', intervalMs.toString());

      logger.info('Request interval updated', { intervalMs });

      return {
        success: true,
        requestIntervalMs: intervalMs,
        message: `Requests will be processed with ${intervalMs}ms interval`,
      };
    } catch (error) {
      logger.error('Failed to set request interval', error as Error);
      throw error;
    }
  });
}
