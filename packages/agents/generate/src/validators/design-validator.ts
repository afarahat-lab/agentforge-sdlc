/**
 * Design artifact validator — ensures design output is coherent.
 */
import type { DesignArtifact } from '../types';

export function validateDesignArtifact(design: DesignArtifact): void {
  if (!design.correlationId) throw new Error('DesignArtifact missing correlationId');
  for (const change of design.domainChanges) {
    if (!change.entityName) throw new Error('DomainChange missing entityName');
    if (!change.operation) throw new Error(`DomainChange ${change.entityName} missing operation`);
  }
  for (const contract of design.apiContracts) {
    if (!contract.method) throw new Error('ApiContract missing method');
    if (!contract.path) throw new Error('ApiContract missing path');
  }
}
