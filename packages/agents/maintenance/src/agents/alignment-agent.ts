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

    // Preserve original casing for human-readable messages; lowercase
    // for the cross-check set comparison so "Components" ↔ "components"
    // matches the directory-name convention.
    const entityNames = extractEntities(domain);
    const moduleNames = extractModules(architecture);
    const entityKeys = new Set(entityNames.map((e) => e.toLowerCase()));
    const moduleKeys = new Set(moduleNames.map((m) => m.toLowerCase()));
    const principleIds = extractPrincipleIds(principles);

    // Domain entity ↔ architecture module cross-check.
    const entitiesWithoutModules = entityNames.filter((e) => !moduleKeys.has(e.toLowerCase()));
    const modulesWithoutEntities = moduleNames.filter((m) => !entityKeys.has(m.toLowerCase()));

    for (const entity of entitiesWithoutModules) {
      findings.push({
        type: 'domain-entity-without-module',
        description: `entity '${entity}' is declared in DOMAIN.md but has no matching src/modules entry in ARCHITECTURE.md`,
        affectedFiles: ['docs/ARCHITECTURE.md', 'docs/DOMAIN.md'],
        severity: 'medium',
        suggestedAction:
          `Add a src/modules/${entity}/ entry to docs/ARCHITECTURE.md to match the '${entity}' entity defined in docs/DOMAIN.md.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'normal',
        // affectedFiles[0] is the file context-fixer writes to. ARCHITECTURE.md
        // is the right target for entity-without-module: the resolution is to
        // declare a module that matches the existing entity. DOMAIN.md goes in
        // slot 1 as context (the fixer does not write to it).
        affectedFiles: ['docs/ARCHITECTURE.md', 'docs/DOMAIN.md'],
        evidence: `entity '${entity}' in DOMAIN.md has no matching architecture module`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Add a src/modules/${entity}/ entry to docs/ARCHITECTURE.md to match the '${entity}' entity defined in docs/DOMAIN.md.`,
        ),
      });
    }
    for (const moduleName of modulesWithoutEntities) {
      findings.push({
        type: 'architecture-module-without-entity',
        description: `module '${moduleName}' is listed in ARCHITECTURE.md but has no matching entity in DOMAIN.md`,
        affectedFiles: ['docs/DOMAIN.md', 'docs/ARCHITECTURE.md'],
        severity: 'low',
        suggestedAction: `Add a '${moduleName}' entity definition to docs/DOMAIN.md to match the src/modules/${moduleName}/ module in docs/ARCHITECTURE.md.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'low',
        // DOMAIN.md is the write target — we need a new entity definition;
        // ARCHITECTURE.md (which already names the module) is context.
        affectedFiles: ['docs/DOMAIN.md', 'docs/ARCHITECTURE.md'],
        evidence: `module '${moduleName}' in ARCHITECTURE.md has no matching DOMAIN.md entity`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Add a '${moduleName}' entity definition to docs/DOMAIN.md to match the src/modules/${moduleName}/ module in docs/ARCHITECTURE.md.`,
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
        suggestedAction: `Add a reference to ${pid} in AGENTS.md under the 'What agents must never do' section.`,
      });
      intentsQueued.push({
        type: 'CONTEXT_ALIGNMENT',
        projectId: input.projectId,
        priority: 'low',
        // AGENTS.md is already in slot 0 (write target) — correct.
        affectedFiles: ['AGENTS.md', 'docs/GOLDEN_PRINCIPLES.md'],
        evidence: `principle ${pid} in GOLDEN_PRINCIPLES.md is not referenced in AGENTS.md`,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_ALIGNMENT',
          `Add a reference to ${pid} in AGENTS.md under the 'What agents must never do' section so agents reading the orientation document see the rule.`,
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

/**
 * Field labels commonly used inside an entity definition that the
 * old regex misread as entities themselves. Stop list prevents the
 * `- **Type**: Page` / `- **Description**: …` pattern from leaking in.
 * Keep this list minimal — adding too many words masks real entities.
 */
const FIELD_LABEL_STOP_LIST = new Set<string>([
  'Type', 'Description', 'Status', 'Notes', 'Props', 'Id', 'Name',
  'Fields', 'Relationships', 'Methods', 'Properties', 'Attributes',
  'Example', 'Usage', 'Parameters', 'Returns', 'Throws', 'See',
]);

/**
 * Convention used by the template DOMAIN.md and most authored ones:
 *   `## SectionName`   (h2)  — grouping heading (Components, Entities, …)
 *   `### EntityName`   (h3)  — actual entity declaration
 *   `- **FieldName**:` (bullet) — attribute on the enclosing entity
 *
 * Pre-fix: the extractor matched h2 + bold-bullet patterns indiscriminately
 * and treated section groupings / field labels as entities, producing
 * persistent false-positive alignment findings (see SESSION_LOG entry
 * 2026-06-01 root-cause analysis). The H3-only match + stop list pair
 * fixes both classes of false positive.
 */
function extractEntities(domainMd: string): string[] {
  const entities: string[] = [];
  const seen = new Set<string>();

  for (const m of domainMd.matchAll(/^###\s+([A-Z][A-Za-z0-9]+)\s*$/gm)) {
    const name = m[1];
    if (name && !seen.has(name) && !FIELD_LABEL_STOP_LIST.has(name)) {
      entities.push(name);
      seen.add(name);
    }
  }

  // Top-level bullet-list entity definitions (the alternate format):
  //   - **EntityName** — description
  // Required em-dash / en-dash / hyphen separator after the bold name
  // distinguishes an entity definition line from a field-label bullet
  // (`- **Type**: value`) where a colon follows the closing `**`.
  for (const m of domainMd.matchAll(/^[-*]\s+\*\*([A-Z][A-Za-z0-9]+)\*\*\s*[—–-]/gm)) {
    const name = m[1];
    if (name && !seen.has(name) && !FIELD_LABEL_STOP_LIST.has(name)) {
      entities.push(name);
      seen.add(name);
    }
  }

  return entities;
}

function extractModules(architectureMd: string): string[] {
  const modules: string[] = [];
  const seen = new Set<string>();

  // Accepts kebab-case, snake_case, and CamelCase. Trailing slash is
  // optional — matches both `src/modules/leave/` (with slash) and
  // `src/modules/leave` (e.g. inside `## src/modules/leave module`).
  for (const m of architectureMd.matchAll(/src\/modules\/([a-zA-Z0-9_-]+)\/?/g)) {
    const name = m[1];
    if (name && !seen.has(name)) {
      modules.push(name);
      seen.add(name);
    }
  }

  return modules;
}

function extractPrincipleIds(principlesMd: string): string[] {
  const ids = new Set<string>();
  // Match GP-001, GP-042, etc. — top-level `## GP-NNN ...` or inline `GP-NNN`
  for (const m of principlesMd.matchAll(/\bGP-\d{1,3}\b/g)) {
    if (m[0]) ids.add(m[0]);
  }
  return [...ids];
}
