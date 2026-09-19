@echo off
title Yetflix by Yashraj
rem -- Zero-build launcher: runs the site locally and opens it in a browser
cd /d "%~dp0.."

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install || (pause & exit /b 1)
)

if not exist .next (
  echo Building Yetflix, first run only...
  call npm run build || (pause & exit /b 1)
)

start "" http://localhost:3000/home
echo Yetflix is running. Keep this window open. Press Ctrl+C to stop.
call npm start
