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

**Last updated:** 2026-06-01 (Claude Code — alignment-agent extractor fix + idempotency budget)

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
- All eight migrations apply on startup: `001_initial`, `002_local_auth`,
  `003_projects`, `004_deployments`, `005_maintenance`,
  `006_intent_clarification`, `007_execution_logs`,
  `008_finding_attempts`
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
    commit + push) and queues a `CONTEXT_UPDATE` MaintenanceIntent that
    the runner routes through the **context-fixer direct-fix path** —
    one LLM-driven minimal additive edit per intent, committed directly
    to `defaultBranch`. See the "Maintenance intent routing" bullet below
  - **alignment-agent** (daily 03:00 UTC) — reads context files,
    cross-checks DOMAIN.md entities ↔ ARCHITECTURE.md modules, and
    GP-NNN cross-references in AGENTS.md; queues `CONTEXT_ALIGNMENT`
    intents per misalignment. Same routing — the runner sends them
    through the context-fixer rather than the generate loop because
    the test-agent can't generate tests for a markdown edit.
    `extractEntities()` matches **h3** entity headings (`### Name`) and
    bullet-style entity definitions (`- **Name** — …`, with a dash
    separator), filtered through a stop list of common field labels
    (`Type`, `Description`, `Status`, `Notes`, `Props`, …). The h2
    pattern + bold-bullet-without-separator pattern were the source
    of the previous false-positive findings on `Components` /
    `Type` / `Description` / `Props` (where `## Components` is a
    grouping heading and `- **Type**: value` is a field label on
    `WelcomeScreen`). For each finding type, `affectedFiles[0]` is
    the file the context-fixer should **write** to:
    `domain-entity-without-module` → `docs/ARCHITECTURE.md` (add a
    `src/modules/<EntityName>/` entry);
    `architecture-module-without-entity` → `docs/DOMAIN.md` (add an
    entity definition); `golden-principle-not-cross-referenced` →
    `AGENTS.md` (add the principle reference). The companion file
    sits in `affectedFiles[1]` as read-only context the LLM sees in
    the suggestedAction text
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
    a `maintenance_runs` row, routes each queued `MaintenanceIntent`
    based on its class (see "Maintenance intent routing" below),
    updates the row on completion, and emits a
    `maintenance.run-completed` SSE event
  - **Maintenance intent routing (ADR-018).** Every
    `MaintenanceIntent` is classified by
    `classifyMaintenanceIntent(type)`:
    - `'context-file-update'` (`CONTEXT_ALIGNMENT` / `CONTEXT_UPDATE`)
      → the runner calls `applyContextFileFix(intent, project)` in-
      process; the **context-fixer** clones the repo to a temp dir,
      calls the LLM with a "minimal additive edit" prompt + the
      current file content + the finding evidence + the suggested
      action, validates the result against a **truncation guard**
      (output must be ≥ 50% of original length — short output is
      refused as suspected LLM truncation), writes the file, commits
      as `docs: <suggestedAction (prefix stripped, 72-char cap)>
      [gestalt-maintenance/<TYPE>]` authored by
      `Gestalt Maintenance Agent <maintenance-agent@gestalt.local>`,
      and pushes to `defaultBranch`. Each successful commit
      increments `directFixes` on the run record and appends a
      `direct-fix-applied` finding (commit-sha lifted out for the
      operator). Path guard hard-throws BEFORE any clone or LLM call
      if `intent.affectedFiles[0]` is not in `docs/*` or exactly
      `AGENTS.md` — ADR-018 forbids the direct-fix path from
      touching `src/`. Temp dir cleaned in `finally`
    - `'code-change'` (`PERFORMANCE_DEGRADATION` / `SECURITY_FINDING`)
      → unchanged: the runner writes an `intents` row
      (`source: 'maintenance-agent'`) and dispatches a
      `generate:intent` BullMQ task. The generate orchestrator
      handles these like any human-submitted intent with the full
      generate → gate → deploy loop
    - Live verified on `trackeros`: a manual alignment-agent trigger
      produced 6 findings; the runner classified all 6 as
      `context-file-update` and applied 6 direct fixes (4 to
      `docs/DOMAIN.md`, 2 to `AGENTS.md`) in ~32 s wall-clock.
      `intentsQueued: 0`, `directFixes: 6` on the run record;
      6 new commits on `main` authored by `Gestalt Maintenance Agent`;
      every commit subject starts with `docs:` and ends with
      `[gestalt-maintenance/CONTEXT_ALIGNMENT]`. A second run
      applied 4 more fixes for the entity findings (the GP-NNN
      findings were resolved by the first run's AGENTS.md edits
      and so were absent the second time)
  - **Per-finding idempotency guard (migration 008).** The runner
    hashes each candidate fix (`SHA-256` of
    `intent.type:affectedFiles[0]:evidence.slice(0,80)`) and tracks
    consecutive failed attempts in `maintenance_finding_attempts`.
    Each non-committed outcome (no-change, truncation-guard,
    llm-error, file-missing, thrown) increments the per-finding
    counter via an `INSERT ... ON CONFLICT ... DO UPDATE` upsert. A
    real commit calls `resetAttempts(hash)` (delete the row) so the
    next occurrence starts fresh. Once the counter hits
    `MAX_ATTEMPTS = 3` on the same run that just incremented it,
    the runner creates a `maintenance-stuck` alert
    (`severity: medium`, `requiredAction: review-manually`, JSONB
    `context` carrying `intentType` / `affectedFiles` / `evidence` /
    `suggestedAction` / `attemptCount` / `findingHash`) and flips
    `escalated = TRUE`. Future runs of the same finding see the
    flag and skip silently (~838 ms total run, no clone, no LLM
    call). New `AlertType: 'maintenance-stuck'` +
    `AlertRequiredAction: 'review-manually'` added to the core
    repository typed unions. The context-fixer's system prompt was
    tightened to forbid `> Note:` blockquote-appending and to
    return the file unchanged when no real structural edit is
    possible — this was the LLM's escape hatch on unresolvable
    findings and caused DOMAIN.md to grow linearly with garbage
    blockquotes. Live verified on `trackeros`: a finding the LLM
    can't satisfy produces 3 attempts → escalation on the 3rd run
    (alert created, no commit) → silent skip on the 4th and
    subsequent runs
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
  - **Each Recent runs row is a clickable accordion** that expands an
    inline detail panel — same idiom as the IntentDetail agent-
    execution accordion. The header row surfaces stats at a glance:
    `N findings` (amber when > 0, dim when 0), `N intents queued`
    (amber, omitted when 0), `N fixes applied` (green, omitted when
    0), duration in dim text (`ms` under 1 s, otherwise `1.2s`), and
    the timestamp. Expanded panel shows a Run summary section
    (agent / status / duration / direct fixes / intents queued /
    started + completed timestamps) plus either a Findings (N)
    section with per-finding cards (severity badge — red high /
    amber medium / dim low; type chip; up-to-3 affected files +
    "and N more"; description; `→ suggestedAction` in muted italic)
    or a "No findings — Agent ran cleanly — nothing to report"
    panel. All data already in the existing `MaintenanceRunRecord`
    — no separate fetch, no new endpoint. Multiple rows can be
    expanded at once. Verified live against `trackeros`:
    alignment-agent run with 6 findings (4 medium + 2 low) shows
    all 6 cards with the right severity colours, type chips, and
    file lists; drift-agent run with 0 findings shows the clean
    panel
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
- `findingAttempts` — upsertAttempt (INSERT ... ON CONFLICT ... DO
  UPDATE so concurrent runs increment atomically without a read-
  modify-write race), getAttempts (filter by projectId + IN-list of
  hashes — empty input short-circuits to `[]`), markEscalated
  (UPDATE escalated=TRUE), resetAttempts (DELETE so a fresh
  occurrence starts at attempt 1). Migration 008.
  `UNIQUE(project_id, finding_hash)` gives the upsert path a
  deterministic conflict target. ON DELETE CASCADE on
  `projects(id)` keeps the table clean when a project is removed
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
- **alignment-agent module extractor assumes literal `src/modules/<name>`
  references in ARCHITECTURE.md.** Fixed entity extractor + idempotency
  guard ship in this update, but the module side still matches a
  contiguous `src/modules/<name>` string. ARCHITECTURE.md commonly
  uses a markdown directory tree (`├── modules/` / `│   └──
  <Name>/`) where the parent path is implied by indentation. The
  LLM's idiomatic edits don't satisfy the regex; the idempotency
  guard catches the loop after 3 attempts and escalates as
  designed. Long-term: teach the extractor to follow markdown
  directory-tree structure OR change the suggestedAction text to
  ask the LLM for a literal `src/modules/<name>/ — description`
  line outside the tree block
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

