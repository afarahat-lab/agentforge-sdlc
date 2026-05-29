/**
 * Prometheus monitoring adapter (ADR-020).
 *
 * Talks to the Prometheus HTTP API (`/api/v1/query`). Connection URL
 * comes from the project's `HARNESS.json`
 * `maintenance.monitoring.connectionConfig.url`.
 *
 * Query templates used:
 *   - error rate:  `rate(http_requests_total{status=~"5.."}[Xm])`
 *                  divided by the total request rate, multiplied by 100
 *   - p99 latency: `histogram_quantile(0.99,
 *                      sum(rate(http_request_duration_seconds_bucket[Xm]))
 *                      by (le))` * 1000  (seconds → milliseconds)
 *   - alert count: `count(ALERTS{alertstate="firing"})`
 *
 * Adapt these queries in the project repo if the operator's labels
 * differ. Failures bubble up as agent errors — evaluation-agent treats
 * them as a maintenance-run failure rather than a fake metric value.
 */

import type { MonitoringAdapter } from '../types';

export interface PrometheusAdapterOptions {
  baseUrl: string;
  /** Optional bearer token for protected Prometheus instances. */
  bearerToken?: string;
}

export class PrometheusAdapter implements MonitoringAdapter {
  readonly type = 'prometheus' as const;

  private readonly baseUrl: string;
  private readonly bearerToken: string | undefined;

  constructor(options: PrometheusAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.bearerToken = options.bearerToken;
  }

  async getErrorRate(params: { windowMinutes: number }): Promise<number> {
    const window = `${params.windowMinutes}m`;
    const errors = `sum(rate(http_requests_total{status=~"5.."}[${window}]))`;
    const total = `sum(rate(http_requests_total[${window}]))`;
    const query = `(${errors}) / (${total}) * 100`;
    const value = await this.scalar(query);
    return Number.isFinite(value) ? value : 0;
  }

  async getLatencyP99Ms(params: { windowMinutes: number }): Promise<number> {
    const window = `${params.windowMinutes}m`;
    const query =
      `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[${window}])) by (le)) * 1000`;
    const value = await this.scalar(query);
    return Number.isFinite(value) ? value : 0;
  }

  async getAlertCount(_params: { windowMinutes: number }): Promise<number> {
    // ALERTS is point-in-time, not windowed; window param is accepted for
    // interface symmetry with the other methods.
    const value = await this.scalar('count(ALERTS{alertstate="firing"})');
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  private async scalar(query: string): Promise<number> {
    const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {},
    });
    if (!res.ok) {
      throw new Error(`Prometheus query failed (${res.status}): ${await res.text()}`);
    }
    const body = await res.json() as {
      status: 'success' | 'error';
      data?: {
        resultType: string;
        result: Array<{ value: [number, string] }>;
      };
      error?: string;
    };
    if (body.status !== 'success' || !body.data) {
      throw new Error(`Prometheus query non-success: ${body.error ?? 'unknown'}`);
    }
    const first = body.data.result[0];
    if (!first) return 0;
    const raw = first.value[1];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
