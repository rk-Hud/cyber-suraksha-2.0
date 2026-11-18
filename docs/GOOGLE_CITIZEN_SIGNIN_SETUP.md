# Google citizen sign-in: setup and release boundaries

CYBER SURAKSHA 2.0 is independently architected, developed, authored and owned by Jatoth Ramakrishna. The website stays on GitHub Pages and the authenticated API stays on Neon. This guide does not claim that genuine Google account acceptance or a production release has completed.

## Existing configuration

- Public website: https://rk-hud.github.io/cyber-suraksha-2.0/en/
- Citizen page: https://rk-hud.github.io/cyber-suraksha-2.0/en/account.html
- Google public web Client ID: `942815048048-6pi4g094nto74sad0afo1dqdpvhdlk3g.apps.googleusercontent.com`.
- Authorized JavaScript origin: `https://rk-hud.github.io`, without a path.
- The operator reports an External/Testing Google audience and an approved test account. These Google Console settings still require direct operator verification or genuine account acceptance; source code cannot establish them.
- Neon project: `frosty-band-01793215`; isolated schema-only branch: `br-sweet-band-azhwai4r` (`google-signin-staging`). It expires on 25 November 2026 at 10:46 IST.
- Production branch: `br-holy-darkness-az8i1rma`. Staging tests must not read or import production citizen records.

The popup credential flow uses the public Client ID. It needs no Google Client Secret, authorization-code exchange, refresh token or browser-stored provider access token. A previously exposed Client Secret must still be disabled/replaced through Google Cloud without deleting the Client ID.

## Staging prerequisites

The existing `portal_google_identities` and `portal_google_credential_uses` tables were inspected on the isolated branch. Their columns, primary/unique constraints, foreign key and replay-date index match migration `002-google-citizen-auth.sql`; they are empty. Do not recreate the branch or import production data to test sign-in.

Complete private credential remediation before deploying a service that uses exposed credentials. Database password resets disconnect the target branch's database connections. Obtain explicit approval for the identified reset; production rotation requires a separate dependency review and coordinated approval. Never publish database URLs, passwords, key values or identity assertions as evidence.

Deploy the reviewed bundle as a distinct staging Function. Neon supplies that branch's managed `DATABASE_URL`. Configure independent random `API_SESSION_KEY` and `API_OTP_KEY`, the real `ADMIN_EMAIL`, `ALLOWED_ORIGINS=https://rk-hud.github.io`, and the isolated test interface's `PUBLIC_WEB_URL` privately. Set the existing public `GOOGLE_CLIENT_ID` on the server.

Initially keep `GOOGLE_SIGNIN_ENABLED=0`, `GOOGLE_REGISTRATION_ENABLED=0`, `REGISTRATION_ENABLED=0` and `EMAIL_READY=0`. Once HTTPS health, schema readiness and authorization checks pass, enable Google sign-in only. Before opening new Google accounts, set the private `GOOGLE_ALLOWED_EMAILS` tester allowlist and enable `GOOGLE_REGISTRATION_ENABLED=1` on staging. Do not include the administrator mailbox in citizen testing.

A staging Google flow does not require copying the production authenticator encryption key. No staging owner account or bypass is created. Production owner MFA is preserved and is tested separately with disposable regression fixtures.

## Request flow and security

1. The citizen explicitly acknowledges the service terms/privacy notice.
2. The browser requests a short-lived Google challenge from the API. The API issues a nonce plus opaque flow token and retains their binding in an anonymous pending session.
3. Google Identity Services renders its button using that nonce. Account selection and authorization occur at Google.
4. The callback submits the signed credential and current flow binding over HTTPS. Neither credential nor application token is placed in browser storage or a URL.
5. The server verifies canonical token encoding, RS256 signature against Google's fixed HTTPS public keys, issuer, exact audience, authorized party when present, integer time claims, nonce and verified-email claim.
6. The server consumes the flow and inserts the replay fingerprint, stable Google subject binding and fresh thirty-minute citizen session atomically. A matching password-account email never creates an automatic link. Owner identities and non-citizen roles are refused.
7. Case APIs continue to authorize the application session and record owner on the server. A Google ID token is not itself a portal API bearer.

Google-linked citizen accounts use Google recovery. Website password/email recovery cannot create another authentication route for them, even when Google sign-in is disabled. This matters because Google is not necessarily authoritative for the current ownership of a non-Gmail, non-Workspace profile mailbox.

Administrator routes retain the configured owner identity, role checks and recent TOTP verification. The Google route never grants or promotes an administrator. Never replace an enrolled factor to make a test pass.

## Frontend build and preview

`web/pages/source/site.json` retains the production website origin, base path, API URL and public Google Client ID. Use the builder's separate `--config` and `--output` options for an isolated test build; do not overwrite production configuration to point citizens at staging. The verifier accepts corresponding `--config` and `--site` options.

Google-enabled account pages allow the documented GIS script, frame, stylesheet and connection URLs. Other pages retain their local tool boundary. API requests omit browser cookies and referrers. The provider SDK uses the documented origin-referrer behavior. No Google SDK is loaded until the citizen opts in and the API advertises the matching Client ID and feature readiness.

The localized privacy and terms pages explain independent support, stored account/case information and provider processing. Review their published URLs in Google branding before general release. Verify English, Hindi and Telugu, mobile/desktop layout, popup opening and Google consent using the actual approved account.

## Real-account acceptance

Use a separately approved citizen Google account. An approved account that is also the configured administrator must be refused; do not weaken that protection.

Record a genuine successful callback, a citizen-only account/session, access to its fictional case workspace and logout. Use a second approved citizen account for live A/B complaint-isolation checks. Automated signed-token fixtures establish application behavior but do not prove a real provider account, audience configuration or consent flow works.

Keep the Google audience in Testing. Never treat a visible button or a healthy API as completed Google authentication. Do not enter real victim information during staging tests.

## Production release and rollback

Production changes require explicit approval after staging acceptance. Review the additive migration and create a private restore point before applying it. Preserve the existing user IDs, owner role, password hashes and encrypted MFA value. Coordinate any necessary credential rotation with the existing Function and dependent Render owner portal.

After migration and approved configuration, deploy the reviewed API, publish the tested GitHub Pages build and perform genuine login, complaint-isolation and administrator-MFA smoke checks. Monitor sanitized request/security categories rather than raw identity tokens or complaint text.

Rollback must preserve the Google identity tables and Google-only recovery protections. Once Google citizens exist, do not revert to an old bundle that lets email recovery set their passwords. Disable the Google flags while retaining the reviewed guards and all account/case data. Existing hosted services remain until dependencies and replacement flows are verified.

See [security review](GOOGLE_AUTH_SECURITY_REVIEW.md) and the release operator's staging verification record for exact test commands, counts, deployment URLs and remaining acceptance items.