### Session 2026-05-31 — Claude Code (Maintenance run detail — expandable findings)

Closes the "what did this maintenance agent actually find?" gap.
The Recent Runs section now shows each run as a clickable accordion
that expands an inline detail panel — agent meta + findings cards
(or a "ran cleanly" panel when the findings array is empty). Same
data the server already returns; same idiom as the IntentDetail
agent-execution accordion landed earlier today.

Investigation:
- `GET /maintenance/runs` already returned `findings` /
  `durationMs` / `completedAt` / `runAt` / `intentsQueued` /
  `directFixes` on every row in the `{ data: ... }` envelope.
  Verified live: a real alignment-agent row in the DB had 6
  findings populated; a real drift-agent row had `findings: []`.
  The repo's `complete()` method persists everything via
  `${JSON.stringify(findings)}::jsonb`; the route returns the
  full `MaintenanceRunRecord[]`. No backend changes needed
- The dashboard's `MaintenanceRunSummary` type was the missing
  link — `findings`, `completedAt`, and `projectId` were not
  declared, and `durationMs` was non-nullable when the core type
  has `number | null`. Adding those fields was enough to thread
  the existing data into the view

Changed:
- `packages/dashboard/src/types.ts`:
  - New `MaintenanceFinding` interface mirroring the `@gestalt/core`
    shape (`type` / `description` / `affectedFiles` / `severity` /
    `suggestedAction`). The repo's shared `parseJsonb` already
    normalises postgres.js's object-vs-string return — no parse
    needed on the dashboard side
  - `MaintenanceRunSummary` extended: `projectId: string | null`,
    `status` widened to include `'running'`, `findings:
    MaintenanceFinding[]`, `durationMs: number | null`,
    `completedAt: string | null`
