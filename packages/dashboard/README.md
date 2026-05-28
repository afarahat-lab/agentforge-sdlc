# @gestalt/dashboard

The React oversight dashboard. Served by the server as static assets. Gives human operators visibility into every agent decision, quality gate result, deployment, and alert — with the ability to intervene when required.

---

## Responsibilities

- Intent history — list and detail views for all intent cycles
- Active agents — real-time view of running agent executions
- Quality gate results — signal breakdown per intent cycle
- Deployment status — current state across environments
- Maintenance activity — background agent runs, drift detections, GC results
- Alert feed — escalations requiring human attention
- Intervention — approve/reject escalated items, provide clarification for CONTEXT_GAP

## Key exports

- `App — root React component`

## Must never

- Call the database or queue directly — all data comes from the server API
- Display sensitive config (API keys, DB passwords) — these are never surfaced in the UI
- Auto-resolve GOLDEN_PRINCIPLE_BREACH — always requires explicit human action

## Structure

```
src/
├── index.ts          # dashboard entry point
├── types.ts          # dashboard-specific types
├── App.tsx           # root component, routing
├── views/
│   ├── IntentHistory.tsx
│   ├── IntentDetail.tsx
│   ├── ActiveAgents.tsx
│   ├── QualityGate.tsx
│   ├── Deployments.tsx
│   ├── Maintenance.tsx
│   └── Alerts.tsx
├── components/       # shared UI components
└── api/
    └── client.ts     # typed fetch client for the server API
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
