# Security and vulnerability disclosure

CYBER SURAKSHA 2.0 is independently architected, developed, authored and solely owned by **Jatoth Ramakrishna** for public cybersecurity awareness and operational digital safety. It receives no institutional support, sponsorship or external funding and has no corporate or government affiliation or endorsement.

Copyright © 2026 Jatoth Ramakrishna. All rights reserved.

## Reporting a vulnerability

The owner-designated repository is [rk-Hud/cyber-suraksha-2.0](https://github.com/rk-Hud/cyber-suraksha-2.0). Use **Security → Report a vulnerability** to send a private report to Jatoth Ramakrishna when that feature is enabled. Private reporting availability has not been verified. If it is unavailable, open a minimal issue requesting a private channel without exploit details, personal information, tokens or keys. No disclosure email or working private endpoint has been invented.

Include the affected release or page, component, a minimal reproduction with fictional data, impact and a proposed correction if known. Do not send citizen complaints or pasted checker text. There is no guaranteed response time or bug bounty. Coordinate a disclosure date with the owner.

## Permitted research

Test a local installation or an environment for which you have explicit authorization. Do not access others' data, steal credentials, disrupt availability, conduct social engineering or perform destructive tests. Official agency links do not grant permission to test those services.

## Hosted site boundary

GitHub Pages serves the English, Hindi and Telugu public website and account interface as static files. Account requests use the separately configured HTTPS Neon Function API. The database is hosted on Neon; no database credential, signing key, mail key or administrator secret is sent to the browser or included in the static deployment.

Account availability is read from the API health response. Registration and email sign-in remain disabled when the API reports email delivery unavailable. A deployed interface is not evidence of a working OTP delivery service. Public registration must stay closed until a sending domain is verified, private mail credentials are configured, and delivery to an external test mailbox succeeds. The owner’s existing authentication records and MFA must be preserved during migration.

Citizen sessions use opaque bearer tokens kept in page memory. Requests omit browser credentials and referrers; tokens and private records are not written to browser storage or URL parameters. Reloading, closing or changing language requires a new sign-in. Page history transitions clear account records and credentials from the account DOM. The API hashes session and flow tokens, verifies email OTPs, enforces expiration and attempt limits, and checks account ownership for private case access. Administrator records and writes require the configured owner identity and recent authenticator verification. A hidden section is not authorization.

The approved content editor accepts structured multilingual text and validated links. It does not execute HTML, scripts, SQL or server commands. Advisory text is authored guidance, not a live threat feed. Owner actions and complaint status changes are recorded. Status notifications are attempted after committed case updates and retained in a durable queue for retry. The owner can request manual delivery of one queued notice. The in-app case timeline does not depend on email delivery.

## Citizen privacy

Checker text, planner selections and quiz answers remain in browser memory and are not transmitted or persisted by these tools. Citizen registration, email verification and support case submission are separate, explicit service requests: account names, email addresses and submitted case content are stored by the account service and visible to the account holder and authorized owner. Do not include passwords, OTPs, payment PINs or unnecessary identity documents in a complaint.

There are no analytics, advertising pixels, external fonts or cloud language analysis requests. Changing language loads another page and clears account sign-in. The checker and planner never send pasted text to the account API, resolve pasted links, or add input to URLs.

Normal requests for website pages and assets still occur. Hosting infrastructure can observe connection metadata such as IP addresses; verify its retention policy separately. External destinations have their own privacy practices.

Local rules can miss new attacks and flag legitimate text. The finite domain catalogue provides context, not an all-world safety certificate. HTTPS or a familiar domain cannot establish that a page or message is safe. HTTP produces an explicit transport warning. Shortened links remain unverified because their final destinations are not resolved. Scores are warning indicators, not probabilities of fraud or accuracy measurements. The checker never opens pasted links. The Safety Assistant is a local reference guide, not a live reporting or emergency service.

## Maintenance

The generated CSP blocks native form submissions and permits connections only to the same site and the exact configured API origin. Scripts, styles and tool data are served locally. GitHub Pages controls HTTP response headers; CSP in HTML cannot supply a frame-ancestors policy. The API separately sends restrictive response headers and accepts only configured browser origins. Dynamic tool output uses safe text APIs. Private owner records, credentials and registration papers are never published. A collapsed panel is not a privacy boundary.

Review JavaScript changes for accidental data collection, update all three translations together and rerun rendered-content and tool checks before publishing. Keep production secrets and databases out of the static directory. Have qualified readers review Hindi and Telugu wording before broad publication.

This is an independent awareness resource, not a police reporting portal, emergency service or managed security operations center. For financial cyber fraud in India, promptly contact your bank, call 1930 and use [cybercrime.gov.in](https://cybercrime.gov.in/). Recovery is not guaranteed.
