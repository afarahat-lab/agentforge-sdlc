# Continuous Maintenance Layer — AgentForge SDLC

Version: 0.1.0
Layer: 6
Status: Designed + implemented (monitoring adapters stubbed for Phase 2)

---

## Overview

The maintenance layer is the platform's immune system. It runs proactively,
independent of any intent cycle, to detect and address the slow entropy that
accumulates in every living codebase.

The key design principle: **maintenance agents queue intents, they don't fix code.**
Every change — including maintenance changes — goes through the generate→gate→deploy loop.
This means every maintenance change is quality-gated, auditable, and visible in the dashboard.

The only exception: drift-agent may update context files directly for additive
documentation changes. These are not code changes and don't require the full loop.

---

## Four agents

### drift-agent
**Schedule:** Daily at 02:00 UTC

Detects when context files (DOMAIN.md, ARCHITECTURE.md, AGENTS.md) have drifted
from the actual codebase. Uses AST parsing to compare documented entities and
module structure against actual code.

Resolution:
- Additive documentation gaps → DirectFix applied immediately
- Structural drift (entity removed, module renamed) → MaintenanceIntent queued

Never modifies GOLDEN_PRINCIPLES.md or DECISIONS.md directly.

### alignment-agent
**Schedule:** Daily at 03:00 UTC

Scans the full codebase for accumulated architectural violations using the same
two-level constraint checking as the quality gate's constraint-agent.

Key difference from quality gate: scans the entire codebase, not just new artifacts.
Catches violations that accumulated between intent cycles.

Resolution: always queues MaintenanceIntent — never fixes directly.

### gc-agent
**Schedule:** Weekly, Fridays at 04:00 UTC

Detects technical debt: dead code, duplicate logic, deprecated dependencies.

Resolution: queues low-priority MaintenanceIntents. Exception: deprecated dependencies
with security advisories are queued at high priority.

Never deletes or modifies code directly.

### evaluation-agent
**Trigger:** Continuous — triggered by monitoring metrics exceeding thresholds

The only event-driven agent. Analyses runtime metrics and fires when:
- Error rate exceeds configured threshold
- P99 latency exceeds configured threshold
- Alert storm detected (too many alerts in a short window)

Resolution: queues MaintenanceIntent at critical/high priority.
Affected files are unknown at detection time — generate layer investigates.

---

## Maintenance as intent

All maintenance changes flow through the generate layer as typed MaintenanceIntents:

```typescript
MaintenanceIntent {
  source:          MaintenanceAgentRole   // which agent detected the issue
  type:            MaintenanceIntentType  // typed — no free-form strings
  priority:        'critical' | 'high' | 'normal' | 'low'
  description:     string                // human-readable summary
  affectedFiles:   string[]              // files the agent identified
  evidence:        string                // what the agent observed
  suggestedAction: string                // recommendation, not a command
}
```

The generate layer's intent-agent receives a MaintenanceIntent instead of
a raw intent string. The structure is richer — it already includes affected files
and evidence, so the intent-agent produces a more precise IntentSpec with fewer
ambiguities.

---

## Monitoring adapter pattern

The evaluation-agent never calls monitoring systems directly.
All calls go through a typed MonitoringAdapter interface.

```typescript
interface MonitoringAdapter {
  getMetrics(query: MetricsQuery): Promise<MetricSample[]>
  getAlerts(since: Date): Promise<MonitoringAlert[]>
  getErrorRate(service: string, window: Duration): Promise<number>
  getLatencyP99(service: string, window: Duration): Promise<number>
}
```

Supported adapters: Prometheus · Datadog · Azure Monitor

Configured in HARNESS.json under `maintenance.monitoring.adapter`.
Set to null if no monitoring integration is configured.

---

## Evaluation thresholds (HARNESS.json)

```json
"maintenance": {
  "monitoring": {
    "adapter": "azure-monitor",
    "thresholds": {
      "errorRatePercent":    5.0,
      "latencyP99Ms":        2000,
      "alertCountWindow":    "1h",
      "alertCountThreshold": 10
    }
  }
}
```

---

## Implementation file map

```
packages/agents/maintenance/src/
├── index.ts
├── types.ts
├── agents/
│   ├── drift-agent.ts           ✅ implemented (AST detection stub for Phase 2)
│   ├── alignment-agent.ts       ✅ implemented (constraint scan stub for Phase 2)
│   ├── gc-agent.ts              ✅ implemented (dead code detection stub for Phase 2)
│   └── evaluation-agent.ts      ✅ implemented (fully functional metric thresholds)
├── schedulers/
│   └── scheduler.ts             ✅ implemented (node-cron stub for Phase 2)
└── adapters/
    └── monitoring/
        ├── prometheus.ts        🔲 stub
        ├── datadog.ts           🔲 stub
        └── azure-monitor.ts     🔲 stub
```

---

## ADR additions

### ADR-018 — Maintenance changes flow through generate loop
All maintenance agent code changes are queued as MaintenanceIntents and processed
by the generate layer. They go through the quality gate and deploy layer like any
other change. This ensures maintenance changes are quality-gated and auditable.

### ADR-019 — Typed MaintenanceIntentType — no free-form strings
Maintenance agents use typed intent types instead of natural language strings.
This gives the generate layer's intent-agent structured input with known
affectedFiles and evidence, producing more precise IntentSpecs.

### ADR-020 — Monitoring adapter pattern
Same pattern as pipeline and scanner adapters. evaluation-agent never calls
monitoring systems directly. Adapter resolved from HARNESS.json at startup.
