# Public-release security and privacy review — 15 November 2026

**Project:** CYBER SURAKSHA 2.0  
**Repository:** `rk-Hud/cyber-suraksha-2.0`  
**Review baseline:** `95ba26a474c3143685b0414a8394ed7a280906d0`  
**Decision:** **NOT YET CLEARED FOR PUBLICATION**  
**Repository visibility when inspected:** Private

> This report records a limited, source-accessible repository audit. It is not a penetration-test report, automated enterprise secret-scan certificate, source provenance opinion, license clearance or authorization to use real citizen data.

## Scope actually reviewed

1. The 242 accessible non-image / text-sized files under the baseline `main` tree were scanned through GitHub blobs for a defined set of credential signatures and consumer-email patterns. This was **pattern screening**, not credential validation, entropy-based scanning or a promise that all possible secret formats were detected.
2. The 38 commits returned for the baseline main history were inspected through their GitHub commit patches for additions matching common token/key signatures or personal-email patterns. The appearance of a personal email in old commits is confirmed. Patch truncation and commits outside this main history remain possible limits.
3. All 18 repository branch references were enumerated. Archived/release branch tip trees were inspected for names matching common sensitive-file extensions and names. No obvious private-key/certificate/database backup file names were seen in the examined tip trees.
4. Additional branch-tip versions absent from main were sampled (50+ returned text blobs), including historical application code, deployment guides and archived data, looking for common high-confidence token markers and consumer-email patterns. **Not every object reachable from the full historical Git graph was scanned.**
5. The GitHub connection does not provide the repository secret-scanning-alert interface or a repository visibility-change action. Those checks and actions were **not** performed.
6. Binary contents, independent security testing of the live Render instance, comprehensive dependency and copyright provenance validation, and author/asset-rights verification are outside the completed inspection.

## Confirmed findings

### P1 — Personally identifying owner login mailbox in multiple repository files

The owner mailbox is written as literal text in active or historical owner portal configuration and documentation, including:

- `deploy/citizen-owner-portal/.env.example`
- `deploy/citizen-owner-portal/render-free-pilot.yaml`
- `deploy/citizen-owner-portal/render-portal.yaml`
- `deploy/citizen-owner-portal/render.yaml`
- `deploy/citizen-owner-portal/README.md`
- `CODE_OF_CONDUCT.md` contains a personal contact mailbox.

**This report intentionally does not repeat any personal email address.** Those values may also exist in old commits even after edits to the latest version. Public exposure of a configured administrator email can increase targeted phishing and login-abuse risk. It is not, by itself, proof of an account compromise.

**Remediation:** Replace unnecessary personal-email disclosures with appropriate non-sensitive project contact routes, while preserving the running portal's exact approved owner identity in private Render configuration. Review whether Git history must be sanitized before publication. Avoid modifying the current owner email configuration casually: an incorrect change could block intended owner access.

### P1 — Historical branches and previous commits are publishable surfaces

The repository has preserved old branches, reviewed release branches and an archive of historical GitHub discussions. A change to repository visibility would expose accessible source history and Git data, not only the latest `main` tree.

**Remediation:** Full local clone with all branches/tags, forensic secret scanner (for example, Gitleaks), personal-data inspection, license review and historical object analysis before public exposure. If something sensitive is found in history, rotate any exposed credentials and use a controlled history rewrite / carefully constructed clean public repository, with independent verification. Merely deleting a file from `main` does not remove old copies.

### P2 — Application/security release verification is separate

The owner pilot's source specifies `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0`, and the portal includes owner/MFA checks. This **does not verify** the actual running Render secrets, deployment version, denial of unauthorized routes, database durability, backup/restore or privacy/legal requirements.

**Remediation:** Perform black-box owner-only tests, verify Render environment flags privately, document result and rollback. **Do not change access control just to make the repository publicly readable.**

### Licensing and ownership review

The top-level repository contains an MIT license granting broad reuse rights to recipients of the software subject to the license terms. Third-party assets and archived material may have independent rights. Verify provenance and legal statements before distributing the full repository. Copyright registration does not revoke existing MIT permissions.

## Findings not identified by the limited pattern screen

- No matching literal private-key PEM block or common GitHub, AWS or API-key token prefix was identified in the selected inspected text and commit patches.
- The environment example variables and release blueprints contain placeholders, dynamically generated secret settings and/or privately supplied configuration entries; these were not treated as automatically exposing a live token.
- No sensitive file names matching a conventional key/certificate/database-backup extension were identified in the examined branch tip trees.

These are **bounded negative findings**, not proof that no secrets or private data exist.

## Required checklist before changing visibility

- [ ] Decide on public disclosure of the owner's legal name, developer contact channel and any identity-bearing metadata.
- [ ] Move literal owner mailbox references intended to remain private out of current tracked files without interrupting the portal; review the correct Render configuration and release process.
- [ ] Perform **all-history** local Gitleaks scan over all commits, branches and tags, and triage every finding, including false positives.
- [ ] Review archived GitHub PR/issue data and historical commits for contact information, source materials and private project records.
- [ ] Verify GitHub code/secret scanning and dependency alerts where available.
- [ ] Audit binary files and any linked files/attachments for confidentiality.
- [ ] Confirm that code, artwork, photos, logos and historical documents can legally be distributed under the proposed license.
- [ ] Confirm the owner portal is still server-side owner-only and all authentication secrets are protected in the running service.
- [ ] If a secret is exposed, rotate it **before** making data public; remove exposure from history using a reviewed method.
- [ ] Obtain a final human owner approval after reviewing a documented inventory and unresolved risks.

## Operational recommendation

**Keep the present repository private** until the above blockers have been addressed. A curated **new public repository with a clean first commit** may be safer than exposing historical branches and the full internal archive. Keep the original private backup and do not claim the curated repository has been fully cleared until its exact contents are scanned.

This security-review record changes no application code, secrets, deployments or visibility settings.
