/**
 * Gate result validator — ensures GateResult is structurally valid
 * before being returned to the orchestrator.
 *
 * Catches missing fields and invalid state combinations early.
 * Throws on failure — caller treats as gate error.
 */

import type { GateResult } from '../types';

/**
 * Validates a GateResult before it leaves the quality gate layer.
 * Throws a descriptive error if the result is structurally invalid.
 */
export function validateGateResult(result: GateResult): void {
  if (!result.correlationId) {
    throw new Error('GateResult missing correlationId');
  }

  if (!['pass', 'fail', 'escalate'].includes(result.verdict)) {
    throw new Error(`GateResult has invalid verdict: ${result.verdict}`);
  }

  // A passing gate must have no signals
  if (result.verdict === 'pass' && result.signals.length > 0) {
    throw new Error(
      `GateResult verdict is 'pass' but contains ${result.signals.length} signal(s). ` +
      'A passing gate must have zero signals.',
    );
  }

  // An escalating gate must have at least one GOLDEN_PRINCIPLE_BREACH
  if (result.verdict === 'escalate') {
    const hasBreach = result.signals.some((s) => s.type === 'GOLDEN_PRINCIPLE_BREACH');
    if (!hasBreach) {
      throw new Error(
        "GateResult verdict is 'escalate' but contains no GOLDEN_PRINCIPLE_BREACH signals.",
      );
    }
    // Escalating gate must not have a retry recommendation
    if (result.retryRecommendation !== null) {
      throw new Error(
        "GateResult verdict is 'escalate' but has a retryRecommendation. " +
        'Escalated gates do not retry — they require human intervention.',
      );
    }
  }

  // A failing gate must have a retry recommendation
  if (result.verdict === 'fail' && result.retryRecommendation === null) {
    throw new Error(
      "GateResult verdict is 'fail' but retryRecommendation is null. " +
      'Failing gates must provide retry guidance to the generate layer.',
    );
  }

  // All signals must have a correlationId matching the result
  const mismatchedSignals = result.signals.filter(
    (s) => s.correlationId !== result.correlationId,
  );
  if (mismatchedSignals.length > 0) {
    throw new Error(
      `${mismatchedSignals.length} signal(s) have a correlationId that does not match the GateResult.`,
    );
  }

  // Review agent result must be present
  const hasReviewAgent = result.agentResults.some((r) => r.agentRole === 'review-agent');
  if (!hasReviewAgent) {
    throw new Error('GateResult is missing review-agent result. Review agent must always run.');
  }
}
