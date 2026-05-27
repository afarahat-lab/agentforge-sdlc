/**
 * Datadog monitoring adapter.
 * Uses Datadog Metrics API.
 * Full implementation: Phase 2.
 */
import type { MonitoringAdapter, MetricsQuery, MetricSample, MonitoringAlert, Duration } from '../../types';

export class DatadogAdapter implements MonitoringAdapter {
  readonly type = 'datadog' as const;
  async getMetrics(_query: MetricsQuery): Promise<MetricSample[]> {
    throw new Error('datadog adapter not yet implemented');
  }
  async getAlerts(_since: Date): Promise<MonitoringAlert[]> {
    throw new Error('datadog adapter not yet implemented');
  }
  async getErrorRate(_service: string, _window: Duration): Promise<number> {
    throw new Error('datadog adapter not yet implemented');
  }
  async getLatencyP99(_service: string, _window: Duration): Promise<number> {
    throw new Error('datadog adapter not yet implemented');
  }
}
