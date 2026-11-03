# CYBER SURAKSHA 2.0 — Current Architecture

**Release:** unified 2.2 Government Evaluation technical upgrade; website name remains CYBER SURAKSHA 2.0.

## Components and trust boundaries

```text
Browser (public)
   | GET pages/assets, GET stateless exercises
   | browser-only scam message text (never sent to app API)
   v
Python WSGI application (app.py)
   | public pages + synthetic training register + health
   | read-only when CS_PUBLIC_MODE=1
   v
SQLite (instance/cyber_suraksha.db)
   | synthetic demo records visible to public
   | imported private rows never selected on public pages

Localhost owner (CS_PUBLIC_MODE=0, CS_LOCAL_TRAINING=1, REMOTE_ADDR=127.0.0.1)
   | CSRF-validated training-only writes
   | optional password-protected local administrator/viewer
   v
Synthetic case updates + local stage3_audit table
```

### Technology

Python 3.10+ standard library, WSGI, SQLite, static HTML/CSS/JavaScript. The previous project used Flask; this unified release **reimplements its key synthetic workflows** in a self-contained WSGI backend. No private database or original source code is overwritten. Third-party WSGI service such as Gunicorn is required only for independent public hosting.

### Publicly accessible routes

`/`, `/*.html` (whitelisted site content), `/assets/*`, `/health`, `/operations.html`, `/dashboard`, `/incident/<synthetic-ref>`, `/fraud-simulator`, `/soc-simulator`, `/soc/<synthetic-alert-id>`, `/zero-trust`, `/awareness`, `/training-showcase`, `/report` read-only, `/disclosure` read-only.

### Private local routes

`/report` POST, `/soc/<id>` POST and `/disclosure` POST only in localhost training mode; `/training-admin` and `/training-admin/*` additionally require a password-derived signed admin/viewer session. Local administration is never enabled by the bundled production configuration.

### No integrations

No FBI/CERT-In/police/1930/UPI/bank authorization or API connection, no automatic fraud blocking, no live SOC/EDR feed, no external LLM or general ChatGPT-quality AI, and no official case submission. External links are navigation only.
