/**
 * Migration runner — applies pending SQL migrations in order.
 * Uses schema_migrations table to track applied versions.
 */
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getDb } from '../client';
import { createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'migrations' });

export async function runMigrations(): Promise<void> {
  const db = getDb();
  const migrationsDir = join(__dirname, '.');

  // Ensure migrations table exists
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = new Set(
    (await db<{ version: string }[]>`SELECT version FROM schema_migrations`)
      .map((r) => r.version),
  );

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');
    if (applied.has(version)) continue;

    log.info({ version }, 'Applying migration');
    const sql = await readFile(join(migrationsDir, file), 'utf8');

    await db.begin(async (tx) => {
      await tx.unsafe(sql);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });

    log.info({ version }, 'Migration applied');
  }
}
