@echo off
rem EventNote: open the background backend log
if exist "%LOCALAPPDATA%\EventNote\backend.log" (
  notepad "%LOCALAPPDATA%\EventNote\backend.log"
) else (
  echo Log file not found: %LOCALAPPDATA%\EventNote\backend.log
  pause
)
