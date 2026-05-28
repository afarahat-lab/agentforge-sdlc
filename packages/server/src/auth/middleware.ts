/**
 * Fastify authentication middleware.
 * Validates JWT, attaches user to request, enforces RBAC.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { PlatformUser } from '../types';
import type { UserRole } from '@gestalt/core';
import { getRepositories, createContextLogger } from '@gestalt/core';
import { verifyToken, extractToken } from './session';
import { hasPermission } from './role-mapper';
import type { SessionConfig } from './session';

const log = createContextLogger({ module: 'auth-middleware' });

// Routes that do not require authentication
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /auth/saml/metadata',
  'GET /auth/saml/login',
  'POST /auth/saml/callback',
  'GET /auth/oidc/login',
  'GET /auth/oidc/callback',
  'POST /auth/login',
  'GET /events',   // SSE — token passed as query param, validated inside route
]);

export async function registerAuthMiddleware(
  app: FastifyInstance,
  sessionConfig: SessionConfig,
): Promise<void> {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const routeKey = `${request.method} ${request.routerPath ?? request.url}`;
    if (PUBLIC_ROUTES.has(routeKey)) return;

    const token = extractToken(
      request.headers as Record<string, string | undefined>,
      request.query as Record<string, string | undefined>,
    );

    if (!token) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    try {
      const payload = await verifyToken(token, sessionConfig);
      const { users } = getRepositories();
      const user = await users.findById(payload.sub);

      if (!user) {
        return reply.code(401).send({ error: 'User not found' });
      }

      request.user = user as unknown as PlatformUser;
    } catch (err) {
      log.warn({ err }, 'Token validation failed');
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });
}

/**
 * Route-level preHandler that enforces a minimum role.
 *
 * @example
 * app.post('/maintenance/trigger', { preHandler: requireRole('operator') }, handler)
 */
export function requireRole(minimumRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (!hasPermission(request.user.role, minimumRole)) {
      return reply.code(403).send({
        error: `Insufficient permissions. Required: ${minimumRole}. Your role: ${request.user.role}`,
      });
    }
  };
}
