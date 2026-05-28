/**
 * Fastify application factory.
 *
 * Creates and configures the Fastify instance with:
 *   - Correlation ID hook (every request)
 *   - Auth middleware (JWT validation + RBAC)
 *   - Audit hook (GP-002 — all non-GET 2xx responses)
 *   - All route plugins
 *   - Static dashboard serving
 *   - Error handling
 */

import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import corsPlugin from '@fastify/cors';
import { join } from 'path';
import type { GestaltConfig } from '@gestalt/core';
import { createContextLogger } from '@gestalt/core';
import { registerAuthMiddleware } from './auth/middleware';
import { registerAuthRoutes } from './auth/routes';
import { registerIntentRoutes } from './routes/intents';
import { registerStatusRoutes } from './routes/status';
import { registerEventsRoute } from './routes/events';
import { registerOversightRoutes } from './oversight/routes';
import { correlationHook } from './middleware/correlation';
import { auditHook } from './middleware/audit';
import type { AuthManager } from './auth/auth-manager';

const log = createContextLogger({ module: 'app' });

export async function createApp(
  config: GestaltConfig,
  authManager: AuthManager,
): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: false,  // We use our own pino logger
    trustProxy: true,
    requestIdHeader: 'x-correlation-id',
    genReqId: () => crypto.randomUUID(),
  });

  // ─── Global hooks ──────────────────────────────────────────────────────────

  app.addHook('onRequest', correlationHook);
  app.addHook('onResponse', auditHook);

  // ─── Plugins ───────────────────────────────────────────────────────────────

  // CORS — restrict to server's own origin in production
  await app.register(corsPlugin, {
    origin: config.server.nodeEnv === 'production'
      ? config.server.baseUrl
      : true,
    credentials: true,
  });

  // ─── Auth middleware ────────────────────────────────────────────────────────

  const sessionConfig = {
    jwtSecret: config.auth.jwtSecret,
    sessionTtlMinutes: config.auth.sessionTtlMinutes,
  };

  await registerAuthMiddleware(app, sessionConfig);

  // ─── Routes ────────────────────────────────────────────────────────────────

  await registerStatusRoutes(app);
  await registerAuthRoutes(app, authManager);
  await registerIntentRoutes(app);
  await registerEventsRoute(app, sessionConfig);
  await registerOversightRoutes(app);

  // ─── Dashboard static files ────────────────────────────────────────────────

  const dashboardDist = join(__dirname, '..', '..', 'dashboard', 'dist');
  try {
    await app.register(staticPlugin, {
      root: dashboardDist,
      prefix: '/',
      decorateReply: false,
    });

    // SPA fallback — all non-API routes serve index.html
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile('index.html');
    });
  } catch {
    log.warn('Dashboard dist not found — serving API only. Run `pnpm build` in dashboard package.');
  }

  // ─── Error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    log.error(
      { err: error, correlationId: request.correlationId, url: request.url },
      'Unhandled error',
    );

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}
