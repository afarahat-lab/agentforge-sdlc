# SUMMARY.md — design-chat handoff

_Paste this file into the design chat when returning for architecture
discussions. It is the current platform state plus the last three session
entries so the design chat sees both where the platform stands and how it
got here recently._

_Regenerate after every session that updates `STATE.md` / `SESSION_LOG.md`.
Source of truth: those two files. Do not edit `SUMMARY.md` by hand — its
content is derived._

---


## Current state (keep this section current)

**Last updated:** 2026-05-31 (Claude Code — Maintenance view: Recent Runs populated, Run now error UX)

**Repo:** https://github.com/afarahat-lab/gestalt

**What is built and working:**
- All 8 architecture layers fully designed and documented
- **All four SDLC layers fully implemented end-to-end:** generate,
  quality-gate, deploy, maintenance. The closed loop runs:
  `human intent → generate → gate → deploy → deployed`, plus
  `maintenance scheduler → queues typed MaintenanceIntent → back into
  generate`. See per-layer detail bullets below; per-agent run lifecycles
  are summarised in the "Session log" entries dated 2026-05-29 / 30
- All 12 buildable workspace packages compile clean (`pnpm -r build`)
- `docker-compose up -d` succeeds — server, postgres, redis all `Up (healthy)`
- All seven migrations apply on startup: `001_initial`, `002_local_auth`,
  `003_projects`, `004_deployments`, `005_maintenance`,
  `006_intent_clarification`, `007_execution_logs`
- Server reachable on http://localhost:3000 — `/health` returns 200
- Auth middleware active — protected routes return 401
- **Dashboard SPA reachable in the browser, deep-linkable, no path
  collisions with the API.** `gestalt dashboard` opens
  `<serverUrl>/app/`; the server serves the React SPA from
  `packages/dashboard/dist/` via `fastify-static` mounted at the
  `/app/` prefix. Vite is built with `base: '/app/'` so asset URLs in
  the built `index.html` reference `/app/assets/<hash>.{js,css}`.
  React Router uses `<BrowserRouter basename="/app">`, so every
  `navigate('/intents/${id}')` inside the SPA resolves to
  `/app/intents/${id}` in the URL bar. The API still owns the root
  and bare paths (`/intents/:id`, `/alerts`, etc.) — the URL spaces
  are now fully disjoint, which means **dashboard URLs are
  shareable**: copy from the address bar, paste in a new tab, and
  the dashboard loads that exact view (RequireAuth bounces to
  `/app/login` if no token, otherwise renders the deep-linked
  component). The auth preHandler bypasses GET requests under
  `/app/*` only; non-GET methods always require auth. The bare
  server URL (`/`) issues a 302 redirect to `/app/` for convenience.
  The not-found handler is the SPA fallback only for `/app/*` GETs;
  any other unknown GET (e.g. a typo at `/intnts`) returns 404 JSON
  instead of silently serving the SPA shell (whose asset refs would
  break)
- First-boot bootstrap verified end-to-end: `gestalt init-admin` creates
  admin + JWT; `gestalt login` authenticates; `GET /auth/me` returns user
- **CLI server URL is fully configurable.** `gestalt config show` /
  `gestalt config set-server <url>` / `gestalt config reset` let
  operators inspect and change `~/.gestalt/config.json` without going
  through the auth flow. Every CLI command that contacts the server
  (`login`, `init`, `init-admin`, `run`, `status`, `logs`,
  `dashboard`, `projects list|use|set-adapter`) accepts an optional
  `--server <url>` flag — one-shot override on all of them; only
  `login` and `init-admin` persist the URL to config on success
  (those are the bootstrap commands). All commands route URL
  selection through one helper (`resolveServerUrl`); no remaining
  direct `config.serverUrl` reads in command files. `gestalt status`
  prints the active server URL in its header
  (`Gestalt — http://localhost:3000`). Every connectivity failure
  surfaces the attempted URL through a shared formatter and, when
  the URL is still the local-dev default
  (`http://localhost:3000`), adds a first-run hint nudging the user
  to `gestalt config set-server` + `gestalt login`. URL validation
  (`http://` or `https://` only, trailing slash stripped) lives in
  `normaliseServerUrl`. `gestalt config show` never prints the token
  itself — only `set` / `not set`
- `gestalt init` fully implemented — Git-backed four-phase wizard:
  registers project on server, server clones repo, commits harness files,
  pushes; developer runs `git pull` to receive harness locally
- `gestalt projects list`, `gestalt projects use <name>`, and
  `gestalt projects set-adapter <name> <noop|github-actions>` working.
  `set-adapter` clones the project repo, mutates `pipeline.adapter` in
  `HARNESS.json`, commits as
  `chore: update pipeline adapter to <adapter> [gestalt]`, and pushes
  to `defaultBranch` — HARNESS.json in the repo remains the source of
  truth (ADR-032). Audit-logged as `project.config-updated`
- `gestalt run` queues intent → orchestrator picks up → clones project
  repo fresh per cycle → runs generate loop against cloned harness files
- **Intent clarification flow wired end-to-end.** A vague intent
  (e.g. "make it better") no longer fails silently at the test-agent —
  the intent-agent runs, sees `successCriteria.length === 0` (or a
  high-impact ambiguity), and returns a new typed
  `AgentStatus = 'clarification-needed'` with a `{ reason, suggestions }`
  payload. The orchestrator:
  - creates an `alerts` row (`type: 'clarification-needed'`,
    `severity: high`, `requiredAction: 'provide-clarification'`,
    `context.intentId` + `context.suggestions[]` JSONB-stashed)
  - emits an `alert.created` SSE event so the dashboard updates
    without a refresh
  - transitions the intent to `waiting-for-clarification`
  - flips `plan.state = 'waiting_for_clarification'` so the outer
    while-loop bails before any downstream agent runs
  The maintenance-sourced intent guard (ADR-035 prefix
  `[gestalt-maintenance/<type>]`) short-circuits the clarification
  check — those are typed `MaintenanceIntent` objects and never
  need operator clarification. Dashboard Alerts view renders the
  card with the `?` badge, suggestions list, textarea, and a
  "resume intent" button. Resume flow:
  - `POST /intents/:id/clarify { clarification }` acknowledges every
    unacknowledged `clarification-needed` alert for the
    correlationId, audit-logs the operator's clarification text
    (GP-002), and re-dispatches a `generate:intent` task with
    `clarification` threaded through
  - orchestrator hydrates the missing `projectId` + `text` from
    the persisted intent row, calls `runIntentAgent` with the
    clarification text appended to the prompt under an "Operator
    clarification" heading; downstream agents proceed normally
  - the `intent-agent` clarification gate runs AFTER the LLM call
    (we trust the LLM to drive the decision, not a pre-flight
    regex)
  - Verified live (`61fd59a6`): submitted "make it better" against
    `trackeros`; intent paused in ~2 s, alert visible in dashboard
    with three suggestions, textarea, and resume button; submitted
    "Add a slugify utility under src/shared/utils/slugify with
    slugify(s: string): string"; alert disappeared, cycle resumed,
    all six generate agents ran in ~22 s; intent reached
    `in-review`. Browser screenshots captured of alert card + post-
    submit empty state
  - **Clarification text persists across gate retries
    (migration 006).** `intents.clarification TEXT NULL`;
    `POST /intents/:id/clarify` writes the column via
    `intents.saveClarification(id, text)` BEFORE dispatching the
    resume task. The orchestrator reads `intentRecord.clarification`
    on every dispatch (including the gate-retry leg, whose BullMQ
    payload does not carry the text) and threads it into the
    intent-agent's task. Audit-log records only
    `{ clarificationLength: N, acknowledgedAlertIds, ip }` — the
    text itself never leaves the DB (GP-006). Verified live
    (`63bc2a3b`): intent-agent ran 3 times across the cycle
    (initial pause, post-clarify resume, gate retry); each run
    saw the persisted 156-char clarification; only ONE
    clarification alert was ever created (the original — the
    pre-fix bug would have created a second one on the retry
    leg); intent reached `escalated` for an unrelated review-agent
    GP_BREACH after the second gate review
