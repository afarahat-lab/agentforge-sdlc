/**
 * Audit log repository — PostgreSQL implementation.
 * GP-002: append-only. The DB-level REVOKE prevents UPDATE/DELETE.
 * The application layer must never call update or delete methods here.
 */

import type { AuditRepository, AuditRecord } from '@gestalt/core';
import { getDb } from '../client';

export class PostgresAuditRepository implements AuditRepository {

  async healthCheck(): Promise<boolean> {
    const db = getDb();
    const [{ ok }] = await db<[{ ok: number }]>`SELECT 1 AS ok`;
    return ok === 1;
  }

  async append(
    record: Omit<AuditRecord, 'id' | 'timestamp'>,
  ): Promise<AuditRecord> {
    const db = getDb();
    const [row] = await db<AuditRecord[]>`
      INSERT INTO audit_log (
        actor, action, entity_type, entity_id,
        correlation_id, metadata
      ) VALUES (
        ${record.actor},
        ${record.action},
        ${record.entityType},
        ${record.entityId},
        ${record.correlationId},
        ${JSON.stringify(record.metadata)}
      )
      RETURNING *
    `;
    return row;
  }

  async query(params: {
    entityId?: string;
    actor?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<AuditRecord[]> {
    const db = getDb();
    return db<AuditRecord[]>`
      SELECT * FROM audit_log
      WHERE TRUE
      ${params.entityId ? db`AND entity_id = ${params.entityId}` : db``}
      ${params.actor    ? db`AND actor = ${params.actor}`         : db``}
      ${params.from     ? db`AND timestamp >= ${params.from}`     : db``}
      ${params.to       ? db`AND timestamp <= ${params.to}`       : db``}
      ORDER BY timestamp DESC
      LIMIT ${params.limit}
    `;
  }
}
