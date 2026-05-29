/**
 * NoOp monitoring adapter.
 *
 * Default when a project's `HARNESS.json` does not configure a
 * `maintenance.monitoring.adapter`. Returns zero for every metric so
 * evaluation-agent observes no threshold breaches and stays a no-op.
 *
 * Means projects without monitoring still tick through the
 * evaluation-agent cron schedule but never produce false-positive
 * PERFORMANCE_DEGRADATION intents.
 */

import type { MonitoringAdapter } from '../types';

export class NoopMonitoringAdapter implements MonitoringAdapter {
  readonly type = 'noop' as const;

  async getErrorRate(_params: { windowMinutes: number }): Promise<number> {
    return 0;
  }

  async getLatencyP99Ms(_params: { windowMinutes: number }): Promise<number> {
    return 0;
  }

  async getAlertCount(_params: { windowMinutes: number }): Promise<number> {
    return 0;
  }
}
