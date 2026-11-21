# CYBER SURAKSHA 2.0 — Unified workspace hardening review

**Status:** Development-source changes only. **No deployment, merge, database write, credential rotation or live session change is authorized.**

This review branch builds on `feature/unified-workspace-audit-20261121` (Draft PR #12) rather than recreating citizen login or administrator MFA. A parallel Draft PR #13 exists; resolve duplicate PRs deliberately before integrating them. The predecessor owner-security PR #10 has already been merged.

## Implemented additions

- Display the internal account ID in the administrator users directory while preserving server-side authorization, search and pagination.
- Add `GET /operator/v1/workspace/cases` to the isolated staging operator Function. Server-side owner session and **fresh MFA** validation precede access. Query parameters: `page` (1–999), `q` (maximum 80 characters, no control characters), `status` (approved case-state allowlist). SQL uses bound parameters, deterministic ordering, and 20 records/page with a 21st lookahead.
- Add fictional-case search, status filter and page controls to the owner dashboard (English, Hindi and Telugu). Case edits still use the existing authenticated PATCH endpoint, audit transaction and case-version optimistic concurrency check.
- Make operator logout acknowledgements precise. A successful server response confirms an explicit logout; a failed/unreachable server means only the page-memory bearer was discarded. Browser closure is **not** an explicit logout.
- Preserve independent `csgooglestage` citizen and `csownerstage` administrator Functions and their separate signing/verification keys.
- Reuse `portal_users`, `portal_sessions`, `cs_stage_operator_sessions`, `portal_login_events`, `portal_audit_events`, `portal_complaints`, and `portal_case_events`. **No SQL migration is required for these changes.**

## Tests and evidence

The added backend integration tests use **disposable loopback PostgreSQL**, never the Neon staging connection. They cover owner-only access, cross-bearer denial, bounded status/search parameters, case pagination over 23 fictional fixtures, SQL-injection-style text and revoked sessions. Existing tests already cover Google/TOTP, fake credential replay, isolation, case optimistic concurrency and owner logout. Additional static build tests check the tri-lingual case controls, account ID display, clear logout semantics and responsive table behavior.

Check the GitHub Actions results on this branch before claiming these tests passed. Passing CI is **not** a production security acceptance. Actual browser Google/MFA login, mobile layout checks and a restore rehearsal remain separately required.

## Database audit limitations and privacy

Existing staging audit tables use UTC Unix-second timestamps; the dashboard renders times in Asia/Kolkata. Historic activity cannot be reconstructed if the source did not record it. A failed-login email is a claimed address, not proof that the owner of that email attempted access. An unexpired session row means it is eligible for authentication, not that a browser is currently open. Deleted citizen sessions cannot be listed afterward; explicit logout is recorded separately in the audit ledger.

Audit retention and account disabling/revocation governance still need explicit privacy and legal review. Do not delete data, schedule pruning or introduce a paid service as part of this PR.

## Safe local review — Windows PowerShell (no staging or production deployment)

```powershell
$ErrorActionPreference = 'Stop'
$review = Join-Path $env:USERPROFILE 'Documents\CYBER_SURAKSHA_HARDENING_REVIEW'
if (Test-Path -LiteralPath $review) { throw 'STOP: review folder already exists' }
git clone --single-branch --branch review/unified-workspace-hardening-20261121 `
  https://github.com/rk-Hud/cyber-suraksha-2.0.git $review
if ($LASTEXITCODE -ne 0) { throw 'STOP: Git clone failed' }
Set-Location $review

Set-Location '.\services\account-api'
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'STOP: dependency install failed' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'STOP: account API check failed' }
node --check '.\src\staging-operator.js'
if ($LASTEXITCODE -ne 0) { throw 'STOP: operator syntax failed' }

