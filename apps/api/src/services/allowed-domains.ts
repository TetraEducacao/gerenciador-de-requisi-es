/**
 * Service for managing allowed domains (public/unauthenticated access)
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, Logger, ValidationError, NotFoundError } from 'request-manager-shared';

const logger = new Logger('AllowedDomainsService');

export interface AllowedDomain {
  id: string;
  domain: string;
  description?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class AllowedDomainsService {
  private supabase;

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Check if a domain is allowed (cached in memory)
   */
  private allowedDomainsCache: Map<string, boolean> = new Map();
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  async isDomainAllowed(domain: string): Promise<boolean> {
    // Check memory cache first
    if (this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.cacheTTL) {
      return this.allowedDomainsCache.get(domain) ?? false;
    }

    // Refresh cache from database
    await this.refreshCache();
    return this.allowedDomainsCache.get(domain) ?? false;
  }

  private async refreshCache(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('allowed_domains')
        .select('domain')
        .eq('enabled', true);

      if (error) {
        logger.error('Failed to refresh allowed domains cache', error);
        return;
      }

      this.allowedDomainsCache.clear();
      (data || []).forEach((row: { domain: string }) => {
        this.allowedDomainsCache.set(row.domain, true);
      });

      this.cacheTimestamp = Date.now();
      logger.debug('Allowed domains cache refreshed', { count: this.allowedDomainsCache.size });
    } catch (err) {
      logger.error('Error refreshing allowed domains cache', err as Error);
    }
  }

  /**
   * List all allowed domains
   */
  async listAllowedDomains(): Promise<AllowedDomain[]> {
    const { data, error } = await this.supabase
      .from('allowed_domains')
      .select()
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list allowed domains', error);
      throw new Error(`Failed to list allowed domains: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create a new allowed domain
   */
  async createAllowedDomain(domain: string, description?: string): Promise<AllowedDomain> {
    if (!domain || !domain.trim()) {
      throw new ValidationError('Domain is required');
    }

    const normalizedDomain = domain.toLowerCase().trim();

    const { data, error } = await this.supabase
      .from('allowed_domains')
      .insert([
        {
          domain: normalizedDomain,
          description: description || null,
          enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate')) {
        throw new ValidationError(`Domain "${domain}" is already in the whitelist`);
      }
      logger.error('Failed to create allowed domain', error);
      throw new Error(`Failed to create allowed domain: ${error.message}`);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('Allowed domain created', { domain: normalizedDomain });
    return data;
  }

  /**
   * Update an allowed domain
   */
  async updateAllowedDomain(id: string, updates: Partial<AllowedDomain>): Promise<AllowedDomain> {
    const { data, error } = await this.supabase
      .from('allowed_domains')
      .update({
        ...(updates.description !== undefined && { description: updates.description || null }),
        ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update allowed domain', error);
      throw new Error(`Failed to update allowed domain: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Domain', id);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('Allowed domain updated', { id });
    return data;
  }

  /**
   * Delete an allowed domain
   */
  async deleteAllowedDomain(id: string): Promise<void> {
    const { error } = await this.supabase.from('allowed_domains').delete().eq('id', id);

    if (error) {
      logger.error('Failed to delete allowed domain', error);
      throw new Error(`Failed to delete allowed domain: ${error.message}`);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('Allowed domain deleted', { id });
  }
}

let allowedDomainsServiceInstance: AllowedDomainsService | null = null;

export function getAllowedDomainsService(): AllowedDomainsService {
  if (!allowedDomainsServiceInstance) {
    allowedDomainsServiceInstance = new AllowedDomainsService();
  }
  return allowedDomainsServiceInstance;
}
