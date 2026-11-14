# CYBER SURAKSHA 2.0 — citizen and owner portal

Independently architected, developed, authored and owned by **Jatoth Ramakrishna** for public cybersecurity awareness and independent digital-safety support. No institution, company, sponsor or government agency operates this project. This standalone application is prepared for the new repository https://github.com/rk-Hud/cybersuraksha2.0. All application and deployment files live at the repository root; earlier repositories and deployed services are separate.

The homepage combines the dark slate/emerald introduction, private browser tools, three languages, practical training and a collapsed 20-agency directory. Citizen services replaces the previous Security operations section. The supplied CS hexagon identity is used in the header and favicon.

## What the portal implements

Citizens register with a name, email and **new website password**, verify an email OTP, sign in with password plus OTP, submit a consented support case, read its status timeline and reply. Owner updates appear in the timeline and queue a reference/status email. Email contains a sign-in link, not the complaint text.

The configured owner email is `ramakrishnajatoth2007@gmail.com`. That address receives owner privileges only after mailbox verification; no default password or preverified account is installed. Administrative access also requires authenticator TOTP. The owner can view registered names/emails and login history, review and respond to cases, disable citizen accounts, and edit validated multilingual text, advisory, agency links and branding. Source code, hosting credentials and arbitrary server execution remain outside the content editor.

Case states are Pending → In review / Awaiting information → Resolved / Closed, with controlled reopening. Server-side record permissions, version checks, immutable case events, audit records, CSRF/origin checks, request limits and opaque session rotation protect account operations.

This is an independent support platform, **not a government complaint portal**. For real fraud, contact the bank and official reporting channels; in India, financial cyber-fraud victims can call **1930** and use https://cybercrime.gov.in/.

## Current readiness

Source and automated tests do not establish live email delivery. Configure an actual provider and verified sender privately before enabling accounts. No live OTP, complaint notification or reputation-provider connection is claimed by this documentation.

The prepared public Blueprint sets `PRIVATE_MODE=0` and `PUBLIC_REGISTRATION=1`, allowing public pages and citizen registration after the real service is configured. Administrator actions still require the configured owner identity and recent authenticator verification; complaint records remain private to the citizen and owner. To return temporarily to owner-only acceptance, set `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0`. Public access does not disable authorization, CSRF controls, rate limits or OTP verification.

## Configuration

Use Python 3.12 or a compatible supported version. Install:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

On Windows, use `.venv\Scripts\python.exe` instead. `.env.example` lists configuration names; the app does not load it automatically. Supply values through protected hosting environment settings or a trusted local environment loader. Never paste credentials into chat or include them in the source bundle, raw-code document or ownership dossier.

Required values are `ADMIN_EMAIL`, `DATABASE_URL`, `SECRET_KEY`, `OTP_HMAC_KEY`, `TOTP_ENCRYPTION_KEY`, and real mail settings. The three keys must be different cryptographically random strings of at least 32 characters. Store their backups in a password manager. Rotating session/OTP keys invalidates corresponding state; replacing the TOTP encryption key makes existing authenticator secrets unreadable.

Use a persistent PostgreSQL connection URL, preferably Render's internal URL in the same region as the web service. SQLite is accepted only in tests or explicitly enabled local development with HTTPS enforcement off. It is unsuitable for deployed accounts on an ephemeral filesystem.

For direct Render hosting, leave `PUBLIC_BASE_URL` unset to use Render's `RENDER_EXTERNAL_URL`. A custom value must be an exact HTTPS origin without a path, credentials, query, fragment or trailing slash. `PUBLIC_HOSTS` can specify the exact comma-separated accepted hostnames. Configure only the real proxy count: `TRUSTED_PROXY_HOPS=1` for the intended Render edge; direct local traffic uses zero.

Choose one actual mail provider:

| Provider | Required configuration |
| --- | --- |
| Resend | `MAIL_PROVIDER=resend`, verified `MAIL_FROM`, private `RESEND_API_KEY` |
| SMTP | `MAIL_PROVIDER=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SECURITY=starttls` or `ssl` |

SMTP requires certificate-verified TLS. Render free web services block outbound ports 25, 465 and 587; HTTPS-based Resend is suitable for free-plan testing after its sender/domain is configured. Do not use an email mailbox password as a citizen's website password. This portal does not sign users into Gmail or request their Gmail credentials.

