@echo off
rem EventNote: start automatically at logon (http://localhost:8080). Double-click to run.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
pause
