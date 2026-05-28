/**
 * Local username/password fallback provider.
 * Non-production only. Passwords hashed with bcrypt (Phase 2).
 */
import type { AuthProvider, LocalAuthConfig, VerifiedIdentity, IncomingRequest, OutgoingResponse } from '../types';
import { createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'auth:local' });

export class LocalProvider implements AuthProvider {
  readonly type = 'local' as const;

  constructor(private readonly config: LocalAuthConfig) {
    if (process.env['NODE_ENV'] === 'production' && !config.allowedInProduction) {
      log.warn('Local auth is enabled but NODE_ENV=production — will be rejected at runtime');
    }
  }

  canHandle(req: IncomingRequest): boolean {
    return req.method === 'POST' && req.url.endsWith('/auth/login');
  }

  async authenticate(req: IncomingRequest, _res: OutgoingResponse): Promise<VerifiedIdentity | null> {
    if (process.env['NODE_ENV'] === 'production' && !this.config.allowedInProduction) {
      throw new Error('Local authentication is disabled in production.');
    }
    const body = req.body as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) return null;
    // Phase 2: bcrypt verification against local_auth table
    throw new Error('LocalProvider.authenticate not yet implemented — pending Phase 2');
  }
}
