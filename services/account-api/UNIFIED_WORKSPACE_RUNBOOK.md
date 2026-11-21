# CYBER SURAKSHA 2.0 — Unified Workspace Review and Rollback

## Scope and release boundary

This draft is a **staging-only source change**. It is stacked onto the existing isolated
owner-provisioning branch. It does not deploy a Function, publish GitHub Pages,
apply SQL, merge a PR, or change production. The site is independently operated:
it is **not** a government or police reporting service. Staging accepts fictional
records only; do not collect actual victim reports.

The citizen and administrator flows remain separate:
- Citizen account: `google-test/<lang>/account.html` and `csgooglestage`.
- Private operator authentication/dashboard: `google-test/<lang>/operator.html` and `csownerstage`.
- Navigation from `account.html` opens the separately authenticated operator
  page. Privileged credentials and bearer tokens never cross to the citizen API.
- Administrator sessions and Google verification require existing distinct
  operator keys, approved Google subject, dedicated password and TOTP.

## Schema and data handling

**No database migration is required for the current draft.** Read-only Neon
inspection confirmed these existing tables on the isolated staging branch:
`portal_users`, `portal_complaints`, `portal_sessions`,
`cs_stage_operator_sessions`, `portal_login_events`, `portal_audit_events`,
and `portal_case_events`.

Server-side audit events added in source:
- Citizen explicit logout, distinct from login and session expiration.
- Operator explicit logout and session revocation.
- Existing login success/failure events reused.
- Password reset and fictional case creation (audit table).
- Existing case status changes and account disable/enable (audit table).
  
A deleted citizen session cannot prove the time of a browser close. The session
list is **only a server snapshot**, not a presence detector. Owner records are
paginated and available only after live role + version + fresh MFA validation.
Registered emails, cases, account statuses and history must never be served to
citizen-authenticated clients.

**Privacy blocker for public release:** Agree on and document a lawful retention
period for account/login/audit history and implement/test a reviewed retention
policy. This draft **does not purge historical records** or enable automatic
retention deletion. Review service/privacy terms and access logs before collecting
real account activity in any broader environment.

## Developer verification — Windows PowerShell

Use a fresh checkout of this branch; never use `gh-pages` as a development
branch. The GitHub PR CI runs the tests against disposable loopback PostgreSQL.

```powershell
git clone --branch feature/unified-citizen-owner-workspace-20261121 --single-branch https://github.com/rk-Hud/cyber-suraksha-2.0.git CYBER_SURAKSHA_UNIFIED_REVIEW
Set-Location ".\CYBER_SURAKSHA_UNIFIED_REVIEW\services\account-api"
npm.cmd ci
npm.cmd run check
node --check .\src\staging-operator.js
node .\scripts\build-staging-operator.mjs
Set-Location "..\..\web\pages"
python -m pip install -r .\requirements-build.txt tzdata
npm.cmd ci
npm.cmd test
npm.cmd run verify
python -m unittest discover -s tests -p "test_*.py" -v
```

Backend integration tests require an **isolated disposable local PostgreSQL**
(`TEST_DATABASE_URL`) and deliberately refuse to point at Neon; use the
GitHub Actions checks for the full test suite. The above commands only build
locally and do not publish.

## Review gates before any staging publication

1. Review and test on the Draft PR. Confirm required CI jobs are green.
2. Check the restored-backup rehearsal is completed. Existing Windows DPAPI
   backup alone is not proof of a tested restore.
3. Verify page localization (EN/HI/TE), CSP, safe account links and mobile view.
4. Confirm the existing owner enrollment, citizen sessions and all fictional
   complaints are preserved. Do not re-enroll or rotate administrator keys.
5. Test with two different citizen accounts: no cross-user data, no admin API
   access. Test explicit logout, expired MFA, revoked sessions, case version
   conflicts and literal safe search handling.
6. Review privacy disclosures, retention, session-state wording and recent
   activity. Confirm no password/OTP/Google credential/TOTP seed is displayed.
7. Obtain separate owner approval for **staging-only** frontend publication and
   Function redeployments; confirm all commands target branch
   `br-sweet-band-azhwai4r`. Never deploy from this draft automatically.

## Safe rollback approach (if a later staging deployment is approved)

**Before deployment**, record the exact existing Function deployment IDs and
GitHub `gh-pages` commit SHA, and retain the prior reviewed deployment bundles.
To roll back, redeploy those preserved bundles to the same staging branch and
revert only the authorized staging Pages publication commit (not unrelated
commits or production files). Run the health checks and regression tests again.
Do not delete users, drop tables, reset the Neon branch or force-push branches.

**At present no rollback is necessary**: this PR has not changed live services.

## Open verification items

- End-to-end real browser Google + TOTP owner sign-in is not exercised by CI;
  an approved isolated staging browser test is needed.
- A privacy-approved log retention policy is required before a broader rollout.
- Browser screenshots provided separately are illustrative layout previews,
  not screenshots of deployed data or proof of real account activity.
