# Release readiness — evidence-based checklist

![Private access diagram](assets/owner-access-flow.svg)

[Documentation center](README.md) · [Security policy](../SECURITY.md) · [Testing](TESTING.md)

## Separate approval boundaries

| Release | Intended audience | What must be verified |
| --- | --- | --- |
| Public awareness site | Anyone learning digital safety | Live service, HTTP status, language pages, browser interactions, secure headers and content accuracy |
| Owner pilot | Configured owner only | Actual environment flags, identity/MFA checks, denied public registration, protected routes, database durability, email delivery, backup and retention |
| Historical Flask training app | Local educational users | Synthetic-only data, local loopback launch and original tests |

The owner pilot's repository configuration sets `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0`; **live environment values have not been established by a source-only review**.

## Acceptance evidence (do not mark complete without proof)

- [ ] Record actual branch, Git SHA, service URL, deployment timestamp and responsible operator.
- [ ] Check license and third-party assets; verify no credentials or real personal data are committed.
- [ ] Run source tests for the exact revision; save command, version and outputs.
- [ ] Test protected routes with an anonymous browser, an ordinary test account and the intended owner.
- [ ] Verify successful MFA and rejection of expired or missing MFA.
- [ ] Verify registration is blocked in private mode.
- [ ] Exercise CSRF, origin and rate limits against synthetic records only.
- [ ] Validate TLS, host and proxy configuration on the actual deployment.
- [ ] Test mail provider and persistent database with non-sensitive accounts.
- [ ] Verify backup restore and a rollback method before any real operational use.
- [ ] Confirm privacy notices, retention/deletion process and appropriate independent security review.
- [ ] Keep public-awareness deployment separate from owner pilot changes.

A completed checklist requires **recorded evidence**, not merely the existence of config options or tests.

## Public-facing language

Acceptable: “Independent cybersecurity-awareness website and owner-controlled pilot.”

Avoid: “Official government service,” “government approved,” “certified secure,” “police complaint portal,” or “fully production secure” without specific verified authorization and supporting evidence.

For actual complaints in India: [cybercrime.gov.in](https://cybercrime.gov.in/) and financial cyber fraud helpline **1930**.
