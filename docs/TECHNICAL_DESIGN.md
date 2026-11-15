# Technical design and engineering scope

[Docs](README.md) · [Architecture](ARCHITECTURE.md) · [Source technology map](TECHNOLOGY_STACK.md)

## Objectives

- Communicate accessible cyber-fraud prevention and response guidance in English, Hindi and Telugu.
- Keep public educational tools separate from authenticated owner workflows.
- Preserve demonstrable synthetic SOC and incident-learning modules without claiming real integrations.
- Support reviewable test records, clear deployment boundaries and safe secret handling.
- Avoid presenting the independent project as a government or law-enforcement system.

## Component decisions

| Component | Design | Source |
| --- | --- | --- |
| Awareness API | FastAPI, Uvicorn, Python | [main.py](../deploy/cyber-suraksha-independent/main.py) |
| Browser UI | HTML, CSS and JavaScript | [public site assets](../deploy/cyber-suraksha-independent/site/) |
| Portal backend | Flask, Gunicorn, sessions and validation | [portal package](../deploy/citizen-owner-portal/portal/) |
| Portal persistence | SQLAlchemy models backed by PostgreSQL | [models.py](../deploy/citizen-owner-portal/portal/models.py) |
| Portal identity | Owner identity, password/OTP, authenticator MFA, CSRF | [security.py](../deploy/citizen-owner-portal/portal/security.py) |
| Legacy simulations | Flask, Jinja, local SQLite | [original app](../app.py) |
| Build and hosting | Render configuration and GitHub test workflow | [deployment guide](../DEPLOYMENT.md) |

## Boundary assumptions

**Public awareness:** self-serve educational materials, not a credentialed support-case portal. Its on-device tools cannot guarantee that an unfamiliar URL, message or contact is safe.

**Private pilot:** restricted owner administration. Sign-in, verification, static or health endpoints may be reachable unauthenticated while protected records and mutations require owner authorization. `PRIVATE_MODE=1` and `PUBLIC_REGISTRATION=0` are intended deployment settings, not a verified statement about the running server.

**Historical prototype:** independent local learner exercises. Its earlier requirements and SQLite schema must not be treated as current portal schema or public-site start commands.

## Security and data

Always use synthetic data during development. Do not commit populated databases or secret keys. Verify TLS, origin protection, CSRF, rate limits, session expiry, MFA and access control on the actual deployment. Maintain separate mail settings, backup/restore procedures and data retention policies.

## Validation

Review [automated and manual testing](TESTING.md), [access-control checklist](OWNER_PORTAL_ACCESS_REVIEW.md) and [release acceptance gates](RELEASE_READINESS.md). A successful source syntax check is not evidence of live delivery or production security.

## Related documents

[Project overview](PROJECT_OVERVIEW.md) · [Media attribution](VISUAL_ASSETS.md) · [Copyright worksheet](COPYRIGHT_REGISTRATION_PREPARATION.md)
