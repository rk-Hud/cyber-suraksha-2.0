<p align="center">
  <img src="docs/assets/cyber-suraksha-banner.svg" alt="CYBER SURAKSHA 2.0 — Independent Cyber Fraud Awareness and Owner Operations" width="100%">
</p>

<h1 align="center">CYBER SURAKSHA 2.0</h1>
<p align="center"><strong>From Cyber Fraud Awareness to Intelligent Cybercrime Prevention &amp; Response</strong></p>
<p align="center">Independent cybersecurity awareness · Multilingual education · Controlled owner operations</p>

<p align="center">
  <a href="docs/PROJECT_OVERVIEW.md">Project overview</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/TECHNOLOGY_STACK.md">Technologies</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="SECURITY.md">Security</a>
</p>

---

## About the project

CYBER SURAKSHA 2.0 is an independently maintained platform for digital-safety education, fraud-signal awareness and synthetic cybersecurity training. It combines a **public multilingual awareness website** with a **separately configured private owner portal pilot**. These services have different deployment and security boundaries; this repository also retains earlier training applications and historical release evidence.

**Independent project:** no college, institution, company, government department, police service or bank operates or endorses this repository. The name and professional presentation do not imply official authority or certification.

## Explore the platform

| Project component | What it offers | Source | Audience |
| --- | --- | --- | --- |
| **Public awareness site** | English, Hindi, Telugu; digital safety; scam-signal tools; action planner and knowledge quiz | [FastAPI service](deploy/cyber-suraksha-independent/) | Public learners |
| **Owner-only portal pilot** | Owner authentication, MFA, protected administrative workflows and synthetic testing | [Flask portal](deploy/citizen-owner-portal/) | Configured owner |
| **SOC and incident training** | Fictional reports, alerts and investigation exercises | [Historical Flask app](app.py) | Local training |
| **Earlier unified interface** | Previous local website and evaluation work | [Archived development](upgrades/unified-website/) | Reference |

> **Safety boundary:** The public awareness site does not file police complaints. The private pilot must not collect real citizen or victim records before independent security, privacy, backup and release checks. See [release readiness](docs/RELEASE_READINESS.md).

## Architecture

![Two independent application boundaries](docs/assets/platform-architecture.svg)

The public awareness site runs with **FastAPI + Uvicorn**. The separately configured owner portal uses **Flask, PostgreSQL-oriented persistence and Gunicorn**. The historical Flask/SQLite training app is preserved for reference and local demonstrations.

[Full architecture](docs/ARCHITECTURE.md) · [Technical design](docs/TECHNICAL_DESIGN.md) · [Owner security review](docs/OWNER_PORTAL_ACCESS_REVIEW.md)

## Programming languages and tools

<p>
  <img alt="Python" src="https://img.shields.io/badge/Python-backend-3776AB?logo=python&logoColor=white">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-pages-E34F26?logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-styling-1572B6?logo=css&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-interactions-F7DF1E?logo=javascript&logoColor=black">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-owner%20data-4169E1?logo=postgresql&logoColor=white">
  <img alt="GitHub" src="https://img.shields.io/badge/GitHub-source-181717?logo=github&logoColor=white">
</p>

| Area | Technologies |
| --- | --- |
| Backend | Python, FastAPI, Flask, Jinja |
| Frontend | HTML5, CSS3, JavaScript |
| Persistence | SQLite (legacy), PostgreSQL and SQLAlchemy (portal) |
| Access controls | Password and email OTP, owner TOTP, sessions, CSRF |
| Hosting and developer tools | Render, Uvicorn, Gunicorn, Git, GitHub, Windows PowerShell |
| Optional integrations | Resend HTTPS email API; Google Safe Browsing reputation checks when configured |

For verified code paths and dependency lists, open the [technology stack and code map](docs/TECHNOLOGY_STACK.md).

## Running the applications

**Awareness website (Windows):**

```powershell
.\START_R4_WINDOWS.bat
```

The public awareness launcher is intended for local use at `http://127.0.0.1:8094/` when that port is available. See [current deployment instructions](docs/REBUILD_DEPLOYMENT.md).

**Owner portal:** do not apply the awareness launcher or public Blueprint to the private portal. Follow the [owner pilot instructions](deploy/citizen-owner-portal/README_FREE_OWNER_PILOT.md) and use a separate persistent database, privately configured mail credentials, owner authentication and MFA. The [access review checklist](docs/OWNER_PORTAL_ACCESS_REVIEW.md) distinguishes code policy from actual live verification.

**Original educational app:** `run_windows.bat` and `app.py` are preserved for historical Flask/SQLite training; see [project documentation](PROJECT_DOCUMENTATION.md).

## Documentation and resources

| Guide | Link |
| --- | --- |
| Documentation center | [docs/README.md](docs/README.md) |
| Project and feature overview | [Project overview](docs/PROJECT_OVERVIEW.md) |
| Technical design and languages | [Technology stack](docs/TECHNOLOGY_STACK.md) |
| Security, privacy and access controls | [Security](SECURITY.md) · [Owner access](docs/OWNER_PORTAL_ACCESS_REVIEW.md) |
| Testing and release criteria | [Testing](docs/TESTING.md) · [Release readiness](docs/RELEASE_READINESS.md) |
| Accessibility and contribution | [Accessibility](ACCESSIBILITY.md) · [Contributing](CONTRIBUTING.md) |
| Copyright documentation | [Preparation checklist](docs/COPYRIGHT_REGISTRATION_PREPARATION.md) |
| Media and attribution | [Media credits](docs/VISUAL_ASSETS.md) |


## Responsible use

Only use fictional data in demonstrations and testing. CYBER SURAKSHA 2.0 is **not** a government or law-enforcement reporting website. For real cybercrime reporting in India, use the [National Cyber Crime Reporting Portal](https://cybercrime.gov.in/), and for urgent financial cyber fraud call **1930**. Seek appropriate professional help for serious incidents.

## Ownership and license

Maintained independently at [rk-Hud/cyber-suraksha-2.0](https://github.com/rk-Hud/cyber-suraksha-2.0). The repository's top-level [MIT License](LICENSE) applies according to its terms; separate third-party media and dependencies retain their own licenses. Authorship and exclusive rights for a particular component must be supported by evidence when making legal declarations. See [copyright preparation](docs/COPYRIGHT_REGISTRATION_PREPARATION.md).

---

<p align="center"><sub>CYBER SURAKSHA 2.0 · Cyber safety through awareness, practical guidance and responsible engineering</sub></p>
