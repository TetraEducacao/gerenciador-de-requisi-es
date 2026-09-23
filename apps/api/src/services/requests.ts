/**
 * Request service for managing request lifecycle.
 * Handles persistence and enqueueing.
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  DbRequest,
  getSupabaseConfig,
  ValidationError,
  Logger,
  QueueJob,
  validatePayloadSize,
  isValidUUID,
} from 'request-manager-shared';
import { getQueueService } from './queue.js';
import { getDestinationService } from './destinations.js';

const logger = new Logger('RequestService');

export class RequestService {
  private supabase;

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Create and enqueue a request
   * Returns 202 only after both persistence AND enqueueing succeed
   */
  async createAndEnqueueRequest(
    sourceId: string,
    destinationId: string,
    payload?: unknown,
    headers?: Record<string, string>,
    method?: string,
    contentType?: string,
    idempotencyKey?: string
  ): Promise<{
    requestId: string;
    status: string;
    createdAt: string;
  }> {
    // Validate destination exists and is active
    const destination = await getDestinationService().getActiveDestination(destinationId);

    // Validate payload size
    if (payload) {
      validatePayloadSize(payload);
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await this.getRequestByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info('Idempotent request already exists', {
          idempotencyKey,
          requestId: existing.id,
        });
        return {
          requestId: existing.id,
          status: existing.status,
          createdAt: existing.created_at,
        };
      }
    }

    const requestId = uuidv4();
    const now = new Date().toISOString();

    // Step 1: Persist to database first
    const { error: dbError } = await this.supabase.from('requests').insert([
      {
        id: requestId,
        source_id: sourceId,
        destination_id: destinationId,
        idempotency_key: idempotencyKey || null,
        payload,
        content_type: contentType || 'application/json',
        status: 'queued',
        attempts: 0,
        created_at: now,
      },
    ]);

    if (dbError) {
      logger.error('Failed to persist request', dbError);
      throw new Error(`Failed to persist request: ${dbError.message}`);
    }

    logger.info('Request persisted', {
      requestId,
      sourceId,
      destinationId,
      idempotencyKey,
    });

    // Step 2: Enqueue to Redis
    try {
      const queueJob: QueueJob = {
        requestId,
        sourceId,
        destinationId,
        payload,
        headers,
        method: (method as any) || destination.http_method,
        contentType: contentType || 'application/json',
      };

      await getQueueService().enqueueRequest(queueJob);

      logger.info('Request enqueued successfully', { requestId });

      return {
        requestId,
        status: 'queued',
        createdAt: now,
      };
    } catch (queueError) {
      // If enqueueing fails, mark the request as failed but don't lose the record
      logger.error('Failed to enqueue request, marking as failed', queueError as Error, {
        requestId,
      });

      await this.supabase
        .from('requests')
        .update({
          status: 'failed',
          last_error: 'Failed to enqueue: ' + (queueError instanceof Error ? queueError.message : String(queueError)),
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      throw new Error(`Failed to enqueue request: ${queueError instanceof Error ? queueError.message : String(queueError)}`);
    }
  }

  /**
   * Get request by ID
   */
  async getRequest(requestId: string): Promise<DbRequest | null> {
    if (!isValidUUID(requestId)) {
      throw new ValidationError('Invalid request ID format');
    }

    const { data, error } = await this.supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to get request', error);
      throw new Error(`Failed to get request: ${error.message}`);
    }

    return data;
  }

  /**
   * Get request by idempotency key
   */
  async getRequestByIdempotencyKey(key: string): Promise<DbRequest | null> {
    const { data, error } = await this.supabase
      .from('requests')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      logger.error('Failed to get request by idempotency key', error);
      throw new Error(`Failed to get request: ${error.message}`);
    }

    return data;
  }

  /**
   * Update request status
   */
  async updateRequestStatus(requestId: string, status: string, httpStatus?: number, error?: string): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (httpStatus !== undefined) {
      updates.last_http_status = httpStatus;
    }

    if (error) {
      updates.last_error = error;
    }

    if (['succeeded', 'failed', 'cancelled'].includes(status)) {
      updates.completed_at = new Date().toISOString();
    }

    const { error: dbError } = await this.supabase.from('requests').update(updates).eq('id', requestId);

    if (dbError) {
      logger.error('Failed to update request status', dbError, { requestId });
      throw new Error(`Failed to update request: ${dbError.message}`);
    }
  }

  /**
   * Record an attempt
   */
  async recordAttempt(
    requestId: string,
    attemptNumber: number,
    httpStatus?: number,
    durationMs?: number,
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.supabase.from('request_attempts').insert([
      {
        request_id: requestId,
        attempt_number: attemptNumber,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        http_status: httpStatus || null,
        duration_ms: durationMs || null,
        error_message: errorMessage || null,
      },
    ]);

    if (error) {
      logger.error('Failed to record attempt', error, { requestId, attemptNumber });
      throw new Error(`Failed to record attempt: ${error.message}`);
    }
  }

  /**
   * Increment attempt counter
   */
  async incrementAttempts(requestId: string): Promise<number> {
    // Get current attempts
    const { data: current, error: getError } = await this.supabase
      .from('requests')
      .select('attempts')
      .eq('id', requestId)
      .single();

    if (getError) {
      logger.error('Failed to get current attempts', getError, { requestId });
      throw new Error(`Failed to get current attempts: ${getError.message}`);
    }

    const newAttempts = (current?.attempts || 0) + 1;

    // Update attempts
    const { error: updateError } = await this.supabase
      .from('requests')
      .update({ attempts: newAttempts })
      .eq('id', requestId);

    if (updateError) {
      logger.error('Failed to increment attempts', updateError, { requestId });
      throw new Error(`Failed to increment attempts: ${updateError.message}`);
    }

    return newAttempts;
  }
}

let requestServiceInstance: RequestService | null = null;

export function getRequestService(): RequestService {
  if (!requestServiceInstance) {
    requestServiceInstance = new RequestService();
  }
  return requestServiceInstance;
}
