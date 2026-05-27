# Maintenance layer — Monitoring adapters

One adapter per monitoring platform. Each implements MonitoringAdapter. The evaluation-agent never calls monitoring systems directly.

---

## Files

| File | Purpose |
|---|---|
| `prometheus.ts` | Prometheus HTTP API — metrics queries and alert rules. |
| `datadog.ts` | Datadog Metrics API and Events API. |
| `azure-monitor.ts` | Azure Monitor REST API — most common in GCC/MENA enterprise environments. |

## Rules for agents working here

- All adapters implement all four MonitoringAdapter methods
- Connection config from environment variables — never hardcoded
- getErrorRate and getLatencyP99 return raw numbers — no thresholding in adapters
- Threshold logic lives in evaluation-agent only

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
