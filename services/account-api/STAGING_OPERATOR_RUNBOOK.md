# CYBER SURAKSHA 2.0 — staging owner provisioning (NOT DEPLOYED)

**Scope:** Neon project frosty-band-01793215; branch br-sweet-band-azhwai4r;
existing citizen Function csgooglestage. This is a private operator workflow
for **fictional staging records only**, not a police reporting service. It is
independent of production, the Render owner portal and the public Pages release.

**Current release state:** This pull request is source-only. Do not migrate
staging, deploy an operator Function, enroll an owner, enable a public feature,
modify production or copy credentials while security acceptance is incomplete.

## Security model

The owner bootstrap lives in the separate
src/index-staging-operator.js -> src/staging-operator.js Function and is not
imported by src/index.js (the existing citizen Function). It is disabled unless
every private prerequisite is provided:

* Exact STAGING_BRANCH_ID value br-sweet-band-azhwai4r.
* STAGING_OPERATOR_ENABLED=1 **after** review, never by default.
* A single approved Google identity, verified server-side using Google's
  published public keys, audience, issuer, expiry, verified email and
  server-generated one-use nonce. The stable Google subject must match the
  privately approved STAGING_OWNER_GOOGLE_SUB and the verified address must
  match both STAGING_OWNER_EMAIL and ADMIN_EMAIL. The owner account must not
  be a citizen account.
* A distinct staging-only, high-entropy STAGING_OPERATOR_APPROVAL_KEY during
  enrollment. Possession of a public email address is never sufficient.
* A new owner password (server-side scrypt hash), encrypted authenticator seed
  and a verified one-time TOTP code before any owner row can be inserted.
* Global database-backed request limits, short-lived challenges, one-use
  Google-credential fingerprints, transactional locks, five pending TOTP
  attempts, owner-role checks, ten-minute MFA freshness on the standalone
  operator API and a one-time TOTP counter.
* Audit events for successful provisioning and privileged MFA sign-in,
  sanitized login success/failure entries, no plaintext credentials or TOTP
  seeds in source, logs, GitHub, public URLs or normal admin responses.

The operator endpoint does not use cookies and requires HTTPS, an exact
browser Origin allowlist, strict JSON shape and bounded request size.
Direct non-browser callers must still satisfy Google nonce/subject
verification, password/TOTP or private approval. Configure provider-level
edge abuse protection before real traffic.

## Acceptance gates before staging rollout

1. Confirm the owner-controlled Google account is authorized independently:
   require a fresh actual Google Identity Services credential and
   owner-confirmed private Google subject. Do not infer ownership from a
   matching email, citizen accounts, screenshots or repository display names.
   A reviewer must verify the intended owner and approved subject through an
   authenticated account/console workflow.
2. Verify a private, restorable staging backup/checkpoint. Staging branch expiry must be rechecked before deployment; the latest
   branch overview showed **Never**, but do not rely on stale screenshots.
3. Confirm existing citizen case counts, both Google identity links, and no
   owner account (read-only SQL below). Keep real email addresses and tokens
   out of issue comments and CI logs.
4. Run the isolated test suite on disposable loopback PostgreSQL:
   npm ci
   npm run check
   npm test
   npm run build
   node scripts/build-staging-operator.mjs
   Never point tests at the live staging DATABASE_URL: the existing test
   helper only supports a disposable loopback database.
5. Inspect PR diff and GitHub Actions logs. Passing automated tests does
   **not** substitute for actual owner identity proof, authenticated
   staging-browser tests, recovery rehearsal or independent approval.
6. Only after these gates pass, separately authorize an additive staging
   schema migration and a separate Neon operator Function. Keep the existing
   citizen Function and all Render services unchanged.

Read-only evidence queries (run ONLY in br-sweet-band-azhwai4r /
cybersuraksha; do not extract email/identity values):

    SELECT role, count(*) FROM portal_users GROUP BY role;
    SELECT count(*) AS linked_google_users,
           count(DISTINCT user_id) AS distinct_citizens
      FROM portal_google_identities;
    SELECT count(*) AS cases
      FROM portal_complaints
     WHERE reference IN ('CS-69B1F5151000','CS-1464A96538BB');

## Private settings for a *future* separately approved operator Function

Build from services/account-api (Node.js 24):

    npm ci
    node scripts/build-staging-operator.mjs

Package only dist-operator/index.mjs as index.mjs at the ZIP root. This is
**not** the citizen bundle dist/index.mjs. Deploy to a **new**, staging-only
Neon Function after identity and security review. Set the approved target
branch in the Neon console before deployment.

The settings below are private environment entries, **not** an .env file
to commit. Never put values in command-line arguments, CI outputs or issues.

| Variable | Required scope |
| --- | --- |
| STAGING_OPERATOR_ENABLED | Start at 0; set 1 only after approved readiness |
| STAGING_BRANCH_ID | br-sweet-band-azhwai4r, for the operator Function only |
| STAGING_OWNER_GOOGLE_SUB | Verified, independently approved stable Google subject, not a citizen |
| STAGING_OWNER_EMAIL | Verified Google email of the authorized owner |
| ADMIN_EMAIL | Must exactly equal STAGING_OWNER_EMAIL; match the staging citizen Function |
| STAGING_OPERATOR_APPROVAL_KEY | Fresh independently generated 48+ character high-entropy staging-only credential |
| STAGING_OPERATOR_TOTP_KEY | Fresh random 48+ character operator-only encryption key; never the citizen or production key |
| STAGING_OPERATOR_SESSION_KEY | Fresh random 48+ character operator-only bearer signing key; never the citizen or production key |
| STAGING_OPERATOR_OTP_KEY | Fresh random 48+ character operator-only nonce/rate HMAC key, distinct from all other keys |
| API_SESSION_KEY, API_OTP_KEY, TOTP_ENCRYPTION_KEY | **Never share citizen keys with the operator**; these are not needed by the operator Function |
| GOOGLE_CLIENT_ID | Existing approved Google OAuth Web Client ID for the owner |
| ALLOWED_ORIGINS | https://rk-hud.github.io |
| PUBLIC_WEB_URL | https://rk-hud.github.io/cyber-suraksha-2.0/ |
| DATABASE_URL | Provided only by Neon, pointing to this exact staging branch |
| NODE_ENV | production, for a deployed Function |

