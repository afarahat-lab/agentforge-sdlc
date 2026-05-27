/**
 * Constraint agent — validates generated code against architectural rules.
 *
 * Two-level checking:
 *   Level 1 — ESLint rules (fast, static): import boundaries, no-any, no-console
 *   Level 2 — AST rules (TypeScript compiler API): semantic architectural patterns
 *             that cannot be expressed as ESLint rules alone
 *
 * Never uses an LLM — must be fully deterministic.
 * Produces CONSTRAINT_VIOLATION signals with exact file and line locations.
 */

import type { GateTask, GateAgentResult, GateSignal, ConstraintViolation } from '../types';

const BUILT_IN_AST_RULES = [
  'no-direct-db-outside-adapter',
  'no-direct-llm-outside-core',
  'audit-record-on-state-change',
  'no-cross-domain-service-calls',
] as const;

type AstRuleId = typeof BUILT_IN_AST_RULES[number];

/**
 * Runs the constraint agent against all code artifacts in the task.
 * Returns a GateAgentResult with CONSTRAINT_VIOLATION signals for each violation.
 */
export async function runConstraintAgent(task: GateTask): Promise<GateAgentResult> {
  const startedAt = Date.now();
  const signals: GateSignal[] = [];

  const codeArtifacts = task.artifacts.filter(
    (a) => a.type === 'code' || a.type === 'test',
  );

  for (const artifact of codeArtifacts) {
    // Level 1: ESLint-based constraint rules
    const eslintViolations = await runEslintConstraints(
      artifact.path,
      artifact.content,
      task.harnessConfig.constraintRules.filter((r) => r.level === 'eslint'),
    );

    // Level 2: AST-based semantic rules
    const astViolations = await runAstConstraints(
      artifact.path,
      artifact.content,
      task.harnessConfig.constraintRules.filter((r) => r.level === 'ast'),
    );

    const allViolations = [...eslintViolations, ...astViolations];

    for (const violation of allViolations) {
      signals.push(buildConstraintSignal(task.correlationId, violation));
    }
  }

  return {
    agentRole: 'constraint-agent',
    status: signals.length === 0 ? 'passed' : 'failed',
    signals,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Runs ESLint programmatically against file content.
 * Uses the constraint rules defined in the project harness.
 *
 * Implementation note: uses ESLint Node.js API with in-memory virtual files.
 * Full implementation in Phase 2 — stub returns empty for now.
 */
async function runEslintConstraints(
  _filePath: string,
  _content: string,
  _rules: GateTask['harnessConfig']['constraintRules'],
): Promise<ConstraintViolation[]> {
  // Phase 2: implement ESLint programmatic API
  // const { ESLint } = await import('eslint');
  // const eslint = new ESLint({ useEslintrc: false, rules: buildRuleConfig(rules) });
  // const results = await eslint.lintText(content, { filePath });
  // return mapEslintResults(results, rules);
  return [];
}

/**
 * Runs AST-based semantic constraint checks using the TypeScript compiler API.
 * Detects patterns that ESLint rules cannot express.
 *
 * Full implementation in Phase 2 — stub returns empty for now.
 */
async function runAstConstraints(
  _filePath: string,
  _content: string,
  rules: GateTask['harnessConfig']['constraintRules'],
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];

  for (const rule of rules) {
    if (BUILT_IN_AST_RULES.includes(rule.check as AstRuleId)) {
      // Phase 2: implement TypeScript compiler API checks
      // const checker = buildTypeChecker(content, filePath);
      // violations.push(...runAstRule(rule.check as AstRuleId, checker, filePath));
    }
  }

  return violations;
}

/**
 * Maps a ConstraintViolation to a GateSignal.
 * All constraint violations are high severity — they represent architectural rules.
 */
function buildConstraintSignal(
  correlationId: string,
  violation: ConstraintViolation,
): GateSignal {
  return {
    id: crypto.randomUUID(),
    correlationId,
    type: 'CONSTRAINT_VIOLATION',
    severity: 'high',
    agentRole: 'constraint-agent',
    message: `[${violation.ruleId}] ${violation.message}`,
    location: violation.location,
    autoResolvable: true,  // code-agent can fix with the rule and location
  };
}