Optional `SAFEBROWSING_API_KEY` enables explicit, prefix-only Google Safe Browsing evidence after provider setup and terms review. Without it, the widget stays hidden. An OpenAI API key does not provide this evidence and is not required for the local checker. See [docs/REPUTATION.md](docs/REPUTATION.md).

## Initialize and run

With the actual environment configured, run from this directory:

```sh
.venv/bin/flask --app 'app:create_app()' init-db
.venv/bin/gunicorn --config gunicorn.conf.py 'app:create_app()'
```

Clear Render's injected `GUNICORN_CMD_ARGS` when using the release's explicit Gunicorn configuration. Render runs `init-db` as the web service's pre-deploy command. Initialization creates the initial schema and editable content without creating an owner password. It is not a migration framework: future schema changes need reviewed database migrations and backups before rollout. Do not run an old release's initialization command against a different application's database.

Open `/en/register` (or `/hi/register`, `/te/register`) and register the configured owner email with a new password. Complete the actual emailed code, then enroll an authenticator through `/en/admin/mfa`. Keep the authenticator seed privately. Administrative operations require recent TOTP verification. There is no public fallback code or email-only owner-reset route for an enrolled authenticator.

The main account routes are `/en/login`, `/en/cases`, `/en/cases/new`, `/en/admin/login`, `/en/admin`, `/en/admin/users` and `/en/admin/content`; replace `en` with `hi` or `te` for the other languages. `/admin` redirects to the administrator sign-in page and `/service` to citizen cases. This web-admin release implements the owner's newer request and changes the earlier desktop-only management design.

Email updates use a persisted outbox. Run its dispatcher continuously under the deployed process configuration, or as a supervised worker:

```sh
.venv/bin/flask --app 'app:create_app()' dispatch-notifications --watch --interval 5
```

The dispatcher leases jobs, retries transient delivery failures, and uses provider idempotency support where available. SMTP delivery is at least once; a crash after provider acceptance can result in a duplicate email. Pending/failed deliveries remain visible in the owner's queue count. An in-app update commits independently of email delivery.

The prepared Render worker runs the dispatcher continuously. In watch mode it leases one message per iteration to bound shutdown latency, and prunes expired authentication state and login-history metadata at startup and hourly. If running without that worker, schedule pruning separately:

```sh
.venv/bin/flask --app 'app:create_app()' prune-security-state
```

`LOGIN_RETENTION_DAYS=30` controls login-history pruning, with supported values 1–365. The worker or command must actually run; setting the variable alone does not delete records. Case records and administrative audit events have no automatic deletion schedule in this release. Establish the owner's documented retention, access/export and deletion process before public intake.

## Render release

The prepared [render.yaml](render.yaml) targets workspace **RK**, region **Singapore**, using the `main` branch at the root of https://github.com/rk-Hud/cybersuraksha2.0. It leaves the earlier repository and services unchanged. Its new resources are:

| Resource | Name | Plan | Current base estimate |
| --- | --- | --- | --- |
| Web service | `cybersuraksha2.0` | `0.5c-512mb` | US$7/month |
| Notification worker | `cybersuraksha2-notifications` | `0.5c-512mb` | US$7/month |
| PostgreSQL | `cybersuraksha2-data` | `0.1c-256mb`, 1 GB storage | US$6/month plus approximately US$0.30/month storage |

The combined base estimate is **US$20.30/month**, before taxes, additional usage, email-provider charges and other services. Prices must be reconfirmed in Render's reviewed plan. Review the current Render resource plan and deployment result before applying it or claiming that the account service is live. This source does not itself prove resource creation.

The prepared Blueprint uses Resend over HTTPS, with `MAIL_FROM` and `RESEND_API_KEY` supplied privately through Render. This is a deployment choice, not evidence that the owner already has Resend configured. Complete provider setup and sender/domain verification first. To use authenticated SMTP instead, update the web mail settings and corresponding worker references deliberately; do not leave the two services using different providers or keys. Cryptographic keys are generated once for the web service and referenced by the worker, rather than independently generated for each process.

Free resources would be suitable only for temporary owner testing; they are not the prepared production resource plan. A free Render PostgreSQL database expires after 30 days and has no production backup guarantee. Free web services can suspend when idle, delaying outbox work, and share a workspace allowance. A durable public release needs the approved durable resource plan, backup/restore verification and real mail configuration. This document does not change hosting permissions or establish deployment status.

A static Sites deployment cannot execute Flask account routes. Link to or deliberately route requests to the configured Render backend; publish neither simulated login nor a fake successful OTP. Sites access controls protect the Sites origin, while the Render origin requires its own application controls. Use the exact URL returned by the deployment service. Public website access does not grant administrative or private-case access.

