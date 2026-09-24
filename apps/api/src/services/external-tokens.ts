/**
 * Service for managing external third-party tokens
 * Used to authorize requests from Guru, n8n, Zapier, etc.
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, Logger, ValidationError, NotFoundError } from 'request-manager-shared';
import crypto from 'crypto';

const logger = new Logger('ExternalTokensService');

export interface ExternalToken {
  id: string;
  name: string;
  token: string;
  description?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class ExternalTokensService {
  private supabase;
  private tokenCache: Map<string, boolean> = new Map();
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Generate a random token
   */
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate if a token is authorized
   */
  async isTokenValid(token: string): Promise<boolean> {
    // Check memory cache first
    if (this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.cacheTTL) {
      return this.tokenCache.get(token) ?? false;
    }

    // Refresh cache from database
    await this.refreshCache();
    return this.tokenCache.get(token) ?? false;
  }

  /**
   * Refresh token cache from database
   */
  private async refreshCache(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('external_tokens')
        .select('token')
        .eq('enabled', true);

      if (error) {
        logger.error('Failed to refresh external tokens cache', error);
        return;
      }

      this.tokenCache.clear();
      (data || []).forEach((row: { token: string }) => {
        this.tokenCache.set(row.token, true);
      });

      this.cacheTimestamp = Date.now();
      logger.debug('External tokens cache refreshed', { count: this.tokenCache.size });
    } catch (err) {
      logger.error('Error refreshing external tokens cache', err as Error);
    }
  }

  /**
   * List all external tokens (without exposing full tokens)
   */
  async listExternalTokens(): Promise<Partial<ExternalToken>[]> {
    const { data, error } = await this.supabase
      .from('external_tokens')
      .select('id, name, description, enabled, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list external tokens', error);
      throw new Error(`Failed to list external tokens: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create a new external token
   */
  async createExternalToken(name: string, description?: string): Promise<ExternalToken> {
    if (!name || !name.trim()) {
      throw new ValidationError('Name is required');
    }

    const token = ExternalTokensService.generateToken();
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('external_tokens')
      .insert([
        {
          name: name.trim(),
          token,
          description: description || null,
          enabled: true,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create external token', error);
      throw new Error(`Failed to create external token: ${error.message}`);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('External token created', { name });
    return data;
  }

  /**
   * Update an external token
   */
  async updateExternalToken(id: string, updates: Partial<ExternalToken>): Promise<ExternalToken> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

    const { data, error } = await this.supabase
      .from('external_tokens')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update external token', error);
      throw new Error(`Failed to update external token: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Token', id);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('External token updated', { id });
    return data;
  }

  /**
   * Delete an external token
   */
  async deleteExternalToken(id: string): Promise<void> {
    const { error } = await this.supabase.from('external_tokens').delete().eq('id', id);

    if (error) {
      logger.error('Failed to delete external token', error);
      throw new Error(`Failed to delete external token: ${error.message}`);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('External token deleted', { id });
  }

  /**
   * Regenerate token for an existing entry
   */
  async regenerateToken(id: string): Promise<ExternalToken> {
    const newToken = ExternalTokensService.generateToken();

    const { data, error } = await this.supabase
      .from('external_tokens')
      .update({
        token: newToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to regenerate token', error);
      throw new Error(`Failed to regenerate token: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Token', id);
    }

    // Invalidate cache
    this.cacheTimestamp = 0;

    logger.info('Token regenerated', { id });
    return data;
  }
}

let externalTokensServiceInstance: ExternalTokensService | null = null;

export function getExternalTokensService(): ExternalTokensService {
  if (!externalTokensServiceInstance) {
    externalTokensServiceInstance = new ExternalTokensService();
  }
  return externalTokensServiceInstance;
}
