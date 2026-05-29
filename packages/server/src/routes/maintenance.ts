/**
 * Maintenance routes.
 *
 *   GET  /maintenance/runs?projectId&agentRole&limit   — list past runs
 *   POST /maintenance/trigger                          — run an agent now
 *
 * Reads from the `maintenance_runs` table populated by the scheduler.
 * The manual-trigger endpoint reuses the same runner the cron callbacks
 * use, so the observability story is identical (agent_executions-style
 * row, SSE event, intent dispatch via the generate queue).
 */

import type { FastifyInstance } from 'fastify';
import {
  getRepositories, loadConfig, createContextLogger,
} from '@gestalt/core';
import { triggerMaintenanceRun } from '@gestalt/agents-maintenance';
import type { MaintenanceAgentName } from '@gestalt/agents-maintenance';
import { requireRole } from '../auth/middleware';

const log = createContextLogger({ module: 'routes:maintenance' });

const VALID_AGENT_NAMES: MaintenanceAgentName[] = [
  'drift-agent', 'alignment-agent', 'gc-agent', 'evaluation-agent',
];

interface ListQuery {
  projectId?: string;
  agentRole?: string;
  limit?: string;
}

interface TriggerBody {
  agentRole?: string;
  projectId?: string;
}

export async function registerMaintenanceRoutes(app: FastifyInstance): Promise<void> {

  app.get<{ Querystring: ListQuery }>(
    '/maintenance/runs',
    async (request, reply) => {
      const { maintenanceRuns } = getRepositories();
      const limit = Math.min(
        Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20),
        200,
      );
      const records = await maintenanceRuns.list({
        ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
        ...(request.query.agentRole ? { agentRole: request.query.agentRole } : {}),
        limit,
      });
      return reply.send({ data: records });
    },
  );

  app.post<{ Body: TriggerBody }>(
    '/maintenance/trigger',
    { preHandler: requireRole('operator') },
    async (request, reply) => {
      const body = request.body ?? {};
      const agentRole = body.agentRole as MaintenanceAgentName | undefined;
      const projectId = body.projectId;

      if (!agentRole || !VALID_AGENT_NAMES.includes(agentRole)) {
        return reply.code(400).send({
          error: `agentRole must be one of: ${VALID_AGENT_NAMES.join(', ')}`,
        });
      }
      if (!projectId?.trim()) {
        return reply.code(400).send({ error: 'projectId is required' });
      }

      const { projects } = getRepositories();
      const project = await projects.findById(projectId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      log.info(
        { agentRole, projectId, actor: request.user?.id },
        'Manual maintenance trigger',
      );

      const config = loadConfig();
      const record = await triggerMaintenanceRun({
        agentName: agentRole,
        config: { queueConfig: config.queue },
        scopedProjectId: projectId,
      });

      return reply.send({ data: record });
    },
  );
}
