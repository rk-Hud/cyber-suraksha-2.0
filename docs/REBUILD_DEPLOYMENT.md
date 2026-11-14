# CYBER SURAKSHA 2.0 — independent website deployment

## Version and scope

This repository merges the historical Flask education modules from the original `main` branch and the independently deployed R4 FastAPI public preview from the signed-off release branch. The R4 public preview is the Render entrypoint.

The original Flask modules are retained for local education and development. They are not connected to the public R4 API. The separate R5 administrator review source is intentionally excluded.

## Verified migration sources

- Original source: `rk-Hud/cyber-suraksha-2.0`, branch `main`, commit `48dc47dcc25a7a19f0d488e092ed8ae0cf3f2846`.
- R4 public preview: same original repository, branch `release/cs20-independent-20261112-2154349612`, commit `7059598a4213d7ce7c4e151d91e3f5104240a6f3`.

The migration script refuses to assemble a new repository if either commit has changed unexpectedly. Recheck the release before modifying those values.

## Deployment

Build command: `pip install -r deploy/cyber-suraksha-independent/requirements.txt`

Start command: `cd deploy/cyber-suraksha-independent && uvicorn main:app --host 0.0.0.0 --port $PORT --no-access-log`

Readiness endpoint: `/api/v1/health`.

Suggested Render Blueprint project: `CYBER SURAKSHA 2.0 - Unified Public`, environment `public-preview`, web service `cyber-suraksha-2-0-unified-public`, Singapore region, free plan, automatic deploy disabled.

## Security gates

Do not enable real citizen registration, case intake, email OTP or administrator operations until an authorized persistent datastore, verified outbound mail, MFA, data retention/privacy policy, backup/restore validation and security acceptance have been completed.

Do not connect this public preview to local enterprise Nginx, certificate authorities, databases or credentials.

Do not confuse the training website with an official government complaint portal.

## Rollout and retirement

1. Prepare new repository from verified branches.
2. Run code and security checks.
3. Create the new repository and push only the reviewed files.
4. Deploy a separate Render service from the new repository.
5. Confirm the new service is live and the site works across language pages, browser interactions, HTTP security headers and blocked account routes.
6. Check old deployment dependencies, download repository backup and any logs/documents that must be retained.
7. Only then consider removing old web services and old GitHub repository using the provider dashboard.

Repository deletion and service deletion are intentionally **not** performed by the migration package. They are irreversible and may remove public links, service logs and Git history.
