/**
 * @agentforge-sdlc/agents-maintenance
 * All types for the continuous maintenance layer.
 */

import type { SignalType } from '@agentforge-sdlc/core';

// ─── Agent roles ──────────────────────────────────────────────────────────────

export type MaintenanceAgentRole =
  | 'drift-agent'
  | 'alignment-agent'
  | 'gc-agent'
  | 'evaluation-agent';

// ─── Maintenance intent ───────────────────────────────────────────────────────

export type MaintenanceIntentType =
  | 'documentation-drift'
  | 'architecture-violation'
  | 'dead-code'
  | 'duplicate-logic'
  | 'deprecated-dependency'
  | 'performance-degradation'
  | 'error-rate-spike'
  | 'security-drift';

export type MaintenancePriority = 'critical' | 'high' | 'normal' | 'low';

export interface MaintenanceIntent {
  id: string;
  correlationId: string;
  source: MaintenanceAgentRole;
  type: MaintenanceIntentType;
  priority: MaintenancePriority;
  description: string;
  affectedFiles: string[];
  evidence: string;         // what the agent observed
  suggestedAction: string;  // recommendation — not a command
  createdAt: Date;
}

// ─── Agent result ─────────────────────────────────────────────────────────────

export interface MaintenanceAgentResult {
  agentRole: MaintenanceAgentRole;
  status: 'completed' | 'failed' | 'nothing-to-do';
  intentsQueued: MaintenanceIntent[];
  directFixes: DirectFix[];   // context file updates applied without generate loop
  signals: MaintenanceSignal[];
  durationMs: number;
  runAt: Date;
}

export interface DirectFix {
  file: string;
  description: string;
  before: string;
  after: string;
}

export interface MaintenanceSignal {
  id: string;
  correlationId: string;
  type: SignalType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceAgent: MaintenanceAgentRole;
  message: string;
  autoResolvable: boolean;
}

// ─── Drift detection ──────────────────────────────────────────────────────────

export interface DriftFinding {
  contextFile: string;
  driftType: 'missing-entity' | 'stale-field' | 'missing-decision' | 'outdated-architecture';
  description: string;
  affectedFiles: string[];
  severity: 'low' | 'medium' | 'high';
  directlyFixable: boolean;  // true if agent can fix without generate loop
}

// ─── Alignment detection ──────────────────────────────────────────────────────

export interface AlignmentViolation {
  ruleId: string;
  description: string;
  affectedFile: string;
  line: number;
  severity: 'medium' | 'high';
}

// ─── GC findings ─────────────────────────────────────────────────────────────

export interface GCFinding {
  type: 'dead-code' | 'duplicate-logic' | 'deprecated-dependency';
  description: string;
  affectedFiles: string[];
  estimatedImpact: 'low' | 'medium' | 'high';
  autoFixable: boolean;
}

// ─── Monitoring adapter ───────────────────────────────────────────────────────

export type MonitoringAdapterType = 'prometheus' | 'datadog' | 'azure-monitor';

export type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

export interface MetricsQuery {
  metric: string;
  labels?: Record<string, string>;
  window: Duration;
}

export interface MetricSample {
  timestamp: Date;
  value: number;
  labels: Record<string, string>;
}

export interface MonitoringAlert {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  firedAt: Date;
  service: string;
  description: string;
}

export interface MonitoringAdapter {
  readonly type: MonitoringAdapterType;
  getMetrics(query: MetricsQuery): Promise<MetricSample[]>;
  getAlerts(since: Date): Promise<MonitoringAlert[]>;
  getErrorRate(service: string, window: Duration): Promise<number>;
  getLatencyP99(service: string, window: Duration): Promise<number>;
}

// ─── Evaluation thresholds ────────────────────────────────────────────────────

export interface EvaluationThresholds {
  errorRatePercent: number;       // e.g. 5.0 = alert if error rate > 5%
  latencyP99Ms: number;           // e.g. 2000 = alert if p99 > 2000ms
  alertCountWindow: Duration;     // window to count alerts in
  alertCountThreshold: number;    // number of alerts before intent is queued
}

// ─── Maintenance harness config ───────────────────────────────────────────────

export interface MaintenanceHarnessConfig {
  projectRoot: string;
  driftCheck: {
    enabled: boolean;
    scheduleUtc: string;
  };
  alignmentCheck: {
    enabled: boolean;
    scheduleUtc: string;
  };
  gcCheck: {
    enabled: boolean;
    scheduleUtc: string;
  };
  monitoring: {
    adapter: MonitoringAdapterType;
    connectionConfig: Record<string, string>;
    thresholds: EvaluationThresholds;
  } | null;  // null if no monitoring configured
}
