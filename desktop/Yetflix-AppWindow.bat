@echo off
title Yetflix by Yashraj
rem ── Zero-packaging desktop app: runs the site + opens it in a chromeless
rem    Edge app window (WebView2's sibling, preinstalled on Windows 10/11).
rem    No Electron, no builder, nothing to go wrong. Keep this window open.
cd /d "%~dp0.."

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is required — install the LTS from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run only^)…
  call npm install || (pause & exit /b 1)
)

if not exist .next (
  echo Building Yetflix ^(first run only^)…
  call npm run build || (pause & exit /b 1)
)

if not exist .next\standalone call npm run build

echo Starting Yetflix server…
start "Yetflix server" /min cmd /c "npm start"

echo Waiting for the server…
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 90 -and -not $ok;$i++){ try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/home | Out-Null; $ok=$true } catch { Start-Sleep -Milliseconds 500 } }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo Server did not start — check the minimized 'Yetflix server' window.
  pause
  exit /b 1
)

set "APPURL=http://localhost:3000/home"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app=%APPURL%
) else (
  echo Edge not found — opening in your default browser instead.
  start "" %APPURL%
)

echo.
echo Yetflix is running in its own app window.
echo To stop Yetflix: close the minimized "Yetflix server" window.
