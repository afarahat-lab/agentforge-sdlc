# Generate layer — Specialist agents

Stateless, ephemeral workers. Each handles one artifact type. They receive a TaskMessage with a full ContextSnapshot and return an AgentResult.

---

## Files

| File | Purpose |
|---|---|
| `intent-agent.ts` | Always runs first. Parses raw intent → IntentSpec. Detects ambiguities. |
| `design-agent.ts` | Produces domain model changes, API contracts, component specs. |
| `context-agent.ts` | Updates context files. Can declare SKIPPED if no context changes needed. |
| `lint-config-agent.ts` | Updates constraint rules. Can declare SKIPPED if no new module boundaries. |
| `code-agent.ts` | Generates application code. Always runs. Reads design artifacts as prior context. |
| `test-agent.ts` | Generates test suite from IntentSpec success criteria. Always runs. |

## Rules for agents working here

- Never communicate with other specialist agents — only with the orchestrator via queue
- Always read intent and context from the ContextSnapshot in the task message, never from files
- Retry internally up to 2 times before emitting a failure signal
- Return status: 'skipped' with a skipReason if the artifact type is not needed
- Never generate code that violates a constraint listed in the ContextSnapshot

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
