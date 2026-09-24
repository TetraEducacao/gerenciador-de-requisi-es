/**
 * Admin routes for managing allowed domains (whitelist)
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, Logger } from 'request-manager-shared';
import { getAllowedDomainsService, AllowedDomain } from '../services/allowed-domains.js';

const logger = new Logger('AllowedDomainsRoutes');

export async function registerAllowedDomainsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/allowed-domains
   * List all allowed domains
   */
  fastify.get('/admin/allowed-domains', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const domains = await getAllowedDomainsService().listAllowedDomains();
      return reply.send({
        data: domains,
      });
    } catch (error) {
      logger.error('Failed to list allowed domains', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list allowed domains',
        },
      });
    }
  });

  /**
   * POST /admin/allowed-domains
   * Create a new allowed domain
   */
  fastify.post<{ Body: { domain: string; description?: string } }>(
    '/admin/allowed-domains',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { domain, description } = request.body;

        if (!domain) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Domain is required',
            },
          });
        }

        const allowedDomain = await getAllowedDomainsService().createAllowedDomain(domain, description);
        return reply.code(201).send({
          data: allowedDomain,
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

        logger.error('Failed to create allowed domain', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create allowed domain',
          },
        });
      }
    }
  );

  /**
   * PUT /admin/allowed-domains/:id
   * Update an allowed domain
   */
  fastify.put<{ Params: { id: string }; Body: Partial<AllowedDomain> }>(
    '/admin/allowed-domains/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const updates = request.body;

        const domain = await getAllowedDomainsService().updateAllowedDomain(id, updates);
        return reply.send({
          data: domain,
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

        logger.error('Failed to update allowed domain', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update allowed domain',
          },
        });
      }
    }
  );

  /**
   * DELETE /admin/allowed-domains/:id
   * Delete an allowed domain
   */
  fastify.delete<{ Params: { id: string } }>(
    '/admin/allowed-domains/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };

        await getAllowedDomainsService().deleteAllowedDomain(id);
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

        logger.error('Failed to delete allowed domain', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete allowed domain',
          },
        });
      }
    }
  );
}
