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
REM Strip a single leading 'v' (avoid stripping all v chars from versions like v0.5.0-rc.v2)
set LATEST_VERSION=%LATEST_TAG%
if "%LATEST_VERSION:~0,1%"=="v" set LATEST_VERSION=%LATEST_VERSION:~1%
echo [update] Latest tag: %LATEST_TAG% (version %LATEST_VERSION%)

REM -- read local version (if any) ---------------------------------------------
REM PyInstaller 6.x onedir ships bundled datas (incl. _version.txt) under
REM _internal\, not the bundle root, so look there.
set LOCAL_VERSION=none
if exist "%INSTALL_DIR%\_internal\_version.txt" (
    for /f "usebackq tokens=*" %%v in ("%INSTALL_DIR%\_internal\_version.txt") do set LOCAL_VERSION=%%v
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

REM -- stop running instance (kill process tree + wait for full release) -------
echo [update] Stopping any running yt-mp3-tool.exe...
taskkill /F /T /IM yt-mp3-tool.exe >nul 2>nul

REM Poll until process is gone (up to ~10 seconds). Without this the DLL files
REM may still be locked when we try to overwrite them, causing partial extracts.
set /a _wait=0
:wait_kill
tasklist /FI "IMAGENAME eq yt-mp3-tool.exe" 2>nul | find /I "yt-mp3-tool.exe" >nul
if errorlevel 1 goto :killed
set /a _wait+=1
if !_wait! GEQ 20 (
    echo [update] WARNING: yt-mp3-tool.exe still running after 10s wait; continuing anyway.
    goto :killed
)
ping -n 2 127.0.0.1 >nul
goto :wait_kill
:killed

REM Extra grace period for Windows to release DLL handles after process exit
ping -n 4 127.0.0.1 >nul

REM -- extract to a fresh staging dir (never locked) ---------------------------
REM Extracting straight over the live install meant a single transiently-locked
REM file (e.g. _internal\select.pyd briefly held by Defender / Search indexer
REM right after the app exits) aborted the whole Expand-Archive and left a
REM half-written, corrupt install. Instead we extract to a clean temp dir first.
set STAGE=%DOWNLOAD_DIR%\stage
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
echo [update] Extracting to staging...
for %%Z in ("%DOWNLOAD_DIR%\*.zip") do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$ErrorActionPreference='Stop'; try { Expand-Archive -Path '%%Z' -DestinationPath '%STAGE%' -Force; exit 0 } catch { Write-Host ('[update] PowerShell error: ' + $_.Exception.Message); exit 1 }"
    if errorlevel 1 (
        echo [update] ERROR: extract to staging failed. Existing install untouched.
        exit /b 5
    )
)

REM -- copy staged files over install, retrying locked files --------------------
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo [update] Installing files (retries locked files automatically)...
REM robocopy /R:10 /W:2 retries any locked file up to 10 times, 2s apart, instead
REM of aborting the whole update -- this is what actually beats the transient
REM antivirus/indexer lock that broke the old single-shot extract. update.bat is
REM excluded because it is the script currently running; it is swapped in after we
REM exit (see the self-update helper below). robocopy exit codes 0-7 are success.
robocopy "%STAGE%" "%INSTALL_DIR%" /E /R:10 /W:2 /XF update.bat /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
    echo [update] ERROR: copy failed even after retries -- a file is still locked.
    echo [update]   Recovery: close every yt-mp3-tool.exe window AND its console,
    echo [update]   wait ~10s for antivirus to release files, then rerun update.bat.
    echo [update]   Or clean install: rmdir /s /q "%INSTALL_DIR%" then rerun.
    exit /b 5
)

REM -- post-extract sanity check -----------------------------------------------
if not exist "%INSTALL_DIR%\yt-mp3-tool.exe" (
    echo [update] ERROR: yt-mp3-tool.exe missing after extract; install corrupted.
    echo [update]   Recovery: rmdir /s /q "%INSTALL_DIR%" then rerun update.bat.
    exit /b 6
)
set NEW_VERSION=unknown
if exist "%INSTALL_DIR%\_internal\_version.txt" (
    for /f "usebackq tokens=*" %%v in ("%INSTALL_DIR%\_internal\_version.txt") do set NEW_VERSION=%%v
)
if not "!NEW_VERSION!"=="%LATEST_VERSION%" (
    echo [update] ERROR: version mismatch after extract. Expected %LATEST_VERSION%, got !NEW_VERSION!.
    echo [update]   The zip may not have replaced all files. Try clean reinstall:
    echo [update]   rmdir /s /q "%INSTALL_DIR%" then rerun update.bat.
    exit /b 7
)

REM -- self-update the updater script (safely, after this script exits) ---------
REM We deliberately did NOT overwrite the running update.bat above (overwriting a
REM batch file mid-execution makes cmd read the new file from the old byte offset
REM and run garbage). Instead spawn a detached helper that waits for us to finish,
REM then swaps in the new updater from staging.
if exist "%STAGE%\update.bat" (
    > "%TEMP%\yt-mp3-swap-updater.cmd" (
        echo @echo off
        echo ping -n 2 127.0.0.1 ^>nul
        echo copy /y "%STAGE%\update.bat" "%INSTALL_DIR%\update.bat" ^>nul
    )
    start "" /min cmd /c "%TEMP%\yt-mp3-swap-updater.cmd"
)

REM -- restart -----------------------------------------------------------------
echo [update] Restarting yt-mp3-tool.exe...
start "" "%INSTALL_DIR%\yt-mp3-tool.exe"

echo.
echo [update] Updated to %LATEST_VERSION%. Done.
exit /b 0
