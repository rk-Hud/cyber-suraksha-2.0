# CYBER SURAKSHA 2.0 — Staging Unified Workspace Security Review

**Review status:** Source-only technical review, not production acceptance or a deployment authorization. The project is independently operated, not a government or police complaint portal. **Fictional testing data only.**

## Change stack and ownership of review

- Draft PR #12: `feature/unified-workspace-audit-20261121`; the original citizen/owner workspace, now based on `main` because owner provisioning PR #10 was already merged.
- Draft PR #15: `review/unified-workspace-hardening-20261121`, stacked on #12; canonical follow-up for the reviewed case, account and audit changes.
- PR #13 is a parallel implementation. Keep its branch for reference; do not integrate two overlapping implementations.
- No repository PR merge, source release, Function deployment, DNS/Pages publication, database migration, staging data update, secret rotation, or account re-enrollment was performed for this review.

## Authorization findings

| Boundary | Source evidence | Remaining acceptance |
| --- | --- | --- |
| Separate citizen/operator bearer | `csgooglestage` and `csownerstage` use different session keys and different session tables; source tests deny citizen tokens at operator routes | Confirm real staging Google and TOTP on separately authorized test window |
| Owner-only workspace reads | Each `/operator/v1/workspace/*` endpoint calls `operatorAuth` and checks approved email, owner role, active/version, unrevoked session, and fresh MFA (600 s) | Independent security review |
| Case updates | `PATCH /operator/v1/cases/:id` checks owner MFA within transaction, validates transition and version; attempts with no owner bearer no longer consume the privileged write-rate allowance | Browser and concurrency review |
| Citizen enable/disable | `PATCH /operator/v1/workspace/users/:id` checks owner MFA before rate limits, allows only citizen roles, uses row lock/version check and transactional audit | Explicit business/retention authorization before release |
| Disable/session behavior | Disable expires outstanding sessions/challenges without deleting historical session rows. Re-enable cannot resurrect an expired bearer. Existing citizen API denies inactive accounts. | Review if legal retention and revocation policy should differ |
| Case search | Bounded 20-record pagination, status allowlist, bound search parameters and deterministic order; injection-like input stays data | Real browser tests of owner case actions |
| Confidentiality | No password hashes, bearer values, Google proofs, TOTP seeds, or session hashes in owner workspace responses; browser tokens kept in memory only | External dependency and CSP review |

## Automated verification

GitHub Actions `Account service and Pages checks` uses a **disposable PostgreSQL 17 service on localhost**, never live Neon. It runs backend integration tests, Node syntax/build checks, Pages JS tests, static multilingual builds and Python static tests.

The screenshot workflow builds actual EN/HI/TE staging HTML and captures 1366×768 and 390×844 Chromium screenshots from **localhost only**. The browser interceptor denies every external request, including Neon and Google. Screenshots show public sign-in pages, **not** an authenticated owner's private dashboard or live users. The job uploads a GitHub Actions artifact named `cyber-suraksha-staging-source-previews`.

Look at the latest GitHub Actions conclusion on PR #15. Only a **completed success** is passing evidence, not an ongoing run.

## Authentication availability hardening — review update

- Public /operator/v1/challenge issuance has a widened **emergency infrastructure cap**
  (600/minute); identity-challenge has a 900/15-minute global resource cap.
  These limits **do not** provide guaranteed resistance to targeted distributed DoS.
- /login now validates the nonce-bound, Google-signed and owner-pinned identity and
  password/code shapes **before** spending the shared **8/15-minute** privileged
  password/TOTP attempt limit. Invalid or unsigned assertions cannot exhaust
  the private credential budget.
- /begin checks the private approval key and verified Google identity before charging
  the 12/15-minute bootstrap budget; /finish checks both before its 20/15-minute
  budget. /identity-proof validates the signed owner identity before its rate budget.
  The existing owner session-signing keys and TOTP enrollment remain unchanged.
- The integration suite exercises repeated forged Google assertions and bad approval
  keys, asserting the privileged rate buckets remain unused.
- **Deployment blocker:** a public edge per-client challenge rate limit and resilience
  policy must still be reviewed against the actual Neon Function hosting/proxy
  configuration. Never trust caller-set X-Forwarded-For or other arbitrary headers
  for rate enforcement. Document 429 recovery/owner access monitoring; do not
  remove broad emergency caps without a verified replacement.
- No live credentials were used during these tests.

## Hand-off artifact for independent owner review

The repository's `Account service and Pages checks` workflow produces two downloadable
artifacts when successful:

1. `cyber-suraksha-staging-website-review-build` — the actual built
   EN/HI/TE citizen and owner staging website, including a `REVIEW_ONLY.txt`
   and SHA-256 file manifest. The build contains no private database credentials,
   but includes public staging endpoints and Google OAuth client identifiers.
2. `cyber-suraksha-staging-source-previews` — 12 offline desktop/mobile browser
   screenshots, **not** authenticated private account views.

Both artifacts are manual review bundles. **Neither is a public release.**
Do not copy these files onto the production `gh-pages` root, deploy Function code,
rotate tokens or import any private backup merely because CI succeeds.

## Known privacy, completeness and release blockers

1. The fresh Nov 21 staging backup's archive listing passed (53,286 bytes; six core tables), but its first isolated restore failed because local PostgreSQL rejected `pg_attver`. The corrected restore result and zero-orphan checks are **NOT VERIFIED** here. This archive is **not automatically encrypted**; keep it private. GitHub cannot access the user's local backup or verify its restore.
2. No real staging Google + password + TOTP browser sign-in test was performed; CI uses synthetic credentials.
3. Audit history can show only events actually recorded. Browser close is not a confirmed logout. A failed-login email is an unverified claim. A session row is not proof that a browser is open.
4. Event retention, privacy disclosure, citizen consent and authorized account-disable policy require separately approved rules. No cleanup, old-record purge, or retention SQL was introduced.
5. Source screenshots are not deployed-site evidence; source changes are not active at the published GitHub Pages or Neon Functions URLs.
6. Owner source files are readable in this public GitHub repository. Never commit private credentials, backup keys, Google tokens, user exports, or real case records.

## Release decision

**NO-GO** until the isolated backup restore succeeds, the open privacy/authorization review is resolved, and the owner separately approves staging Function and Pages deployment. Do not merge Draft PRs or deploy by inference from passing CI.

See `web/pages/WORKSPACE_HARDENING_REVIEW.md` for local Windows PowerShell review steps, source build, rollback requirements and explicit deployment gates.
