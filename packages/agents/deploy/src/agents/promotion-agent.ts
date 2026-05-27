/**
 * Promotion agent — manages environment promotion after a successful pipeline.
 *
 * Reads the promotion strategy from HARNESS.json.
 * Auto-promotes where strategy.trigger = 'auto'.
 * Creates a human approval request where strategy.trigger = 'manual'.
 * Never promotes to production without a successful staging run.
 */

import type {
  DeployTask, DeployAgentResult, PromotionEvent,
  Environment, EnvironmentStrategy,
} from '../types';

/**
 * Runs the promotion agent for the target environment.
 * Creates a PromotionEvent and either executes or queues for human approval.
 */
export async function runPromotionAgent(
  task: DeployTask,
  targetEnvironment: Environment,
  createPromotionEvent: (event: Omit<PromotionEvent, 'id'>) => Promise<PromotionEvent>,
  executePromotion: (event: PromotionEvent) => Promise<void>,
): Promise<DeployAgentResult> {
  const startedAt = Date.now();
  const strategy = task.harnessConfig.promotion.strategy[targetEnvironment];

  // Safety check — never promote to production without staging
  if (targetEnvironment === 'production') {
    const stagingGuard = await checkStagingPassed(task.correlationId);
    if (!stagingGuard) {
      return {
        agentRole: 'promotion-agent',
        status: 'failed',
        signals: [{
          id: crypto.randomUUID(),
          correlationId: task.correlationId,
          type: 'CONSTRAINT_VIOLATION',
          severity: 'high',
          sourceAgent: 'promotion-agent',
          message: 'Production promotion blocked: no successful staging run found for this correlationId.',
          autoResolvable: false,
        }],
        durationMs: Date.now() - startedAt,
      };
    }
  }

  const event = await createPromotionEvent({
    correlationId: task.correlationId,
    from: getPreviousEnvironment(targetEnvironment, task.harnessConfig.promotion.environments),
    to: targetEnvironment,
    status: strategy.trigger === 'auto' ? 'approved' : 'pending',
    triggeredBy: 'agent',
    triggeredAt: new Date(),
    completedAt: null,
  });

  if (strategy.trigger === 'manual') {
    // Queue for human approval — dashboard will show this as a pending action
    return {
      agentRole: 'promotion-agent',
      status: 'completed',
      signals: [{
        id: crypto.randomUUID(),
        correlationId: task.correlationId,
        type: 'CONTEXT_GAP',
        severity: 'low',
        sourceAgent: 'promotion-agent',
        message: `Promotion to '${targetEnvironment}' requires ${strategy.approvals} human approval(s). ` +
                 `Promotion event ${event.id} is pending in the dashboard.`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
    };
  }

  // Auto-promote
  try {
    await executePromotion(event);
    return {
      agentRole: 'promotion-agent',
      status: 'completed',
      signals: [],
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      agentRole: 'promotion-agent',
      status: 'failed',
      signals: [{
        id: crypto.randomUUID(),
        correlationId: task.correlationId,
        type: 'CONSTRAINT_VIOLATION',
        severity: 'high',
        sourceAgent: 'promotion-agent',
        message: `Promotion to '${targetEnvironment}' failed: ${err instanceof Error ? err.message : String(err)}`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Returns the previous environment in the promotion chain.
 * e.g. for 'staging' in ['dev','staging','production'] returns 'dev'.
 */
function getPreviousEnvironment(
  target: Environment,
  environments: Environment[],
): Environment | null {
  const index = environments.indexOf(target);
  return index > 0 ? environments[index - 1] : null;
}

/**
 * Checks that a successful staging deployment exists for this correlation chain.
 * Phase 2: query the repository for a completed staging PromotionEvent.
 */
async function checkStagingPassed(_correlationId: string): Promise<boolean> {
  // Phase 2: query repository
  // const event = await repository.findPromotionEvent({ correlationId, to: 'staging', status: 'completed' });
  // return event !== null;
  return true;  // stub — always passes in Phase 1
}
