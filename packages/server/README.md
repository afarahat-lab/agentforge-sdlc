# @agentforge-sdlc/server

The self-hosted Fastify server. The coordination hub for everything. Receives intent from the CLI, dispatches to the queue, manages project state, serves the dashboard, and exposes the oversight API.

---

## Responsibilities

- REST API — consumed by the CLI and dashboard
- Intent lifecycle management — receives, tracks, and reports on intent cycles
- Queue dispatch — translates API requests into typed TaskMessages on the BullMQ queue
- Project state management — persists project, harness, and execution state via the repository
- Dashboard serving — serves the built React dashboard as static assets
- Oversight API — logs, status, metrics, alert feed, intervention endpoints
- Auth — JWT-based RBAC (admin / operator / viewer)

## Key exports

- `createServer — Fastify app factory`
- `startServer — boots server with config`

## Must never

- Import agent implementation code — agents run as separate workers
- Call LLM providers directly — LLM calls are agent responsibilities via core/llm
- Write files to the project repository — that is the agent's job
- Bypass the repository pattern for database access

## Structure

```
src/
├── index.ts          # server entry point
├── types.ts          # server-specific types
├── app.ts            # Fastify app factory, plugin registration
├── routes/
│   ├── intent.ts     # POST /intents, GET /intents/:id
│   ├── projects.ts   # project management endpoints
│   ├── status.ts     # GET /status, GET /agents
│   ├── logs.ts       # GET /logs (SSE stream)
│   └── auth.ts       # POST /auth/login, POST /auth/refresh
├── middleware/
│   ├── auth.ts       # JWT verification, RBAC enforcement
│   └── audit.ts      # audit record middleware (GP-002)
└── workers/
    └── queue-bridge.ts  # bridges HTTP requests to BullMQ tasks
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
