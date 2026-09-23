/**
 * Routes for API key management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, Logger, ValidationError } from 'request-manager-shared';
import { getReceptionDestinationService } from '../services/reception-destinations.js';
import { getAuthService } from '../services/auth.js';

const logger = new Logger('ApiKeyRoutes');

export async function registerApiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/api-keys
   * List all API keys for the authenticated source
   */
  fastify.get('/admin/api-keys', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // For admin routes, list all API keys (sourceId = null for global)
      const keys = await getAuthService().listApiKeys(null);

      return reply.send({
        data: keys,
      });
    } catch (error) {
      logger.error('Failed to list API keys', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list API keys',
        },
      });
    }
  });

  /**
   * POST /admin/api-keys
   * Create a new API key
   */
  fastify.post('/admin/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).userId as string;
      const { name, sourceId: requestedSourceId } = (request.body || {}) as { name: string; sourceId?: string };
      if (typeof name !== 'string' || !name.trim()) throw new ValidationError('Informe o nome da chave.');
      const sourceId = requestedSourceId ?? userId;
      if (typeof sourceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
        throw new ValidationError('Informe um ID de recepção válido.');
      }

      // Use userId as sourceId for admin-created keys
      if (requestedSourceId !== undefined) {
        if (await getReceptionDestinationService().getSourceName(sourceId) === null) {
          throw new ValidationError('Recepção não encontrada.');
        }
      } else {
        await getAuthService().ensureSource(userId, `Admin ${userId}`);
      }

      const result = await getAuthService().generateApiKey(name, sourceId);

      return reply.code(201).send({
        data: {
          id: result.id,
          name,
          key: result.key,
          sourceId,
          createdAt: result.createdAt,
        },
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

      logger.error('Failed to create API key', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create API key',
        },
      });
    }
  });

  /**
   * DELETE /admin/api-keys/:id
   * Revoke an API key
   */
  fastify.delete('/admin/api-keys/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Verify the key exists
      const key = await getAuthService().getApiKey(id);
      if (!key) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND_ERROR',
            message: `API key with ID ${id} not found`,
          },
        });
      }

      await getAuthService().revokeApiKey(id);
      return reply.code(204).send();
    } catch (error) {
      logger.error('Failed to revoke API key', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke API key',
        },
      });
    }
  });
}
