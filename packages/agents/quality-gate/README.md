# @gestalt/agents-quality-gate

The quality gate layer. Never generates — only validates and signals.
Enforces the harness by running the full validation suite against every
artifact set produced by the generate layer.

---

## Responsibilities

- **Orchestrator BullMQ worker** — drains `bull:gestalt-gate:*`. For each
  task it: looks up the project; clones the repo into a fresh temp dir;
  runs the gate agents in parallel; persists per-step `agent_executions`
  + `signals` rows; emits SSE events (`agent.started`,
  `agent.completed`, `signal.emitted`, `gate.completed`); synthesises a
  verdict via `synthesiseGateResult`; transitions the intent
  (`pass` → `approved`, `fail` → `failed`, `escalate` → `escalated`).
  Temp dir cleaned in a `finally` block.
- **constraint-agent** — deterministic regex checks on generated text.
  Implemented today: `no-any`, `no-console`,
  `no-direct-db-outside-shared-db` (CONSTRAINT_VIOLATION);
  `no-hardcoded-secret`, `no-direct-llm-sdk` (GOLDEN_PRINCIPLE_BREACH).
  Pure text — no LLM, no compiled deps.
- **llm-review-agent** — single LLM call summarising the artifact set
  with structured JSON output. Critical / `golden-principle`-category
  items emit GOLDEN_PRINCIPLE_BREACH; high/medium emit
  CONSTRAINT_VIOLATION; low/info live only in the prose review
  persisted as `.gestalt/llm-review-<corr8>.md` in the `artifacts`
  table.
- **review-agent** — `synthesiseGateResult` aggregates all gate-agent
  signals into a single GateResult with verdict and (for `fail`) a
  retry recommendation. Naming note: distinct from `llm-review-agent`;
  this one is the verdict synthesiser, pure logic, no LLM.
- **lint-agent, security-agent, test-runner-agent** — stubs today.
  Need the project's deps installed in the cloned tree before they can
  run real tooling (`tsc`, `eslint`, `vitest`); tracked under Pending
  enhancements in `CLAUDE.md`.

## Signal outputs

- LINT_FAILURE — style or static analysis failure
- TEST_FAILURE — test suite failure
- CONSTRAINT_VIOLATION — architectural rule violation
- CONTEXT_GAP — missing context prevented validation
- GOLDEN_PRINCIPLE_BREACH — non-negotiable violated, always blocks

## Key exports

- `startGateWorker(queueConfig)` — registers the BullMQ worker. Called
  once at server startup from `packages/server/src/server.ts`.
- `runConstraintAgent`, `runLlmReviewAgent` — agent entry points
- `synthesiseGateResult, isDeployBlocked, summariseGateResult` — verdict
  synthesis + helpers
- Types: `GateResult`, `GateVerdict`, `GateSignal`, `GateAgentResult`,
  `GateTask`, `GateHarnessConfig`, `ArtifactRef`, etc.

## Must never

- Generate or modify code — only validate
- Auto-resolve GOLDEN_PRINCIPLE_BREACH — always return it as a blocking signal
- Pass a gate with open CONSTRAINT_VIOLATION or GOLDEN_PRINCIPLE_BREACH signals
- Suppress or downgrade signal severity
- Push to the project's Git repo — the gate persists findings to the DB,
  never to the repo. (The generate orchestrator already pushed before
  the gate ran.)

## Structure

```
src/
├── index.ts
├── types.ts
├── orchestrator/
│   └── gate-orchestrator.ts     # BullMQ worker — drains bull:gestalt-gate
├── agents/
│   ├── constraint-agent.ts      # deterministic regex rules
│   ├── llm-review-agent.ts      # LLM qualitative review
│   ├── review-agent.ts          # synthesiseGateResult (verdict synthesis)
│   ├── lint-agent.ts            # stub — needs deps-in-clone pipeline
│   ├── security-agent.ts        # stub — same
│   └── test-runner-agent.ts     # stub — same
└── validators/
    └── gate-result-validator.ts
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