- **Dashboard Intent Feed now shows ALL intents, including failed
  and waiting-for-clarification.** Pre-existing bug: the feed read
  `projectId` from `localStorage.getItem('gestalt_project')` with
  fallback `'default'` — that string never matched a real
  `project_id` and `listIntents` always returned zero rows (so
  failed intents had no trace in the dashboard). No status filter
  is applied to `listIntents` — the feed shows the full intent
  timeline for the project
- **Active Agents card shows intent + cycle progress + tokens.**
  `GET /status/agents` is enriched per row with `intentText`,
  `cycleProgress: { completed, total }`, and `tokensSoFar` (the
  running total across all agents in the cycle so far). Same
  endpoint, same auth; the dashboard's `ActiveAgents.tsx` now
  renders each card with the agent role + pulsing ◎, an
  elapsed-time stamp in the top-right (`1s` / `1m 23s`), the
  intent text quoted and truncated to 55 chars, a segmented
  progress bar (one block per planned agent), the
  `step N of M` label, and the token count. Auto-refresh every
  5 s plus `agent.started` / `agent.completed` SSE-triggered
  refresh kept from the previous implementation. Server-side
  the enrichment de-dupes per-correlation lookups so a
  multi-agent cycle triggers one `intents.findByCorrelationId`
  and one `executions.findByCorrelationId` instead of N each
- **Deployments view renders a 4-node pipeline timeline.** New
  `GET /deployments?projectId=…&limit=…` returns one row per
  intent that has at least one `deployment_events` row,
  enriched with the full event timeline (ASC by `created_at`),
  `prUrl` / `prNumber` / `branch` (from the `pr-opened` event's
  metadata) / `runId` / `deploymentUrl`. Three intent statuses
  scanned in parallel (`deploying`, `deployed`, `failed`);
  cycles with no events are dropped client-side so a
  gate-failed intent never reaches an empty card. Dashboard's
  `Deployments.tsx` renders three sections (In progress /
  Deployed / Failed) — each card has the status badge, branch
  tag, timestamp, intent text (65-char truncation), the
  4-node timeline (PR → Pipeline → Staging → Production)
  with green ●-filled / muted ○-empty / blue ◎-in-progress /
  red ✗-failed nodes, green connectors between completed
  nodes, status labels (opened/passed/promoted/deployed) and
  HH:MM timestamps under each filled node. Footer has
  `[↗ View PR #N]` and `[↗ View deployment]` links —
  `target="_blank" rel="noopener noreferrer"`. Pipeline-failed
  flips the Pipeline node red; downstream nodes stay muted.
  Pipeline-triggered (no -passed yet) shows the Pipeline node
  pulsing blue
- **Postgres `deployment_events.metadata` JSONB read path
  patched** to defensively `JSON.parse` when postgres.js
  returns the column as a string instead of an object. Same
  pattern as `parseContext` in the alerts repo and
  `parseFindings` in the maintenance-runs repo. Before this
  fix the `branch` extraction in `/deployments` returned null
  for every deployment because `metadata['branch']` against a
  string is `undefined`
- **Agent execution logs populated for every agent run, accordion
  in IntentDetail.** Migration 007 added `agent_execution_logs`
  (1:1 with `agent_executions`, FK cascades on delete). All three
  orchestrators (generate / quality-gate / deploy) persist one log
  row per execution capturing the prompt, the LLM response, the
  result status, the artifact paths the agent produced, the signal
  types it emitted, and the error message on failure. LLM-backed
  agents (intent / design / context / code / test in generate,
  review-agent in gate) fill the prompt + response columns;
  non-LLM agents (lint-config when skipped, constraint-agent in
  gate, pr-agent / pipeline-agent / promotion-agent in deploy)
  leave both null. New `GET /executions/:id/log` returns the
  execution + log + filtered artifacts + filtered signals
  (filtered by `producedBy === agentRole` and
  `sourceAgent === agentRole` respectively). Returns 200 with
  `log: null` for pre-migration-007 executions so the dashboard
  can render a placeholder without confusing "intent missing"
  with "feature didn't exist yet". The dashboard's IntentDetail
  rewrote the agent timeline as a clickable accordion — click a
  row → first-time fetch shows a loading state → subsequent
  clicks use cached state. Expanded panel renders Agent meta
  (role / status / duration / started time), Prompt (with copy
  button + truncate-to-400-chars-with-show-full toggle), LLM
  response (same controls), Artifacts produced, Signals emitted,
  and an error box at the top when present. Verified live
  (`9c28d399` cycle, titleCase utility): full deploy cycle in
  ~17 s, 12 executions / 12 log rows; LLM agents show
  prompt-length 1300–3469 chars and response-length 31–1654
  chars; non-LLM agents show `prompt = NULL`,
  `llmResponse = NULL`, `resultStatus = passed/completed`;
  endpoint returns the full prompt and response bytes;
  dashboard renders the expanded panel with copy + show-full
  buttons and the "Not applicable" placeholders on the
  constraint-agent row
- **`GET /projects` returns ALL registered projects** to any
  authenticated user. The previous owner-only filter
  (`projects.list(request.user.id)` → only rows where
  `created_by = userId`) meant that if operator A registered
  `trackeros` and operator B logged into the dashboard, B would
  see "No projects — run gestalt init" even though
  `gestalt projects list` worked for A. Self-hosted small teams
  expect every operator to see every project; the filter has been
  switched to `projects.listAll()`. If per-project access control
  is required later, add a `project_members` table and intersect
  there — do NOT re-introduce the owner-only filter at this
  endpoint
- **ProjectContext defensively redirects to `/app/login` on 401.**
  RequireAuth at the top of the dashboard route tree only checks
  for the presence of a token, not its validity. A stale or
  expired JWT used to bounce every API call to 401, which
  ProjectContext silently caught and rendered as "No projects —
  run gestalt init". The catch block now distinguishes
  `ApiError.status === 401` (delete the token, hard-navigate to
  `/app/login`) from other failures (network down, 500 — keep
  showing the layout, set `projects: []`)
