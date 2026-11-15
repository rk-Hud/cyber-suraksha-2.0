> **HISTORICAL UNIFIED WEBSITE RECORD.** This folder contains earlier Flask prototypes and evaluation plans. It is not the current public FastAPI entrypoint or the current owner-only pilot. [Documentation center](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md).

# CYBER SURAKSHA 2.0 — Complete Unified Website

**Permanent public project name:** CYBER SURAKSHA 2.0
**Internal release:** Government Evaluation Edition — integrated upgrade with Citizen Services
**Ownership:** Independent CYBER SURAKSHA initiative. **Not** a Government of India, Telangana Government, FBI or law-enforcement website. No government approval, affiliation, endorsement, production security certification, or operational integration is claimed.

## One-click Windows launch

1. Extract the ZIP into a new folder. Keep your existing 2.0 project as a backup.
2. Double-click **`START_CYBER_SURAKSHA_WINDOWS.bat`**.
3. Open **http://127.0.0.1:8080** in a browser.

This launches the **complete, unified site** using Python 3.10+ and its built-in WSGI server. No Python package installation, API keys, paid hosting or external AI provider is required for local operation. Stop with Ctrl+C. The website can be opened from any browser **on the same computer**.

Windows launcher modes:

| File | What it does |
|---|---|
| `START_CYBER_SURAKSHA_WINDOWS.bat` | Complete website; synthetic local case/SOC editing enabled on `127.0.0.1` only |
| `START_READ_ONLY_WINDOWS.bat` | Preview exactly how the public read-only version behaves |
| `START_SECURE_ADMIN_WINDOWS.bat` | Prompts for 12+ character password and starts local-only admin and optional viewer mode |
| `IMPORT_OLD_DATABASE_WINDOWS.bat` | Optional guided import of your existing `cyber_suraksha.db` **before first launch only**; it refuses to overwrite a destination database. Your old database is never modified. |
| `RUN_ALL_TESTS_WINDOWS.bat` | Python tests; also JavaScript tests if Node.js is installed |

## November 2026 navigation hotfix — screenshot issues resolved

- Fixed the **Security operations → Citizen services** link. It now points to `http://127.0.0.1:8080/service` (not `http://service`). A malformed network-path URL in the dynamic navigation caused Firefox's "Server Not Found" message.
- The **Local administrator** card now shows a non-clickable explanation in public preview or when no local administrator password is configured. It becomes a login link only after launching the secure localhost administrator server. The public administrator endpoint remains inaccessible by design.
- Local administrator procedure: **stop** the normal server with Ctrl+C; run `START_SECURE_ADMIN_WINDOWS.bat`; choose a password; open `http://127.0.0.1:8080/training-admin/login`.
- Run `CHECK_WEBSITE_WINDOWS.bat` while the site is running to check navigation and HTTP endpoints from Windows PowerShell.
- All changes preserve local-only synthetic case editing and public read-only safety restrictions. No existing GitHub or Render website changes are implied by downloading this local ZIP.

## New: Citizen Services — functional evaluation workflow

**The website's public name remains CYBER SURAKSHA 2.0.** A new `/service` section demonstrates the same *types of workflow* that citizens expect from a case-management service, without copying government branding or implying government authority.

**Local:** Create a fictional account (`visitor@example.com`), sign in, submit a fictional cyber-safety case, receive a `CS-EVAL-…` internal reference, track its status, and log out. Password hashing, server-side sessions, CSRF checks, per-account case ownership, sign-in rate limits and protected pages are implemented.

**Operator review:** To process synthetic cases, use `START_SECURE_ADMIN_WINDOWS.bat`, sign in at `/training-admin/login`, then open `/service/staff`. Admin users can update statuses and record guidance; viewer role can only read. Staff updates append history and audit entries.

**Public deployment:** `/service` shows how the service works and directs users to genuine government portals. All public account registration, login, case submissions and staff case operations stay disabled because real victim records need authorized, independently audited systems. Local account email addresses must end in `@example.com`, `@example.org` or `@example.net`. No OTP/email verification or real police integration exists.

For exact URLs and safe use, read `docs/CITIZEN_SERVICE_WORKFLOW.md`; for government submission planning, read `docs/GOVERNMENT_EVALUATION_PROPOSAL.md`.

