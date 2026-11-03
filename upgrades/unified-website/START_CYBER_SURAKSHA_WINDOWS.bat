@echo off
setlocal
cd /d "%~dp0"
set CS_PUBLIC_MODE=0
set CS_LOCAL_TRAINING=1
set CS_PORT=8080
set CS_AUTO_OPEN=1
echo.
echo CYBER SURAKSHA 2.0 - Complete Unified Website
echo Local access: http://127.0.0.1:8080
echo Only fictional data is permitted in the local training system.
echo Press Ctrl+C to stop. No packages required.
echo.
where py >nul 2>&1
if %errorlevel%==0 (py -3 app.py) else (python app.py)
if errorlevel 1 (echo Could not start. Confirm Python 3.10+ is installed and port 8080 is free. & pause)
