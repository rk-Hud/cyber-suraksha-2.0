@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (py -3 scripts\start_secure_admin.py) else (python scripts\start_secure_admin.py)
if errorlevel 1 pause
