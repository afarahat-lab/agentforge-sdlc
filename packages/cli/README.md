# @gestalt/cli

The developer-facing interface to Gestalt. Communicates with the server over HTTP. Developers interact with this daily; it should feel fast, clear, and informative.

---

## Responsibilities

- gestalt init — four-phase harness initializer (LLM bootstrap → intent capture → generation → validation)
- gestalt run '<intent>' — submit intent to the generate layer
- gestalt status — view current agent activity and intent cycle state
- gestalt logs — tail the execution log
- gestalt dashboard — open the oversight dashboard in the browser

## Key exports

- `init — harness initializer command handler`
- `run — intent submission command handler`
- `status — status display command handler`

## Must never

- Call the database directly — always go through the server API
- Call LLM providers directly — LLM bootstrap config is sent to the server
- Import from agent packages — CLI has no knowledge of agent internals
- Store sensitive config in plaintext — API keys written to HARNESS.json only

## Structure

```
src/
├── index.ts          # CLI entry point, command registration
├── types.ts          # CLI-specific types
├── commands/
│   ├── init.ts       # gestalt init — four-phase initializer
│   ├── run.ts        # gestalt run
│   ├── status.ts     # gestalt status
│   ├── logs.ts       # gestalt logs
│   └── dashboard.ts  # gestalt dashboard
├── api/
│   └── client.ts     # typed HTTP client for the server API
└── ui/
    └── prompts.ts    # interactive terminal prompts (ink or enquirer)
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
