# Deploy layer — Specialist agents

Three agents that coordinate external systems to merge and promote changes. They never execute builds or deployments directly — they instruct and monitor.

---

## Files

| File | Purpose |
|---|---|
| `pr-agent.ts` | Creates PRs with structured summaries. Merges only when all conditions are met. Never merges with GOLDEN_PRINCIPLE_BREACH. |
| `pipeline-agent.ts` | Triggers CI/CD pipeline, polls for results, maps stage outcomes and enterprise scanner findings to platform signals. |
| `promotion-agent.ts` | Manages environment promotion per HARNESS.json strategy. Manual gate for production. Never promotes without staging success. |

## Rules for agents working here

- Never merge a PR with an open GOLDEN_PRINCIPLE_BREACH signal
- Never promote to production without a successful staging run
- Never execute builds, scans, or deployments directly — coordinate external systems only
- All external system calls go through typed adapters — never raw HTTP in agent code
- Pipeline failures always produce typed signals — never swallow errors silently

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