- **Project selection is global across the entire dashboard.**
  `packages/dashboard/src/context/ProjectContext.tsx` fetches
  `/projects` once on mount, hydrates from
  `localStorage.gestalt_project_id` if present, falls back to
  `projects[0]` if the stored id is missing or no longer
  resolves, and persists every change back to `localStorage`. The
  Layout sidebar renders a `<select>` between the logo and the
  navigation links — switching projects there applies
  immediately to every project-scoped view (IntentFeed / Alerts /
  Deployments / QualityGate / Maintenance). ActiveAgents stays
  global (agent executions span all projects). Window-focus
  refetch keeps the project list current when an operator runs
  `gestalt init` in another terminal (no new SSE event needed).
  The earlier per-view fetches and localStorage reads
  (`gestalt_project` with `'default'` fallback in
  Deployments / QualityGate; the per-view dropdown in IntentFeed)
  are removed. Every project-scoped view guards on
  `!currentProjectId` with an EmptyState pointing at
  `gestalt init`. Alerts are project-scoped client-side by
  joining `alert.context.intentId` against the project's intent
  list (the `/alerts` API has no `projectId` filter — captured as
  a Pending enhancement). Verified live: selector renders with
  the existing project pre-selected, the IntentFeed shows
  "3 total · trackeros" with all three intents (escalated +
  needs-input + failed) including the older `failed` one the
  operator originally reported as invisible; all five
  project-scoped views render with the selector value in the
  sidebar across navigations; reload retains the choice; clearing
  localStorage falls back to `projects[0]`; a bogus stored id
  also falls back cleanly
- **Maintenance layer wired end-to-end (ADR-018, ADR-019, ADR-020,
  ADR-035).** Four scheduled agents run in-process via `node-cron`,
  registered as `startMaintenanceScheduler(config)` at server.ts step 9:
  - **drift-agent** (daily 02:00 UTC) — clones the project, finds
    `src/modules/*/...` files changed in the last 30 days, compares
    against the most recent commit timestamp on the global context
    files; for modules drifted by > 7 days appends a timestamped HTML
    comment to `docs/DOMAIN.md` (ADR-018 additive-only exception, direct
    commit + push) and queues a `CONTEXT_UPDATE` MaintenanceIntent
  - **alignment-agent** (daily 03:00 UTC) — reads context files,
    cross-checks DOMAIN.md entities ↔ ARCHITECTURE.md modules, and
    GP-NNN cross-references in AGENTS.md; queues `CONTEXT_ALIGNMENT`
    intents per misalignment
  - **gc-agent** (weekly Fri 04:00 UTC) — deletes remote `gestalt/*`
    branches older than 30 days, `.gestalt/*` spec files older than 90
    days (committed deletion), and `deployment_events` rows older than
    90 days. Never queues intents
  - **evaluation-agent** (every 15 min) — resolves the project's
    `MonitoringAdapter` from HARNESS.json; queries error rate / p99
    latency / alert count; queues `PERFORMANCE_DEGRADATION` or
    `SECURITY_FINDING` intents on threshold breach. Dedupe guard skips
    any candidate whose `[gestalt-maintenance/<type>]` prefix already
    appears on an open intent (status `pending` / `generating`)
  - All four agents share a runner (`runMaintenanceAgent`) that creates
    a `maintenance_runs` row, dispatches queued intents into the
    `gestalt-generate` queue with `source: 'maintenance-agent'` and the
    operator-supplied `suggestedAction` as intent text, updates the row
    on completion, and emits a `maintenance.run-completed` SSE event
  - Manual operator trigger via `POST /maintenance/trigger { agentRole,
    projectId }` (requireRole operator); same runner code path as the
    cron schedules
  - `GET /maintenance/runs?projectId&agentRole&limit` returns
    `{ data: MaintenanceRunRecord[] }` (the standard server envelope).
    The dashboard's `Maintenance.tsx` view consumes it and renders the
    "Recent runs" list — clicking the `run now` button against any of
    the four agents triggers the run via `POST /maintenance/trigger`,
    the runner persists the row synchronously (in-process — no BullMQ
    hop), and the view re-fetches after 1 s plus on the
    `maintenance.run-completed` SSE event. Trigger errors render as a
    red `✗ Failed to trigger: <message>` strip under the agent card
    and auto-clear after 5 s
  - Live verification against `trackeros`: all 4 agents triggered;
    alignment-agent produced 5 findings → 5 maintenance intents
    queued (all carrying `[gestalt-maintenance/CONTEXT_ALIGNMENT]`
    prefix; generate orchestrator picked them up immediately); other
    agents returned 0 findings as expected on this small repo
- **Deploy layer v1 wired end-to-end (ADR-033, ADR-034).** A `pass`
  verdict on the quality gate now dispatches `deploy:pr` to the new
  deploy-orchestrator (`startDeployWorker` registered at server.ts
  step 8). The generate orchestrator no longer mutates the project's
  Git tree — pr-agent owns the only commit + push, to a PR branch,
  never to `defaultBranch`. The deploy worker drains
  `bull:gestalt-deploy:*` and chains three agents:
  - **pr-agent** — clones the project, cuts
    `gestalt/<corr8>-<slug>` (intent's first 5 words, kebab-cased,
    capped at 40 chars), writes artifacts, commits + pushes, opens a
    PR via the resolved `PipelineAdapter`. Transitions intent
    `approved → deploying`. Writes a `pr-opened` row to
    `deployment_events`, emits `deployment.updated` with `prUrl` +
    `prNumber`
  - **pipeline-agent** — triggers the adapter's pipeline, polls
    `getPipelineStatus` every 15s (up to 10 min). On `passed` writes
    `pipeline-passed`. On `failed`/`cancelled` emits `TEST_FAILURE`;
    on timeout emits `CONTEXT_GAP`
  - **promotion-agent** — promotes staging then production. **ADR-034
    is enforced here**: production refused unless a
    `promoted-staging` row exists for the same correlationId (emits
    `GOLDEN_PRINCIPLE_BREACH`, deploy-orchestrator transitions to
    `escalated`). On success writes `promoted-staging` /
    `promoted-production` rows
  - Final transition: intent → `deployed` after production promote.
    All temp clones cleaned in `finally`
  - PipelineAdapter (ADR-033) abstraction: `createPullRequest`,
    `triggerPipeline`, `getPipelineStatus`, `promoteToEnvironment`.
    `GitHubActionsAdapter` (REST API + PAT from `project_git_credentials`)
    and `NoOpPipelineAdapter` (immediate plausible fakes with a 500ms
    pipeline-status delay so dashboards see the `running → passed`
    transition) included. Resolved per-task from `HARNESS.json`
    `pipeline.adapter`; absent or unrecognised → NoOp
  - First live cycle (`8f53b75d`, string-case utility module): 30s
    total — generate 17s → gate 2s → deploy 6s (PR open 2.5s,
    pipeline 1.9s, staging promote 1.0s, production promote 0.9s);
    intent → `deployed`. Branch `origin/gestalt/8f53b75d-add-a-string-case-utility-module`
    pushed to GitHub; deployment_events has all 5 expected rows
  - **First REAL GitHub Actions cycle (`67e5ee02`, kebab-case utility,
    2026-05-30 session).** Adapter switched from `noop` to
    `github-actions` via the new `gestalt projects set-adapter` CLI.
    49 s wall-clock total — generate 12 s → gate 1 s → deploy 30 s
    (pr-agent 4.6 s, pipeline-agent 21.0 s including the real GitHub
    Actions run, staging promote 1.8 s, production promote 1.8 s).
    PR #1 opened on `afarahat-lab/trackeros`, GitHub Actions run
    `26689527360` completed with `conclusion: success`,
    `event: workflow_dispatch`. All 5 `deployment_events` rows carry
    the real numeric `run_id` and a real `pr_url`; the dashboard /
    `gestalt status --id` are no longer faking. PAT-scope GP_BREACH
    path was NOT exercised (the PAT used had `workflow` scope);
    detection logic is unit-shaped and tested at the adapter level
    only. ADR-034 production-without-staging path also stays
    NoOp-validated since the cycle ran clean
