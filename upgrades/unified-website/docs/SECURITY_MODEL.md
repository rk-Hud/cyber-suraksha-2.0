# Security Model & Known Boundaries

| Control | Current release | Limitation |
|---|---|---|
| Browser scam analysis | Local JavaScript only; no network calls in core tests | Heuristic indicators cannot prove fraud authenticity |
| Public case privacy | Queries restrict public results to synthetic `is_demo=1` | Imported real records should not be present in production environment at all |
| Public write controls | POST case, SOC, disclosure and admin operations blocked | Not a real production crime reporting system |
| Local training access | Bound to loopback; explicit owner option; CSRF validation | Physical local device security remains owner's responsibility |
| Admin/viewer roles | Local password PBKDF2-HMAC SHA-256, short HMAC-signed session | No enterprise SSO, MFA, centralized identity system or immutable audit |
| Input safety | Size limits, escaped HTML output, parameterized SQL | Independent testing for all classes of vulnerabilities still required |
| Headers | CSP, X-Frame-Options, nosniff, referrer and permissions policies | CSP allows inline styles; third-party browser QA remains necessary |
| Secret handling | Random per-process session secret, env secrets allowed | Production needs secret rotation and managed storage |
| Audit events | Local records of admin sign-in and case changes | Can be modified by anyone with local filesystem control |
| Hosting | Python WSGI; optional Gunicorn, host configured read-only | No SLA, global scale, WAF/CDN, cluster DB, external monitoring or verified disaster recovery |

Potential threats include XSS, CSRF, credential guessing, local database disclosure, accidental public publication of private files, spoofed government affiliation, malicious user input and inaccurate scam warnings. Current controls are not a substitute for independent tests. Do not enable intake of genuine reports without written authority, legal processing basis and a properly designed secure system.
