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

:: Canonical port is 8000 unless explicitly overridden as an argument
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

:: Check if the specified port is available on 127.0.0.1
set "PORT_CHECK_PY=%temp%\check_port_%RANDOM%.py"
(
  echo import socket, sys
  echo p = int^(sys.argv[1]^)
  echo s = socket.socket^(socket.AF_INET, socket.SOCK_STREAM^)
  echo try:
  echo     s.bind^(^(^'127.0.0.1^', p^)^)
  echo     s.close^(^)
  echo     sys.exit^(0^)
  echo except OSError:
  echo     sys.exit^(1^)
) > "%PORT_CHECK_PY%"

"%PYTHON_CMD%" "%PORT_CHECK_PY%" %PORT% >nul 2>nul
set "PORT_FREE=%ERRORLEVEL%"
del "%PORT_CHECK_PY%"

if not "%PORT_FREE%"=="0" (
  echo.
  if "%PORT%"=="8000" (
    echo Error: Port 8000 is already in use by another process.
    echo The canonical Quiz Studio local development origin is http://localhost:8000 to protect your localStorage data.
    echo Please close the process using port 8000 ^(such as an existing Quiz Studio server^) and run start-local.bat again.
    echo.
    echo (If you intentionally need a different port, run: start-local.bat ^<port^>^)
    echo (Note: A different port is a different browser origin and will not access existing localhost:8000 localStorage data.^)
  ) else (
    echo Error: Port %PORT% is already in use by another process.
    echo Please close the process using port %PORT% and run start-local.bat again.
  )
  echo.
  pause
  exit /b 1
)

:: Generate a dev nonce to bypass stale initial navigation cache while preserving canonical origin
set "NONCE=%RANDOM%%RANDOM%"
set "URL=http://localhost:%PORT%/?dev=%NONCE%"

:: Launch dev-server on the selected port asynchronously with no-store cache headers
start "Quiz Studio Server" cmd /k "%PYTHON_CMD%" "scripts\dev-server.py" %PORT%

:: Verify that the server actually started listening on %PORT% and is serving Quiz Studio
echo Starting local server on port %PORT%...
set "STARTED=0"
set "TRY_COUNT=0"

set "SERVER_VERIFIER_PY=%temp%\verify_server_%RANDOM%.py"
(
  echo import urllib.request, sys
  echo p = sys.argv[1]
  echo try:
  echo     with urllib.request.urlopen^(f^'http://127.0.0.1:{p}/^', timeout=1^) as r:
  echo         html = r.read^(^).decode^(^'utf-8^'^)
  echo         if ^'Quiz Studio^' in html:
  echo             sys.exit^(0^)
  echo         else:
  echo             sys.exit^(1^)
  echo except Exception:
  echo     sys.exit^(1^)
) > "%SERVER_VERIFIER_PY%"

:check_loop
"%PYTHON_CMD%" "%SERVER_VERIFIER_PY%" %PORT% >nul 2>nul
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
echo Quiz Studio is running at http://localhost:%PORT%/
echo Keep the server window open while using the app.
echo.

:: Open browser
start "" "%URL%"
pause
