@echo off
rem EventNote: remove autostart and stop the background EventNote
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1"
pause
