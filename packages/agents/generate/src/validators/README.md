# Generate layer — Validators

Internal validators that run before an agent returns its result. Catch structural errors early, before they reach the quality gate.

---

## Files

| File | Purpose |
|---|---|
| `intent-validator.ts` | Validates IntentSpec structure — required fields, non-empty arrays, valid enum values. |
| `design-validator.ts` | Validates design artifacts — domain model coherence, API contract completeness. |
| `artifact-validator.ts` | Validates the final artifact set before handing to the quality gate. |

## Rules for agents working here

- Validators throw on failure — callers catch and trigger internal retry
- Validators never call the LLM — they are pure structural checks
- A failed validator triggers an internal retry, not a CONTEXT_GAP signal

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