Set-Location '..\..\web\pages'
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'STOP: Pages dependencies failed' }
node --check '.\source\static\js\operator.js'
if ($LASTEXITCODE -ne 0) { throw 'STOP: browser JS syntax failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'STOP: Pages tests failed' }
python -m pip install -r '.\requirements-build.txt'
if ($LASTEXITCODE -ne 0) { throw 'STOP: Python dependencies failed' }
python -m unittest discover -s tests -p 'test_*.py' -v
if ($LASTEXITCODE -ne 0) { throw 'STOP: static build tests failed' }

$previewRoot = Join-Path $env:LOCALAPPDATA 'CyberSuraksha\hardening-local-preview'
$out = Join-Path $previewRoot 'cyber-suraksha-2.0\google-test'
if (Test-Path -LiteralPath $out) { throw 'STOP: preview path exists; no overwrite' }
python '.\scripts\export_site.py' --config '.\config\google-test.json' --output $out
if ($LASTEXITCODE -ne 0) { throw 'STOP: export failed' }
python -m http.server 8097 --bind 127.0.0.1 --directory $previewRoot
```

Review `http://127.0.0.1:8097/cyber-suraksha-2.0/google-test/en/account.html` and `/en/operator.html` as **visual source previews**. Do not authenticate from an unapproved localhost Google origin. Repeat for `hi` and `te`, desktop 1366×768 and mobile 390×844. The API integration tests require an **isolated local PostgreSQL database**: use the repository's GitHub Actions job with its disposable PostgreSQL service, or a separately prepared local database. Never run them against the live Neon staging URL.

## Exact deployment gates — NOT APPROVED

Do not push `gh-pages`, merge PRs, deploy `csownerstage`, migrate Neon, rotate keys or overwrite production from this review. Before authorizing any staging change:

1. Rehearse a successful restore of the existing encrypted staging backup into an **isolated** database; verify foreign keys, expected accounts and fictional case counts without revealing identities. The restore is **not yet confirmed**.
2. Obtain an independent code/security review for this branch and PR #12, including Google/OIDC, nonce and audience binding, owner password/TOTP, session lifecycle, CORS, audit attribution, privacy retention and case authorization.
3. Verify all GitHub Actions checks, stage branch ID, previous deployed operator Function source/commit and the protected `gh-pages` staging prefix.
4. Require **new, explicit staging-only authorization** for a reviewed Function bundle update, then separately for Pages publication. Retain the existing Function environment variable **values**; do not display, copy or regenerate them.
5. Validate real staging browsers after approved publication, keeping test/fictional data restrictions.

The predecessor file `web/pages/UNIFIED_WORKSPACE_REVIEW.md` documents the proposed staging-only release procedure. Reconcile its source branch and commit references with this branch, and obtain explicit release permission before using those commands.

## Safe rollback strategy — only if a later deployment is explicitly approved

- **Before deployment:** record current Function deployment version, known-good source SHA and `gh-pages` commit SHA in a private change record. Keep the prior operator bundle available for exact redeployment; do not assume a Neon Function has automatic one-click version rollback.
- **GitHub Pages:** revert only the approved staging publication commit, never force-push, reset `main`, or delete data:
  
  ```powershell
  $ErrorActionPreference = 'Stop'
  Set-Location 'C:\PATH\TO\YOUR\REVIEWED-GH-PAGES-CHECKOUT'
  git fetch origin gh-pages
  if ($LASTEXITCODE -ne 0) { throw 'STOP: fetch failed' }
  git switch gh-pages
  git pull --ff-only origin gh-pages
  if ($LASTEXITCODE -ne 0) { throw 'STOP: cannot fast-forward' }
  git log -5 --oneline
  $sha = Read-Host 'Exact published staging commit SHA'
  if ($sha -notmatch '^[0-9a-f]{40}$') { throw 'STOP: invalid SHA' }
  # Only with fresh rollback approval: git revert --no-edit $sha
  # Review git show --stat HEAD, then only with approval: git push origin gh-pages
  ```
- **Operator Function:** rebuild the *previous verified operator source* and redeploy only to `br-sweet-band-azhwai4r / csownerstage` after explicit rollback approval. Do not deploy the citizen bundle, replace private keys or point at the production branch.
- **Database:** this branch has no schema or data writes, so there is no database migration rollback. If a separate future change adds migrations, it requires its own verified backup/restore and rollback plan.

No production readiness, government affiliation or public police complaint authority is implied by this development review.
