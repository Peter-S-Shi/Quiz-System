@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 goto run_py

where python >nul 2>nul
if not errorlevel 1 goto run_python

echo Error: Python 3 was not found.
echo Install Python 3, ensure either "py" or "python" is on PATH, and run start-local.bat again.
echo 错误：未找到 Python 3。
echo 请安装 Python 3，确认 "py" 或 "python" 已加入 PATH，然后重新运行 start-local.bat。
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
