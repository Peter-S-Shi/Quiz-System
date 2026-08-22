@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if %ERRORLEVEL%==0 goto run_py

where python >nul 2>nul
if %ERRORLEVEL%==0 goto run_python

echo Error: Python 3 was not found.
echo Install Python 3, ensure either "py" or "python" is on PATH, and run start-local.bat again.
pause
exit /b 1

:run_py
py -3 -u scripts\dev-server.py %*
set "RUNTIME_EXIT=%ERRORLEVEL%"
goto finish

:run_python
python -u scripts\dev-server.py %*
set "RUNTIME_EXIT=%ERRORLEVEL%"

:finish
if not "%RUNTIME_EXIT%"=="0" pause
exit /b %RUNTIME_EXIT%
