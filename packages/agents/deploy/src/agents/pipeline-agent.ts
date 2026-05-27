/**
 * Pipeline agent — triggers CI/CD pipelines, monitors stage results,
 * maps outcomes to platform signals.
 *
 * Uses the pipeline adapter pattern for CI/CD system abstraction.
 * Uses the scanner interpreter pattern for enterprise security tool results.
 *
 * Never executes builds or scans directly — coordinates external systems only.
 */

import type {
  DeployTask, DeployAgentResult, DeploySignal,
  PipelineRun, StageResult, ScannerResult,
  PipelineAdapter, ScannerInterpreter,
} from '../types';

// Polling interval and timeout for pipeline status
const POLL_INTERVAL_MS = 15_000;   // 15 seconds
const PIPELINE_TIMEOUT_MS = 3_600_000;  // 1 hour

/**
 * Runs the pipeline agent.
 * Triggers the configured CI/CD pipeline, polls until completion,
 * interprets results, and returns typed signals.
 */
export async function runPipelineAgent(
  task: DeployTask,
  pipelineAdapter: PipelineAdapter,
  scannerInterpreter: ScannerInterpreter | null,
): Promise<{ result: DeployAgentResult; pipelineRun: PipelineRun | null }> {
  const startedAt = Date.now();
  const signals: DeploySignal[] = [];

  let pipelineRun: PipelineRun | null = null;

  try {
    // Trigger the pipeline
    pipelineRun = await pipelineAdapter.trigger({
      adapter: task.harnessConfig.pipeline.adapter,
      connectionConfig: task.harnessConfig.pipeline.triggerConfig,
      pipelineId: task.harnessConfig.pipeline.triggerConfig['pipelineId'] ?? '',
      branch: task.branch,
      commitSha: task.commitSha,
    });

    // Poll until completion or timeout
    const finalStatus = await pollUntilComplete(
      pipelineRun.id,
      pipelineAdapter,
      POLL_INTERVAL_MS,
      PIPELINE_TIMEOUT_MS,
    );

    if (finalStatus === 'cancelled') {
      signals.push(buildSignal(task.correlationId, 'CONSTRAINT_VIOLATION', 'medium',
        'Pipeline was cancelled externally', false));
      return { result: failed(signals, startedAt), pipelineRun };
    }

    if (finalStatus === 'failed') {
      const stageResults = await pipelineAdapter.getStageResults(pipelineRun.id);
      const stageSignals = interpretStageResults(
        task.correlationId, stageResults, scannerInterpreter,
        task.harnessConfig.pipeline.securityScanner,
      );
      signals.push(...stageSignals);
      return { result: failed(signals, startedAt), pipelineRun };
    }

    // Pipeline succeeded
    return {
      result: { agentRole: 'pipeline-agent', status: 'completed', signals: [], durationMs: Date.now() - startedAt },
      pipelineRun,
    };

  } catch (err) {
    signals.push(buildSignal(task.correlationId, 'CONTEXT_GAP', 'high',
      `Pipeline agent error: ${err instanceof Error ? err.message : String(err)}`, false));
    return { result: failed(signals, startedAt), pipelineRun };
  }
}

/**
 * Polls pipeline status until it reaches a terminal state or times out.
 */
async function pollUntilComplete(
  runId: string,
  adapter: PipelineAdapter,
  intervalMs: number,
  timeoutMs: number,
): Promise<'succeeded' | 'failed' | 'cancelled'> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await adapter.getStatus(runId);

    if (status === 'succeeded') return 'succeeded';
    if (status === 'failed')    return 'failed';
    if (status === 'cancelled') return 'cancelled';

    await sleep(intervalMs);
  }

  // Timeout — treat as failure
  await adapter.cancel(runId).catch(() => { /* best effort */ });
  return 'failed';
}

/**
 * Interprets stage results and maps failures to typed platform signals.
 * Security stage failures are routed through the scanner interpreter.
 */
function interpretStageResults(
  correlationId: string,
  stages: StageResult[],
  scannerInterpreter: ScannerInterpreter | null,
  scannerConfig: DeployTask['harnessConfig']['pipeline']['securityScanner'],
): DeploySignal[] {
  const signals: DeploySignal[] = [];

  for (const stage of stages) {
    if (stage.status !== 'failed') continue;

    if (stage.isSecurityStage && scannerInterpreter) {
      // Enterprise scanner stage — use interpreter for precise signal mapping
      const scannerResult = scannerInterpreter.interpret(stage.rawOutput);
      signals.push(...mapScannerResult(correlationId, scannerResult));
    } else {
      // Non-security stage failure — CONSTRAINT_VIOLATION
      signals.push(buildSignal(
        correlationId, 'CONSTRAINT_VIOLATION', 'high',
        `Pipeline stage '${stage.name}' failed. Check pipeline logs for details.`,
        true,
      ));
    }
  }

  return signals;
}

/**
 * Maps a ScannerResult to platform signals.
 * HIGH/CRITICAL findings → GOLDEN_PRINCIPLE_BREACH (GP-007).
 */
function mapScannerResult(
  correlationId: string,
  result: ScannerResult,
): DeploySignal[] {
  if (result.passed) return [];

  const criticalFindings = result.findings.filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH',
  );
  const otherFindings = result.findings.filter(
    (f) => f.severity === 'MEDIUM' || f.severity === 'LOW' || f.severity === 'INFO',
  );

  const signals: DeploySignal[] = [];

  if (criticalFindings.length > 0) {
    signals.push(buildSignal(
      correlationId, 'GOLDEN_PRINCIPLE_BREACH', 'critical',
      `[${result.scannerType.toUpperCase()}] ${criticalFindings.length} CRITICAL/HIGH finding(s). ` +
      criticalFindings.map((f) => `${f.title}${f.cwe ? ` (${f.cwe})` : ''}`).join('; '),
      false,  // GOLDEN_PRINCIPLE_BREACH is never auto-resolvable
    ));
  }

  if (otherFindings.length > 0) {
    signals.push(buildSignal(
      correlationId, 'CONSTRAINT_VIOLATION', 'medium',
      `[${result.scannerType.toUpperCase()}] ${otherFindings.length} MEDIUM/LOW finding(s). ` +
      otherFindings.map((f) => f.title).join('; '),
      true,
    ));
  }

  return signals;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSignal(
  correlationId: string,
  type: DeploySignal['type'],
  severity: DeploySignal['severity'],
  message: string,
  autoResolvable: boolean,
): DeploySignal {
  return {
    id: crypto.randomUUID(),
    correlationId,
    type,
    severity,
    sourceAgent: 'pipeline-agent',
    message,
    autoResolvable,
  };
}

function failed(signals: DeploySignal[], startedAt: number): DeployAgentResult {
  return { agentRole: 'pipeline-agent', status: 'failed', signals, durationMs: Date.now() - startedAt };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
