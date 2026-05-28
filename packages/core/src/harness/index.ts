/**
 * @gestalt/core/harness
 *
 * Harness engine — manages context files for agent-first projects.
 *
 * Responsibilities:
 *   - Load and parse HARNESS.json and all context files
 *   - Validate completeness (all required files present)
 *   - Build ContextSnapshot for agent dispatch
 *   - Detect staleness (files not updated recently)
 *   - Version tracking via Git history
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import type { SignalType } from '../types';
import { createContextLogger } from '../logger/index';

const log = createContextLogger({ module: 'harness' });

// ─── Context file spec ────────────────────────────────────────────────────────

export const REQUIRED_CONTEXT_FILES = [
  'AGENTS.md',
  'HARNESS.json',
  'docs/ARCHITECTURE.md',
  'docs/DOMAIN.md',
  'docs/GOLDEN_PRINCIPLES.md',
  'docs/DECISIONS.md',
] as const;

export type RequiredContextFile = typeof REQUIRED_CONTEXT_FILES[number];

// ─── Harness config (parsed from HARNESS.json) ────────────────────────────────

export interface HarnessConfig {
  name: string;
  version: string;
  tier: 'tier1' | 'tier2' | 'tier3';
  stack: Record<string, string>;
  adapters: {
    database: { type: string; configKey: string };
    queue: { type: string; configKey: string };
    llm: { type: string; configKey: string };
  };
  qualityGate: {
    maxRetries: number;
    blockingSignals: SignalType[];
    autoResolvableSignals: SignalType[];
    required: string[];
  };
  identity?: Record<string, unknown>;
  pipeline?: Record<string, unknown>;
  maintenance?: Record<string, unknown>;
}

// ─── Context snapshot (what agents receive) ───────────────────────────────────

export interface ContextSnapshot {
  projectRoot: string;
  harness: HarnessConfig;
  agentsMd: string;
  architectureMd: string;
  domainMd: string;
  goldenPrinciplesMd: string;
  relevantDecisions: string;       // filtered subset of DECISIONS.md
  snapshotAt: Date;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface HarnessValidationResult {
  valid: boolean;
  missingFiles: string[];
  parseErrors: string[];
  warnings: string[];
}

// ─── Harness engine ───────────────────────────────────────────────────────────

export class HarnessEngine {
  constructor(private readonly projectRoot: string) {}

  /**
   * Loads and validates the project harness.
   * Returns a validation result with all issues found.
   */
  async validate(): Promise<HarnessValidationResult> {
    const missingFiles: string[] = [];
    const parseErrors: string[] = [];
    const warnings: string[] = [];

    // Check all required context files exist
    for (const file of REQUIRED_CONTEXT_FILES) {
      const filePath = join(this.projectRoot, file);
      try {
        await access(filePath);
      } catch {
        missingFiles.push(file);
      }
    }

    // Try to parse HARNESS.json
    if (!missingFiles.includes('HARNESS.json')) {
      try {
        await this.loadHarnessConfig();
      } catch (e) {
        parseErrors.push(`HARNESS.json parse error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const valid = missingFiles.length === 0 && parseErrors.length === 0;
    return { valid, missingFiles, parseErrors, warnings };
  }

  /**
   * Builds a ContextSnapshot for agent dispatch.
   * Reads all context files from disk.
   * Call once per intent cycle — agents receive the snapshot, not file paths.
   */
  async buildSnapshot(correlationId?: string): Promise<ContextSnapshot> {
    const childLog = createContextLogger({ module: 'harness', correlationId });
    childLog.debug('Building context snapshot');

    const [harness, agentsMd, architectureMd, domainMd, goldenPrinciplesMd, decisionsMd] =
      await Promise.all([
        this.loadHarnessConfig(),
        this.readFile('AGENTS.md'),
        this.readFile('docs/ARCHITECTURE.md'),
        this.readFile('docs/DOMAIN.md'),
        this.readFile('docs/GOLDEN_PRINCIPLES.md'),
        this.readFile('docs/DECISIONS.md'),
      ]);

    childLog.debug('Context snapshot built');

    return {
      projectRoot: this.projectRoot,
      harness,
      agentsMd,
      architectureMd,
      domainMd,
      goldenPrinciplesMd,
      relevantDecisions: decisionsMd,  // full for now; filtered by domain in Phase 2
      snapshotAt: new Date(),
    };
  }

  /**
   * Loads and parses HARNESS.json.
   */
  async loadHarnessConfig(): Promise<HarnessConfig> {
    const raw = await this.readFile('HARNESS.json');
    return JSON.parse(raw) as HarnessConfig;
  }

  /**
   * Checks if a context file exists and returns its content.
   * Emits a CONTEXT_GAP signal description if missing.
   */
  async readContextFile(relativePath: string): Promise<{ content: string; missing: boolean }> {
    try {
      const content = await this.readFile(relativePath);
      return { content, missing: false };
    } catch {
      log.warn({ file: relativePath }, 'Context file missing');
      return { content: '', missing: true };
    }
  }

  /**
   * Writes a context file update.
   * Used by context-agent and drift-agent for direct fixes.
   */
  async writeContextFile(relativePath: string, content: string): Promise<void> {
    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');
    const filePath = join(this.projectRoot, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    log.info({ file: relativePath }, 'Context file updated');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async readFile(relativePath: string): Promise<string> {
    return readFile(join(this.projectRoot, relativePath), 'utf8');
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a HarnessEngine for the given project root.
 */
export function createHarnessEngine(projectRoot: string): HarnessEngine {
  return new HarnessEngine(projectRoot);
}
