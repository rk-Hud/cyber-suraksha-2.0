# CYBER SURAKSHA 2.0 - isolated local staging restore verification.
# Windows PowerShell 5.1+ with PostgreSQL 18 tools installed.
# No Neon connection. No local database deletion. No decrypted archive on disk.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$EncryptedBackup,
 [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin"
)
$ErrorActionPreference = "Stop"
$createdb = Join-Path $PgBin "createdb.exe"
$pgrestore = Join-Path $PgBin "pg_restore.exe"
$psql = Join-Path $PgBin "psql.exe"
foreach($exe in @($createdb,$pgrestore,$psql)) {
 if (!(Test-Path -LiteralPath $exe)) { throw "Missing PostgreSQL 18 tool: $exe" }
}
if (!(Test-Path -LiteralPath $EncryptedBackup)) { throw "Encrypted backup file missing." }
if (!$EncryptedBackup.EndsWith(".pgdmp.dpapi")) { throw "STOP: unexpected backup extension." }
Add-Type -AssemblyName System.Security
$encrypted = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $EncryptedBackup).Path)
try {
 $dump = [Security.Cryptography.ProtectedData]::Unprotect(
   $encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
} catch { throw "Cannot decrypt: requires the original Windows user profile on its original machine." }
if ($dump.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($dump,0,5) -cne "PGDMP") {
 throw "STOP: invalid PostgreSQL archive."
}
$target = "cs_restore_test_" + [Guid]::NewGuid().ToString("N").Substring(0,12)
Write-Host "Will CREATE a new database $target on LOCALHOST only."
Write-Host "Existing local databases will not be modified or deleted."
$confirmation = Read-Host "Type RESTORE to proceed"
if ($confirmation -cne "RESTORE") { throw "Cancelled before local database creation." }
$localUser = (Read-Host "LOCAL PostgreSQL role, e.g. postgres").Trim()
if ($localUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$') { throw "Invalid local role." }
$password = Read-Host "LOCAL PostgreSQL password (hidden)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
function New-Psi([string]$exe,[string]$arguments,[bool]$input = $false) {
 $psi = New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName = $exe
 $psi.Arguments = $arguments
 $psi.UseShellExecute = $false
 $psi.CreateNoWindow = $true
 $psi.RedirectStandardError = $true
 $psi.RedirectStandardOutput = $true
 $psi.RedirectStandardInput = $input
 $psi.EnvironmentVariables["PGHOST"] = "127.0.0.1"
 $psi.EnvironmentVariables["PGPORT"] = "5432"
 $psi.EnvironmentVariables["PGUSER"] = $localUser
 $psi.EnvironmentVariables["PGPASSWORD"] = $plain
 return $psi
}
function Run-Local([System.Diagnostics.ProcessStartInfo]$psi,[byte[]]$payload = $null) {
 $p = New-Object System.Diagnostics.Process
 try {
   $p.StartInfo = $psi
   if (!$p.Start()) { throw "Local PostgreSQL process could not start." }
   $out = $p.StandardOutput.ReadToEndAsync()
   $err = $p.StandardError.ReadToEndAsync()
   if ($psi.RedirectStandardInput) {
     $p.StandardInput.BaseStream.Write($payload,0,$payload.Length)
     $p.StandardInput.Close()
   }
   $p.WaitForExit()
   if ($p.ExitCode -ne 0) { throw "Local command failed. Inspect LOCAL PostgreSQL configuration." }
   return $out.Result.Trim()
 } finally { $p.Dispose(); $psi.EnvironmentVariables.Remove("PGPASSWORD") }
}
try {
 $null = Run-Local (New-Psi $createdb "-T template0 --encoding=UTF8 $target")
 Write-Host "Local restore database created: $target"
 $null = Run-Local (New-Psi $pgrestore "--exit-on-error --no-owner --no-acl --dbname=$target" $true) $dump
 $sql = "SELECT (SELECT count(*) FROM portal_complaints WHERE reference IN ('CS-69B1F5151000','CS-1464A96538BB'))::text || '|' || (SELECT count(*) FROM portal_google_identities)::text || '|' || (SELECT count(DISTINCT user_id) FROM portal_google_identities)::text;"
 $bytes = [Text.Encoding]::UTF8.GetBytes($sql)
 $counts = Run-Local (New-Psi $psql "-d $target -t -A -f -" $true) $bytes
 $parts = $counts.Trim().Split('|')
 if ($parts.Count -ne 3 -or [int]$parts[0] -ne 2 -or
     [int]$parts[1] -lt 2 -or [int]$parts[2] -lt 2) {
   throw "STOP: restore data verification failed. Local $target was retained."
 }
 Write-Host "PASS: isolated local PostgreSQL restore has both fictional cases and 2 distinct linked citizens."
 Write-Host "Review and securely remove LOCAL test database $target yourself when finished."
} finally {
 if ($dump) { [Array]::Clear($dump,0,$dump.Length) }
 $plain = $null
}
