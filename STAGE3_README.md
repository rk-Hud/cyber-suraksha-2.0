# Stage 3 — Local Training Incident Management

**For CYBER SURAKSHA 2.0 — development branch only.** Not a production incident reporting system.

- Admin/viewer authentication with hashed passwords, obtained via a hidden terminal prompt; no default passwords.
- Protects all routes with localhost-only restriction, explicit Stage 3 opt-in, automatic disabling for the public Render deployment, and a 20-minute login session.
- CSRF protection for all state-changing operations, limited login attempts, audit history, and parameterized SQL statements.
- Handles **only synthetic seeded `is_demo=1` cases**, with no display of names or phone numbers. Admin can change synthetic statuses; viewer is read-only.
- Local SQLite data is not encrypted and is **not** production-ready. Audit entries are training logs, not tamper-proof security logs.

## Install

1. Open Windows CMD in the project repository, on `stage3-secure-incident-management` branch.
2. Run `git status --short`. Resolve any tracked modifications before installation.
3. Download the standalone `INSTALL_STAGE3_LOCAL.py` to Windows Downloads. Run `.\.venv\Scripts\python.exe "%USERPROFILE%\Downloads\INSTALL_STAGE3_LOCAL.py"`.
4. Follow the test and run commands below.

## Test

```cmd
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## Run locally

```cmd
.\.venv\Scripts\python.exe scripts\run_stage3_local.py
```

Choose a 12+ character password when prompted. The prompt hides your typing. Then open:

`http://127.0.0.1:5000/training-admin/login`

**Important:** do not commit, paste or disclose passwords, password hashes, databases, private documents or identity records. Never forward port 5000 from your router. Stop with Ctrl+C.

## Commit to your branch after tests pass

```cmd
git add app.py stage3_admin.py templates/training_admin_login.html templates/training_admin_dashboard.html scripts/run_stage3_local.py tests/test_stage3.py STAGE3_README.md
git diff --cached --check
git commit -m "Add localhost-only Stage 3 incident training dashboard"
```

Do **not** push this branch to Render or merge into `main` until reviewed. The production Render config remains unchanged.
