/**
 * Quality-gate orchestrator — BullMQ worker.
 *
 * Drains `bull:gestalt-gate:*`. Consumes the `gate:review` task the
 * generate-orchestrator dispatches at the end of a successful generate
 * cycle. For each task the orchestrator:
 *
 *   1. Looks up the project and clones the repo into a fresh temp dir
 *      (mirrors the generate orchestrator). The clone is at the Git tip
 *      the generate cycle just pushed.
 *   2. Builds a GateTask with the artifacts the generate orchestrator
 *      sent over the queue + a default GateHarnessConfig.
 *   3. Runs constraint-agent and llm-review-agent in parallel. Each is
 *      wrapped with `agent_executions` create/update + SSE events
 *      (`agent.started`, `agent.completed`, `signal.emitted`).
 *   4. Persists each signal via `signals.save` and any artifacts the
 *      review-agent produced (a markdown review of the artifact set).
 *   5. Synthesises a GateResult (`synthesiseGateResult`) → verdict.
 *   6. Transitions the intent:
 *        - `pass`     → `approved`
 *        - `fail`     → `failed`     (no feedback-loop-back-to-generate yet)
 *        - `escalate` → `escalated`  (GOLDEN_PRINCIPLE_BREACH)
 *      The transition is broadcast on the in-process event bus.
 *   7. Emits a `gate.completed` event with the verdict + signal count.
 *
 * The temp clone is removed in a `finally` block on every code path.
 */

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';
import {
  createWorker, getRepositories, getLLMClient,
  createContextLogger, emitLiveEvent, QUEUE_NAMES,
} from '@gestalt/core';
import type {
  TaskMessage, TaskResult, QueueConfig,
  Artifact, PlatformSignal, ExecutionStatus, IntentStatus,
} from '@gestalt/core';
import { runConstraintAgent } from '../agents/constraint-agent';
import { runLlmReviewAgent } from '../agents/llm-review-agent';
import { synthesiseGateResult, summariseGateResult } from '../agents/review-agent';
import type {
  GateAgentResult, GateAgentRole, GateHarnessConfig, GateSignal, GateTask, ArtifactRef,
} from '../types';

const log = createContextLogger({ module: 'gate-orchestrator' });

interface GateTaskPayload {
  intentId: string;
  artifacts: Array<{
    id: string;
    correlationId?: string;
    type: string;
    path: string;
    content: string;
    producedBy?: string;
    createdAt?: string | Date;
  }>;
}

/**
 * Embed a Git PAT into an HTTPS clone URL. Mirrors the helper in
 * generate's orchestrator (same shape, same auth contract).
 */
