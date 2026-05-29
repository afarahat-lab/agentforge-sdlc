/**
 * Drift agent — detects when context files have fallen out of date with
 * the codebase.
 *
 * Schedule: daily at 02:00 UTC (overridable via
 * `HARNESS.json` `maintenance.driftCheck.scheduleUtc`).
 *
 * Strategy:
 *   1. Clone the project repo (shallow enough to walk 30 days of history).
 *   2. `git log --since="30 days ago" --name-only --format=` to list
 *      every file changed in the last 30 days.
 *   3. Group changed files by module (`src/modules/<module>/...`).
 *   4. For each module with code changes, find the timestamp of the most
 *      recent commit to `docs/DOMAIN.md` and `AGENTS.md` (the global
 *      context files — fine grained DOMAIN sections per module are not
 *      enforced in the harness today).
 *   5. If the newest module code change is more than 7 days newer than
 *      the newest context-file change → drift detected.
 *
 * Resolution (ADR-018):
 *   - **Additive** drift fixes — appending an HTML comment to DOMAIN.md
 *     describing the observation — are committed directly to
 *     `defaultBranch`. This is the documented exception (drift-agent
 *     only, additive only, no deletes or rewrites).
 *   - Structural fixes (rewriting the section, removing an obsolete
 *     entity) are queued as `CONTEXT_UPDATE` maintenance intents so the
 *     generate layer handles them with proper review.
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit, type SimpleGit } from 'simple-git';
import { createContextLogger } from '@gestalt/core';
import type { MaintenanceFinding } from '@gestalt/core';
import type {
  MaintenanceAgentInput, MaintenanceAgentResult, MaintenanceIntent,
} from '../types';
import { authenticatedGitUrl, maintenanceIntentText } from './util';

const log = createContextLogger({ module: 'drift-agent' });

const HISTORY_WINDOW_DAYS = 30;
const STALENESS_THRESHOLD_DAYS = 7;
const CONTEXT_FILES = ['docs/DOMAIN.md', 'AGENTS.md'] as const;

export async function runDriftAgent(input: MaintenanceAgentInput): Promise<MaintenanceAgentResult> {
  const workDir = await mkdtemp(join(tmpdir(), `gestalt-drift-${input.projectId}-`));
  const findings: MaintenanceFinding[] = [];
  const intentsQueued: MaintenanceIntent[] = [];
  let directFixes = 0;

  try {
    const cloneUrl = authenticatedGitUrl(input.projectGitUrl, input.token);
    log.info({ projectId: input.projectId, workDir }, 'Cloning project for drift check');
    await simpleGit().clone(cloneUrl, workDir);
    const repo: SimpleGit = simpleGit(workDir);
    try {
      await repo.checkout(input.defaultBranch);
    } catch {
      // Branch may not exist yet on a brand-new repo.
    }

    // Most recent commit timestamps for each global context file.
    const contextLastChanged = new Map<string, number>();
    for (const file of CONTEXT_FILES) {
      const ts = await mostRecentCommitTimestamp(repo, file);
      contextLastChanged.set(file, ts);
    }
    const newestContextChange = Math.max(0, ...Array.from(contextLastChanged.values()));

    // Files changed in the window.
    const changedFiles = await filesChangedSince(repo, `${HISTORY_WINDOW_DAYS} days ago`);
    const moduleChanges = groupByModule(changedFiles);

    if (moduleChanges.size === 0) {
      log.info({ projectId: input.projectId }, 'No recent module changes — no drift to evaluate');
      return { intentsQueued, directFixes, findings };
    }

    const stalenessThresholdMs = STALENESS_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    for (const [moduleName, files] of moduleChanges) {
      const newestCodeChange = await newestCommitTimestampForFiles(repo, files);
      const driftMs = newestCodeChange - newestContextChange;
      if (driftMs <= stalenessThresholdMs) continue;

      const driftDays = Math.round(driftMs / 24 / 60 / 60 / 1000);
      const evidence = [
        `module: src/modules/${moduleName}`,
        `files changed in last ${HISTORY_WINDOW_DAYS}d: ${files.length}`,
        `code newer than context by ~${driftDays} days`,
        `latest context update: ${new Date(newestContextChange).toISOString().slice(0, 10)}`,
      ].join('; ');

      findings.push({
        type: 'context-drift',
        description: `module '${moduleName}' has drifted ${driftDays} days from the project's context files`,
        affectedFiles: files,
        severity: driftDays > 21 ? 'high' : driftDays > 14 ? 'medium' : 'low',
        suggestedAction:
          `Re-review docs/DOMAIN.md for the '${moduleName}' module and reconcile with the recent code changes.`,
      });

      // Direct additive fix: append a dated note to docs/DOMAIN.md.
      const note = `\n<!-- drift-agent: module '${moduleName}' has ${files.length} file(s) changed in the last ${HISTORY_WINDOW_DAYS} days as of ${new Date().toISOString().slice(0, 10)}. Context-file last touched ~${driftDays} days earlier. Review and update if the domain model changed. -->\n`;
      const domainPath = join(workDir, 'docs/DOMAIN.md');
      try {
        const current = await readFile(domainPath, 'utf8');
        if (!current.includes(note)) {
          await writeFile(domainPath, current + note, 'utf8');
        }
      } catch {
        // docs/DOMAIN.md missing — skip the additive note for this module.
      }

      // Queue structural follow-up via the generate loop.
      intentsQueued.push({
        type: 'CONTEXT_UPDATE',
        projectId: input.projectId,
        priority: 'normal',
        affectedFiles: ['docs/DOMAIN.md', ...files.slice(0, 10)],
        evidence,
        suggestedAction: maintenanceIntentText(
          'CONTEXT_UPDATE',
          `Update docs/DOMAIN.md to reflect the recent changes in src/modules/${moduleName}. ${files.length} files changed in the last ${HISTORY_WINDOW_DAYS} days; the DOMAIN.md entry has not been touched in ~${driftDays} days. Review the latest code and bring the domain model in sync.`,
        ),
      });
    }

    // Commit the additive notes (ADR-018 exception). Only if we wrote
    // something — repo.status detects no-ops.
    await repo.addConfig('user.name', 'Gestalt Drift Agent');
    await repo.addConfig('user.email', 'drift-agent@gestalt.local');
    await repo.add('.');
    const status = await repo.status();
    if (status.files.length > 0) {
      await repo.commit(
        `docs: drift-agent observations on ${new Date().toISOString().slice(0, 10)} [gestalt-maintenance]`,
      );
      await repo.push('origin', input.defaultBranch);
      directFixes = status.files.length;
      log.info(
        { projectId: input.projectId, fileCount: status.files.length },
        'drift-agent committed additive notes',
      );
    }

    return { intentsQueued, directFixes, findings };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

async function filesChangedSince(repo: SimpleGit, since: string): Promise<string[]> {
  // --format= empties the format spec; --name-only emits one file per
  // line. Empty lines separate commits.
  const raw = await repo.raw(['log', `--since=${since}`, '--name-only', '--format=']);
  const files = new Set<string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    files.add(trimmed);
  }
  return Array.from(files);
}

async function mostRecentCommitTimestamp(repo: SimpleGit, file: string): Promise<number> {
  try {
    const raw = await repo.raw(['log', '-1', '--format=%aI', '--', file]);
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    return new Date(trimmed).getTime();
  } catch {
    return 0;
  }
}

async function newestCommitTimestampForFiles(repo: SimpleGit, files: string[]): Promise<number> {
  let newest = 0;
  for (const file of files) {
    const ts = await mostRecentCommitTimestamp(repo, file);
    if (ts > newest) newest = ts;
  }
  return newest;
}

function groupByModule(files: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const re = /^src\/modules\/([^/]+)\//;
  for (const file of files) {
    const match = re.exec(file);
    if (!match) continue;
    const module = match[1] ?? '';
    if (!module) continue;
    const existing = grouped.get(module) ?? [];
    existing.push(file);
    grouped.set(module, existing);
  }
  return grouped;
}
