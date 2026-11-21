# CYBER SURAKSHA 2.0 — Unified Citizen / Owner Workspace (staging source)

**Status: source review only. NOT DEPLOYED.** This PR is stacked onto staging operator PR #10.
It does not authorize Neon deployment, SQL migration, public release, or any cost-bearing service.

## Source architecture

- `/google-test/{en,hi,te}/account.html` remains the citizen landing page. Staging adds a direct
  owner link to `operator.html` and routes old `#admin` bookmarks to it. This is
  deliberately a navigation handoff, **not** shared authentication.
- `csgooglestage` handles citizen Google/email flows. `csownerstage` handles
  independently signed Google owner identity, separate password, TOTP, fresh MFA,
  revocable operator token and role authorization. Citizen bearer tokens cannot
  authorize operator endpoints.
- Owner dashboard tabs: overview, paginated registered users and their fictional
  case references, authentication activity, recorded sessions, fictional case
  updates, and audit ledger. All read APIs are subject to the same `operatorAuth`
  as case updates. UI tokens remain in memory, never cookies, localStorage, or URLs.
- Existing staging schema is reused: `portal_users`, `portal_sessions`,
  `cs_stage_operator_sessions`, `portal_login_events`,
  `portal_audit_events`, `portal_complaints`. **No DDL required.**

## Privacy and historical interpretation

- All event timestamps are stored as UTC Unix seconds and presented in Asia/Kolkata
  in the owner browser.
- A recorded failed login may contain an **unverified claimed email**;
  do not treat this as proof of that person's involvement.
- A citizen's explicit logout removes its session and now writes an audit event.
  Browser closure is not recorded as a logout. Deleted or pruned sessions cannot
  be reconstructed. "Unknown" is appropriate where the evidence is missing.
- The existing login ledger includes successful and certain failed authentication
  attempts; not every anonymous provider failure can be attributed safely.
- Explicit citizen logout, password reset, case creation, administrative
  session revocation, and explicit owner logout gain new server-side audit
  records **only after the corresponding source change is deployed**.
  Historic events that were not recorded cannot be backfilled truthfully.
- The owner API never returns password hashes, OTPs, TOTP keys, Google credentials,
  private approval keys, bearer tokens, session hashes, or raw user agents.
- Search and result pagination are bounded (20 records per page, 999 pages),
  with input validation and parameterized SQL.
- Existing event retention is *not* automatically bounded by this PR.
  A 90-day login-event / 365-day audit-event retention proposal needs a
  separate privacy/legal review and explicit approval of its deletion policy.
  **No scheduled deletion, cleanup SQL, or old data deletion is included.**
- Staging is visibly labeled a fictional-only testing environment. It is the
  official project website of the independent author, **not a government or
  police portal**, and does not accept real reports.

## Local build and preview (NO DEPLOYMENT)

Run from Windows PowerShell. Do not input real user or victim data. Browser
Google Sign-In cannot work on a localhost origin not authorized in Google Cloud.

```powershell
$ErrorActionPreference = "Stop"
Set-Location "$env:USERPROFILE\Documents\CYBER_SURAKSHA_ADMIN_REVIEW"
git fetch origin
git switch feature/unified-workspace-audit-20261121
git pull --ff-only origin feature/unified-workspace-audit-20261121
if ($LASTEXITCODE -ne 0) { throw "STOP: Git failed" }

Set-Location .\services\account-api
npm.cmd ci
npm.cmd run check
node --check .\src\staging-operator.js
if ($LASTEXITCODE -ne 0) { throw "STOP: API syntax" }

Set-Location ..\..\web\pages
npm.cmd ci
python -m pip install -r .\requirements-build.txt
python -m pip install tzdata

$previewRoot = Join-Path $env:LOCALAPPDATA "CyberSuraksha\unified-preview-host"
$output = Join-Path $previewRoot "cyber-suraksha-2.0\google-test"
if (Test-Path $output) { throw "STOP: Output exists; do not overwrite files" }
python .\scripts\export_site.py --config .\config\google-test.json --output $output
if ($LASTEXITCODE -ne 0) { throw "STOP: Preview build failed" }
python -m http.server 8097 --bind 127.0.0.1 --directory $previewRoot
```

Open **http://127.0.0.1:8097/cyber-suraksha-2.0/google-test/en/account.html**
and the corresponding operator URL in a browser. Do **not** authenticate
from localhost. Check the English, Hindi, and Telugu pages.

For desktop screenshots use 1366×768. For mobile use Firefox Responsive
Design Mode (Ctrl+Shift+M) at 390×844. These are *local review previews*, not
evidence of deployed functionality. Test actual Google and MFA flows only
after separately approved staging publication.

## Staging release safety gates (DO NOT RUN WITHOUT APPROVAL)

1. Verify the encrypted staging `pg_dump` can be restored into an
   **isolated** database. The earlier DPAPI backup listing passed, but its
   restore rehearsal has **not** passed.
2. Obtain independent security review of this PR and predecessor PR #10,
   especially role isolation, CORS, CSRF, Google ID-token nonce, TOTP,
   audit logging and session expiration.
3. Capture and verify current immutable staging source and Pages commits.
4. Confirm linked Neon project `frosty-band-01793215` and **staging branch**
   `br-sweet-band-azhwai4r`; never target the production branch.
5. Run the GitHub Actions disposable PostgreSQL tests.
6. With *separate explicit release approval*, build the operator bundle
   locally and deploy **only** the existing `csownerstage` Function,
   retaining already configured environment keys. Never put keys in chat,
   GitHub Actions logs or commits.
7. With separate Pages approval, publish the reviewed staging site under
   `docs/google-test/` on `gh-pages`. Use the same four owner/page file
   review procedure as prior staging publication, plus newly changed citizen
   files. Verify the complete reviewed path list and commit hashes.
8. Validate citizen-only authorization, owner MFA, activity pagination,
   logout distinction, case optimistic locking and audit chronology.

## Rollback (only if separately approved deployment occurred)

- GitHub Pages staging: identify the exact publication commit in the
  `gh-pages` history; use a **revert commit**, not force push. Verify
  that citizen sign-in continues to work.
- Neon operator Function: rebuild the *previous reviewed staging source*
  (PR #10 base commit) and redeploy it to the **same staging branch**,
  preserving current secret variables. Never reset the branch or restore
  production. Verify operator /health and owner role before and after.
- No schema rollback is needed for this PR because it has **no DDL**.
- If already-issued bearer sessions must be revoked after a security
  incident, follow the independent emergency response review; do not
  rotate keys casually or publish them.

## PR review checklist

- [ ] Backend test suite and node checks passed with disposable PostgreSQL
- [ ] Multilingual static site and operator source checks passed
- [ ] Desktop and mobile *manual* previews reviewed
- [ ] Citizen/admin bearer-crossing denied
- [ ] No real citizen data or credentials in source
- [ ] Privacy retention and completeness limitations documented
- [ ] Backup restore rehearsal completed prior to any live migration
- [ ] Explicit separate authorization for staging deployment, if desired
