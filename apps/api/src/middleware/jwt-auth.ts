/**
 * JWT authentication middleware for admin panel routes
 * Validates Supabase Auth tokens and authorizes admin user
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, Logger } from 'request-manager-shared';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

const logger = new Logger('JWTAuthMiddleware');
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWTSecret() {
  return process.env.SUPABASE_JWT_SECRET;
}

function getAdminUserId() {
  return process.env.ADMIN_USER_ID;
}

interface JWTPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Verify and decode JWT token from Authorization header
 */
export async function verifyJWT(token: string): Promise<JWTPayload> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!url) {
    throw new AuthenticationError('JWT validation not configured');
  }

  try {
    const { alg } = decodeProtectedHeader(token);
    const options = { issuer: `${url}/auth/v1`, audience: 'authenticated', requiredClaims: ['sub', 'exp', 'iat'] };
    let verified;
    if (alg === 'HS256') {
      const secret = getJWTSecret();
      if (!secret) throw new Error('SUPABASE_JWT_SECRET is required for legacy HS256 tokens');
      verified = await jwtVerify(token, new TextEncoder().encode(secret), { ...options, algorithms: ['HS256'] });
    } else if (alg === 'ES256' || alg === 'RS256') {
      let keys = keySets.get(url);
      if (!keys) {
        keys = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
        keySets.set(url, keys);
      }
      verified = await jwtVerify(token, keys, { ...options, algorithms: ['ES256', 'RS256'] });
    } else {
      throw new Error('Unsupported JWT signing algorithm');
    }
    if (!verified.payload.sub) throw new Error('Missing token subject');
    return verified.payload as unknown as JWTPayload;
  } catch (error) {
    logger.warn('JWT verification failed', { message: error instanceof Error ? error.message : 'Unknown verification error' });
    throw new AuthenticationError('Invalid or expired token');
  }
}

/**
 * Middleware to validate JWT and authorize admin user
 */
export async function authenticateJWT(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', { url: request.url });
    throw new AuthenticationError('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    logger.warn('Invalid authorization header format', { url: request.url });
    throw new AuthenticationError('Invalid Authorization header format. Use: Bearer <token>');
  }

  const token = parts[1];

  try {
    const payload = await verifyJWT(token);

    // Store user info in request
    (request as any).userId = payload.sub;
    (request as any).userEmail = payload.email;

    // Check if user is authorized admin
    if (getAdminUserId() && payload.sub !== getAdminUserId()) {
      logger.warn('Unauthorized admin access attempt', {
        userId: payload.sub,
        email: payload.email,
        expectedAdminId: getAdminUserId(),
      });

      throw new Error('USER_NOT_AUTHORIZED');
    }

    logger.debug('JWT validated', { userId: payload.sub, email: payload.email });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    if (error instanceof Error && error.message === 'USER_NOT_AUTHORIZED') {
      // Return 403 for authorized but not admin user
      const reply = _reply;
      reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource',
        },
      });
      return;
    }

    logger.error('Authentication error', error as Error);
    throw new AuthenticationError('Failed to validate token');
  }
}

/**
 * Register JWT auth hook for specific routes
 */
export function registerJWTAuthHook(fastify: any, routePrefix: string): void {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith(routePrefix)) {
      await authenticateJWT(request, reply);
    }
  });
}
