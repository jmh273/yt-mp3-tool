@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM update.bat - pull latest yt-mp3-tool release from a private GitHub repo and
REM install it over the existing copy. User data in %USERPROFILE%\.yt-mp3-tool\
REM is NOT touched.
REM
REM Prerequisites on this PC (one-time):
REM   1. winget install GitHub.cli
REM   2. gh auth login   (browser flow; uses your GitHub account)
REM
REM Override defaults via env vars:
REM   set INSTALL_DIR=D:\Apps\YT-MP3
REM   set REPO=jmh273/yt-mp3-tool
REM ============================================================================

REM -- defaults ----------------------------------------------------------------
if not defined REPO set REPO=jmh273/yt-mp3-tool
if not defined INSTALL_DIR set INSTALL_DIR=C:\Tools\YT-MP3

echo [update] Repo:    %REPO%
echo [update] Install: %INSTALL_DIR%

REM -- check gh ----------------------------------------------------------------
where gh >nul 2>nul
if errorlevel 1 (
    echo [update] ERROR: 'gh' CLI not on PATH.
    echo [update]   Run: winget install GitHub.cli
    echo [update]   Then open a new terminal and run: gh auth login
    exit /b 2
)

gh auth status >nul 2>nul
if errorlevel 1 (
    echo [update] ERROR: not authenticated with GitHub.
    echo [update]   Run: gh auth login
    exit /b 2
)

REM -- get latest tag ----------------------------------------------------------
echo [update] Querying latest release...
for /f "tokens=*" %%t in ('gh api repos/%REPO%/releases/latest --jq .tag_name 2^>nul') do set LATEST_TAG=%%t
if "%LATEST_TAG%"=="" (
    echo [update] ERROR: failed to query latest release. Network down or repo wrong?
    exit /b 3
)
set LATEST_VERSION=%LATEST_TAG:v=%
echo [update] Latest tag: %LATEST_TAG% (version %LATEST_VERSION%)

REM -- read local version (if any) ---------------------------------------------
set LOCAL_VERSION=none
if exist "%INSTALL_DIR%\_version.txt" (
    for /f "usebackq tokens=*" %%v in ("%INSTALL_DIR%\_version.txt") do set LOCAL_VERSION=%%v
)
echo [update] Local version: %LOCAL_VERSION%

REM -- compare and short-circuit if up to date ---------------------------------
if /i "%LOCAL_VERSION%"=="%LATEST_VERSION%" (
    echo [update] Already on latest version. Nothing to do.
    exit /b 0
)

REM -- download asset ----------------------------------------------------------
set DOWNLOAD_DIR=%TEMP%\yt-mp3-update
if exist "%DOWNLOAD_DIR%" rmdir /s /q "%DOWNLOAD_DIR%"
mkdir "%DOWNLOAD_DIR%"
echo [update] Downloading %LATEST_TAG% to %DOWNLOAD_DIR%...
gh release download %LATEST_TAG% --repo %REPO% --pattern "*windows-x64.zip" --dir "%DOWNLOAD_DIR%"
if errorlevel 1 (
    echo [update] ERROR: download failed. Existing install left untouched.
    exit /b 4
)

REM -- stop running instance ---------------------------------------------------
echo [update] Stopping any running yt-mp3-tool.exe...
taskkill /F /IM yt-mp3-tool.exe >nul 2>nul
REM small wait so file handles release
ping -n 2 127.0.0.1 >nul

REM -- extract over install dir -------------------------------------------------
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo [update] Extracting over %INSTALL_DIR%...
for %%Z in ("%DOWNLOAD_DIR%\*.zip") do (
    powershell -NoProfile -Command "Expand-Archive -Path '%%Z' -DestinationPath '%INSTALL_DIR%' -Force"
    if errorlevel 1 (
        echo [update] ERROR: extract failed.
        exit /b 5
    )
)

REM -- restart -----------------------------------------------------------------
echo [update] Restarting yt-mp3-tool.exe...
start "" "%INSTALL_DIR%\yt-mp3-tool.exe"

echo.
echo [update] Updated to %LATEST_VERSION%. Done.
exit /b 0
