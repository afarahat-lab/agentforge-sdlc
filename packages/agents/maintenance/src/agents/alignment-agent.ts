/**
 * Alignment agent — checks that the project's context files are
 * internally consistent.
 *
 * Schedule: daily at 03:00 UTC.
 *
 * Cross-checks:
 *   - every entity declared in `docs/DOMAIN.md` should have a matching
 *     module in `docs/ARCHITECTURE.md`, and vice-versa
 *   - every golden principle (`GP-NNN`) in `docs/GOLDEN_PRINCIPLES.md`
 *     should be referenced in `AGENTS.md`
 *
 * Findings are not auto-fixed — alignment problems typically require
 * judgement about whether to add the module, remove the entity, or
 * rename. The agent queues `CONTEXT_ALIGNMENT` maintenance intents so
 * the generate layer handles them with full review.
 */

import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';
import { createContextLogger } from '@gestalt/core';
import type { MaintenanceFinding } from '@gestalt/core';
import type {
  MaintenanceAgentInput, MaintenanceAgentResult, MaintenanceIntent,
} from '../types';
import { authenticatedGitUrl, maintenanceIntentText } from './util';

const log = createContextLogger({ module: 'alignment-agent' });

export async function runAlignmentAgent(input: MaintenanceAgentInput): Promise<MaintenanceAgentResult> {
  const workDir = await mkdtemp(join(tmpdir(), `gestalt-align-${input.projectId}-`));
  const findings: MaintenanceFinding[] = [];
  const intentsQueued: MaintenanceIntent[] = [];

  try {
    const cloneUrl = authenticatedGitUrl(input.projectGitUrl, input.token);
    log.info({ projectId: input.projectId, workDir }, 'Cloning project for alignment check');
    await simpleGit().clone(cloneUrl, workDir, ['--depth', '1']);

    const domain = await readOrEmpty(join(workDir, 'docs/DOMAIN.md'));
    const architecture = await readOrEmpty(join(workDir, 'docs/ARCHITECTURE.md'));
    const principles = await readOrEmpty(join(workDir, 'docs/GOLDEN_PRINCIPLES.md'));
    const agentsMd = await readOrEmpty(join(workDir, 'AGENTS.md'));

    const entities = new Set(extractEntities(domain).map((e) => e.toLowerCase()));
    const modules = new Set(extractModules(architecture).map((m) => m.toLowerCase()));
    const principleIds = extractPrincipleIds(principles);

    // Domain entity ↔ architecture module cross-check.
    const entitiesWithoutModules = [...entities].filter((e) => !modules.has(e));
    const modulesWithoutEntities = [...modules].filter((m) => !entities.has(m));

    for (const entity of entitiesWithoutModules) {
      findings.push({
        type: 'domain-entity-without-module',
        description: `entity '${entity}' is declared in DOMAIN.md but has no matching src/modules entry in ARCHITECTURE.md`,
        affectedFiles: ['docs/DOMAIN.md', 'docs/ARCHITECTURE.md'],
        severity: 'medium',
        suggestedAction:
          `Either add an architecture module for '${entity}' in docs/ARCHITECTURE.md, or remove the entity from docs/DOMAIN.md.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'normal',
        affectedFiles: ['docs/DOMAIN.md', 'docs/ARCHITECTURE.md'],
        evidence: `entity '${entity}' in DOMAIN.md has no matching architecture module`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Reconcile docs/DOMAIN.md and docs/ARCHITECTURE.md: entity '${entity}' exists in the domain model but no module references it. Decide whether to introduce the module under src/modules/${entity}/ or to remove the entity from the domain model.`,
        ),
      });
    }
    for (const moduleName of modulesWithoutEntities) {
      findings.push({
        type: 'architecture-module-without-entity',
        description: `module '${moduleName}' is listed in ARCHITECTURE.md but has no matching entity in DOMAIN.md`,
        affectedFiles: ['docs/ARCHITECTURE.md', 'docs/DOMAIN.md'],
        severity: 'low',
        suggestedAction: `Add an entity for '${moduleName}' to docs/DOMAIN.md, or remove the module from ARCHITECTURE.md.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'low',
        affectedFiles: ['docs/ARCHITECTURE.md', 'docs/DOMAIN.md'],
        evidence: `module '${moduleName}' in ARCHITECTURE.md has no matching DOMAIN.md entity`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Reconcile docs/ARCHITECTURE.md and docs/DOMAIN.md: module '${moduleName}' is declared but no domain entity references it. Either document the entity or remove the module reference.`,
        ),
      });
    }

    // Golden-principle cross-reference.
    const agentsMdLower = agentsMd.toLowerCase();
    const orphanPrinciples = principleIds.filter((id) => !agentsMdLower.includes(id.toLowerCase()));
    for (const pid of orphanPrinciples) {
      findings.push({
        type: 'golden-principle-not-cross-referenced',
        description: `principle ${pid} is defined in GOLDEN_PRINCIPLES.md but is not referenced in AGENTS.md`,
        affectedFiles: ['AGENTS.md', 'docs/GOLDEN_PRINCIPLES.md'],
        severity: 'low',
        suggestedAction: `Add a reference to ${pid} in AGENTS.md so agents are aware of the rule.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'low',
        affectedFiles: ['AGENTS.md', 'docs/GOLDEN_PRINCIPLES.md'],
        evidence: `principle ${pid} in GOLDEN_PRINCIPLES.md is not referenced in AGENTS.md`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Update AGENTS.md to reference golden principle ${pid} so all agents reading the orientation document see the rule.`,
        ),
      });
    }

    return { intentsQueued, directFixes: 0, findings };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ─── Extractors ──────────────────────────────────────────────────────────────

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function extractEntities(domainMd: string): string[] {
  const names = new Set<string>();
  // `## EntityName` headings (skip `## Project purpose` etc — only single
  // capitalised words / PascalCase considered entities)
  for (const m of domainMd.matchAll(/^##\s+([A-Z][A-Za-z0-9]+)\s*$/gm)) {
    if (m[1]) names.add(m[1]);
  }
  // `- **EntityName**` bullet lists
  for (const m of domainMd.matchAll(/^[-*]\s+\*\*([A-Z][A-Za-z0-9]+)\*\*/gm)) {
    if (m[1]) names.add(m[1]);
  }
  return [...names];
}

function extractModules(architectureMd: string): string[] {
  const modules = new Set<string>();
  for (const m of architectureMd.matchAll(/src\/modules\/([a-z][a-z0-9-]*)/g)) {
    if (m[1]) modules.add(m[1]);
  }
  return [...modules];
}

function extractPrincipleIds(principlesMd: string): string[] {
  const ids = new Set<string>();
  // Match GP-001, GP-042, etc. — top-level `## GP-NNN ...` or inline `GP-NNN`
  for (const m of principlesMd.matchAll(/\bGP-\d{1,3}\b/g)) {
    if (m[0]) ids.add(m[0]);
  }
  return [...ids];
}
