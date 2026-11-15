# Contribution and maintenance guide

[Project overview](README.md) · [Engineering guide](docs/TECHNOLOGY_STACK.md) · [Code of conduct](CODE_OF_CONDUCT.md)

CYBER SURAKSHA 2.0 is independently managed. Contributions are evaluated for technical merit, security, rights compliance and compatibility with existing service boundaries. Contribution does not imply employment, institutional partnership, approval or an ownership transfer unless separately agreed.

## Choose the correct application

| Change | Source | Test reference |
| --- | --- | --- |
| Public multilingual awareness | [FastAPI and site assets](deploy/cyber-suraksha-independent/) | [Quality policy](docs/TESTING.md) |
| Protected owner portal | [Flask portal](deploy/citizen-owner-portal/) | [Portal tests](deploy/citizen-owner-portal/tests/) |
| Earlier learning simulations | [Original Flask app](app.py) | [Legacy tests](tests/) |
| Documentation | [Documentation center](docs/README.md) | Validate relative links, figures, and accuracy |

## Ground rules

- Keep documentation accurate, readable and tied to real source paths.
- Use only fictional alerts, cases, email addresses and records. Do not upload private databases, passwords, keys or real victim information.
- Do not present the service as approved by a public authority, integrated with banks or capable of filing official complaints.
- Maintain the separation of the public awareness service and private owner portal. Never weaken private-mode or owner MFA as a shortcut.
- Record origin, attribution, rights and licenses for all third-party content, diagrams, images and dependencies.
- Run the tests appropriate to the specific application and identify environments where they were not run.

## Local development

The awareness app runs through [START_R4_WINDOWS.bat](START_R4_WINDOWS.bat). The earlier Flask training app uses [run_windows.bat](run_windows.bat). The owner portal requires its own dependencies, private configuration and database; follow [owner pilot instructions](deploy/citizen-owner-portal/README_FREE_OWNER_PILOT.md).

Do not attempt to use the legacy app's `requirements.txt` to deploy the FastAPI or private portal services.

## Pull request checklist

1. State the problem, scope, file paths and user-visible implications.
2. Describe security, personal-data and access-control effects.
3. Link test evidence and identify tests not run.
4. Add screenshots only with synthetic data; credit photography and external artwork.
5. Document compatibility or migration requirements and a safe rollback.
6. Wait for an explicit review before merging changes that affect authentication, infrastructure, service routing or production data.

## Security issues

Report vulnerabilities privately where possible. Never post working exploit details, passwords, active session tokens or private case information in an issue. Read [SECURITY.md](SECURITY.md) and [portal security policy](deploy/citizen-owner-portal/SECURITY.md).
