/**
 * Admin routes for managing external third-party tokens
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, Logger } from 'request-manager-shared';
import { getExternalTokensService, ExternalToken, ExternalTokensService } from '../services/external-tokens.js';

const logger = new Logger('ExternalTokensRoutes');

export async function registerExternalTokensRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/external-tokens
   * List all external tokens (without exposing full token values)
   */
  fastify.get('/admin/external-tokens', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tokens = await getExternalTokensService().listExternalTokens();
      return reply.send({
        data: tokens,
      });
    } catch (error) {
      logger.error('Failed to list external tokens', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list external tokens',
        },
      });
    }
  });

  /**
   * POST /admin/external-tokens
   * Create a new external token
   */
  fastify.post<{ Body: { name: string; description?: string } }>(
    '/admin/external-tokens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { name, description } = request.body as { name: string; description?: string };

        if (!name) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Name is required',
            },
          });
        }

        const token = await getExternalTokensService().createExternalToken(name, description);
        return reply.code(201).send({
          data: token,
        });
      } catch (error) {
        if (error instanceof AppError) {
          logger.warn(`Validation error: ${error.code}`, { message: error.message });
          return reply.code(error.statusCode).send({
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        logger.error('Failed to create external token', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create external token',
          },
        });
      }
    }
  );

  /**
   * PUT /admin/external-tokens/:id
   * Update an external token
   */
  fastify.put<{ Params: { id: string }; Body: Partial<ExternalToken> }>(
    '/admin/external-tokens/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const updates = request.body as Partial<ExternalToken>;

        const token = await getExternalTokensService().updateExternalToken(id, updates);
        return reply.send({
          data: token,
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

        logger.error('Failed to update external token', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update external token',
          },
        });
      }
    }
  );

  /**
   * POST /admin/external-tokens/:id/regenerate
   * Regenerate token
   */
  fastify.post<{ Params: { id: string } }>(
    '/admin/external-tokens/:id/regenerate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };

        const token = await getExternalTokensService().regenerateToken(id);
        return reply.send({
          data: token,
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

        logger.error('Failed to regenerate token', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to regenerate token',
          },
        });
      }
    }
  );

  /**
   * DELETE /admin/external-tokens/:id
   * Delete an external token
   */
  fastify.delete<{ Params: { id: string } }>(
    '/admin/external-tokens/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };

        await getExternalTokensService().deleteExternalToken(id);
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

        logger.error('Failed to delete external token', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete external token',
          },
        });
      }
    }
  );
}
