@echo off
setlocal
cd /d "%~dp0"
set CS_PUBLIC_MODE=1
set CS_LOCAL_TRAINING=0
set CS_PORT=8080
set CS_AUTO_OPEN=1
echo CYBER SURAKSHA 2.0 - Public read-only preview at http://127.0.0.1:8080
where py >nul 2>&1
if %errorlevel%==0 (py -3 app.py) else (python app.py)
if errorlevel 1 pause
