# @gestalt/core

The nervous system of Gestalt. Every other package depends on this; it depends on nothing internal.

---

## Responsibilities

- Harness engine — context file management, schema validation, staleness detection, versioning
- Agent communication protocol — TaskMessage envelope, BullMQ queue interface
- Feedback signal taxonomy — typed signal definitions and severity rules
- LLM provider abstraction — all LLM calls go through core/llm, never directly to providers
- Repository pattern interface — `core/repository` defines contracts;
  registry includes `intents`, `executions`, `artifacts`, `signals`,
  `audit`, `users`, `localAuth`, `projects`
- Configuration loader — core/config; no package reads process.env directly
- Platform logger — structured logging; no package uses console.log
- In-process event bus — `core/events` hosts the singleton `eventBus` +
  `emitLiveEvent` so the server's SSE route and in-process workers (the
  generate-layer orchestrator) publish to the same subscriber list

## Key exports

- `TaskMessage, AgentRole, SignalType, TaskType` — shared types
- `QUEUE_NAMES, getQueue, dispatch, createWorker, createQueueEventListener` — BullMQ wrappers
- `createLLMClient, getLLMClient` — provider-agnostic LLM client
- `getRepositories, setRepositories, RepositoryRegistry` — repository registry
- `eventBus, emitLiveEvent, LiveEvent, LiveEventType, EventBus, EventSubscriber` — in-process event bus
- `HarnessEngine, createHarnessEngine, REQUIRED_CONTEXT_FILES` — harness engine
- `logger, createContextLogger, logSignal` — structured platform logger
- `loadConfig, GestaltConfig` — typed config loader

## Must never

- Import from any other @gestalt/* package
- Call an LLM provider SDK directly — the abstraction lives here
- Access the database directly — only the repository interface
- Read process.env directly — always use core/config

## Structure

```
src/
├── index.ts          # public exports only
├── types.ts          # all shared platform types
├── llm/              # LLM provider abstraction
├── queue/            # BullMQ wrappers
├── repository/       # repository interface + registry
├── harness/          # harness engine (context files, versioning, validation)
├── events/           # in-process event bus (SSE producer side)
├── config/           # typed config loader
└── logger/           # structured logger
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
