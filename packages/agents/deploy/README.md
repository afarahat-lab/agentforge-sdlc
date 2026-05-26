# @agentforge-sdlc/agents-deploy

The merge and deploy layer. Takes approved artifact sets from the quality gate and manages their promotion through environments.

---

## Responsibilities

- pr-agent — creates, updates, and merges pull requests
- pipeline-agent — triggers and monitors CI/CD pipeline
- promotion-agent — manages environment promotion (dev → staging → prod)

## Must never

- Merge a PR with any open GOLDEN_PRINCIPLE_BREACH signal
- Merge a PR without a passing security scan result
- Promote to production without staging validation
- Bypass the CI/CD pipeline configured in HARNESS.json

## Structure

```
src/
├── index.ts
├── types.ts
└── agents/
    ├── pr-agent.ts
    ├── pipeline-agent.ts
    └── promotion-agent.ts
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
