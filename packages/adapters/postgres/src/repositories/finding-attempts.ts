/**
 * Finding-attempt repository — PostgreSQL implementation (ADR-018
 * idempotency guard).
 *
 * Persisted in `maintenance_finding_attempts` (migration 008).
 *
 * `upsertAttempt` uses `ON CONFLICT ... DO UPDATE` so the same finding
 * firing on consecutive runs increments the counter atomically without
 * a read-modify-write race. `resetAttempts` is called by the runner
 * when the context-fixer actually committed a real change (`committed:
 * true`) so the next time the finding fires we start at 1 again — a
 * fresh budget for a fresh occurrence.
 *
 * `markEscalated` flips a row to `escalated = TRUE` once the runner
 * decides we've spent the MAX_ATTEMPTS budget on it. Future runs check
 * the flag and skip the finding silently.
 */

import type {
  FindingAttemptRepository, FindingAttemptRecord,
} from '@gestalt/core';
import { getDb } from '../client';

interface FindingAttemptRow {
  id: string;
  projectId: string;
  findingHash: string;
  attemptCount: number;
  lastAttempted: Date;
  escalated: boolean;
  createdAt: Date;
}

function rowToRecord(row: FindingAttemptRow): FindingAttemptRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    findingHash: row.findingHash,
    attemptCount: row.attemptCount,
    lastAttempted: row.lastAttempted,
    escalated: row.escalated,
    createdAt: row.createdAt,
  };
}

export class PostgresFindingAttemptRepository implements FindingAttemptRepository {

  async healthCheck(): Promise<boolean> {
    const db = getDb();
    const [{ ok }] = await db<[{ ok: number }]>`SELECT 1 AS ok`;
    return ok === 1;
  }

  async upsertAttempt(projectId: string, findingHash: string): Promise<FindingAttemptRecord> {
    const db = getDb();
    const [row] = await db<FindingAttemptRow[]>`
      INSERT INTO maintenance_finding_attempts (project_id, finding_hash, attempt_count, last_attempted)
      VALUES (${projectId}, ${findingHash}, 1, NOW())
      ON CONFLICT (project_id, finding_hash) DO UPDATE
        SET attempt_count  = maintenance_finding_attempts.attempt_count + 1,
            last_attempted = NOW()
      RETURNING *
    `;
    return rowToRecord(row);
  }

  async getAttempts(
    projectId: string,
    findingHashes: string[],
  ): Promise<FindingAttemptRecord[]> {
    if (findingHashes.length === 0) return [];
    const db = getDb();
    const rows = await db<FindingAttemptRow[]>`
      SELECT * FROM maintenance_finding_attempts
       WHERE project_id  = ${projectId}
         AND finding_hash IN ${db(findingHashes)}
    `;
    return rows.map(rowToRecord);
  }

  async markEscalated(projectId: string, findingHash: string): Promise<void> {
    const db = getDb();
    await db`
      UPDATE maintenance_finding_attempts
         SET escalated = TRUE
       WHERE project_id   = ${projectId}
         AND finding_hash = ${findingHash}
    `;
  }

  async resetAttempts(projectId: string, findingHash: string): Promise<void> {
    const db = getDb();
    await db`
      DELETE FROM maintenance_finding_attempts
       WHERE project_id   = ${projectId}
         AND finding_hash = ${findingHash}
    `;
  }

  async resetAll(projectId: string): Promise<number> {
    // Operator-triggered full reset — see the interface JSDoc. Uses the
    // WITH ... RETURNING 1 / SELECT COUNT trick (same as
    // `deployment-events.gcOlderThan`) because postgres.js doesn't
    // surface affected-row counts on naked DELETE statements.
    const db = getDb();
    const rows = await db<{ count: string }[]>`
      WITH deleted AS (
        DELETE FROM maintenance_finding_attempts
        WHERE project_id = ${projectId}
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
    `;
    return parseInt(rows[0]?.count ?? '0', 10);
  }
}