function authenticatedGitUrl(gitUrl: string, token: string): string {
  if (!gitUrl.startsWith('http://') && !gitUrl.startsWith('https://')) {
    return gitUrl;
  }
  const url = new URL(gitUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

/**
 * Set the intent's status, persist it, and broadcast the transition
 * over the in-process event bus.
 */
async function transitionIntent(
  intentId: string,
  correlationId: string,
  status: IntentStatus,
): Promise<void> {
  const { intents } = getRepositories();
  await intents.updateStatus(intentId, status);
  emitLiveEvent('intent.status-changed', correlationId, { intentId, status });
}

/**
 * Looks up the project for this correlationId via the intents table so
 * the gate worker can resolve the gitUrl + PAT without the generate
 * orchestrator having to redundantly thread projectId on the queue.
 */
async function resolveProjectFor(intentId: string): Promise<{
  gitUrl: string;
  defaultBranch: string;
  token: string;
} | null> {
  const { intents, projects } = getRepositories();
  const intent = await intents.findById(intentId);
  if (!intent) return null;
  const project = await projects.findById(intent.projectId);
  if (!project) return null;
  const token = await projects.getCredential(project.id);
  if (!token) return null;
  return { gitUrl: project.gitUrl, defaultBranch: project.defaultBranch, token };
}

/**
 * Default GateHarnessConfig used when no project-specific config exists.
 * Future iterations should read this from the project's HARNESS.json.
 */
function defaultGateHarnessConfig(projectRoot: string): GateHarnessConfig {
  return {
    projectRoot,
    constraintRules: [],
    goldenPrinciples: [
      'GP-001: Every state-changing operation produces an audit record',
      'GP-002: RBAC enforced at middleware, never inline',
      'GP-003: Input validated at the API boundary',
      'GP-004: No sensitive data in logs',
    ],
    qualityGate: {
      maxRetries: 3,
      blockingSignals: ['GOLDEN_PRINCIPLE_BREACH', 'CONSTRAINT_VIOLATION'],
    },
  };
}

export function startGateWorker(queueConfig: QueueConfig): void {
  createWorker<GateTaskPayload>(
    QUEUE_NAMES.gate,
    handleGateTask,
    queueConfig,
    { concurrency: 2 },
  );
  log.info('Quality-gate worker started');
}

async function handleGateTask(message: TaskMessage<GateTaskPayload>): Promise<TaskResult> {
  const { correlationId } = message;
  const payload = message.payload;
  const childLog = createContextLogger({ module: 'gate-orchestrator', correlationId });
  const startedAt = new Date();

  childLog.info({ intentId: payload.intentId }, 'Quality gate received task');

  let workDir: string | null = null;
  try {
    const project = await resolveProjectFor(payload.intentId);
    if (!project) {
      throw new Error(`Cannot resolve project for intent ${payload.intentId}`);
    }

    workDir = await mkdtemp(join(tmpdir(), `gestalt-gate-${correlationId}-`));
    const cloneUrl = authenticatedGitUrl(project.gitUrl, project.token);
    childLog.info({ workDir }, 'Cloning project repo for gate review');
    await simpleGit().clone(cloneUrl, workDir);

    const gateTask: GateTask = {
      taskId: message.id,
      correlationId,
      artifacts: payload.artifacts.map((a) => ({
        id: a.id,
        type: a.type,
        path: a.path,
        content: a.content,
      })) as ArtifactRef[],
      harnessConfig: defaultGateHarnessConfig(workDir),
    };

    const llmClient = getLLMClient();
    const llmCall = async (prompt: string): Promise<string> => {
      const result = await llmClient.complete({
        messages: [{ role: 'user', content: prompt }],
        correlationId,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value.content;
    };

    // Run constraint + review in parallel. Each step persists its own
    // agent_executions row and emits its own SSE events; concurrency is
    // safe because each owns its own DB rows.
    const [constraintRes, reviewRes] = await Promise.all([
      runWithObservability(
        'constraint-agent',
        'gate:constraint',
        correlationId,
        payload.intentId,
        () => runConstraintAgent(gateTask),
        childLog,
      ),
      runWithObservability(
        'review-agent',
        'gate:review',
        correlationId,
        payload.intentId,
        async () => {
          const r = await runLlmReviewAgent(gateTask, llmCall);
          // Side-effect: persist the markdown review artifact so the
          // operator can read the prose feedback alongside the signals.
          if (r.reviewArtifact) {
            const { artifacts } = getRepositories();
            await artifacts.save(r.reviewArtifact as unknown as Artifact);
          }
          return r;
        },
        childLog,
      ),
    ]);

    const result = synthesiseGateResult(
      correlationId,
      [constraintRes, reviewRes],
      startedAt,
    );

    childLog.info(
      { verdict: result.verdict, signalCount: result.signals.length },
      summariseGateResult(result),
    );

    emitLiveEvent('gate.completed', correlationId, {
      intentId: payload.intentId,
      verdict: result.verdict,
      signalCount: result.signals.length,
      agentResults: result.agentResults.map((a) => ({
        agentRole: a.agentRole,
        status: a.status,
        signalCount: a.signals.length,
        durationMs: a.durationMs,
      })),
      summary: summariseGateResult(result),
    });

    const nextStatus: IntentStatus =
      result.verdict === 'pass' ? 'approved'
        : result.verdict === 'escalate' ? 'escalated'
        : 'failed';
    await transitionIntent(payload.intentId, correlationId, nextStatus);

    return {
      taskId: message.id,
      correlationId,
      agentRole: 'review-agent',
      status: result.verdict === 'pass' ? 'completed' : 'failed',
      output: {
        verdict: result.verdict,
        signalCount: result.signals.length,
        summary: summariseGateResult(result),
      },
      signals: [],
      tokensUsed: 0,
      durationMs: Date.now() - startedAt.getTime(),
      completedAt: new Date(),
    };
  } catch (err) {
    childLog.error({ err }, 'Quality-gate orchestrator error');
    await transitionIntent(payload.intentId, correlationId, 'failed').catch(() => undefined);
    throw err;
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Wraps a gate-agent run with the same DB + SSE observability pattern the
 * generate orchestrator uses: creates the `agent_executions` row, runs
 * the agent, persists its signals, updates the row to a terminal status,
 * and emits `agent.started` / `agent.completed` / `signal.emitted` along
 * the way.
 */
async function runWithObservability<T extends GateAgentResult>(
  agentRole: GateAgentRole,
  taskType: string,
  correlationId: string,
  intentId: string,
  invoke: () => Promise<T>,
  childLog: ReturnType<typeof createContextLogger>,
): Promise<T> {
  const { executions, signals } = getRepositories();
  const executionId = crypto.randomUUID();
  const startedAt = new Date();

  await executions.create({
    id: executionId,
    correlationId,
    intentId,
    agentRole,
    taskType,
    status: 'running',
    tokensUsed: 0,
    durationMs: null,
    startedAt,
    completedAt: null,
  });
  emitLiveEvent('agent.started', correlationId, {
    executionId,
    agentRole,
    taskType,
    startedAt: startedAt.toISOString(),
  });

  let result: T;
  try {
    result = await invoke();
  } catch (err) {
    childLog.error({ err, agentRole }, 'Gate agent threw');
    const completedAt = new Date();
    await executions.updateStatus(executionId, 'failed', {
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
    }).catch(() => undefined);
    emitLiveEvent('agent.completed', correlationId, {
      executionId,
      agentRole,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    // Re-shape the failure into a GateAgentResult so callers can keep
    // synthesising a verdict.
    return {
      agentRole,
      status: 'errored',
      signals: [],
      durationMs: completedAt.getTime() - startedAt.getTime(),
    } as unknown as T;
  }

  for (const sig of result.signals) {
    await signals.save(gateSignalToPlatformSignal(sig));
    emitLiveEvent('signal.emitted', correlationId, {
      executionId,
      agentRole,
      type: sig.type,
      severity: sig.severity,
      sourceAgent: sig.agentRole,
      message: sig.message,
    });
  }

  const completedAt = new Date();
  const stepStatus: ExecutionStatus = result.status === 'errored'
    ? 'failed' : result.status === 'failed' ? 'failed' : 'completed';
  await executions.updateStatus(executionId, stepStatus, {
    durationMs: completedAt.getTime() - startedAt.getTime(),
    startedAt,
    completedAt,
  });
  emitLiveEvent('agent.completed', correlationId, {
    executionId,
    agentRole,
    status: stepStatus,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    signalCount: result.signals.length,
  });

  return result;
}

/**
 * Convert the gate-layer `GateSignal` shape to the platform-wide
 * `PlatformSignal` shape (drop `agentRole`, rename to `sourceAgent`,
 * ensure `createdAt`).
 */
function gateSignalToPlatformSignal(s: GateSignal): PlatformSignal {
  const out: PlatformSignal = {
    id: s.id,
    correlationId: s.correlationId,
    type: s.type,
    severity: s.severity,
    sourceAgent: s.agentRole,
    message: s.message,
    autoResolvable: s.autoResolvable,
    createdAt: new Date(),
  };
  if (s.location) out.location = s.location;
  return out;
}
