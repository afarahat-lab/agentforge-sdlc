/**
 * Azure DevOps pipeline adapter.
 * Uses Azure DevOps REST API. Most common in GCC/MENA enterprise environments.
 * Full implementation: Phase 2.
 */
import type { PipelineAdapter, PipelineTriggerConfig, PipelineRun, PipelineRunStatus, StageResult } from '../../types';

export class AzureDevopsAdapter implements PipelineAdapter {
  readonly type = 'azure-devops' as const;
  async trigger(_config: PipelineTriggerConfig): Promise<PipelineRun> {
    throw new Error('azure-devops adapter not yet implemented');
  }
  async getStatus(_runId: string): Promise<PipelineRunStatus> {
    throw new Error('azure-devops adapter not yet implemented');
  }
  async getStageResults(_runId: string): Promise<StageResult[]> {
    throw new Error('azure-devops adapter not yet implemented');
  }
  async cancel(_runId: string): Promise<void> {
    throw new Error('azure-devops adapter not yet implemented');
  }
}
