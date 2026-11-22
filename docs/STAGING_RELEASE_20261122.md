# Staging release record — 22 November 2026

**Candidate version:** v2.2.0-staging. This is not production acceptance or government certification.

## Observed deployment evidence

- Citizen Function csgooglestage deployment 7; owner Function csownerstage deployment 5; Node.js 24. Both completed.
- Pages staging commit c7a0b5e; complaint-details update b8191c8. Pages deployment and source CI shown successful by owner.
- Backend bundles from review commit 3c663a01fba4310ad96fe9a06f34c2e6d40fdf5f; both SHA-256 manifest entries verified locally.
- Owner browser evidence: Google sign-in, owner MFA dashboard, three fictional case records, full case description and activity timeline. Citizen browser evidence: Google sign-in, private case tracking and administrator replies.
- Cloudflare forwarding enabled with a server-only secret; both gateway requests without user sessions returned 401 after synchronization.
- Direct native application paths without gateway credentials returned 403. Both health endpoints returned 200.

## Security assessment (bounded evidence)

| Control | Evidence / outstanding test |
| --- | --- |
| Authentication | Citizen and owner sign-in demonstrated; session revocation/replay tests remain |
| Access control | Separate owner API and fresh MFA in source; live bidirectional cross-account denial remains |
| Injection | Parameterized case detail queries and text-only rendering reviewed; independent assessment remains |
| Edge protection | Route allowlist and rate-limit bindings configured; live throttling acceptance remains |
| Logging | Owner dashboard displays audit and activity tabs; complete event semantics verification remains |
| Privacy | Fictional staging warning; retention review remains |
| Recovery | Earlier encrypted backup reported; restore failed on pg_attver. No verified recovery claim |

## Recovery and release gates

Keep PR #11 open until a corrected isolated restore is verified. Never publish dumps, credentials or private citizen data. Keep issue #9 open for remaining security, privacy and separately authorized production requirements. Do not rotate existing production secrets or modify production deployments under this staging record.

A candidate tag may identify a tested source revision, but does not certify recoverability. The main source must include the gateway configuration and deployed administrator complaint-detail code; validate CI before integration. Existing production deployment records are historical and unchanged.

## Links

- [Citizen staging](https://rk-hud.github.io/cyber-suraksha-2.0/google-test/en/account.html)
- [Owner staging](https://rk-hud.github.io/cyber-suraksha-2.0/google-test/en/operator.html)
- [Recovery PR](https://github.com/rk-Hud/cyber-suraksha-2.0/pull/11)
- [Release acceptance issue](https://github.com/rk-Hud/cyber-suraksha-2.0/issues/9)
