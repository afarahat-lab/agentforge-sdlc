/**
 * Security agent — runs OWASP ruleset against generated code artifacts.
 *
 * Severity mapping (non-negotiable, GP-007):
 *   CRITICAL / HIGH  → GOLDEN_PRINCIPLE_BREACH  (always blocks, never auto-resolved)
 *   MEDIUM           → CONSTRAINT_VIOLATION      (blocks, code-agent fixes)
 *   LOW / INFO       → LINT_FAILURE              (auto-resolvable)
 *
 * Never uses an LLM. Uses static analysis tooling only.
 * Full implementation uses Semgrep with OWASP ruleset in Phase 2.
 */

import type { GateTask, GateAgentResult, GateSignal, SecurityFinding, OWASPSeverity } from '../types';
import type { SignalType } from '@gestalt/core';

/**
 * Maps OWASP severity to platform signal type.
 * This mapping is fixed — never change without a new ADR and GP update.
 */
const SEVERITY_TO_SIGNAL: Record<OWASPSeverity, SignalType> = {
  CRITICAL: 'GOLDEN_PRINCIPLE_BREACH',
  HIGH:     'GOLDEN_PRINCIPLE_BREACH',
  MEDIUM:   'CONSTRAINT_VIOLATION',
  LOW:      'LINT_FAILURE',
  INFO:     'LINT_FAILURE',
};

const SEVERITY_RANK: Record<OWASPSeverity, 'critical' | 'high' | 'medium' | 'low'> = {
  CRITICAL: 'critical',
  HIGH:     'high',
  MEDIUM:   'medium',
  LOW:      'low',
  INFO:     'low',
};

/**
 * Runs the security agent against all code artifacts in the task.
 */
export async function runSecurityAgent(task: GateTask): Promise<GateAgentResult> {
  const startedAt = Date.now();
  const signals: GateSignal[] = [];

  const codeArtifacts = task.artifacts.filter((a) => a.type === 'code');

  for (const artifact of codeArtifacts) {
    const findings = await runOwaspScan(artifact.path, artifact.content);

    for (const finding of findings) {
      signals.push(buildSecuritySignal(task.correlationId, finding));
    }
  }

  return {
    agentRole: 'security-agent',
    status: signals.length === 0 ? 'passed' : 'failed',
    signals,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Runs OWASP security scan against file content.
 * Phase 2: implement using Semgrep programmatic API or semgrep-js.
 * Returns empty array in Phase 1 (stub).
 */
async function runOwaspScan(
  _filePath: string,
  _content: string,
): Promise<SecurityFinding[]> {
  // Phase 2:
  // const semgrep = await import('@semgrep/semgrep-js');
  // const results = await semgrep.scan(content, { rules: 'owasp-top-ten' });
  // return mapSemgrepResults(results, filePath);
  return [];
}

/**
 * Maps a SecurityFinding to a GateSignal.
 * HIGH and CRITICAL always produce GOLDEN_PRINCIPLE_BREACH — never downgraded.
 */
function buildSecuritySignal(
  correlationId: string,
  finding: SecurityFinding,
): GateSignal {
  const signalType = SEVERITY_TO_SIGNAL[finding.severity];
  const isGoldenBreach = signalType === 'GOLDEN_PRINCIPLE_BREACH';

  return {
    id: crypto.randomUUID(),
    correlationId,
    type: signalType,
    severity: SEVERITY_RANK[finding.severity],
    agentRole: 'security-agent',
    message: `[OWASP${finding.cwe ? ` ${finding.cwe}` : ''}] ${finding.title}: ${finding.description}`,
    location: finding.location,
    autoResolvable: !isGoldenBreach,
  };
}
