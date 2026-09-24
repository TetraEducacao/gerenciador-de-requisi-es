/**
 * Authentication middleware for Fastify routes.
 * Validates API keys from Authorization header.
 * Optionally skips auth for domains in whitelist.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, Logger } from 'request-manager-shared';
import { getAuthService } from '../services/auth.js';
import { getAllowedDomainsService } from '../services/allowed-domains.js';

const logger = new Logger('AuthMiddleware');

/**
 * Extract domain from request origin or referer header
 */
function extractDomainFromRequest(request: FastifyRequest): string | null {
  // Try Origin header first (for CORS requests)
  const origin = request.headers.origin;
  if (origin) {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch (e) {
      // Invalid URL, skip
    }
  }

  // Try Referer header
  const referer = request.headers.referer;
  if (referer) {
    try {
      const url = new URL(referer);
      return url.hostname;
    } catch (e) {
      // Invalid URL, skip
    }
  }

  // Try X-Forwarded-Host header (for proxied requests)
  const forwardedHost = request.headers['x-forwarded-host'];
  if (forwardedHost && typeof forwardedHost === 'string') {
    return forwardedHost.split(',')[0].trim();
  }

  return null;
}

export interface AuthenticatedRequest extends FastifyRequest {
  sourceId: string;
  keyId: string;
  keyName: string;
}

/**
 * Middleware to validate API key from Authorization header
 * OR check if domain is in whitelist (no auth required)
 * Usage: fastify.addHook('onRequest', authenticateRequest);
 */
export async function authenticateRequest(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // First, check if domain is whitelisted
  const requestDomain = extractDomainFromRequest(request);
  if (requestDomain) {
    const isAllowed = await getAllowedDomainsService().isDomainAllowed(requestDomain);
    if (isAllowed) {
      logger.debug('Request from whitelisted domain', { domain: requestDomain });
      // Mark as public access
      (request as any).isPublicDomain = true;
      return;
    }
  }

  // If not whitelisted, require API key authentication
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', {
      url: request.url,
      domain: requestDomain,
    });
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
