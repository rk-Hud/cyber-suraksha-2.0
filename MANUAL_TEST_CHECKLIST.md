# Manual acceptance and regression checklist

[Docs](docs/README.md) · [Testing](docs/TESTING.md) · [Release criteria](docs/RELEASE_READINESS.md)

Use **synthetic data only**, and record the exact commit, date, runtime versions and deployment URL used. Each of the following applications has separate acceptance steps.

## Public FastAPI awareness website

- [ ] Launch the local R4 awareness site with `START_R4_WINDOWS.bat`; load `/`, `/en/`, `/hi/`, `/te/`.
- [ ] Check `/api/v1/health`, `/permissions.html` and `/service-status.html`.
- [ ] Verify scam-signal guidance, action planner, quiz and mobile layout.
- [ ] Confirm public registration, real citizen reporting and owner administration are **not** enabled on the awareness service.
- [ ] Verify appropriate no-store headers and content restrictions for sensitive endpoints where implemented.

## Private Flask owner portal

- [ ] Confirm actual environment values privately: `PRIVATE_MODE=1`, `PUBLIC_REGISTRATION=0`, HTTPS enabled.
- [ ] Anonymous access to protected owner routes reveals no case or user data.
- [ ] Non-owner sign-up is rejected in the pilot even if a registration page is reachable.
- [ ] Owner password and email challenge work, and authenticator MFA is required for privileged actions.
- [ ] Test wrong OTP, expired OTP, missing MFA, revoked sessions and logout.
- [ ] Unauthorized state-changing calls cannot update records or dispatch mail.
- [ ] Validate CSRF/origin checks, sanitized logs, backup restore and email delivery with fictional records.

See [owner portal access verification](docs/OWNER_PORTAL_ACCESS_REVIEW.md).

## Historical local Flask training app

- [ ] Start `run_windows.bat` and open the local dashboard.
- [ ] Submit a fictional report; view the generated reference and incident register.
- [ ] Exercise financial-fraud simulations and SOC alert investigation.
- [ ] Review simulated Zero Trust decisions and fictional disclosure exercises.
- [ ] Visit the multilingual awareness and quiz pages.
- [ ] Run the legacy unit-test suite and record actual results.

## Release record

| Evidence | Entry |
| --- | --- |
| Git commit and branch | To be recorded |
| Test date / environment | To be recorded |
| Automated test command / result | To be recorded |
| Browser and manual tester | To be recorded |
| Known defects and risk | To be recorded |
| Reviewer decision | To be recorded |

**Do not mark a checklist as passed based only on existing test source files or archived test-result logs.**
