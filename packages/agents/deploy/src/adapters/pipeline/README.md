# Deploy layer — Pipeline adapters

One adapter per CI/CD system. Each implements the PipelineAdapter interface. The pipeline-agent never calls a CI/CD system directly — always through an adapter.

---

## Files

| File | Purpose |
|---|---|
| `github-actions.ts` | GitHub Actions — workflow_dispatch trigger + run polling. |
| `azure-devops.ts` | Azure DevOps — most common in GCC/MENA enterprise. Pipeline run trigger + stage polling. |
| `gitlab-ci.ts` | GitLab CI — pipeline trigger + job polling. |
| `jenkins.ts` | Jenkins — crumb-authenticated build trigger + status polling. |

## Rules for agents working here

- Every adapter must implement all four PipelineAdapter methods
- getStageResults must mark security stages with isSecurityStage: true
- Connection config values come from environment variables — never hardcoded
- Adapters never interpret results — they return raw stage output for the scanner interpreter

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
