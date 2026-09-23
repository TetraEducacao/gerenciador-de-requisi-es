/**
 * Authentication service for API key management.
 * Handles key generation, hashing, and validation.
 */

import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, ValidationError, AuthenticationError, Logger } from 'request-manager-shared';

const logger = new Logger('AuthService');

export class AuthService {
  private supabase;

  constructor() {
    const config = getSupabaseConfig();
    this.supabase = createClient(config.url, config.serviceRoleKey);
  }

  /**
   * Generate a new API key and return the full key (only shown once)
   */
  async generateApiKey(name: string, sourceId: string): Promise<{ id: string; key: string; createdAt: string }> {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('API key name cannot be empty');
    }

    const key = this.generateRandomKey();
    const keyHash = this.hashKey(key);

    const { data, error } = await this.supabase
      .from('api_keys')
      .insert([
        {
          name,
          key_hash: keyHash,
          source_id: sourceId,
          created_at: new Date().toISOString(),
        },
      ])
      .select('id, created_at')
      .single();

    if (error) {
      logger.error('Failed to generate API key', error);
      throw new Error(`Failed to generate API key: ${error.message}`);
    }

    logger.info('API key generated', { name, keyId: data.id });

    return {
      id: data.id,
      key,
      createdAt: data.created_at,
    };
  }

  /**
   * Validate an API key against its hash
   */
  async validateApiKey(keyString: string): Promise<{ sourceId: string; keyId: string; name: string }> {
    if (!keyString || keyString.trim().length === 0) {
      throw new AuthenticationError('API key is required');
    }

    const keyHash = this.hashKey(keyString);

    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, source_id, name, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (error) {
      logger.error('Failed to validate API key', error);
      throw new Error(`Failed to validate API key: ${error.message}`);
    }

    if (!data) {
      logger.warn('Invalid API key attempt');
      throw new AuthenticationError('Invalid API key');
    }

    if (data.revoked_at) {
      logger.warn('Revoked API key used', { keyId: data.id });
      throw new AuthenticationError('API key has been revoked');
    }

    // Update last_used_at
    await this.supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

    return {
      keyId: data.id,
      sourceId: data.source_id,
      name: data.name,
    };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string): Promise<void> {
    const { error } = await this.supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId);

    if (error) {
      logger.error('Failed to revoke API key', error);
      throw new Error(`Failed to revoke API key: ${error.message}`);
    }

    logger.info('API key revoked', { keyId });
  }

  /**
   * List API keys for a source or all keys if sourceId is null (excluding the key hash and full keys)
   */
  async listApiKeys(sourceId: string | null): Promise<
    Array<{
      id: string;
      sourceId: string;
      name: string;
      createdAt: string;
      lastUsedAt?: string;
      revokedAt?: string;
    }>
  > {
    let query = this.supabase
      .from('api_keys')
      .select('id, source_id, name, created_at, last_used_at, revoked_at');

    // Filter by sourceId if provided, otherwise get all keys
    if (sourceId) {
      query = query.eq('source_id', sourceId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list API keys', error);
      throw new Error(`Failed to list API keys: ${error.message}`);
    }

    return (data || []).map((key) => ({
      id: key.id,
      sourceId: key.source_id,
      name: key.name,
      createdAt: key.created_at,
      lastUsedAt: key.last_used_at || undefined,
      revokedAt: key.revoked_at || undefined,
    }));
  }

  /**
   * Get a specific API key (without the hash)
   */
  async getApiKey(keyId: string): Promise<{ id: string; name: string; sourceId: string; createdAt: string } | null> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, name, source_id, created_at, revoked_at')
      .eq('id', keyId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to get API key', error);
      throw new Error(`Failed to get API key: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      sourceId: data.source_id,
      createdAt: data.created_at,
    };
  }

  /**
   * Ensure a source exists, creating it if necessary
   */
  async ensureSource(sourceId: string, sourceName?: string): Promise<void> {
    const { data: existing } = await this.supabase.from('sources').select('id').eq('id', sourceId).maybeSingle();

    if (!existing) {
      const { error } = await this.supabase.from('sources').insert([
        {
          id: sourceId,
          name: sourceName || `source-${sourceId}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        logger.error('Failed to create source', error);
        throw new Error(`Failed to create source: ${error.message}`);
      }

      logger.info('Source created', { sourceId });
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateRandomKey(): string {
    return `rmgr_${randomBytes(32).toString('hex')}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
