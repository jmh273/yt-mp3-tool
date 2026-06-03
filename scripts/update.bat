@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM update.bat - pull the latest yt-mp3-tool release and install it over the
REM existing copy. User data in %USERPROFILE%\.yt-mp3-tool\ is NOT touched.
REM
REM HYBRID auth model (works whether the repo is private or public):
REM   * If a GitHub token is available (GH_TOKEN env var, or `gh auth token`
REM     from an authenticated gh CLI), the updater uses it -> PRIVATE repos work.
REM   * If no token is available, it falls back to anonymous public download
REM     -> PUBLIC repos work with NO login and NO gh required.
REM   So self-hosters of the public release need nothing; the maintainer keeps
REM   updating private pre-public releases as long as their gh stays logged in.
REM
REM Override defaults via env vars:
REM   set INSTALL_DIR=D:\Apps\YT-MP3
REM   set REPO=youruser/yt-mp3-tool
REM   set GH_TOKEN=ghp_xxx           (optional; only needed for a private repo
REM                                   on a machine without gh logged in)
REM ============================================================================

REM -- defaults ----------------------------------------------------------------
if not defined REPO set REPO=jmh273/yt-mp3-tool
if not defined INSTALL_DIR set INSTALL_DIR=C:\Tools\YT-MP3

echo [update] Repo:    %REPO%
echo [update] Install: %INSTALL_DIR%

REM -- query latest release ----------------------------------------------------
REM A tiny PowerShell script resolves a token (if any), hits the releases API,
REM and prints "<tag>#<download-url>#<auth-flag>". auth-flag=1 means the chosen
REM download URL is the API asset endpoint and needs the token; 0 means it is the
REM anonymous browser_download_url.
echo [update] Querying latest release...
set QPS1=%TEMP%\yt-mp3-query-release.ps1
> "%QPS1%" echo $tok=$env:GH_TOKEN
>>"%QPS1%" echo if (-not $tok) { $g=Get-Command gh -ErrorAction SilentlyContinue; if ($g) { try { $tok=(^& gh auth token 2^>$null) } catch { $tok=$null } } }
>>"%QPS1%" echo $tok=($tok ^| Out-String).Trim()
>>"%QPS1%" echo $h=@{}
>>"%QPS1%" echo $h['User-Agent']='yt-mp3-tool-updater'
>>"%QPS1%" echo $h['Accept']='application/vnd.github+json'
>>"%QPS1%" echo if ($tok) { $h['Authorization']='Bearer '+$tok }
>>"%QPS1%" echo $u='https://api.github.com/repos/'+$env:REPO+'/releases/latest'
>>"%QPS1%" echo try { $r=Invoke-RestMethod -Uri $u -Headers $h } catch { exit 1 }
>>"%QPS1%" echo $asset=$null
>>"%QPS1%" echo foreach ($a in $r.assets) { if ($a.name -like '*windows-x64.zip') { $asset=$a; break } }
>>"%QPS1%" echo if (-not $asset) { exit 1 }
>>"%QPS1%" echo if ($tok) { $dl=$asset.url; $af='1' } else { $dl=$asset.browser_download_url; $af='0' }
>>"%QPS1%" echo Write-Output ($r.tag_name+'#'+$dl+'#'+$af)

set LATEST_TAG=
set DL_URL=
set AUTH_FLAG=
for /f "usebackq tokens=1,2,3 delims=#" %%a in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%QPS1%"`) do (
    set LATEST_TAG=%%a
    set DL_URL=%%b
    set AUTH_FLAG=%%c
)
del "%QPS1%" >nul 2>nul

if "%LATEST_TAG%"=="" (
    echo [update] ERROR: failed to query latest release.
    echo [update]   - If the repo is PRIVATE: make sure gh is logged in
    echo [update]     ^(gh auth status^) or set GH_TOKEN.
    echo [update]   - If the repo is PUBLIC: check your network and that a
    echo [update]     release with a *windows-x64.zip asset exists.
    echo [update]   Repo: https://github.com/%REPO%/releases/latest
    exit /b 3
)
if "%DL_URL%"=="" (
    echo [update] ERROR: latest release has no *windows-x64.zip asset.
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
set OUT_ZIP=%DOWNLOAD_DIR%\yt-mp3-tool.zip
echo [update] Downloading %LATEST_TAG%...
REM Download script re-resolves the token (so we never pass it through batch env)
REM and, when auth is needed, requests the API asset endpoint as an octet-stream.
set DPS1=%TEMP%\yt-mp3-download-release.ps1
> "%DPS1%" echo $h=@{}
>>"%DPS1%" echo $h['User-Agent']='yt-mp3-tool-updater'
>>"%DPS1%" echo if ($env:AUTH_FLAG -eq '1') {
>>"%DPS1%" echo   $tok=$env:GH_TOKEN
>>"%DPS1%" echo   if (-not $tok) { $g=Get-Command gh -ErrorAction SilentlyContinue; if ($g) { try { $tok=(^& gh auth token 2^>$null) } catch { $tok=$null } } }
>>"%DPS1%" echo   $tok=($tok ^| Out-String).Trim()
>>"%DPS1%" echo   if ($tok) { $h['Authorization']='Bearer '+$tok }
>>"%DPS1%" echo   $h['Accept']='application/octet-stream'
>>"%DPS1%" echo }
>>"%DPS1%" echo try { Invoke-WebRequest -Uri $env:DL_URL -Headers $h -OutFile $env:OUT_ZIP -UseBasicParsing; exit 0 } catch { Write-Host ('[update] download error: '+$_.Exception.Message); exit 1 }

powershell -NoProfile -ExecutionPolicy Bypass -File "%DPS1%"
set _dlrc=%errorlevel%
del "%DPS1%" >nul 2>nul
if not "%_dlrc%"=="0" (
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
