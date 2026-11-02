<div align="center">

# CYBER SURAKSHA 2.0

### From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response

**A local-first educational cybersecurity and cyber-fraud response prototype, with an optional public read-only demonstration mode**

[Features](#features) · [Quick start](#quick-start) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## Project overview

CYBER SURAKSHA 2.0 is a Python/Flask learning prototype that brings together cyber-fraud awareness, fictional incident intake, SOC alert triage practice, simulated Zero Trust decisions and responsible vulnerability-disclosure practice. It is designed for demonstrations, beginner learning and social-impact awareness.

> **Important:** This is not an official cybercrime reporting service or a production security platform. Data is stored locally in SQLite. The application does not contact law-enforcement agencies, CERT-In, banks, UPI providers, telecom operators or live SIEM/EDR systems. It cannot block payments, isolate devices or enforce real access decisions.

## Features

| Module | What the prototype demonstrates |
|---|---|
| Cybercrime reporting | Local form validation, incident reference and incident detail view |
| Incident register | Dashboard summary and locally stored incident list |
| Financial fraud simulator | Fictional UPI collect/refund and remote-access scam decision practice |
| SOC investigation simulator | Synthetic alerts, severity filtering, analyst notes and workflow status |
| Zero Trust monitor | Simulated identity/device/context decisions; no real access is enforced |
| Responsible disclosure | Local intake for fictional training assets |
| Awareness centre | English, Hindi and Telugu awareness content and quiz |
| Health endpoint | Basic application status response at `/health` |

## Technology stack

- **Backend:** Python 3.10+ and Flask 3.1.1
- **Database:** SQLite (created locally by the application)
- **Frontend:** HTML, CSS, Jinja templates
- **Testing:** Python `unittest` and Flask test client
- **Runtime:** Local Windows development using the included batch launcher; optional public read-only demo via WSGI hosting

## Quick start

### Requirements

- Windows 10/11 (the included launcher is for Windows)
- Python 3.10 or newer installed and available on `PATH`
- Internet access for the first dependency installation only

### Run the application

1. Download or clone this repository and extract it if downloaded as a ZIP.
2. Open the project folder.
3. Double-click `run_windows.bat`.
4. Wait for the local server to start, then open **http://127.0.0.1:5000/** in your browser.
5. To stop the server, focus its terminal window and press `Ctrl+C`.

### Manual setup with PowerShell

Run these commands from the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

If PowerShell blocks virtual-environment activation, use the environment's Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

## Run tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The test suite uses a temporary SQLite database so test records do not need to be written into the normal local database. See [TESTING.md](docs/TESTING.md) for coverage and manual checks. Do not claim tests passed unless you have run them successfully in your environment.

## Repository layout

```text
CYBER_SURAKSHA_2_0_COMPLETE/
├── app.py                    # Flask routes, database setup and module logic
├── requirements.txt          # Python dependencies
├── run_windows.bat           # Windows setup and launch helper
├── templates/index.html      # Homepage (dashboard)
├── templates/                # Other Jinja HTML pages
├── static/style.css          # Application styles
├── static/app.js             # Client-side incident search
├── scripts/                  # Offline release verification
├── render.yaml               # Optional public read-only hosting
├── tests/test_app.py         # Automated integration tests
├── docs/                     # Architecture, design and testing documentation
├── sample_data/              # Safe, fictional examples for documentation
├── .github/workflows/        # Automated test workflow
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── LICENSE
└── .gitignore
```

## Data and privacy

- The app creates `cyber_suraksha.db` in the project directory when run.
- The database is intentionally excluded from Git by `.gitignore` because local submissions may contain personal information.
- Use only fictional sample data in demonstrations, screenshots, tests and public issue reports.
- Never enter real passwords, OTPs, UPI PINs, card numbers, authentication tokens or sensitive victim details.
- Back up your local database before changing or replacing project files.

See [SAFE_SAMPLE_DATA.md](SAFE_SAMPLE_DATA.md) and [SECURITY.md](SECURITY.md).

## Limitations and responsible use

This prototype is for education and demonstration. It has no verified government/bank integrations, no live threat-intelligence feeds, no production authentication/authorization model and no real endpoint isolation or payment controls. The simulated SOC and Zero Trust outcomes are learning exercises, not operational security decisions.

Do not expose this development server to the public internet. A production deployment would require, at minimum, a security architecture review, authentication, authorization, CSRF protection, secure session configuration, secret management, HTTPS, input validation review, audit logging, retention controls, backups and independent testing.

For a real cyber financial fraud in India, contact your bank through its official channel and report promptly through the national cybercrime helpline **1930** or the official portal **https://cybercrime.gov.in/**. This project does not submit reports to those services.

## Project status

Educational prototype covering the listed Stages 1–8 modules. The repository documents the current code as supplied; it does not imply certification, government endorsement, production readiness or independently verified real-world impact.

## Acknowledgements

Built as a student-led social-impact learning project. Contributions, feedback and responsible educational use are welcome under the terms of the included licence.

## Mobile app-like installation

Once the public HTTPS website is live, users can open it in a supported mobile browser and select **Add to Home Screen** or **Install app** (if their browser offers that option). A web-app manifest and app icons are included. This is a mobile-friendly web application, **not a native Android APK, Play Store listing, or offline-capable app**. It requires an internet connection.

## Public demonstration deployment

For a **read-only public website**, follow [DEPLOYMENT.md](DEPLOYMENT.md). The supplied `render.yaml` sets `PUBLIC_DEMO_MODE=1` to disable submission of incident reports, vulnerability disclosures, and SOC investigation notes. Synthetic dashboards, multilingual quizzes and educational simulations remain accessible. Hosting requires a provider account and a verified HTTPS deployment URL. The GitHub repository alone is not a live hosted application.

Before uploading run `python scripts/check_release.py` and `python -m unittest discover -s tests -v`. The automated test suite does not constitute a security audit.

## Maintainer and project ownership

Project lead / repository maintainer: **Jatoth Ramakrishna** (SENTRIX SYSTEMS). See [ownership and licensing notes](OWNERSHIP_AND_CREDITS.md). Ownership of the GitHub account does not supersede third-party licences.
