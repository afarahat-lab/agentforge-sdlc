# CLAUDE.md — Gestalt platform

This file orients Claude Code when working on this repository.
Read it completely before taking any action.

---

## What this project is

Gestalt is a self-hosted agent-first platform that automates the full Software
Development Lifecycle. It is a TypeScript monorepo using pnpm workspaces.

The platform is built on the same principles it enforces in client projects:
context files guide agents, the harness is a first-class artifact, and every
package has a README.md that is the agent's local orientation document.

---

## Before doing anything

1. Read this file completely — especially **Current state** and **Session log**
2. Read `AGENTS.md` (platform-wide coding conventions)
3. Read the relevant package `README.md` for the package you are working in
4. Read `docs/ARCHITECTURE.md` for system-wide context
5. If anything needed is missing from context, state it before proceeding

## After every session — mandatory

Before ending any session, append an entry to the **Session log** section
at the bottom of this file. Include:
- Every file changed and why
- Any decision that deviated from or extended the original design
- Current build status (which packages compile, which don't)
- What remains to be done

This keeps the design chat aligned with what was actually built.

---

## Critical constraints

- **pnpm 9.x only** — pnpm 10+ requires Node 22; this project uses Node 20
  ```bash
  npm install -g pnpm@9.15.4
  ```
- **TypeScript strict mode** — all packages use `strict: true`
- **No `any`** — use `unknown` with type guards instead
- **Named exports only** — no default exports except React components
- **No `console.log`** — use `createContextLogger` from `@gestalt/core`
- **No `process.env` directly** — use `loadConfig()` from `@gestalt/core/config`

---

## Monorepo structure

```
packages/
  core/               — shared types, LLM, queue, repository, harness engine
  server/             — Fastify server, auth, oversight API
  cli/                — gestalt CLI tool
  dashboard/          — React oversight dashboard
  adapters/
    postgres/         — PostgreSQL adapter (reference implementation)
    oracle/           — Oracle adapter (stub)
    mssql/            — SQL Server adapter (stub)
  agents/
    generate/         — intent, design, context, code, test agents + orchestrator
    quality-gate/     — lint, security, constraint, test-runner, review agents
    deploy/           — PR, pipeline, promotion agents
    maintenance/      — drift, alignment, GC, evaluation agents
templates/
  corporate-ops-web-mobile/   — Tier 1 harness template
docs/
  guides/             — quick-start, running (dev setup), deployment, identity
  reference/          — harness-config.md
  runbooks/           — common-issues.md
  ARCHITECTURE.md     — full system design
  DECISIONS.md        — all ADRs
```

---

## Package dependency order

Build in this order:

```
@gestalt/core
  └── @gestalt/adapter-postgres
  └── @gestalt/agents-generate
  └── @gestalt/agents-quality-gate
  └── @gestalt/agents-deploy
  └── @gestalt/agents-maintenance
        └── @gestalt/server
              └── @gestalt/cli
@gestalt/dashboard   (no internal package deps — talks to server via HTTP)
```

---

## Key type alignment rules

The `@gestalt/agents-generate` package has its own local `ContextSnapshot` and
`FeedbackSignal` types in `packages/agents/generate/src/types.ts`. These must
stay aligned with `@gestalt/core` types:

- `FeedbackSignal` must include `autoResolvable: boolean` and `createdAt: Date`
- `ContextSnapshot` must include `projectRoot`, `architectureMd`, `domainMd`
- `AgentRole` values must match the union in `@gestalt/core/src/types.ts`

---

## How to run builds

```bash
# Type check a package
pnpm --filter @gestalt/core typecheck

# Build a package
pnpm --filter @gestalt/core build

# Build all in order
pnpm build

# Run tests
pnpm test

# Docker (requires Docker Desktop running)
docker-compose up -d
docker-compose logs -f server
```

---

## Current build status

As of the last session, packages build in this order:
- `@gestalt/core` — ✅ compiles
- `@gestalt/adapter-postgres` — ✅ compiles
- `@gestalt/agents-generate` — type fixes applied, verify with `pnpm --filter @gestalt/agents-generate build`
- All other agent packages — stubs, should compile
- `@gestalt/server` — compiles
- `@gestalt/dashboard` — React/Vite, built separately

## Known issues to resolve

Run `pnpm --filter <package> build` on each package after `@gestalt/core` and
fix any TypeScript errors before attempting `docker-compose up -d`. The most
common error patterns:

1. **FeedbackSignal literals** missing `autoResolvable` and `createdAt` fields
2. **ContextSnapshot** field name mismatches (`architectureMd` vs `architecture`)
3. **Optional fields** passed as `string | undefined` to functions expecting `string`
   — use `...(val !== undefined ? { key: val } : {})`

---

## Architecture decisions to respect

All ADRs are in `docs/DECISIONS.md`. Key ones:

- ADR-002: Ephemeral workers — agents are stateless BullMQ workers
- ADR-003: BullMQ + Redis for the message queue
- ADR-004: Repository pattern — no direct DB access outside adapters
- ADR-006: pnpm workspaces monorepo
- ADR-007: Five typed feedback signals — never generic errors
- ADR-025: Local auth non-production only
- ADR-026: PlatformUser is a shadow record

---

## What to do if context is missing

If you need information about a layer, component, or decision that isn't in
this file or in `AGENTS.md`, check:

1. The relevant `docs/` file
2. The package `README.md`
3. The source file itself — it has JSDoc comments
4. Ask in your response before making assumptions

---

## Session log

This section is maintained by both this chat and Claude Code.
Every session that modifies the codebase appends an entry here.
When returning to the design chat, paste this section so the context is current.

**Format for Claude Code — at the end of every session, append:**
```
### Session [date] — [Claude Code]
Changed:
- <file>: <what changed and why>
Decisions made:
- <any architectural decision that deviated from or extended the design>
Build status:
- <which packages compile, which don't, what errors remain>
```

---

### Session 2026-05 — Design chat
Status: All 8 layers designed and documented. Phase 2 build started.

Packages implemented:
- `@gestalt/core` — config, logger, LLM client, BullMQ queue, repository interfaces, harness engine
- `@gestalt/adapter-postgres` — connection pool, migrations, intent/audit/user repositories
- `@gestalt/server` — Fastify app, JWT auth, correlation/audit middleware, intent routes, SSE
- `@gestalt/cli` — login, init, run, status, logs, dashboard commands
- `@gestalt/agents-generate` — orchestrator, all 6 specialist agents, all prompts, validators
- `@gestalt/dashboard` — all 8 views, API client, SSE hooks, layout

Type fixes applied (not yet verified in Docker):
- `packages/core/tsconfig.json`: removed `exactOptionalPropertyTypes`
- `packages/agents/generate/src/types.ts`: added `projectRoot`, `architectureMd`, `domainMd` to `ContextSnapshot`; added `autoResolvable`, `createdAt` to `FeedbackSignal`
- `packages/agents/generate/src/orchestrator/context-assembler.ts`: added `IntentSpec` import, type assertion, new snapshot fields
- All agent files: added `autoResolvable` and `createdAt` to `FeedbackSignal` literals

Build status:
- `@gestalt/core`: should compile (type errors fixed)
- `@gestalt/agents-generate`: type fixes applied, verify with `pnpm --filter @gestalt/agents-generate build`
- All other packages: not yet verified in Docker
- `docker-compose up -d`: failing at agents-generate build step

Next task for Claude Code:
1. Run `pnpm --filter @gestalt/agents-generate build` and fix remaining errors
2. Build each package in dependency order, fix errors
3. Get `docker-compose up -d` fully passing
4. Run `gestalt init local-admin` and verify the platform starts

---

## Current state (keep this section current)

**Last updated:** 2026-05 (design chat)

**Repo:** https://github.com/afarahat-lab/gestalt

**What is built and designed:**
- All 8 architecture layers fully designed and documented
- 6 packages implemented (see session log above)
- Docker build partially working — failing at TypeScript compilation

**What is not yet built:**
- `@gestalt/agents-quality-gate` — stubs only, needs full implementation
- `@gestalt/agents-deploy` — stubs only (pipeline/scanner adapters need implementing)
- `@gestalt/agents-maintenance` — stubs only (monitoring adapters need implementing)
- `@gestalt/adapter-oracle` — stub
- `@gestalt/adapter-mssql` — stub
- `@gestalt/registry` — types and client only

**Pending enhancements (to be designed in chat before implementing):**
- None yet — add here as they are discussed

**Known architectural constraints Claude Code must respect:**
- See AGENTS.md for full list
- pnpm 9.x only (Node 20 compatibility)
- No direct DB access outside adapter packages
- No direct LLM calls outside @gestalt/core/llm
- GOLDEN_PRINCIPLE_BREACH signals are never auto-resolved
- All state-changing operations write an audit record (GP-002)
