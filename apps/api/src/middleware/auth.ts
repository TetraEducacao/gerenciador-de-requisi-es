/**
 * Authentication middleware for Fastify routes.
 * Validates API keys from Authorization header.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, Logger } from 'request-manager-shared';
import { getAuthService } from '../services/auth.js';

const logger = new Logger('AuthMiddleware');

export interface AuthenticatedRequest extends FastifyRequest {
  sourceId: string;
  keyId: string;
  keyName: string;
}

/**
 * Middleware to validate API key from Authorization header
 * Usage: fastify.addHook('onRequest', authenticateRequest);
 */
export async function authenticateRequest(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', { url: request.url });
    throw new AuthenticationError('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    logger.warn('Invalid authorization header format', { url: request.url });
    throw new AuthenticationError('Invalid Authorization header format. Use: Bearer <key>');
  }

  const key = parts[1];

  try {
    const validation = await getAuthService().validateApiKey(key);

    // Attach to request for use in route handlers
    (request as any).sourceId = validation.sourceId;
    (request as any).keyId = validation.keyId;
    (request as any).keyName = validation.name;

    logger.debug('API key validated', { sourceId: validation.sourceId, keyId: validation.keyId });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.error('Authentication error', error as Error);
    throw new AuthenticationError('Failed to validate API key');
  }
}

/**
 * Register authentication hook for specific routes
 */
export function registerAuthHook(fastify: any, routePrefix: string): void {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith(routePrefix)) {
      await authenticateRequest(request, reply);
    }
  });
}
