/**
 * GitLab CI pipeline adapter.
 * Uses GitLab REST API to trigger and monitor pipeline runs.
 * Full implementation: Phase 2.
 */
import type { PipelineAdapter, PipelineTriggerConfig, PipelineRun, PipelineRunStatus, StageResult } from '../../types';

export class GitlabCiAdapter implements PipelineAdapter {
  readonly type = 'gitlab-ci' as const;
  async trigger(_config: PipelineTriggerConfig): Promise<PipelineRun> {
    throw new Error('gitlab-ci adapter not yet implemented');
  }
  async getStatus(_runId: string): Promise<PipelineRunStatus> {
    throw new Error('gitlab-ci adapter not yet implemented');
  }
  async getStageResults(_runId: string): Promise<StageResult[]> {
    throw new Error('gitlab-ci adapter not yet implemented');
  }
  async cancel(_runId: string): Promise<void> {
    throw new Error('gitlab-ci adapter not yet implemented');
  }
}
