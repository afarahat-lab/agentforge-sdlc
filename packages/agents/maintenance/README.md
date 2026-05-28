# @gestalt/agents-maintenance

Background agents that run continuously to keep the codebase and harness aligned with architectural standards. These agents are the platform's immune system — they detect and correct drift before it accumulates.

---

## Responsibilities

- drift-agent — detects documentation drift (context files out of sync with code)
- alignment-agent — detects code that has drifted from architectural standards
- gc-agent — garbage collection (duplicate logic, dead code, outdated patterns)
- evaluation-agent — analyses runtime metrics, detects degradation, emits feedback to generate layer

## Schedules

- drift-agent: daily at 02:00 UTC
- alignment-agent: daily at 03:00 UTC
- gc-agent: weekly on Fridays at 04:00 UTC
- evaluation-agent: continuous (triggered by monitoring metrics)

## Must never

- Merge changes without going through the quality gate
- Modify GOLDEN_PRINCIPLES.md without creating a corresponding ADR
- Delete context files — update only
- Auto-escalate evaluation findings to production changes — always queue as generate-layer intents

## Structure

```
src/
├── index.ts
├── types.ts
└── agents/
    ├── drift-agent.ts
    ├── alignment-agent.ts
    ├── gc-agent.ts
    └── evaluation-agent.ts
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
