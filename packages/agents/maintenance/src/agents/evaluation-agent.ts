/**
 * Evaluation agent — polls the project's monitoring system and queues
 * a `PERFORMANCE_DEGRADATION` or `SECURITY_FINDING` intent when a
 * configured threshold is breached.
 *
 * Schedule: every 15 minutes (overridable via HARNESS.json).
 *
 * Never calls monitoring systems directly (ADR-020) — always through
 * the resolved `MonitoringAdapter`. With no monitoring configured the
 * `NoopMonitoringAdapter` returns zeros and no intents are queued.
 *
 * Duplicate guard: before queuing a `PERFORMANCE_DEGRADATION` intent,
 * checks `intents` table for any open (`pending` / `generating`) intent
 * on the same project whose text already carries the
 * `[gestalt-maintenance/PERFORMANCE_DEGRADATION]` marker. Avoids
 * piling on duplicate work while a previous cycle is still mid-flight.
 */

import { createContextLogger, getRepositories } from '@gestalt/core';
import type { MaintenanceFinding } from '@gestalt/core';
import type {
  MaintenanceAgentInput, MaintenanceAgentResult, MaintenanceIntent,
  MaintenanceIntentType, MonitoringThresholds,
} from '../types';
import { DEFAULT_MONITORING_THRESHOLDS } from '../types';
import { resolveMonitoringAdapter } from '../adapters/resolver';
import { maintenanceIntentPrefix, maintenanceIntentText } from './util';

const log = createContextLogger({ module: 'evaluation-agent' });

const WINDOW_MINUTES = 15;

export async function runEvaluationAgent(input: MaintenanceAgentInput): Promise<MaintenanceAgentResult> {
  const monitoring = input.harness.maintenance?.monitoring;
  if (monitoring && monitoring.enabled === false) {
    log.info({ projectId: input.projectId }, 'monitoring disabled — skipping evaluation');
    return { intentsQueued: [], directFixes: 0, findings: [] };
  }

  const thresholds: MonitoringThresholds = {
    ...DEFAULT_MONITORING_THRESHOLDS,
    ...(monitoring?.thresholds ?? {}),
  };

  const adapter = resolveMonitoringAdapter({
    projectId: input.projectId,
    harness: input.harness,
  });

  const findings: MaintenanceFinding[] = [];
  const candidateIntents: MaintenanceIntent[] = [];

  let errorRate = 0;
  let latencyP99 = 0;
  let alertCount = 0;

  try {
    [errorRate, latencyP99, alertCount] = await Promise.all([
      adapter.getErrorRate({ windowMinutes: WINDOW_MINUTES }),
      adapter.getLatencyP99Ms({ windowMinutes: WINDOW_MINUTES }),
      adapter.getAlertCount({ windowMinutes: WINDOW_MINUTES }),
    ]);
  } catch (err) {
    log.error({ err, projectId: input.projectId, adapter: adapter.type }, 'monitoring query failed');
    findings.push({
      type: 'monitoring-query-failed',
      description: `failed to query monitoring (${adapter.type}): ${err instanceof Error ? err.message : String(err)}`,
      affectedFiles: [],
      severity: 'medium',
      suggestedAction: 'Check the monitoring adapter connection details in HARNESS.json.',
    });
    return { intentsQueued: [], directFixes: 0, findings };
  }

  log.info(
    {
      projectId: input.projectId,
      adapter: adapter.type,
      errorRate, latencyP99, alertCount,
    },
    'evaluation-agent collected metrics',
  );

  if (errorRate > thresholds.errorRatePercent) {
    candidateIntents.push(buildPerfIntent({
      projectId: input.projectId,
      metric: 'error rate',
      value: errorRate,
      unit: '%',
      threshold: thresholds.errorRatePercent,
    }));
    findings.push({
      type: 'metric-breach-error-rate',
      description: `error rate ${errorRate.toFixed(2)}% > threshold ${thresholds.errorRatePercent}%`,
      affectedFiles: [],
      severity: 'high',
      suggestedAction: 'Investigate the recent deployment for regressions in error handling.',
    });
  }

  if (latencyP99 > thresholds.latencyP99Ms) {
    candidateIntents.push(buildPerfIntent({
      projectId: input.projectId,
      metric: 'p99 latency',
      value: latencyP99,
      unit: 'ms',
      threshold: thresholds.latencyP99Ms,
    }));
    findings.push({
      type: 'metric-breach-p99-latency',
      description: `p99 latency ${latencyP99.toFixed(0)}ms > threshold ${thresholds.latencyP99Ms}ms`,
      affectedFiles: [],
      severity: 'high',
      suggestedAction: 'Look for slow endpoints introduced by the recent change set.',
    });
  }

  if (alertCount > thresholds.alertCountThreshold) {
    candidateIntents.push(buildSecurityIntent({
      projectId: input.projectId,
      alertCount,
      threshold: thresholds.alertCountThreshold,
    }));
    findings.push({
      type: 'monitoring-alerts-firing',
      description: `${alertCount} monitoring alert(s) firing > threshold ${thresholds.alertCountThreshold}`,
      affectedFiles: [],
      severity: alertCount > thresholds.alertCountThreshold * 2 ? 'high' : 'medium',
      suggestedAction: 'Review the firing alerts in the monitoring dashboard; address the root cause.',
    });
  }

  if (candidateIntents.length === 0) {
    return { intentsQueued: [], directFixes: 0, findings };
  }

  // Duplicate guard — skip any candidate whose marker already appears on
  // an open intent for the same project.
  const intentsQueued = await dedupeAgainstOpenIntents(input.projectId, candidateIntents);
  return { intentsQueued, directFixes: 0, findings };
}

