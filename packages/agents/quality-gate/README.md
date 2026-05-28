# @gestalt/agents-quality-gate

The quality gate layer. Never generates — only validates and signals. Enforces the harness by running the full validation suite against every artifact set produced by the generate layer.

---

## Responsibilities

- constraint-agent — checks architectural rules defined in ARCHITECTURE.md
- lint-agent — runs ESLint and static analysis
- test-runner-agent — executes the test suite and collects results
- security-agent — runs OWASP ruleset security scan
- review-agent — synthesises all signals into a typed gate result

## Signal outputs

- LINT_FAILURE — style or static analysis failure
- TEST_FAILURE — test suite failure
- CONSTRAINT_VIOLATION — architectural rule violation
- CONTEXT_GAP — missing context prevented validation
- GOLDEN_PRINCIPLE_BREACH — non-negotiable violated, always blocks

## Must never

- Generate or modify code — only validate
- Auto-resolve GOLDEN_PRINCIPLE_BREACH — always return it as a blocking signal
- Pass a gate with open CONSTRAINT_VIOLATION or GOLDEN_PRINCIPLE_BREACH signals
- Suppress or downgrade signal severity

## Structure

```
src/
├── index.ts
├── types.ts
├── agents/
│   ├── constraint-agent.ts
│   ├── lint-agent.ts
│   ├── test-runner-agent.ts
│   ├── security-agent.ts
│   └── review-agent.ts
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
