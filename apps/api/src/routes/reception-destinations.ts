/**
 * Routes for linking receptions to destinations.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from 'request-manager-shared';
import { getReceptionDestinationService } from '../services/reception-destinations.js';
import { getDestinationService } from '../services/destinations.js';

const logger = new Logger('ReceptionDestinationRoutes');

export async function registerReceptionDestinationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/reception-destinations
   * List all reception-destination mappings with details
   */
  fastify.get('/admin/reception-destinations', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const mappings = await getReceptionDestinationService().listMappings();

      // Enrich with source and destination names
      const enriched = await Promise.all(
        mappings.map(async (mapping) => {
          let sourceName = 'Unknown';
          let destinationName = 'Unknown';

          try {
            const name = await getReceptionDestinationService().getSourceName(mapping.sourceId);
            if (name) {
              sourceName = name;
            }
          } catch {
            // Source might not be found, keep as Unknown
          }

          try {
            const destination = await getDestinationService().getDestination(mapping.destinationId);
            if (destination?.name) {
              destinationName = destination.name;
            }
          } catch {
            // Destination might not be found, keep as Unknown
          }

          return {
            id: mapping.id,
            sourceId: mapping.sourceId,
            sourceName,
            destinationId: mapping.destinationId,
            destinationName,
            createdAt: mapping.createdAt,
          };
        })
      );

      return reply.send({
        data: enriched,
      });
    } catch (error) {
      logger.error('Failed to list reception-destination mappings', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list mappings',
        },
      });
    }
  });

  /**
   * POST /admin/reception-destinations
   * Link a reception to a destination
   */
  fastify.post(
    '/admin/reception-destinations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sourceId, destinationId } = request.body as {
          sourceId: string;
          destinationId: string;
        };

        if (!sourceId || !destinationId) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'sourceId and destinationId are required',
            },
          });
        }

        await getReceptionDestinationService().linkReceptionToDestination(
          sourceId,
          destinationId
        );

        return reply.code(201).send({
          data: {
            sourceId,
            destinationId,
            message: 'Reception linked to destination',
          },
        });
      } catch (error) {
        logger.error('Failed to create mapping', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create mapping',
          },
        });
      }
    }
  );

  /**
   * DELETE /admin/reception-destinations/:sourceId
   * Remove a reception-destination link
   */
  fastify.delete(
    '/admin/reception-destinations/:sourceId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sourceId } = request.params as { sourceId: string };

        await getReceptionDestinationService().removeMapping(sourceId);

        return reply.code(204).send();
      } catch (error) {
        logger.error('Failed to remove mapping', error as Error);
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove mapping',
          },
        });
      }
    }
  );
}
