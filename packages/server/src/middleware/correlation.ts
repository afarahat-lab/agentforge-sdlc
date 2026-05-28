/**
 * Correlation ID middleware.
 *
 * Assigns a unique correlationId to every request.
 * Uses X-Correlation-ID header if provided (for tracing across services),
 * otherwise generates a new UUID.
 *
 * The correlationId is:
 *   - Attached to request.correlationId
 *   - Included in every response header
 *   - Used by the audit middleware for audit records
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export function correlationHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const existing = request.headers['x-correlation-id'];
  request.correlationId =
    typeof existing === 'string' && existing.length > 0
      ? existing
      : crypto.randomUUID();

  reply.header('x-correlation-id', request.correlationId);
  done();
}
