/**
 * Design agent — produces domain model changes, API contracts, component specs.
 * Always runs. Reads IntentSpec from prior artifacts.
 */

import type { AgentTask, AgentResult, DesignArtifact } from '../types';
import { buildDesignPrompt } from '../prompts/design-prompt';

const MAX_INTERNAL_RETRIES = 2;

export async function runDesignAgent(
  task: AgentTask,
  llmCall: (prompt: string) => Promise<string>,
): Promise<AgentResult> {
  const startedAt = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_INTERNAL_RETRIES; attempt++) {
    try {
      const prompt = buildDesignPrompt(task.contextSnapshot, attempt);
      const raw = await llmCall(prompt);
      const design = parseDesignArtifact(raw, task.correlationId);

      return {
        agentRole: 'design-agent',
        status: 'completed',
        artifacts: [
          {
            id: crypto.randomUUID(),
            correlationId: task.correlationId,
            type: 'design',
            path: '.gestalt/design-spec.json',
            content: JSON.stringify(design, null, 2),
            producedBy: 'design-agent',
            createdAt: new Date(),
          },
        ],
        signals: [],
        tokensUsed: 0,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  return failedResult('design-agent', task.correlationId, startedAt, lastError);
}

function parseDesignArtifact(raw: string, correlationId: string): DesignArtifact {
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean) as Partial<DesignArtifact>;
  return {
    correlationId,
    domainChanges: parsed.domainChanges ?? [],
    apiContracts: parsed.apiContracts ?? [],
    componentSpecs: parsed.componentSpecs ?? [],
  };
}

function failedResult(
  agentRole: AgentResult['agentRole'],
  correlationId: string,
  startedAt: number,
  error?: Error,
): AgentResult {
  return {
    agentRole,
    status: 'failed',
    artifacts: [],
    signals: [{
      id: crypto.randomUUID(),
      correlationId,
      type: 'CONTEXT_GAP',
      severity: 'high',
      sourceAgent: agentRole,
      message: `${agentRole} failed: ${error?.message ?? 'unknown error'}`,
    }],
    tokensUsed: 0,
    durationMs: Date.now() - startedAt,
  };
}