## All-in-one features

**Citizen safety:** Homepage; English/Telugu/Hindi interface; private browser-side scam-message warning tool; guided safety assistant; branching scam training; financial-fraud response navigator; official country-specific reporting links; resources; transparency, accessibility, privacy, ownership, governance and legal pages.

**Security operations:** Synthetic incident dashboard and case details; optional local-only case entry; scenario-based financial-fraud response scoring; fictional SOC alerts and investigations; Zero Trust decision simulator; responsible disclosure training; multilingual lessons and knowledge checks; synthetic case showcase; password-protected local admin/viewer case status updates and local audit log.

**Public safety default:** Public deployment exposes no admin login, no incident submission, no SOC writes and no vulnerability-intake writes. All public case information comes from synthetic (`is_demo=1`) records; private imported records are deliberately not displayed. Scam-analysis messages are processed in browser JavaScript and are not sent to server APIs.

## Existing CYBER SURAKSHA 2.0 data

The optional database importer copies the old database **without deleting your source** using the SQLite backup API; it refuses to overwrite an existing destination database. Run it **before the first launch of this new app**. Make a separate backup of your original database first. Use it only if you wish to transfer old local data and have a backup. Never import identifiable victim information into a publicly hosted copy of this website. The new application uses SQLite table/column names compatible with the existing `incidents`, `soc_alerts`, `zero_trust_evaluations`, `disclosure_reports` and `stage3_audit` tables. Some workflows are reimplemented and are not identical, line for line, to the old Flask code. Retest all personally important functions before deleting your old folder.

## What is not built or guaranteed

This is a functioning independent web application, **not** an authorised government complaint system, emergency service, bank connection, AI language model or a highly available global platform. Its assistant is a limited rule-based guide, not a conversational LLM. No government or FBI approval can be guaranteed by adding code.

A government-facing real case management service requires separately approved hosting, privacy/legal assessment, secure authentication, independent penetration testing, formal accessibility checks, operational support, retention policies, audit/incident response, and written authority approval. See `docs/PRODUCTION_AND_APPROVAL_GATES.md`.

## Deployment design

- `app.py`: standalone Python WSGI application with complete integrated routes.
- `service_portal.py`: local-only citizen services accounts, session management, case status and staff evaluation workflow.
- `site/`: styled responsive 2.2 frontend, still branded **CYBER SURAKSHA 2.0**.
- `site/assets/`: CSS, JavaScript, browser-only scam detection and guided assistant.
- `tests/`: local Python + Node JavaScript automated test suites, including the new citizen account/case/staff access-control tests.
- `instance/`: SQLite file generated locally; excluded from Git by `.gitignore`.
- `render.yaml`: optional **independent read-only review preview**, with Gunicorn dependency for hosting; it does **not** change or overwrite your current Render deployment.

For an approved independent hosting account, a WSGI server can run `app:app`; public mode defaults to read-only. The bundled Windows development server binds `127.0.0.1`, not the public internet. Real production hosting requires an independent security review and environment configuration, and cannot promise worldwide uptime or scale.

## Local tests

```text
python -m unittest discover -s tests -v
node tests/test_frontend.mjs
```

The second command requires Node.js; the application itself does not. Tests use fictional data and temporary SQLite databases. Do not claim independent security certification based on unit tests.

## Security and privacy rules

- No real OTPs, PINs, victim records, financial account information or live vulnerabilities.
- No public intake of reports, passwords or files; users must use the authorized government and bank services.
- Public GitHub repositories must never contain `instance/`, `.db`, `.env`, passwords or sensitive audit data.
- Only localhost can use training write operations; admin is separately password-protected.
- International links provide external official destinations but do not imply endorsement or integration.

**India:** For real financial cyber fraud, contact the bank through its official channels and call **1930** promptly. Official National Cyber Crime Reporting Portal: https://cybercrime.gov.in/

## Licensing and third-party components

This is an independently packaged adaptation/reimplementation designed to accompany the owner's existing CYBER SURAKSHA source. Review the original repository's MIT License and third-party attributions before public redistribution. The source package includes no bundled Python third-party libraries; the optional hosted deployment uses Gunicorn.
