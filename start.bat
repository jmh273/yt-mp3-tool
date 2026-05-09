@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo [1/5] Checking ffmpeg...
echo ===================================================
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ffmpeg not found. Please install and add to PATH.
    pause
    exit /b 1
)
echo [OK] ffmpeg found.

echo.
echo ===================================================
echo [2/5] Stopping existing backend (port 8000)...
echo ===================================================
set BACKEND_FOUND=0

REM Kill wrapper cmd.exe windows hosting _run_backend.bat (and their child trees)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match '_run_backend\.bat' } | Select-Object -ExpandProperty ProcessId"') do (
    echo [INFO] Closing backend wrapper PID %%i...
    taskkill /F /PID %%i /T >nul 2>&1
    set BACKEND_FOUND=1
)

REM Fallback: kill any process still listening on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
    echo [INFO] Killing leftover process on port 8000 PID %%a...
    taskkill /F /PID %%a /T >nul 2>&1
    set BACKEND_FOUND=1
)

if !BACKEND_FOUND!==0 (
    echo [OK] Backend not running.
) else (
    echo [OK] Existing backend stopped.
)

echo.
echo ===================================================
echo [3/5] Stopping existing frontend (port 5173)...
echo ===================================================
set FRONTEND_FOUND=0

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match '_run_frontend\.bat' } | Select-Object -ExpandProperty ProcessId"') do (
    echo [INFO] Closing frontend wrapper PID %%i...
    taskkill /F /PID %%i /T >nul 2>&1
    set FRONTEND_FOUND=1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5173"') do (
    echo [INFO] Killing leftover process on port 5173 PID %%a...
    taskkill /F /PID %%a /T >nul 2>&1
    set FRONTEND_FOUND=1
)

if !FRONTEND_FOUND!==0 (
    echo [OK] Frontend not running.
) else (
    echo [OK] Existing frontend stopped.
)

REM Wait for OS to release ports if anything was killed
if !BACKEND_FOUND!==1 timeout /t 2 /nobreak >nul
if !FRONTEND_FOUND!==1 timeout /t 2 /nobreak >nul

echo.
echo ===================================================
echo [4/5] Starting Backend Server (FastAPI)...
echo ===================================================
start "" "%~dp0_run_backend.bat"

timeout /t 3 /nobreak >nul

echo.
echo ===================================================
echo [5/5] Starting Frontend Client (Vue/Vite)...
echo ===================================================
start "" "%~dp0_run_frontend.bat"

echo.
echo Done! (window will auto-close in 5 seconds)
endlocal
timeout /t 5 /nobreak >nul
