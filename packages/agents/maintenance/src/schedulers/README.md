# Maintenance layer — Scheduler

Cron-based scheduler for the three scheduled maintenance agents. Evaluation agent is not scheduled here — it is triggered by monitoring.

---

## Files

| File | Purpose |
|---|---|
| `scheduler.ts` | Creates and manages cron jobs per HARNESS.json schedules. Enqueues BullMQ tasks for each run. |

## Rules for agents working here

- Schedules are always UTC — never local time
- Each scheduled run enqueues a BullMQ task — agents remain ephemeral
- runNow() allows manual trigger from CLI or dashboard

## Context needed

- `../../types.ts` — all types used in this directory
- `../../../README.md` — package-level orientation
- `../../../../../docs/ARCHITECTURE.md` — system-wide rules
- `../../../../../AGENTS.md` — platform conventions