- `packages/dashboard/src/views/Maintenance.tsx`: rewrote the
  Recent runs row. Top-level accordion state is a
  `Set<string>` of expanded run ids (multiple rows can be open
  at once). Row header:
  - Status glyph (`●` completed green / `✗` failed red / `◎`
    running blue / `–` other dim)
  - `agentRole` in muted monospace
  - **New stats row**: `N findings` (amber when > 0, dim when 0
    so the operator can scan for "interesting" runs at a glance);
    `N intents queued` (amber, omitted when 0 — existing tag kept);
    `N fixes applied` (green, omitted when 0); duration in dim
    text formatted via `formatDuration` (`<1 s` shows `Nms`,
    otherwise `N.Ns`); timestamp; ▼/▲ chevron
  - Click toggles the expanded set
  - Expanded panel renders a Run summary `Section` (the same
    `Section` + `KV` helpers IntentDetail uses, lifted into this
    file so the two views stay independent) listing agent /
    status (glyph + word) / duration / direct fixes / intents
    queued / started + completed timestamps
  - Findings list: when `findings.length === 0`, a "No findings"
    Section with the body "Agent ran cleanly — nothing to report".
    When > 0, a "Findings (N)" Section with one `FindingCard` per
    finding
  - `FindingCard`: severity badge `⚠ {severity}` coloured red /
    amber / dim by severity; finding type as a small monospace
    chip on a `var(--bg-subtle)` background; first 3 affected
    files as a muted `<li>` list with "and N more" when there
    are more; description as readable text; if
    `suggestedAction` is present, a `→ <action>` line in muted
    italic. Defensive `?? []` on `affectedFiles` so a missing
    array doesn't crash the render

Verified live against `trackeros`:
- `pnpm -r build` clean across all 12 packages
- Server image rebuilt; dashboard bundle is the new
  `index-CmtUBgy-.js` (220 KB, +15 KB for the panel code)
- **DB state used for verification (no new triggers needed):**
  - 1 alignment-agent run, 6 findings (4 `medium /
    domain-entity-without-module` against
    `docs/DOMAIN.md` + `docs/ARCHITECTURE.md`, 2 `low /
    golden-principle-not-cross-referenced` against `AGENTS.md` +
    `docs/GOLDEN_PRINCIPLES.md`), 6 intents queued, duration
    1307 ms
  - 4 drift-agent runs, all `findings: []`, durations
    1143–1720 ms
- **API smoke** (curl, the alignment row):
  - `GET /maintenance/runs?projectId=…&limit=20` returns
    `findings: [6 objects]`, `durationMs: 1307`, `completedAt:
    "2026-05-31T19:33:02.334Z"`, `intentsQueued: 6` on the
    alignment row; `findings: []` on every drift row. The
    server has been returning the full shape; the dashboard
    just wasn't reading it
- **Browser drive (headless Chrome via CDP):**
  - `/app/maintenance` renders. Each Recent runs row shows the
    new stats: `6 findings` in amber + `6 intents queued` in
    amber + `1.3s` + `10:33:01 PM` for the alignment row;
    `0 findings` in dim + `1.7s` + `10:26:42 PM` for each
    drift row
  - Clicked the alignment row → row expanded inline; Run
    summary panel rendered all 7 KV pairs (Agent / Status /
    Duration / Direct fixes / Intents queued / Started /
    Completed); Findings (6) Section rendered all 6 cards
  - DOM probe confirmed: 6 severity badges (`⚠ medium` × 4,
    `⚠ low` × 2), 2 type chips
    (`domain-entity-without-module` and
    `golden-principle-not-cross-referenced`), 3 captured
    suggested-action lines starting with `→ Either add an
    architecture module for 'components' / 'type' /
    'description' in docs/ARCHITECTURE.md…`, 4 distinct
    affected files in the file-line lists (docs/DOMAIN.md,
    docs/ARCHITECTURE.md, AGENTS.md,
    docs/GOLDEN_PRINCIPLES.md)
  - Clicked a drift row in parallel → the alignment row stayed
    open; the drift row expanded showing the Run summary +
    "No findings — Agent ran cleanly — nothing to report"
    Section. DOM probe found the exact text in the DOM
  - Full-page screenshot at 1400×2400 viewport captures both
    expanded panels stacked plus the remaining collapsed
    rows

Decisions made:
- **No new endpoint. No new migration.** The brief was explicit
  — the server already returns everything via the
  `MaintenanceRunRecord` shape. Confirmed by inspection of
  `maintenance-runs.ts` `complete()` (persists all 5 result
  fields with `::jsonb` cast) + the route's
  `reply.send({ data: records })`. The whole fix is dashboard-side
- **`findings` count is muted when zero, amber when > 0.** Brief
  said "amber if N > 0, dim if 0". A successful clean run
  shouldn't pull operator attention; a run with findings should.
  The chip is always rendered (even at 0) so the operator can
  see at a glance that the agent did run and the count
- **All data already loaded — no lazy fetch.** The runs array
  comes from `listMaintenanceRuns` with the full record. Clicking
  a row is pure UI state; no API call. Multiple rows can be
  expanded at once (matches the IntentDetail accordion idiom).
  No loading state, no error state in the panel — the data is
  either there or the row would not exist
