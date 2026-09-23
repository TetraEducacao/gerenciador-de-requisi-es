/**
 * Admin routes for source (reception) management.
 * Allows admins to create integration entry points for different systems.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger, getSupabaseConfig } from 'request-manager-shared';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getAuthService } from '../services/auth.js';

const logger = new Logger('SourceRoutes');

function getSupabaseClient() {
  const config = getSupabaseConfig();
  return createClient(config.url, config.serviceRoleKey);
}

export async function registerSourceRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/sources
   * List all sources (integrations)
   */
  fastify.get('/admin/sources', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const keys = await getAuthService().listApiKeys(null);

      // Map API keys to sources
      const sources = keys.map((key) => ({
        id: key.id,
        sourceId: key.sourceId,
        name: key.name,
        apiKey: undefined, // Never expose full key
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        status: key.revokedAt ? 'revoked' : 'active',
      }));

      return reply.send({
        data: sources,
      });
    } catch (error) {
      logger.error('Failed to list sources', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list sources',
        },
      });
    }
  });

  /**
   * POST /admin/sources
   * Create a new source (integration entry point)
   */
  fastify.post('/admin/sources', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name } = request.body as { name: string };

      if (!name || name.trim().length === 0) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Source name is required',
          },
        });
      }

      // Create source record first
      const sourceId = randomUUID();
      const now = new Date().toISOString();

      const { error: sourceError } = await getSupabaseClient()
        .from('sources')
        .insert([
          {
            id: sourceId,
            name,
            created_at: now,
            updated_at: now,
          },
        ]);

      if (sourceError) {
        throw new Error(`Failed to create source: ${sourceError.message}`);
      }

      // Create API key for the source
      const result = await getAuthService().generateApiKey(name, sourceId);

      return reply.code(201).send({
        data: {
          id: result.id,
          sourceId,
          name,
          key: result.key,
          createdAt: result.createdAt,
          status: 'active',
          message: 'API key created. Store it securely - it will not be shown again.',
        },
      });
    } catch (error) {
      logger.error('Failed to create source', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create source',
        },
      });
    }
  });

  /**
   * DELETE /admin/sources/:id
   * Revoke a source integration
   */
  fastify.delete('/admin/sources/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      await getAuthService().revokeApiKey(id);
      return reply.code(204).send();
    } catch (error) {
      logger.error('Failed to revoke source', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke source',
        },
      });
    }
  });
}
