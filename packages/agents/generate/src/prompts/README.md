# Generate layer — LLM prompts

Prompt builders for each specialist agent. Every prompt enforces JSON-only output, includes retry guidance for subsequent attempts, and injects the relevant ContextSnapshot fields.

---

## Files

| File | Purpose |
|---|---|
| `intent-prompt.ts` | Extracts IntentSpec from raw intent text. Enforces JSON schema. |
| `design-prompt.ts` | Generates domain model changes and API contracts from IntentSpec. |
| `context-prompt.ts` | Generates updated context file content from IntentSpec and design artifacts. |
| `lint-config-prompt.ts` | Generates updated ESLint constraint rules from design artifacts. |
| `code-prompt.ts` | Generates application code from design + context. Injects golden principles as hard constraints. |
| `test-prompt.ts` | Generates test suite from IntentSpec success criteria and code artifacts. |

## Rules for agents working here

- Every prompt must specify JSON-only output with no markdown fences
- Every prompt must include retry guidance on attempt > 0
- Code-prompt must inject golden principles as hard constraints the LLM cannot override
- Never include sensitive config values (API keys, passwords) in prompts

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
