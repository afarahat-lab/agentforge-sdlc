/**
 * @gestalt/adapter-postgres
 *
 * PostgreSQL adapter — implements the full RepositoryRegistry.
 * Called once at server startup: createPostgresAdapter(url) → setRepositories(adapter)
 */

import type { RepositoryRegistry } from '@gestalt/core';
import { createContextLogger } from '@gestalt/core';
import { createDb, closeDb, pingDb } from './client';
import { PostgresIntentRepository } from './repositories/intents';
import { PostgresAuditRepository } from './repositories/audit';
import { PostgresUserRepository } from './repositories/users';
import { PostgresLocalAuthRepository } from './repositories/local-auth';
import { runMigrations } from './migrations/runner';

export { closeDb, pingDb };

const log = createContextLogger({ module: 'adapter-postgres' });

export async function createPostgresAdapter(databaseUrl: string): Promise<RepositoryRegistry> {
  createDb(databaseUrl);

  const healthy = await pingDb();
  if (!healthy) throw new Error('PostgreSQL health check failed');

  await runMigrations();
  log.info('PostgreSQL adapter ready');

  // Remaining repositories stubbed — implemented in full Phase 2 build
  const stub = () => { throw new Error('Not yet implemented'); };

  return {
    intents:    new PostgresIntentRepository(),
    executions: { healthCheck: pingDb, create: stub, updateStatus: stub, findByCorrelationId: stub, findActive: stub } as never,
    artifacts:  { healthCheck: pingDb, save: stub, findByCorrelationId: stub, findById: stub } as never,
    signals:    { healthCheck: pingDb, save: stub, findByCorrelationId: stub, findUnresolved: stub, markResolved: stub } as never,
    audit:      new PostgresAuditRepository(),
    users:      new PostgresUserRepository(),
    localAuth:  new PostgresLocalAuthRepository(),
  };
}
