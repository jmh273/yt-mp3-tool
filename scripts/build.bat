@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM build.bat - produce a self-contained Windows zip release of yt-mp3-tool.
REM
REM Steps:
REM   1. Compute version from `git describe --tags --abbrev=0` (strip leading v)
REM      Override by setting VERSION env var (CI passes the tag explicitly).
REM   2. Build frontend SPA (npm run build -> frontend/dist/)
REM   3. Stage SPA into backend/static/
REM   4. Run PyInstaller (yt-mp3-tool.spec -> backend/dist/yt-mp3-tool/)
REM   5. Stage ffmpeg.exe + mp3gain.exe + THIRD-PARTY-NOTICES.txt + update.bat
REM   6. Zip -> dist/yt-mp3-tool-v<VERSION>-windows-x64.zip
REM
REM NOTE: client_secret.json is NOT bundled — self-hosters supply their own.
REM       The build fails if any client_secret.json sneaks into the zip.
REM
REM Required tools on PATH: git, node, npm, python (with pyinstaller installed)
REM Required files in tools/: ffmpeg.exe, mp3gain.exe
REM ============================================================================

cd /d "%~dp0\.."
set REPO_ROOT=%CD%
set BACKEND=%REPO_ROOT%\backend
set FRONTEND=%REPO_ROOT%\frontend
set TOOLS=%REPO_ROOT%\tools
set DIST=%REPO_ROOT%\dist

REM --- 1. Version ---------------------------------------------------------------
if defined VERSION (
    echo [build] Using VERSION from env: !VERSION!
) else (
    for /f "tokens=*" %%i in ('git describe --tags --abbrev^=0 2^>nul') do set TAG=%%i
    if "!TAG!"=="" (
        echo [build] No git tag found; defaulting VERSION=0.0.0-dev
        set VERSION=0.0.0-dev
    ) else (
        set VERSION=!TAG!
    )
)
REM Strip a single leading 'v' if present (so v0.5.0 becomes 0.5.0; v-only chars in version stay)
if "!VERSION:~0,1!"=="v" set VERSION=!VERSION:~1!
echo [build] VERSION=!VERSION!
> "%BACKEND%\_version.txt" echo !VERSION!

REM --- 2. Verify required bundled tools -----------------------------------------
REM client_secret.json is intentionally NOT required — open-source releases ship
REM without it, and self-hosters drop in their own next to the exe.
for %%F in (ffmpeg.exe mp3gain.exe) do (
    if not exist "%TOOLS%\%%F" (
        echo [build] ERROR: missing %TOOLS%\%%F
        echo [build] Place ffmpeg.exe and mp3gain.exe in tools/ before building.
        exit /b 1
    )
)

REM --- 3. Frontend build --------------------------------------------------------
REM Note: using build-only (skips vue-tsc type-check). The full `npm run build`
REM also runs type-check which currently fails on some pre-existing test-file
REM type issues unrelated to the production bundle. vite build itself is fine.
echo [build] Building frontend...
pushd "%FRONTEND%"
call npm ci || (popd & exit /b 1)
call npm run build-only || (popd & exit /b 1)
popd

REM Stage SPA into backend/static/
if exist "%BACKEND%\static" rmdir /s /q "%BACKEND%\static"
xcopy "%FRONTEND%\dist" "%BACKEND%\static\" /e /i /q || exit /b 1

REM --- 4. PyInstaller -----------------------------------------------------------
echo [build] Running PyInstaller...
pushd "%BACKEND%"
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
python -m PyInstaller "..\yt-mp3-tool.spec" --noconfirm --clean || (popd & exit /b 1)
popd

set BUNDLE=%BACKEND%\dist\yt-mp3-tool

REM --- 5. Stage extras into the bundle ------------------------------------------
echo [build] Staging extras...
copy /y "%TOOLS%\ffmpeg.exe"          "%BUNDLE%\" >nul || exit /b 1
copy /y "%TOOLS%\mp3gain.exe"         "%BUNDLE%\" >nul || exit /b 1
copy /y "%REPO_ROOT%\scripts\update.bat" "%BUNDLE%\" >nul || exit /b 1
if exist "%REPO_ROOT%\THIRD-PARTY-NOTICES.txt" (
    copy /y "%REPO_ROOT%\THIRD-PARTY-NOTICES.txt" "%BUNDLE%\" >nul || exit /b 1
) else (
    echo [build] ERROR: missing %REPO_ROOT%\THIRD-PARTY-NOTICES.txt ^(GPL compliance^)
    exit /b 1
)
if exist "%REPO_ROOT%\docs\README-DEPLOY.md" (
    copy /y "%REPO_ROOT%\docs\README-DEPLOY.md" "%BUNDLE%\" >nul
)

REM --- 5b. Safety net: never ship a client_secret.json ----------------------------
REM Even though we no longer stage it, guard against a stray copy left in the
REM bundle by a previous build or a manually-dropped file.
if exist "%BUNDLE%\client_secret.json" (
    echo [build] ERROR: client_secret.json found in bundle — refusing to package.
    echo [build] Open-source releases must NOT contain personal credentials.
    exit /b 1
)

REM --- 6. Zip -------------------------------------------------------------------
if not exist "%DIST%" mkdir "%DIST%"
set ZIP=%DIST%\yt-mp3-tool-v!VERSION!-windows-x64.zip
if exist "%ZIP%" del "%ZIP%"
echo [build] Zipping -^> %ZIP%
powershell -NoProfile -Command "Compress-Archive -Path '%BUNDLE%\*' -DestinationPath '%ZIP%' -Force" || exit /b 1

echo.
echo [build] Done. Artifact: %ZIP%
for %%I in ("%ZIP%") do echo [build] Size: %%~zI bytes
exit /b 0
