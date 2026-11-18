# CYBER SURAKSHA 2.0 account API

Independently owned by Jatoth Ramakrishna. This service manages private support
cases; it does not submit police complaints or recover money. For financial
fraud in India, contact the bank promptly, call 1930 and use cybercrime.gov.in.

The static website is hosted under `/cyber-suraksha-2.0/` on GitHub Pages. The
account API runs as a Node.js 24 Neon Function, with PostgreSQL injected by the
host. The account interface uses HTTPS fetch requests and opaque bearer tokens
held in browser memory. Refreshing the page requires signing in again. The
scam checker and action planner remain entirely on-device.

## Configuration

Configure these values privately in the function environment. Do not commit a
production `.env`, database connection string, key, OTP or authenticator seed.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Injected by Neon for the function's branch |
| `API_SESSION_KEY` | Independently generated random secret, at least 32 characters |
| `API_OTP_KEY` | Different random secret, at least 32 characters |
| `TOTP_ENCRYPTION_KEY` | Existing owner's unchanged authenticator encryption key |
| `ADMIN_EMAIL` | Exact authorized owner's email |
| `ALLOWED_ORIGINS` | Exact HTTPS origins, normally `https://rk-hud.github.io` |
| `PUBLIC_WEB_URL` | `https://rk-hud.github.io/cyber-suraksha-2.0/` |
| `MAIL_PROVIDER` | `resend` or `smtp` |
| `MAIL_FROM` | Sender authorized by the email provider |
| `RESEND_API_KEY` | Resend sending credential, server-side only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Alternative authenticated SMTP configuration |
| `SMTP_SECURITY` | `starttls` or `ssl`; certificate verification stays enabled |
| `EMAIL_READY` | Set to `1` only after real delivery is verified |
| `REGISTRATION_ENABLED` | Set to `1` only after delivery and access-control checks |
| `NODE_ENV` | `production` |
| `GOOGLE_CLIENT_ID` | Public Google OAuth Web client ID, matching the frontend |
| `GOOGLE_SIGNIN_ENABLED` | Explicit opt-in for the separate citizen Google route |
| `GOOGLE_REGISTRATION_ENABLED` | Permit new Google citizens only after staging verification |
| `GOOGLE_ALLOWED_EMAILS` | Optional private comma-separated exact-address allowlist for approved staging testers |

Resend public delivery requires a sender domain whose DNS the owner controls.
A GitHub Pages project URL is not such a domain. Shared provider test senders
must not be used to advertise working public registration. Missing credentials
leave email-dependent routes unavailable, with no fixed OTP or bypass mode.

Use the existing `TOTP_ENCRYPTION_KEY` when migrating an owner who already has
MFA. A different key cannot decrypt that factor. Do not clear the existing
encrypted factor as a migration shortcut. Existing Python Werkzeug password
hashes and Fernet authenticator ciphertext are preserved.

## Requests and responses

All routes below use `/api/v1`. Mutations require `Content-Type:
application/json`, exact documented fields, bounded input and an allowed Origin
when a browser supplies one. The API supports native bearer clients without an
Origin header. It does not use cross-site cookies or accept a user-supplied role.

Success: `{ "data": {}, "requestId": "..." }`.
Failure: `{ "error": { "code": "msg_..." }, "requestId": "..." }`.
Errors never contain raw database/provider messages or submitted private text.

