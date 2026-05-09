@echo off
title YT-MP3 Frontend
cd /d %~dp0frontend
echo ========================================
echo  YT-MP3 Frontend (port 5173)
echo ========================================
echo.
call npm run dev -- --open
echo.
echo Frontend stopped. Press any key to close.
pause >nul
