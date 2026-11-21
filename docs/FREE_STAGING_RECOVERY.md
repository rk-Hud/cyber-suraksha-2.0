# CYBER SURAKSHA 2.0 — zero-additional-cost staging backup and recovery

**Status: PROCEDURE PREPARED, NOT EXECUTED.** No snapshot, branch clone, external storage account, staging database migration, live operator deployment, or production change is authorized. The code is a Windows-local option for review and operator execution; nothing has been copied from Neon.

## Why this exists

The project owner declined all billed Neon snapshots. The live staging branch `br-sweet-band-azhwai4r` is intentionally kept unexpired. A private `pg_dump` can run locally with the existing PostgreSQL 18 client without purchasing a snapshot. **Check existing Neon project compute/egress quotas independently**; free tools do not imply unlimited free Neon usage.

**Security and recovery limitation:** The provided backup encrypts the PostgreSQL archive using Windows DPAPI `CurrentUser`. It is tied to that Windows profile and machine; **it is not a portable disaster-recovery backup**. Losing the machine/profile may make the archive unrecoverable. It supports a local restore rehearsal, but cannot by itself satisfy disaster recovery after laptop failure. Protect the Windows account and disk, avoid cloud-synced folders, and arrange another separately approved and verified recovery method if long-term disaster recovery is required.

## Prerequisites

- Windows PowerShell, plus PostgreSQL 18 `pg_dump.exe`, `pg_restore.exe`, `createdb.exe` and `psql.exe`.
- User logs into Neon console personally, selects **google-signin-staging** (`br-sweet-band-azhwai4r`), opens **Connection Details**, and obtains host/role/password privately. Never put credentials into GitHub, screenshots or chat. **Do not select production** (`br-holy-darkness-az8i1rma`).
- HTTPS Neon control-plane confirmation that staging `expires_at` is unset; avoid auto-provisioning new paid resources.
- Available RAM for the entire custom-format archive and its encrypted copy; the script holds the archive in memory. Expect more than twice compressed archive size.
- A loopback-only, **existing local PostgreSQL installation** for restoration; it creates a fresh randomly named local database. It does **not** run against Neon.

## Step 1 — encrypted staging backup (Windows PowerShell)

Open a Windows PowerShell console in a local checkout of this PR branch, then run:

```powershell
Set-Location "C:\path\to\your\checked-out\cyber-suraksha-2.0"
& ".\scripts\windows\private-staging-backup.ps1"
```

Supply the **exact staging branch ID** and the staging connection host, database name `cybersuraksha`, role and hidden password when prompted. The command does a read-only custom-format `pg_dump` to memory, checks the `PGDMP` signature, verifies `pg_restore --list`, and writes only a DPAPI-encrypted archive under:

`%LOCALAPPDATA%\CyberSuraksha\private-backups\`

The script prints the local encrypted path and SHA-256 of the encrypted file. It never prints the password, tokens or private case contents. Do not publish that file, copy it to GitHub or share it through cloud storage. TLS configuration requires PostgreSQL 18 with `verify-full` and `sslrootcert=system`.

If credentials, TLS validation or archive listing fail, treat backup as **FAILED**, not successful.

## Step 2 — isolated restore rehearsal, local only

Run from the same Windows user profile and laptop, with the encrypted file path returned by Step 1:

```powershell
& ".\scripts\windows\verify-private-staging-restore.ps1" -EncryptedBackup "C:\PRIVATE\PATH\cs-google-stage-YYYYMMDD-HHMMSS.pgdmp.dpapi"
```

The command asks to type `RESTORE`, asks for the **local PostgreSQL** username/password, and creates `cs_restore_test_<random>` on **127.0.0.1:5432**. No existing local database is dropped or overwritten. The archive is decrypted in RAM, restored into the new database and checked for these exact **fictional** staging references:

- `CS-69B1F5151000` (Citizen A test)
- `CS-1464A96538BB` (Citizen B test)

It checks counts only for the two cases and linked Google identities. It leaves the test database in place for private local inspection. Delete it manually only after the rehearsal is accepted. The restored test database may contain personal data beyond those fictional case references; keep local PostgreSQL bound to loopback, deny outside access and protect its credentials.

If either restore or verification fails, mark the recovery acceptance **BLOCKED**. Archive listing by itself is **not** restore verification.

## Approval and safety boundaries

- No Neon snapshots, branch copies, paid services or plan upgrades.
- No live staging SQL writes, operator Function deployments, Google Cloud changes, GitHub production release or Render deletion.
- Do not run these restore commands with a production database host or production credentials.
- Do not embed any password or connection URL in CLI arguments, GitHub commits, issue comments or screenshots.
- Executing the **backup** is a read-only PostgreSQL operation; creating/restoring the isolated **local** database is a local write, not a Neon write.
- A finished encrypted local dump is not a comprehensive disaster-recovery solution. Require a genuinely recoverable private backup and restore rehearsal before authorizing administrator migration.

## What to record in public issue #9

Only: branch label, encrypted backup existence (yes/no), archive listing (PASS/FAIL), local restore (PASS/FAIL), fictional-case count (2 expected), linked-identity count (at least 2), and date/time. Never record archive, SHA-256 if unnecessary, credentials, real citizen fields, Google subject values or private case contents.

**Next:** locally execute and privately review backup + restore. Until this has passed, hold operator migration and deployment. Source-only preparation and security tests can continue.
