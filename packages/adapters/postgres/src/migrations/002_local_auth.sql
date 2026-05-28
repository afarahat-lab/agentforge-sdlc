-- Migration 002: Local auth credentials
-- Stores bcrypt password hashes for users created via the local fallback provider.
-- One row per local user. Linked 1:1 to a row in users.

CREATE TABLE local_auth (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_local_auth_user_id ON local_auth(user_id);
