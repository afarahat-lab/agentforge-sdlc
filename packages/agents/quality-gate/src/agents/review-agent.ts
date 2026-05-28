/**
 * Review agent — always runs last in the quality gate.
 *
 * Collects all signals from lint, security, constraint, and test-runner agents.
 * Applies gate logic to produce a single GateResult with verdict.
 * Never modifies or interprets signals — only classifies and routes.
 *
 * Gate logic (in priority order):
 *   1. Any GOLDEN_PRINCIPLE_BREACH → verdict: escalate
 *   2. Any CONSTRAINT_VIOLATION    → verdict: fail
 *   3. Any TEST_FAILURE            → verdict: fail
 *   4. Only LINT_FAILURE signals   → verdict: fail (auto-resolvable)
 *   5. No signals                  → verdict: pass
 */

import type {
  GateResult,
  GateAgentResult,
  GateSignal,
  GateVerdict,
  RetryRecommendation,
} from '../types';
import type { AgentRole } from '@gestalt/core';
import type { OrchestratorState } from '@gestalt/agents-generate';

/**
 * Synthesises all gate agent results into a final GateResult.
 */
export function synthesiseGateResult(
  correlationId: string,
  agentResults: GateAgentResult[],
  startedAt: Date,
): GateResult {
  const allSignals = agentResults.flatMap((r) => r.signals);
  const verdict = determineVerdict(allSignals);
  const retryRecommendation =
    verdict === 'fail' ? buildRetryRecommendation(allSignals) : null;

  return {
    correlationId,
    verdict,
    signals: allSignals,
    retryRecommendation,
    agentResults,
    durationMs: Date.now() - startedAt.getTime(),
    completedAt: new Date(),
  };
}

/**
 * Applies gate logic in priority order.
 * First matching condition wins.
 */
function determineVerdict(signals: GateSignal[]): GateVerdict {
  if (signals.some((s) => s.type === 'GOLDEN_PRINCIPLE_BREACH')) {
    return 'escalate';
  }
  if (signals.some((s) => s.type === 'CONSTRAINT_VIOLATION')) {
    return 'fail';
  }
  if (signals.some((s) => s.type === 'TEST_FAILURE')) {
    return 'fail';
  }
  if (signals.some((s) => s.type === 'LINT_FAILURE')) {
    return 'fail';
  }
  return 'pass';
}

/**
 * Builds a retry recommendation for the generate layer.
 * Maps signal types to the generate agents that should re-run.
 */
function buildRetryRecommendation(signals: GateSignal[]): RetryRecommendation {
  const targetAgents = new Set<AgentRole>();
  let retryFrom: OrchestratorState = 'coding';

  for (const signal of signals) {
    switch (signal.type) {
      case 'LINT_FAILURE':
        targetAgents.add('code-agent');
        break;
      case 'TEST_FAILURE':
        targetAgents.add('code-agent');
        targetAgents.add('test-agent');
        break;
      case 'CONSTRAINT_VIOLATION':
        targetAgents.add('code-agent');
        // Constraint violations may require redesign
        retryFrom = 'designing';
        break;
      case 'CONTEXT_GAP':
        targetAgents.add('context-agent');
        retryFrom = 'generating_context';
        break;
    }
  }

  return {
    targetAgents: Array.from(targetAgents),
    prioritySignals: signals.filter((s) => s.severity === 'high' || s.severity === 'critical'),
    retryFrom,
  };
}

/**
 * Returns true if the gate result should block the deploy layer.
 * Passes and escalations both stop the deploy layer — only approved passes proceed.
 */
export function isDeployBlocked(result: GateResult): boolean {
  return result.verdict !== 'pass';
}

/**
 * Returns a human-readable summary of the gate result for dashboard display.
 */
export function summariseGateResult(result: GateResult): string {
  if (result.verdict === 'pass') {
    return `Gate passed — all ${result.agentResults.length} checks clean`;
  }
  if (result.verdict === 'escalate') {
    const breaches = result.signals.filter((s) => s.type === 'GOLDEN_PRINCIPLE_BREACH');
    return `Gate escalated — ${breaches.length} golden principle breach(es) require human review`;
  }
  const counts = countByType(result.signals);
  const parts = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  return `Gate failed — ${parts}`;
}

function countByType(signals: GateSignal[]): Record<string, number> {
  return signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
}
