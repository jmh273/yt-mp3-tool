@echo off
title YT-MP3 Backend
cd /d %~dp0backend
echo ========================================
echo  YT-MP3 Backend (port 8000)
echo ========================================
echo.
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
echo.
echo Backend stopped. Press any key to close.
pause >nul
