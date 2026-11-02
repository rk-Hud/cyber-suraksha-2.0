@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: Cannot find .venv\Scripts\python.exe
  echo Place this file in your CYBER_SURAKSHA_2_0_COMPLETE project folder.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "scripts\run_unified_site.py"
if errorlevel 1 (
  echo.
  echo CYBER SURAKSHA did not start. Read the message above.
  pause
)
