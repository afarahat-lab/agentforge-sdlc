-- 008_finding_attempts.sql
--
-- Per-finding idempotency counter for the maintenance layer (ADR-018).
-- When the same maintenance finding fires across multiple runs and the
-- direct-fix path can't resolve it, the runner uses this table to:
--   - increment a counter each time we attempt a fix without success
--   - escalate to a `maintenance-stuck` alert once attempt_count reaches
--     the platform's MAX_ATTEMPTS budget (3, set in the runner)
--   - mark the finding `escalated` so future runs skip it silently
--     until an operator resolves it manually
--
-- finding_hash is a SHA-256 derived from the intent's type, target file,
-- and a 80-char description prefix. See `computeFindingHash` in
-- packages/agents/maintenance/src/runner/index.ts.
--
-- UNIQUE(project_id, finding_hash) gives the upsert path a deterministic
-- conflict target without needing a composite PK.

CREATE TABLE maintenance_finding_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  finding_hash    TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  last_attempted  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, finding_hash)
);

CREATE INDEX idx_finding_attempts_project ON maintenance_finding_attempts(project_id);
