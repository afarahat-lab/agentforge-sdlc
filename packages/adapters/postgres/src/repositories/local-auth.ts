/**
 * Local auth credentials repository — PostgreSQL implementation.
 * Stores bcrypt password hashes for the local fallback auth provider.
 * Never store plaintext passwords; hashing happens in the server layer.
 */

import type { LocalAuthRepository, LocalAuthRecord } from '@gestalt/core';
import { getDb } from '../client';

export class PostgresLocalAuthRepository implements LocalAuthRepository {

  async healthCheck(): Promise<boolean> {
    const db = getDb();
    const [{ ok }] = await db<[{ ok: number }]>`SELECT 1 AS ok`;
    return ok === 1;
  }

  async create(
    record: Omit<LocalAuthRecord, 'id' | 'createdAt'>,
  ): Promise<LocalAuthRecord> {
    const db = getDb();
    const [row] = await db<LocalAuthRecord[]>`
      INSERT INTO local_auth (user_id, email, password_hash)
      VALUES (${record.userId}, ${record.email}, ${record.passwordHash})
      RETURNING *
    `;
    return row;
  }

  async findByEmail(email: string): Promise<LocalAuthRecord | null> {
    const db = getDb();
    const [row] = await db<LocalAuthRecord[]>`
      SELECT * FROM local_auth WHERE email = ${email}
    `;
    return row ?? null;
  }
}
