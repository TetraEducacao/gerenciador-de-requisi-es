/**
 * Authentication middleware for Fastify routes.
 * Validates API keys from Authorization header.
 * Optionally skips auth for domains in whitelist.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, Logger } from 'request-manager-shared';
import { getAuthService } from '../services/auth.js';
import { getAllowedDomainsService } from '../services/allowed-domains.js';
import { getExternalTokensService } from '../services/external-tokens.js';

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
 * OR check if token is in external tokens whitelist
 * Usage: fastify.addHook('onRequest', authenticateRequest);
 */
export async function authenticateRequest(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  // First, check if it's an external authorized token (Guru, n8n, etc) from Authorization header
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const token = parts[1];
      const isExternalTokenValid = await getExternalTokensService().isTokenValid(token);
      if (isExternalTokenValid) {
        logger.debug('Request authorized with external token from header');
        (request as any).isExternalToken = true;
        return;
      }
    }
  }

  // Second, check if domain is whitelisted
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
 * Middleware to validate api_token from request body (executed after body parsing)
 * Used by Guru, Asaas, and other webhook services that send token in payload
 * Usage: fastify.addHook('preValidation', authenticateBodyToken);
 */
export async function authenticateBodyToken(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Skip if already authenticated
  if ((request as any).isExternalToken || (request as any).isPublicDomain || (request as any).sourceId) {
    return;
  }

  // Check if api_token field exists in body (from Guru/Asaas webhooks)
  try {
    const body = request.body as any;
    if (body && body.api_token) {
      const isExternalTokenValid = await getExternalTokensService().isTokenValid(body.api_token);
      if (isExternalTokenValid) {
        logger.debug('Request authorized with external token from body api_token field');
        (request as any).isExternalToken = true;
        return;
      }
    }
  } catch (e) {
    logger.debug('Error validating body token', e as Error);
    // Continue - will be caught by onRequest auth checks
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

/**
 * Register body token authentication hook for webhook routes
 * This runs after body parsing to validate api_token field
 */
export function registerBodyTokenAuthHook(fastify: any, routePrefix: string): void {
  fastify.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith(routePrefix)) {
      await authenticateBodyToken(request, reply);
    }
  });
}
