-- Migration 005: Maintenance layer (ADR-018, ADR-019, ADR-020, ADR-035)
-- Records every run of every scheduled maintenance agent. Used for
-- dashboards + the manual /maintenance/runs query API.

-- 001_initial.sql created a `maintenance_runs` table with an
-- aspirational shape that did not match the brief (missing project_id,
-- findings, completed_at; status had no default; duration_ms was NOT
-- NULL). No agent ever populated it. Drop and recreate to the live
-- shape. Safe — verified empty on the reference postgres adapter.
DROP TABLE IF EXISTS maintenance_runs CASCADE;

CREATE TABLE maintenance_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role      TEXT NOT NULL,
  project_id      UUID REFERENCES projects(id),
  status          TEXT NOT NULL DEFAULT 'running',
  intents_queued  INTEGER NOT NULL DEFAULT 0,
  direct_fixes    INTEGER NOT NULL DEFAULT 0,
  findings        JSONB NOT NULL DEFAULT '[]',
  duration_ms     INTEGER,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_maintenance_runs_agent   ON maintenance_runs(agent_role);
CREATE INDEX idx_maintenance_runs_project ON maintenance_runs(project_id);
CREATE INDEX idx_maintenance_runs_run_at  ON maintenance_runs(run_at DESC);

-- Restore DELETE permission on deployment_events.
-- Migration 004 revoked UPDATE + DELETE on deployment_events under the
-- audit_log analogy. The brief for the maintenance layer clarifies that
-- deployment_events are operational logs (not audit records) and gc-agent
-- must be able to delete rows older than 90 days. UPDATE stays revoked —
-- nothing should ever mutate a deployment_event in place.
DO $$
BEGIN
  EXECUTE format('GRANT DELETE ON deployment_events TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;
