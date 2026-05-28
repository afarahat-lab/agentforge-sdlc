/**
 * Status routes.
 *
 * GET /health          — liveness probe (no auth)
 * GET /status          — platform status (auth required)
 * GET /status/agents   — active agent executions
 */

import type { FastifyInstance } from 'fastify';
import { getRepositories, createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'routes:status' });

export async function registerStatusRoutes(app: FastifyInstance): Promise<void> {

  // GET /health — unauthenticated liveness probe
  app.get('/health', async (_request, reply) => {
    try {
      const { intents } = getRepositories();
      const healthy = await intents.healthCheck();
      return reply.send({
        status: healthy ? 'ok' : 'degraded',
        version: process.env['npm_package_version'] ?? '0.0.0',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, 'Health check failed');
      return reply.code(503).send({ status: 'error', timestamp: new Date().toISOString() });
    }
  });

  // GET /status — platform overview
  app.get('/status', async (_request, reply) => {
    const { executions } = getRepositories();
    const activeAgents = await executions.findActive();

    return reply.send({
      data: {
        activeAgents: activeAgents.length,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // GET /status/agents — active agent detail
  app.get('/status/agents', async (_request, reply) => {
    const { executions } = getRepositories();
    const active = await executions.findActive();
    return reply.send({ data: active });
  });
}