Generate a staging-only TOTP encryption key and operator approval key using
a cryptographically secure generator or password manager, in the owner's
private authenticated environment. Do not generate them in a chat or
commit or screenshot their values. The operator TOTP key must exist only in the operator Function environment.
Do not reuse or export any key from the citizen Function. Never replace the
operator encryption key once an owner authenticator has been enrolled. Config changes can restart a
Function; schedule and verify before applying them.

Staging-only schema file:
sql/003-staging-operator-only.sql. This additive DDL is deliberately
**not** part of npm run db:init or production migrations. It creates four
new staging-prefixed tables including isolated sessions, no users and no case updates. Execute only on
the reviewed staging database after backup, tests and separate authorization.

## Owner enrollment and login protocol (future approved deployment)

All requests use HTTPS JSON to the **separate** operator Function,
prefix /operator/v1. The exact URL is assigned by Neon on deployment;
there is no live operator URL at the time of this PR.

1. **Challenge:** POST /challenge with {}. Receive challengeId, nonce and a
   five-minute expiry.
2. **Begin:** In a trusted operator client, invoke Google Identity Services
   using the exact new server nonce and Google OAuth Web Client ID. Return
   the signed Google ID credential in POST /begin alongside challengeId,
   nonce, private approval key, new password and confirmation. The Function
   pins both Google subject and email, consumes the challenge and returns
   provisionId and a one-time authenticator seed/otpauth URI. Keep them in
   volatile memory only. Do not enter credentials into a public issue.
3. **Finish:** Add the seed to a genuine authenticator app. Request a **new**
   /challenge and fresh Google-signed ID token for the next nonce. POST
   /finish with new proof, private approval key, provisionId and current
   six-digit TOTP. On successful verification, insert exactly one verified
   owner with the encrypted TOTP factor and consume the provisioning record.
   Invalid codes count toward a five-attempt limit.
4. **Login:** Request another fresh /challenge and new Google credential.
   POST /login with challengeId, nonce, credential, owner password and
   a **new** authenticator code. On success, receive a session bearer valid
   for at most 30 minutes and recent MFA for ten minutes. Enrollment consumes
   its code, so the next login requires a later 30-second TOTP time step.
5. **Admin APIs:** Supply the operator bearer as an Authorization: Bearer header
   only to the separately deployed operator Function:
   GET /operator/v1/summary, GET /operator/v1/cases, GET /operator/v1/cases/:id,
   PATCH /operator/v1/cases/:id (status, message and optimistic version),
   and POST /operator/v1/logout with {}. These routes revalidate server-side
   owner role, identity, active flag, account version, session revocation and
   ten-minute MFA freshness. Citizen bearer tokens are rejected, and operator
   tokens never work on csgooglestage. Fictional status changes are recorded in
   portal_case_events and portal_audit_events; the operator Function does not
   dispatch citizen notifications. Keep bearer tokens ephemeral and out of
   URLs, screenshots, storage, logs and analytics. A fresh /login is required
   once the ten-minute MFA freshness period expires.
6. Deny citizen access, expired and replayed Google proofs, reused TOTP,
   wrong password/key, wrong branch and stale MFA. Test status writes only
   against fictional staging cases after independently approving the owner.

**Stop conditions:** any mismatch in approved Google subject/email, missing
verified backup, wrong Neon branch, duplicate/old owner, unauthorized
cross-citizen read or write, nonfunctional TOTP/issuer validation, leaked
credential, unexpectedly available public enrollment, or unexpected
production configuration. Stop without deleting or altering citizen rows.

## What must remain pending

* Verified owner identity and private subject approval.
* Private secrets generation/storage in Neon; this PR contains none.
* Review of the exact new Function endpoint and CORS in live staging.
* Actual authenticated Google/TOTP enrollment on the staging UI.
* A live browser test of administrative queue/status changes, citizen 403,
  and both-direction case isolation, without exposing fictional details.
* Staging branch expiry and recovery plan.
* Separate, explicit production deployment authorization (not granted).


## Security review addendum (2026-11-21)

The original draft incorrectly reused citizen session and OTP keys and wrote
operator bearers to portal_sessions. The revised source requires three
operator-only keys (STAGING_OPERATOR_SESSION_KEY, STAGING_OPERATOR_OTP_KEY,
STAGING_OPERATOR_TOTP_KEY); these must be generated and stored privately and
must not match each other or citizen keys. Operator sessions are stored only in
cs_stage_operator_sessions; no citizen API endpoint consumes them.

**UI integration gate:** The current public account.html administrator form is
a legacy citizen API interface and is **not** an operator Google+TOTP client.
It must not be advertised as an activated operator login. Implement and review
a private Google Identity Services owner enrollment/login UI before activation.
Always show the disclaimer that this is an independently operated project, not
a government complaint portal.

**No-go remains:** full local restore rehearsal has not passed; PR is draft;
the verified Google owner subject, independent review, runtime secrets,
database migration authorization, separate Function deployment approval,
live browser tests and real MFA enrollment are pending. Do not bypass these
gates. No production or Render changes have been authorized.
