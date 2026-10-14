@echo off
rem EventNote: run the desktop app without building an installer (for development).
cd /d "%~dp0"
if not exist node_modules (
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
call npm start
if errorlevel 1 pause