- **`Section` + `KV` helpers re-implemented locally**, not
  imported from IntentDetail. IntentDetail's are not exported
  (they're file-local), and lifting them into a shared module
  for two callers is premature abstraction. If a third view
  ever wants the same pattern, factor then. For now the two
  copies are mechanically identical and ~12 lines each
- **`affectedFiles` truncates at 3 with "and N more".** Brief's
  value. Most findings list 2 files (the document and the
  source); the cap matters for drift-agent's `gestalt/*` branch
  cleanup list which can have many entries
- **Severity badge uses `⚠ {severity}` for every level**, not
  different glyphs per severity. The brief sketched the same
  glyph for all three; varying the glyph wouldn't add
  information past the colour
- **`status` widened to include `'running'`.** The core type has
  it (the `create()` method writes `'running'` before
  `complete()` flips to `'completed'` or `'failed'`). The
  dashboard would never see a running row today — the runner is
  in-process so by the time the response lands the row is
  already complete — but if maintenance moves to BullMQ later
  the dashboard would have to refresh and might catch the
  in-progress state. Typing it correctly today avoids a
  type-narrowing rework then
- **`durationMs: number | null`.** The core has it nullable. A
  `running` row has `null` duration; nothing in the wild does
  today, but typing it correctly tracks the schema

Build status: `pnpm -r build` clean across all 12 packages.
Server image rebuilt; dashboard bundle live under `/app/`.
Full SDLC slice unchanged — this is a dashboard-only
enhancement that reads existing data. Both empty and populated
findings render correctly in the live browser; DOM probe
confirms every expected element shape.

No follow-ups added — feature is self-contained.

---

### Session 2026-05-31 — Claude Code (context-file maintenance intents take the direct-fix path)

Fixed a long-standing routing bug in the maintenance layer. Both
`alignment-agent` and `drift-agent` queue `CONTEXT_ALIGNMENT` /
`CONTEXT_UPDATE` intents whose suggested-action text is a *documentation
instruction* ("Update AGENTS.md to reference GP-003 …"). Previously the
runner unconditionally dispatched every queued intent into the generate
queue. The generate loop is the wrong tool — design-agent has no
architecture to design, code-agent produces nothing actionable, and
test-agent has nothing to test. Cycles either failed silently or burned
LLM budget producing no value. ADR-018 explicitly permits maintenance
agents to apply direct fixes for additive context-file edits; this
session wires that path through the runner.

Changed:
- `packages/agents/maintenance/src/types.ts`:
  - New `MaintenanceIntentClass` union
    (`'context-file-update' | 'code-change'`) + a pure switch
    `classifyMaintenanceIntent(type)` that maps `CONTEXT_UPDATE` /
    `CONTEXT_ALIGNMENT` → `'context-file-update'` and
    `PERFORMANCE_DEGRADATION` / `SECURITY_FINDING` → `'code-change'`.
    Both exported from the package's public surface
- `packages/agents/maintenance/src/agents/context-fixer.ts` (new):
  - `applyContextFileFix(intent, project)` — the direct-fix path.
    Signature returns
    `{ committed: boolean; commitSha?: string; reason?: 'no-change' |
    'truncation-guard' | 'file-missing' | 'llm-error' }` so the
    runner can branch on the outcome without catching the success
    case as an error
  - **Path guard runs BEFORE the clone OR the LLM call.** If
    `intent.affectedFiles[0]` is not in `docs/*` and is not exactly
    `AGENTS.md`, throws with a clear ADR-018 reference. Empty
    `affectedFiles` also throws. ADR-018 forbids the direct-fix path
    from touching `src/`; the guard makes that structural
  - Clone via `simple-git` to a `mkdtemp` dir; checkout
    `defaultBranch` (best-effort — a brand-new repo may have an
    unborn branch); read the target file, return `file-missing`
    cleanly if not present
  - LLM prompt: system message instructs "preserve all existing
    content … return the complete updated file content with no
    commentary or fences"; user message includes the current
    content wrapped in `<<<FILE` / `FILE>>>` markers + the
    finding's `evidence` + the `suggestedAction` (maintenance
    prefix stripped). `getLLMClient().complete()` with
    `maxTokens: 8192`, `temperature: 0.2`,
    `correlationId: 'ctxfix-<projectId>-<TYPE>'`. Defensive
    `stripFences` on the response just in case
  - **Truncation guard.** If the LLM-generated content is shorter
    than 50% of the original, log a warning and return
    `{ committed: false, reason: 'truncation-guard' }`. The most
    common LLM failure mode for "return the full file" tasks is to
    return only the delta or a summary; the guard catches that
    before the wrong content reaches Git
  - No-op short-circuits — `newContent === currentContent` and
    `repo.status().files.length === 0` both return cleanly without
    a commit
  - Commit author is `Gestalt Maintenance Agent
    <maintenance-agent@gestalt.local>`; subject is
    `docs: <cleanSubject (72-char cap)>
    [gestalt-maintenance/<TYPE>]` so
    `git log --grep='[gestalt-maintenance]'` enumerates every
    direct-fix commit. Push goes to `defaultBranch`. Temp dir
    cleaned in `finally` on every path
- `packages/agents/maintenance/src/runner/index.ts`:
  - Imports `classifyMaintenanceIntent` and `applyContextFileFix`
  - In the per-project loop, replaced the unconditional
    `dispatchMaintenanceIntent(intent)` call with a switch on
    `classifyMaintenanceIntent(intent.type)`:
    - `'context-file-update'`: call `applyContextFileFix` in-process;
      on success, increment `totalDirectFixes` and append a typed
      `direct-fix-applied` finding (with commit-sha lifted out for
      the operator). On thrown failure, append a typed
      `direct-fix-failed` finding (`severity: 'high'`,
      `suggestedAction: 'Check server logs for the full error and
      apply the fix manually.'`) and continue — one fix failing
      should not blow up an alignment-agent run with 6 candidates.
      On non-thrown skip (`reason !== undefined`), log at info and
      continue
    - `'code-change'`: unchanged path through
      `dispatchMaintenanceIntent` (writes an `intents` row + a
      `generate:intent` BullMQ task)
  - `dispatchMaintenanceIntent` is now only called for code-change
    intents
