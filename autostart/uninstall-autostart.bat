@echo off
rem EventNote: remove backend autostart and stop the background backend
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1"
pause
