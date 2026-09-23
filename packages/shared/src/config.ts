/**
 * Centralized configuration for Redis, Supabase, and other services.
 * Reads from environment variables with sensible defaults.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls: boolean;
  maxRetriesPerRequest: null;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  apiPort: number;
  apiBaseUrl: string;
  internalSecret: string;
  redis: RedisConfig;
  supabase: SupabaseConfig;
}

export function getRedisConfig(): RedisConfig {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('protocol');
      return {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password ? decodeURIComponent(url.password) : undefined,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        tls: url.protocol === 'rediss:',
        maxRetriesPerRequest: null,
      };
    } catch {
      throw new Error('Invalid REDIS_URL configuration');
    }
  }

  // Fallback to individual env vars
  const password = process.env.REDIS_PASSWORD || undefined;
  const username = process.env.REDIS_USERNAME || undefined;
  const tls = (process.env.REDIS_TLS || 'false').toLowerCase() === 'true';

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password,
    username,
    tls,
    maxRetriesPerRequest: null,
  };
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing required Supabase environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
}

export function getAppConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const apiPort = parseInt(process.env.API_PORT || '3001', 10);
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  const internalSecret = process.env.INTERNAL_API_SECRET || 'dev-secret-key';

  const redis = getRedisConfig();
  const supabase = getSupabaseConfig();

  return {
    nodeEnv,
    apiPort,
    apiBaseUrl,
    internalSecret,
    redis,
    supabase,
  };
}
