import './env.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Redis from 'ioredis';
import { getAppConfig, AppError, Logger, AuthenticationError, getRedisConfig } from 'request-manager-shared';
import { registerAuthHook, registerBodyTokenAuthHook } from './middleware/auth.js';
import { registerJWTAuthHook } from './middleware/jwt-auth.js';
import { registerDestinationRoutes } from './routes/destinations.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerSourceRoutes } from './routes/sources.js';
import { registerReceptionDestinationRoutes } from './routes/reception-destinations.js';
import { registerRequestRoutes } from './routes/requests.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAdminRequestRoutes } from './routes/admin-requests.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerAllowedDomainsRoutes } from './routes/allowed-domains.js';
import { registerExternalTokensRoutes } from './routes/external-tokens.js';

const config = getAppConfig();
const logger = new Logger('API');

// Redis connection for shared state (settings, etc.)
const redisConfig = getRedisConfig();
const redis = new Redis({
  ...redisConfig,
  tls: redisConfig.tls ? {} : undefined,
});

const fastify = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

fastify.register(helmet);
fastify.register(cors, {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : config.nodeEnv !== 'production',
});

// ============================================================================
// Error Handler
// ============================================================================

fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    logger.warn(`${error.code}: ${error.message}`, { url: request.url });
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error instanceof AuthenticationError) {
    return reply.code(401).send({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: error.message,
      },
    });
  }

  logger.error(`Unhandled error: ${error.message}`, error);
  return reply.code(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
});

// ============================================================================
// Health Check (No Auth Required)
// ============================================================================

fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'request-manager-api',
  };
});

// ============================================================================
// Register Authentication Hooks
// ============================================================================

// Admin routes use JWT (Supabase Auth)
registerJWTAuthHook(fastify, '/admin/');

// Public API routes use API Keys
registerAuthHook(fastify, '/v1/requests');

// Webhook routes validate api_token field from request body
registerBodyTokenAuthHook(fastify, '/v1/requests');

// ============================================================================
// Admin Routes (Authenticated)
// ============================================================================

fastify.register(async (fastify) => {
  await registerSettingsRoutes(fastify, redis);
  await registerAllowedDomainsRoutes(fastify);
  await registerExternalTokensRoutes(fastify);
  await registerDestinationRoutes(fastify, redis);
  await registerApiKeyRoutes(fastify);
  await registerSourceRoutes(fastify);
  await registerReceptionDestinationRoutes(fastify);
  await registerDashboardRoutes(fastify);
  await registerAdminRequestRoutes(fastify);
  await registerHealthRoutes(fastify);
});

// ============================================================================
// Public API Routes (Authenticated)
// ============================================================================

fastify.register(async (fastify) => {
  await registerRequestRoutes(fastify);
});

// ============================================================================
// Startup
// ============================================================================

const start = async (): Promise<void> => {
  try {
    await fastify.listen({ port: config.apiPort, host: '0.0.0.0' });
    logger.info(`✓ API server running`, {
      port: config.apiPort,
      environment: config.nodeEnv,
      url: `http://0.0.0.0:${config.apiPort}`,
    });
  } catch (err) {
    logger.error('Failed to start API server', err as Error);
    process.exit(1);
  }
};

start();
