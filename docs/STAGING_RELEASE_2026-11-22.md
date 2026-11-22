# Staging release record — 22 November 2026

**Functional staging demonstration; not production authorization or external security certification.** Use fictional case records only.

| Component | Evidence |
|---|---|
| Citizen API | Neon staging Function deployment 7 |
| Owner API | Neon staging Function deployment 5 |
| Static website | Pages commits c7a0b5e and b8191c8; successful Pages builds reported |
| Reviewed backend | 3c663a01fba4310ad96fe9a06f34c2e6d40fdf5f |
| Complaint details | e61287d4786355a473ee39e938b11131166d81a0 |
| Browser acceptance | Owner-reported screenshots show Google citizen sign-in, owner MFA/dashboard, complaint directory, original complaint and replies |
| Gateway | CORS preflight 204; both protected routes return 401 without a session through the gateway; direct native calls without gateway secret returned 403 |
| Integrity | Owner verified the downloaded backend bundle checksums against the CI manifest |

## Remaining acceptance gates

- Private backup restoration: earlier local restore failed; no successful corrected restore evidence. Track #11.
- Cross-account authorization and expired/revoked-session replay: source/CI coverage is not equivalent to a complete live adversarial review.
- Verify explicit logout, account disable, live rate-limit behavior, mobile authenticated views, audit completeness and privacy/retention policy.
- Worker native Neon origins remain reachable at network level; application guard rejects unauthorized work. workers.dev staging is not a custom-domain production WAF.
- Email delivery remains dependent on provider configuration; no claim of real delivery.
- Production activation, credential rotation and production data changes remain outside this staging release.
- No external penetration-test or government approval claimed.

See #9 for acceptance tracking. Never commit secrets, tokens, database archives, personal citizen data or real complaint content. Do not use a staging release as an official reporting channel.
