# @gestalt/agents-generate

The generate layer. Translates human intent into a coherent, ordered set of software artifacts. Operates as a two-level system: an orchestrator that plans and coordinates, and specialist agents that each handle one artifact type.

---

## Responsibilities

- **Orchestrator BullMQ worker** — drains `bull:gestalt-generate:*`. For
  each intent task it:
  - Looks up the project, clones its Git repo into a fresh temp
    directory (ADR-032), checks out `defaultBranch`
  - Drives the fixed execution graph; per step creates an
    `agent_executions` row (`running` → `completed` / `failed` /
    `skipped`) with tokens + duration, persists every `result.signals`
    + `result.artifacts` to the matching repository
  - Emits SSE events on the `@gestalt/core/events` bus at every
    transition (`intent.status-changed`, `agent.started`,
    `agent.completed`, `signal.emitted`) so the dashboard and `gestalt
    run` SSE consumer see live progress
  - On a successful cycle, writes generated artifacts into the cloned
    tree, commits `feat: <intent text> [gestalt <corr8>]`, and pushes
    to `defaultBranch`. The temp dir is removed in a `finally` block
  - On a high-impact CONTEXT_GAP from intent-agent, stops the plan and
    transitions the intent to `waiting-for-clarification`
- intent-agent — parses raw intent into structured IntentSpec, detects ambiguities
- design-agent — produces domain model changes, API contracts, component specs
- context-agent — updates context files (AGENTS.md, DOMAIN.md, DECISIONS.md) if needed
- lint-config-agent — updates constraint rules if new module boundaries introduced
- code-agent — generates application code within harness constraints
- test-agent — generates test suite from IntentSpec success criteria

## Execution order

`intent → design → [context, lint-config] (parallel) → code → test`

## Skip rules

- context-agent: skip if IntentSpec has no affected context files
- lint-config-agent: skip if design-agent introduces no new module boundaries
- All other agents: never skip

## Key exports

- `startOrchestratorWorker(queueConfig)` — registers the BullMQ worker;
  called once at server startup from `packages/server/src/server.ts`
- `runIntentAgent, runDesignAgent, runContextAgent, runLintConfigAgent,
  runCodeAgent, runTestAgent` — specialist agent entry points
- `buildExecutionPlan, getReadySteps, isPlanComplete, hasPlanFailed,
  getPriorArtifacts` — plan-builder utilities
- `assembleContext(projectRoot, plan, forAgent, intentText)` — builds the
  ContextSnapshot delivered to each agent (the operator's intent text is
  always populated on `intentSpec.rawIntent`)
- `routeFeedback, requiresEscalation, isAutoResolvable` — quality-gate
  feedback routing
- `transition, isTerminalState, isWaitingState` — state machine
- Validators: `validateIntentSpec`, `validateDesignArtifact`, `validateArtifactSet`
- Prompt builders: `buildIntentPrompt`, `buildDesignPrompt`,
  `buildContextPrompt`, `buildCodePrompt`, `buildTestPrompt`,
  `buildLintConfigPrompt`

## Must never

- Let agents communicate directly — all coordination through the orchestrator
- Proceed past intent-agent if high-impact ambiguities are detected
- Auto-resolve GOLDEN_PRINCIPLE_BREACH — always escalate
- Read context files directly during execution — use ContextSnapshot from the message
- Push generated artifacts anywhere but the project's Git repo (ADR-032);
  in particular, never write files to the developer's local machine

## Structure

```
src/
├── index.ts
├── types.ts
├── orchestrator/
│   ├── orchestrator.ts       # main orchestrator worker
│   ├── plan-builder.ts       # fixed graph, ready-step resolution
│   ├── context-assembler.ts  # assembles ContextSnapshot per agent
│   ├── feedback-router.ts    # routes gate signals to agents
│   └── state-machine.ts      # valid state transitions
├── agents/
│   ├── intent-agent.ts
│   ├── design-agent.ts
│   ├── context-agent.ts
│   ├── lint-config-agent.ts
│   ├── code-agent.ts
│   └── test-agent.ts
├── prompts/
│   ├── intent-prompt.ts
│   ├── design-prompt.ts
│   ├── context-prompt.ts
│   ├── lint-config-prompt.ts
│   ├── code-prompt.ts
│   └── test-prompt.ts
└── validators/
    ├── intent-validator.ts
    ├── design-validator.ts
    └── artifact-validator.ts
```

## Agent orientation

For agents working on this package:

1. Read this file first to understand the package's role and boundaries
2. Read `src/types.ts` to understand the data structures
3. Read `src/index.ts` to understand what is publicly exported
4. Check `../../docs/ARCHITECTURE.md` for system-wide architectural rules
5. Check `../../AGENTS.md` for platform-wide coding conventions
6. Emit `CONTEXT_GAP` if anything needed to complete your task is missing from context
