/**
 * Maintenance run repository — PostgreSQL implementation (ADR-035).
 *
 * `maintenance_runs` is the per-scheduled-run audit trail. Created when
 * a cron-triggered or manually-triggered run starts (status='running'),
 * updated to `completed` / `failed` when the run ends with a duration,
 * counts, and the per-project finding list as JSONB.
 */

import type {
  MaintenanceRunRepository, MaintenanceRunRecord, MaintenanceFinding,
} from '@gestalt/core';
import { getDb } from '../client';

interface MaintenanceRunRow {
  id: string;
  agentRole: string;
  projectId: string | null;
  status: MaintenanceRunRecord['status'];
  intentsQueued: number;
  directFixes: number;
  /** postgres.js may return JSONB as either a parsed array or the raw
   * JSON string depending on how the column was inserted — see
   * `parseFindings` for the normalisation. */
  findings: MaintenanceFinding[] | string | null;
  durationMs: number | null;
  runAt: Date;
  completedAt: Date | null;
}

function rowToRecord(row: MaintenanceRunRow): MaintenanceRunRecord {
  return {
    id: row.id,
    agentRole: row.agentRole,
    projectId: row.projectId,
    status: row.status,
    intentsQueued: row.intentsQueued,
    directFixes: row.directFixes,
    findings: parseFindings(row.findings),
    durationMs: row.durationMs,
    runAt: row.runAt,
    completedAt: row.completedAt,
  };
}

/**
 * Defensive JSONB→array parser. postgres.js sometimes returns JSONB as
 * a string (when the parameter was bound via `::jsonb` cast on a TEXT
 * payload) and sometimes as a parsed array (when the column has been
 * inserted via JSON_BUILD_ARRAY or similar). Normalise.
 */
function parseFindings(raw: MaintenanceRunRow['findings']): MaintenanceFinding[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export class PostgresMaintenanceRunRepository implements MaintenanceRunRepository {

  async healthCheck(): Promise<boolean> {
    const db = getDb();
    const [{ ok }] = await db<[{ ok: number }]>`SELECT 1 AS ok`;
    return ok === 1;
  }

  async create(
    run: Omit<MaintenanceRunRecord, 'id' | 'runAt' | 'completedAt'>,
  ): Promise<MaintenanceRunRecord> {
    const db = getDb();
    // `::jsonb` cast on the JSON-stringified array — without it postgres
    // implicit-casts the bound TEXT to a jsonb *string scalar* (wraps
    // the whole array as a JSON string), not a jsonb *array*. postgres.js
    // binds JS strings as TEXT parameters, and PostgreSQL's text→jsonb
    // implicit conversion is a quote-and-wrap, not a parse.
    const [row] = await db<MaintenanceRunRow[]>`
      INSERT INTO maintenance_runs (
        agent_role, project_id, status,
        intents_queued, direct_fixes, findings, duration_ms
      ) VALUES (
        ${run.agentRole},
        ${run.projectId},
        ${run.status},
        ${run.intentsQueued},
        ${run.directFixes},
        ${JSON.stringify(run.findings ?? [])}::jsonb,
        ${run.durationMs}
      )
      RETURNING *
    `;
    return rowToRecord(row);
  }

  async complete(
    id: string,
    result: {
      status: 'completed' | 'failed';
      intentsQueued: number;
      directFixes: number;
      findings: MaintenanceFinding[];
      durationMs: number;
    },
  ): Promise<MaintenanceRunRecord> {
    const db = getDb();
    const [row] = await db<MaintenanceRunRow[]>`
      UPDATE maintenance_runs
      SET
        status         = ${result.status},
        intents_queued = ${result.intentsQueued},
        direct_fixes   = ${result.directFixes},
        findings       = ${JSON.stringify(result.findings)}::jsonb,
        duration_ms    = ${result.durationMs},
        completed_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!row) throw new Error(`Maintenance run ${id} not found`);
    return rowToRecord(row);
  }

  async list(params: {
    projectId?: string;
    agentRole?: string;
    limit: number;
  }): Promise<MaintenanceRunRecord[]> {
    const db = getDb();
    const rows = await db<MaintenanceRunRow[]>`
      SELECT * FROM maintenance_runs
      WHERE TRUE
      ${params.projectId ? db`AND project_id = ${params.projectId}` : db``}
      ${params.agentRole ? db`AND agent_role = ${params.agentRole}` : db``}
      ORDER BY run_at DESC
      LIMIT ${params.limit}
    `;
    return rows.map(rowToRecord);
  }
}
