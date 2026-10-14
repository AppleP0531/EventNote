@echo off
rem Called by run-backend.ps1: build the frontend, then start the backend on port 8080
rem (the backend serves both the screen and the API). Output is appended to the log.
set "LOG=%LOCALAPPDATA%\EventNote\backend.log"

cd /d "%~dp0..\frontend"
if not exist node_modules (
  echo [runner] Installing frontend packages...>> "%LOG%"
  call npm install >> "%LOG%" 2>&1
)
echo [runner] Building frontend...>> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 echo [runner] Frontend build failed. Using the previous build if any.>> "%LOG%"

cd /d "%~dp0..\backend"
if not exist node_modules (
  echo [runner] Installing backend packages...>> "%LOG%"
  call npm install >> "%LOG%" 2>&1
)
set PORT=8080
node app.js >> "%LOG%" 2>&1
exit /b %ERRORLEVEL%
