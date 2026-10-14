@echo off
rem EventNote: build the Windows installer (release\EventNote Setup x.y.z.exe).
rem Double-click to run. Takes a few minutes the first time.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo [1/2] Installing packages...
call npm install
if errorlevel 1 goto :error
echo [2/2] Building the EventNote installer...
call npm run dist
if errorlevel 1 goto :error
echo.
echo Done. Run the installer in the "release" folder:
dir /b "%~dp0release\*.exe"
start "" "%~dp0release"
pause
exit /b 0
:error
echo.
echo Build failed. Check the messages above.
pause
exit /b 1
