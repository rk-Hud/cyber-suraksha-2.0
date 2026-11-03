# Online fictional Citizen Services demonstration

The **CYBER SURAKSHA 2.0** online citizen workflow is a temporary, isolated **fictional training demonstration**, not a real complaint portal or government/banking integration.

## Enable ONLY on separate review/staging Render service

- `CS_PUBLIC_MODE=1` (keep the rest of the site in public read-only mode)
- `CS_LOCAL_TRAINING=0` (never enable local training features publicly)
- `CS_HOSTED_DEMO=1` (enables only the fictional `/service` workflow when the server is on hosted infrastructure)
- `CS_DEMO_ADMIN_PASSWORD_HASH=<PBKDF2 hash of a unique strong demo staff password>`
- `CS_SESSION_SECRET=<random high entropy secret>`

The public visitor can create an evaluation account with a fictional alias and a reserved `@example.com`, `@example.net` or `@example.org` address, sign in, select one of four **prewritten fictional incidents**, receive a `CS-EVAL-` reference, and review case history. No free-form case details are accepted by the hosted demo server: client-supplied category, channel and summary fields are ignored. Account caps: 50 per temporary database, with up to 10 cases per account and 300 in total.

The separate staff interface at `/service/staff/login` requires a hashed owner-set password, signed temporary cookie, CSRF protection, and login rate limiting. Staff can only modify statuses and select predefined guidance for fictional cases; they cannot receive actual incident evidence. The old `/training-admin/login` shortcut redirects to this *isolated demo staff* login in hosted demo mode; the original localhost training admin remains disabled on hosting.

This temporary demo is **NOT production-ready**. No phone/email verification, email-based password reset, persistent user accounts, durable records, independent penetration test, or formal authorization is implemented. Do not submit real names, contact details, bank accounts, OTPs, passwords or victim records. For genuine Indian cybercrime reporting use https://cybercrime.gov.in/ and for financial cyber fraud call 1930 and your bank.

### Limitations of Render Free hosting

Render free web instances have **ephemeral filesystems**. The SQLite database and every evaluation account and synthetic case are erased after sleeping, restarting or redeploying; this is intended for demonstrations and is **not permanent citizen case tracking**.

### Validate after deployment

1. `/health` must report `mode: hosted-fictional-demo`.
2. `/service/register` must display a fictional registration form and reject real email domains.
3. `/service/login` must allow login with the newly created reserved-domain example account.
4. `/service/new` must show only predefined fictional scenarios; never request real incident details.
5. `/service/cases` must show only the logged-in user's fictional cases.
6. `/service/staff/login` must require the staff password; unauthenticated staff update requests must return 403.
7. `/report` and `/training-admin/cases/.../status` must remain unwritable on public hosting.

The separate original live website must **not** be updated automatically or merged without an independent review.

## Administrator activity screen

After setting `CS_DEMO_ADMIN_PASSWORD_HASH` on staging, the owner can open
`/service/staff/login` and enter a fictional operator display name (not independently
verified) plus the demo-only operator password. The staff page displays:

- Registered fictional user names and reserved `@example.*` email addresses.
- A timestamped log of explicit account registration, successful sign-ins,
  selected purposes, sign-outs, fictional case submissions and staff updates.
- Fictional complaint scenario, its submitter, status and predefined guidance.
- Staff-entered operator label for status updates and the case reference.

The demo does **not** use Gmail/Google OAuth, verify real identities, infer a person's
motives or silently track page views. It must not receive real citizen names,
real Gmail addresses, screenshots, evidence or descriptions of actual cybercrimes.
No staff personal identity can be proven merely from a display name and shared
password. For actual production use, provide per-staff identity and MFA, a durable
secure database, explicit privacy notices/consent, a retention policy, backups,
incident response, independent security assessment and appropriate legal approval.

**This is not a durable complaint register:** Render free loses all demonstration
records on restart/redeploy. A separate persistent production architecture is
needed for real cases.
