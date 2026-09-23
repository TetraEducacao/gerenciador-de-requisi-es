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
   * Link a reception to a destination
   */
  async linkReceptionToDestination(sourceId: string, destinationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reception_destinations')
      .upsert(
        {
          source_id: sourceId,
          destination_id: destinationId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_id' }
      );

    if (error) {
      logger.error('Failed to link reception to destination', error);
      throw new Error(`Failed to link reception: ${error.message}`);
    }

    logger.info('Reception linked to destination', { sourceId, destinationId });
  }

  /**
   * Get destination for a reception
   */
  async getDestinationForReception(sourceId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('reception_destinations')
      .select('destination_id')
      .eq('source_id', sourceId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to get destination for reception', error);
      throw new Error(`Failed to get destination: ${error.message}`);
    }

    return data?.destination_id || null;
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
   * Remove a reception-destination link
   */
  async removeMapping(sourceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reception_destinations')
      .delete()
      .eq('source_id', sourceId);

    if (error) {
      logger.error('Failed to remove mapping', error);
      throw new Error(`Failed to remove mapping: ${error.message}`);
    }

    logger.info('Reception-destination link removed', { sourceId });
  }
}

let instance: ReceptionDestinationService | null = null;

export function getReceptionDestinationService(): ReceptionDestinationService {
  if (!instance) {
    instance = new ReceptionDestinationService();
  }
  return instance;
}
