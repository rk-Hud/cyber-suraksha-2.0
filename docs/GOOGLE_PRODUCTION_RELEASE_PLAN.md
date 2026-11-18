# Google citizen sign-in: production maintenance and release plan

Prepared 18 November 2026 from read-only provider metadata and the reviewed source. CYBER SURAKSHA 2.0 is independently architected, developed, authored and owned by Jatoth Ramakrishna.

**Approval boundary:** only the staging password reset and staging operations are approved. Production credential rotation, backup creation, schema migration, API deployment and public Google activation have not been approved or performed by this review. This document is a reviewable execution plan, not a release receipt.

## Observed production state

| Component | Verified state | Required handling |
| --- | --- | --- |
| Neon project `frosty-band-01793215` | Organization plan `free`; region `aws-ap-southeast-1`; PostgreSQL 17 | Keep the existing project and database. Do not upgrade or enable paid features implicitly. |
| Production branch `br-holy-darkness-az8i1rma` (`main`) | Ready, default/root branch | Production maintenance targets only this branch after separate approval. |
| Database `cybersuraksha` | Owner role `cs_owner_pilot`; role metadata unchanged by the staging reset | Privately refresh every production credential consumer during approved rotation. |
| Function `csportalapi` | Active deployment **1**, Node.js 24; no explicit `DATABASE_URL` override | Neon injects the branch-managed database credential. Existing isolates/pools still need verified reconnection or a controlled fresh deployment. |
| Google identity migration | Neither Google table is present in production metadata | Apply only the reviewed additive migration after backup and approval. No production citizen records were queried. |
| Restore history | `history_retention_seconds=21600`, or **six hours** | Do not describe this as a 24-hour or seven-day recovery window. |
| Snapshots | No project snapshots; production schedule empty | A durable pre-change recovery checkpoint and restore verification remain outstanding. |

Production API: https://br-holy-darkness-az8i1rma-csportalapi.compute.c-3.ap-southeast-1.aws.neon.tech/

Public website: https://rk-hud.github.io/cyber-suraksha-2.0/en/

Citizen page: https://rk-hud.github.io/cyber-suraksha-2.0/en/account.html

## Dependency inventory

| Consumer | Observed identifier/configuration | Rotation dependency |
| --- | --- | --- |
| Neon account API | `csportalapi` on production branch | Preserve existing session/OTP keys and owner MFA encryption key. Do not introduce a database-URL override. Obtain a fresh runtime and verify managed authentication after reset. |
| Render owner portal | `srv-dbs4lbs9v7es73bm7o0g`, branch `release/free-owner-pilot-20261114`, root `deploy/citizen-owner-portal` | Source requires private `DATABASE_URL`. Privately verify its deployed target before resetting the role. Update only that variable through a merge operation and deploy/reconnect; preserve all unrelated secrets and current owner MFA. |
| Earlier Render awareness site | `srv-dbrtdm3rjlhs73chgnag`, branch `main` | Checked-in app uses SQLite `CS20_DB_PATH`; no Neon dependency was found in source. Private deployed configuration has not been inspected, so confirm there is no additional integration. Retain this service. |
| Earlier API migration branch | `br-orange-wind-azw67o4d` (`pages-api-migration-20261117`), Function `csportalapi` deployment **2**, managed database injection | Branch-specific credential maintenance is outstanding. The approved Google-staging reset does not authorize changing this branch. Review its retained dependencies and obtain explicit scope before a reset or service change. |
| Operator clients and private CI settings | Not completely inventoried | Identify copied credentials privately; do not publish exports, connection strings or environment values. All three currently listed database branches were inventoried; branch resets remain independent. |

Both Render services remain running. Removal is a later operation after every remaining dependency has been verified and migrated.

## Recovery preparation before production maintenance

1. Record the exact current Function deployment, reviewed bundle hash, private environment inventory and Pages commit. Retain the previous static assets and tested API bundle without publishing secret-bearing files.
2. Confirm the production credential consumers and their private update paths. A rollback must never restore the compromised password.
3. Obtain approval for the selected backup method and any cost. Current official limits allow **one manual snapshot on Free** and no scheduled snapshots. Snapshot documentation separately describes storage billing; a count allowance is not a verified zero-cost storage guarantee. There are currently no snapshots consuming that manual slot.
4. Prefer a private provider-side snapshot of the production root branch immediately before maintenance. Confirm successful creation, timestamp, expiry and restore access. The six-hour history window is useful additional protection, not proof that an independent backup or restore test exists.
5. If an encrypted logical backup is selected instead, use a direct connection and an owner-controlled private destination, with encryption and restore credentials managed separately. Never put a dump in GitHub, Pages, logs or a shared document. No production dump has been created during staging work.
6. A restore drill requires separate approval and a private recovery branch with no public Function. It must not import production data into `google-signin-staging`. Verify restoration and preserve a sanitized receipt before allowing real citizen intake.

A pre-maintenance snapshot/export may contain older authentication or role state. After any later restore, re-verify the uncompromised database credential and owner MFA before restoring traffic. Do not assume a data restore also preserves every later credential change.

## Approval A: coordinated production credential maintenance

Request explicit approval naming `cs_owner_pilot` on `br-holy-darkness-az8i1rma`, the expected connection interruption, the dependent Render secret update and the controlled Function reconnection/deployment. This approval does **not** authorize Google activation or schema migration.

After approval:

1. Verify the private recovery checkpoint and target branch/database once more. Preserve the exact existing owner `TOTP_ENCRYPTION_KEY`; do not generate a replacement for an enrolled owner.
2. Reset the production role through the branch-scoped provider operation. Keep the replacement only in provider/private execution memory and wait for apply completion. Existing connections are disconnected.
3. Update the confirmed Render owner's private database setting with the new credential, preserving all other environment entries, and deploy it promptly.
4. Verify the existing Neon Function authenticates with current managed injection in a fresh runtime. If a deployment is needed, use the exact current production bundle during this credential-only phase, without activating Google. Do not assume an existing `process.env` or `pg` pool hot-refreshes its password.
5. Check production health, anonymous case/admin rejection, and owner password/email/TOTP access with the owner. Record only status and request references. If email delivery is unavailable, record that as a blocked acceptance check rather than bypassing it.
6. Privately update any additional identified consumers. Do not undo the reset to recover service; repair the consumer configuration or deploy the preserved compatible application code while retaining the new credential.

The earlier API migration branch needs its own approved remediation. Production rotation alone does not rotate another branch's role. Do not delete its Function, branch or records to avoid performing the dependency review.

If Google identities have already been created by the time maintenance occurs, use the reviewed Google-aware bundle with flags disabled rather than the original pre-Google bundle. The recovery guards described below remain required.

## Approval B: production Google migration and release

Prerequisites are successful genuine staging Google login with approved non-owner citizen accounts, complaint isolation, independent security/MFA regressions, verified credential remediation and private restore preparation. Keep the Google OAuth audience in Testing until the owner separately approves broader availability.

The reviewed migration is [002-google-citizen-auth.sql](../services/account-api/sql/002-google-citizen-auth.sql), SHA-256:

`001d81ddfb467a4b37d45cdbb647d2fee296a2111ea0416c7e65a6ee0d9b8847`

It adds two tables, their primary/unique/foreign-key constraints and a replay-date index. It does not alter existing users, passwords, roles, MFA secrets, complaints or case events. The isolated staging migration has already been verified; do not recreate it or import production records to test sign-in.

After explicit release approval:

1. Make and verify the authorized pre-change recovery checkpoint. Check the intended production database and schema metadata using a direct connection. Apply **only migration 002** in a transaction with bounded lock/statement timeouts; do not run an unrelated initialization/seed routine against production. Verify the tables and constraints before deploying Google code.
2. Deploy the exact reviewed Node.js 24 account bundle to production `csportalapi`, initially with `GOOGLE_SIGNIN_ENABLED=0` and `GOOGLE_REGISTRATION_ENABLED=0`. Preserve existing session/OTP/MFA secrets. Neon continues injecting `DATABASE_URL`.
3. Set the real public `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS=https://rk-hud.github.io` and `PUBLIC_WEB_URL=https://rk-hud.github.io/cyber-suraksha-2.0/`. Use a private approved-test-account `GOOGLE_ALLOWED_EMAILS` list during restricted acceptance. Keep `REGISTRATION_ENABLED=0` and `EMAIL_READY=0` until the independent email/password service is operational.
4. Confirm HTTPS health, additive-schema readiness, exact-origin CORS, safe errors and rejection of anonymous case/admin requests. Enable Google sign-in, then controlled Google registration only under the approved acceptance scope.
5. Build the tested Pages source with the **production** API URL and unchanged website base path. Publish the reviewed assets to `gh-pages` `/docs`. Never substitute the isolated staging API in the ordinary citizen page. Verify all three languages, actual assets, privacy/terms pages and the current Google SDK/CSP compatibility.
6. Have approved citizen A perform genuine Google authorization and enter their fictional case workspace. Have approved citizen B attempt direct access to A's case, and verify refusal. Check logout, expiry and revoked sessions. A Google ID token must not authorize a case API directly.
7. Verify the owner cannot use the citizen Google route and that privileged owner operations still require recent TOTP. Preserve audit logging, profile confidentiality and complaint ownership.
8. Monitor sanitized authentication categories, request references, readiness and provider failures. Never log complete ID tokens, application bearers, codes, secrets or complaint bodies. Broader public registration requires its own approval after these results are recorded.

## Rollback

Prefer a feature rollback: disable Google registration and sign-in while retaining the reviewed Google-aware API, identity tables and all user/case data. Google-only citizens will temporarily be unable to sign in; do not offer a website-password bypass.

**After Google identities exist, do not restore the original pre-Google API bundle.** It lacks the Google-only password-recovery protections. Any replacement bundle must retain those guards even with Google flags disabled. Never remove the identity tables or match accounts by email to make rollback easier.

Static assets can return to the preceding verified Pages revision while the guarded API remains deployed. Data restoration or snapshot finalization is a separate destructive production decision requiring explicit approval; it may discard records written after the checkpoint. Preserve the newest records and incident evidence before that decision. Re-verify current role credentials and encrypted owner MFA after restoration.

## Evidence and remaining gates

This plan was prepared through provider metadata and source inspection only. No production password reset, snapshot, dump, migration, deployment, activation, data restore or service deletion was performed. Actual production restore/backup verification and genuine Google acceptance remain required release evidence.

Current official references verified:

- [Neon pricing and plan limits](https://neon.com/pricing.md).
- [Backup strategies](https://neon.com/docs/postgres/backup-restore/backups.md).
- [History window](https://neon.com/docs/postgres/backup-restore/history-window.md).
- [Snapshot limits and root-branch behavior](https://neon.com/docs/ai/ai-database-versioning.md).
- [Function environment injection and overrides](https://neon.com/docs/compute/functions/environment-variables.md).
- [Branch-scoped role management](https://neon.com/docs/manage/roles.md).
