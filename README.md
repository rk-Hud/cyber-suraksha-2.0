# CYBER SURAKSHA 2.0

Independent cybersecurity awareness and private support, architected, developed, authored and owned by **Jatoth Ramakrishna**. This project has no institutional partner, corporate sponsor, government endorsement or external funding.

**Website:** [rk-hud.github.io/cyber-suraksha-2.0](https://rk-hud.github.io/cyber-suraksha-2.0/) · [Citizen services](https://rk-hud.github.io/cyber-suraksha-2.0/en/account.html) · [Deployment status](docs/ACCOUNT_SERVICE_STATUS.md)

English, Hindi and Telugu pages provide fraud-awareness exercises, a warning-sign checker, an action planner and twenty official resource links. The checker and planner work locally in browser memory. Account forms use a separate authenticated API; account details and submitted support cases are stored privately on the service.

## Source map

| Component | Source | Hosting |
| --- | --- | --- |
| Multilingual website and account interface | [web/pages](web/pages/) | GitHub Pages |
| Authentication, private cases and owner authorization | [services/account-api](services/account-api/) | Neon Function, Node.js 24 |
| Accounts, case history, notifications and audit records | [Schema](services/account-api/sql/001-existing-portal.sql) | Neon PostgreSQL |
| Previous owner portal | [deploy/citizen-owner-portal](deploy/citizen-owner-portal/) | Existing Render service, retained during migration |
| Earlier applications | [deploy](deploy/), [upgrades](upgrades/), [app.py](app.py) | Historical reference; deployment-specific instructions apply |

## Accounts and administration

The account service implements password plus email OTP, password recovery, private complaint submission, case timelines and replies. The owner dashboard requires the configured owner identity and a recent authenticator code before viewing user records, changing cases or editing content. Passwords, OTPs and signing keys are never shown in the dashboard.

Deployment and activation are separate: **public registration stays closed while email sending is unconfigured**. The [status record](docs/ACCOUNT_SERVICE_STATUS.md) states what is deployed and what needs private configuration. No email is presented as sent when a provider rejected it. Existing owner MFA is preserved during migration.

See the [operator guide](docs/ACCOUNT_SERVICE_OPERATIONS.md), [API contract](services/account-api/API.md), [security policy](SECURITY.md) and [verification workflow](.github/workflows/account-services.yml).

## Local verification

Run `npm ci`, `npm run check`, `npm test` and `npm run build` inside `services/account-api`. Database tests need an explicitly configured disposable PostgreSQL database; CI requires them rather than silently accepting skipped checks.

Inside `web/pages`, install `requirements-build.txt` with Python, run `npm ci`, then `npm test`, `npm run build` and `npm run verify`. Publish only the generated static output to Pages. Never publish credentials, database URLs, account exports or complaint records.

## Service boundary

Support requests go to the independent project owner. They are not police complaints and do not guarantee investigation or recovery. In India, report real cybercrime through [cybercrime.gov.in](https://cybercrime.gov.in/), contact your bank about financial fraud, and call **1930**.

A warning score is a prompt to verify, not a probability of fraud or a safety certificate. The checker cannot know every safe or malicious URL worldwide. Pasted links are not opened.

Copyright © 2026 Jatoth Ramakrishna. The [MIT License](LICENSE) governs software reuse. Third-party dependencies and media retain their own licenses. [Copyright preparation](docs/COPYRIGHT_REGISTRATION_PREPARATION.md) records the evidence needed for legal declarations.
