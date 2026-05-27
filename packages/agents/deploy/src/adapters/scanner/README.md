# Deploy layer — Scanner interpreters

One interpreter per enterprise security scanner. Each maps scanner-specific output to platform SecurityFinding types. The severity mapping is fixed and non-negotiable.

---

## Files

| File | Purpose |
|---|---|
| `fortify.ts` | Fortify Static Code Analyzer — parses FPR/XML output. |
| `checkmarx.ts` | Checkmarx SAST — parses XML/JSON output. |
| `veracode.ts` | Veracode — parses results API XML output. |
| `sonarqube.ts` | SonarQube — parses Web API quality gate JSON results. |

## Rules for agents working here

- CRITICAL/HIGH findings always map to GOLDEN_PRINCIPLE_BREACH — never downgraded
- MEDIUM findings map to CONSTRAINT_VIOLATION
- LOW/INFO findings map to LINT_FAILURE
- Interpreters parse raw output only — they never call the scanner tool
- This severity mapping is fixed by GP-007 — changes require a new ADR

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
