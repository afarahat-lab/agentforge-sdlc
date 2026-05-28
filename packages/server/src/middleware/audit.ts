/**
 * Audit middleware — GP-002.
 *
 * Automatically appends an audit record for every non-GET request
 * that completes with a 2xx status code.
 *
 * Applied as a Fastify onResponse hook so it runs after the handler
 * completes and the response status is known.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRepositories, createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'audit-middleware' });

/**
 * Fastify onResponse hook that writes audit records.
 * Register on the Fastify instance after auth middleware.
 */
export async function auditHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Only audit state-changing, successful operations
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (reply.statusCode < 200 || reply.statusCode >= 300) return;
  if (!request.user) return;  // unauthenticated requests not audited at this layer

  try {
    const { audit } = getRepositories();
    await audit.append({
      actor: request.user.id,
      action: `${request.method} ${request.routerPath}`,
      entityType: extractEntityType(request.routerPath),
      entityId: extractEntityId(request.params),
      correlationId: request.correlationId,
      metadata: {
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        userRole: request.user.role,
        ip: request.ip,
      },
    });
  } catch (err) {
    // Audit failure is logged but does not fail the request — the operation already completed
    log.error({ err, path: request.url }, 'Audit record write failed');
  }
}

function extractEntityType(routerPath: string): string {
  const segments = routerPath.split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

function extractEntityId(params: unknown): string {
  if (params && typeof params === 'object' && 'id' in params) {
    return String((params as { id: unknown }).id);
  }
  return 'unknown';
}
