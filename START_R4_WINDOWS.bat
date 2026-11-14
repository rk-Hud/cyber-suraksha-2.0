@echo off
setlocal EnableExtensions
cd /d "%~dp0deploy\cyber-suraksha-independent"
if not exist ".venv\Scripts\python.exe" (
    py -3 -m venv ".venv"
    if errorlevel 1 (
        echo Python virtual environment setup failed.
        exit /b 1
    )
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
if not defined CS20_PORT set CS20_PORT=8094
echo CYBER SURAKSHA 2.0 R4: http://127.0.0.1:%CS20_PORT%/
".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port %CS20_PORT% --no-access-log
