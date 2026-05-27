/**
 * Lint agent — runs ESLint and Prettier checks against generated code.
 *
 * Produces LINT_FAILURE signals. These are always auto-resolvable and
 * never block alone at the architectural level — but they do fail the gate
 * until the code-agent fixes them.
 *
 * Runs in parallel with security-agent (both are fast).
 * Never uses an LLM.
 */

import type { GateTask, GateAgentResult, GateSignal } from '../types';

export interface LintViolation {
  file: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  severity: 1 | 2;  // 1 = warning, 2 = error (ESLint convention)
}

/**
 * Runs the lint agent against all code and test artifacts.
 */
export async function runLintAgent(task: GateTask): Promise<GateAgentResult> {
  const startedAt = Date.now();
  const signals: GateSignal[] = [];

  const lintableArtifacts = task.artifacts.filter(
    (a) => a.type === 'code' || a.type === 'test',
  );

  for (const artifact of lintableArtifacts) {
    const violations = await runEslint(artifact.path, artifact.content);

    for (const violation of violations) {
      signals.push(buildLintSignal(task.correlationId, violation));
    }
  }

  return {
    agentRole: 'lint-agent',
    status: signals.length === 0 ? 'passed' : 'failed',
    signals,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Runs ESLint against file content using the programmatic API.
 * Phase 2: full ESLint programmatic implementation.
 */
async function runEslint(
  _filePath: string,
  _content: string,
): Promise<LintViolation[]> {
  // Phase 2:
  // const { ESLint } = await import('eslint');
  // const eslint = new ESLint({ useEslintrc: true, cwd: task.harnessConfig.projectRoot });
  // const [result] = await eslint.lintText(content, { filePath });
  // return result.messages.map(m => ({
  //   file: filePath, line: m.line, column: m.column,
  //   ruleId: m.ruleId ?? 'unknown', message: m.message, severity: m.severity as 1|2
  // }));
  return [];
}

/**
 * Maps a LintViolation to a GateSignal.
 * All lint signals are auto-resolvable — code-agent fixes them.
 */
function buildLintSignal(
  correlationId: string,
  violation: LintViolation,
): GateSignal {
  return {
    id: crypto.randomUUID(),
    correlationId,
    type: 'LINT_FAILURE',
    severity: violation.severity === 2 ? 'medium' : 'low',
    agentRole: 'lint-agent',
    message: `[${violation.ruleId}] ${violation.message}`,
    location: {
      file: violation.file,
      line: violation.line,
      column: violation.column,
      rule: violation.ruleId,
    },
    autoResolvable: true,
  };
}