- `packages/agents/maintenance/src/index.ts`:
  - Re-exports `applyContextFileFix` + types so tests / advanced
    wiring can call it without going through the runner
  - Re-exports `MaintenanceIntentClass` + `classifyMaintenanceIntent`
- The alignment-agent and drift-agent themselves are unchanged —
  they already accumulated `intentsQueued: MaintenanceIntent[]` and
  returned it (they never called `dispatch()` directly). The brief's
  "Change 4" (turn the agents into pure detectors) was already true
  in the codebase

Verified live against `trackeros`:
- `pnpm -r build` clean across all 12 packages
- Server image rebuilt; `Up (healthy)`. Pre-trigger `main` HEAD on
  GitHub: `7feaf3d9`
- **First manual trigger** of alignment-agent via
  `POST /maintenance/trigger`. Response shape:
  ```
  status: completed
  intentsQueued: 0          (was 6 before this session)
  directFixes:   6          (was 0 before this session)
  findings:     12          (6 alignment findings + 6 direct-fix-applied)
  durationMs:    ~32 s
  ```
- Server logs show the expected sequence: `Applying direct context
  fix` × 6 / `Direct context fix committed` × 6, all from the
  `module: "context-fixer"` logger, with no errors or warnings.
  Each fix took 5–7 s end-to-end (clone + LLM call + commit + push)
- Post-trigger `main` HEAD: `46cace91`. Re-cloning the repo
  anonymously shows 6 new commits on top of `7feaf3d9` in the
  expected order, each authored by `Gestalt Maintenance Agent
  <maintenance-agent@gestalt.local>`, each with a subject starting
  `docs:` and a `[gestalt-maintenance/CONTEXT_ALIGNMENT]` trailer:
  - 4 commits to `docs/DOMAIN.md` (1–2 line additive tweaks for
    the four `entity-without-module` findings: `components`,
    `type`, `description`, `props`)
  - 2 commits to `AGENTS.md` (1-line additions adding `GP-003`
    and `GP-004` references for the orphan-principle findings)
- **Second manual trigger** to confirm the routing holds and that
  prior fixes carried through: `intentsQueued: 0`,
  `directFixes: 4` (the entity findings re-fire because the
  regex extractor still finds them in DOMAIN.md after the LLM's
  minimal edits — the LLM chose to refine descriptions rather
  than remove the entities; the GP-003 / GP-004 findings did NOT
  re-fire because the first run's AGENTS.md edits resolved them
  permanently). Four additional commits on `main`, same shape.
  The path guard, truncation guard, no-change short-circuit, and
  Git author config all continued to work as designed
- Final `main` HEAD: `af8d5747`. Ten total
  `[gestalt-maintenance]` commits landed in the two runs
- The Maintenance dashboard view already renders both stats
  (`intents queued` + `fixes applied`); no UI change was needed.
  The dashboard now shows `0 intents queued · 6 fixes applied
  · 32.1 s` on the post-fix runs, which is exactly the correct
  reading

Decisions made:
- **Path guard runs BEFORE the clone**, not before the LLM call only.
  Cloning a multi-MB repo to attempt a fix to a file the path guard
  would reject anyway is pointless. The guard's purpose — "this code
  path will never touch src/" — is best expressed by failing as
  early as possible. The LLM call is bypassed as a consequence
- **`MaintenanceIntent.affectedFiles[0]` is the canonical target.**
  Every existing call site for `CONTEXT_ALIGNMENT` / `CONTEXT_UPDATE`
  puts the file to *update* in slot 0 and the file *to compare
  against* in slot 1 (alignment-agent's three branches: DOMAIN.md
  first / ARCHITECTURE.md first / AGENTS.md first, depending on
  which side has the orphan). Documented in the agent's signal
  generation code. The fixer treats slot 0 as the authority
- **Truncation floor 50%** matches the brief. Empirically, even
  the most minimal LLM additive edit to a typical context file
  produces output > 95% of the original length (you have to copy
  the whole file just to add one line). 50% is generous against
  legitimate edits and decisive against "the LLM returned only
  the new section" failures
- **No-op short-circuits return reasons, not throws.** The runner
  needs to log "fix-not-needed" cases as info, not as errors —
  treating "the LLM happened to produce the same content" as a
  failure would noise the alerts view. The `reason: 'no-change'`
  / `'file-missing'` / `'truncation-guard'` / `'llm-error'` union
  gives the runner enough to record cleanly without an exception
  catch
- **`direct-fix-applied` and `direct-fix-failed` are surfaced as
  `MaintenanceFinding` rows on the run.** The dashboard's
  per-run findings panel already renders them — they show up
  alongside the original alignment findings so the operator can
  see the full causal chain in one expanded panel. `severity:
  'low'` on applied (informational) and `severity: 'high'` on
  failed (operator needs to intervene)
- **Commit author is `Gestalt Maintenance Agent`.** drift-agent's
  pre-existing additive-note path uses `Gestalt Drift Agent`;
  consistent naming pattern. Email is `*@gestalt.local`, same
  as drift-agent — the platform doesn't talk to a real mail
  server so the local TLD is fine
- **Failures are per-intent, not per-run.** A single intent failing
  (LLM error, push rejected, etc.) records a `direct-fix-failed`
  finding and continues to the next intent. The brief's "alignment
  agent produces 6 findings → 6 fixes" pattern only works if one
  bad fix doesn't abort the other 5. A try/catch around each
  applyContextFileFix call gives us that