| Method and route | Input / behavior |
| --- | --- |
| `GET /health` | Database and feature readiness; public Google Client ID only when enabled and migrated |
| `POST /auth/google/challenge` | `locale`; starts a server-bound five-minute Google nonce/flow |
| `POST /auth/google` | `credential,nonce,challengeId,flowToken,locale,consent`; citizen-only Google exchange |
| `GET /public/content` | Public multilingual content overrides |
| `POST /auth/register` | `name,email,password,confirmPassword,consent:true,locale` |
| `POST /auth/login` | `email,password,locale` |
| `POST /auth/verify` | `challengeId,flowToken,code`; exchanges challenge for session |
| `POST /auth/forgot` | `email,locale`; generic recovery challenge |
| `POST /auth/reset` | `challengeId,flowToken,code,password,confirmPassword` |
| `GET /auth/me` | Current user and MFA freshness; bearer required |
| `POST /auth/logout` | `{}`; revokes current bearer |
| `GET /cases?page=1` | Current citizen's cases; 20 per page |
| `POST /cases` | `subject,category,details,consent:true` |
| `GET /cases/:id` | Authorized case and ordered history |
| `POST /cases/:id/replies` | `message`; current citizen's open case |
| `POST /admin/mfa/start` | `{}`; enroll only when owner has no existing factor |
| `POST /admin/mfa/confirm` | `code`; confirms new authenticator |
| `POST /admin/mfa/verify` | `code`; verifies existing authenticator |
| `GET /admin/summary` | Counts, login security history and audit events |
| `GET /admin/users?page=1` | Account names/emails without password hashes or MFA seeds |
| `PATCH /admin/users/:id` | `active,version`; owner cannot deactivate themselves |
| `GET /admin/cases?page=1` | Owner's support-case queue |
| `PATCH /admin/cases/:id` | `status,message,version`; validates workflow and concurrency |
| `GET /admin/content` | Editable content and versions |
| `PUT /admin/content/:section` | `content,version`; structured, validated content |
| `POST /admin/notifications/send-one` | `{}`; manually dispatches one queued status email |

Except MFA enrollment/verification, all administrator operations require both
the exact owner email/role and authenticator verification within ten minutes.
Citizen reads/replies use a server-side owner filter; other citizens receive
404. The owner case detail includes the submitter's name/email only after MFA.

Categories: `financial`, `account`, `harassment`, `malware`, `other`.
Statuses: `pending`, `in_review`, `awaiting_info`, `resolved`, `closed`.
Locales: `en`, `hi`, `te`. Each case update increments its version and appends a
history event in the same database transaction. Conflicting updates return 409.

## Security and delivery behavior

Email codes expire after five minutes and allow five attempts. They are bound
to the originating opaque flow token, purpose and challenge. Successful
verification rotates the session. Password reset revokes existing sessions and
pending login challenges. Login challenges also bind the credential version to
reject an old-password login racing a reset. Password hashes use scrypt with
independent salts. Owner TOTP uses one-time counters, encrypted seeds and a
separate recent-verification requirement.

Authentication has database-backed global and per-address quotas. Email codes
also have address/hour/day quotas. Forwarding headers are not trusted as client
identity; the service reports IP attribution as unavailable. The global quota
can affect other users during abuse and is not a substitute for provider edge
rate limiting. The API restricts request size, CORS, fields, SQL parameters,
content shapes and links; no application can guarantee zero vulnerabilities.

Creating or updating a case queues a status notification transactionally. The
function schedules a small post-response delivery attempt with the host's
`waitUntil` API after case creation and updates. This is best-effort follow-up,
not a continuously running worker. Failed attempts remain queued with bounded
backoff; later case activity and the owner's protected Send one action can retry
due jobs. No periodic dispatcher is configured. Jobs share the OTP global mail
budget and use provider idempotency keys, bounded retries and reference/status-only
email copy; private complaint details are excluded. Email links open the
authenticated case list, without embedding session tokens or case content.

## Database and release procedure

`sql/001-existing-portal.sql` is additive and compatible with the existing ten
`portal_*` tables. `sql/002-google-citizen-auth.sql` adds the two Google identity/replay tables without changing users or MFA. `npm run db:init` checks missing tables/indexes and seeds only
missing public content. It creates no default administrator password and does
not overwrite users, cases or authenticator factors. Run it against a disposable
branch before production. Keep the production branch intact during migration.

Use `npm ci`, `npm run check`, `npm test` and `npm run build`. API tests use either
`TEST_DATABASE_URL` targeting disposable loopback PostgreSQL, or a private JSON
configuration selected with `PORTAL_TEST_CONFIG`, containing a disposable
`DATABASE_URL`. Set `REQUIRE_DB_TESTS=1` in CI so a missing database is a failure,
not a skipped suite. `PYTHON_COMPAT_BIN` selects Python with Werkzeug and
cryptography installed for bidirectional legacy compatibility tests. Tests create
a unique random schema and drop only that schema.
Mail is captured only through an explicit dependency allowed when `NODE_ENV`
is `test`; production rejects that transport. No test emails are delivered.