// ─── Intent builders ─────────────────────────────────────────────────────────

function buildPerfIntent(args: {
  projectId: string;
  metric: 'error rate' | 'p99 latency';
  value: number;
  unit: '%' | 'ms';
  threshold: number;
}): MaintenanceIntent {
  const type: MaintenanceIntentType = 'PERFORMANCE_DEGRADATION';
  const evidence = `${args.metric} = ${args.value.toFixed(2)}${args.unit} (threshold ${args.threshold}${args.unit})`;
  return {
    type,
    projectId: args.projectId,
    priority: 'high',
    affectedFiles: [],
    evidence,
    suggestedAction: maintenanceIntentText(
      type,
      `Investigate the spike in ${args.metric} (${args.value.toFixed(2)}${args.unit} over the last ${WINDOW_MINUTES} minutes, threshold ${args.threshold}${args.unit}). Review the most recent code changes for regressions and add or tighten tests to prevent recurrence.`,
    ),
  };
}

function buildSecurityIntent(args: {
  projectId: string;
  alertCount: number;
  threshold: number;
}): MaintenanceIntent {
  const type: MaintenanceIntentType = 'SECURITY_FINDING';
  const evidence = `${args.alertCount} firing alerts (threshold ${args.threshold})`;
  return {
    type,
    projectId: args.projectId,
    priority: 'critical',
    affectedFiles: [],
    evidence,
    suggestedAction: maintenanceIntentText(
      type,
      `Review the ${args.alertCount} firing monitoring alerts on this project (threshold ${args.threshold}). Confirm whether the alerts indicate a security issue and propose remediation in the codebase.`,
    ),
  };
}

// ─── Duplicate guard ─────────────────────────────────────────────────────────

async function dedupeAgainstOpenIntents(
  projectId: string,
  candidates: MaintenanceIntent[],
): Promise<MaintenanceIntent[]> {
  const { intents } = getRepositories();
  const open: { text: string }[] = [];
  // IntentRepository.list filters by a single status — call twice and merge.
  for (const status of ['pending', 'generating'] as const) {
    const { records } = await intents.list({
      projectId,
      status,
      limit: 200,
      offset: 0,
    });
    open.push(...records.map((r) => ({ text: r.text })));
  }
  const openTexts = open.map((r) => r.text);

  return candidates.filter((c) => {
    const prefix = maintenanceIntentPrefix(c.type);
    return !openTexts.some((t) => t.includes(prefix));
  });
}
