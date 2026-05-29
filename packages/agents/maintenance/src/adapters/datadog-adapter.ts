/**
 * Datadog monitoring adapter (ADR-020).
 *
 * Talks to the Datadog Metrics API v1 (`/api/v1/query`). API key + app
 * key come from `HARNESS.json` `maintenance.monitoring.connectionConfig`
 * (`apiKey`, `appKey`).
 *
 * Query templates used (operators tune the metric names in the harness
 * if their conventions differ):
 *   - error rate:  `sum:trace.http.request.errors{*}.as_rate() /
 *                   sum:trace.http.request.hits{*}.as_rate() * 100`
 *   - p99 latency: `p99:trace.http.request{*}`  (Datadog returns seconds;
 *                   adapter multiplies by 1000 to match the interface)
 *   - alert count: monitor states API — count `alert` monitors
 *
 * Failures bubble up.
 */

import type { MonitoringAdapter } from '../types';

export interface DatadogAdapterOptions {
  apiKey: string;
  appKey: string;
  /** Optional site override — e.g. `datadoghq.eu`. Defaults to US1. */
  site?: string;
}

export class DatadogAdapter implements MonitoringAdapter {
  readonly type = 'datadog' as const;

  private readonly apiKey: string;
  private readonly appKey: string;
  private readonly site: string;

  constructor(options: DatadogAdapterOptions) {
    this.apiKey = options.apiKey;
    this.appKey = options.appKey;
    this.site = options.site ?? 'datadoghq.com';
  }

  async getErrorRate(params: { windowMinutes: number }): Promise<number> {
    const value = await this.scalar(
      params.windowMinutes,
      'sum:trace.http.request.errors{*}.as_rate() / sum:trace.http.request.hits{*}.as_rate() * 100',
    );
    return Number.isFinite(value) ? value : 0;
  }

  async getLatencyP99Ms(params: { windowMinutes: number }): Promise<number> {
    const valueSec = await this.scalar(params.windowMinutes, 'p99:trace.http.request{*}');
    const valueMs = valueSec * 1000;
    return Number.isFinite(valueMs) ? valueMs : 0;
  }

  async getAlertCount(_params: { windowMinutes: number }): Promise<number> {
    const url = `https://api.${this.site}/api/v1/monitor?group_states=alert&page_size=200`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Datadog monitor list failed (${res.status}): ${await res.text()}`);
    }
    const body = await res.json() as Array<{ overall_state?: string }>;
    return Array.isArray(body) ? body.filter((m) => m.overall_state === 'Alert').length : 0;
  }

  private async scalar(windowMinutes: number, query: string): Promise<number> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - windowMinutes * 60;
    const url = `https://api.${this.site}/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Datadog query failed (${res.status}): ${await res.text()}`);
    }
    const body = await res.json() as {
      status: string;
      series?: Array<{ pointlist: Array<[number, number]> }>;
    };
    const series = body.series?.[0];
    if (!series || series.pointlist.length === 0) return 0;
    // Take the most recent non-null point.
    for (let i = series.pointlist.length - 1; i >= 0; i--) {
      const v = series.pointlist[i]?.[1];
      if (v != null && Number.isFinite(v)) return v;
    }
    return 0;
  }

  private headers(): Record<string, string> {
    return {
      'DD-API-KEY': this.apiKey,
      'DD-APPLICATION-KEY': this.appKey,
    };
  }
}
