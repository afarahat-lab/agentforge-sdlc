# @agentforge-sdlc/adapter-mssql

SQL Server repository adapter. Implements the same repository interfaces as the postgres adapter. Idiomatic T-SQL — no lowest-common-denominator queries.

---

## Responsibilities

- Implements all repository interfaces from core/repository
- Writes audit records for every state-changing operation (GP-002)
- Uses mssql driver with connection pool

## Must never

- Deviate from the repository interface contract defined in core
- Skip writing audit records
- Use raw string concatenation for SQL

## Structure

```
src/
├── index.ts
├── types.ts
├── client.ts
├── repositories/
└── migrations/
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
