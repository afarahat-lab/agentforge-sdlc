/**
 * Alignment agent — detects when code has drifted from architectural standards.
 *
 * Runs daily at 03:00 UTC (configured in HARNESS.json).
 *
 * Detection strategy:
 *   Reuses the same two-level constraint checking as the quality gate's constraint-agent,
 *   but runs proactively across the entire codebase rather than just new artifacts.
 *
 * Key difference from quality gate:
 *   - Quality gate: validates new artifacts in a single intent cycle
 *   - Alignment agent: scans the full codebase for accumulated drift
 *
 * Resolution:
 *   All violations are queued as MaintenanceIntents — never fixed directly.
 *   Architecture violations require the generate loop (code-agent + quality gate).
 */

import type {
  MaintenanceAgentResult,
  MaintenanceIntent,
  MaintenanceHarnessConfig,
  AlignmentViolation,
} from '../types';

/**
 * Runs the alignment agent against the full project codebase.
 */
export async function runAlignmentAgent(
  config: MaintenanceHarnessConfig,
  readCodebase: (root: string) => Promise<string[]>,  // returns all TS file paths
  queueIntent: (intent: Omit<MaintenanceIntent, 'id' | 'createdAt'>) => Promise<MaintenanceIntent>,
): Promise<MaintenanceAgentResult> {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const intentsQueued: MaintenanceIntent[] = [];

  if (!config.alignmentCheck.enabled) {
    return nothing('alignment-agent', startedAt);
  }

  try {
    const filePaths = await readCodebase(config.projectRoot);
    const violations = await scanForViolations(filePaths, config.projectRoot);

    // Group violations by affected file to produce focused intents
    const byFile = groupByFile(violations);

    for (const [file, fileViolations] of Object.entries(byFile)) {
      const highSeverity = fileViolations.some((v) => v.severity === 'high');
      const intent = await queueIntent({
        correlationId,
        source: 'alignment-agent',
        type: 'architecture-violation',
        priority: highSeverity ? 'high' : 'normal',
        description:
          `${fileViolations.length} architectural violation(s) detected in ${file}: ` +
          fileViolations.map((v) => v.description).join('; '),
        affectedFiles: [file],
        evidence: fileViolations
          .map((v) => `[${v.ruleId}] line ${v.line}: ${v.description}`)
          .join('\n'),
        suggestedAction: `Fix ${fileViolations.length} architectural rule violation(s) in ${file}`,
      });
      intentsQueued.push(intent);
    }

    return {
      agentRole: 'alignment-agent',
      status: violations.length === 0 ? 'nothing-to-do' : 'completed',
      intentsQueued,
      directFixes: [],
      signals: [],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  } catch (err) {
    return {
      agentRole: 'alignment-agent',
      status: 'failed',
      intentsQueued: [],
      directFixes: [],
      signals: [{
        id: crypto.randomUUID(),
        correlationId,
        type: 'CONTEXT_GAP',
        severity: 'medium',
        sourceAgent: 'alignment-agent',
        message: `Alignment agent failed: ${err instanceof Error ? err.message : String(err)}`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  }
}

/**
 * Scans all TypeScript files for architectural violations.
 * Reuses the same rule definitions as the quality gate constraint-agent.
 * Phase 2: full implementation using TypeScript compiler API.
 */
async function scanForViolations(
  _filePaths: string[],
  _projectRoot: string,
): Promise<AlignmentViolation[]> {
  // Phase 2:
  // - Load constraint rules from HARNESS.json
  // - Run ESLint programmatic API across all files
  // - Run AST checks across all files
  // - Return all violations found
  return [];
}

function groupByFile(violations: AlignmentViolation[]): Record<string, AlignmentViolation[]> {
  return violations.reduce<Record<string, AlignmentViolation[]>>((acc, v) => {
    acc[v.affectedFile] = [...(acc[v.affectedFile] ?? []), v];
    return acc;
  }, {});
}

function nothing(agentRole: MaintenanceAgentResult['agentRole'], startedAt: number): MaintenanceAgentResult {
  return {
    agentRole,
    status: 'nothing-to-do',
    intentsQueued: [],
    directFixes: [],
    signals: [],
    durationMs: Date.now() - startedAt,
    runAt: new Date(),
  };
}
