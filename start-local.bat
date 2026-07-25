@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%"

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "Quiz Studio Server" cmd /k py -m http.server %PORT% --bind 127.0.0.1
  goto open_app
)

where python >nul 2>nul
if %ERRORLEVEL%==0 (
  start "Quiz Studio Server" cmd /k python -m http.server %PORT% --bind 127.0.0.1
  goto open_app
)

echo Python was not found. Install Python or start any static web server in this folder.
pause
exit /b 1

:open_app
timeout /t 2 /nobreak >nul
start "" "%URL%"
echo Quiz Studio is starting at %URL%
echo Keep the server window open while using the app.
pause
