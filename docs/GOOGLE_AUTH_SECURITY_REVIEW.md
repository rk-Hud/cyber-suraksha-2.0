# Google citizen authentication security review

Review date: 18 November 2026. CYBER SURAKSHA 2.0 is independently architected,
developed, authored and owned by Jatoth Ramakrishna. This report covers the
Google citizen authentication changes and their local security tests. It does
not certify a production deployment or a successful real Google account login.

## Findings and corrections

| Finding in the initial implementation | Corrected behavior |
| --- | --- |
| The request supplied both an ID token and the nonce against which it was checked, without a server-issued pending flow. | The server issues a five-minute anonymous flow with an opaque token and nonce. The signed nonce, flow token, challenge and expiry are checked and consumed with account/session creation in one transaction. |
| A permissive base64url decoder accepted alternate spellings of a valid RSA signature, defeating a replay fingerprint based on raw token text. | Every JWT segment must have canonical base64url encoding. Accepted credentials also have a database uniqueness constraint on their fingerprints. |
| Authorized-party and numeric-time validation were incomplete. | The verifier rejects a mismatching `azp`, unsupported audience arrays, non-integer times, excessive assertion lifetimes, future issuance and expired assertions. |
| Requests for unknown Google signing-key identifiers could repeatedly fetch keys. | Each verifier uses a bounded, shared refresh promise and refresh cooldown; keys come only from Google's fixed HTTPS JWKS endpoint. Response size, key shape and RSA strength are checked. |
| Email password recovery could create a password for a Google-only account. | Google-linked identities use Google account recovery. Password sign-in and recovery cannot create a second authentication path for them. Existing password-only accounts retain their existing recovery path. |
| A generic long application-session lifetime was used for the new identity flow. | Google-authenticated application sessions expire after thirty minutes. Existing owner password/OTP and TOTP behavior is preserved. |

Google's stable `sub` binds the citizen identity. A matching email never links
an existing password account, and no Google claim grants owner privileges.
An optional private Google test-account allowlist is enforced only after the
identity assertion is verified; listing the owner there never overrides the
owner-email denial. Rejected Google requests emit only a generated request
reference and stable error category, without tokens or private identity claims.
Google's verified-email claim is required, but a non-Gmail address without a
hosted-domain claim is not proof that Google is currently authoritative for
that mailbox. It remains profile/contact metadata rather than a substitute for
the bound Google identity. Do not advertise Google sign-in as government
identity verification or privileged MFA.

## Independent API tests

`services/account-api/test/google-security-audit.test.js` passed **6 tests,
0 failures, 0 skips**. These tests use real RSA signatures and the production
verification code, with an explicitly injected local signing-key response in
test mode. They use disposable loopback PostgreSQL schemas and fictional data;
they do not bypass signature verification or contact a real user's mailbox.

Covered behavior:

- Google citizens A and B cannot read or reply to one another's cases. Direct
  unsupported update/delete requests do not change the case. Anonymous access
  and using a Google ID token as an application bearer are rejected.
- Citizen sessions cannot read administrator records, write content, enroll or
  verify administrator MFA, or dispatch administrator notifications.
- A previously linked identity cannot authenticate an owner-role record or a
  record using the configured owner mailbox, even with different Google email
  metadata.
- Google sessions are fresh, short-lived opaque application tokens. Logout
  invalidates the selected session, and expired or revoked sessions fail.
- Parallel browser flow tokens and nonces cannot be swapped. An accepted flow
  cannot be reused, and the anonymous flow token cannot authorize case access.
- A deliberately rejected database write rolls back the user, Google binding,
  replay fingerprint and authenticated session together. Error responses do
  not disclose the database diagnostic.

Commands, from `services/account-api`, with the disposable PostgreSQL fixture
selected privately and `REQUIRE_DB_TESTS=1`:

```sh
node --test test/google-security-audit.test.js
node --test test/crypto.test.js test/security-audit.test.js test/independent-security.test.js
node --check test/google-security-audit.test.js
npm audit --omit=dev --json
```

The existing crypto/authorization regression subset passed **27 tests,
0 failures, 0 skips**, including password/OTP behavior, bidirectional legacy
password/Fernet compatibility, durable TOTP enrollment, replay rejection and
MFA freshness. The production dependency audit reported **0 known
vulnerabilities** at the time of this check. These counts are separate from the
full backend/frontend suite reported by the release operator.

The injected Google key transport is rejected outside test mode. No Google
Client Secret is needed by the popup credential flow. Database credentials,
session keys, OTP keys, authenticator seeds and mail credentials remain outside
the frontend and this report.

## Deployment acceptance still required

Local signed-token tests do not prove the configured Google Cloud client,
approved test-user list, consent branding, popup behavior or real account
selection works. Those require the actual approved Google account on the
staging interface. If that account is also the configured administrator email,
use a separately approved citizen test account; do not remove the owner-email
denial to obtain a successful test.

Verify compromised credential rotation through private provider settings before
opening a staging service that uses them. Rotation evidence, staging migration
status and actual deployment URLs belong in the release record, not an assumed
test result. No production citizen records were used by these tests, no existing
MFA factor was reset, and no production Function or hosted service was modified
as part of this independent review.

Keep email/password registration disabled until its own sender is operational.
Keep the Google OAuth audience in testing until live acceptance and production
release approval are complete. Production rollout requires a reviewed additive
migration, private restore/rollback preparation and explicit approval; a rendered
Google button or successful health check is insufficient evidence.
