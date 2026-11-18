# Account service deployment status

Verified 18 November 2026, 08:29 IST. This record distinguishes deployed code from an activated email service.

| Feature | Current result |
| --- | --- |
| Public multilingual site | Live on GitHub Pages; English, Hindi and Telugu |
| Citizen account interface | Live on GitHub Pages and connected to the production account API |
| Registration and password/email-OTP login | Implemented and tested; public activation remains closed because production email sending is not configured |
| Email OTP verification | Five-minute challenges, attempt limits and flow binding tested; no claim of external inbox delivery |
| Private complaint submission | Protected API deployed; requires a verified signed-in citizen, so fresh public intake is not active yet |
| Complaint tracking database | Existing ten-table Neon database connected and preserved; case/history/reply/version workflows tested against disposable local PostgreSQL |
| Administrator dashboard | Interface and authorization deployed; replacement owner sign-in still needs email settings and the original MFA encryption key |
| Status notifications | Durable outbox and automatic post-response attempts implemented; real delivery depends on mail configuration, with protected manual retry |

Public website: https://rk-hud.github.io/cyber-suraksha-2.0/

Citizen interface: https://rk-hud.github.io/cyber-suraksha-2.0/en/account.html

Production API: https://br-holy-darkness-az8i1rma-csportalapi.compute.c-3.ap-southeast-1.aws.neon.tech/

Production health: https://br-holy-darkness-az8i1rma-csportalapi.compute.c-3.ap-southeast-1.aws.neon.tech/api/v1/health

## Deployment evidence

- Neon project: `frosty-band-01793215`; production branch: `br-holy-darkness-az8i1rma`.
- Function: `csportalapi`, Node.js 24, deployment **1**, completed 18 November 2026.
- Bundle SHA-256: `d798d39749e2d23d3ff3d700a8f02aae07a422ff5347a2c21195728c3a8b9e2e`.
- Production health returned HTTP 200 and database status `ok`.
- Unauthenticated case and administrator requests returned 401. A foreign browser origin returned 403. The exact GitHub Pages origin passed CORS preflight.
- Observed readiness: registration `false`, email OTP `false`, authorized complaint API `true`, replacement administrator readiness `false`.
- Existing database records were preserved. Deployment did not seed users, reset passwords, replace MFA or create citizen cases.

## Verification

The new API passed **43 tests with zero skips**, including bidirectional Python password/Fernet compatibility, OTP/replay/expiry, private case ownership, role and recent MFA checks, password-reset races, concurrent version checks and notification failures. The frontend passed **69 Node tests** and **4 Python build tests**. Chromium checks covered all three languages at 390, 768 and 1440 pixels. These are bounded checks of this implementation, not a claim of universal security certification.

## Published revision and hosted checks

- Source revision: [`d8d2c09`](https://github.com/rk-Hud/cyber-suraksha-2.0/commit/d8d2c0990868fc887c0f3c67b29e674d6b24b9e1).
- Pages revision: [`04e62cf`](https://github.com/rk-Hud/cyber-suraksha-2.0/commit/04e62cf398da09d1243d31db7e7fa68d8b858683).
- [Account API and Pages CI](https://github.com/rk-Hud/cyber-suraksha-2.0/actions/runs/44227506271): successful fresh-checkout install, disposable PostgreSQL tests and Pages checks.
- [Pages deployment](https://github.com/rk-Hud/cyber-suraksha-2.0/actions/runs/44227572078): successful.
- All three published account pages and account JavaScript returned HTTP 200 and matched the compiled release. Real browser checks passed for all three languages, including exact CORS and disabled email-dependent forms.
- The live checker displayed the HTTP warning. Exercising the checker, planner, quiz and assistant produced no network requests containing tool input.
- Gitleaks scanned the new source change and published Pages change: no findings. This is a bounded secret scan, not a guarantee that every future change is safe.

## Required private configuration

Resend currently has **no sending domain**. The supplied `rk-hud.github.io` URL cannot be verified because GitHub controls its DNS. An actual DNS-controlled registered domain, verified sender and private sending key are needed. The original owner `TOTP_ENCRYPTION_KEY` must also be copied privately from Render to preserve enrolled MFA.

Follow the [operator guide](ACCOUNT_SERVICE_OPERATIONS.md). Keep registration closed until actual mailbox delivery and existing owner MFA succeed. No fixed OTP, shared test sender or authentication bypass has been enabled.

The existing Render services are retained for continuity. Their eventual removal is deferred until replacement end-to-end sign-in, private case access and administration work; deleting them now would not configure email.

CYBER SURAKSHA 2.0 is independently architected, developed, authored and owned by Jatoth Ramakrishna. It is not a government complaint portal.
