> **ARCHIVED R3 DEPLOYMENT PACKAGE.** The repository names, branch, file layout, dates and test evidence below record an earlier release package. For current instructions use [deployment overview](../../DEPLOYMENT.md), [private pilot](README_FREE_OWNER_PILOT.md), and [release readiness](../../docs/RELEASE_READINESS.md). Historical claims below are retained as originally recorded.

# R3 PowerShell manifest fix

This package has the same 60 source files and SHA-256 manifest as the prior package. Only the PowerShell publisher's JSON-array conversion was fixed to work with Windows PowerShell 5.1. The publisher creates a review branch ONLY; no deployment is performed.

# CYBER SURAKSHA 2.0 — Citizen + Owner Portal Deployment (Review Package)

Prepared on 14 November 2026. This package **does not activate any website**, change the live awareness `main` branch, delete GitHub repositories or create chargeable infrastructure. It is an isolated, verified source release to be reviewed before publishing and deployment.

## What is implemented in the recovered source

- `/en/register`, `/hi/register`, `/te/register`: account creation and real email OTP verification
- `/en/login`: password plus new email OTP
- `/en/cases`, `/en/cases/new`: each citizen's private support cases
- `/en/admin/login`, `/en/admin`: owner-only admin portal, including recent authenticator TOTP
- `/en/admin/users`: user controls and recorded sign-in events
- `/en/admin/content`: validated multilingual public content editor
- Status workflow, case comments, audit events and queued email notifications dispatched by a worker

Not a government reporting website. Victims of active financial fraud in India should contact their bank, call 1930 and use cybercrime.gov.in.

## Authenticity and tests

These 60 original source files were reconstructed from the owner's `CYBER SURAKSHA 2.0 — Current Project Record and Complete Source.docx` (prepared Nov 13, 2026). Their individual SHA-256 hashes match the hashes in that document. All 14 Python files passed syntax-only checks, and 50/50 JavaScript tests passed. Python integration tests were recorded in the project document as 59 passed, but could not be rerun here because package installation was unavailable. This is not evidence of live provider delivery or production readiness.

## Safe publication into your existing ONE private repository

1. Download and unzip this complete review package locally. Read this file, `portal_source/SECURITY.md` and `portal_source/render-portal.yaml`.
2. In Windows PowerShell run from this folder: `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\PUBLISH_PORTAL_REVIEW_BRANCH_WINDOWS.ps1 -Mode Plan`. Windows may require unblocking this specific downloaded script after verification and review.
3. Only after Plan passes and you approve, run the same script with `-Mode Publish`. Enter the explicit confirmation. This creates `release/citizen-owner-portal-20261114` in `rk-Hud/cyber-suraksha-2-0-unified`, adding the source at `deploy/citizen-owner-portal/`. It NEVER merges to or changes `main` and NEVER deploys anything.
4. Use Render workspace `RK`, **New Blueprint**, repository `rk-Hud/cyber-suraksha-2-0-unified`, branch `release/citizen-owner-portal-20261114`, Blueprint YAML path `deploy/citizen-owner-portal/render-portal.yaml`. First review a PLAN and its full expected bills and instance/disk counts. It creates a separate web service, a notification worker, and PostgreSQL in Singapore; the existing `cyber-suraksha-2-0-unified-public` service must stay untouched. Render must have GitHub access to the private repository. Never adopt/replace the existing awareness Blueprint resources.
5. This sample Blueprint proposes two paid 512 MB services and one paid PostgreSQL database with 1 GB storage. **Expected baseline about US$20.30/month**, subject to Render's current plan and taxes. Do not approve paid resource creation without accepting that cost. Render Free PostgreSQL expires after 30 days with no backups; never store real citizen cases there.
6. Verify an actual email sender/domain with Resend first. During Render's *initial* Blueprint approval, enter `MAIL_FROM` and `RESEND_API_KEY` privately. Never paste these into GitHub, scripts, issue comments or ChatGPT. Render generates independent cryptographic keys for login, OTP and owner TOTP.
7. The initial configuration deliberately uses `PUBLIC_REGISTRATION=0` but allows the exact configured owner mailbox to register. After web and worker are live, the owner visits the portal's **actual** Render HTTPS URL + `/en/register`, signs up using a NEW website password, verifies emailed OTP, and enrolls authenticator at `/en/admin/mfa`. Admin login URL is actual portal HTTPS URL + `/en/admin/login`. These pages work from any modern phone or laptop browser once deployed and verified; there is **no universal admin password**.
8. Test an ordinary citizen account using a separately controlled mailbox, duplicate OTP, cross-user case authorization, case-update notification received, MFA reauthentication, and admin logout. Ensure sensitive information does not appear in logs, emails or public routes. Obtain independent security review, retention policy, backups and incident response controls before opening real citizen submissions.
9. After verified tests, change the portal Blueprint `PUBLIC_REGISTRATION` to `'1'` on the reviewed release branch and approve a new sync; then check that registration functions as expected. Only then update the existing awareness site's navigation from `/service-status.html` to the new portal's registered URL via a reviewed, separately tested pull request into `main`. Do not delete the old status page until the website is truly active.

## Explicit status

`SOURCE_RECOVERED` yes; `RUNTIME_NODE_TESTS` 50 passed; `PYTHON_SYNTAX` passed; `PYTHON_INTEGRATION_TESTS_IN_THIS_ENVIRONMENT` not run; `PORTAL_SOURCE_PUSHED` no; `PAID_RENDER_RESOURCES_CREATED` no; `DATABASE_PROVISIONED` no; `REAL_EMAIL_DELIVERY_TESTED` no; `OWNER_MFA_ENROLLED` no; `PUBLIC_REGISTRATION_ENABLED` no; `AWARENESS_NAVIGATION_CONNECTED` no.

Actual admin URL after deployment (replace `<actual-portal-host>`): `https://<actual-portal-host>/en/admin/login`; owner dashboard `/en/admin`. Avoid guessing the Render service URL before it has been created.
