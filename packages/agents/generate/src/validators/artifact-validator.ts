/**
 * Artifact set validator — validates the complete set before dispatch to quality gate.
 */
import type { GeneratedArtifact } from '../types';

export function validateArtifactSet(artifacts: GeneratedArtifact[]): void {
  if (!artifacts.length) throw new Error('Artifact set is empty');
  const codeArtifacts = artifacts.filter((a) => a.type === 'code');
  const testArtifacts = artifacts.filter((a) => a.type === 'test');
  if (!codeArtifacts.length) throw new Error('Artifact set contains no code artifacts');
  if (!testArtifacts.length) throw new Error('Artifact set contains no test artifacts');
  for (const a of artifacts) {
    if (!a.path) throw new Error(`Artifact ${a.id} missing path`);
    if (!a.content?.trim()) throw new Error(`Artifact at ${a.path} has empty content`);
  }
}
