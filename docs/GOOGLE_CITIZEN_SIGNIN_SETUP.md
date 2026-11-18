# Google citizen sign-in — staged integration (not deployed)

This change stages an opt-in **Sign in with Google** flow for CYBER SURAKSHA 2.0 without a custom email-sending domain. Google Identity Services provides the identity assertion; the existing Neon Function verifies it and continues issuing its own server-controlled portal session. It is **not** a switch to Neon Managed Auth or a replacement for the existing PostgreSQL user IDs and owner TOTP enrollment.

## Deployment status

- This feature branch contains source code only. The main site and Neon Function are unchanged.
- No Google OAuth client ID has been configured; no live Google sign-in has been demonstrated.
- `GOOGLE_SIGNIN_ENABLED=0` and `GOOGLE_REGISTRATION_ENABLED=0` are safe defaults.
- Existing email/password + OTP and administrator MFA behavior is unchanged.
- Never enable Google identity for administrators. The Google route creates/accepts **citizen** roles only.
- Public report collection is a separate release decision requiring privacy, retention and abuse handling.

## Operator setup — no private keys in GitHub

1. In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** of application type **Web application**. Configure the consent branding and the eligible test users while testing. You do not need a custom domain for the JavaScript origin.
2. Set the **Authorized JavaScript origin** to `https://rk-hud.github.io`. Do **not** include `/cyber-suraksha-2.0/en/` because origins cannot contain paths. For the Google Identity Services popup callback approach used here, no custom redirect URI is used by the frontend.
3. On a **separate Neon staging branch**, apply `services/account-api/sql/002-google-citizen-auth.sql`. Existing `portal_*` tables and existing MFA encrypted secrets remain as-is. Verify the new tables exist and check the target database/branch before applying anything.
4. Put the Google **web client ID** (not a client secret) in the private Neon Function setting `GOOGLE_CLIENT_ID`, initially with both new feature flags disabled. Ensure `API_SESSION_KEY` and `API_OTP_KEY` still exist. Keep the exact existing `TOTP_ENCRYPTION_KEY` for the owner account; do not recreate an unrelated key.
5. Set `web/pages/source/site.json`'s `google_client_id` to that same **public client ID** on a staging Pages build. Only the non-secret client ID may appear in static HTML. The builder permits the Google script/frame CSP only on account pages when the ID is present.
6. Deploy a reviewed staging API revision with the new Google module, first with `GOOGLE_SIGNIN_ENABLED=1`, `GOOGLE_REGISTRATION_ENABLED=0`. Check the API health capability and confirm unknown Google accounts are rejected without creating a user.
7. For consented fictional test accounts, enable `GOOGLE_REGISTRATION_ENABLED=1` **only in staging**. Test Google popup, nonce binding, expired token, wrong audience, signature tampering, failed origin, reused token, blocked existing-email collision, owner-email rejection, and proper citizen-only session issuance.
8. Verify a new Google citizen can read only their own fictional cases, and cannot read the admin endpoints or an existing password-account user's cases. Verify logout and session expiration. Run administrator TOTP regression tests independently. Use the existing owner admin sign-in, not Google, for owner privileges.
9. Before any public release: independent security/privacy review, privacy notice and consent, data retention/deletion procedures, rate limiting and abuse review, mail delivery strategy for existing password accounts, production monitoring, encrypted backup/restore and rollback plan.
10. Only after production acceptance, deploy the backend and publish built Pages assets, recheck exact health, CORS, CSP and browsers. Never retire a current backend purely because the Google button renders.

### Data protection properties

- The server validates the Google ID token's signature against Google's public JWKs, issuer, audience, expiry, issued-at time, nonce, and verified-email claim. Google's stable `sub` uniquely binds the user. Never authorize a user based solely on the presented email address.
- An existing email/password account cannot be claimed automatically by matching a Google email; it requires a separately designed, verified linking ceremony. An existing owner is NEVER allowed through this citizen route.
- Each Google ID token has a server-side SHA-256 fingerprint stored for replay defense; add periodic retention cleanup before production. Raw Google ID tokens and secrets are not stored in the repository or database.
- Existing `portal_sessions` and complaint ownership checks remain server-side. A Google ID token is **not** a complaint API bearer token; the Neon API issues its own session after verification and database checks.
- Consent is required for creating a new Google account. Do not use Google SSO as proof of government identity, law-enforcement authorization or privileged MFA.

### Developer verification

```bash
cd services/account-api
node --test test/google-oidc.test.js
node --test test/*.test.js
node --check src/app.js
node --check src/config.js
node --check src/google-oidc.js
cd ../../web/pages
python scripts/export_site.py
```

The Google verification unit test uses an ephemeral RSA key and a mocked JWK endpoint. It does not access a live Google account. Also run real browser end-to-end acceptance against the correct staging branch before enabling anything.

### Key files

- `services/account-api/src/google-oidc.js` — token signature and assertion checks.
- `services/account-api/src/app.js` — citizen-only `POST /api/v1/auth/google`, preserves admin MFA.
- `services/account-api/sql/002-google-citizen-auth.sql` — stable-sub binding and used-token fingerprints.
- `web/pages/source/static/js/google_signin.js` — optional Google button with one-time random nonce and explicit consent.
- `web/pages/source/templates/base.html`, `account.html` — page integration, conditional CSP.
- `web/pages/source/site.json` — empty `google_client_id` until an actual Google OAuth web client exists.

The previous Resend key exposed in conversation should be rotated even if Google sign-in is selected; no keys have been committed or copied into this implementation. Resend is still required for production email OTP/password recovery flows if those remain offered.
