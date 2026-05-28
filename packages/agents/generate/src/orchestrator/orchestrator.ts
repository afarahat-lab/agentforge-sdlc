/**
 * Generate layer orchestrator — main BullMQ worker.
 *
 * Receives an intent task, drives the fixed execution graph to completion,
 * handles quality gate feedback, and dispatches the final artifact set.
 *
 * State is persisted to the database after every step so that
 * the cycle can be resumed after a crash or clarification pause.
 */

import {
  createWorker, dispatch, getRepositories, getLLMClient,
  createContextLogger, QUEUE_NAMES,
} from '@gestalt/core';
import type { TaskMessage, TaskResult, QueueConfig } from '@gestalt/core';
import { buildExecutionPlan, getReadySteps, isPlanComplete, hasPlanFailed } from './plan-builder';
import { assembleContext } from './context-assembler';
import { routeFeedback, requiresEscalation } from './feedback-router';
import { transition } from './state-machine';
import { runIntentAgent } from '../agents/intent-agent';
import { runDesignAgent } from '../agents/design-agent';
import { runContextAgent } from '../agents/context-agent';
import { runLintConfigAgent } from '../agents/lint-config-agent';
import { runCodeAgent } from '../agents/code-agent';
import { runTestAgent } from '../agents/test-agent';
import type { ExecutionPlan, AgentResult, GateFeedback } from '../types';
import type { AgentRole } from '@gestalt/core';

const log = createContextLogger({ module: 'orchestrator' });

interface IntentTaskPayload {
  intentId: string;
  text: string;
  projectId: string;
  projectRoot?: string;
  clarification?: string;
  ambiguityId?: string;
  resume?: boolean;
}

/**
 * Starts the orchestrator worker.
 * Called once at server startup.
 */
export function startOrchestratorWorker(queueConfig: QueueConfig): void {
  createWorker<IntentTaskPayload>(
    QUEUE_NAMES.generate,
    handleIntentTask,
    queueConfig,
    { concurrency: 3 },
  );
  log.info('Orchestrator worker started');
}

/**
 * Handles a single intent task through the full execution graph.
 */
async function handleIntentTask(
  message: TaskMessage<IntentTaskPayload>,
): Promise<TaskResult> {
  const { correlationId } = message;
  const payload = message.payload;
  const childLog = createContextLogger({ module: 'orchestrator', correlationId });

  childLog.info({ intentId: payload.intentId }, 'Orchestrator received intent task');

  const projectRoot = payload.projectRoot ?? process.cwd();
  const { intents, executions } = getRepositories();

  // Build or resume execution plan
  const plan = buildExecutionPlan(correlationId, payload.intentId);

  try {
    // Update intent status
    await intents.updateStatus(payload.intentId, 'generating');

    // Drive the plan to completion
    await drivePlan(plan, projectRoot, queueConfigFromEnv(), childLog);

    if (hasPlanFailed(plan)) {
      await intents.updateStatus(payload.intentId, 'failed');
      return buildResult(correlationId, 'failed', plan);
    }

    // All steps completed — dispatch to quality gate
    childLog.info('All generate steps complete, dispatching to quality gate');
    await intents.updateStatus(payload.intentId, 'in-review');

    const allArtifacts = plan.steps
      .flatMap((s) => s.result?.artifacts ?? []);

    await dispatch({
      id: crypto.randomUUID(),
      correlationId,
      type: 'gate:review',
      sourceAgent: 'orchestrator',
      targetAgent: 'review-agent',
      priority: message.priority,
      payload: { intentId: payload.intentId, artifacts: allArtifacts },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    }, queueConfigFromEnv());

    return buildResult(correlationId, 'completed', plan);

  } catch (err) {
    childLog.error({ err }, 'Orchestrator error');
    await intents.updateStatus(payload.intentId, 'failed').catch(() => {});
    throw err;
  }
}

/**
 * Drives the execution plan step by step until all steps are done or failed.
 */
async function drivePlan(
  plan: ExecutionPlan,
  projectRoot: string,
  queueConfig: QueueConfig,
  childLog: ReturnType<typeof createContextLogger>,
): Promise<void> {
  const MAX_ITERATIONS = 20;  // safety limit
  let iterations = 0;

  while (!isPlanComplete(plan) && !hasPlanFailed(plan)) {
    if (++iterations > MAX_ITERATIONS) {
      throw new Error('Plan exceeded maximum iteration limit');
    }

    const readySteps = getReadySteps(plan);
    if (readySteps.length === 0) break;

    // Execute ready steps (parallel steps run concurrently)
    await Promise.all(
      readySteps.map(async (step) => {
        step.status = 'running';
        childLog.info({ agentRole: step.agentRole }, 'Running agent step');

        try {
          const context = await assembleContext(projectRoot, plan, step.agentRole as AgentRole);
          const task = {
            taskId: crypto.randomUUID(),
            correlationId: plan.correlationId,
            agentRole: step.agentRole as AgentRole,
            contextSnapshot: context,
            maxRetries: 2,
          };

          const llmClient = getLLMClient();
          const llmCall = async (prompt: string): Promise<string> => {
            const result = await llmClient.complete({
              messages: [{ role: 'user', content: prompt }],
              correlationId: plan.correlationId,
            });
            if (!result.ok) throw new Error(result.error.message);
            return result.value.content;
          };

          const result = await runAgent(step.agentRole as AgentRole, task, llmCall);

          step.status = result.status === 'skipped' ? 'skipped' : 'completed';
          step.result = result;

          // Check for high-impact ambiguity (CONTEXT_GAP from intent-agent)
          const hasContextGap = result.signals.some(
            (s) => s.type === 'CONTEXT_GAP' && step.agentRole === 'intent-agent',
          );
          if (hasContextGap) {
            childLog.warn('High-impact ambiguity detected — waiting for clarification');
            plan.state = 'waiting_for_clarification';
            await getRepositories().intents.updateStatus(plan.intentId, 'waiting-for-clarification');
            return;
          }

        } catch (err) {
          childLog.error({ err, agentRole: step.agentRole }, 'Agent step failed');
          step.status = 'failed';
        }
      }),
    );

    plan.updatedAt = new Date();
  }
}

/**
 * Routes a task to the correct specialist agent.
 */
async function runAgent(
  agentRole: AgentRole,
  task: Parameters<typeof runIntentAgent>[0],
  llmCall: (prompt: string) => Promise<string>,
): Promise<AgentResult> {
  switch (agentRole) {
    case 'intent-agent':      return runIntentAgent(task, llmCall);
    case 'design-agent':      return runDesignAgent(task, llmCall);
    case 'context-agent':     return runContextAgent(task, llmCall);
    case 'lint-config-agent': return runLintConfigAgent(task, llmCall);
    case 'code-agent':        return runCodeAgent(task, llmCall);
    case 'test-agent':        return runTestAgent(task, llmCall);
    default:
      throw new Error(`Unknown agent role in generate layer: ${agentRole}`);
  }
}

function buildResult(
  correlationId: string,
  status: TaskResult['status'],
  plan: ExecutionPlan,
): TaskResult {
  return {
    taskId: crypto.randomUUID(),
    correlationId,
    agentRole: 'orchestrator',
    status,
    output: { planState: plan.state },
    signals: plan.steps.flatMap((s) => s.result?.signals ?? []),
    tokensUsed: plan.steps.reduce((sum, s) => sum + (s.result?.tokensUsed ?? 0), 0),
    durationMs: Date.now() - plan.createdAt.getTime(),
    completedAt: new Date(),
  };
}

function queueConfigFromEnv(): QueueConfig {
  return { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' };
}