## Checker behavior and privacy

The local Scam Checker and Action Planner keep pasted input in browser memory. The checker distinguishes a finite recognized-domain reference from lookalike spelling, insecure HTTP, shortened destinations, credential demands and other explained signals. For example, `amazon.in` recognition does not authenticate an SMS, `arnazon.in` is a lookalike warning, HTTP receives a transport warning, and a short link's concealed destination remains unverified. The browser does not visit suspicious URLs.

Scores are heuristic warning indicators, not measured probabilities or proof of safety. No tool can know the current safety of every URL or reliably certify every message. New threats, compromised genuine domains and previously unseen scams can evade local rules. Optional reputation evidence remains a separate provider observation and never overrides local warnings.

Account registration and case submission intentionally send data to the server after consent; they have a different privacy boundary from local tools. Hosting and email providers may process ordinary connection metadata. Keep private content out of URLs and application access logs. See [SECURITY.md](SECURITY.md) for data and disclosure details.

## Verification

```sh
.venv/bin/python -m pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
node --test tests/checker.test.cjs tests/reputation.test.cjs
```

Mail and reputation tests use explicit test-only transports. They do not verify a real inbox, Google account, DNS or hosting configuration. PostgreSQL-specific concurrency checks require their separately documented, disposable local test database; do not point test tooling at a live account database. Browser interaction and live provider delivery require separate verification after actual configuration.

## Ownership and records

Copyright (c) 2026 Jatoth Ramakrishna. The original platform remains independently owned; third-party libraries retain their licenses and official-agency references imply no endorsement. See [humans.txt](humans.txt). No license grant for the original source is added by this release; third-party licenses continue to apply. Record release commit IDs, deployed URLs, file hashes and meaningful changes in the owner's project history. Keep actual passwords, API keys, OTPs and private certificates in a password manager, never in that history.

## Repository and deployment status

Target repository: https://github.com/rk-Hud/cybersuraksha2.0. The release workflow creates and publishes it separately; a URL written in this file is not proof that the repository or Render service exists. `docs/RELEASE_STATUS.json` records the prepared configuration. The retained automated-test reports describe source verification; they do not establish current cloud deployment or live provider delivery.

The local checker and account workflow do not call OpenAI. No OpenAI API-backed feature is enabled in this release. If an optional API-backed feature is added, keep its credentials in server-side private settings. An OpenAI credential does not provide email OTP delivery.

## Owner repository setup and Render activation

If the repository has not been created, open https://github.com/new, select owner `rk-Hud`, name the private repository `cybersuraksha2.0`, and create it empty. Do not add a remote README, license or ignore file when publishing this complete source tree. Then run these commands from the extracted project directory:

```sh
git init -b main
git add .
git commit -m "Publish CYBER SURAKSHA 2.0 citizen support platform"
git remote add origin https://github.com/rk-Hud/cybersuraksha2.0.git
git push -u origin main
```

These commands require a GitHub credential with effective permission to create/write the repository. Account ownership alone does not grant those permissions to every connected integration. If repository creation or push returns 403, update the selected integration/token permissions or use the owner's authenticated GitHub interface. Never place the token in these commands or committed configuration.

After `main` is successfully pushed, open the Render Blueprint setup link: https://dashboard.render.com/blueprint/new?repo=https://github.com/rk-Hud/cybersuraksha2.0. Select workspace **RK**, use the root `render.yaml`, and review the web service, worker and PostgreSQL costs before applying. Existing services are separate and must not be replaced inadvertently.

During private environment setup, enter the verified Resend sender as `MAIL_FROM` and the actual Resend credential as `RESEND_API_KEY`. The sender must be permitted to deliver to the intended citizen addresses; a provider's restricted test sender is insufficient for public registration. Let Render generate the three distinct cryptographic keys and wire the worker from the web service. Do not substitute a website password or a different provider's API key.

Wait for the web service and worker to report a successful deployment. Verify `/healthz`, the public three-language homepage, real owner mailbox registration/OTP, owner TOTP enrollment, a citizen support case and its private status/email update. Use only the exact URL returned by Render; the service name does not prove a URL is active. Connect the awareness website's account navigation after this verification.

The checked-in public flags do not disable authentication, OTP, administrator authorization, case ownership, CSRF or rate controls. If the verified email provider or PostgreSQL configuration is absent, startup intentionally fails instead of exposing non-working accounts.
