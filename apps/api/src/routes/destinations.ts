/**
 * Admin routes for destination management.
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { DestinationConfig, AppError, Logger } from 'request-manager-shared';
import { getDestinationService } from '../services/destinations.js';

const logger = new Logger('DestinationRoutes');

export async function registerDestinationRoutes(fastify: FastifyInstance, redis?: Redis): Promise<void> {
  /**
   * GET /admin/destinations
   * List all destinations
   */
  fastify.get('/admin/destinations', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const destinations = await getDestinationService().listDestinations();
      return reply.send({
        data: destinations,
      });
    } catch (error) {
      logger.error('Failed to list destinations', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list destinations',
        },
      });
    }
  });

  /**
   * GET /admin/destinations/:id
   * Get a specific destination
   */
  fastify.get('/admin/destinations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const destination = await getDestinationService().getDestination(id);

      if (!destination) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND_ERROR',
            message: `Destination with ID ${id} not found`,
          },
        });
      }

      return reply.send({
        data: destination,
      });
    } catch (error) {
      logger.error('Failed to get destination', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get destination',
        },
      });
    }
  });

  /**
   * POST /admin/destinations
   * Create a new destination
   */
  fastify.post('/admin/destinations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = request.body as Partial<DestinationConfig>;

      logger.debug('Creating destination', { payload });
      const destination = await getDestinationService().createDestination('admin', payload as DestinationConfig);

      // Sync interval to Redis if configured
      if (redis && destination.id && destination.request_interval_ms && destination.request_interval_ms > 0) {
        const redisKey = `destination:${destination.id}:interval:ms`;
        await redis.set(redisKey, destination.request_interval_ms.toString());
        logger.debug('Synced destination interval to Redis', { destinationId: destination.id, interval: destination.request_interval_ms });
      }

      return reply.code(201).send({
        data: destination,
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn(`Validation error creating destination: ${error.code}`, { message: error.message });
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      logger.error('Failed to create destination', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create destination',
        },
      });
    }
  });

  /**
   * PUT /admin/destinations/:id
   * Update a destination
   */
  fastify.put('/admin/destinations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const updates = request.body as Partial<DestinationConfig>;

      const destination = await getDestinationService().updateDestination(id, updates);

      // Sync interval to Redis if configured
      if (redis) {
        const redisKey = `destination:${id}:interval:ms`;
        if (destination.request_interval_ms && destination.request_interval_ms > 0) {
          await redis.set(redisKey, destination.request_interval_ms.toString());
          logger.debug('Synced destination interval to Redis', { destinationId: id, interval: destination.request_interval_ms });
        } else {
          // Clear from Redis if interval is 0 or undefined
          await redis.del(redisKey);
          logger.debug('Cleared destination interval from Redis', { destinationId: id });
        }
      }

      return reply.send({
        data: destination,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      logger.error('Failed to update destination', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update destination',
        },
      });
    }
  });

  /**
   * DELETE /admin/destinations/:id
   * Delete a destination (soft delete)
   */
  fastify.delete('/admin/destinations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      await getDestinationService().deleteDestination(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      logger.error('Failed to delete destination', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete destination',
        },
      });
    }
  });
}
