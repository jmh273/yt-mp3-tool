@echo off
echo ===================================================
echo [1/4] Checking ffmpeg...
echo ===================================================
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ffmpeg not found. Please install and add to PATH.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo [2/4] Closing existing processes on ports 8000/5173...
echo ===================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "127.0.0.1:8000"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "0.0.0.0:8000"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "127.0.0.1:5173"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "0.0.0.0:5173"') do taskkill /F /PID %%a 2>nul

echo.
echo ===================================================
echo [3/4] Starting Backend Server (FastAPI)...
echo ===================================================
start "" "%~dp0_run_backend.bat"

timeout /t 3 /nobreak >nul

echo.
echo ===================================================
echo [4/4] Starting Frontend Client (Vue/Vite)...
echo ===================================================
start "" "%~dp0_run_frontend.bat"

timeout /t 4 /nobreak >nul

start http://localhost:5173

echo.
echo Done!
pause
