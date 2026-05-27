/**
 * Drift agent — detects when context files have fallen out of sync with the codebase.
 *
 * Runs daily at 02:00 UTC (configured in HARNESS.json).
 *
 * Detection strategy:
 *   1. Parse context files (DOMAIN.md, ARCHITECTURE.md, AGENTS.md)
 *   2. Parse the actual codebase (AST — entity classes, module structure, exported functions)
 *   3. Compare — identify missing entities, stale fields, outdated architecture descriptions
 *
 * Resolution strategy:
 *   - 'directly-fixable' drift (additive documentation gaps) → DirectFix applied immediately
 *   - Structural drift (entity removed, module renamed) → MaintenanceIntent queued to generate layer
 *
 * Never modifies GOLDEN_PRINCIPLES.md or DECISIONS.md directly.
 * Those require human review and a new ADR.
 */

import type {
  MaintenanceAgentResult,
  MaintenanceIntent,
  DirectFix,
  DriftFinding,
  MaintenanceHarnessConfig,
} from '../types';

const DIRECTLY_FIXABLE_DRIFT: DriftFinding['driftType'][] = ['missing-entity'];

/**
 * Runs the drift agent against the project.
 */
export async function runDriftAgent(
  config: MaintenanceHarnessConfig,
  readContextFile: (path: string) => Promise<string>,
  readCodebase: (root: string) => Promise<CodebaseSnapshot>,
  writeContextFile: (path: string, content: string) => Promise<void>,
  queueIntent: (intent: Omit<MaintenanceIntent, 'id' | 'createdAt'>) => Promise<MaintenanceIntent>,
): Promise<MaintenanceAgentResult> {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const intentsQueued: MaintenanceIntent[] = [];
  const directFixes: DirectFix[] = [];

  if (!config.driftCheck.enabled) {
    return nothing('drift-agent', startedAt);
  }

  try {
    const [domainMd, architectureMd, snapshot] = await Promise.all([
      readContextFile(`${config.projectRoot}/docs/DOMAIN.md`),
      readContextFile(`${config.projectRoot}/docs/ARCHITECTURE.md`),
      readCodebase(config.projectRoot),
    ]);

    const findings = detectDrift(domainMd, architectureMd, snapshot);

    for (const finding of findings) {
      if (finding.directlyFixable && DIRECTLY_FIXABLE_DRIFT.includes(finding.driftType)) {
        // Apply direct fix — additive documentation update
        const fix = await buildDirectFix(finding, snapshot, readContextFile);
        if (fix) {
          await writeContextFile(`${config.projectRoot}/${finding.contextFile}`, fix.after);
          directFixes.push(fix);
        }
      } else {
        // Queue as maintenance intent for the generate layer
        const intent = await queueIntent({
          correlationId,
          source: 'drift-agent',
          type: 'documentation-drift',
          priority: finding.severity === 'high' ? 'high' : 'normal',
          description: finding.description,
          affectedFiles: finding.affectedFiles,
          evidence: `Drift detected in ${finding.contextFile}: ${finding.description}`,
          suggestedAction: `Update ${finding.contextFile} to reflect current codebase state`,
        });
        intentsQueued.push(intent);
      }
    }

    return {
      agentRole: 'drift-agent',
      status: findings.length === 0 ? 'nothing-to-do' : 'completed',
      intentsQueued,
      directFixes,
      signals: [],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  } catch (err) {
    return {
      agentRole: 'drift-agent',
      status: 'failed',
      intentsQueued: [],
      directFixes: [],
      signals: [{
        id: crypto.randomUUID(),
        correlationId,
        type: 'CONTEXT_GAP',
        severity: 'medium',
        sourceAgent: 'drift-agent',
        message: `Drift agent failed: ${err instanceof Error ? err.message : String(err)}`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  }
}

/**
 * Compares context files against the codebase snapshot and returns drift findings.
 * Phase 2: full AST-based implementation.
 */
function detectDrift(
  _domainMd: string,
  _architectureMd: string,
  _snapshot: CodebaseSnapshot,
): DriftFinding[] {
  // Phase 2:
  // - Parse DOMAIN.md entities vs actual TypeScript interfaces/classes
  // - Parse ARCHITECTURE.md modules vs actual folder structure
  // - Detect missing entities, stale fields, removed modules
  return [];
}

/**
 * Builds a direct fix for additive documentation drift.
 * Phase 2: full implementation using LLM to generate updated content.
 */
async function buildDirectFix(
  _finding: DriftFinding,
  _snapshot: CodebaseSnapshot,
  _readContextFile: (path: string) => Promise<string>,
): Promise<DirectFix | null> {
  return null;
}

// ─── Codebase snapshot ────────────────────────────────────────────────────────

export interface CodebaseSnapshot {
  entities: EntitySnapshot[];
  modules: ModuleSnapshot[];
  exports: ExportSnapshot[];
}

export interface EntitySnapshot {
  name: string;
  fields: Array<{ name: string; type: string }>;
  filePath: string;
}

export interface ModuleSnapshot {
  name: string;
  path: string;
  imports: string[];
  exports: string[];
}

export interface ExportSnapshot {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'const';
  filePath: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
