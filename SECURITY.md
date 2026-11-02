# Security Policy and Safe Use

## Scope

CYBER SURAKSHA 2.0 is a local educational prototype. It is not a production cybercrime reporting platform and has not undergone an independent security audit.

## Safe-use rules

- Use only fictional data in demonstrations, screenshots, tests and public discussions.
- Never submit real passwords, OTPs, UPI PINs, card numbers, bank credentials, session tokens or sensitive victim information.
- Use only fictional assets in the disclosure module. Do not submit details of a real vulnerability or target.
- Do not test systems, networks or accounts without explicit written authorization.
- Do not expose the Flask development server to the public internet.
- Keep the local SQLite database private; it may contain entered data.

## Reporting a project issue

For a non-sensitive bug, open a GitHub issue with reproduction steps and synthetic data only. Do not upload databases, logs, screenshots or files that contain personal or confidential information. For a security-sensitive concern, contact the repository maintainer privately rather than publishing exploit details.

## Before production use

A production deployment requires a security review and, at minimum, authentication, authorization, CSRF protection, secure session-cookie settings, a strong externally managed secret, HTTPS, rate limiting, input/output review, audit logging, data minimization, retention/deletion controls, backups and independent testing. These controls are not represented as complete in the current prototype.

## Real cyber-fraud in India

This project does not file official complaints. Contact your bank using its verified official channel and use the national cybercrime helpline **1930** or the official portal **https://cybercrime.gov.in/** promptly.

## Public read-only demo mode

`PUBLIC_DEMO_MODE=1` disables public incident-report submission, disclosure submission and SOC-note modification. Public data listings are restricted to fictional records. It is a demonstration safety control, **not** a substitute for a security review. Do not disable this setting on a public host without proper authentication, authorization, CSRF defenses and a complete privacy/security design.
