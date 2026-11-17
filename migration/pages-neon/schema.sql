-- CYBER SURAKSHA 2.0 — isolated Pages + Neon migration schema.
-- Apply only on an explicitly chosen migration database/branch after backup review.
-- DO NOT use the existing owner-pilot portal_* tables or import citizen PII.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS cs2_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_auth_id text NOT NULL,
  reference text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('phishing','payment-fraud','account-takeover','impersonation','other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 3000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs2_cases_owner_created_idx ON cs2_cases(owner_auth_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cs2_cases_status_created_idx ON cs2_cases(status,created_at DESC);
CREATE TABLE IF NOT EXISTS cs2_admin_allowlist (
  auth_id text PRIMARY KEY,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS cs2_case_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cs2_cases(id) ON DELETE RESTRICT,
  actor_auth_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','status_changed')),
  previous_status text,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs2_case_events_case_idx ON cs2_case_events(case_id,created_at);
-- Principle of least privilege: do not expose tables through browser-accessible
-- PostgREST / Data API. Use an authenticated function with a dedicated DB role.
-- Set database-specific privileges before production, and enable RLS for any
-- additional direct database clients. No frontend database connection string.