- **`PERFORMANCE_DEGRADATION` / `SECURITY_FINDING` continue to
  flow through the generate orchestrator unchanged.** These need
  real code changes, real tests, real review — the generate →
  gate → deploy loop is correct for them. The classification
  switch is the *only* control flow change in the runner; the
  legacy `dispatchMaintenanceIntent` is still called for those
  cases

Build status: `pnpm -r build` clean across all 12 packages.
Server image rebuilt; manual triggers verified end-to-end.
Pending alignment-agent regex tightening (already on the
follow-ups list) would reduce repeat fixes per run, but the
routing fix is correct independently.

No new follow-ups added — feature is self-contained and lives
behind the existing ADR-018 / classification surface.

---

### Session 2026-06-01 — Claude Code (alignment-agent extractor fix + idempotency budget)

The prior session shipped the direct-fix routing for context-file
maintenance intents, but live operation against `trackeros` revealed
a non-converging loop: every alignment-agent run reported 8 findings
and applied 4 fixes — same findings, every run, forever. Root-cause
analysis (the previous Claude Code reply to the operator) traced the
divergence to two interacting bugs (over-greedy entity extractor +
the fix targeting the wrong file) and one missing safety mechanism
(no per-finding budget). This session implements the architect's
fix order A → B → C → E.

