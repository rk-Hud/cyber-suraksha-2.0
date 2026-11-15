> **HISTORICAL R2 PILOT NOTES (NOVEMBER 2026).** These steps are retained for release traceability. Confirm the current Render service and environment settings separately. See [owner access review](../../docs/OWNER_PORTAL_ACCESS_REVIEW.md), [release readiness](../../docs/RELEASE_READINESS.md) and [current architecture](../../docs/ARCHITECTURE.md). Do not use these historical steps to enable public registration.

# CYBER SURAKSHA 2.0 — Free Owner-Only Pilot — R2

## R2 PowerShell publication fix

R1 had a Windows PowerShell case-insensitive variable collision: `$Target` clone directory vs `$target` destination file. This R2 package renames the local destination to `$DestinationFile` and the portal directory to `$PortalDirectory`. All eight pilot patch bytes and their SHA-256 manifest values are unchanged. A failed R1 local clone does not have to be deleted. R2 creates a fresh uniquely named clone; it never overwrites an existing review branch, never changes main, and does not create or deploy cloud resources.

## Purpose

Create a separate HTTPS Flask owner-only pilot without paid hosting or a paid worker. Keep the Unified Public awareness application untouched. **Not appropriate for collecting real cybercrime reports or personal citizen data yet.**

## Existing branch and source

Base: `release/citizen-owner-portal-20261114`, with the 60 verified original files in `deploy/citizen-owner-portal/`.
New branch: `release/free-owner-pilot-20261114`.
Five original source files change, a separate Blueprint and a test are added, and the 60-source-file manifest is updated. The original `render-portal.yaml` remains intact. The original SHA manifest is preserved as *historical baseline*. New modified-file hashes are in `PILOT_PATCH_MANIFEST.json`.

## Architecture at $0 list-price (quotas apply)

- Render Free web service, Singapore, 512MB. Shares 750 free instance-hours with other free services in workspace RK; spins down after 15 minutes of inactivity; can have slow wake-up. Free storage is ephemeral. Do not create local SQLite or use uploaded files for durable state.
- Neon Free persistent Postgres (manually provisioned, separate provider); create a **dedicated** project and store the pooled TLS-enabled `DATABASE_URL` as a secret in Render.
- Resend HTTPS email API, using a verified sender domain and the exact sender mailbox; `MAIL_FROM` and `RESEND_API_KEY` are manually entered secrets. Default test sender may only work with authorized test recipients.
- No background worker. The owner uses `/en/admin` > manual send form, which after MFA sends at most one due case-update message per click. OTP mail remains request-time as before. Failed/unsent queued notifications remain in PostgreSQL for retry. **Case notifications are not automatic.**

## Before deployment

1. Connect to the private GitHub source, and publish the pilot patch to a **new review branch** with the supplied PowerShell script. Do not touch `main`.
2. On Neon Free, create a dedicated Postgres project; copy its connection URL into a private Render setting, never a GitHub file/chat. Use SSL-required connection (Neon's standard URL) and verify connectivity. Enable trusted security controls and take encrypted offline database backups manually.
3. Verify a sending domain with Resend and prepare `MAIL_FROM`, `RESEND_API_KEY`. Do not send credentials in ChatGPT, screenshots, PRs or shell history. If you do not have a verified sender, keep the service undeployed or test only with approved test recipients.
4. Render > New Blueprint, GitHub repository `rk-Hud/cyber-suraksha-2.0`, branch `release/free-owner-pilot-20261114`, path `deploy/citizen-owner-portal/render-free-pilot.yaml`, create new resources (do not adopt). Review plan: **exactly one web service, plan Free, no workers, no Render databases**. Auto-sync remains OFF.
5. Enter the private database and mail configuration during first sync. Confirm Render is not asking you to accept a paid plan, and that resources are priced $0. A payment card could still be requested by providers for account verification; stop if your cost requirement is strict and it is required.
6. Service boot runs `init-db` to bootstrap an **empty** dedicated database and then starts gunicorn. This is acceptable only for this private pilot. Production needs migrations, schema versioning, security audit, data retention, reliable jobs and backups.
7. Verify the live `/healthz` returns 200; verify the public register page does NOT enable signups. Sign up only with `ADMIN_EMAIL` and a NEW password, obtain email OTP, activate authenticator TOTP and verify on `/en/admin/mfa`.
8. Test admin dashboard from phone and laptop browsers over HTTPS, logout, csrf, wrong OTP, duplicate OTP, rate limiting, and owner authorization. Manually generate a **synthetic** case to test the notification queue and click Send one queued email after MFA.
9. Keep the awareness site's `/service-status.html` unchanged. Do not enable `PUBLIC_REGISTRATION` or disable `PRIVATE_MODE` until the system passes independent security verification and durable backup/restore tests.

## Security and operational limits

- No bypass or hardcoded admin credentials. Session, OTP and TOTP secrets must be unique 32+ character server-side values, stored in Render, not in the repo.
- Free services can be suspended; on Render Free, port 587 SMTP cannot be used; use the existing Resend HTTPS API.
- Resend may require a DNS-verified domain to email arbitrary recipients. The owner mailbox must be controlled and consent obtained.
- The owner-only manual notification action uses server-side CSRF, owner role and recent 10-minute TOTP, a rate limit, and dispatches at most **one** queued message per click.
- Queue entries are stored in Neon, not in local files. There is no 24/7 delivery guarantee. Monitoring and backup are the owner's responsibility.
- No real complaint intake is authorized during this private pilot; users needing urgent assistance should use official Indian reporting channels.

## Current status (do not overclaim)

CODE_PATCH_BUILT=yes; SOURCE_BASELINE_HASHES=60/60; SYNTAX_CHECK=pass; NODE_TESTS=run separately; PYTHON_INTEGRATION=must run; LIVE_EMAIL_OTP=not tested; NEON_PROVISIONED=not by this package; RENDER_PILOT_DEPLOYED=no; OWNER_MFA_ENROLLED=no; PUBLIC_REGISTRATION=no.
