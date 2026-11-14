# Privacy and Data-Flow Review

## Public browser tools

Scam-warning analysis occurs in browser JavaScript. Typed messages and training choices are not intentionally transmitted to CYBER SURAKSHA servers. The limited Safety Assistant performs local keyword guidance and clears typed questions after rendering a response. Pilot CSV inputs are processed by the browser. Users must avoid entering victim names, phone numbers, OTPs, passwords, financial credentials, private messages or sensitive evidence even though browser-side tools do not save the text.

## Server-managed synthetic workflows

The WSGI server serves pages and performs synthetic case/list filtering. All publicly accessible case and SOC queries restrict results to `is_demo=1`; public incident/disclosure/admin POST operations are rejected. The server makes no outgoing API request to government authorities, banks, LLM services, or surveillance providers.

## Optional local training mode

`START_CYBER_SURAKSHA_WINDOWS.bat` enables localhost-only writes intended **only for fictional training records**. SQLite may store training display names, dummy phone values, incident descriptions, SOC notes, disclosure notes and local admin audits. The optional old-database import may contain previously stored personally identifiable information; public pages intentionally exclude `is_demo=0` rows. The SQLite file must not be uploaded to GitHub or internet hosting. The local owner controls data retention and deletion.

## Cookies and operational logging

Local write forms use a random HTTP-only SameSite=Strict CSRF cookie. Optional admin sessions use short-lived HMAC-signed cookies and password hashes; no default password is stored. A hosting provider may have routine infrastructure logs and its own terms. No analytics tracking is included in this package. Actual legal notices, lawful basis, processor agreements and retention schedules must be independently reviewed before real deployment.