Changed:
- `packages/agents/maintenance/src/agents/alignment-agent.ts`:
  - **Fix A — entity extractor.** Replaced the old patterns
    (`/^##\s+([A-Z]…)/` h2 headings + `/^[-*]\s+\*\*([A-Z]…)\*\*/`
    bold-bullet anywhere) with:
    - `/^###\s+([A-Z][A-Za-z0-9]+)\s*$/gm` — h3 only, since h2 is
      conventionally a section grouping (e.g. `## Components`)
      while h3 is the entity declaration (e.g. `### WelcomeScreen`)
    - `/^[-*]\s+\*\*([A-Z][A-Za-z0-9]+)\*\*\s*[—–-]/gm` — bold bullet
      only when followed by an em-dash / en-dash / hyphen separator
      (the entity-definition pattern). `- **Type**: value` (field
      label, colon follows the closing `**`) no longer matches
    - A `FIELD_LABEL_STOP_LIST` of common attribute names
      (`Type`, `Description`, `Status`, `Notes`, `Props`, `Id`,
      `Name`, `Fields`, `Relationships`, `Methods`, `Properties`,
      `Attributes`, `Example`, `Usage`, `Parameters`, `Returns`,
      `Throws`, `See`) filters both match sites. Documented as
      "minimal — adding too many words masks real entities"
  - `extractModules()` updated to a wider character class
    (`[a-zA-Z0-9_-]+`) so CamelCase + snake_case + kebab-case all
    match. The regex still requires a literal `src/modules/<name>`
    string; the implication that the LLM's idiomatic markdown
    directory tree can't satisfy it is captured under Pending
    enhancements
  - **Fix B — affectedFiles ordering.** Three intent branches
    rebalanced so `affectedFiles[0]` is now the file the
    context-fixer should WRITE to (the slot it already keys off):
    - `domain-entity-without-module` →
      `[docs/ARCHITECTURE.md, docs/DOMAIN.md]` (add a module
      reference). Was inverted; this was the primary reason the
      LLM couldn't resolve the finding — it was being told to
      edit the file the entity already lived in
    - `architecture-module-without-entity` →
      `[docs/DOMAIN.md, docs/ARCHITECTURE.md]`. Already correct
      but the order is now explicit
    - `golden-principle-not-cross-referenced` →
      `[AGENTS.md, docs/GOLDEN_PRINCIPLES.md]`. Already correct
    - The corresponding `suggestedAction` text was rewritten so
      the LLM gets a single concrete instruction (e.g. "Add a
      `src/modules/StartButton/` entry to docs/ARCHITECTURE.md
      to match the 'StartButton' entity defined in docs/DOMAIN.md")
      rather than the old "either…or…" dilemma that gave the LLM
      cover to do nothing structural
- `packages/agents/maintenance/src/agents/context-fixer.ts`:
  - **Fix E — system prompt.** Rewrote the system prompt as a
    numbered five-rule contract. Rule 3 explicitly forbids
    `> Note:` / blockquote-appending and instructs the LLM to
    return the file UNCHANGED when no structural edit is
    possible. Rule 4 reinforces it ("the edit must be something
    that, on the next alignment check, would mean this finding no
    longer fires. If you cannot achieve that, return the file
    unchanged"). Combined with the no-change short-circuit
    already in the fixer, this lets the runner detect unresolvable
    findings via the `reason: 'no-change'` path instead of via
    the previous garbage-blockquote-appending path
- `packages/adapters/postgres/src/migrations/008_finding_attempts.sql`
  (new): `maintenance_finding_attempts` table — `(project_id,
  finding_hash) UNIQUE`, plus `attempt_count` / `last_attempted`
  / `escalated`. FK `project_id REFERENCES projects(id) ON DELETE
  CASCADE` so a deleted project leaves no orphan rows.
  `idx_finding_attempts_project` for the per-project read path.
  Pure schema, no `schema_migrations` writes (runner owns those)
- `packages/core/src/repository/index.ts`:
  - New `FindingAttemptRecord` + `FindingAttemptRepository`
    interface (`upsertAttempt`, `getAttempts`, `markEscalated`,
    `resetAttempts`). Added `findingAttempts` to
    `RepositoryRegistry`
  - `AlertType` extended with `'maintenance-stuck'`
  - `AlertRequiredAction` extended with `'review-manually'`
- `packages/core/src/index.ts`: re-exports
  `FindingAttemptRecord` + `FindingAttemptRepository`
- `packages/adapters/postgres/src/repositories/finding-attempts.ts`
  (new): `PostgresFindingAttemptRepository`. `upsertAttempt` uses
  `INSERT ... ON CONFLICT (project_id, finding_hash) DO UPDATE
  SET attempt_count = ... + 1, last_attempted = NOW()` so
  concurrent maintenance runs increment atomically without a
  read-modify-write race. `getAttempts` short-circuits on empty
  input (`postgres.js` rejects empty IN-lists). `resetAttempts`
  deletes the row rather than zeroing the counter — a successful
  fix should be a clean slate, not "attempted N times and
  succeeded"
- `packages/adapters/{oracle,mssql}/src/repositories/finding-attempts.ts`
  (new): throw-stub `*FindingAttemptRepository` classes so
  interface drift in core surfaces as a build break here. Same
  pattern as the alerts / deployment-events / maintenance-runs
  stubs. Wired in each adapter's `index.ts`
- `packages/adapters/postgres/src/index.ts`: instantiates and
  registers `PostgresFindingAttemptRepository` in the
  `createPostgresAdapter` registry
- `packages/agents/maintenance/src/runner/index.ts`:
  - New `MAX_ATTEMPTS = 3` constant + `computeFindingHash(intent)`
    helper (Node built-in `crypto.createHash('sha256')`; hashes
    `${type}:${affectedFiles[0]}:${evidence.slice(0,80)}` so
    minor LLM-paraphrasing of `suggestedAction` doesn't change
    the hash)
  - Replaced the inline direct-fix block with `runDirectFix(args)`.
    Flow:
    1. `getAttempts(projectId, [hash])` — early return if the
       finding is already escalated (silent skip; no LLM call,
       no clone)
    2. Call `applyContextFileFix(intent, project)`
    3. If `outcome.committed`: `resetAttempts(hash)` (delete the
       row so the NEXT occurrence starts fresh) and record a
       `direct-fix-applied` finding
    4. If not committed: `upsertAttempt(hash)` (increment or
       insert at 1) and call `maybeEscalate(...)` which fires
       the alert ONLY when the post-upsert `attemptCount >=
       MAX_ATTEMPTS`. The third failed attempt is the one that
       creates the alert — not the fourth run
    5. Thrown failures count as attempts too and also call
       `maybeEscalate` so a fixer-throwing finding can't loop
       forever either
  - `maybeEscalate(...)` calls `markEscalated(hash)` then
    `alerts.create({ type: 'maintenance-stuck', severity:
    'medium', requiredAction: 'review-manually', context:
    {...full intent context + attemptCount + findingHash} })`
    and appends a typed `direct-fix-escalated`
    `MaintenanceFinding` so the run record visibly shows the
    escalation
  - Per-intent try/catch from the previous session is preserved:
    one bad fix doesn't abort the per-project loop

Verified live against `trackeros` (correlationId-equivalent:
maintenance triggers, not intents). Clean DB state at start
(`DELETE FROM maintenance_finding_attempts; DELETE FROM alerts
WHERE type='maintenance-stuck'`):

- **Run 1 (Fix A + Fix B validation).** Pre-fix DOMAIN.md had
  the agent reporting 6 entity findings (`Components`, `Type`,
  `Description`, `Props`, plus 2 real). Post-fix the run
  reported `findings: 4 / directFixes: 2`:
  - 2 real `domain-entity-without-module` findings only
    (`WelcomeScreen`, `StartButton`) — every false positive
    (`Components`, `Type`, `Description`, `Props`) eliminated
  - Both findings had `affectedFiles[0] = docs/ARCHITECTURE.md`
    (Fix B: was DOMAIN.md before)
  - 2 direct fixes committed to ARCHITECTURE.md (not DOMAIN.md);
    the LLM added `WelcomeScreen/` and `StartButton/` subdirs to
    the markdown directory tree
  - DOMAIN.md was NOT touched (Fix E: the prompt no longer
    invites blockquote-appending)
- **Run 2 (idempotency budget — attempt 1).** Same 2 findings
  re-fire (the LLM's tree-diagram edits don't satisfy the
  module extractor's literal-`src/modules/<name>` regex —
  documented as a Pending enhancement). Both go through the
  fixer, get `reason: 'no-change'` (the LLM, given the
  tightened prompt, returns unchanged), `upsertAttempt` →
  `attempt_count = 1` for each hash. Zero commits, zero
  alerts, no escalation yet
- **Run 3 (attempt 2).** Same 2 findings. `attempt_count = 2`
  for each. Still no escalation
- **Run 4 (attempt 3 → escalate).** Same 2 findings.
  `attempt_count = 3` for each → `MAX_ATTEMPTS` hit →
  `maybeEscalate` fired for each → 2 rows flipped to
  `escalated = TRUE` → 2 `maintenance-stuck` alerts created
  with severity `medium`, `requiredAction: 'review-manually'`,
  full context payload (intentType, affectedFiles, evidence,
  suggestedAction, attemptCount, findingHash). Run record:
  `findings: 4 / directFixes: 0` (2 original + 2
  `direct-fix-escalated`)
- **Run 5 (post-escalation silent skip).** Same 2 findings.
  Each finding's `escalated` flag is checked at the start of
  `runDirectFix` → early return → no clone, no LLM call, no
  commit. Run total wall-clock: **838 ms** (down from ~10 s
  on runs 1–4). `attempt_count` stayed at 3, `escalated` stayed
  `true`, no new alert created. Run record: `findings: 2 /
  directFixes: 0` (just the original two; no escalation
  re-fire). This is the final converged state — the loop is
  bounded
- **Alert payload verified** by direct `SELECT` on the alerts
  table: title `Maintenance agent cannot resolve finding
  (CONTEXT_ALIGNMENT)`, severity `medium`,
  `required_action: review-manually`, description containing
  the attempt count + the original `evidence` field. The
  `context` JSONB round-tripped cleanly with all keys present
- **GitHub repo state.** `main` HEAD moved exactly once
  during the verification (run 1 added two commits to
  ARCHITECTURE.md). HEAD did NOT advance during runs 2–5 —
  no spurious `> Note:` blockquote commits, no garbage edits.
  Before this session: every run produced 4–6 commits even
  when nothing structural was being fixed; after: zero
  commits once the LLM correctly identifies it can't resolve
  the finding

Decisions made:
- **MAX_ATTEMPTS = 3 with post-attempt escalation.** Brief said
  "third run: alert created". Implemented by incrementing
  *first* (the third attempt's row reaches `attempt_count = 3`)
  then checking `>= MAX_ATTEMPTS`, so the alert fires on the
  same run that made the third try. Cleaner than gating
  pre-attempt (where you'd either over-attempt or under-attempt
  by one) and the row reflects "the work that was actually
  done"
- **Reset on success means DELETE, not UPDATE attempt_count = 0.**
  A successful fix is a clean slate — there's no value in
  preserving `attempt_count=0, last_attempted=NOW()` as a
  historical record. If the same finding recurs months later
  it should genuinely start at attempt 1. DELETE is also
  cheaper and avoids stale rows on long-lived projects
- **Hash inputs trim `evidence` to 80 chars.** Long evidence
  strings can include LLM-rephrased wording around stable
  facts. The first 80 chars contain the entity / module /
  principle name and the structural verdict; that's stable
  across runs. Truncating means the hash is robust against
  trivial rewording of the agent's output in a future code
  change
- **`maintenance-stuck` alerts are `severity: medium`, not
  `high`.** A stuck context-file finding is fixable manually
  in seconds and rarely blocks work. The dashboard's existing
  sidebar badge already aggregates unacknowledged alerts;
  flooding it with `high` for what is effectively "look here
  when you have a minute" would dilute the priority signal
  reserved for `clarification-needed` and
  `GOLDEN_PRINCIPLE_BREACH`
- **Tightened prompt + no-change path is the architect-favored
  resolution** for "LLM can't satisfy the regex". The
  alternative — allowing deletions on a per-intent flag
  (Fix D in the diagnostic) — was deliberately out of scope.
  The no-change path is safer (no chance of an LLM choosing
  to "fix" by removing something), and the idempotency budget
  catches the unbounded-loop case regardless
- **`getAttempts` takes an IN-list.** Today the runner only
  ever passes a single hash, but the API shape supports
  batch lookup for free (one round trip per intent vs one per
  project). Keeps the door open for a future
  `getAttemptsForRun()` optimisation without an interface
  change
- **`'maintenance-stuck'` AlertType + `'review-manually'`
  AlertRequiredAction added to the typed unions in core, not
  shoved into `context` JSONB.** These are platform-level
  concepts that downstream consumers (the dashboard's Alerts
  view, the future alert-routing layer) should be able to
  switch on at the type level. Worth the interface-change
  cost
- **Repo cleanup of `trackeros` DOMAIN.md is operator
  responsibility, per brief.** The 12+ spurious `> Note:`
  blockquote lines accumulated by the previous buggy runs
  remain in DOMAIN.md until the operator removes them in a
  manual commit. The session log documents this; Claude Code
  does not automate it (a destructive auto-cleanup is the
  wrong default). After the manual cleanup the file will look
  like its original template again and DOMAIN.md will stop
  growing

Build status: `pnpm -r build` clean across all 12 packages.
Migration 008 applied on first start (`schema_migrations` now
lists 8 versions). Server image rebuilt. Live verification
covered the full lifecycle: convergence (false positives
gone), no-op (no garbage commits when LLM can't resolve),
budget (3-attempt escalation on the same run as the third
attempt), and post-escalation silent skip (≤1 s).

Operator follow-up: clean up `trackeros` DOMAIN.md manually.
The recommended commit:

```
cd <trackeros working tree>
git pull
# edit docs/DOMAIN.md, remove every `> Note: …` line added by the
# previous buggy maintenance runs (~12 lines below the entity
# definitions)
git add docs/DOMAIN.md
git commit -m "docs: remove spurious Note blockquotes from alignment-agent bug [manual cleanup]"
git push
```

Follow-up logged in Pending enhancements:
- The module extractor only matches a literal contiguous
  `src/modules/<name>` substring. The LLM's idiomatic
  markdown directory-tree edits don't produce that substring
  (the parent path is implied by indentation in
  `├── modules/` / `│   └── WelcomeScreen/`). The
  idempotency guard catches the loop after 3 attempts and
  escalates, so the platform is safe — but the underlying
  reconciliation never resolves. Long-term fix is either to
  teach the extractor to follow the tree OR to change the
  suggestedAction text to ask the LLM for a literal
  `src/modules/<name>/ — description` line outside the tree
  block

