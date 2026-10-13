@echo off
rem Called by run-backend.ps1: start the backend and append its output to the log.
cd /d "%~dp0..\backend"
if not exist node_modules (
  echo [runner] node_modules not found. Running npm install...>> "%LOCALAPPDATA%\EventNote\backend.log"
  call npm install >> "%LOCALAPPDATA%\EventNote\backend.log" 2>&1
)
node app.js >> "%LOCALAPPDATA%\EventNote\backend.log" 2>&1
exit /b %ERRORLEVEL%
