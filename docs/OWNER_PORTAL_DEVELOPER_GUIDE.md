# Owner portal — current developer and operator guide

![Private owner access flow](assets/owner-access-flow.svg)

[Documentation center](README.md) · [Architecture](ARCHITECTURE.md) · [Owner access review](OWNER_PORTAL_ACCESS_REVIEW.md) · [Release readiness](RELEASE_READINESS.md)

## Application scope

The separately maintained portal at [deploy/citizen-owner-portal/](../deploy/citizen-owner-portal/) is a **Flask owner-operations pilot** and is not the public FastAPI awareness website. The independent project is not a government complaint portal. Until independently reviewed and released for real use, keep test data fictional.

### Source map

| Source | Role |
| --- | --- |
| [Portal factory](../deploy/citizen-owner-portal/portal/__init__.py) | Configuration and private-mode request gate |
| [Routes](../deploy/citizen-owner-portal/portal/routes.py) | Account, owner and controlled-case operations |
| [Security controls](../deploy/citizen-owner-portal/portal/security.py) | Session, CSRF, owner authorization and MFA checks |
| [Database models](../deploy/citizen-owner-portal/portal/models.py) | Portal persistence |
| [Templates](../deploy/citizen-owner-portal/templates/portal/) | Portal interfaces |
| [Styles](../deploy/citizen-owner-portal/static/css/site.css) | Website CSS |
| [Tests](../deploy/citizen-owner-portal/tests/) | Automated security and behavior checks |
| [Pilot Blueprint](../deploy/citizen-owner-portal/render-free-pilot.yaml) | Intended owner-only hosting configuration |

## Verified source intent

The pilot's `render-free-pilot.yaml` configures:

```dotenv
PRIVATE_MODE=1
PUBLIC_REGISTRATION=0
FORCE_HTTPS=1
```

The running Render values and live authorization outcomes require independent verification. Anonymous access to login, account verification, recovery or health endpoints is compatible with an owner-only **protected operation** policy; it is not proof of an administrator bypass.

The admin login endpoint is `/en/admin/login`. Owner administrative routes require an active owner session and recent authenticator MFA. See the [access review checklist](OWNER_PORTAL_ACCESS_REVIEW.md) for negative tests covering anonymous sessions, non-owner users, expired MFA, invalid CSRF and protected data.

## Developer setup and evidence

Use an isolated Python environment and portal-specific [requirements](../deploy/citizen-owner-portal/requirements.txt). Keep the PostgreSQL URL, password-derived encryption keys, OTP/TOTP keys and email-sender credentials only in approved private settings. Do not copy secrets to Git or screenshots.

Run the [portal tests](../deploy/citizen-owner-portal/tests/), save exact version and results, and carry out a browser acceptance review against the intended service using only synthetic identities. The separate public website is not automatically protected by the portal's configuration.

## Integrity manifests — preserve original release evidence

The `SOURCE_INTEGRITY_MANIFEST.json` within the owner portal includes the original `README.md`, `SECURITY.md` and `docs/REPUTATION.md` in its hashed file list. Those documents are **baseline release evidence** and are not edited by this documentation upgrade.

For current navigation and professional presentation, **use this developer guide and the root documentation center** instead of silently changing hashed source-baseline files. If a future source release intentionally changes manifest-covered files, create a new versioned manifest through a verified build procedure; do not overwrite original hashes or claim the historical manifest still validates modified files.

The accompanying `PILOT_PATCH_MANIFEST.json` is also preserved as a historical pilot patch record.

## Clarifying earlier release instructions

Earlier `render-portal.yaml` and dated publication guides describe **alternative public-registration designs and historical branches**. They are not the current private owner-pilot policy. Do not use a public Blueprint or an older repository URL for a live owner pilot without explicit independent review.

## Safety and governance

Keep this pilot separate from the public awareness site and from real police/bank reporting services. Verify security, backups, retention, delivery reliability and access limits before any use beyond fictional testing. For actual Indian cybercrime reporting, use [cybercrime.gov.in](https://cybercrime.gov.in/) and call **1930** for urgent financial fraud.
