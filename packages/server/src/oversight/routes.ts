/**
 * Oversight routes — alerts, interventions, and live event stream.
 * These are the server endpoints that the dashboard consumes.
 *
 * Routes:
 *   GET  /alerts               — list alerts (filterable)
 *   GET  /alerts/:id           — get alert detail
 *   POST /interventions        — submit a human intervention
 *   GET  /events               — SSE stream of live platform events
 *   GET  /maintenance/runs     — list maintenance agent runs
 *   POST /maintenance/trigger  — manually trigger a maintenance agent (admin only)
 */

import type { FastifyInstance } from 'fastify';
import type { InterventionRequest } from './types';

/**
 * Registers all oversight routes on the Fastify instance.
 * Full implementation: Phase 2.
 */
export async function registerOversightRoutes(app: FastifyInstance): Promise<void> {

  // GET /alerts
  app.get('/alerts', async (_req, _reply) => {
    throw new Error('GET /alerts not yet implemented');
  });

  // GET /alerts/:id
  app.get('/alerts/:id', async (_req, _reply) => {
    throw new Error('GET /alerts/:id not yet implemented');
  });

  // POST /interventions
  app.post<{ Body: InterventionRequest }>('/interventions', async (_req, _reply) => {
    throw new Error('POST /interventions not yet implemented');
    // Phase 2:
    // 1. Validate intervention type and payload
    // 2. Write InterventionRecord to audit log (GP-002)
    // 3. Route to appropriate handler:
    //    - approve/reject-promotion → promotion-agent queue
    //    - provide-clarification → resume intent cycle with clarification
    //    - acknowledge-breach → resume or abort intent cycle
    // 4. Emit live event: 'alert.acknowledged'
  });

  // Note: GET /events is registered by routes/events.ts (the canonical SSE endpoint)

  // /maintenance/runs and /maintenance/trigger are registered by
  // routes/maintenance.ts (the canonical maintenance endpoints,
  // ADR-035). This block previously held aspirational stubs for them.
}