For Neon, bundle `src/index.js` and dependencies as Node.js 24 ESM, providing
`createRequire` for CommonJS dependencies. Deploy a ZIP with `index.mjs` at its
root. Configure the static website with the observed production API URL after
testing exact-origin CORS and unauthorized requests. Keep the previous services
until real OTP delivery, legacy owner MFA, private case isolation and case
updates have passed on the replacement. A successful health response alone is
not an end-to-end activation test.

## Google citizen authentication

Google Identity Services uses the public Web Client ID, without a Client Secret.
The frontend requests `/auth/google/challenge` before initializing GIS, then uses
that server-generated nonce in Google's signed credential. The response contains
`challenge: {id, token, nonce, purpose: "google", expiresAt}`. The 43-character
flow token and nonce stay in the current page's memory. The callback supplies
`challengeId`, `flowToken`, `nonce` and `credential`, plus explicit consent for a
new account. The server accepts only its own unexpired pending challenge and
consumes it transactionally with the identity binding, replay fingerprint and
new application session. The application bearer is newly generated and expires
in 30 minutes; neither a Google ID token nor a pending flow token is a case API
session. Existing password/OTP session lifetimes are unchanged.

The verifier permits RS256 against a bounded HTTPS fetch of Google's fixed JWK
endpoint. Canonical base64url prevents alternate signature encodings from
bypassing fingerprint checks. It checks Google issuer, exact audience and `azp`
when present, finite integer timestamps, at-most-one-hour token lifetime, signed
nonce, verified email and stable Google subject. JWK refresh is throttled,
shared across concurrent requests and isolated per verifier. Injected key
fetchers exist only as an explicit test dependency and are rejected by a
production API configuration; tests still verify actual RSA signatures.

A nonempty `GOOGLE_ALLOWED_EMAILS` setting restricts Google exchanges to those normalized exact verified email addresses, in addition to all identity checks. Keep this private and use it for staging. An empty setting adds no server-side tester allowlist; do not infer Google Cloud audience restrictions from this flag. The owner denial applies even when the owner address appears on the list.

Only `sub` links an existing Google citizen. A matching password-account email
returns a conflict and never changes that account. The configured owner email
and all non-citizen bound roles are rejected by the Google route. No role is
accepted from a browser, and no owner MFA flag is set by Google authentication.
Google-only accounts cannot sign in with a password or acquire one through
email recovery. Recovery challenges remain generic; reset and pending password
OTP completion recheck the binding before issuing credentials. Recovery for a
Google-only identity must remain with Google. These guards also apply when the
Google feature flag is disabled. Once any Google identity exists, rollback must
retain this guarded bundle and identity tables; reverting to a pre-Google
password-recovery implementation could re-open this account-takeover path. A third-party address in a Google
profile is not a fresh proof of mailbox control for unrelated email delivery.

The Google health flags require both additive tables to be queryable. The
public `googleClientId` lets the interface reject a mismatched audience before
rendering the button. Feature flags never bypass cryptographic verification.

Maintenance is bounded and activity-driven: each new Google challenge removes
at most 100 Google anonymous flows expired for over one hour and at most 100
accepted-credential fingerprints older than two hours. Such credentials cannot
remain valid under the enforced token lifetime. No periodic worker is claimed.
Password flows, users, cases and enrolled MFA are untouched by this cleanup.
`LOGIN_RETENTION_DAYS` is a configuration value, not evidence of automatic login
record deletion; no login-history deletion worker is configured here.

Google authentication rejections emit only a random request reference and a
stable error category. Successful logins use the existing protected login
audit table. Raw ID tokens, OAuth secrets, nonce values and private identity
claims are never included in application error messages or logs.

Run `PORTAL_TEST_CONFIG=/private/local-pg.json REQUIRE_DB_TESTS=1 npm test`
against a disposable loopback database. Google unit and HTTP tests use ephemeral
RSA keys and injected Google-key responses; passing them is not evidence that
an approved human account completed Google's live popup. Record that live
acceptance separately before production release.
