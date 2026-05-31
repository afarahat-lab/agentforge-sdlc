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
      // Single instruction — see `instruction` below — used for both
      // the human-readable finding and the LLM-facing intent. The
      // "literal path format, not a tree diagram" wording is
      // load-bearing: without it, the LLM tends to add an indented
      // tree-child line like `│   └── X/` instead of the
      // `src/modules/X/` substring the extractor's Pattern 1 matches.
      // Pattern 2 catches the tree-child fallback, but Pattern 1 keeps
      // the file authoritative.
      const instruction =
        `Add the line "  src/modules/${entity}/    — ${entity} module" ` +
        `to the module listing in docs/ARCHITECTURE.md. ` +
        `Use the literal path format, not a tree diagram child entry.`;
      findings.push({
        type: 'domain-entity-without-module',
        description: `entity '${entity}' is declared in DOMAIN.md but has no matching src/modules entry in ARCHITECTURE.md`,
        affectedFiles: ['docs/ARCHITECTURE.md', 'docs/DOMAIN.md'],
        severity: 'medium',
        suggestedAction: instruction,
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
        suggestedAction: maintenanceIntentText('CONTEXT_ALIGNMENT', instruction),
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

/**
 * Module extractor — recognises BOTH formats authors actually use in
 * ARCHITECTURE.md:
 *
 *   Pattern 1 — literal path (preferred):
 *     `src/modules/<name>` or `src/modules/<name>/` substring anywhere
 *     in the file. Stable, unambiguous, the format suggestedAction
 *     instructs the LLM to write.
 *
 *   Pattern 2 — markdown directory tree (the format the harness
 *     template ships with):
 *       ```
 *       src/
 *       ├── modules/          # business domain modules
 *       │   ├── WelcomeScreen/
 *       │   └── StartButton/
 *       ```
 *     For each line that introduces a `modules/` container, scan up to
 *     the next 10 lines for indented tree-child entries. Hard cap on
 *     the lookahead so we never run away on a giant ARCHITECTURE.md.
 *
 * Comment stripping (`# ...` at end of a line) is applied to both the
 * container-line detection and the child-line match — the trackeros
 * harness template puts `# business domain modules — own their data
 * and routes` after `├── modules/`, which would otherwise break both
 * regexes.
 */
function extractModules(architectureMd: string): string[] {
  const modules: string[] = [];
  const seen = new Set<string>();

  // Pattern 1 — literal `src/modules/<name>` substring.
  for (const m of architectureMd.matchAll(/src\/modules\/([a-zA-Z0-9_-]+)\/?/g)) {
    const name = m[1];
    if (name && !seen.has(name)) {
      modules.push(name);
      seen.add(name);
    }
  }

  // Pattern 2 — `modules/` container line + up-to-10-line tree-child
  // scan. The 10-line cap is the brief's hard limit; do not expand it.
  const lines = architectureMd.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    if (!isModulesContainerLine(rawLine)) continue;
    // Real children of `modules/` are indented one tree-level deeper.
    // The number of `│` characters in the prefix is a robust depth
    // proxy: parent at depth N has N `│` chars, children at depth N+1
    // have N+1. Without this check a sibling top-level entry like
    // `├── shared/` would be misread as a child of the modules subtree
    // and the runner would happily commit a 'shared' entity to
    // DOMAIN.md to "reconcile" the false-positive module.
    const parentDepth = countLeadingPipes(rawLine);
    for (let j = i + 1; j < Math.min(i + 11, lines.length); j++) {
      const childRaw = lines[j] ?? '';
      const childTrimmed = childRaw.trim();
      // Empty lines are part of the tree spacing — keep scanning.
      // Anything starting with an alphabetical char, `#` (heading), or
      // `-` / `*` (horizontal rule / bullet list) is a section break.
      if (childTrimmed !== '' && /^[a-zA-Z#\-*]/.test(childTrimmed)) break;
      // If the line has tree decorations at our parent's depth or
      // shallower, we've reached a sibling — the modules/ subtree is
      // over.
      if (childTrimmed !== '' && countLeadingPipes(childRaw) <= parentDepth) break;
      const codeOnly = stripLineComment(childRaw);
      const childMatch = codeOnly.match(/[├└│─\s]+([a-zA-Z][a-zA-Z0-9_-]*)\/?(?:\s*[—–-].*)?$/);
      const name = childMatch?.[1];
      if (name && !seen.has(name)) {
        modules.push(name);
        seen.add(name);
      }
    }
  }

  return modules;
}

function isModulesContainerLine(line: string): boolean {
  const codeOnly = stripLineComment(line);
  return /\bmodules\/?\s*$/.test(codeOnly) || /\bmodules\/\s*[─│├└]/.test(codeOnly);
}

function countLeadingPipes(line: string): number {
  const match = line.match(/^([\s│├└─]*)/);
  const prefix = match?.[1] ?? '';
  return (prefix.match(/│/g) ?? []).length;
}

function stripLineComment(line: string): string {
  // Splits on the first `#` and keeps the leading portion. Markdown
  // ATX headings start with `#` at column 0 (no leading whitespace);
  // we treat `#` anywhere else as a code-block comment.
  const hashIdx = line.indexOf('#');
  if (hashIdx <= 0) return line.trimEnd();
  return line.slice(0, hashIdx).trimEnd();
}

function extractPrincipleIds(principlesMd: string): string[] {
  const ids = new Set<string>();
  // Match GP-001, GP-042, etc. — top-level `## GP-NNN ...` or inline `GP-NNN`
  for (const m of principlesMd.matchAll(/\bGP-\d{1,3}\b/g)) {
    if (m[0]) ids.add(m[0]);
  }
  return [...ids];
}
