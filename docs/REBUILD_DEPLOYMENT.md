# Public awareness deployment — current service guide

[Documentation](README.md) · [Root deployment guide](../DEPLOYMENT.md) · [Release readiness](RELEASE_READINESS.md)

This guide concerns the independent **FastAPI awareness website** only. It is not an owner portal deployment instruction. The earlier migration records and signed-off source fingerprints remain available in repository history and archived documents.

## Source and runtime

- [FastAPI application](../deploy/cyber-suraksha-independent/main.py)
- [Static, multilingual website](../deploy/cyber-suraksha-independent/site/)
- [Pinned direct dependencies](../deploy/cyber-suraksha-independent/requirements.txt)
- [Root Render Blueprint](../render.yaml)

Current repository Blueprint instructions:

```text
Build: pip install -r deploy/cyber-suraksha-independent/requirements.txt
Start: cd deploy/cyber-suraksha-independent && uvicorn main:app --host 0.0.0.0 --port $PORT --no-access-log
Health: /api/v1/health
```

The Blueprint currently specifies a free Singapore web service with auto-deploy disabled in source. Confirm the actual Render service, linked SHA, branch, runtime settings, costs and health from the provider before declaring a successful release.

## Local Windows launch

From the repository root, start [START_R4_WINDOWS.bat](../START_R4_WINDOWS.bat). If `127.0.0.1:8094` is available, open `http://127.0.0.1:8094/`.

## Required acceptance checks

1. Confirm `/`, `/en/`, `/hi/`, `/te/` and `/api/v1/health` return expected content.
2. Review privacy, permissions, and service-status pages.
3. Test the JavaScript learning tools on mobile and desktop, with no real personal information.
4. Verify browser headers, HTTPS, and logs on the actual host.
5. Confirm no real complaint submission, email OTP, citizen registration or administrative mutation is exposed through this public service.
6. Record test command, Git SHA, outcome, deployment URL and rollback procedure.

## Other services and historical records

The owner pilot has a **different** [Blueprint](../deploy/citizen-owner-portal/render-free-pilot.yaml) and separate [security requirements](OWNER_PORTAL_ACCESS_REVIEW.md). It must not be automatically deployed as part of a public-awareness rebuild.

The old Flask/SQLite educational prototype `app.py` and earlier unified website remain historical/reference source. Previous migration hashes, release narratives and retired service plans in old documents are version-specific audit history, not current upgrade instructions.

## Safety

No government, bank, CERT-In or police affiliation or official report-submission integration is claimed. For real Indian cybercrime reports visit [cybercrime.gov.in](https://cybercrime.gov.in/) and for urgent financial fraud call **1930**.
