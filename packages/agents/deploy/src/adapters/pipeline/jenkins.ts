/**
 * Jenkins pipeline adapter.
 * Uses Jenkins REST API with crumb authentication to trigger and monitor builds.
 * Full implementation: Phase 2.
 */
import type { PipelineAdapter, PipelineTriggerConfig, PipelineRun, PipelineRunStatus, StageResult } from '../../types';

export class JenkinsAdapter implements PipelineAdapter {
  readonly type = 'jenkins' as const;
  async trigger(_config: PipelineTriggerConfig): Promise<PipelineRun> {
    throw new Error('jenkins adapter not yet implemented');
  }
  async getStatus(_runId: string): Promise<PipelineRunStatus> {
    throw new Error('jenkins adapter not yet implemented');
  }
  async getStageResults(_runId: string): Promise<StageResult[]> {
    throw new Error('jenkins adapter not yet implemented');
  }
  async cancel(_runId: string): Promise<void> {
    throw new Error('jenkins adapter not yet implemented');
  }
}
