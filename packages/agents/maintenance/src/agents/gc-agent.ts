/**
 * Garbage collection agent — detects accumulated technical debt.
 *
 * Runs weekly on Fridays at 04:00 UTC (configured in HARNESS.json).
 *
 * Detection targets:
 *   - Dead code: exported symbols with no references in the codebase
 *   - Duplicate logic: semantically similar functions across modules
 *   - Deprecated dependencies: packages with newer major versions or
 *     security advisories
 *
 * Never deletes or modifies code directly.
 * Always queues MaintenanceIntents — goes through generate→gate→deploy.
 * Intents are priority: 'low' unless a deprecated dependency has a security advisory.
 */

import type {
  MaintenanceAgentResult,
  MaintenanceIntent,
  MaintenanceHarnessConfig,
  GCFinding,
} from '../types';

/**
 * Runs the GC agent against the full project codebase.
 */
export async function runGCAgent(
  config: MaintenanceHarnessConfig,
  readCodebase: (root: string) => Promise<string[]>,
  readPackageJson: (root: string) => Promise<Record<string, unknown>>,
  queueIntent: (intent: Omit<MaintenanceIntent, 'id' | 'createdAt'>) => Promise<MaintenanceIntent>,
): Promise<MaintenanceAgentResult> {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const intentsQueued: MaintenanceIntent[] = [];

  if (!config.gcCheck.enabled) {
    return nothing('gc-agent', startedAt);
  }

  try {
    const [filePaths, packageJson] = await Promise.all([
      readCodebase(config.projectRoot),
      readPackageJson(config.projectRoot),
    ]);

    const findings = await detectGCFindings(filePaths, packageJson);

    // Group findings by type and create focused intents
    const byType = groupByType(findings);

    for (const [type, typeFindings] of Object.entries(byType)) {
      const hasSecurityIssue = type === 'deprecated-dependency' &&
        typeFindings.some((f) => f.estimatedImpact === 'high');

      const intent = await queueIntent({
        correlationId,
        source: 'gc-agent',
        type: mapToIntentType(type as GCFinding['type']),
        priority: hasSecurityIssue ? 'high' : 'low',
        description: `${typeFindings.length} ${type} finding(s) detected`,
        affectedFiles: typeFindings.flatMap((f) => f.affectedFiles),
        evidence: typeFindings.map((f) => f.description).join('\n'),
        suggestedAction: buildSuggestedAction(type as GCFinding['type'], typeFindings.length),
      });
      intentsQueued.push(intent);
    }

    return {
      agentRole: 'gc-agent',
      status: findings.length === 0 ? 'nothing-to-do' : 'completed',
      intentsQueued,
      directFixes: [],
      signals: [],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  } catch (err) {
    return {
      agentRole: 'gc-agent',
      status: 'failed',
      intentsQueued: [],
      directFixes: [],
      signals: [{
        id: crypto.randomUUID(),
        correlationId,
        type: 'CONTEXT_GAP',
        severity: 'low',
        sourceAgent: 'gc-agent',
        message: `GC agent failed: ${err instanceof Error ? err.message : String(err)}`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  }
}

/**
 * Detects GC findings across the codebase.
 * Phase 2: full implementation using TypeScript compiler API + npm audit.
 */
async function detectGCFindings(
  _filePaths: string[],
  _packageJson: Record<string, unknown>,
): Promise<GCFinding[]> {
  // Phase 2:
  // Dead code: TypeScript language service findReferences() for all exports
  // Duplicate logic: AST-based similarity detection across function bodies
  // Deprecated deps: npm audit + outdated API surface checks
  return [];
}

function groupByType(findings: GCFinding[]): Record<string, GCFinding[]> {
  return findings.reduce<Record<string, GCFinding[]>>((acc, f) => {
    acc[f.type] = [...(acc[f.type] ?? []), f];
    return acc;
  }, {});
}

function mapToIntentType(type: GCFinding['type']): MaintenanceIntent['type'] {
  const map: Record<GCFinding['type'], MaintenanceIntent['type']> = {
    'dead-code':             'dead-code',
    'duplicate-logic':       'duplicate-logic',
    'deprecated-dependency': 'deprecated-dependency',
  };
  return map[type];
}

function buildSuggestedAction(type: GCFinding['type'], count: number): string {
  const actions: Record<GCFinding['type'], string> = {
    'dead-code':             `Remove ${count} unused exported symbol(s)`,
    'duplicate-logic':       `Consolidate ${count} duplicate logic pattern(s) into shared utilities`,
    'deprecated-dependency': `Update ${count} deprecated package(s) to current major versions`,
  };
  return actions[type];
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
