@echo off
rem EventNote: register backend autostart (double-click to run)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
pause
