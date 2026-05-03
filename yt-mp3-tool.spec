# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for yt-mp3-tool (onedir mode).

Build: cd backend && pyinstaller ../yt-mp3-tool.spec --noconfirm --clean
Output: backend/dist/yt-mp3-tool/yt-mp3-tool.exe (+ _internal/)
"""
import sys
from pathlib import Path

# This spec is run by PyInstaller via `cd backend && pyinstaller ../yt-mp3-tool.spec`.
# So the working directory is backend/, and SPECPATH is the repo root.
BACKEND_DIR = Path.cwd().resolve()  # = backend/

datas = [
    # ship the version file (build.bat writes it before running pyinstaller)
    (str(BACKEND_DIR / "_version.txt"), "."),
]

# Include the SPA build output if present (build.bat copies frontend/dist → backend/static first)
static_dir = BACKEND_DIR / "static"
if static_dir.is_dir():
    datas.append((str(static_dir), "static"))

# yt_dlp uses dynamic imports for extractors — collect everything it ships
hiddenimports = [
    "yt_dlp",
    "yt_dlp.extractor.common",
    "googleapiclient.discovery",
    "googleapiclient.http",
]

a = Analysis(
    [str(BACKEND_DIR / "__main__.py")],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",       # not used
        "test",          # python stdlib test
        "pytest",        # dev only
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="yt-mp3-tool",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,    # Keep console window — shows uvicorn logs / errors
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="yt-mp3-tool",  # → backend/dist/yt-mp3-tool/
)
