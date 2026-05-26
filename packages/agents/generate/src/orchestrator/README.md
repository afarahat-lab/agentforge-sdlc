# Generate layer — Orchestrator

Coordinates the fixed execution graph for a single intent cycle. Stateful across the cycle; all specialist agents are stateless.

---

## Files

| File | Purpose |
|---|---|
| `orchestrator.ts` | Main BullMQ worker. Receives intent task, drives the plan to completion. |
| `plan-builder.ts` | Builds and queries the fixed dependency graph. Determines which agents are ready to run. |
| `context-assembler.ts` | Assembles the ContextSnapshot delivered to each agent at dispatch time. |
| `feedback-router.ts` | Routes typed quality gate signals to the correct specialist agent. |
| `state-machine.ts` | Defines and enforces valid orchestrator state transitions. |

## Rules for agents working here

- Never dispatch an agent before its dependencies are completed or skipped
- Always stop the cycle if routeFeedback returns null (GOLDEN_PRINCIPLE_BREACH)
- Always persist plan state to the database after each step completes
- Maximum 3 full generate→gate cycles before escalating to human

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
