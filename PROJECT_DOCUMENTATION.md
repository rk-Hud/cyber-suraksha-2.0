# CYBER SURAKSHA 2.0 — Project Documentation

**Project:** From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response

## Purpose
A beginner-friendly, local-only educational prototype that demonstrates structured cybercrime incident intake, fraud-response decision practice, SOC alert triage, simulated Zero Trust decisions, responsible disclosure intake for fictional assets, and cyber-safety awareness.

## Technology
- Python 3.10+ and Flask 3.1.1
- SQLite database, created automatically on first launch
- HTML, CSS and Jinja templates
- Runs locally at `http://127.0.0.1:5000/`
- No paid API or cloud account required

## Development stages included
1. **Stage 1 — Smart Cybercrime Reporting:** local incident intake, validation and reference number.
2. **Stage 2 — Incident Register:** dashboard, incident list and local detail view.
3. **Stage 3 — Financial Fraud Simulator:** fictional UPI collect/refund and remote-access scam scenarios with response scoring.
4. **Stage 4 — SOC Investigation Simulator:** synthetic alerts, severity/status filters, analyst assessment, notes and workflow status.
5. **Stage 5 — Zero Trust Monitor:** simulated identity/device/context decisions; no real access is enforced.
6. **Stage 6 — Responsible Vulnerability Disclosure:** local report workflow for fictional training assets.
7. **Stage 7 — Awareness Centre:** English, Hindi and Telugu learning content and quiz.
8. **Stage 8 — Integration and Security Testing:** consolidated application, additive database setup, automated tests and manual test checklist.

## Important limitations
This is a demonstration prototype, not an official cybercrime reporting service. It does not connect to police, CERT-In, banks, UPI providers, telecom operators, real SIEM/EDR tools or live networks. It does not block payments, isolate devices, enforce production access control, verify vulnerability reports or submit complaints. No real victim data should be stored.

## Local setup
1. Extract the ZIP to a folder you control, for example `Documents\CYBER_SURAKSHA_2_0_COMPLETE`.
2. Install Python 3.10 or newer. On Windows, enable **Add Python to PATH**.
3. Double-click `run_windows.bat`. It creates `.venv`, installs Flask, creates the SQLite database and starts the app.
4. Open `http://127.0.0.1:5000/`.
5. Stop the server with `Ctrl+C` in its terminal window.

## Run automated tests
Open PowerShell in the extracted project folder and run:

```powershell
.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

If PowerShell blocks activation, run the tests directly with `.venv\Scripts\python.exe -m unittest discover -s tests -v`.

## Database
`cyber_suraksha.db` is created automatically in the project folder. Keep a backup before deleting or replacing it. The application uses `CREATE TABLE IF NOT EXISTS` for its schema setup; it does not intentionally drop existing tables. Do not share the database publicly because it may contain locally entered information.

## Before any public deployment
Do not deploy this prototype publicly as-is. It is intended for local demonstration. A production review would require authentication, role-based access, CSRF protection, secure secret management, HTTPS, input/privacy review, audit logging, retention controls, backups and independent security testing.
