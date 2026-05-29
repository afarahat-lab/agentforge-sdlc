-- Migration 003: Projects + Git credentials (ADR-032)
-- The server clones each project's Git repo for every intent cycle, so the
-- platform needs to persist the URL + a token to authenticate the clone/push.

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  git_url         TEXT NOT NULL,
  default_branch  TEXT NOT NULL DEFAULT 'main',
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_created_by ON projects(created_by);

-- One row per project. Stored as plain text for the bootstrap phase;
-- encrypt at rest before production (see TODO in
-- repositories/projects.ts → saveCredential).
CREATE TABLE project_git_credentials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_git_credentials_project ON project_git_credentials(project_id);
