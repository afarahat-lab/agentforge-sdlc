/**
 * User repository — PostgreSQL implementation.
 * Shadow records only — identity is owned by the corporate IdP.
 */

import type { UserRepository, UserRecord } from '@gestalt/core';
import { getDb } from '../client';

export class PostgresUserRepository implements UserRepository {

  async healthCheck(): Promise<boolean> {
    const db = getDb();
    const [{ ok }] = await db<[{ ok: number }]>`SELECT 1 AS ok`;
    return ok === 1;
  }

  async upsert(
    user: Omit<UserRecord, 'id' | 'createdAt'>,
  ): Promise<UserRecord> {
    const db = getDb();
    const [row] = await db<UserRecord[]>`
      INSERT INTO users (
        email, display_name, role, auth_provider,
        idp_subject, idp_groups, last_login_at
      ) VALUES (
        ${user.email},
        ${user.displayName},
        ${user.role},
        ${user.authProvider},
        ${user.idpSubject},
        ${user.idpGroups},
        ${user.lastLoginAt}
      )
      ON CONFLICT (idp_subject, auth_provider) DO UPDATE SET
        email          = EXCLUDED.email,
        display_name   = EXCLUDED.display_name,
        role           = EXCLUDED.role,
        idp_groups     = EXCLUDED.idp_groups,
        last_login_at  = EXCLUDED.last_login_at
      RETURNING *
    `;
    return row;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const db = getDb();
    const [row] = await db<UserRecord[]>`
      SELECT * FROM users WHERE id = ${id}
    `;
    return row ?? null;
  }

  async findByIdpSubject(subject: string, provider: string): Promise<UserRecord | null> {
    const db = getDb();
    const [row] = await db<UserRecord[]>`
      SELECT * FROM users
      WHERE idp_subject = ${subject} AND auth_provider = ${provider}
    `;
    return row ?? null;
  }

  async list(): Promise<UserRecord[]> {
    const db = getDb();
    return db<UserRecord[]>`
      SELECT * FROM users ORDER BY created_at DESC
    `;
  }
}
