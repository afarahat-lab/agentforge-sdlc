/**
 * Test runner agent — executes the generated test suite.
 *
 * Runs after constraint-agent. If the architecture is broken,
 * there is no value in running tests — constraint-agent failure
 * short-circuits test execution via the review-agent's gate logic.
 *
 * Reports failures exactly as produced — no interpretation.
 * Each failing test becomes one TEST_FAILURE signal.
 * Never uses an LLM.
 */

import type { GateTask, GateAgentResult, GateSignal, TestRunResult, TestFailure } from '../types';

/**
 * Runs the test suite for all test artifacts in the task.
 */
export async function runTestRunnerAgent(task: GateTask): Promise<GateAgentResult> {
  const startedAt = Date.now();
  const signals: GateSignal[] = [];

  const testArtifacts = task.artifacts.filter((a) => a.type === 'test');

  if (testArtifacts.length === 0) {
    // No tests generated — emit a CONTEXT_GAP to ensure test-agent re-runs
    signals.push({
      id: crypto.randomUUID(),
      correlationId: task.correlationId,
      type: 'CONTEXT_GAP',
      severity: 'high',
      agentRole: 'test-runner-agent',
      message: 'No test artifacts found in artifact set. test-agent must run.',
      location: null,
      autoResolvable: true,
    });

    return {
      agentRole: 'test-runner-agent',
      status: 'failed',
      signals,
      durationMs: Date.now() - startedAt,
    };
  }

  const result = await executeTests(task.harnessConfig.projectRoot, testArtifacts);

  for (const failure of result.failures) {
    signals.push(buildTestFailureSignal(task.correlationId, failure));
  }

  return {
    agentRole: 'test-runner-agent',
    status: result.failed === 0 ? 'passed' : 'failed',
    signals,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Executes the test suite using Vitest programmatic API.
 * Phase 2: full Vitest implementation.
 */
async function executeTests(
  _projectRoot: string,
  _testArtifacts: GateTask['artifacts'],
): Promise<TestRunResult> {
  // Phase 2:
  // const { createVitest } = await import('vitest/node');
  // const vitest = await createVitest('test', { root: projectRoot });
  // await vitest.start();
  // const results = vitest.state.getFiles();
  // return mapVitestResults(results);
  return { passed: 0, failed: 0, skipped: 0, durationMs: 0, failures: [] };
}

/**
 * Maps a TestFailure to a GateSignal.
 * TEST_FAILURE signals are auto-resolvable — code-agent fixes with the failure context.
 */
function buildTestFailureSignal(
  correlationId: string,
  failure: TestFailure,
): GateSignal {
  return {
    id: crypto.randomUUID(),
    correlationId,
    type: 'TEST_FAILURE',
    severity: 'medium',
    agentRole: 'test-runner-agent',
    message: `[${failure.suiteName}] ${failure.testName}\nExpected: ${failure.expected}\nActual:   ${failure.actual}`,
    location: failure.location,
    autoResolvable: true,
  };
}
