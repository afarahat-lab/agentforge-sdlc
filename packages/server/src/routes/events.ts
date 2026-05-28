/**
 * Server-Sent Events route.
 *
 * GET /events — streams live platform events to the dashboard.
 *
 * Auth: token passed as ?token= query param
 * (EventSource API cannot set Authorization headers)
 *
 * Keeps connection alive with 30-second ping comments.
 * Automatically cleans up on client disconnect.
 */

import type { FastifyInstance } from 'fastify';
import { getRepositories, createContextLogger } from '@gestalt/core';
import { eventBus } from '../events';
import { verifyToken, extractToken } from '../auth/session';
import type { SessionConfig } from '../auth/session';

const log = createContextLogger({ module: 'routes:events' });

const PING_INTERVAL_MS = 30_000;

export async function registerEventsRoute(
  app: FastifyInstance,
  sessionConfig: SessionConfig,
): Promise<void> {

  app.get('/events', async (request, reply) => {
    // Validate token from query param
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
      if (!user) return reply.code(401).send({ error: 'User not found' });
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    // Switch to SSE mode
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');  // disable nginx buffering
    reply.raw.flushHeaders();

    log.debug({ url: request.url }, 'SSE client connected');

    // Subscribe to live events
    const unsubscribe = eventBus.subscribe((event) => {
      const line = `data: ${JSON.stringify(event)}\n\n`;
      reply.raw.write(line);
    });

    // Keep-alive ping every 30 seconds
    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, PING_INTERVAL_MS);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      log.debug('SSE client disconnected');
    });

    // Never call reply.send() — keep the stream open
  });
}