- **Gate ↔ generate feedback loop wired.** A `fail` verdict (auto-resolvable
  signals, no GP_BREACH) dispatches a `generate:intent` task back to the
  generate queue with `retryCount + 1` and the signals routed to the
  responsible specialist agent (LINT_FAILURE / TEST_FAILURE / CONSTRAINT_VIOLATION
  → code-agent; CONTEXT_GAP → context-agent). The intent transitions
  `in-review → generating` for the retry. `code-prompt` includes a
  "Quality-gate feedback from the previous attempt" section listing every
  prior signal with file:line + rule. After `MAX_GATE_RETRIES = 3` cycles
  the gate gives up and marks the intent `failed`. The retry leg's commit
  uses `fix:` prefix and a `retry N/3` suffix so `git log` narrates the
  cycle history. Verified live (`2a57b087`): 4 cycles fired, all
  committed to Git, intent ended at `failed` after retry budget
  exhausted
- **Quality gate v1 wired end-to-end.** After the generate orchestrator
  pushes artifacts, the gate worker (registered as `startGateWorker(config.queue)`
  in `server.ts` step 7) clones the project repo fresh and runs:
  - `constraint-agent` — deterministic regex checks (no-any, no-console,
    no-direct-db-outside-shared-db, no-hardcoded-secret, no-direct-llm-sdk).
    Hardcoded-secret and direct-LLM-SDK emit GOLDEN_PRINCIPLE_BREACH.
  - `llm-review-agent` — single LLM call summarising the artifact set;
    critical / golden-principle items become GOLDEN_PRINCIPLE_BREACH
    signals, high/medium become CONSTRAINT_VIOLATION, low/info land in
    the prose review artifact only. Full review saved as
    `.gestalt/llm-review-<corr8>.md` in the `artifacts` table
  - `synthesiseGateResult` produces a verdict: any GOLDEN_PRINCIPLE_BREACH
    → `escalate`; any CONSTRAINT_VIOLATION / TEST_FAILURE / LINT_FAILURE
    → `fail`; otherwise `pass`
  - Intent transitions: `in-review` → `approved` / `failed` / `escalated`
  - Gate emits `agent.started` / `agent.completed` / `signal.emitted`
    per agent + a top-level `gate.completed` event with verdict + summary
  - First live cycle (`b1f6eecd…`): constraint-agent caught a direct-DB
    import outside `shared/db/`; review-agent caught a missing GP-003
    input validation (escalating) + a potential data-exposure concern in
    the audit-log. Intent landed at `escalated` as designed
- **First full intent → code → push cycle verified end-to-end.** A real
  intent ("Add a hello world endpoint at GET /hello") ran six agents
  (intent / design completed, context + lint-config skipped, code +
  test completed) in ~11 seconds against `gpt-4o`, produced 7 artifacts,
  and the orchestrator committed + pushed `8938d51` to the project's
  GitHub repo (commit subject `feat: Add a hello world endpoint at GET
  /hello returning JSON {message:"hello" [gestalt 75000cb2]`). Files
  landed at the expected paths (`src/modules/hello/...`,
  `src/api/index.ts`, `src/shared/auth/rbac-middleware.ts`,
  `__tests__/hello-routes.test.ts`, `.gestalt/{intent,design}-spec.json`).
  `git pull` on the developer's local clone yields them
- Generate-layer cycles are fully observable and write to Git:
  - one `agent_executions` row per step (`running` → `completed` /
    `failed` / `skipped`) with `tokensUsed` + `durationMs`
  - every `result.signals` saved to `signals`; every `result.artifacts`
    saved to `artifacts`
  - SSE events emitted on the in-process bus at every transition —
    `intent.status-changed`, `agent.started`, `agent.completed`,
    `signal.emitted` — verified by tapping `GET /events?token=…` during a
    real submission
  - on a successful cycle the orchestrator writes artifacts into the
    cloned tree, commits `feat: <intent> [gestalt <corr8>]`, and pushes
    to `defaultBranch`; developers `git pull` to receive
  - the event bus lives in `@gestalt/core/events` so both the server SSE
    route and the orchestrator publish on the same singleton without an
    agents → server dep cycle
- `gestalt init local-admin` (old broken syntax) now fails fast with a
  clear error (`allowExcessArguments(false)` on init command)
- `GET /status`, `GET /status/agents`, `GET /intents`, `GET /intents/:id`
  all return 200

**Implemented with caveats (worth knowing):**
- `@gestalt/agents-quality-gate` — constraint-agent + llm-review-agent +
  gate orchestrator implemented and exercised live. lint-agent /
  security-agent / test-runner-agent remain stubs (need a
  pnpm-install-in-clone pipeline to run real tooling); the package
  works end-to-end without them via the two implemented agents
- `@gestalt/agents-deploy` — pr-agent + pipeline-agent + promotion-agent
  + deploy orchestrator implemented. Two `PipelineAdapter` impls live
  (`GitHubActions`, `NoOp`); Azure DevOps / GitLab CI / Jenkins
  adapters intentionally not implemented (one concrete adapter was the
  ADR-033 scope)
- `@gestalt/agents-maintenance` — all four agents (drift, alignment,
  gc, evaluation) + node-cron scheduler + three `MonitoringAdapter`
  impls (`Prometheus`, `Datadog`, `NoOp`) implemented and exercised
  live via `POST /maintenance/trigger`. Prometheus / Datadog
  implementations not yet verified against a real monitoring instance

**What is not yet built:**
- `@gestalt/adapter-oracle` — stub (every repository method throws;
  exists only to surface interface drift at build time)
- `@gestalt/adapter-mssql` — same shape as oracle
- `@gestalt/registry` — types and client only (no server, no UI)

**Postgres adapter repository coverage (all real, no remaining stubs):**
- `intents`     — full CRUD + list with paging + `saveClarification`
  (writes operator clarification text to the nullable column added
  in migration 006; orchestrator reads it on every dispatch so it
  survives gate-retry legs)
- `executions`  — create, updateStatus, findByCorrelationId, findActive
- `artifacts`   — save, findByCorrelationId (typed filter), findById
- `signals`     — save, findByCorrelationId, findUnresolved, markResolved
  (with GOLDEN_PRINCIPLE_BREACH human-only guard)
