/**
 * Destination service for managing webhook destinations.
 * Handles CRUD operations and validation.
 */

import { createClient } from '@supabase/supabase-js';
import {
  DestinationConfig,
  DbDestination,
  getSupabaseConfig,
  ValidationError,
  NotFoundError,
  Logger,
  validateDestinationURL,
  validateHTTPMethod,
  validateDestinationName,
  validateTimeout,
  validateConcurrency,
  validateMaxAttempts,
} from 'request-manager-shared';

const logger = new Logger('DestinationService');

export class DestinationService {
  private supabase;

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Create a new destination
   */
  async createDestination(_sourceId: string, destination: DestinationConfig): Promise<DestinationConfig> {
    // Validate required fields
    validateDestinationName(destination.name);
    validateDestinationURL(destination.url);

    if (!validateHTTPMethod(destination.http_method)) {
      throw new ValidationError(`Invalid HTTP method: ${destination.http_method}`);
    }

    // Validate optional fields
    if (destination.timeout_ms) {
      validateTimeout(destination.timeout_ms);
    }

    if (destination.concurrency_limit) {
      validateConcurrency(destination.concurrency_limit);
    }

    if (destination.max_attempts) {
      validateMaxAttempts(destination.max_attempts);
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('destinations')
      .insert([
        {
          name: destination.name,
          description: destination.description,
          url: destination.url,
          http_method: destination.http_method,
          headers: destination.headers || null,
          auth_config: destination.auth_config || null,
          timeout_ms: destination.timeout_ms || 30000,
          rate_limit_value: destination.rate_limit_value || null,
          rate_limit_unit: destination.rate_limit_unit || null,
          concurrency_limit: destination.concurrency_limit || 5,
          min_interval_ms: destination.min_interval_ms || 0,
          max_attempts: destination.max_attempts || 3,
          request_interval_ms: destination.request_interval_ms || null,
          enabled: destination.enabled !== false,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create destination', error);
      throw new Error(`Failed to create destination: ${error.message}`);
    }

    logger.info('Destination created', { destinationId: data.id, name: destination.name });

    return this.mapDbToConfig(data);
  }

  /**
   * Get a destination by ID
   */
  async getDestination(id: string): Promise<DestinationConfig | null> {
    const { data, error } = await this.supabase
      .from('destinations')
      .select()
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('Failed to get destination', error);
      throw new Error(`Failed to get destination: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return this.mapDbToConfig(data);
  }

  /**
   * Get a destination and verify it's enabled
   */
  async getActiveDestination(id: string): Promise<DestinationConfig> {
    const destination = await this.getDestination(id);

    if (!destination) {
      throw new NotFoundError('Destination', id);
    }

    if (!destination.enabled) {
      throw new ValidationError(`Destination is disabled`);
    }

    return destination;
  }

  /**
   * List all destinations
   */
  async listDestinations(): Promise<DestinationConfig[]> {
    const { data, error } = await this.supabase
      .from('destinations')
      .select()
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list destinations', error);
      throw new Error(`Failed to list destinations: ${error.message}`);
    }

    return (data || []).map((d) => this.mapDbToConfig(d));
  }

  /**
   * Update a destination
   */
  async updateDestination(id: string, updates: Partial<DestinationConfig>): Promise<DestinationConfig> {
    const existing = await this.getDestination(id);
    if (!existing) {
      throw new NotFoundError('Destination', id);
    }

    // Validate fields if provided
    if (updates.name) {
      validateDestinationName(updates.name);
    }

    if (updates.url) {
      validateDestinationURL(updates.url);
    }

    if (updates.http_method && !validateHTTPMethod(updates.http_method)) {
      throw new ValidationError(`Invalid HTTP method: ${updates.http_method}`);
    }

    if (updates.timeout_ms) {
      validateTimeout(updates.timeout_ms);
    }

    if (updates.concurrency_limit) {
      validateConcurrency(updates.concurrency_limit);
    }

    if (updates.max_attempts) {
      validateMaxAttempts(updates.max_attempts);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.url !== undefined) updateData.url = updates.url;
    if (updates.http_method !== undefined) updateData.http_method = updates.http_method;
    if (updates.headers !== undefined) updateData.headers = updates.headers;
    if (updates.auth_config !== undefined) updateData.auth_config = updates.auth_config;
    if (updates.timeout_ms !== undefined) updateData.timeout_ms = updates.timeout_ms;
    if (updates.rate_limit_value !== undefined) updateData.rate_limit_value = updates.rate_limit_value;
    if (updates.rate_limit_unit !== undefined) updateData.rate_limit_unit = updates.rate_limit_unit;
    if (updates.concurrency_limit !== undefined) updateData.concurrency_limit = updates.concurrency_limit;
    if (updates.min_interval_ms !== undefined) updateData.min_interval_ms = updates.min_interval_ms;
    if (updates.max_attempts !== undefined) updateData.max_attempts = updates.max_attempts;
    if (updates.request_interval_ms !== undefined) updateData.request_interval_ms = updates.request_interval_ms;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

    const { data, error } = await this.supabase
      .from('destinations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update destination', error);
      throw new Error(`Failed to update destination: ${error.message}`);
    }

    logger.info('Destination updated', { destinationId: id });

    return this.mapDbToConfig(data);
  }

  /**
   * Soft delete a destination (mark as disabled)
   */
  async deleteDestination(id: string): Promise<void> {
    const existing = await this.getDestination(id);
    if (!existing) {
      throw new NotFoundError('Destination', id);
    }

    const { error } = await this.supabase
      .from('destinations')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete destination', error);
      throw new Error(`Failed to delete destination: ${error.message}`);
    }

    logger.info('Destination deleted', { destinationId: id });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private mapDbToConfig(db: DbDestination): DestinationConfig {
    return {
      id: db.id,
      name: db.name,
      description: db.description,
      url: db.url,
      http_method: db.http_method as any,
      headers: db.headers,
      auth_config: db.auth_config,
      timeout_ms: db.timeout_ms,
      rate_limit_value: db.rate_limit_value,
      rate_limit_unit: db.rate_limit_unit as any,
      concurrency_limit: db.concurrency_limit,
      min_interval_ms: db.min_interval_ms,
      max_attempts: db.max_attempts,
      request_interval_ms: db.request_interval_ms,
      enabled: db.enabled,
      created_at: db.created_at,
      updated_at: db.updated_at,
    };
  }
}

let destinationServiceInstance: DestinationService | null = null;

export function getDestinationService(): DestinationService {
  if (!destinationServiceInstance) {
    destinationServiceInstance = new DestinationService();
  }
  return destinationServiceInstance;
}
