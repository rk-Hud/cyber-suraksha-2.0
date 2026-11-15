![Owner-access control diagram](assets/owner-access-flow.svg)

[Documentation center](README.md) · [Source](../deploy/citizen-owner-portal/) · [Security policy](../SECURITY.md) · [Release checklist](RELEASE_READINESS.md)

# Owner portal — access review and release controls

**Project:** CYBER SURAKSHA 2.0  
**Component:** `deploy/citizen-owner-portal/`  
**Purpose:** Document the pilot access boundary without changing the live service.

## 1. Two applications, separate policies

The repository contains a public multilingual **awareness website** under `deploy/cyber-suraksha-independent/` and a separate **owner portal** under `deploy/citizen-owner-portal/`. Do not merge access policies or presume the awareness website is private.

For the owner pilot, the intended configuration is:

```dotenv
PRIVATE_MODE=1
PUBLIC_REGISTRATION=0
FORCE_HTTPS=1
```

`ADMIN_EMAIL` must be the exact owner-controlled mailbox configured **privately** by the operator. Application secrets belong in hosting secret settings. `render-free-pilot.yaml` shows the baseline policy, but actual running environment values require verification.

## 2. Source-code gate

In `portal/__init__.py`, the `before_request` handler checks private mode. Non-owner requests to application endpoints are redirected to sign-in or rejected as unauthenticated API calls unless explicitly allowed for authentication. The allowlist includes sign-in, verification, account recovery, registration entry points and logout.

The `@require_user(owner=True)` decorator in `portal/security.py` protects admin actions, and `@require_user(owner=True)` with MFA enabled requires recent authenticator verification. The admin route declarations are in `portal/routes.py`.

**Important:** A reachable registration page is not evidence that public registration is enabled. Verify that the server actually refuses unauthorized registration when `PUBLIC_REGISTRATION=0`. Conversely, do not call the **entire domain** fully private while login, health, security files and some static assets remain reachable anonymously.

## 3. Verification checklist (use synthetic accounts only)

1. Confirm the correct Render service, linked branch, commit SHA and current secret settings without revealing values.
2. Verify `PRIVATE_MODE=1`, `PUBLIC_REGISTRATION=0`, HTTPS enforcement and the exact owner email.
3. From an anonymous browser, request `/en/admin`, `/hi/admin`, `/te/admin`, `/en/admin/users` and protected case URLs. No private data may appear.
4. Call protected APIs without authentication. Expect a redirect or a 401/403 where appropriate; never expect a successful privileged operation.
5. Open the login and verification routes anonymously and confirm they reveal no private information.
6. Try registering an unrelated test mailbox. The server must not create a non-owner account in pilot mode.
7. Sign in as the configured owner with a fresh password and email verification; verify MFA enrollment and recent MFA before accessing protected administration.
8. Test logout, expired sessions, wrong or reused OTPs, expired MFA, missing CSRF tokens and cross-account access.
9. Attempt state-changing owner actions as an anonymous or non-owner test user. Confirm no data mutation, mail dispatch or privileged data exposure.
10. Review service logs for secrets and sensitive values, test backup/restore, document evidence and repeat tests after updates.

The repository contains automated tests, including `deploy/citizen-owner-portal/tests/test_free_pilot.py`. **This file is a manual verification plan, not proof that the tests or live checks have passed.**

## 4. Release boundaries

- Do not place real victim reports, identity documents, payment details or credentials into this pilot.
- Do not publish secret keys, `DATABASE_URL`, mail API keys, OTP secrets or confidential logs.
- Do not edit or redeploy the existing awareness site merely to prepare owner portal documentation.
- Do not enable public registration or relax private mode without a separately reviewed security and privacy release.
- Use independent authorization, privacy, durability and security assessment before accepting real citizen information.

## 5. Operational record

For any future release, record: Git commit, service identifier, deployment timestamp, configured access flags (not their secret values), test results, reviewers, backup status and rollback instructions. A source review or approved pull request does not establish what is currently deployed.

**Status of this document:** documentation-only. No hosting configuration, access control code or production deployment is changed by adding it.
