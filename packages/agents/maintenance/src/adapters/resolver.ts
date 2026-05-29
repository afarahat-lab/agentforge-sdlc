/**
 * Resolves the active MonitoringAdapter for a project from the
 * `maintenance.monitoring` section of its HARNESS.json.
 *
 *   adapter: 'prometheus' → PrometheusAdapter (needs `url`)
 *   adapter: 'datadog'    → DatadogAdapter    (needs `apiKey` + `appKey`)
 *   anything else         → NoopMonitoringAdapter
 *
 * Missing or malformed config falls back to NoOp rather than throwing —
 * evaluation-agent should still tick on the cron schedule, it just
 * observes zero metrics.
 */

import { createContextLogger } from '@gestalt/core';
import type { MonitoringAdapter, HarnessSubset } from '../types';
import { NoopMonitoringAdapter } from './noop-monitoring-adapter';
import { PrometheusAdapter } from './prometheus-adapter';
import { DatadogAdapter } from './datadog-adapter';

const log = createContextLogger({ module: 'monitoring-adapter:resolver' });

export function resolveMonitoringAdapter(args: {
  projectId: string;
  harness: HarnessSubset | null | undefined;
}): MonitoringAdapter {
  const monitoring = args.harness?.maintenance?.monitoring;
  const declared = monitoring?.adapter;
  const cc = monitoring?.connectionConfig ?? {};

  if (declared === 'prometheus') {
    const url = cc['url'];
    if (!url) {
      log.warn(
        { projectId: args.projectId },
        'prometheus declared but no connectionConfig.url — falling back to noop',
      );
      return new NoopMonitoringAdapter();
    }
    return new PrometheusAdapter({
      baseUrl: url,
      ...(cc['bearerToken'] ? { bearerToken: cc['bearerToken'] } : {}),
    });
  }

  if (declared === 'datadog') {
    const apiKey = cc['apiKey'];
    const appKey = cc['appKey'];
    if (!apiKey || !appKey) {
      log.warn(
        { projectId: args.projectId },
        'datadog declared but missing apiKey/appKey — falling back to noop',
      );
      return new NoopMonitoringAdapter();
    }
    return new DatadogAdapter({
      apiKey,
      appKey,
      ...(cc['site'] ? { site: cc['site'] } : {}),
    });
  }

  if (declared && declared !== 'noop') {
    log.warn(
      { projectId: args.projectId, declared },
      `Monitoring adapter '${declared}' is not implemented — falling back to noop`,
    );
  }
  return new NoopMonitoringAdapter();
}
