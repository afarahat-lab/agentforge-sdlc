# Merge & Deploy Layer — AgentForge SDLC

Version: 0.1.0
Layer: 5
Status: Designed + implemented (pipeline and scanner adapters stubbed for Phase 2)

---

## Overview

The deploy layer takes an approved artifact set and promotes it through environments.
It is a coordinator, not an executor — it instructs external systems and monitors outcomes.
Every result maps to a typed platform signal.

---

## Execution flow

```
GateResult: pass
      │
      ▼
pr-agent          → creates PR with structured intent summary
      │
      ▼
pipeline-agent    → triggers CI/CD, polls stages, interprets enterprise scanner results
      │
   ┌──┴──┐
passed  failed → signals → generate layer or human escalation
   │
   ▼
promotion-agent   → promotes through environments per HARNESS.json strategy
```

---

## Three agents

### pr-agent
- Creates PR with structured body: intent, success criteria, quality gate summary, changed files
- Auto-merges after successful pipeline
- Hard checks before merge: no GOLDEN_PRINCIPLE_BREACH, pipeline must have passed

### pipeline-agent
- Triggers CI/CD via pipeline adapter (GitHub Actions / Azure DevOps / GitLab CI / Jenkins)
- Polls stage results until terminal state or 1-hour timeout
- Routes security stage failures through scanner interpreter
- Maps all failures to typed platform signals

### promotion-agent
- Reads promotion strategy from HARNESS.json
- Auto-promotes where trigger = 'auto'
- Creates pending approval event (visible in dashboard) where trigger = 'manual'
- Hard blocks production promotion without confirmed staging success

---

## Pipeline adapter pattern

The pipeline-agent never calls a CI/CD system directly.
All calls go through a typed `PipelineAdapter` interface.

```typescript
interface PipelineAdapter {
  trigger(config: PipelineTriggerConfig): Promise<PipelineRun>
  getStatus(runId: string): Promise<PipelineRunStatus>
  getStageResults(runId: string): Promise<StageResult[]>
  cancel(runId: string): Promise<void>
}
```

Supported adapters: GitHub Actions · Azure DevOps · GitLab CI · Jenkins

Active adapter resolved at startup from `HARNESS.json pipeline.adapter`.

---

## Scanner interpreter pattern

Enterprise security scanners are configured in HARNESS.json.
Each scanner has a dedicated interpreter that maps its output to platform signals.

```typescript
interface ScannerInterpreter {
  readonly name: ScannerType
  interpret(rawResult: string): ScannerResult
}
```

Supported interpreters: Fortify · Checkmarx · Veracode · SonarQube

**Fixed severity mapping (GP-007 — never change without new ADR):**

| Scanner severity | Platform signal |
|---|---|
| CRITICAL / HIGH | GOLDEN_PRINCIPLE_BREACH |
| MEDIUM | CONSTRAINT_VIOLATION |
| LOW / INFO | LINT_FAILURE |

---

## HARNESS.json configuration

```json
"pipeline": {
  "adapter": "azure-devops",
  "triggerConfig": {
    "organization": "${AZDO_ORG}",
    "project": "${AZDO_PROJECT}",
    "pipelineId": "${AZDO_PIPELINE_ID}"
  },
  "stages": ["lint", "test", "security-scan", "build", "deploy-dev"],
  "securityScanner": {
    "type": "fortify",
    "stage": "security-scan",
    "failureSignal": "GOLDEN_PRINCIPLE_BREACH",
    "configPath": ".fortify/ssc.yml"
  }
},
"promotion": {
  "environments": ["dev", "staging", "production"],
  "strategy": {
    "dev":        { "trigger": "auto",   "approvals": 0 },
    "staging":    { "trigger": "auto",   "approvals": 0 },
    "production": { "trigger": "manual", "approvals": 1 }
  }
}
```

---

## Implementation file map

```
packages/agents/deploy/src/
├── index.ts
├── types.ts
├── agents/
│   ├── pr-agent.ts              ✅ implemented (git client stub for Phase 2)
│   ├── pipeline-agent.ts        ✅ implemented (adapter stubs for Phase 2)
│   └── promotion-agent.ts       ✅ implemented (repository stub for Phase 2)
└── adapters/
    ├── pipeline/
    │   ├── github-actions.ts    🔲 stub
    │   ├── azure-devops.ts      🔲 stub
    │   ├── gitlab-ci.ts         🔲 stub
    │   └── jenkins.ts           🔲 stub
    └── scanner/
        ├── fortify.ts           🔲 stub
        ├── checkmarx.ts         🔲 stub
        ├── veracode.ts          🔲 stub
        └── sonarqube.ts         🔲 stub
```

---

## ADR additions

### ADR-015 — Pipeline adapter pattern
All CI/CD system calls go through a typed PipelineAdapter interface.
Active adapter resolved from HARNESS.json at startup.
Rationale: same as DB adapter pattern — keeps agent code system-agnostic.

### ADR-016 — Scanner interpreter pattern
Each enterprise security scanner has a dedicated interpreter.
Severity mapping is fixed by GP-007 — CRITICAL/HIGH always GOLDEN_PRINCIPLE_BREACH.
Rationale: enterprise scanners have different output formats but the same
platform signal taxonomy. Interpreters isolate format parsing from signal logic.

### ADR-017 — Production promotion requires staging confirmation
promotion-agent hard-blocks production promotion without a confirmed staging run.
Rationale: GP-003 (GOLDEN_PRINCIPLE_BREACH requires human) applies here transitively —
promoting untested code to production is the deployment equivalent of a golden principle breach.
