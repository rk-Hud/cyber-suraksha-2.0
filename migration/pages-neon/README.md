# CYBER SURAKSHA 2.0 — GitHub Pages + Neon migration (STAGING ONLY)

**Status: source implementation branch; NOT a working live production release.** Nothing in this directory is automatically published by the existing GitHub Pages site. Do not delete either Render deployment based on the presence of this code.

## Eight feature acceptance matrix

| Requested capability | Source | Current state |
| --- | --- | --- |
| 1. Public website and multilingual pages (English, Hindi, Telugu) | Existing `gh-pages/docs/{en,hi,te}/` | Already served as static pages; live browser recheck required |
| 2. Fraud awareness and quizzes | Existing `gh-pages/docs/` | Static browser implementation exists; regression test required |
| 3. Client-side scam checker | Existing `gh-pages/docs/static/js/scam_checker.js` | On-device implementation exists; regression test required |
| 4. Citizen registration and login | `web/src/main.js` | Source integrated with Neon Auth SDK; provider not enabled; not deployed |
| 5. Email OTP verification | `web/src/main.js` via Neon Auth email OTP | Source implemented; OTP plugin / delivery not provisioned or tested |
| 6. Private support-case submission | `api/index.js`, `schema.sql` | Authenticated server API source; synthetic-only gated; no live deployment |
| 7. Complaint tracking database | `schema.sql`, `api/index.js` | Separate scoped tables and API; migration not applied |
| 8. Secure administrator dashboard | `web/src/main.js`, `api/index.js` | Server-side allowlist enforcement in source; production MFA and independent audit still required |

The public portal is independent, not a government or police reporting authority. Call 1930 in India for urgent financial cyber fraud and use https://cybercrime.gov.in/ for official complaint reporting. Do not collect real victim information before completing privacy, security, retention, consent, breach response and legal review.

## Architecture

- Keep the static awareness and multilingual content on GitHub Pages. The published site uses branch `gh-pages`, `/docs` directory, and base path `/cyber-suraksha-2.0/`.
- Build the separate citizen UI from `web/` with Vite. Its output target is `/cyber-suraksha-2.0/citizen/`; publish to `gh-pages/docs/citizen/` only after end-to-end tests.
- Provision Managed Better Auth **on a dedicated staging Neon branch**, with email-password, verification-required signup and email OTP settings. Existing `portal_users` and `portal_sessions` on the owner's database are separate and must not be casually replaced or dropped.
- Use a dedicated Neon Function for HTTPS endpoints, with short-lived EdDSA JWT verification, exact origin CORS, case ownership checks and admin allowlist. Keep `DATABASE_URL`, config and any private keys server-side only.
- Apply `schema.sql` on a selected staging database after verifying the selected Neon branch and backup. Never run migrations blindly against production.
- For email, Managed Auth can issue OTP using its own configured email provider. Configure a verified sending domain / SMTP for production; Resend may be used for custom SMTP or transactional notification emails, but is not needed just to build a login UI.

## Release gates

1. Audit current Render application data, accounts, admin roles and retention before designing migration. Existing password hashes cannot be assumed compatible with Neon Auth.
2. Provision a new staging Neon branch and enable Managed Auth there, not on the existing live owner identity blindly. Check legitimate project ownership, region and branch first.
3. Configure the exact GitHub Pages origin as an auth trusted domain and exact Function CORS_ORIGIN. Use the actual Neon-managed Auth URL from the branch, never guessed URLs.
4. Set `requireEmailVerification` or equivalent server setting and enable the email OTP plugin. Test signup, login, wrong credentials, signout, session renewal, expired/reused OTP and invalid email; verify deliverability.
5. Deploy Function with `DATABASE_URL` (Neon-injected), `NEON_AUTH_BASE_URL` (Neon-injected), `NEON_AUTH_JWKS_URL` (Neon-injected) and `CORS_ORIGIN=https://rk-hud.github.io`. Set `ALLOW_TEST_CASES=1` on isolated staging **only**. Do NOT expose real complaints.
6. Set API URL and Auth URL in `web/.env.local` (public browser configuration only). Build with `npm ci` after generating and committing a lockfile, then `npm run build`. The built `dist` files are static public assets, never secrets.
7. Test anonymous and wrong-user case access (401/404), owner isolation, unauthorized admin (403), rate limits, auditing, concurrent writes and rollback. Confirm admin account protected by a verified MFA policy before any live admin operation.
8. Complete independent penetration/security testing, access review, backup/restore drills, records policy, data protection review, monitoring, CSRF/session review, uptime/abuse controls, email reliability, and deployment rollback.
9. Stage a canary rollout; only then change the public website's inactive citizen-service links and suitable CSP connect-src allowlist. Keep old URLs active during cutover.
10. Once there are **no remaining Render API, login, or data dependencies**, export and verify backups; redirect URLs; monitor the replacement; then separately delete the public Render service and the owner Render service.

## Files

- `schema.sql`: dedicated migration tables, no change to old `portal_*` tables.
- `api/index.js`: staging REST API for health, identity, synthetic case submission, own case tracking and admin case listing/status actions.
- `api/package.json`: Node/Hono/Postgres/Jose dependencies.
- `web/`: Vite/Neon Auth browser UI, purposefully not published.
- `web/.env.example`: URL placeholders only.

**Important:** The sample API exposes an admin case queue when allowlisted, but there is currently **no server-verified admin MFA in this new design**. Thus it is not production-approved. Use the existing owner-only MFA pilot until this is implemented, independently tested and signed off. The backend deliberately does not handle attachments, evidence uploads, sensitive victim records or actual police reporting. Its per-user hourly counting is only an initial safeguard, not robust anti-abuse protection. Do not remove feature gates before comprehensive review.

## Verification evidence (current)

- GitHub branch created: `feature/pages-neon-eight-services-20261117`.
- Source modules committed: yes.
- Local `npm install`, `npm run build`, API tests: **not executed**.
- Neon Auth provisioned: **no**.
- Neon Function deployed: **no**.
- Schema deployed: **no**.
- SMTP domain verified: **no Resend sending domain found during connected account review**.
- Verified live registration, login, OTP, case tracking or admin access: **no**.
- Render services deleted: **no**.
