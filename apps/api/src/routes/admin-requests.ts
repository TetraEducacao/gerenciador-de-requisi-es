/**
 * Admin routes for request management and monitoring.
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from 'request-manager-shared';
import { getSupabaseClient } from '../lib/supabase-client.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const logger = new Logger('AdminRequestRoutes');

let redis: Redis | null = null;
let requestQueue: Queue | null = null;

async function initializeQueue() {
  try {
    const { getRedisConfig } = await import('request-manager-shared');
    const redisConfig = getRedisConfig();

    redis = new Redis({
      ...redisConfig,
      tls: redisConfig.tls ? {} : undefined,
      connectTimeout: 5000,
      maxRetriesPerRequest: null,
    });

    let lastWarning = 0;
    redis.on('error', (err) => {
      if (Date.now() - lastWarning > 30000) {
        logger.warn('Redis connection error (retry jobs will not be processed)', { message: err.message });
        lastWarning = Date.now();
      }
    });

    requestQueue = new Queue('requests', { connection: redis });
    requestQueue.on('error', (error) => {
      logger.warn('Retry queue error', { message: error.message });
    });
  } catch (error) {
    logger.warn('Failed to initialize Redis queue. Retry functionality will be limited.', { message: String(error) });
    redis = null;
    requestQueue = null;
  }
}

export async function registerAdminRequestRoutes(fastify: FastifyInstance): Promise<void> {
  await initializeQueue();
  /**
   * GET /admin/requests
   * List all requests with pagination and filters
   * Query: ?page=1&limit=25&status=succeeded&source_id=&destination_id=
   */
  fastify.get('/admin/requests', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = '1', limit = '25', status, source_id, destination_id } = request.query as {
        page?: string;
        limit?: string;
        status?: string;
        source_id?: string;
        destination_id?: string;
      };

      const pageNum = Math.max(1, parseInt(page));
      const pageLimit = Math.min(parseInt(limit), 100);
      const offset = (pageNum - 1) * pageLimit;

      let query = getSupabaseClient().from('requests').select('*', { count: 'exact' });

      if (status) query = query.eq('status', status);
      if (source_id) query = query.eq('source_id', source_id);
      if (destination_id) query = query.eq('destination_id', destination_id);

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageLimit - 1);

      if (error) {
        logger.error('Failed to list requests', error);
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to list requests',
          },
        });
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / pageLimit);

      return reply.send({
        data: (data || []).map((r: any) => ({
          id: r.id,
          source_id: r.source_id,
          source_name: r.source_name,
          destination_id: r.destination_id,
          destination_name: r.destination_name,
          status: r.status,
          attempts: r.attempts,
          created_at: r.created_at,
          started_at: r.started_at,
          completed_at: r.completed_at,
          last_http_status: r.last_http_status,
          last_error: r.last_error,
          duration_ms: r.duration_ms,
        })),
        page: pageNum,
        limit: pageLimit,
        total,
        totalPages,
      });
    } catch (error) {
      logger.error('Failed to get admin requests list', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get requests list',
        },
      });
    }
  });

  /**
   * GET /admin/requests/:id
   * Get request details for administration
   */
  fastify.get('/admin/requests/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const { data, error } = await getSupabaseClient()
        .from('requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND_ERROR',
            message: `Request with ID ${id} not found`,
          },
        });
      }

      // Fetch attempts
      const { data: attempts, error: attemptsError } = await getSupabaseClient()
        .from('request_attempts')
        .select('*')
        .eq('request_id', id)
        .order('attempt_number', { ascending: true });

      if (attemptsError) {
        logger.warn('Failed to fetch attempts', { message: attemptsError.message });
      }

      return reply.send({
        data: {
          id: data.id,
          source_id: data.source_id,
          source_name: data.source_name,
          destination_id: data.destination_id,
          destination_name: data.destination_name,
          status: data.status,
          attempts: data.attempts,
          created_at: data.created_at,
          started_at: data.started_at,
          completed_at: data.completed_at,
          last_http_status: data.last_http_status,
          last_error: data.last_error,
          duration_ms: data.duration_ms,
          payload: data.payload,
          attempts_list: (attempts || []).map((a: any) => ({
            attempt_number: a.attempt_number,
            started_at: a.started_at,
            completed_at: a.completed_at,
            http_status: a.http_status,
            duration_ms: a.duration_ms,
            error_message: a.error_message,
          })),
        },
      });
    } catch (error) {
      logger.error('Failed to get admin request detail', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get request details',
        },
      });
    }
  });

  /**
   * POST /admin/requests/:id/retry
   * Retry a failed request
   */
  fastify.post('/admin/requests/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Get request
      const { data: requestData, error: fetchError } = await getSupabaseClient()
        .from('requests')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !requestData) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND_ERROR',
            message: `Request with ID ${id} not found`,
          },
        });
      }

      // Prevent retry if still processing
      if (requestData.status === 'processing') {
        return reply.code(409).send({
          error: {
            code: 'CONFLICT_ERROR',
            message: 'Cannot retry a request that is currently processing',
          },
        });
      }

      // Update request status to queued
      const { error: updateError } = await getSupabaseClient()
        .from('requests')
        .update({ status: 'queued', attempts: (requestData.attempts || 0) + 1 })
        .eq('id', id);

      if (updateError) {
        logger.error('Failed to update request status', updateError);
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to retry request',
          },
        });
      }

      // Re-enqueue in BullMQ
      if (requestQueue) {
        try {
          await requestQueue.add(
            'process',
            {
              requestId: id,
              destinationId: requestData.destination_id,
            },
            {
              jobId: id,
              attempts: 1,
              removeOnComplete: true,
              removeOnFail: false,
            }
          );
        } catch (queueError) {
          logger.warn('Failed to re-enqueue job, but request was updated', { message: String(queueError) });
        }
      } else {
        logger.warn('Redis queue not available. Request marked as queued but may not be processed automatically.');
      }

      return reply.send({
        data: {
          id,
          status: 'queued',
          message: 'Request re-queued for processing',
        },
      });
    } catch (error) {
      logger.error('Failed to retry request', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry request',
        },
      });
    }
  });
}
