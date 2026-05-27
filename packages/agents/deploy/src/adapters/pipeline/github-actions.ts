/**
 * GitHub Actions pipeline adapter.
 * Uses GitHub REST API to trigger workflow_dispatch events and poll run status.
 * Full implementation: Phase 2.
 */
import type { PipelineAdapter, PipelineTriggerConfig, PipelineRun, PipelineRunStatus, StageResult } from '../../types';

export class GithubActionsAdapter implements PipelineAdapter {
  readonly type = 'github-actions' as const;
  async trigger(_config: PipelineTriggerConfig): Promise<PipelineRun> {
    throw new Error('github-actions adapter not yet implemented');
  }
  async getStatus(_runId: string): Promise<PipelineRunStatus> {
    throw new Error('github-actions adapter not yet implemented');
  }
  async getStageResults(_runId: string): Promise<StageResult[]> {
    throw new Error('github-actions adapter not yet implemented');
  }
  async cancel(_runId: string): Promise<void> {
    throw new Error('github-actions adapter not yet implemented');
  }
}
