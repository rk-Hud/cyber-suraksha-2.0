-- STAGING ONLY. This file is intentionally excluded from db:init.
-- Apply only to an approved disposable/staging Neon branch after private backup review.
-- It creates no owners, no secrets, and does not modify citizen data.
CREATE TABLE IF NOT EXISTS cs_stage_operator_challenges (
  id VARCHAR(64) PRIMARY KEY,
  nonce_hash CHAR(64) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS cs_stage_operator_challenges_expiry
  ON cs_stage_operator_challenges (expires_at);
CREATE TABLE IF NOT EXISTS cs_stage_operator_pending (
  id VARCHAR(64) PRIMARY KEY,
  owner_google_sub VARCHAR(32) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  encrypted_totp TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS cs_stage_operator_pending_expiry
  ON cs_stage_operator_pending (expires_at);
CREATE TABLE IF NOT EXISTS cs_stage_operator_credential_uses (
  fingerprint CHAR(64) PRIMARY KEY,
  used_at BIGINT NOT NULL
);

-- Operator credentials are never stored in the citizen session namespace.
-- The only writer is the separately deployed, explicitly enabled Function.
CREATE TABLE IF NOT EXISTS cs_stage_operator_sessions (
  id VARCHAR(64) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  owner_id VARCHAR(64) NOT NULL REFERENCES portal_users(id),
  owner_version INTEGER NOT NULL CHECK (owner_version > 0),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  mfa_at BIGINT NOT NULL,
  revoked_at BIGINT
);
CREATE INDEX IF NOT EXISTS cs_stage_operator_sessions_owner_expiry
  ON cs_stage_operator_sessions(owner_id,expires_at);
