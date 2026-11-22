# CYBER SURAKSHA 2.0 — Unified Citizen / Owner Workspace (staging source)

**Important:** This is an older, **unapproved** reference release recipe from PR #12. For current review branch status, owner enable/disable semantics and immutable screenshot/rollback checks, follow `web/pages/WORKSPACE_HARDENING_REVIEW.md` and `web/pages/WORKSPACE_SECURITY_REVIEW_20261121.md`. Never run the recipe before an independently verified isolated backup restore and new staging-only approval.


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
$review = Join-Path $env:USERPROFILE "Documents\CYBER_SURAKSHA_UNIFIED_REVIEW"
if (Test-Path $review) { throw "STOP: Review folder already exists" }
git clone --single-branch --branch feature/unified-workspace-audit-20261121 `
    https://github.com/rk-Hud/cyber-suraksha-2.0.git $review
if ($LASTEXITCODE -ne 0) { throw "STOP: Git failed" }
Set-Location $review

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

1. Verify the **fresh, unencrypted** Nov 21 staging `pg_dump` can be restored
   into an **isolated** database. Its archive/table listing passed, but its
   corrected full restore and integrity results have **not been independently verified**.
   Keep the backup restricted locally and out of public source.
2. Obtain independent security review of this PR and predecessor PR #10,
   especially role isolation, CORS, CSRF, Google ID-token nonce, TOTP,
   audit logging and session expiration.
3. Capture and verify current immutable staging source and Pages commits.
4. Confirm linked Neon project `frosty-band-01793215` and **staging branch**
   `br-sweet-band-azhwai4r`; never target the production branch.
5. Run the GitHub Actions disposable PostgreSQL tests.
6. With *separate explicit release approval*, build **both separate** Function
   bundles using the reviewed source. The changed citizen logout/password-reset
   audit handlers require updating existing `csgooglestage`, while the owner
   dashboard and rate hardening require updating existing `csownerstage`.
   Release each **only to the existing staging branch**, never production.
   Capture the known-good version of **each** before any release, preserve
   configured keys, and never place secrets in repositories or build logs.
7. With separate Pages approval, publish the reviewed staging site under
   `docs/google-test/` on `gh-pages`. Use the same four owner/page file
   review procedure as prior staging publication, plus newly changed citizen
   files. Verify the complete reviewed path list and commit hashes.
8. Validate citizen-only authorization, owner MFA, activity pagination,
   logout distinction, case optimistic locking and audit chronology.


## Retired publication recipe — reference only, DO NOT EXECUTE

An earlier single-Function publication recipe was removed from this review
because it would deploy only `csownerstage` and not the modified citizen
`csgooglestage` logout/audit handlers, creating an inconsistent staging
release. That recipe also checked out PR #12 rather than the final stacked
hardening branch. Running it would not publish the reviewed version.

The safe, current handoff is **three independent build outputs** produced
without deployment by GitHub Actions on the latest reviewed PR #15 commit:

- `cyber-suraksha-staging-website-review-build` — standalone static
  staging site (English, Hindi, Telugu citizen and owner pages).
- `cyber-suraksha-staging-functions-review-build` — two separate
  `citizen/index.mjs` and `operator/index.mjs` bundles, with SHA-256
  manifests. Neither contains Function runtime secrets.
- `cyber-suraksha-staging-source-previews` — 12 isolated desktop/mobile
  sign-in screenshots. Not proof of real owner MFA.

A future authorized staging release requires a verified immutable snapshot
of the current `csgooglestage` and `csownerstage` Function versions,
a successful local **restricted and isolated** restore of current staging's private archive,
independent Google/TOTP and privacy review, and **separate explicit owner
approval** for each Function deployment and staging Pages publication.
Never alter the production Neon branch or `gh-pages` public site root.
Rebuild and review deployment commands against the then-current Neon CLI;
do not reuse obsolete single-Function commands.

## Exact staging Pages rollback (only after a published staging commit)

This generates a **new revert commit** rather than deleting repository
history. First inspect intervening commits; a revert may conflict if other
work has been published.

\`\`\`powershell
$ErrorActionPreference = "Stop"
$pagesRepo = Join-Path $env:USERPROFILE "Documents\CYBER_SURAKSHA_UNIFIED_PUBLISH"
Set-Location $pagesRepo
git pull --ff-only origin gh-pages
if ($LASTEXITCODE -ne 0) { throw "STOP: Cannot update Pages checkout" }
git log -5 --oneline
$published = Read-Host "Paste the exact unified staging publication commit SHA"
if ($published -notmatch '^[0-9a-f]{40}$') { throw "STOP: Invalid commit SHA" }
$confirmation = Read-Host "Type REVERT-STAGING-PAGES"
if ($confirmation -cne "REVERT-STAGING-PAGES") { throw "STOP" }
git revert --no-edit $published
if ($LASTEXITCODE -ne 0) { throw "STOP: Revert failed. Resolve manually; do not force push" }
git push origin gh-pages
if ($LASTEXITCODE -ne 0) { throw "STOP: Rollback push failed" }
\`\`\`

For a Neon Function rollback, reconstruct the **prior reviewed version** from
the PR #10 source snapshot, build \`dist-operator/index.mjs\`, and deploy
that bundle with the same staging identifiers while retaining all existing
credentials. Do not perform a database branch reset or change owner keys.
An automatic rollback to an arbitrary historical Function version is not
assumed.

## Rollback (only if separately approved deployment occurred)

- GitHub Pages staging: identify the exact publication commit in the
  `gh-pages` history; use a **revert commit**, not force push. Verify
  that citizen sign-in continues to work.
- Neon citizen and owner Functions: rebuild each **exact last-known-good
  deployed** staging Function separately; any rollback must preserve the
  original credentials and never reset the Neon branch, wipe cases or touch
  production. Verify both health endpoints and account role isolation.
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
