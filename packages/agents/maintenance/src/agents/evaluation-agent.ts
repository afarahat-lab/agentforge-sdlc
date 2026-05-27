/**
 * Evaluation agent — analyses runtime metrics and queues intents when
 * production health degrades beyond configured thresholds.
 *
 * Trigger: continuous — runs whenever monitoring metrics are available.
 * Not schedule-based like the other maintenance agents.
 *
 * Detection:
 *   - Error rate spike above threshold
 *   - P99 latency above threshold
 *   - Alert storm (many alerts in a short window)
 *
 * Resolution:
 *   Always queues a MaintenanceIntent — never directly modifies code.
 *   Priority is 'critical' for error spikes, 'high' for latency degradation.
 *
 * Important: this agent diagnoses, it does not fix. The intent it queues
 * goes to the generate layer which must determine the actual code change needed.
 */

import type {
  MaintenanceAgentResult,
  MaintenanceIntent,
  MaintenanceHarnessConfig,
  MonitoringAdapter,
  MonitoringAlert,
  EvaluationThresholds,
} from '../types';

/**
 * Runs the evaluation agent against current monitoring metrics.
 */
export async function runEvaluationAgent(
  config: MaintenanceHarnessConfig,
  monitoringAdapter: MonitoringAdapter,
  queueIntent: (intent: Omit<MaintenanceIntent, 'id' | 'createdAt'>) => Promise<MaintenanceIntent>,
): Promise<MaintenanceAgentResult> {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const intentsQueued: MaintenanceIntent[] = [];

  if (!config.monitoring) {
    return nothing('evaluation-agent', startedAt);
  }

  const thresholds = config.monitoring.thresholds;

  try {
    const [errorRate, latencyP99, recentAlerts] = await Promise.all([
      monitoringAdapter.getErrorRate('*', '5m'),
      monitoringAdapter.getLatencyP99('*', '5m'),
      monitoringAdapter.getAlerts(subtractDuration(new Date(), thresholds.alertCountWindow)),
    ]);

    const issues = detectIssues(errorRate, latencyP99, recentAlerts, thresholds);

    for (const issue of issues) {
      const intent = await queueIntent({
        correlationId,
        source: 'evaluation-agent',
        type: issue.type,
        priority: issue.priority,
        description: issue.description,
        affectedFiles: [],   // unknown at detection time — generate layer investigates
        evidence: issue.evidence,
        suggestedAction: issue.suggestedAction,
      });
      intentsQueued.push(intent);
    }

    return {
      agentRole: 'evaluation-agent',
      status: issues.length === 0 ? 'nothing-to-do' : 'completed',
      intentsQueued,
      directFixes: [],
      signals: [],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  } catch (err) {
    return {
      agentRole: 'evaluation-agent',
      status: 'failed',
      intentsQueued: [],
      directFixes: [],
      signals: [{
        id: crypto.randomUUID(),
        correlationId,
        type: 'CONTEXT_GAP',
        severity: 'medium',
        sourceAgent: 'evaluation-agent',
        message: `Evaluation agent failed: ${err instanceof Error ? err.message : String(err)}`,
        autoResolvable: false,
      }],
      durationMs: Date.now() - startedAt,
      runAt: new Date(),
    };
  }
}

// ─── Issue detection ──────────────────────────────────────────────────────────

interface DetectedIssue {
  type: MaintenanceIntent['type'];
  priority: MaintenanceIntent['priority'];
  description: string;
  evidence: string;
  suggestedAction: string;
}

function detectIssues(
  errorRate: number,
  latencyP99: number,
  alerts: MonitoringAlert[],
  thresholds: EvaluationThresholds,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  if (errorRate > thresholds.errorRatePercent) {
    issues.push({
      type: 'error-rate-spike',
      priority: errorRate > thresholds.errorRatePercent * 2 ? 'critical' : 'high',
      description: `Error rate ${errorRate.toFixed(2)}% exceeds threshold of ${thresholds.errorRatePercent}%`,
      evidence: `Current error rate: ${errorRate.toFixed(2)}% (5-minute window). Threshold: ${thresholds.errorRatePercent}%`,
      suggestedAction: 'Investigate recent deployments and error logs to identify root cause',
    });
  }

  if (latencyP99 > thresholds.latencyP99Ms) {
    issues.push({
      type: 'performance-degradation',
      priority: 'high',
      description: `P99 latency ${latencyP99}ms exceeds threshold of ${thresholds.latencyP99Ms}ms`,
      evidence: `Current P99 latency: ${latencyP99}ms (5-minute window). Threshold: ${thresholds.latencyP99Ms}ms`,
      suggestedAction: 'Profile recent changes for performance regressions',
    });
  }

  if (alerts.length >= thresholds.alertCountThreshold) {
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
    issues.push({
      type: 'error-rate-spike',
      priority: criticalAlerts.length > 0 ? 'critical' : 'high',
      description: `${alerts.length} alert(s) fired in the last ${thresholds.alertCountWindow}`,
      evidence: alerts.map((a) => `[${a.severity.toUpperCase()}] ${a.name}: ${a.description}`).join('\n'),
      suggestedAction: 'Review fired alerts and correlate with recent deployments',
    });
  }

  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function subtractDuration(from: Date, duration: string): Date {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return from;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0;
  return new Date(from.getTime() - value * ms);
}

function nothing(agentRole: MaintenanceAgentResult['agentRole'], startedAt: number): MaintenanceAgentResult {
  return {
    agentRole,
    status: 'nothing-to-do',
    intentsQueued: [],
    directFixes: [],
    signals: [],
    durationMs: Date.now() - startedAt,
    runAt: new Date(),
  };
}
