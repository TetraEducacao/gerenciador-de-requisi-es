/**
 * Public API routes for request management.
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, CreateRequestPayload, Logger } from 'request-manager-shared';
import { getRequestService } from '../services/requests.js';
import { getReceptionDestinationService } from '../services/reception-destinations.js';

const logger = new Logger('RequestRoutes');

export async function registerRequestRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /v1/requests/:sourceId
   * Submit a request for processing (source-specific endpoint)
   * Returns 202 Accepted
   */
  fastify.post('/v1/requests/:sourceId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sourceId } = request.params as { sourceId: string };
      // Reception webhooks accept a raw JSON body as well as the existing envelope.
      // Only interpret routing options when an explicit payload envelope is present.
      const body = request.body;
      const isEnvelope = body !== null && typeof body === 'object' &&
        !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, 'payload');
      const options = isEnvelope ? body as CreateRequestPayload : undefined;
      const payload = isEnvelope ? options!.payload : body;

      // Get destination from reception-destination mapping
      let destinationId: string | null | undefined = options?.destination_id;

      if (!destinationId) {
        destinationId = await getReceptionDestinationService().getDestinationForReception(sourceId);

        if (!destinationId) {
          return reply.code(400).send({
            error: {
              code: 'MISSING_DESTINATION',
              message: 'No destination configured for this reception. Configure one in the admin panel.',
            },
          });
        }
      }

      const result = await getRequestService().createAndEnqueueRequest(
        sourceId,
        destinationId,
        payload,
        options?.headers,
        options?.method,
        options?.content_type ?? request.headers['content-type'],
        options?.idempotency_key
      );

      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      logger.error('Failed to create request', error as Error, {
        sourceId: (request.params as any).sourceId,
      });

      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create request',
        },
      });
    }
  });

  /**
   * POST /v1/requests (Legacy - without sourceId in URL, uses API key)
   * Submit a request for processing
   * Returns 202 Accepted
   */
  fastify.post('/v1/requests', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sourceId = (request as any).sourceId as string;
      const payload = request.body as CreateRequestPayload;

      const result = await getRequestService().createAndEnqueueRequest(
        sourceId,
        payload.destination_id,
        payload.payload,
        payload.headers,
        payload.method,
        payload.content_type,
        payload.idempotency_key
      );

      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      logger.error('Failed to create request', error as Error, {
        sourceId: (request as any).sourceId,
      });

      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create request',
        },
      });
    }
  });

  /**
   * GET /v1/requests/:id
   * Get request status
   */
  fastify.get('/v1/requests/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sourceId = (request as any).sourceId as string;
      const { id } = request.params as { id: string };

      const requestRecord = await getRequestService().getRequest(id);

      if (!requestRecord) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND_ERROR',
            message: `Request with ID ${id} not found`,
          },
        });
      }

      // Verify ownership (basic authorization)
      if (requestRecord.source_id && requestRecord.source_id !== sourceId) {
        logger.warn('Unauthorized request access attempt', {
          sourceId,
          targetSourceId: requestRecord.source_id,
          requestId: id,
        });

        return reply.code(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to access this request',
          },
        });
      }

      return reply.send({
        data: {
          id: requestRecord.id,
          status: requestRecord.status,
          destinationId: requestRecord.destination_id,
          attempts: requestRecord.attempts,
          createdAt: requestRecord.created_at,
          startedAt: requestRecord.started_at,
          completedAt: requestRecord.completed_at,
          lastHttpStatus: requestRecord.last_http_status,
          lastError: requestRecord.last_error,
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

      logger.error('Failed to get request', error as Error);

      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get request',
        },
      });
    }
  });
}
