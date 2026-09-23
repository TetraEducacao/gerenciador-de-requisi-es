/**
 * Admin routes for dashboard and monitoring.
 * Requires authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from 'request-manager-shared';
import { getSupabaseClient } from '../lib/supabase-client.js';

const logger = new Logger('DashboardRoutes');

export async function registerDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/dashboard/metrics
   * Get dashboard metrics with optional period
   * Query: ?period=1h|today|7d|30d
   */
  fastify.get('/admin/dashboard/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { period = 'today' } = request.query as { period?: string };

      const { data, error } = await getSupabaseClient()
        .from('requests')
        .select('status')
        .gte('created_at', getPeriodStart(period));

      if (error) {
        logger.error('Failed to fetch metrics', error);
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch metrics',
          },
        });
      }

      const requests = data || [];
      const metrics = {
        received: requests.length,
        queued: requests.filter(r => r.status === 'queued').length,
        processing: requests.filter(r => r.status === 'processing').length,
        retrying: requests.filter(r => r.status === 'retrying').length,
        succeeded: requests.filter(r => r.status === 'succeeded').length,
        failed: requests.filter(r => r.status === 'failed').length,
      };

      return reply.send(metrics);
    } catch (error) {
      logger.error('Failed to get dashboard metrics', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get dashboard metrics',
        },
      });
    }
  });

  /**
   * GET /admin/dashboard/activity
   * Get recent request activity
   * Query: ?limit=10
   */
  fastify.get('/admin/dashboard/activity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = '10' } = request.query as { limit?: string };
      const pageLimit = Math.min(parseInt(limit), 100);

      const { data, error } = await getSupabaseClient()
        .from('requests')
        .select(`
          id,
          status,
          attempts,
          created_at,
          started_at,
          completed_at,
          last_http_status,
          last_error,
          duration_ms,
          source_id,
          destination_id,
          sources(name),
          destinations(name)
        `)
        .order('created_at', { ascending: false })
        .limit(pageLimit);

      if (error) {
        logger.error('Failed to fetch activity', error);
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch activity',
          },
        });
      }

      const items = (data || []).map((r: any) => ({
        id: r.id,
        source_name: r.sources?.name || 'Unknown',
        destination_name: r.destinations?.name || 'Unknown',
        status: r.status,
        http_status: r.last_http_status,
        duration_ms: r.duration_ms || 0,
        created_at: r.created_at,
      }));

      return reply.send({ items });
    } catch (error) {
      logger.error('Failed to get dashboard activity', error as Error);
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get dashboard activity',
        },
      });
    }
  });
}

function getPeriodStart(period: string): string {
  const now = new Date();
  let start: Date;

  switch (period) {
    case '1h':
      start = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      break;
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  return start.toISOString();
}
