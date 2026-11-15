# Security and responsible disclosure

[Repository](README.md) · [Owner access review](docs/OWNER_PORTAL_ACCESS_REVIEW.md) · [Release readiness](docs/RELEASE_READINESS.md)

CYBER SURAKSHA 2.0 consists of a **public awareness service**, an **independent owner-only portal pilot**, and preserved **historical training code**. Security statements apply to a named component and verified revision; they are not universal certifications or guarantees.

## Reporting vulnerabilities

For a non-sensitive defect, use the repository issue tracker and synthetic reproduction data. For potentially sensitive issues, use the repository's private reporting option if enabled or arrange a private contact with its maintainer. Do not publish active exploits, identities, raw case contents, credentials, tokens, OTPs, backup files or secret-bearing logs. Unauthorized testing of third-party sites, service providers and real users is not permitted.

## Data handling

- Public awareness site: educational content and browser-based learning tools; no official complaint filing or real citizen case intake.
- Owner pilot: intended for controlled owner testing with private-mode access and no public registration; **no real victim, payment or citizen-sensitive data should be entered into an unreviewed pilot**.
- Earlier Flask app: local fictional incidents and simulated SOC alerts, with SQLite data kept private.
- External providers: hosting, mail or optional reputation services may process data or connection metadata under their own conditions. Verify actual configuration before making claims about collection or retention.

## Authenticated portal controls

![Owner access flow](docs/assets/owner-access-flow.svg)

The pilot code includes owner-role checks, email verification, authenticated sessions, recent authenticator MFA and CSRF verification. Its [pilot Blueprint](deploy/citizen-owner-portal/render-free-pilot.yaml) sets `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0`. These source features **do not establish** that the live deployment has passed full authorization testing, independent security review or backup validation.

Read [portal security details](deploy/citizen-owner-portal/SECURITY.md) and [verification steps](docs/OWNER_PORTAL_ACCESS_REVIEW.md).

## Operational minimums

- HTTPS with correctly configured proxy and host validation.
- Separate high-entropy session, OTP and TOTP-encryption secrets; never commit them.
- Role-checked operations, recent MFA, CSRF protection and rate limits.
- Persistent database, data minimization, retention/deletion procedures and tested backups.
- Real mail sender verification, operational monitoring and incident-response readiness.
- Independently verified testing before accepting production personal information.

## Public safety notice

This project is **not** a government, bank, police or CERT-In complaint channel. For an actual Indian cybercrime complaint visit [cybercrime.gov.in](https://cybercrime.gov.in/); for urgent financial cyber fraud call **1930** and contact the bank through its official channel.

## Rights and third-party materials

Original software and project material, third-party dependencies, and [illustrative media](docs/VISUAL_ASSETS.md) have different license and ownership boundaries. The top-level [MIT License](LICENSE) governs software reuse according to its terms. The project is independently maintained and makes no claim to external government approval.
