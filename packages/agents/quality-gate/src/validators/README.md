# Quality gate — Validators

Structural validators that run before results leave the quality gate layer.

---

## Files

| File | Purpose |
|---|---|
| `gate-result-validator.ts` | Validates GateResult structure and internal consistency before returning to orchestrator. |

## Rules for agents working here

- Validators throw on failure — never return false
- A passing gate with signals is always a bug — validator catches it
- An escalating gate without GOLDEN_PRINCIPLE_BREACH is always a bug

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
