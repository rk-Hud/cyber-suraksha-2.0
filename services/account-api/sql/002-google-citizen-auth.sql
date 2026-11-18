-- Additive migration; apply to an isolated Neon branch and verify before production.
-- Existing portal_users and administrator TOTP records are never modified.
CREATE TABLE IF NOT EXISTS portal_google_identities (
  google_sub varchar(64) PRIMARY KEY,
  user_id varchar(36) NOT NULL UNIQUE REFERENCES portal_users(id) ON DELETE RESTRICT,
  linked_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS portal_google_credential_uses (
  fingerprint char(64) PRIMARY KEY,
  used_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_google_credential_uses_date ON portal_google_credential_uses(used_at);
-- Cleanup is an operator job; don't delete existing sessions or complaint records.
