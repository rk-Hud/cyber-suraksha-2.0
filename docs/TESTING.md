# Testing and quality assurance

[Documentation center](README.md) · [Manual checklist](../MANUAL_TEST_CHECKLIST.md) · [Release readiness](RELEASE_READINESS.md)

A passing result applies only to the **exact code revision, dependency set and execution environment** tested. Repository test files, inherited test logs or old documentation must not be reported as current passing evidence without rerunning tests.

## Test suites by component

| Scope | Path | Purpose |
| --- | --- | --- |
| Public awareness | [FastAPI site](../deploy/cyber-suraksha-independent/) | HTTP routes, educational responses and browser interactions |
| Owner-only pilot | [Portal tests](../deploy/citizen-owner-portal/tests/) | Authentication, OTP/MFA, private mode, role checks, case ownership and optional integrations |
| Original Flask training | [Legacy tests](../tests/) | Synthetic incident, SOC, awareness and local persistence flows |
| Browser scripts | [Node testing](../deploy/citizen-owner-portal/tests/checker.test.cjs) | Scam-checker behavior and adversarial fixture validation |

## Commands

From the repository root after installing the **historical** Flask app's requirements:

```powershell
python -m unittest discover -s tests -v
```

For the separate owner portal, use its own isolated environment and requirements from `deploy/citizen-owner-portal/`:

```powershell
cd deploy/citizen-owner-portal
python -m pip install -r requirements.txt -r requirements-test.txt
python -m pytest -q
```

Where Node.js is available, the JavaScript test entrypoints can be run from the portal folder:

```powershell
node --test tests/checker.test.cjs tests/reputation.test.cjs
```

These are **suggested execution commands, not a claim they have run successfully during this documentation update**. Actual versions, flags and environment dependencies must be checked before release.

## Manual live verification

Follow [manual acceptance checklist](../MANUAL_TEST_CHECKLIST.md) and [owner access review](OWNER_PORTAL_ACCESS_REVIEW.md). Test unauthenticated and unauthorized requests without any real citizen data; check configured private mode, registration restrictions, session termination, MFA freshness, CSRF defenses and actual hosting secrets without revealing them.

## Evidence record

Record `git rev-parse HEAD`, runtime versions, command, test output, exit code, test data policy, tester/date and unresolved findings. Retain old generated test logs as historical evidence; do not rewrite their original contents.

## Outstanding verification categories

Independent penetration test, current dependency checks, production-specific backups/restore, email verification delivery, actual hosting TLS/proxy/headers and accessibility acceptance must be separately verified for any service that requires them.
