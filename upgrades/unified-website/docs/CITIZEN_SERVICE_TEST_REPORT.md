# CYBER SURAKSHA 2.0 — Local test evidence

**Scope:** Integrated local account/case/staff evaluation workflow plus existing modules.
**Testing type:** Automated developer-level unit/integration tests in the provided execution environment.

**Recorded 3 November 2026:** 44/44 Python tests passed and 16/16 JavaScript tests passed. A separate live-local HTTP test successfully completed the register → sign-in → submit fictional case → track reference sequence. The local Chromium browser could not load the local URL because it was blocked by the execution environment’s browser administrator policy; visual cross-browser acceptance testing remains outstanding.

Test commands (from extracted project root):

```cmd
python -m unittest discover -s tests -v
node tests/test_frontend.mjs
```

Automated checks include account creation with reserved example domains, password hashing via existing utility, session lifecycle, CSRF rejection, authentication rate limiting, case ownership isolation, fictional reference creation, staff viewer/admin permissions, status changes and history events, HTML escaping, hosted-mode disabling, pre-existing security/SOC workflows and JavaScript-based scam/training tools.

**These tests are not independent penetration testing, operational hosting validation, a legal clearance or a GIGW/STQC/CERT-In certificate.** They also do not verify email/SMS delivery, production authentication, browser/assistive-tech compatibility, service-level availability or actual government integration.
