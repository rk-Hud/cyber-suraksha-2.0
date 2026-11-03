# Citizen Services — implemented workflow and operator instructions

**Public brand:** CYBER SURAKSHA 2.0 — Independent Digital Safety Initiative
**Release:** Government Evaluation Upgrade, citizen-services workflow
**Approval status:** No Indian, American or other government agency has approved or integrated this service.

## Implemented, working locally

| Journey | Where | What happens |
|---|---|---|
| Citizen landing | `/service` | Explains the independent service, official reporting links and safe data boundaries |
| Registration | `/service/register` | Creates a local account with an **example.com / example.org / example.net** address and password hashed using PBKDF2-SHA256 |
| Sign-in | `/service/login` | Validates the local account; uses server-side, rotating random token stored as a SHA-256 hash in SQLite |
| Citizen dashboard | `/service/cases` | Shows only cases owned by the authenticated local account |
| Case submission | `/service/new` | Accepts a **fictional** category/channel/description, creates a unique `CS-EVAL-…` reference and an audit timeline |
| Case tracking | `/service/case/<reference>` | Displays only the owner's case, status and staff training guidance |
| Logout | `/service/logout` | Revokes the stored session (POST, CSRF protected) |
| Staff access | `/training-admin/login` | Separate, local administrator/viewer password login. Configured only with `START_SECURE_ADMIN_WINDOWS.bat` |
| Staff case review | `/service/staff` | Admin can update a fictional case's status and add generic training guidance; viewer is read-only. Changes generate history events. |

## Easy local run on Windows

1. Extract the provided ZIP to a separate folder. **Keep the old CYBER SURAKSHA 2.0 folder and DB backup.**
2. Double-click `START_CYBER_SURAKSHA_WINDOWS.bat`.
3. Open `http://127.0.0.1:8080/service`, select **Create evaluation account**, use `visitor@example.com` and choose a unique 12+ character password. Don't use any real details.
4. Log in (automatic after registration), select **Raise a fictional case**, submit a synthetic example, and open the generated reference number to track the case.
5. For **staff-review demonstrations**, stop the first server using Ctrl+C, run `START_SECURE_ADMIN_WINDOWS.bat`, choose a new strong administrator password, open `http://127.0.0.1:8080/training-admin/login`, sign in, and visit `/service/staff` to update a fictional case.

Only one server can listen on port 8080 at once. The command window must stay open while serving. Server is bound to the local computer (`127.0.0.1`). There is **no cloud-deployed citizen account system** in this package.

## Access and safety boundaries

- Accounts are deliberately restricted to reserved example domains: no real email addresses are collected; no email verification or SMS OTP service is integrated.
- Real names, phone numbers, passwords, UPI PINs, bank statements, actual victim evidence and real complaints are prohibited.
- The local `instance/cyber_suraksha.db` database is *not encrypted* and should not be backed up to public GitHub or distributed with populated records.
- Case reference numbers are **independent evaluation identifiers only**, not government acknowledgements, FIR numbers, or evidence of official law enforcement action.
- Local users cannot see other users' cases. Staff access is separate, available only with a configured local administrator password, and role-scoped.
- The public hosted website exposes `/service` as an informational landing page; **public registration, login, submission and staff review are disabled**. This applies even when local training flags are set if running under the configured hosting mode.
- The application does not contact or send records to the Government of India, I4C, police, banks, the FBI, IC3 or any external agency.

## How this differs from official services

India's official National Cyber Crime Reporting Portal uses mobile OTP-based registration, government complaint routing, acknowledgement numbers and (for certain complaint types) portal tracking; these are **not** integrated here. The FBI IC3 has a separate public complaint form and does not provide an investigation-status dashboard to complainants. The account and status dashboard here are original independent software, not replicas of either government service.

## Required for real case processing

Before handling sensitive real-world reports, a sponsoring organization must arrange independent security and privacy review, jurisdictional legal clearance, verified identity/OTP providers, secure production hosting, encryption and key management, backups and disaster recovery, formal retention and deletion policy, monitoring and incident response, operational staffing/SLAs, accessibility testing and written authorization for any government integration. A supervised pilot should use entirely fictional records until those conditions are fulfilled.