- `audit`       — append-only, query with filters
- `users`       — upsert, findById, findByIdpSubject, list, count
- `localAuth`   — create, findByEmail
- `projects`    — create, findById, findByName, list, saveCredential,
  getCredential (token stored plain — TODO: encrypt at rest)
- `deploymentEvents` — append, findByCorrelationId, findStagingPromotion,
  gcOlderThan. UPDATE is still revoked; DELETE was REVOKED in migration
  004 then GRANTed back in migration 005 once it was clarified that
  deployment_events are operational logs (not audit records) and
  gc-agent needs to prune them. ADR-034 enforcement runs through
  `findStagingPromotion`. `metadata` JSONB read path uses the shared
  `parseJsonb<Record<string, unknown>>(row.metadata, {})` in
  `../utils` so the `pr-opened` event's `branch` key (used by the
  Deployments view's branch chip) round-trips regardless of whether
  postgres.js returns the column as an object or a string
- `maintenanceRuns` — create (status=running), complete (final counts +
  findings JSONB + duration), list (filter by projectId / agentRole).
  Findings are JSONB-array-typed; the PG impl uses an explicit
  `::jsonb` cast on insert/update (without it postgres' implicit
  text→jsonb cast wraps the whole array as a JSON string scalar) and
  the shared `parseJsonb<MaintenanceFinding[]>(row.findings, [])` in
  `../utils` normalises the read path against postgres.js returning
  either a parsed array or a raw JSON string
- `alerts` — create, findById, findUnacknowledged, findByCorrelationId,
  acknowledge. `intent_id` lives in `context` JSONB (schema 001
  predates the FK); the shared
  `parseJsonb<Record<string, unknown>>(row.context, {})` in
  `../utils` normalises postgres.js's parsed-object vs
  raw-JSON-string return shapes. `intentId` lifted out of context
  into the read-side record for ergonomics
- `executionLogs` — save (1:1 per agent_executions row), findByExecutionId,
  findByCorrelationId. Migration 007. Foreign key cascades on delete
  matches the BullMQ removeOnComplete contract. The
  AgentExecutionRepository also gained `findById(id)` so the
  `/executions/:id/log` endpoint can fetch the join row

**CLI install:**
- `@gestalt/cli` is private — not on npm
- Install: `pnpm --filter @gestalt/cli build && cd packages/cli && npm link`

**First-boot sequence:**
1. `docker-compose up -d` — start platform
2. `gestalt init-admin` — create admin user (TTY only, once per server)
3. `gestalt login` — authenticate CLI
4. `mkdir my-project && cd my-project`
5. `git init && git remote add origin <url>`
6. `gestalt init` — register project + server pushes harness to Git
7. `git pull` — receive harness files locally
8. `gestalt run "<intent>"` — submit work to agents

**Pending enhancements (design in chat first):**
- **`GET /alerts` has no `projectId` filter.** The dashboard's
  Alerts view filters client-side by joining each alert's
  `context.intentId` against the current project's intent list,
  which costs an extra `/intents?projectId=…` call per refresh.
  A server-side query parameter that joins the alerts table to
  intents (or to a `project_id` column added directly on
  `alerts`) would let the API return the filtered set in one
  call and let the Layout's badge count match the visible list
  without extra plumbing
- **POST /interventions still a 501 stub.** The clarification flow
  bypasses it (uses `POST /intents/:id/clarify` directly because
  that endpoint owns the resume side effect). When breach
  acknowledgement / promotion approval get UIs they'll need a
  real implementation here
- **Return-URL preservation across login.** Pasting `/app/intents/<id>`
  in a fresh tab today bounces to `/app/login` and after sign-in
  lands on `/app/` (the intent ID is dropped). Small SPA-only change —
  `useLocation()` + `?from=` query param in the `RequireAuth` Navigate
  and the Login view's post-success `navigate(...)`. ~10 minutes
- **Vite dev-server proxy `/api` entry is dead.** The proxy in
  `packages/dashboard/vite.config.ts` forwards `/api → localhost:3000`
  but the server has no routes under `/api`. Pre-existing dead
  config; remove on the next dashboard-config touch
- **Encrypt Git PATs at rest.** `project_git_credentials.token` is plain
  text. Documented TODO in `repositories/projects.ts`. Pick a key-management
  approach before any shared/production use
- **LLM model name validation.** `loadConfig` accepts any non-empty string
  for `LLM_MODEL`. Worth adding a startup-time ping or clear error path
- Non-interactive mode for `gestalt init-admin` (--email/--password flags)
  for scripted use — current implementation is TTY-only
- **Retry cycle full re-runs all generate agents** even though only the
  routed agents need fresh work (code-agent typically). Cheaper retries
  would skip intent/design/context when their prior artifacts are
  present in the Git tip. For now: ~50-60s per retry cycle. Tracked as
  an optimisation, not a correctness gap
- **Read `qualityGate.maxRetries` from the project's HARNESS.json** —
  currently hardcoded to 3 in both the gate and generate orchestrators
- **Other PipelineAdapter implementations** (Azure DevOps, GitLab CI,
  Jenkins). The interface is in place; only `GitHubActions` + `NoOp`
  are implemented today. `GitHubActions` is verified end-to-end (see
  `67e5ee02` cycle in the session log); the others are typed stubs in
  the `PipelineAdapterType` union but have no implementation
- **`set-adapter` only switches `pipeline.adapter` today.** The
  `POST /projects/:id/config` body shape is generic
  (`{ pipeline?: ... }`) — adding monitoring (`maintenance.monitoring.adapter`)
  and `qualityGate.maxRetries` follows the same whitelist + clone-edit-
  commit pattern but is not implemented yet
- **Promotion workflow dispatches against a hardcoded `'main'` ref.**
  `GitHubActionsAdapter.promoteToEnvironment` always sends
  `{"ref":"main",...}` instead of the project's `defaultBranch`.
  Projects on `master`/`trunk`/etc. will see the promotion workflow
  fail to dispatch. Thread `project.defaultBranch` through the
  promotion-agent → adapter call to fix
- **No proactive PAT-scope validation at registration / set-adapter
  time.** A PAT missing `workflow` scope only surfaces on the first
  pipeline dispatch (`GOLDEN_PRINCIPLE_BREACH` signal + intent
  `escalated`). A startup-time `GET /user` + `GET /repos/:o/:r` ping
  in `init-harness` / `set-adapter` would catch the misconfiguration
  before any intent cycle
- **Promotion strategy beyond auto.** Today both staging → production
  fires unconditionally on a passed pipeline. The `EnvironmentStrategy`
  type already supports `trigger: 'manual'` + `approvals: N`; wire that
  through promotion-agent once a human-approval UI exists
- **Real-tooling gate agents** (typecheck via `tsc`, lint via ESLint,
  tests via `vitest`). Each needs the project's deps installed in the
  cloned tree — likely a `pnpm install --frozen-lockfile` step before
  the agents run, with the install output cached
