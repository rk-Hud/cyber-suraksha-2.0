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

The build writes thirteen localized HTML files plus local assets to `docs/`. Publish `docs/` through GitHub Pages. Keep `node_modules`, `.venv`, test output and all private configuration outside the published directory.

`source/site.json` defines the public origin, repository base path and HTTPS account API URL. Leave `api_url` empty to keep account forms disconnected. When configured, the build allows only that API origin in `connect-src`. No token, database URL, mail credential or administrator secret belongs in this file. A public API address is not a credential.

## Account behavior

The interface reads live readiness before enabling registration and email sign-in. The backend must have working email delivery before these controls open. Registration and login use a website password and short-lived email OTP. Recovery also uses a current email challenge. Citizens can submit private support cases, read status history and reply. The owner additionally verifies an authenticator code before viewing accounts, changing case status, editing approved public content or retrying a queued notification. Status emails are attempted after committed case updates and can be retried from the owner workspace.

Credentials stay in page memory; reloading or switching language signs out. Status emails link to the account page, where users sign in to see their own case list. Account content and submitted messages are rendered as text. The database, provider credentials, authorization and rate limits are enforced by the separate API.

The scam checker, planner, training and local safety assistant remain independent of the account API. They do not send inputs, resolve links or write browser storage. Local warning scores indicate rule matches and cannot establish that a message or URL is safe.

This independent support service does not file police complaints or guarantee recovery. For financial cyber fraud in India, contact your bank, call 1930 and use https://cybercrime.gov.in/.

An optional real Chromium smoke test is available with `scripts/browser_smoke.py`. Install the pinned `requirements-browser.txt` in a test environment and provide a compatible Chromium at `/usr/bin/chromium`. It serves the generated website on a loopback port and intercepts account API traffic with synthetic records. It checks English, Hindi and Telugu at widths 390, 768 and 1440 pixels. Screenshots stay in ignored `browser-artifacts/`; no live account or email is created by this test.

## Google citizen sign-in

Google sign-in appears only on citizen login when the API reports Google ready and its public Client ID matches the built configuration. Administrator sign-in keeps the separate password/email verification and authenticator requirements. Google-only accounts recover access through Google; this website does not reset a Google password.

The Google script loads only after the visitor acknowledges the linked privacy policy and service terms. The API issues a five-minute challenge first; its opaque token and nonce remain in page memory. The Google credential is posted as JSON to the configured API. Consent withdrawal, administrator navigation, page closing and stale callbacks invalidate the current browser flow. No Google credential is used directly as an application bearer token.

Account-page CSP allows only the documented Google Identity Services script, frame, style and connect paths. Other pages do not receive those permissions. API requests keep `referrerPolicy: no-referrer`; Google-enabled account pages and the identity script use Google's recommended `strict-origin-when-cross-origin` policy. Do not put secrets or private case details in page URLs.

### Isolated build

Use a separate public JSON configuration to build a staging test path without editing `source/site.json`. Set its project `base_path`, staging `api_url`, `test_workspace: true`, and the same approved public Google Client ID. The test flag adds a localized fictional-data notice before sign-in; the production default remains false. Keep `origin` as the configured GitHub origin for an approved test page.

```sh
python scripts/export_site.py --config /absolute/path/to/public-test-config.json --output /absolute/path/to/compiled-test-site
python scripts/verify_pages.py --config /absolute/path/to/public-test-config.json --site /absolute/path/to/compiled-test-site
```

The output must be empty or a previous generated site; the builder refuses to replace source or unrelated files. No backend credential belongs in the public config or output. Publish only the isolated test path during acceptance; existing production pages and API remain separate until release approval.

`python scripts/browser_google_widget.py` checks the real Google widget and CSP on mobile/desktop with a synthetic API, without signing in an account.

`python scripts/browser_google_smoke.py` exercises all three languages and mobile/tablet/desktop widths with synthetic API and identity-widget responses. It does **not** prove real Google authentication. A consenting approved Google test account must complete the real popup and case-isolation checks against the deployed staging API before release.

### Identity widget style compatibility

The current Google widget injects a stylesheet and layout attributes. Google-enabled account pages therefore allow that observed stylesheet by its SHA-256 hash in `style-src-elem`, plus inline **style attributes** via `style-src-attr`. The exception is absent on other pages and when Google is unconfigured. Script policy remains exact and does not allow inline scripts or evaluation. This is checked in current Chromium; browsers without CSP3 style directives may not display the widget correctly. If Google changes its injected stylesheet, review the change and rerun the actual-widget check before updating the allowed hash. A hash mismatch fails closed for that stylesheet; do not relax script policy to work around it.
