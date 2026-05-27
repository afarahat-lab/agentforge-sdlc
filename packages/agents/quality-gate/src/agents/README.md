# Quality gate — Specialist agents

Five agents that each validate one concern. They run in a fixed order. They never generate or fix — only validate and signal.

---

## Files

| File | Purpose |
|---|---|
| `lint-agent.ts` | ESLint + Prettier. Runs in parallel with security-agent. Produces LINT_FAILURE. |
| `security-agent.ts` | OWASP ruleset scan. Runs in parallel with lint-agent. CRITICAL/HIGH → GOLDEN_PRINCIPLE_BREACH. |
| `constraint-agent.ts` | Architectural rule enforcement. Two levels: ESLint rules + AST semantic checks. |
| `test-runner-agent.ts` | Vitest execution. Runs last before review. Each failure → TEST_FAILURE signal. |
| `review-agent.ts` | Synthesises all signals into GateResult. Applies verdict logic. Always runs last. |

## Rules for agents working here

- Never use an LLM — the quality gate must be fully deterministic
- Never modify or fix artifacts — only read and validate
- Never downgrade GOLDEN_PRINCIPLE_BREACH severity
- Always include file and line in signal location when available
- review-agent must always run regardless of other agent outcomes

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