- **alignment-agent entity extractor is too loose.** Matches every
  `## Word` and `- **Word**` line in DOMAIN.md as an entity, including
  template headings like "Description" / "Status" — produces false
  positives like "entity 'description' has no module" intents. Tighten
  the regex to require capitalised-PascalCase + skip a known stop list
  (Description, Status, Notes, etc.)
- **Live Prometheus / Datadog adapters not yet exercised.** Built
  against the published REST API shapes; unit-tested smoke would
  require a monitoring system. NoOp adapter is the verified path
- **drift-agent additive note can churn DOMAIN.md** if the agent runs
  daily and the module keeps changing. Should de-dupe against existing
  notes (the current `includes(note)` check uses the exact day, so the
  next day's note appears as a new line — fine for low-volume
  projects, may need rolling-window dedupe for active ones)


---

## Recent session log entries (last 3 from SESSION_LOG.md)

### Session 2026-05-31 — Claude Code (richer ActiveAgents + Deployments + JSONB metadata fix)

Both views had everything they needed in the database already; this
session surfaces it. No new migrations, no new DB tables.

Changed:
- `packages/server/src/routes/status.ts` — `GET /status/agents`
  enriched per-row with `intentText`, `cycleProgress` (completed
  vs total executions in the cycle), and `tokensSoFar` (running
  total across the cycle's executions). De-dupes per-correlation
  lookups via two `Map`s so a six-agent cycle triggers two
  queries, not twelve
- `packages/server/src/routes/deployments.ts` (new) — new
  `GET /deployments?projectId=<id>&limit=20`,
  `requireRole('viewer')`. Returns `DeploymentSummary[]`:
  intentId / correlationId / intentText / status / events
  (ASC by createdAt) / prUrl / prNumber / branch / runId /
  deploymentUrl / startedAt / completedAt. Fetches the three
  deploy-related status buckets (`deploying`, `deployed`,
  `failed`) in parallel via `intents.list` (the repo only
  takes one status at a time), merges, sorts newest-first,
  caps to `limit`. Per-intent `deploymentEvents.findByCorrelationId`,
  drops cycles with no events (gate-failed intents that never
  reached pr-agent). Branch lifted from the `pr-opened`
  event's `metadata['branch']`; `prUrl` / `prNumber` from
  `pr-opened`; `runId` from `pipeline-passed` (fallback to
  triggered / failed); `deploymentUrl` from production
  promotion (fallback to staging)
- `packages/server/src/app.ts` — registers the new route
- `packages/adapters/postgres/src/repositories/deployment-events.ts`
  — new `parseMetadata` helper. postgres.js returns the JSONB
  `metadata` column as either an object OR a JSON-encoded
  string depending on how the row was written and what type
  adapters are registered. Same trap as the alerts repo
  (`parseContext`) and maintenance-runs repo
  (`parseFindings`). Without it, the `branch` extraction in
  `/deployments` returned null for every cycle because
  `metadata['branch']` against a string is `undefined`. The
  helper short-circuits on object / null / undefined, then
  defensively `JSON.parse`s strings and falls back to `{}` on
  any failure. Mirrors the pattern in the other two repos
- `packages/dashboard/src/types.ts`:
  - `AgentExecutionSummary` gained optional `intentText`,
    `cycleProgress`, `tokensSoFar`. Optional so the
    IntentDetail timeline (which doesn't need them) is
    unchanged
  - new `DeploymentEvent`, `DeploymentEventType`,
    `DeploymentSummary` types
  - kept the old Phase-2-aspirational `DeploymentStatus` /
    `PendingPromotion` / `PromotionHistoryItem` types since
    `IntentDetail.deploymentStatus` still references them.
    Marked with a comment for the next cleanup pass
- `packages/dashboard/src/api/client.ts` — new
  `listDeployments({ projectId, limit? })` method
- `packages/dashboard/src/views/ActiveAgents.tsx` — rewrote
  the card:
  - Header row: agent role + elapsed time (top-right,
    `1s` / `1m 23s` formatter)
  - Intent text line: 55-char truncation, muted monospace,
    quoted, omitted if `intentText` is null
  - Progress row: segmented bar (one `var(--green)` block
    per completed step, muted bordered block for each
    remaining step), `step N of M` label, token count
    `2,847 tokens` formatted with `toLocaleString()`
  - Progress row omitted entirely when `cycleProgress.total
    === 0`
  - Auto-refresh 5 s + SSE refresh kept
- `packages/dashboard/src/views/Deployments.tsx` — rewrote:
  - Three sections: In progress / Deployed / Failed (each
    only rendered when non-empty, except Deployed which
    always renders with empty-state hint)
  - Each row: top row with status badge + branch tag (small
    monospace chip) + timestamp; intent text (65-char
    truncation); 4-node pipeline timeline; footer links
  - Timeline node states: filled (green ●), in-progress
    (blue ◎ with pulse animation), failed (red ✗), empty
    (muted ○). `classifyNode` maps node index → event type;
    Pipeline node has the most failure modes (failed
    overrides passed overrides triggered)
  - Connectors between nodes turn green when both ends are
    filled; otherwise muted
  - HH:MM time under each filled node from the event's
    `createdAt`
  - `[↗ View PR #N]` link uses `prUrl` + `prNumber` (the PR
    number appears only when known). `[↗ View deployment]`
    link uses `deploymentUrl`. Both
    `target="_blank" rel="noopener noreferrer"`

Verified live against `trackeros`:
- `pnpm -r build` clean across all 12 packages
- Server image rebuilt
- `GET /deployments?projectId=...&limit=20` returned 9 deployments,
  every one with a real `branch` value (e.g.
  `gestalt/9c28d399-add-a-titlecase-utility-under`), a real
  `prUrl` (NoOp adapter produces `noop://pr/<projectId>/<n>`),
  a real `runId` (`noop-run-9c28d399-<ts>`), and 5 events per
  cycle in the right order (`pr-opened`,
  `pipeline-triggered`, `pipeline-passed`, `promoted-staging`,
  `promoted-production`). Pre-`parseMetadata`-fix the same
  call returned `"branch":null` for every row
- **Browser drive (headless Chrome):**
  - `/app/deployments`: subtitle reads
    "9 total · 0 in progress · 9 deployed"; each card shows
    the deployed badge, the branch chip, the timestamp, the
    truncated intent, and the four-node pipeline (`PR ●
    PIPELINE ● STAGING ● PRODUCTION ●`) with the green
    connectors between every filled node, status labels
    underneath (opened / passed / promoted / deployed), and
    `08:20 PM` timestamps. Both `View PR #N` and
    `View deployment` buttons render. Screenshot captured
  - `/app/agents` first navigation: idle ("No agents
    running · platform is idle"). Submitted a fresh intent
    via the in-page API client, refreshed → "1 running"
    with the intent-agent card showing `1s` elapsed, the
    intent text quoted and truncated, and `step 0 of 1`
    (the cycle was on its first agent at the moment of the
    query). Two pulsing dots in the DOM (the agent ◎ and
    the connection pill). Screenshot captured

Decisions made:
- **De-dupe per-correlation lookups in `/status/agents`** via
  two Maps. A cycle with six concurrent agents would
  otherwise fire twelve queries (one `intents.findByCorrelationId`
  and one `executions.findByCorrelationId` per row). With
  the cache it's two queries per unique correlationId
- **Drop cycles with no events** in `/deployments` rather
  than rendering empty cards. A gate-failed intent that
  never reached pr-agent has no deployment_events but its
  status is `failed` — the dashboard's Deployments view
  should not show it. Gate failures live in QualityGate
- **`metadata.branch` extracted server-side**, not in the
  dashboard. The route owns the JSONB parse (via
  `parseMetadata` in the repo) so the dashboard receives a
  flat `branch: string | null` and doesn't have to do
  another JSON parse client-side. Keeps the dashboard
  decoupled from the JSONB shape
- **Pipeline node has its own state machine.** The other
  three nodes are a single event type → filled. Pipeline
  has three possible events (`pipeline-triggered`,
  `pipeline-passed`, `pipeline-failed`) with priority:
  `failed` wins, then `passed`, then `triggered` (which
  maps to in-progress). Captured in `classifyNode`'s
  index === 1 branch
- **Old `DeploymentStatus` types kept** for
  back-compat with `IntentDetail.deploymentStatus`. That
  field on `IntentDetail` was never populated by any
  current API path; removing the types would require
  touching `IntentDetail.tsx` too. Out of scope. Marked
  with a "delete when IntentDetail stops referencing it"
  comment so the next cleanup pass picks it up

Build status: `pnpm -r build` clean. Server image rebuilt;
both views render with real deployment_events + active
executions data. The JSONB-metadata-as-string bug is fixed
on the same pattern as the prior alerts + maintenance-runs
fixes.

No new follow-ups. The old `DeploymentStatus` /
`PromotionHistoryItem` types are flagged in a code comment
rather than the Pending enhancements list — they're
mechanical cleanup that doesn't need design conversation.

---

### Session 2026-05-31 — Claude Code (consolidated postgres JSONB parser into shared parseJsonb)

Refactor only. Pre-fix: three repo-local helpers (`parseContext`
in alerts, `parseFindings` in maintenance-runs, `parseMetadata` in
deployment-events) all solved the same problem — postgres.js can
return JSONB as either a parsed JS value or a raw JSON-encoded
string, and the read path has to defend against both. Every time
a new JSONB column landed on the schema (latest: deployment_events
`metadata` in the prior session) the same fix had to be copy-
pasted, and the JSON-shape-rejection logic (object vs array) drifted
slightly between the three.

Changed:
- `packages/adapters/postgres/src/utils.ts` (new): shared
  `parseJsonb<T>(value: unknown, fallback: T): T`. Returns the
  fallback on null/undefined input, on non-string non-object
  input, on a `JSON.parse` failure, and on a parsed value whose
  shape doesn't match the fallback's. Shape is inferred from
  `fallback`: array fallback → only accept arrays (preserves the
  prior `parseFindings` "non-array → []" rule); non-null object
  fallback → accept any non-null object including arrays
  (preserves `parseContext` / `parseMetadata`). Signature note
  in the JSDoc — the user's brief sketched
  `parseJsonb<T>(value): T`, but a single-arg version can't
  carry shape information to runtime, so `fallback: T` was
  added; the three call sites are still one line each
- `packages/adapters/postgres/src/repositories/alerts.ts`:
  removed local `parseContext` helper. `rowToRecord` now calls
  `parseJsonb<Record<string, unknown>>(row.context, {})`. Same
  result on every input the prior helper handled
- `packages/adapters/postgres/src/repositories/deployment-events.ts`:
  removed local `parseMetadata` helper. `rowToRecord` now calls
  `parseJsonb<Record<string, unknown>>(row.metadata, {})`. The
  Deployments view's branch chip (extracted from
  `pr-opened.metadata['branch']`) continues to work
- `packages/adapters/postgres/src/repositories/maintenance-runs.ts`:
  removed local `parseFindings` helper. `rowToRecord` now calls
  `parseJsonb<MaintenanceFinding[]>(row.findings, [])`. The
  array fallback tells the helper to reject non-array parsed
  values, preserving the legacy `Array.isArray(parsed) ? parsed
  : []` rule

Verified live (refactor must preserve every read path):
- `pnpm -r build` clean across all 12 packages; `tsc` happy
  with the new generic
- Server image rebuilt
- `GET /deployments?projectId=…&limit=2` returned both
  recent cycles with `branch` populated as real strings
  (`'gestalt/45b71ffc-add-a-humanreadable-bytes-formatter'`,
  `'gestalt/9c28d399-add-a-titlecase-utility-under'`). Pre-
  refactor and pre-fix: this was `null`. Post-refactor: still
  populated correctly
- `GET /maintenance/runs?limit=4` returned 4 runs with
  `findings` rendered as real JS arrays (length 0 for the
  recent evaluation-agent / drift-agent runs that had no
  findings to record). Pre-refactor: also worked. Confirmed
  the array-shape rejection path still functions
- `GET /alerts/<acknowledged-id>` (direct fetch on a
  previously-acknowledged clarification alert) returned
  `context` as a real object with the original `intentId` +
  `suggestions[3]` keys intact. Pre-refactor: also worked.
  Confirmed the object-shape acceptance path still functions

Decisions made:
- **`parseJsonb<T>(value, fallback)`, not the brief's
  single-arg `parseJsonb<T>(value)`.** The brief said "no
  behaviour change". A single-arg generic helper can't preserve
  the per-repo shape-rejection logic — `parseFindings` rejected
  non-array parsed JSON (returned `[]`); `parseContext` and
  `parseMetadata` rejected non-object parsed JSON (returned
  `{}`). Without runtime shape information the helper can't
  pick the right rejection rule. Adding `fallback: T` carries
  the shape implicitly (via `Array.isArray(fallback)`) AND
  gives the caller a typed, non-null return value. JSDoc on
  the helper documents the deviation
- **Object fallback accepts arrays.** Mirrors the previous
  `parseContext` behaviour exactly — `typeof === 'object' &&
  !== null` is true for arrays. If a caller passes `{}` as
  fallback and the column holds an array, they get the array
  back as a cast. None of the three current callers exercise
  this path, but documenting it now prevents the next JSONB
  column from being surprised
- **Did NOT introduce a generic `parsedShapeMatches(T)` type
  guard.** Could have built a richer signature with a
  user-supplied predicate; over-engineered for three call
  sites that all want either "is array" or "is non-null
  object". The `matchesShape(value, fallback)` two-line
  helper does exactly what's needed and is readable at the
  glance the next reviewer will give it

Build status: `pnpm -r build` clean. No behaviour change at
any of the three read paths.

No follow-ups. The shared helper is the canonical answer for
the next JSONB column; the per-row `::jsonb` cast on the WRITE
path remains the matching write-side defence (see the
maintenance-runs and alerts repos).

---

### Session 2026-05-31 — Claude Code (Maintenance view: Recent Runs populated + Run now error UX)

Two adjacent dashboard bugs in the Maintenance view, both rooted
in a single response-envelope mismatch and a small UX gap.

Investigation (the brief asked for it explicitly):
- `GET /maintenance/runs` returned `{ data: MaintenanceRunRecord[] }`
  on the server (matching every other route's envelope), but the
  dashboard's `DashboardApiClient.listMaintenanceRuns` was typed
  as `Promise<{ runs, total }>`. The view read `res.runs ?? []`
  which was permanently `undefined → []`. Recent runs section
  was always empty — not because runs didn't exist (they did:
  8 cron-driven evaluation-agent rows, 1 prior manually-
  triggered drift-agent) but because the dashboard's parse was
  for a phantom key
- The "Run now" button itself worked — server returned 200 with
  the completed `MaintenanceRunRecord` synchronously (the
  runner is in-process, not BullMQ). The actual gap was that
  `handleTrigger` used `try/finally` without `try/catch`, so
  any rejection from the API call would surface as an
  unhandled promise rejection from an event handler and the
  operator would see nothing
- The SSE subscription to `maintenance.run-completed` and the
  post-trigger `setTimeout(load)` were both already wired in
  the prior implementation. The brief asked to drop the delay
  from 2 s to 1 s

Changed:
- `packages/dashboard/src/api/client.ts`:
  - `listMaintenanceRuns` return type fixed to
    `{ data: MaintenanceRunSummary[] }` — matches the actual
    server envelope. JSDoc explains the prior bug so the next
    edit doesn't regress
  - `triggerMaintenanceAgent` return type fixed to
    `{ data: MaintenanceRunSummary }` — the server returns the
    completed run record. Comment notes the runner is
    in-process so the row exists by the time the response lands
- `packages/dashboard/src/views/Maintenance.tsx`:
  - `load` reads `res.data ?? []` instead of `res.runs ?? []`
  - new `triggerErrors: Record<string, string>` state, keyed by
    agentRole (so an in-flight retry on one agent doesn't blow
    away another agent's lingering error)
  - `handleTrigger` rewrapped as `try/catch/finally`. On
    catch: sets the error, schedules a 5 s auto-clear with a
    guard that doesn't clobber a newer error from a retry. On
    success: 1 s delayed `load()` (brief's value) — covers the
    SSE event path with a backstop and shaves a second off
    the prior 2 s
  - red `✗ Failed to trigger: <message>` strip renders under the
    agent card when `triggerErrors[agent]` is populated. Styled
    with `var(--red)` on a translucent red background using
    existing CSS variables only
  - empty-state hint updated: "Agents run on their configured
    schedule or via 'run now' above"

Verified live against `trackeros`:
- `pnpm --filter @gestalt/dashboard build` clean; full
  workspace build clean
- Server image rebuilt
- **Database state before fix:** 8 maintenance_runs rows
  (7 cron-scheduled evaluation-agent runs with
  `project_id = NULL`; 1 prior manually-triggered drift-agent
  with the project's id). With strict project filter only
  the 1 project-scoped row qualifies
- **API smoke:**
  - `GET /maintenance/runs?projectId=<id>&limit=3` returned
    `{ data: [drift-agent record] }` — confirms the server
    envelope (not `{ runs: [...] }`)
  - `POST /maintenance/trigger` with valid body returned 200 +
    the completed MaintenanceRunRecord (status='completed',
    duration ~1 s, project_id populated)
  - `POST /maintenance/trigger` with missing projectId
    returned 400 with `{"error":"projectId is required"}` —
    the dashboard's catch block will surface this verbatim
- **Browser drive (headless Chrome):**
  - `/app/maintenance` renders the four "Scheduled agents"
    cards each with a `run now` button. Recent runs section
    initially shows 4 rows (3 prior drift-agent triggers + 1
    alignment-agent with "6 intents queued" tag) — the empty
    state is GONE
  - Clicked `run now` on the drift-agent card → button text
    transitioned to `triggering...` → re-enabled after ~1 s →
    a fresh drift-agent row appeared in Recent runs at
    10:23:29 PM (the new row joined the list, total now 4
    visible)
  - Screenshot captured. The "Scheduled agents" section shows
    drift-agent mid-trigger (`triggering...` button still
    rendered when the screenshot fired). The 4 recent-runs
    rows all show green ● dots, agent role, optional intent-
    queued tag, and HH:MM timestamp
  - `docker-compose logs server | grep -iE "(maintenance|trigger).*error|error.*(maintenance|trigger)"`
    returned no matches — the trigger fired cleanly with no
    server-side warnings or errors

Decisions made:
- **`listMaintenanceRuns` aligned to `{ data: ... }` (server's
  convention), not the server changed to `{ runs, total }`.**
  Every other route in the server uses `{ data: ... }` (intents
  list, projects list, alerts list, deployments, executions).
  Aligning the one outlier to the convention was clearly
  cheaper than introducing a divergence
- **Strict project filter, no inclusion of `project_id IS NULL`
  cron rows.** The brief says "show runs from the currently
  selected project". Cron-scheduled evaluation runs have NULL
  project_id by design (they're global, not per-project), and
  including them would clutter the per-project view with rows
  the operator didn't trigger and that don't pertain to their
  specific project. The dashboard surface is the operator's
  per-project lens; the global cron history is observable via
  the existing `GET /maintenance/runs` without a projectId
  filter (CLI / curl / dashboard-future-feature). Logged a
  follow-up so the next iteration of the Maintenance view
  could surface a "show all" toggle if operators ask for it
- **1 s reload after trigger** (brief's value), with the SSE
  event as a backstop. The runner is in-process so the row
  exists immediately when the HTTP response lands; the
  `setTimeout` is a defensive belt against the SSE bus being
  briefly slow. Could be dropped to 0 in principle — kept as a
  small margin
- **Per-agent error map**, not a single error string. If the
  operator clicks `run now` on two agents in quick succession
  and the first fails, then the second succeeds, a single
  error string would either show stale data after the second
  call or get cleared by the success — both bad. Keyed by
  agentRole, each row owns its own visibility
- **Auto-clear guard: don't overwrite a newer error.** The
  5 s `setTimeout` reads the error message at schedule time
  and only clears if the current state still matches. A
  retry-during-clear cycle keeps the newer message visible
  for its own 5 s window
- **No change to the server route or repo query.** The
  permissive `WHERE TRUE / AND project_id = ...` SQL in
  `maintenance-runs.ts` is already correct; the only bug was
  the dashboard's response-envelope mistype. Repo + route
  untouched

Build status: `pnpm -r build` clean. Server image rebuilt;
Maintenance view fully functional end-to-end against real
data on `trackeros`. Bug 1 (trigger button + error UX), Bug 2
(Recent runs always empty), Bug 3 (post-trigger refresh
timing) all resolved.

Follow-up logged:
- A "show all" / "scope: this project" toggle in the
  Maintenance view would let operators see the global
  cron-scheduled evaluation-agent rows alongside their
  per-project runs. Today the per-project filter strictly
  excludes `project_id IS NULL` runs (which is the right
  default per the brief); the global view is reachable only
  via `GET /maintenance/runs` without a projectId arg, which
  the dashboard doesn't currently call

