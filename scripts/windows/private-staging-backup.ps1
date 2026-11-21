# CYBER SURAKSHA 2.0 - PRIVATE staging pg_dump backup.
# Windows PowerShell 5.1+; PostgreSQL 18 tools. No paid Neon snapshot.
# Backup encrypted using Windows DPAPI for CURRENT WINDOWS USER; store an
# additional protected recovery method before relying on this for disasters.
# This script never runs SQL writes, modifies Neon or sends data to GitHub.
[CmdletBinding()]
param(
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA "CyberSuraksha\private-backups")
)
$ErrorActionPreference = "Stop"
$expectedBranch = "br-sweet-band-azhwai4r"
$expectedDatabase = "cybersuraksha"
$dumpExe = Join-Path $PgBin "pg_dump.exe"
$restoreExe = Join-Path $PgBin "pg_restore.exe"
foreach ($exe in @($dumpExe,$restoreExe)) {
  if (!(Test-Path -LiteralPath $exe)) { throw "Required PostgreSQL 18 tool missing: $exe" }
}
$branch = Read-Host "Confirm staging Neon branch ID (not production)"
if ($branch -cne $expectedBranch) { throw "STOP: staging branch ID mismatch." }
Write-Host "Open Neon staging branch -> Connection Details. Read only its STAGING hostname, user and database."
$hostName = (Read-Host "STAGING Neon database host (hostname only)").Trim()
if ($hostName -notmatch '^[a-zA-Z0-9.-]+\.neon\.tech$') { throw "STOP: not a Neon hostname." }
$dbName = (Read-Host "Database name (must be cybersuraksha)").Trim()
if ($dbName -cne $expectedDatabase) { throw "STOP: database mismatch." }
$userName = (Read-Host "Database role from staging connection details").Trim()
if ($userName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$') { throw "STOP: invalid database role." }
$secret = Read-Host "Staging database password (not shown)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

# Perform a custom-format dump to MEMORY, not an unencrypted file.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $dumpExe
$psi.Arguments = "--format=custom --no-owner --no-acl"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.EnvironmentVariables["PGHOST"] = $hostName
$psi.EnvironmentVariables["PGPORT"] = "5432"
$psi.EnvironmentVariables["PGDATABASE"] = $dbName
$psi.EnvironmentVariables["PGUSER"] = $userName
$psi.EnvironmentVariables["PGPASSWORD"] = $plainPassword
$psi.EnvironmentVariables["PGSSLMODE"] = "verify-full"
$psi.EnvironmentVariables["PGSSLROOTCERT"] = "system"
$plainPassword = $null
$dumpBytes = $null
$process = New-Object System.Diagnostics.Process
$stream = New-Object System.IO.MemoryStream
try {
  $process.StartInfo = $psi
  if (!$process.Start()) { throw "pg_dump failed to start." }
  $errorTask = $process.StandardError.ReadToEndAsync()
  $process.StandardOutput.BaseStream.CopyTo($stream)
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "pg_dump failed (exit code $($process.ExitCode)). Check Neon staging credentials and TLS settings locally."
  }
  $dumpBytes = $stream.ToArray()
  if ($dumpBytes.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($dumpBytes,0,5) -cne "PGDMP") {
    throw "STOP: invalid custom-format PostgreSQL dump."
  }
} finally {
  $process.Dispose()
  $stream.Dispose()
  $psi.EnvironmentVariables.Remove("PGPASSWORD")
}

# Validate archive metadata via pg_restore --list using in-memory stdin.
$listPsi = New-Object System.Diagnostics.ProcessStartInfo
$listPsi.FileName = $restoreExe
$listPsi.Arguments = "--list"
$listPsi.UseShellExecute = $false
$listPsi.CreateNoWindow = $true
$listPsi.RedirectStandardInput = $true
$listPsi.RedirectStandardOutput = $true
$listPsi.RedirectStandardError = $true
$listProc = New-Object System.Diagnostics.Process
try {
  $listProc.StartInfo = $listPsi
  if (!$listProc.Start()) { throw "pg_restore validation failed to start." }
  $outTask = $listProc.StandardOutput.ReadToEndAsync()
  $errTask = $listProc.StandardError.ReadToEndAsync()
  $listProc.StandardInput.BaseStream.Write($dumpBytes,0,$dumpBytes.Length)
  $listProc.StandardInput.Close()
  $listProc.WaitForExit()
  if ($listProc.ExitCode -ne 0 -or !$outTask.Result.Contains("TABLE")) {
    throw "STOP: archive listing validation failed."
  }
} finally { $listProc.Dispose() }

Add-Type -AssemblyName System.Security
$encrypted = [Security.Cryptography.ProtectedData]::Protect(
  $dumpBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Array]::Clear($dumpBytes,0,$dumpBytes.Length)
$dumpBytes = $null
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$path = Join-Path $BackupDirectory "cs-google-stage-$stamp.pgdmp.dpapi"
if (Test-Path -LiteralPath $path) { throw "STOP: backup path already exists." }
[IO.File]::WriteAllBytes($path,$encrypted)
$hash = [BitConverter]::ToString(
  [Security.Cryptography.SHA256]::Create().ComputeHash($encrypted)
).Replace("-","").ToLowerInvariant()
Write-Host "Encrypted backup saved to: $path"
Write-Host "SHA256 (encrypted file): $hash"
Write-Host "Archive listing: PASS. Full restore: NOT VERIFIED. Run the separate restore rehearsal."
Write-Host "Important: DPAPI CurrentUser backups depend on this Windows user profile and machine."
