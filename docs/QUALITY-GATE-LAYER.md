# Quality Gate Layer — AgentForge SDLC

Version: 0.1.0
Layer: 4
Status: Designed + implemented (stubs for external tool integrations)

---

## Overview

The quality gate layer validates every artifact set produced by the generate layer.
It never generates, never suggests, never fixes. It validates and signals.

The gate is deterministic — no LLM is used. Every run against the same artifact set
produces the same result. This is what makes the closed loop trustworthy.

---

## Execution order

Lint and security run in parallel (fast). Constraint check runs next (architectural
validity). Tests run last (most expensive). Review agent always runs last.

```
[lint-agent] ──┐
               ├──→ [constraint-agent] ──→ [test-runner-agent] ──→ [review-agent]
[security-agent]┘
```

**Why this order:**
- Fast cheap checks first — fail fast before expensive operations
- Architectural validity before tests — no value testing broken architecture
- Tests last — most expensive, should only run on structurally sound code
- Review always last — synthesises all other results

---

## Agents

### lint-agent
Runs ESLint and Prettier against all code and test artifacts.
Produces `LINT_FAILURE` signals. Always auto-resolvable.

### security-agent
Runs OWASP ruleset (via Semgrep in Phase 2).
CRITICAL/HIGH findings → `GOLDEN_PRINCIPLE_BREACH` (blocks, requires human).
MEDIUM findings → `CONSTRAINT_VIOLATION`.
LOW/INFO findings → `LINT_FAILURE`.

### constraint-agent
Validates against architectural rules. Two levels:
- **ESLint level**: import boundaries, no-any, no-console, forbidden patterns
- **AST level**: semantic rules using TypeScript compiler API
  - `no-direct-db-outside-adapter`
  - `no-direct-llm-outside-core`
  - `audit-record-on-state-change` (GP-002 enforcement)
  - `no-cross-domain-service-calls`

### test-runner-agent
Executes the Vitest test suite. Each failing assertion → `TEST_FAILURE` signal
with test name, expected, actual, and stack trace. No interpretation.

### review-agent
Synthesises all signals into a `GateResult`. Applies verdict logic:

| Condition | Verdict |
|---|---|
| Any `GOLDEN_PRINCIPLE_BREACH` | `escalate` |
| Any `CONSTRAINT_VIOLATION` | `fail` |
| Any `TEST_FAILURE` | `fail` |
| Only `LINT_FAILURE` signals | `fail` (auto-resolvable) |
| No signals | `pass` |

---

## Gate result

```typescript
GateResult {
  verdict:              'pass' | 'fail' | 'escalate'
  signals:              GateSignal[]
  retryRecommendation:  RetryRecommendation | null  // null when pass or escalate
  agentResults:         GateAgentResult[]
}
```

A `pass` result has zero signals.
An `escalate` result has at least one `GOLDEN_PRINCIPLE_BREACH` and no retry.
A `fail` result has signals and a retry recommendation routing back to generate layer.

---

## Retry routing

| Signal | Routes to | Retry from state |
|---|---|---|
| `LINT_FAILURE` | `code-agent` | `coding` |
| `TEST_FAILURE` | `code-agent` + `test-agent` | `coding` |
| `CONSTRAINT_VIOLATION` | `code-agent` | `designing` |
| `CONTEXT_GAP` | `context-agent` | `generating_context` |
| `GOLDEN_PRINCIPLE_BREACH` | Human escalation | N/A |

---

## Implementation file map

```
packages/agents/quality-gate/src/
├── index.ts
├── types.ts
├── agents/
│   ├── lint-agent.ts           ✅ implemented (ESLint stub for Phase 2)
│   ├── security-agent.ts       ✅ implemented (Semgrep stub for Phase 2)
│   ├── constraint-agent.ts     ✅ implemented (ESLint+AST stubs for Phase 2)
│   ├── test-runner-agent.ts    ✅ implemented (Vitest stub for Phase 2)
│   └── review-agent.ts         ✅ fully implemented
└── validators/
    └── gate-result-validator.ts ✅ fully implemented
```

---

## ADR additions

### ADR-012 — Lint and security run in parallel, constraints before tests
Fast cheap checks in parallel first. Constraint validity before test execution.
Security findings at HIGH/CRITICAL are always `GOLDEN_PRINCIPLE_BREACH`.

### ADR-013 — Review agent applies gate logic, not individual agents
Individual agents report signals without verdict. Review agent decides.
Gate logic lives in one place — never distributed across agents.

### ADR-014 — Two-level constraint checking: ESLint + AST
Static import/style rules via ESLint programmatic API.
Semantic architectural rules via TypeScript compiler AST.
No LLM in the quality gate — determinism is non-negotiable.
