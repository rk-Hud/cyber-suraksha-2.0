# CYBER SURAKSHA 2.0 public website

Independently architected, developed, authored and owned by Jatoth Ramakrishna for public cybersecurity awareness. This directory contains the rebuildable GitHub Pages website and browser account interface. The private account API and database are separate services.

## Build and verify

Use Python 3.11 or newer and Node.js 24. Install Python dependencies in a virtual environment, then install the locked development packages:

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-build.txt
npm ci --ignore-scripts
.venv/bin/python scripts/export_site.py
.venv/bin/python scripts/verify_pages.py
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm test
```

The build writes seven localized HTML files plus local assets to `docs/`. Publish `docs/` through GitHub Pages. Keep `node_modules`, `.venv`, test output and all private configuration outside the published directory.

`source/site.json` defines the public origin, repository base path and HTTPS account API URL. Leave `api_url` empty to keep account forms disconnected. When configured, the build allows only that API origin in `connect-src`. No token, database URL, mail credential or administrator secret belongs in this file. A public API address is not a credential.

## Account behavior

The interface reads live readiness before enabling registration and email sign-in. The backend must have working email delivery before these controls open. Registration and login use a website password and short-lived email OTP. Recovery also uses a current email challenge. Citizens can submit private support cases, read status history and reply. The owner additionally verifies an authenticator code before viewing accounts, changing case status, editing approved public content or retrying a queued notification. Status emails are attempted after committed case updates and can be retried from the owner workspace.

Credentials stay in page memory; reloading or switching language signs out. Status emails link to the account page, where users sign in to see their own case list. Account content and submitted messages are rendered as text. The database, provider credentials, authorization and rate limits are enforced by the separate API.

The scam checker, planner, training and local safety assistant remain independent of the account API. They do not send inputs, resolve links or write browser storage. Local warning scores indicate rule matches and cannot establish that a message or URL is safe.

This independent support service does not file police complaints or guarantee recovery. For financial cyber fraud in India, contact your bank, call 1930 and use https://cybercrime.gov.in/.

An optional real Chromium smoke test is available with `scripts/browser_smoke.py`. Install the pinned `requirements-browser.txt` in a test environment and provide a compatible Chromium at `/usr/bin/chromium`. It serves the generated website on a loopback port and intercepts account API traffic with synthetic records. It checks English, Hindi and Telugu at widths 390, 768 and 1440 pixels. Screenshots stay in ignored `browser-artifacts/`; no live account or email is created by this test.
