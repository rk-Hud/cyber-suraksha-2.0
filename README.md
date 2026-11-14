# CYBER SURAKSHA 2.0

**From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response**

An independently developed, multilingual digital-safety awareness and training website. The public service offers English, Hindi and Telugu safety material, an on-device scam-signal checker, an action planner, a knowledge quiz, agency references and synthetic training examples.

## Public service

The primary public application is the **FastAPI** service at `deploy/cyber-suraksha-independent/main.py`. Its website assets are in `deploy/cyber-suraksha-independent/site/`.

- Public homepage: `/`
- Health check: `/api/v1/health`
- Access policy: `/permissions.html`
- Account feature status: `/service-status.html`
- Previous preview interface: `/legacy/`

**Citizen registration, real complaint submission, live case intake, email OTP and public administrator tools are not enabled** in this awareness deployment. The site does not send reports to police or banks. For genuine cybercrime in India, use [cybercrime.gov.in](https://cybercrime.gov.in/); the 1930 helpline is available for financial cyber fraud.

## Project sources

The repository also preserves the earlier Flask educational prototype (`app.py`, `templates/`, `static/`, `tests/`, `docs/`) and prior UI experiments in `upgrades/unified-website/`. These are historical and development components, **not** the public Render start command.

The `run_windows.bat` file belongs to the earlier Flask app. Use `START_R4_WINDOWS.bat` to launch the current public site locally.

## Start R4 locally (Windows)

Double-click `START_R4_WINDOWS.bat` or run it in PowerShell from the repository root. It installs R4 dependencies inside an isolated local virtual environment and runs the public FastAPI website on `127.0.0.1:8094`, if the port is available.

## Render configuration

`render.yaml` describes a new Render project (`CYBER SURAKSHA 2.0 - Unified Public`), its `public-preview` environment, and an independent web service using the R4 FastAPI requirements and entrypoint. The deployment starts with auto-deploy disabled; no paid database or account backend is provisioned by this file.

## Privacy and access

- Only synthetic training examples are used in the public backend.
- The on-device checker does not require a citizen account.
- No private certificates, passwords, application secrets, local SQLite files or citizen evidence should be committed to this repository.
- Public access is for education and safe guidance only.

The platform is not affiliated with or approved by any government, bank or law-enforcement agency.

## Documentation

See `docs/REBUILD_DEPLOYMENT.md`, `SECURITY.md`, `PROJECT_DOCUMENTATION.md`, and `deploy/cyber-suraksha-independent/SECURITY_LIMITATIONS_RELEASE.md` for details.
