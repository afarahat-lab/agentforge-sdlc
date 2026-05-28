/**
 * @gestalt/adapter-postgres — database client
 *
 * PostgreSQL connection pool using the `postgres` (postgres.js) library.
 * All repository implementations use this shared pool.
 */

import postgres from 'postgres';
import { createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'postgres' });

let _sql: postgres.Sql | null = null;

/**
 * Returns the shared postgres.js connection pool.
 * Throws if not initialised.
 */
export function getDb(): postgres.Sql {
  if (!_sql) throw new Error('Postgres not initialised. Call createDb() first.');
  return _sql;
}

/**
 * Creates the postgres.js connection pool.
 * Called once at server startup.
 */
export function createDb(databaseUrl: string): postgres.Sql {
  _sql = postgres(databaseUrl, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: {
      // Convert snake_case DB columns to camelCase automatically
      column: postgres.toCamel,
    },
    onnotice: (notice) => {
      log.debug({ notice }, 'Postgres notice');
    },
  });

  log.info('Postgres connection pool created');
  return _sql;
}

/**
 * Closes the connection pool gracefully.
 * Called on server shutdown.
 */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    log.info('Postgres connection pool closed');
  }
}

/**
 * Health check — verifies the database connection is alive.
 */
export async function pingDb(): Promise<boolean> {
  try {
    const db = getDb();
    await db`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
