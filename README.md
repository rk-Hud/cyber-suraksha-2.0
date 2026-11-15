# CYBER SURAKSHA 2.0

### From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response

**An independent cybersecurity awareness, education and owner-operations project.**

[Overview](#overview) · [Applications](#applications) · [Architecture](#architecture-at-a-glance) · [Getting started](#getting-started) · [Security](#security-and-access-control) · [Documentation](#documentation) · [Ownership](#ownership-and-licensing)

---

## Overview

CYBER SURAKSHA 2.0 brings together multilingual digital-safety guidance, scam-signal education, a practical response planner, and an isolated portal for controlled owner operations. The repository preserves the current applications as well as earlier training and prototype work.

**Important distinction:** the public **awareness site** and the **owner-only pilot portal** are different services with different access policies. The awareness website is public by design. The pilot portal is configured for private, owner-only use. Neither service is an official government cybercrime-reporting system.

The project is independently managed and is **not an institutional, college, university, police or government programme**. The software should not be represented as officially endorsed or certified.

## Applications

| Component | Location | Purpose | Access |
| --- | --- | --- | --- |
| Multilingual awareness site | `deploy/cyber-suraksha-independent/` | English, Hindi and Telugu educational guidance, scam-signal checking, action planning and learning tools | Public educational content |
| Owner portal pilot | `deploy/citizen-owner-portal/` | Controlled owner sign-in, support-case workflows, administration and testing | Private mode; owner authentication and MFA for admin actions |
| Original Flask training application | `app.py`, `templates/`, `static/`, `tests/` | Earlier simulations and training material | Development and historical reference |
| Previous interface work | `upgrades/unified-website/` | Earlier integrated website experiments | Development and historical reference |

### Multilingual awareness site

- English, Hindi and Telugu interfaces.
- Safety information, practical fraud-response steps and agency references.
- Browser-based scam-signal tools and learning materials.
- Health, privacy, permissions and service-status pages.

**Scope:** no public account registration, real police complaint submission, official case filing or live incident intake is enabled in this awareness deployment. Its educational tools are not substitutes for banks, law enforcement or professional incident response.

### Owner portal pilot

- Dedicated administrator entry at `/en/admin/login`; owner dashboard at `/en/admin`.
- Password and emailed verification challenge, with recent authenticator MFA required for protected owner administration.
- Private-mode access policy and disabled public self-registration in the free pilot Blueprint.
- Case, user, multilingual content and manual notification operations intended for controlled testing.
- Synthetic data and test accounts only until independent security, privacy, backup and delivery checks have passed.

The pilot is **not approved for collection of real complaints or sensitive citizen records**.

## Architecture at a glance

```text
cyber-suraksha-2.0/
├── deploy/
│   ├── cyber-suraksha-independent/
│   │   ├── main.py             # FastAPI awareness service
│   │   └── site/               # public multilingual site assets
│   └── citizen-owner-portal/
│       ├── portal/             # Flask private-portal application
│       ├── templates/          # owner and account interfaces
│       ├── tests/              # security and functional checks
│       └── render-free-pilot.yaml
├── app.py                      # earlier Flask training app
├── docs/                       # architecture, tests and operations
├── tests/                      # earlier application tests
└── render.yaml                 # independent public-site configuration
```

The awareness site uses **FastAPI**. The owner portal uses **Flask** with PostgreSQL-oriented configuration. These applications must be reviewed and deployed independently; do not confuse a Blueprint configuration with a verified live deployment.

## Getting started

### Awareness site (Windows)

From the repository root, run:

```powershell
.\START_R4_WINDOWS.bat
```

The launcher is intended to start the educational website locally at `http://127.0.0.1:8094/` when the port is available. See [rebuild deployment instructions](docs/REBUILD_DEPLOYMENT.md).

### Owner portal

Read the [private pilot preparation guide](deploy/citizen-owner-portal/README_FREE_OWNER_PILOT.md) before running or deploying the portal. Its database URL, session keys, owner mailbox and mail credentials belong in protected environment settings, **never** in committed files. Use a separate persistent database for the pilot, review provider costs and configuration, and test using fictional records.

Do not modify the public awareness deployment when preparing the private portal.

## Security and access control

| Requirement | Expected pilot policy |
| --- | --- |
| Private mode | `PRIVATE_MODE=1` |
| Public registration | `PUBLIC_REGISTRATION=0` |
| Owner identity | Exact configured `ADMIN_EMAIL` |
| Administrative operations | Active owner session plus recent authenticator MFA |
| State-changing requests | Server-side CSRF and authorization checks |
| Secrets and personal data | Excluded from source control |
| Live citizen reports | Not permitted in the unreviewed pilot |

Some login, recovery, verification, health and static endpoints must remain reachable to make owner sign-in and health checks possible. **Owner-only access does not mean that every URL returns 403 without a session.** The protected application functions must reject unauthorized users on the server.

This table describes repository configuration, **not a claim that the deployed service has passed a live penetration test**. See [owner portal access review](docs/OWNER_PORTAL_ACCESS_REVIEW.md), [security policy](SECURITY.md) and the [pilot security guidance](deploy/citizen-owner-portal/SECURITY.md).

For an actual cybercrime complaint in India, use [cybercrime.gov.in](https://cybercrime.gov.in/). For urgent financial cyber fraud, the national helpline is **1930**.

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components and system boundaries |
| [Technical design](docs/TECHNICAL_DESIGN.md) | Implementation background |
| [Testing](docs/TESTING.md) | Test coverage and verification guidance |
| [Owner portal access review](docs/OWNER_PORTAL_ACCESS_REVIEW.md) | Admin-only pilot requirements and release checks |
| [Copyright preparation](docs/COPYRIGHT_REGISTRATION_PREPARATION.md) | Software filing evidence checklist |
| [Deployment](docs/REBUILD_DEPLOYMENT.md) | Awareness deployment instructions |
| [Security](SECURITY.md) | Responsible vulnerability reporting |

## Ownership and licensing

**Project:** CYBER SURAKSHA 2.0  
**Repository maintainer:** [rk-Hud](https://github.com/rk-Hud)  
**Project status:** Independently maintained; no government or institutional affiliation

The repository includes original project work, historical material and third-party dependencies, each subject to its actual rights and attribution requirements. Claims in legal filings should be based on verified authorship and ownership evidence.

The top-level repository currently uses the **MIT License**: see [LICENSE](LICENSE). The MIT License grants broad reuse rights subject to its conditions; copyright registration does not retroactively revoke licenses already granted. Do not assume that all third-party assets or dependencies are covered by this repository's license.

---

<sub>CYBER SURAKSHA 2.0 • Independent cybersecurity awareness and controlled owner-operations project.</sub>
