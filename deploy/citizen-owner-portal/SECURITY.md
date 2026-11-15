[Main security policy](../../SECURITY.md) · [Owner access review](../../docs/OWNER_PORTAL_ACCESS_REVIEW.md) · [Platform architecture](../../docs/ARCHITECTURE.md)

![Owner authentication flow](../../docs/assets/owner-access-flow.svg)

# Security policy

CYBER SURAKSHA 2.0 is independently managed. This security document applies to the separate Flask owner portal, which is configured for private owner-only pilot testing. The project is not a government, college, bank or police service. Claims about legal ownership of individual contributions require verification.

## Report a vulnerability privately

Repository: https://github.com/rk-Hud/cyber-suraksha-2.0

Use [GitHub private vulnerability reporting](https://github.com/rk-Hud/cyber-suraksha-2.0/security/advisories/new) if the repository offers it. Availability of that feature has not been verified. If GitHub does not offer a private report, use the repository owner's published private contact channel to arrange confidential disclosure. No dedicated security mailbox or guaranteed response deadline has been established. Do not put credentials, citizen records, working exploit payloads or personal information in a public issue.

Include the affected URL or file/version, a concise description, minimal reproduction using your own account and synthetic records, likely impact, and a safe way to contact you. Redact tokens, passwords, OTPs, private keys and other people's information. Stop after demonstrating the problem; do not access further records, cause outages, send unsolicited messages or test systems linked in the official-agency directory.

This policy grants no blanket permission to attack hosting providers, third-party services or other users. No bug-bounty payment or legal safe-harbor promise is made.

## Data and access boundaries

- The local Scam Checker and Action Planner operate in browser memory. Pasted tool content is not uploaded, logged in the application database, or stored in browser storage by those tools.
- Creating an account and submitting a support case are separate, consented server operations. They store the name, email, password hash, case details, replies and status history needed to provide that service. Never submit passwords, OTPs, payment PINs or unnecessary victim-identifying details in a case.
- Email OTP verification is required for registration and login. Use a new website password, never your Gmail or other email-provider password. OTPs expire after five minutes and permit at most five verification attempts.
- The configured owner must also enroll and complete authenticator TOTP before administrative actions. Owner access can view citizen records, review login activity, update case status, disable citizen accounts, and edit validated multilingual content, resources, advisory and branding fields. It does not expose passwords, OTPs, server secrets, arbitrary code execution or infrastructure credentials.
- Passwords are hashed; opaque session tokens and OTP values are stored as keyed digests. Owner TOTP secrets are encrypted at rest. Back up their encryption key securely: losing it prevents decryption of existing secrets.
- Login activity includes the supplied email, known account name where available, result, time, truncated IP network and bounded browser identifier. Failed-login email values are claims, not proof of a person's identity. The configured retention defaults to 30 days; the running notification worker prunes expired security state at startup and hourly. If that worker is stopped, run the pruning command separately to enforce retention.
- Case records and audit events are retained until the owner applies a documented retention/deletion policy. The application does not promise automatic case deletion or implement a public deletion/export workflow.
- Optional Google reputation lookup is disabled without configuration. When a visitor explicitly invokes it, only locally calculated hash prefixes are sent through the server. Prefixes are not guaranteed anonymous. See [docs/REPUTATION.md](docs/REPUTATION.md).

## Deployment requirements

An **earlier public-release Blueprint** describes `PRIVATE_MODE=0` and `PUBLIC_REGISTRATION=1`. The current free pilot Blueprint instead specifies `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0`; do not apply older public settings to the private pilot. Public pages and account registration do not bypass administrator authorization or private-case ownership. Use `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0` only when deliberately returning to owner-only testing. A separate Render origin has its own application access controls; Sites sharing settings do not automatically protect that origin.

Use HTTPS, an exact allowed host/origin configuration, persistent PostgreSQL, real verified mail delivery, three distinct cryptographic keys, and the exact trusted-proxy count. Keep configuration in protected hosting settings. Never add a bypass OTP, default owner password, plaintext-secret project document, production test-mail capture, or SQLite-on-ephemeral-hosting account database.

The service sends CSP, HSTS, anti-framing and MIME-sniffing protections, rejects cross-origin form submissions, applies server-side role/record checks and rate limits, and records administrative mutations. These controls require correct deployment and ongoing updates. They are not a certification or a guarantee that every vulnerability is absent.

The prepared production Blueprint uses a paid web service, notification worker and PostgreSQL database; the owner has requested activation, but a verified private mail configuration and a successful actual deployment are still required. A prepared Blueprint is not a running service. A free Render database, if chosen separately for temporary testing, expires after 30 days and does not provide production backup guarantees. Establish backups, restore verification, monitoring and an appropriate privacy/retention process before public intake. Free web-service suspension also delays notification processing.

## Fraud and emergency reporting

This is an independent support service, **not a government complaint portal**. A case here does not file a police complaint or guarantee recovery. For real fraud in India, contact your bank promptly, call **1930** for financial cyber fraud, and use https://cybercrime.gov.in/. Use local emergency and official reporting channels in other jurisdictions.

Copyright (c) 2026 Jatoth Ramakrishna. Original project rights remain with the owner; third-party rights remain with their respective holders. Updated 13 November 2026.
