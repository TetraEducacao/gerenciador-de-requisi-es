/**
 * Service for managing reception-to-destination mappings.
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, Logger } from 'request-manager-shared';

const logger = new Logger('ReceptionDestinationService');

export class ReceptionDestinationService {
  private supabase;

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Look up the reception by its source ID, not an API key ID.
   */
  async getSourceName(sourceId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('sources')
      .select('name')
      .eq('id', sourceId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get reception: ${error.message}`);
    return data?.name ?? null;
  }

  /**
   * Link a reception to a destination (allows multiple destinations per reception)
   */
  async linkReceptionToDestination(sourceId: string, destinationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reception_destinations')
      .insert({
        source_id: sourceId,
        destination_id: destinationId,
      });

    if (error) {
      // If duplicate, it's okay - just means it's already linked
      if (error.code === '23505') {
        logger.debug('Reception-destination link already exists', { sourceId, destinationId });
        return;
      }
      logger.error('Failed to link reception to destination', error);
      throw new Error(`Failed to link reception: ${error.message}`);
    }

    logger.info('Reception linked to destination', { sourceId, destinationId });
  }

  /**
   * Get all destinations for a reception with their filter rules
   */
  async getDestinationsForReception(sourceId: string): Promise<
    Array<{
      destination_id: string;
      filter_rules?: Record<string, unknown>;
    }>
  > {
    const { data, error } = await this.supabase
      .from('reception_destinations')
      .select('destination_id, filter_rules')
      .eq('source_id', sourceId);

    if (error) {
      logger.error('Failed to get destinations for reception', error);
      throw new Error(`Failed to get destinations: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      destination_id: row.destination_id,
      filter_rules: row.filter_rules,
    }));
  }

  /**
   * Get first destination for a reception (for backward compatibility)
   */
  async getDestinationForReception(sourceId: string): Promise<string | null> {
    const destinations = await this.getDestinationsForReception(sourceId);
    return destinations.length > 0 ? destinations[0] : null;
  }

  /**
   * List all reception-destination mappings
   */
  async listMappings(): Promise<
    Array<{
      id: string;
      sourceId: string;
      destinationId: string;
      createdAt: string;
    }>
  > {
    const { data, error } = await this.supabase
      .from('reception_destinations')
      .select('id, source_id, destination_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list mappings', error);
      throw new Error(`Failed to list mappings: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      destinationId: row.destination_id,
      createdAt: row.created_at,
    }));
  }

  /**
   * Remove a specific reception-destination link
   */
  async removeMapping(sourceId: string, destinationId?: string): Promise<void> {
    let query = this.supabase
      .from('reception_destinations')
      .delete()
      .eq('source_id', sourceId);

    if (destinationId) {
      query = query.eq('destination_id', destinationId);
    }

    const { error } = await query;

    if (error) {
      logger.error('Failed to remove mapping', error);
      throw new Error(`Failed to remove mapping: ${error.message}`);
    }

    logger.info('Reception-destination link removed', { sourceId, destinationId });
  }

  /**
   * Update filter rules for a reception-destination mapping
   */
  async updateFilterRules(sourceId: string, destinationId: string, filterRules: Record<string, unknown> | null): Promise<void> {
    const { error } = await this.supabase
      .from('reception_destinations')
      .update({
        filter_rules: filterRules,
        updated_at: new Date().toISOString(),
      })
      .eq('source_id', sourceId)
      .eq('destination_id', destinationId);

    if (error) {
      logger.error('Failed to update filter rules', error);
      throw new Error(`Failed to update filter rules: ${error.message}`);
    }

    logger.info('Filter rules updated', { sourceId, destinationId });
  }
}

let instance: ReceptionDestinationService | null = null;

export function getReceptionDestinationService(): ReceptionDestinationService {
  if (!instance) {
    instance = new ReceptionDestinationService();
  }
  return instance;
}
