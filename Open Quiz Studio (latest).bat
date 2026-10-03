@echo off
rem Builds the latest working-tree code and opens Quiz Studio V2. Add "scratch" to use a throwaway data folder.
setlocal
set "ARGS="
if /I "%~1"=="scratch" set "ARGS=-Scratch"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\scripts\open-latest.ps1" %ARGS%
if errorlevel 1 (
  echo.
  echo Build or launch failed. See messages above.
  pause
)
endlocal
