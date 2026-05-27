/**
 * @agentforge-sdlc/agents-deploy
 * All types for the merge and deploy layer.
 */

import type { SignalType } from '@agentforge-sdlc/core';
import type { GateResult } from '@agentforge-sdlc/agents-quality-gate';

// ─── Pipeline adapters ────────────────────────────────────────────────────────

export type PipelineAdapterType =
  | 'github-actions'
  | 'azure-devops'
  | 'gitlab-ci'
  | 'jenkins';

export type ScannerType =
  | 'fortify'
  | 'checkmarx'
  | 'veracode'
  | 'sonarqube'
  | 'semgrep'      // platform default — no enterprise scanner
  | 'none';

export type PipelineRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface PipelineTriggerConfig {
  adapter: PipelineAdapterType;
  connectionConfig: Record<string, string>;  // adapter-specific, values from env
  pipelineId: string;
  branch: string;
  commitSha: string;
}

export interface PipelineRun {
  id: string;
  externalRunId: string;      // ID in the external CI/CD system
  adapter: PipelineAdapterType;
  status: PipelineRunStatus;
  url: string;                // link to the run in the external system
  triggeredAt: Date;
  completedAt: Date | null;
}

export interface StageResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'running';
  durationMs: number;
  rawOutput: string;
  isSecurityStage: boolean;
}

// ─── Pipeline adapter interface ───────────────────────────────────────────────

export interface PipelineAdapter {
  readonly type: PipelineAdapterType;
  trigger(config: PipelineTriggerConfig): Promise<PipelineRun>;
  getStatus(runId: string): Promise<PipelineRunStatus>;
  getStageResults(runId: string): Promise<StageResult[]>;
  cancel(runId: string): Promise<void>;
}

// ─── Scanner interpreter interface ───────────────────────────────────────────

export interface SecurityFindingSummary {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  location: { file: string; line?: number } | null;
  cwe?: string;
}

export interface ScannerResult {
  passed: boolean;
  scannerType: ScannerType;
  findings: SecurityFindingSummary[];
  signalType: Extract<SignalType, 'GOLDEN_PRINCIPLE_BREACH' | 'CONSTRAINT_VIOLATION'> | null;
  rawOutput: string;
}

export interface ScannerInterpreter {
  readonly name: ScannerType;
  interpret(rawResult: string): ScannerResult;
}

// ─── PR types ─────────────────────────────────────────────────────────────────

export type PRStatus = 'open' | 'merged' | 'closed' | 'draft';

export interface PullRequest {
  id: string;
  externalPrId: string;
  title: string;
  body: string;
  branch: string;
  targetBranch: string;
  status: PRStatus;
  url: string;
  createdAt: Date;
  mergedAt: Date | null;
}

export interface PRSummary {
  intentText: string;
  successCriteria: string[];
  artifactPaths: string[];
  gateResult: {
    verdict: string;
    signalCount: number;
    durationMs: number;
  };
  agentExecutionLog: string[];
}

// ─── Promotion types ──────────────────────────────────────────────────────────

export type Environment = 'dev' | 'staging' | 'production';

export type PromotionTrigger = 'auto' | 'manual';

export interface EnvironmentStrategy {
  trigger: PromotionTrigger;
  approvals: number;          // 0 = no approval required
  approvers?: string[];       // user IDs required to approve
}

export interface PromotionConfig {
  environments: Environment[];
  strategy: Record<Environment, EnvironmentStrategy>;
}

export interface PromotionEvent {
  id: string;
  correlationId: string;
  from: Environment | null;   // null for first deploy
  to: Environment;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  triggeredBy: 'agent' | 'human';
  triggeredAt: Date;
  completedAt: Date | null;
}

// ─── Deploy harness config ────────────────────────────────────────────────────

export interface DeployHarnessConfig {
  pipeline: {
    adapter: PipelineAdapterType;
    triggerConfig: Record<string, string>;
    stages: string[];
    securityScanner: {
      type: ScannerType;
      stage: string;
      failureSignal: SignalType;
      configPath: string | null;
    };
  };
  promotion: PromotionConfig;
}

// ─── Agent tasks ──────────────────────────────────────────────────────────────

export interface DeployTask {
  taskId: string;
  correlationId: string;
  gateResult: GateResult;
  artifactPaths: string[];
  commitSha: string;
  branch: string;
  harnessConfig: DeployHarnessConfig;
}

export interface DeployAgentResult {
  agentRole: 'pr-agent' | 'pipeline-agent' | 'promotion-agent';
  status: 'completed' | 'failed';
  signals: DeploySignal[];
  durationMs: number;
}

export interface DeploySignal {
  id: string;
  correlationId: string;
  type: SignalType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceAgent: 'pr-agent' | 'pipeline-agent' | 'promotion-agent';
  message: string;
  autoResolvable: boolean;
}
