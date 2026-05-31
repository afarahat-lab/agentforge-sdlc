/**
 * Finding-attempt repository — SQL Server stub.
 *
 * Placeholder so adding a method to `FindingAttemptRepository` in core
 * forces a build break here rather than at runtime.
 */

import type {
  FindingAttemptRepository, FindingAttemptRecord,
} from '@gestalt/core';

const notImplemented = (): never => {
  throw new Error('@gestalt/adapter-mssql FindingAttemptRepository: not implemented');
};

export class MssqlFindingAttemptRepository implements FindingAttemptRepository {
  async healthCheck(): Promise<boolean> { return notImplemented(); }
  async upsertAttempt(_projectId: string, _findingHash: string): Promise<FindingAttemptRecord> { return notImplemented(); }
  async getAttempts(_projectId: string, _findingHashes: string[]): Promise<FindingAttemptRecord[]> { return notImplemented(); }
  async markEscalated(_projectId: string, _findingHash: string): Promise<void> { return notImplemented(); }
  async resetAttempts(_projectId: string, _findingHash: string): Promise<void> { return notImplemented(); }
  async resetAll(_projectId: string): Promise<number> { return notImplemented(); }
}
