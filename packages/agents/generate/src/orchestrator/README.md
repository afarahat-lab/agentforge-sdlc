# Generate layer — Orchestrator

Coordinates the fixed execution graph for a single intent cycle. Stateful
across the cycle; all specialist agents are stateless.

---

## Files

| File | Purpose |
|---|---|
| `orchestrator.ts` | Main BullMQ worker. Clones the project repo, drives the plan to completion, persists per-step rows, emits SSE events, commits + pushes generated artifacts. |
| `plan-builder.ts` | Builds and queries the fixed dependency graph. Determines which agents are ready to run. |
| `context-assembler.ts` | Assembles the `ContextSnapshot` delivered to each agent. The operator's intent text is always written onto `intentSpec.rawIntent`. |
| `feedback-router.ts` | Routes typed quality-gate signals to the correct specialist agent. |
| `state-machine.ts` | Defines and enforces valid orchestrator state transitions. |

## What `handleIntentTask` actually does (per cycle)

1. Look up the project; refuse if not registered (`POST /projects` first)
2. `mkdtemp` + `simpleGit().clone()` the project's Git repo with the PAT
   embedded as `x-access-token`; check out `defaultBranch`
3. Transition the intent to `generating` and broadcast
   `intent.status-changed`
4. Drive the plan. Each step:
   - Creates an `agent_executions` row (status=`running`) and emits
     `agent.started`
   - Runs the specialist agent
   - Persists `result.signals` (emitting `signal.emitted` for each) and
     `result.artifacts`
   - Updates the execution row to `completed` / `failed` / `skipped` with
     `tokensUsed` + `durationMs` and emits `agent.completed`
   - If an intent-agent CONTEXT_GAP fires, the plan stops and the intent
     transitions to `waiting-for-clarification`
5. On a successful plan: write artifacts into the working tree, `git
   commit` (`feat: <intent text> [gestalt <corr8>]`), `git push origin
   <defaultBranch>`, transition the intent to `in-review`, dispatch a
   `gate:review` task to the quality-gate queue
6. The `finally` block `rm -rf`s the temp dir on every code path

## Rules for agents working here

- Never dispatch an agent before its dependencies are completed or skipped
- Always stop the cycle if `routeFeedback` returns `null`
  (GOLDEN_PRINCIPLE_BREACH)
- Per-step DB rows + SSE events are non-negotiable — when adding a new
  branch in `drivePlan`, make sure the execution row gets a terminal
  status (`completed` / `failed` / `skipped`) and the right
  `agent.completed` event fires
- All Git operations must go through `simple-git` (never
  `child_process.exec('git …')`)
- The cloned working directory is removed in the `finally` block —
  artifacts only survive if they were committed and pushed
- Maximum 3 full generate → gate cycles before escalating to human

## Context needed

- `../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../docs/DECISIONS.md` — ADR-032 (Git is the project
  filesystem) is the binding constraint on this directory
- `../../../../../AGENTS.md` — platform conventions
