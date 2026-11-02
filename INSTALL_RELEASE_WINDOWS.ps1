param(
    [string]$TargetPath = "$env:USERPROFILE\Downloads\CyberSuraksha2_Complete\CYBER_SURAKSHA_2_0_COMPLETE"
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $TargetPath -PathType Container)) { throw "Project folder not found: $TargetPath" }
if (!(Test-Path -LiteralPath (Join-Path $TargetPath '.git') -PathType Container)) { throw "Target is not your existing Git repository. Check the path." }
if (Test-Path -LiteralPath (Join-Path $TargetPath '.git\MERGE_HEAD')) { throw "Finish the current Git merge using git commit BEFORE installing this release." }
$unmerged = git -C $TargetPath ls-files -u
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Git merge status.' }
if ($unmerged) { throw 'Resolve the pending Git merge and commit it before installing this release.' }
$branch = "backup-before-release-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git -C $TargetPath branch $branch
if ($LASTEXITCODE -ne 0) { throw 'Could not create backup Git branch.' }
Write-Host "Created backup branch: $branch"
Write-Host 'Copying release files while excluding private databases, virtualenv, backups and Git history...'
robocopy $PSScriptRoot $TargetPath /E /XD .git .venv __pycache__ /XF *.db *.sqlite *.sqlite3 *.db-* .env *.bak *.backup *.pyc /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) { throw "Robocopy reported an error: $LASTEXITCODE" }
Write-Host 'Release files copied. Existing untracked repair scripts and private database were not deleted.'
Write-Host 'Next: run tests, review git status, stage ONLY required files, commit, and push.'
git -C $TargetPath status --short
