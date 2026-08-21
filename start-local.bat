@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_CMD="
where py >nul 2>nul
if %ERRORLEVEL%==0 set "PYTHON_CMD=py"

if "%PYTHON_CMD%"=="" (
  where python >nul 2>nul
  if %ERRORLEVEL%==0 set "PYTHON_CMD=python"
)

if "%PYTHON_CMD%"=="" (
  echo Python was not found. Install Python or start any static web server in this folder.
  pause
  exit /b 1
)

:: Find an available port starting from 8000
set "PORT_FINDER_PY=%temp%\find_port_%RANDOM%.py"
(
  echo import socket
  echo p = 8000
  echo while True:
  echo     try:
  echo         s = socket.socket^(socket.AF_INET, socket.SOCK_STREAM^)
  echo         s.bind^(^(^'127.0.0.1^', p^)^)
  echo         s.close^(^)
  echo         print^(p^)
  echo         break
  echo     except OSError:
  echo         p += 1
) > "%PORT_FINDER_PY%"

for /f "tokens=*" %%A in ('%PYTHON_CMD% "%PORT_FINDER_PY%"') do (
  set "PORT=%%A"
)
del "%PORT_FINDER_PY%"

if "%PORT%"=="" (
  echo Error: Could not find an available port.
  pause
  exit /b 1
)

set "URL=http://localhost:%PORT%"

:: Launch http.server on the selected port asynchronously
start "Quiz Studio Server" cmd /k "%PYTHON_CMD%" -m http.server %PORT% --bind 127.0.0.1

:: Verify that the server actually started listening on %PORT% and is serving Quiz Studio
echo Starting local server on port %PORT%...
set "STARTED=0"
set "TRY_COUNT=0"

set "SERVER_VERIFIER_PY=%temp%\verify_server_%RANDOM%.py"
(
  echo import urllib.request
  echo try:
  echo     with urllib.request.urlopen^(^'http://127.0.0.1:%PORT%/^', timeout=1^) as r:
  echo         html = r.read^(^).decode^(^'utf-8^'^)
  echo         if ^'Quiz Studio^' in html:
  echo             print^(^'OK^'^)
  echo             exit^(0^)
  echo         else:
  echo             exit^(1^)
  echo except Exception:
  echo     exit^(1^)
) > "%SERVER_VERIFIER_PY%"

:check_loop
"%PYTHON_CMD%" "%SERVER_VERIFIER_PY%" >nul 2>nul
if %ERRORLEVEL%==0 (
  set "STARTED=1"
  goto server_ready
)

set /a TRY_COUNT+=1
if %TRY_COUNT% LSS 5 (
  ping -n 2 127.0.0.1 >nul
  goto check_loop
)

:server_ready
del "%SERVER_VERIFIER_PY%"
if "%STARTED%"=="0" (
  echo.
  echo Error: Server failed to start on port %PORT% after 5 seconds.
  echo Please make sure the port is not blocked and that Python can bind to 127.0.0.1.
  pause
  exit /b 1
)

echo.
echo Quiz Studio is running at %URL%
echo Keep the server window open while using the app.
echo.

:: Open browser
start "" "%URL%"
pause
