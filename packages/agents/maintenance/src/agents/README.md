# Maintenance layer — Background agents

Four agents that run proactively to keep the codebase healthy. They detect issues and queue intents — they never fix code directly (except drift-agent for additive documentation updates).

---

## Files

| File | Purpose |
|---|---|
| `drift-agent.ts` | Daily. Detects context file drift. Applies direct fixes for additive docs. Queues intents for structural drift. |
| `alignment-agent.ts` | Daily. Detects code drifted from architectural standards. Always queues intents — never fixes directly. |
| `gc-agent.ts` | Weekly. Detects dead code, duplicate logic, deprecated dependencies. Queues low-priority intents. |
| `evaluation-agent.ts` | Continuous. Triggered by monitoring metrics. Queues high/critical intents for production degradation. |

## Rules for agents working here

- Never modify application code directly — always queue through generate layer
- drift-agent may update context files directly only for additive documentation changes
- Never modify GOLDEN_PRINCIPLES.md or DECISIONS.md — those require human review
- All queued intents must have typed MaintenanceIntentType — no free-form strings
- evaluation-agent queues critical priority for error rate spikes above 2x threshold

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
