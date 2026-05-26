# @agentforge-sdlc/adapter-postgres

PostgreSQL repository adapter. The reference implementation. Implements the repository interfaces defined in @agentforge-sdlc/core. All other adapters follow this implementation as their template.

---

## Responsibilities

- Implements all repository interfaces from core/repository
- Writes audit records for every state-changing operation (GP-002)
- Manages connection pooling via pg or postgres.js
- Handles migrations via a defined migration runner

## Must never

- Be imported directly by any package other than core (resolved at startup)
- Skip writing audit records — GP-002 is non-negotiable
- Use raw string concatenation for SQL — always parameterised queries

## Structure

```
src/
├── index.ts
├── types.ts
├── client.ts         # connection pool setup
├── repositories/     # one file per repository interface
└── migrations/       # SQL migration files
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
