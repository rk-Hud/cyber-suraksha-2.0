# CYBER SURAKSHA 2.0 — One integrated website

This project uses **one Flask application** for all regular modules and Stage 3 local-only training administrator features. The local dashboard and public modules share one home page and one navigation bar.

## Run locally (one command)

Double-click `START_CYBER_SURAKSHA.cmd` in the project directory, or run this in PowerShell from the project directory:

```powershell
.\START_CYBER_SURAKSHA.cmd
```

Create a fresh private administrator password when prompted, then optionally a viewer password. The browser opens to `http://127.0.0.1:5000/` after Flask starts. On the local site, use the **Training admin** navigation link or visit `/training-admin/login`. Keep the console open while using the app. Stop with Ctrl+C.

If port 5000 is occupied, the launcher refuses to start; close your old Flask server first. This prevents the confusing 404/connection errors caused by multiple Flask launch attempts.

## Public Render website

Your existing Render URL uses the **same codebase** as your local website, deployed from GitHub main. The public server runs in `PUBLIC_DEMO_MODE=1` with `COOKIE_SECURE=1` and shows read-only synthetic examples at `/training-showcase`. The private admin login is **deliberately unavailable** on the internet. Do not expose local Flask or turn public write mode on. Render and local SQLite records are independent; they are not synchronized.

## Update and validation

Run `python -m unittest discover -s tests -v` to verify the application. The installer can use `--publish` to merge your tested development branch into GitHub main after explicit Render config confirmation; without it, installation stays local. Public deployment requires Render auto-deploy or manually deploying the latest commit. Do not use personal information, genuine complaint reports or leaked credentials in this prototype.
