/**
 * Intent routes.
 *
 * POST /intents          — submit a new intent
 * GET  /intents          — list intents (paginated, filterable)
 * GET  /intents/:id      — get intent detail with agent executions + signals
 * POST /intents/:id/clarify — provide clarification for a CONTEXT_GAP
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getRepositories, dispatch, createContextLogger } from '@gestalt/core';
import type { TaskMessage } from '@gestalt/core';
import { emitLiveEvent } from '../events';
import { requireRole } from '../auth/middleware';

const log = createContextLogger({ module: 'routes:intents' });

interface SubmitIntentBody {
  text: string;
  projectId: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

interface ListIntentsQuery {
  status?: string;
  limit?: string;
  offset?: string;
}

interface ClarifyBody {
  clarification: string;
  ambiguityId: string;
}

export async function registerIntentRoutes(app: FastifyInstance): Promise<void> {

  // POST /intents — submit a new intent
  app.post<{ Body: SubmitIntentBody }>(
    '/intents',
    { preHandler: requireRole('operator') },
    async (request, reply) => {
      const { text, projectId, priority = 'normal' } = request.body;

      if (!text?.trim()) {
        return reply.code(400).send({ error: 'Intent text is required' });
      }
      if (!projectId?.trim()) {
        return reply.code(400).send({ error: 'projectId is required' });
      }

      const { intents } = getRepositories();
      const correlationId = crypto.randomUUID();

      const intent = await intents.create({
        id: crypto.randomUUID(),
        correlationId,
        projectId,
        text: text.trim(),
        status: 'pending',
        source: 'human',
        priority,
      });

      log.info({ intentId: intent.id, correlationId }, 'Intent created');

      // Dispatch to generate layer
      const message: TaskMessage = {
        id: crypto.randomUUID(),
        correlationId,
        type: 'generate:intent',
        sourceAgent: 'orchestrator',
        targetAgent: 'intent-agent',
        priority,
        payload: { intentId: intent.id, text: intent.text, projectId },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Import config lazily to avoid circular deps
      const { loadConfig } = await import('@gestalt/core');
      const config = loadConfig();
      await dispatch(message, config.queue);

      // Update status and notify dashboard
      await intents.updateStatus(intent.id, 'generating');
      emitLiveEvent('intent.created', correlationId, { intentId: intent.id, text, priority });

      return reply.code(201).send({ data: intent });
    },
  );

  // GET /intents — list intents
  app.get<{ Querystring: ListIntentsQuery }>(
    '/intents',
    async (request, reply) => {
      const { status, limit = '20', offset = '0' } = request.query;
      const projectId = (request.query as Record<string, string>)['projectId'] ?? '';

      if (!projectId) {
        return reply.code(400).send({ error: 'projectId is required' });
      }

      const { intents } = getRepositories();
      const { records, total } = await intents.list({
        projectId,
        status: status as never,
        limit: Math.min(parseInt(limit, 10), 100),
        offset: parseInt(offset, 10),
      });

      return reply.send({
        data: records,
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
    },
  );

  // GET /intents/:id — intent detail
  app.get<{ Params: { id: string } }>(
    '/intents/:id',
    async (request, reply) => {
      const { intents, executions, signals, artifacts } = getRepositories();
      const intent = await intents.findById(request.params.id);

      if (!intent) {
        return reply.code(404).send({ error: 'Intent not found' });
      }

      const [agentExecutions, intentSignals, intentArtifacts] = await Promise.all([
        executions.findByCorrelationId(intent.correlationId),
        signals.findByCorrelationId(intent.correlationId),
        artifacts.findByCorrelationId(intent.correlationId),
      ]);

      return reply.send({
        data: {
          ...intent,
          agentExecutions,
          signals: intentSignals,
          artifacts: intentArtifacts,
        },
      });
    },
  );

  // POST /intents/:id/clarify — resolve a CONTEXT_GAP
  app.post<{ Params: { id: string }; Body: ClarifyBody }>(
    '/intents/:id/clarify',
    { preHandler: requireRole('operator') },
    async (request, reply) => {
      const { intents } = getRepositories();
      const intent = await intents.findById(request.params.id);

      if (!intent) {
        return reply.code(404).send({ error: 'Intent not found' });
      }
      if (intent.status !== 'waiting-for-clarification') {
        return reply.code(400).send({
          error: `Cannot clarify intent with status '${intent.status}'`,
        });
      }

      const { clarification, ambiguityId } = request.body;

      // Resume the generate loop with clarification
      const { loadConfig } = await import('@gestalt/core');
      const config = loadConfig();
      const message: TaskMessage = {
        id: crypto.randomUUID(),
        correlationId: intent.correlationId,
        type: 'generate:intent',
        sourceAgent: 'orchestrator',
        targetAgent: 'orchestrator',
        priority: intent.priority,
        payload: { intentId: intent.id, clarification, ambiguityId, resume: true },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      await dispatch(message, config.queue);
      await intents.updateStatus(intent.id, 'generating');

      emitLiveEvent('intent.status-changed', intent.correlationId, {
        intentId: intent.id,
        status: 'generating',
      });

      return reply.send({ data: { resumed: true } });
    },
  );
}
