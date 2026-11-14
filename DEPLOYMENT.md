# Public demo deployment (Render)

**Only a public, read-only educational demo is supported by this configuration.**

1. Push these files to your GitHub repository, excluding `.venv`, `*.db`, secrets and backups.
2. Sign in to Render with an account you own. Connect GitHub and grant this repository access.
3. Choose **New > Blueprint** and select the repository containing `render.yaml`. Verify that the specified plan is available and its current price/limits before creating it; otherwise use a supported alternative.
4. Confirm the `PUBLIC_DEMO_MODE=1`, `COOKIE_SECURE=1`, and auto-generated `CYBER_SURAKSHA_SECRET` environment settings. Do not publish secret values.
5. Deploy, then open the HTTPS URL assigned by the hosting provider. Test `/`, `/health`, `/fraud-simulator`, `/soc-simulator`, `/zero-trust`, and `/awareness`.
6. Verify that the public report form and vulnerability disclosure form are **read-only** and refuse direct POST submissions. Test on your own deployed demo.
7. Submit only a verified, working URL to MY Bharat. If deployment fails, submit repository and demonstration video instead if permitted by the event rules.

## Limits

- This is a single-instance, demonstration-only web app with ephemeral SQLite storage on many hosting platforms; data can be lost on redeploy or restart.
- Public data submission and SOC note editing are disabled in public mode; no real reports are received.
- There is no production user-account system, CSRF protection for general state-changing workflows, or vetted infrastructure security architecture.
- `/health` provides a liveness response, not a security audit.
- Never claim government, police, bank or CERT-In integration.
- The user must deploy the app under their own hosting account; a GitHub repo link alone is not a website URL.
