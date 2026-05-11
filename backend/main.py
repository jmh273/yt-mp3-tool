import asyncio
import json
import os
import pathlib
import shutil
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiohttp
import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from pydantic import BaseModel


# ── Bundle / dev path resolution ──────────────────────────────────────────────
def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _resource_path(name: str) -> pathlib.Path:
    """Locate a resource by name.

    Frozen (PyInstaller onedir/onefile): try the bundle's data dir first
    (sys._MEIPASS = `_internal/` in onedir; a temp dir in onefile), then fall
    back to the exe's directory (where build.bat drops external assets like
    ffmpeg.exe / client_secret.json).
    Dev: next to backend/main.py.
    """
    if _is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidate = pathlib.Path(meipass) / name
            if candidate.exists():
                return candidate
        return pathlib.Path(sys.executable).parent / name
    return pathlib.Path(__file__).parent / name


def _setup_bundled_path() -> None:
    """In a frozen bundle, prepend the exe's directory to PATH so that bundled
    ffmpeg.exe / mp3gain.exe are picked up by shutil.which() and subprocess calls."""
    if _is_frozen():
        bundle_dir = str(pathlib.Path(sys.executable).parent)
        os.environ["PATH"] = bundle_dir + os.pathsep + os.environ.get("PATH", "")


_setup_bundled_path()


def _find_client_secret() -> pathlib.Path | None:
    """Look for client_secret.json next to the exe (bundle) first, then under backend/ (dev)."""
    bundle_loc = _resource_path("client_secret.json")
    if bundle_loc.exists():
        return bundle_loc
    dev_loc = pathlib.Path(__file__).parent / "client_secret.json"
    if dev_loc.exists():
        return dev_loc
    return None


# ── 路徑設定 ──────────────────────────────────────────────────────────────────
CONFIG_DIR = pathlib.Path.home() / ".yt-mp3-tool"
TOKEN_FILE = CONFIG_DIR / "token.json"           # 舊版（遷移後刪除）
TOKENS_DIR = CONFIG_DIR / "tokens"                # 多帳號 token 目錄
CURRENT_ACCOUNT_FILE = CONFIG_DIR / "current_account.txt"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
REDIRECT_URI = "http://localhost:8000/auth/callback"

DEFAULT_SETTINGS = {
    "output_path": str(pathlib.Path.home() / "Music" / "YT-MP3"),
    "videos_per_channel": 5,
    "latest_hours": 24,
    "min_duration_minutes": 3,
    "max_duration_minutes": 60,
    "normalize_target_db": 89.0,
    "quota_used": 0,
    "quota_date": "",
}

YOUTUBE_QUOTA_DAILY_LIMIT = 10000

MP3GAIN_TOLERANCE_DB = 0.75
MP3GAIN_REFERENCE_DB = 89.0  # mp3gain default target = ReplayGain reference

CONFIG_DIR.mkdir(exist_ok=True)
TOKENS_DIR.mkdir(exist_ok=True)


def _read_version() -> str:
    vfile = _resource_path("_version.txt")
    if vfile.exists():
        try:
            return vfile.read_text(encoding="utf-8").strip() or "0.0.0-dev"
        except OSError:
            return "0.0.0-dev"
    return "0.0.0-dev"


__version__ = _read_version()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ── 舊版 token.json → tokens/<email>.json 自動遷移 ──
    _migrate_legacy_token()

    if shutil.which("ffmpeg") is None:
        print(
            "\033[91m[警告] 找不到 ffmpeg！MP3 轉換功能將無法使用。"
            "請安裝 ffmpeg 並將其加入 PATH，然後重新啟動。\033[0m"
        )
    else:
        import subprocess
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        version_line = result.stdout.splitlines()[0] if result.stdout else "unknown"
        print(f"[OK] ffmpeg 已就緒：{version_line}")
    accounts = _list_account_emails()
    current = _get_current_email()
    print(f"[OK] yt-mp3-tool v{__version__} — {len(accounts)} 帳號已授權"
          f"{f'，當前：{current}' if current else ''}")
    yield


app = FastAPI(title="YT-MP3 Tool", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 下載進度佇列（全域） ────────────────────────────────────────────────────────
download_progress: dict[str, dict] = {}

# ── 音量正規化進度與目錄鎖（全域） ────────────────────────────────────────────────
normalize_progress: dict[str, dict] = {}
_active_normalize_dirs: set[str] = set()


# ── 工具函式 ───────────────────────────────────────────────────────────────────
import locale as _locale
_FS_ANSI_ENCODING = _locale.getpreferredencoding(False)


def _sanitize_filename(name: str) -> str:
    """Strip characters that mp3gain (Windows ANSI argv) cannot handle from a YouTube title.

    Step 1: keep ASCII alphanumerics, spaces, `.-_()`, CJK Unified Ideographs (BMP + Extension A);
            replace everything else (full-width punctuation, emoji, symbols) with `_`.
    Step 2: drop any remaining character that the active system codepage cannot encode (e.g. CJK
            ideographs like U+7287 that are in the Unicode block but NOT in CP950 / CP936 / etc.).
            Without this, Windows argv Wide→ANSI conversion would corrupt the subprocess call
            and mp3gain.exe would fail to open the file.
    """
    import re
    if not name:
        return "untitled"
    safe = re.sub(r"[^\w\s一-鿿㐀-䶿().\-]", "_", name)
    out_chars = []
    for c in safe:
        try:
            c.encode(_FS_ANSI_ENCODING)
        except UnicodeEncodeError:
            out_chars.append("_")
        else:
            out_chars.append(c)
    safe = "".join(out_chars)
    safe = re.sub(r"\s+", " ", safe)
    safe = re.sub(r"_+", "_", safe)
    safe = safe.strip(" ._")
    if not safe:
        return "untitled"
    return safe[:120]


def parse_iso_duration(duration: str) -> int:
    import re
    sec = 0
    m = re.search(r'(\d+)D', duration)
    if m: sec += int(m.group(1)) * 86400
    m = re.search(r'(\d+)H', duration)
    if m: sec += int(m.group(1)) * 3600
    m = re.search(r'(\d+)M', duration)
    if m: sec += int(m.group(1)) * 60
    m = re.search(r'(\d+)S', duration)
    if m: sec += int(m.group(1))
    return sec

def enhance_and_filter_videos(youtube, videos: list[dict], apply_duration_filter: bool = True) -> list[dict]:
    if not videos:
        return []
    
    v_dict = {v["video_id"]: v for v in videos}
    video_ids = list(v_dict.keys())
    valid_videos = []
    
    for i in range(0, len(video_ids), 50):
        batch_ids = video_ids[i:i+50]
        try:
            resp = youtube.videos().list(
                part="snippet,contentDetails",
                id=",".join(batch_ids)
            ).execute()
            consume_quota(1)

            for item in resp.get("items", []):
                vid = item["id"]
                if item.get("snippet", {}).get("liveBroadcastContent") == "upcoming":
                    continue
                duration_iso = item.get("contentDetails", {}).get("duration", "")
                dur_sec = parse_iso_duration(duration_iso)
                
                settings = load_settings()
                min_sec = settings.get("min_duration_minutes", 3) * 60
                max_sec = settings.get("max_duration_minutes", 60) * 60
                
                v_dict[vid]["duration_seconds"] = dur_sec
                if not apply_duration_filter or (min_sec <= dur_sec <= max_sec):
                    valid_videos.append(v_dict[vid])
        except Exception as e:
            print(f"[YouTube API Error] {e}")
            for vid in batch_ids:
                valid_videos.append(v_dict[vid])
                
    return [v for v in videos if v in valid_videos]

_SETTINGS_RANGES = {
    "videos_per_channel": (int, 1, 20),
    "latest_hours": (int, 1, 168),
    "min_duration_minutes": (int, 0, 10000),
    "max_duration_minutes": (int, 1, 10000),
    "normalize_target_db": ((int, float), 80.0, 100.0),
    "output_path": (str, None, None),
}


def load_settings() -> dict:
    """Tolerant load: legacy / out-of-range / wrong-type values for known keys are
    silently reset to defaults; unknown keys are preserved untouched."""
    raw: dict = {}
    if SETTINGS_FILE.exists():
        try:
            raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raw = {}
        except (json.JSONDecodeError, OSError):
            raw = {}
    merged = {**DEFAULT_SETTINGS, **raw}
    for key, (expected_type, lo, hi) in _SETTINGS_RANGES.items():
        value = merged.get(key)
        if not isinstance(value, expected_type):
            merged[key] = DEFAULT_SETTINGS[key]
            continue
        if lo is not None and hi is not None and not (lo <= value <= hi):
            merged[key] = DEFAULT_SETTINGS[key]
    return merged


def save_settings(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def _current_pt_date() -> str:
    """Pacific Time 日期（UTC-8，忽略夏令時，作為 quota 重置基準）。"""
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=-8))).strftime("%Y-%m-%d")


import threading
_quota_lock = threading.Lock()

def consume_quota(amount: int = 1) -> None:
    """記錄一次 YouTube API 呼叫消耗。跨 PT 日期會自動重置計數。"""
    with _quota_lock:
        settings = load_settings()
        today = _current_pt_date()
        if settings.get("quota_date") != today:
            settings["quota_used"] = amount
            settings["quota_date"] = today
        else:
            settings["quota_used"] = int(settings.get("quota_used", 0)) + amount
        save_settings(settings)


# ── 多帳號 token 工具函式 ─────────────────────────────────────────────────────
def _get_current_email() -> str | None:
    """讀取 current_account.txt，回傳當前帳號 email（若不存在則回傳 None）。"""
    if CURRENT_ACCOUNT_FILE.exists():
        email = CURRENT_ACCOUNT_FILE.read_text(encoding="utf-8").strip()
        if email:
            return email
    return None


def _set_current_email(email: str) -> None:
    """寫入 current_account.txt。"""
    CURRENT_ACCOUNT_FILE.write_text(email, encoding="utf-8")


def _clear_current_email() -> None:
    """清除 current_account.txt。"""
    if CURRENT_ACCOUNT_FILE.exists():
        CURRENT_ACCOUNT_FILE.unlink()


def _token_path(email: str) -> pathlib.Path:
    """回傳指定帳號的 token 檔路徑。"""
    return TOKENS_DIR / f"{email}.json"


def _list_account_emails() -> list[str]:
    """列出 tokens/ 目錄下所有已授權帳號的 email。"""
    if not TOKENS_DIR.exists():
        return []
    return sorted(
        p.stem for p in TOKENS_DIR.iterdir()
        if p.is_file() and p.suffix == ".json"
    )


def _fetch_email(creds: Credentials) -> str:
    """呼叫 Google userinfo API 取得帳號 email（不消耗 YouTube quota）。"""
    import urllib.request
    req = urllib.request.Request(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    email = data.get("email", "")
    if not email:
        raise RuntimeError("無法從 Google userinfo 取得 email")
    return email


def _migrate_legacy_token() -> None:
    """啟動時將舊版 token.json 遷移到 tokens/<email>.json（一次性）。"""
    if not TOKEN_FILE.exists():
        return
    # 已經有 tokens/ 內的檔案 → 不重複遷移
    if _list_account_emails():
        print("[遷移] 發現舊版 token.json 但 tokens/ 已有帳號，跳過遷移（請手動刪除舊檔）")
        return
    try:
        # 不帶 SCOPES 載入，避免舊 token scope 不符被拒
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE))
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
        if not creds or not creds.valid:
            print("[遷移] 舊版 token 無效，保留舊檔待重新登入")
            return
        try:
            email = _fetch_email(creds)
        except Exception as e:
            # 舊 token 沒有 userinfo.email scope，無法取得 email
            # 改用 placeholder，token 仍可正常呼叫 YouTube API
            email = "migrated-account"
            print(f"[遷移] 無法取得 email（{e}），使用 placeholder 名稱: {email}")
        dest = _token_path(email)
        dest.write_text(creds.to_json(), encoding="utf-8")
        _set_current_email(email)
        TOKEN_FILE.unlink()
        print(f"[遷移] 舊版 token.json → tokens/{email}.json 完成")
    except Exception as e:
        print(f"[遷移] 遷移失敗（{e}），保留舊檔不影響啟動")


def load_credentials() -> Credentials | None:
    """載入當前帳號的 credential。支援多帳號 tokens/<email>.json 架構。"""
    email = _get_current_email()
    if not email:
        return None
    token_file = _token_path(email)
    if not token_file.exists():
        return None
    # 不帶 SCOPES 載入，避免遷移過來的舊 token 因 scope 不符被拒
    creds = Credentials.from_authorized_user_file(str(token_file))
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            token_file.write_text(creds.to_json(), encoding="utf-8")
        except RefreshError as e:
            # Refresh token 已被撤銷或過期（例如使用者在 Google 帳號中移除授權），
            # 將失效 token 改名保留，讓前端顯示「未登入」並提示重新授權。
            revoked = token_file.with_suffix(token_file.suffix + ".revoked")
            try:
                token_file.replace(revoked)
            except OSError:
                pass
            print(f"[Auth] {email} refresh token 已失效（{e}），需重新登入")
            return None
    return creds if creds and creds.valid else None


def require_credentials() -> Credentials:
    creds = load_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="未登入，請先授權 Google 帳號")
    return creds


# ── Auth 路由 ──────────────────────────────────────────────────────────────────
@app.get("/auth/status")
def auth_status():
    creds = load_credentials()
    accounts = _list_account_emails()
    current = _get_current_email()
    return {
        "logged_in": creds is not None,
        "current_account": current or "",
        "accounts": accounts,
    }


@app.get("/auth/accounts")
def auth_accounts():
    """列出所有已授權帳號與當前帳號。"""
    accounts = _list_account_emails()
    current = _get_current_email()
    creds = load_credentials()
    return {
        "logged_in": creds is not None,
        "current": current or "",
        "accounts": accounts,
    }


class SwitchAccountRequest(BaseModel):
    email: str


@app.post("/auth/switch")
def auth_switch(body: SwitchAccountRequest):
    """切換當前帳號。驗證 token 檔案存在後更新 current_account.txt。"""
    token_file = _token_path(body.email)
    if not token_file.exists():
        raise HTTPException(status_code=404, detail=f"找不到帳號 {body.email} 的授權")
    _set_current_email(body.email)
    return {"current": body.email}


@app.get("/auth/login")
def auth_login():
    """
    使用 InstalledAppFlow.run_local_server() 在背景執行授權流程。
    Google 建議 Desktop App 使用此方式，自動管理 localhost redirect URI。
    多帳號模式：使用 prompt=select_account 強制讓使用者選擇帳號。
    """
    client_secret = _find_client_secret()
    if client_secret is None:
        raise HTTPException(
            status_code=500,
            detail="找不到 client_secret.json — 請放到安裝目錄（exe 同目錄）或 backend/ 後重新啟動",
        )

    def _do_oauth():
        try:
            print("[OAuth] 1/5 開始授權流程...", flush=True)
            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secret), scopes=SCOPES
            )
            print("[OAuth] 2/5 等待使用者完成 OAuth...", flush=True)
            creds = flow.run_local_server(
                port=0,
                open_browser=True,
                prompt="select_account",
                access_type="offline",
            )
            print(f"[OAuth] 3/5 OAuth 完成, token={creds.token[:20]}...", flush=True)
            # 取得 email 作為帳號識別 key
            try:
                email = _fetch_email(creds)
                print(f"[OAuth] 4/5 取得 email: {email}", flush=True)
            except Exception as e:
                print(f"[OAuth] 4/5 無法取得 email（{e}），使用 unknown", flush=True)
                email = "unknown"
            # 存入 tokens/<email>.json
            dest = _token_path(email)
            dest.write_text(creds.to_json(), encoding="utf-8")
            _set_current_email(email)
            print(f"[OAuth] 5/5 帳號 {email} 授權完成，token 已存入 {dest}", flush=True)
        except Exception as e:
            import traceback
            print(f"[OAuth] 授權流程失敗：{e}", flush=True)
            traceback.print_exc()

    import threading
    t = threading.Thread(target=_do_oauth, daemon=True)
    t.start()
    return {"message": "已開啟瀏覽器，請完成授權，授權完成後重新整理頁面"}


@app.get("/auth/callback")
def auth_callback():
    return {"message": "callback received"}


class LogoutRequest(BaseModel):
    email: str | None = None


@app.post("/auth/logout")
def auth_logout(body: LogoutRequest | None = None):
    """登出指定帳號。若未指定 email 則登出當前帳號。"""
    target = (body.email if body and body.email else None) or _get_current_email()
    if not target:
        return {"message": "沒有已登入的帳號"}

    # 刪除該帳號的 token 檔
    token_file = _token_path(target)
    if token_file.exists():
        token_file.unlink()

    # 若登出的是當前帳號，自動切到剩餘的第一個帳號
    current = _get_current_email()
    if current == target:
        remaining = _list_account_emails()
        if remaining:
            _set_current_email(remaining[0])
        else:
            _clear_current_email()

    # 相容舊版：也清除可能殘留的 token.json
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()

    return {"message": f"已登出 {target}"}


# ── 訂閱清單路由 ───────────────────────────────────────────────────────────────
@app.get("/subscriptions")
def get_subscriptions():
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    channels = []
    page_token = None
    while True:
        resp = (
            youtube.subscriptions()
            .list(
                part="snippet",
                mine=True,
                maxResults=50,
                pageToken=page_token,
                order="alphabetical",
            )
            .execute()
        )
        consume_quota(1)
        for item in resp.get("items", []):
            snippet = item["snippet"]
            channels.append(
                {
                    "subscription_id": item["id"],
                    "channel_id": snippet["resourceId"]["channelId"],
                    "title": snippet["title"],
                    "thumbnail": snippet["thumbnails"].get("default", {}).get("url", ""),
                }
            )
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return {"channels": channels}


@app.delete("/subscriptions/{subscription_id}")
def delete_subscription(subscription_id: str):
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    try:
        youtube.subscriptions().delete(id=subscription_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/subscriptions/latest-dates")
async def get_subscriptions_latest_dates():
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    channels = []
    page_token = None
    while True:
        resp = (
            youtube.subscriptions()
            .list(part="snippet", mine=True, maxResults=50, pageToken=page_token)
            .execute()
        )
        consume_quota(1)
        for item in resp.get("items", []):
            channels.append(item["snippet"]["resourceId"]["channelId"])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    dates = {}
    sem = asyncio.Semaphore(10)

    async def _fetch(cid):
        async with sem:
            _, vlist = await fetch_channel_videos_api(creds, cid, 1)
            if vlist and len(vlist) > 0:
                return cid, vlist[0]["published"]
            return cid, None

    tasks = [_fetch(cid) for cid in channels]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for res in results:
        if not isinstance(res, Exception):
            cid, pub = res
            if pub:
                dates[cid] = pub
    return {"latest_dates": dates}


async def fetch_channel_videos_api(creds, channel_id: str, limit: int, channel_title: str = ""):
    # 巧妙利用: YouTube 頻道 ID (UC...) 轉成上傳播放清單 ID 只要把前兩碼換成 UU
    if channel_id.startswith("UC"):
        uploads_id = "UU" + channel_id[2:]
    else:
        # Fallback (非常罕見)
        try:
            youtube = await asyncio.to_thread(build, "youtube", "v3", credentials=creds)
            uploads_id = await asyncio.to_thread(_get_channel_uploads_playlist_id, youtube, channel_id)
        except Exception:
            uploads_id = None
            
    if not uploads_id:
        return channel_id, []

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        "part": "snippet",
        "playlistId": uploads_id,
        "maxResults": str(limit),
    }
    headers = {"Authorization": f"Bearer {creds.token}"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, headers=headers) as resp:
                if resp.status != 200:
                    err_text = await resp.text()
                    print(f"[YouTube API Error] fetch_channel_videos_api for {channel_id}: {resp.status} {err_text}")
                    return channel_id, []
                data = await resp.json()
                
        await asyncio.to_thread(consume_quota, 1)
        
        items = data.get("items", [])
        videos = []
        for item in items:
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
                
            title = snippet.get("title", "")
            if not channel_title and snippet.get("channelTitle"):
                channel_title = snippet.get("channelTitle")
                
            published = snippet.get("publishedAt", "")
            thumbnail = snippet.get("thumbnails", {}).get("default", {}).get("url", f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg")
            
            videos.append({
                "video_id": video_id,
                "title": title,
                "published": published,
                "thumbnail": thumbnail,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "channel_id": channel_id,
                "channel_title": channel_title,
                "duration_seconds": None,
            })
            
        return channel_id, videos
    except Exception as e:
        print(f"[YouTube API Error] fetch_channel_videos_api for {channel_id}: {e}")
        return channel_id, []


@app.get("/subscriptions/{channel_id}/videos")
async def get_channel_videos(channel_id: str):
    settings = load_settings()
    limit = settings["videos_per_channel"]
    creds = require_credentials()
    _, videos = await fetch_channel_videos_api(creds, channel_id, limit)
    youtube = build("youtube", "v3", credentials=creds)
    videos = enhance_and_filter_videos(youtube, videos, apply_duration_filter=False)
    
    return {"videos": videos}


_uploads_cache: dict[str, str] = {}

def _get_channel_uploads_playlist_id(youtube, channel_id: str) -> str | None:
    if channel_id.startswith("UC"):
        return "UU" + channel_id[2:]
        
    if channel_id in _uploads_cache:
        return _uploads_cache[channel_id]
    
    try:
        resp = youtube.channels().list(
            part="contentDetails",
            id=channel_id
        ).execute()
        consume_quota(1)
        
        items = resp.get("items", [])
        if not items:
            return None
            
        uploads_id = items[0].get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        if uploads_id:
            _uploads_cache[channel_id] = uploads_id
            return uploads_id
    except Exception as e:
        print(f"[YouTube API Error] _get_channel_uploads_playlist_id: {e}")
    return None


@app.get("/channels/{channel_id}/videos")
def get_channel_videos_paginated(channel_id: str, pageToken: str | None = None):
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    
    uploads_id = _get_channel_uploads_playlist_id(youtube, channel_id)
    if not uploads_id:
        raise HTTPException(status_code=404, detail="找不到頻道的 Uploads 播放清單")
        
    try:
        req = youtube.playlistItems().list(
            part="snippet",
            playlistId=uploads_id,
            maxResults=50,
            pageToken=pageToken
        )
        resp = req.execute()
        consume_quota(1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    next_page_token = resp.get("nextPageToken")
    items = resp.get("items", [])
    
    videos = []
    channel_title = ""
    for item in items:
        snippet = item.get("snippet", {})
        video_id = snippet.get("resourceId", {}).get("videoId")
        if not video_id:
            continue
            
        title = snippet.get("title", "")
        if not channel_title and snippet.get("channelTitle"):
            channel_title = snippet.get("channelTitle")
            
        published = snippet.get("publishedAt", "")
        thumbnail = snippet.get("thumbnails", {}).get("default", {}).get("url", f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg")
        
        videos.append({
            "video_id": video_id,
            "title": title,
            "published": published,
            "thumbnail": thumbnail,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "channel_id": channel_id,
            "channel_title": channel_title,
        })
        
    videos = enhance_and_filter_videos(youtube, videos, apply_duration_filter=False)
    
    return {
        "items": videos,
        "nextPageToken": next_page_token,
        "channelTitle": channel_title
    }


# ── 設定路由 ───────────────────────────────────────────────────────────────────
@app.get("/settings")
def get_settings():
    return load_settings()


class SettingsUpdate(BaseModel):
    output_path: str | None = None
    videos_per_channel: int | None = None
    latest_hours: int | None = None
    min_duration_minutes: int | None = None
    max_duration_minutes: int | None = None
    normalize_target_db: float | None = None


@app.put("/settings")
def update_settings(body: SettingsUpdate):
    settings = load_settings()
    if body.output_path is not None:
        p = pathlib.Path(body.output_path)
        p.mkdir(parents=True, exist_ok=True)
        settings["output_path"] = str(p)
    if body.videos_per_channel is not None:
        settings["videos_per_channel"] = body.videos_per_channel
    if body.latest_hours is not None:
        if not (1 <= body.latest_hours <= 168):
            raise HTTPException(status_code=422, detail="latest_hours 必須介於 1 到 168 之間")
        settings["latest_hours"] = body.latest_hours
    if body.min_duration_minutes is not None:
        settings["min_duration_minutes"] = body.min_duration_minutes
    if body.max_duration_minutes is not None:
        settings["max_duration_minutes"] = body.max_duration_minutes
    if body.normalize_target_db is not None:
        if not (80.0 <= body.normalize_target_db <= 100.0):
            raise HTTPException(status_code=422, detail="normalize_target_db 必須介於 80.0 到 100.0 之間（dB SPL）")
        settings["normalize_target_db"] = body.normalize_target_db
    save_settings(settings)
    return settings


# ── 發燒影片路由 ───────────────────────────────────────────────────────────────
@app.get("/trending-videos")
def get_trending_videos(page_token: str | None = None):
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    try:
        list_kwargs = {
            "part": "snippet,contentDetails,statistics",
            "chart": "mostPopular",
            "regionCode": "TW",
            "maxResults": 50,
        }
        if page_token:
            list_kwargs["pageToken"] = page_token
        resp = youtube.videos().list(**list_kwargs).execute()
        consume_quota(1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    items = resp.get("items", [])
    next_page_token = resp.get("nextPageToken")
    videos = []

    for item in items:
        if item.get("snippet", {}).get("liveBroadcastContent") == "upcoming":
            continue

        duration_iso = item.get("contentDetails", {}).get("duration", "")
        dur_sec = parse_iso_duration(duration_iso)

        snippet = item.get("snippet", {})
        video_id = item.get("id")
        if not video_id:
            continue

        try:
            view_count = int(item.get("statistics", {}).get("viewCount", 0))
        except (ValueError, TypeError):
            view_count = 0

        title = snippet.get("title", "")
        channel_id = snippet.get("channelId", "")
        channel_title = snippet.get("channelTitle", "")
        published = snippet.get("publishedAt", "")
        thumbnail = snippet.get("thumbnails", {}).get("default", {}).get("url", f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg")

        videos.append({
            "video_id": video_id,
            "title": title,
            "published": published,
            "thumbnail": thumbnail,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "channel_id": channel_id,
            "channel_title": channel_title,
            "duration_seconds": dur_sec,
            "view_count": view_count,
        })

    return {"videos": videos, "next_page_token": next_page_token}

# ── 最新影片路由 ───────────────────────────────────────────────────────────────
@app.get("/latest-videos")
async def get_latest_videos(hours: int | None = None):
    from datetime import datetime, timezone, timedelta
    settings = load_settings()
    if hours is None:
        hours = settings.get("latest_hours", 24)
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    # 取得全部頻道
    channels: list[dict] = []
    page_token = None
    while True:
        resp = (
            youtube.subscriptions()
            .list(part="snippet", mine=True, maxResults=50, pageToken=page_token)
            .execute()
        )
        consume_quota(1)
        for item in resp.get("items", []):
            sn = item["snippet"]
            channels.append({
                "channel_id": sn["resourceId"]["channelId"],
                "title": sn["title"],
            })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    # 並發擷取 API
    limit = settings.get("videos_per_channel", 5)
    sem = asyncio.Semaphore(20)

    async def _bound_fetch(ch):
        async with sem:
            return await fetch_channel_videos_api(creds, ch["channel_id"], limit, ch["title"])

    tasks = [
        _bound_fetch(ch)
        for ch in channels
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 過濾時間範圍並排序
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    videos: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        _, vlist = result
        for v in vlist:
            try:
                pub = datetime.fromisoformat(v["published"].replace("Z", "+00:00"))
                if pub >= cutoff:
                    videos.append(v)
            except Exception:
                continue

    videos.sort(key=lambda v: v["published"], reverse=True)
    videos = videos[:100]
    videos = enhance_and_filter_videos(youtube, videos)
    return {"videos": videos}


# ── 搜尋影片路由 ───────────────────────────────────────────────────────────────
def _sync_search_videos_yt_dlp(keyword: str) -> list[dict]:
    import yt_dlp
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "default_search": "ytsearch50",
    }
    
    videos = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(f"ytsearch50:{keyword}", download=False)
            if "entries" in info:
                for entry in info["entries"]:
                    if not entry:
                        continue
                    
                    video_id = entry.get("id")
                    if not video_id:
                        continue
                        
                    duration = entry.get("duration")
                            
                    thumbnails = entry.get("thumbnails", [])
                    thumbnail_url = thumbnails[0].get("url") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
                            
                    videos.append({
                        "video_id": video_id,
                        "title": entry.get("title", ""),
                        "published": "",
                        "thumbnail": thumbnail_url,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                        "channel_id": entry.get("channel_id", ""),
                        "channel_title": entry.get("uploader", ""),
                        "duration_seconds": duration,
                    })
        except Exception as e:
            print(f"[yt-dlp Search Error] {e}")
            
    return videos

@app.get("/search-videos")
async def search_videos(q: str):
    require_credentials()
    if not q or not q.strip():
        return {"videos": []}
    
    videos = await asyncio.to_thread(_sync_search_videos_yt_dlp, q.strip())
    return {"videos": videos}


# ── 網址預覽路由 ───────────────────────────────────────────────────────────────
def _sync_url_preview_yt_dlp(url: str) -> list[dict]:
    import yt_dlp
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
    }
    
    videos = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            if not info:
                return []
                
            entries = info.get("entries")
            if entries is None:
                entries = [info]  # 單一影片
                
            for entry in entries:
                if not entry:
                    continue
                
                video_id = entry.get("id")
                if not video_id:
                    continue
                    
                duration = entry.get("duration")
                        
                thumbnails = entry.get("thumbnails", [])
                thumbnail_url = thumbnails[0].get("url") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
                        
                videos.append({
                    "video_id": video_id,
                    "title": entry.get("title", ""),
                    "published": "",
                    "thumbnail": thumbnail_url,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "channel_id": entry.get("channel_id", ""),
                    "channel_title": entry.get("uploader", ""),
                    "duration_seconds": duration,
                })
        except Exception as e:
            print(f"[yt-dlp URL Preview Error] {e}")
            raise HTTPException(status_code=400, detail=f"網址解析失敗: {e}")
            
    return videos

@app.get("/url-preview")
async def url_preview(url: str):
    require_credentials()
    if not url or not url.strip():
        raise HTTPException(status_code=400, detail="網址不能為空")
    
    videos = await asyncio.to_thread(_sync_url_preview_yt_dlp, url.strip())
    return {"videos": videos}


# ── 下載路由 ───────────────────────────────────────────────────────────────────
class DownloadRequest(BaseModel):
    videos: list[dict]  # [{video_id, title, url}]
    format: str = "mp3"   # "mp3" | "mp4"
    quality: int = 192    # mp3: kbps; mp4: p


_MP3_QUALITIES = (128, 192, 256, 320)
_MP4_QUALITIES = (360, 480, 720, 1080)
_FORMAT_DEFAULT_QUALITY = {"mp3": 192, "mp4": 720}


def _normalize_format_quality(fmt: str | None, quality: int | None) -> tuple[str, int]:
    """白名單外的值無聲修正為該格式預設；未知格式回退 mp3 / 192。"""
    f = fmt if fmt in _FORMAT_DEFAULT_QUALITY else "mp3"
    allowed = _MP3_QUALITIES if f == "mp3" else _MP4_QUALITIES
    q = quality if isinstance(quality, int) and quality in allowed else _FORMAT_DEFAULT_QUALITY[f]
    return f, q


def _build_ydl_opts(output_path: str, safe_title: str, hook, fmt: str, quality: int) -> dict:
    base = {
        "outtmpl": os.path.join(output_path, f"{safe_title}.%(ext)s"),
        "progress_hooks": [hook],
        "quiet": True,
        "no_warnings": True,
    }
    if fmt == "mp4":
        return {
            **base,
            "format": (
                f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
                f"best[height<={quality}][ext=mp4]/best"
            ),
            "merge_output_format": "mp4",
        }
    # mp3 預設
    return {
        **base,
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": str(quality),
        }],
    }


def run_download(videos: list[dict], output_path: str, task_id: str, fmt: str = "mp3", quality: int = 192):
    download_progress[task_id] = {"status": "running", "items": {}}

    for v in videos:
        vid = v["video_id"]
        download_progress[task_id]["items"][vid] = {"title": v["title"], "percent": 0, "speed": "", "status": "pending"}

    def make_hook(vid: str):
        def hook(d):
            if d["status"] == "downloading":
                pct_str = d.get("_percent_str", "0%").strip().replace("%", "")
                speed_str = d.get("_speed_str", "").strip()
                try:
                    pct = float(pct_str)
                except ValueError:
                    pct = 0
                download_progress[task_id]["items"][vid]["percent"] = pct
                download_progress[task_id]["items"][vid]["speed"] = speed_str
                download_progress[task_id]["items"][vid]["status"] = "downloading"
            elif d["status"] == "finished":
                download_progress[task_id]["items"][vid]["percent"] = 100
                download_progress[task_id]["items"][vid]["speed"] = ""
                download_progress[task_id]["items"][vid]["status"] = "converting"
        return hook

    for v in videos:
        vid = v["video_id"]
        safe_title = _sanitize_filename(v.get("title", ""))
        ydl_opts = _build_ydl_opts(output_path, safe_title, make_hook(vid), fmt, quality)
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([v["url"]])
            download_progress[task_id]["items"][vid]["status"] = "done"
        except Exception as e:
            download_progress[task_id]["items"][vid]["status"] = "error"
            download_progress[task_id]["items"][vid]["error"] = str(e)

    download_progress[task_id]["status"] = "done"


@app.post("/download")
async def start_download(body: DownloadRequest):
    from datetime import datetime
    settings = load_settings()
    output_path = settings["output_path"]
    
    # 建立日期子目錄 YYYYMMDD
    date_str = datetime.now().strftime("%Y%m%d")
    final_output_path = os.path.join(output_path, date_str)
    
    pathlib.Path(final_output_path).mkdir(parents=True, exist_ok=True)

    import uuid
    task_id = str(uuid.uuid4())

    fmt, quality = _normalize_format_quality(body.format, body.quality)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_download, body.videos, final_output_path, task_id, fmt, quality)

    return {"task_id": task_id}


@app.get("/download/progress/{task_id}")
async def download_progress_sse(task_id: str):
    async def event_stream() -> AsyncGenerator[str, None]:
        while True:
            state = download_progress.get(task_id)
            if state is None:
                yield f"data: {json.dumps({'error': 'task not found'})}\n\n"
                break
            yield f"data: {json.dumps(state)}\n\n"
            if state.get("status") == "done":
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── 音量正規化（mp3gain 引擎） ────────────────────────────────────────────────
def _suggest_safe_filenames(filenames: list[str]) -> dict[str, str]:
    """Apply _sanitize_filename to each file's stem; disambiguate collisions with -2/-3 suffix."""
    out: dict[str, str] = {}
    seen: set[str] = set()
    for fn in filenames:
        stem, suffix = os.path.splitext(fn)
        sanitized_stem = _sanitize_filename(stem) or "untitled"
        candidate = f"{sanitized_stem}{suffix}"
        if candidate == fn:
            out[fn] = candidate
            seen.add(candidate)
            continue
        n = 2
        unique = candidate
        while unique in seen or unique in filenames:
            unique = f"{sanitized_stem}-{n}{suffix}"
            n += 1
        out[fn] = unique
        seen.add(unique)
    return out


def _list_mp3s(directory: pathlib.Path) -> list[dict]:
    raw_names = [
        e.name for e in directory.iterdir()
        if e.is_file() and e.suffix.lower() == ".mp3"
    ]
    raw_names.sort()
    suggestions = _suggest_safe_filenames(raw_names)
    files: list[dict] = []
    for name in raw_names:
        path = directory / name
        suggested = suggestions[name]
        files.append({
            "filename": name,
            "size_bytes": path.stat().st_size,
            "needs_rename": suggested != name,
            "suggested_name": suggested,
        })
    return files


def _run_mp3gain_analyze(input_path: pathlib.Path, target_db: float) -> dict:
    """Run mp3gain analysis (no modify). Returns measured + recommended dB change."""
    import subprocess
    import re

    delta = target_db - MP3GAIN_REFERENCE_DB
    # mp3gain (no -r/-a) only analyzes; -d shifts the target reference.
    cmd = ["mp3gain", "-q", "-d", f"{delta:.2f}", str(input_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"mp3gain analyze failed: {(proc.stderr or proc.stdout).strip()[-400:]}")

    m = re.search(r'Recommended\s+"?Track"?\s+dB\s+change[:=]\s*(-?\d+(?:\.\d+)?)', proc.stdout)
    if not m:
        raise RuntimeError(f"could not parse mp3gain output: {proc.stdout.strip()[-400:]}")
    recommended = float(m.group(1))
    # mp3gain doesn't directly report the file's current dB SPL; derive it:
    # recommended = target - measured, so measured = target - recommended
    measured = target_db - recommended
    return {"measured_db": measured, "recommended_db_change": recommended}


def _run_mp3gain_apply(input_path: pathlib.Path, target_db: float) -> None:
    """Apply mp3gain track gain in place (modifies frame headers, no audio re-encoding)."""
    import subprocess

    delta = target_db - MP3GAIN_REFERENCE_DB
    cmd = ["mp3gain", "-r", "-k", "-q", "-d", f"{delta:.2f}", str(input_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"mp3gain apply failed: {(proc.stderr or proc.stdout).strip()[-400:]}")


def run_normalize_batch(task_id: str, directory: str, filenames: list[str], target_db: float) -> None:
    state = normalize_progress[task_id]
    dir_path = pathlib.Path(directory)
    try:
        for filename in filenames:
            item = state["items"][filename]
            file_path = dir_path / filename
            try:
                item["status"] = "measuring"
                analyzed = _run_mp3gain_analyze(file_path, target_db)
                item["measured_db"] = analyzed["measured_db"]
                item["recommended_db_change"] = analyzed["recommended_db_change"]

                if abs(analyzed["recommended_db_change"]) < MP3GAIN_TOLERANCE_DB:
                    item["status"] = "skipped"
                    continue

                item["status"] = "normalizing"
                _run_mp3gain_apply(file_path, target_db)
                item["status"] = "done"
            except Exception as e:
                item["status"] = "error"
                item["error"] = str(e)
    finally:
        state["status"] = "done"
        _active_normalize_dirs.discard(directory)


@app.get("/normalize/list")
def normalize_list(dir: str):
    p = pathlib.Path(dir)
    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"目錄不存在或不是資料夾：{dir}")
    return {"directory": str(p), "files": _list_mp3s(p)}


class NormalizeStartRequest(BaseModel):
    directory: str
    filenames: list[str]
    target_db: float | None = None


@app.post("/normalize/start")
async def normalize_start(body: NormalizeStartRequest):
    if shutil.which("mp3gain") is None:
        raise HTTPException(
            status_code=503,
            detail="找不到 mp3gain，請安裝 mp3gain 並加入 PATH 後重新啟動後端",
        )

    if body.target_db is not None:
        if not (80.0 <= body.target_db <= 100.0):
            raise HTTPException(status_code=422, detail="target_db 必須介於 80.0 到 100.0 之間（dB SPL）")

    dir_path = pathlib.Path(body.directory)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"目錄不存在或不是資料夾：{body.directory}")

    dir_resolved = dir_path.resolve()
    for fn in body.filenames:
        if "/" in fn or "\\" in fn or fn in ("", ".", ".."):
            raise HTTPException(status_code=400, detail=f"檔名不可含路徑分隔：{fn}")
        target = (dir_path / fn).resolve()
        try:
            target.relative_to(dir_resolved)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"檔案不在目錄內：{fn}")
        if not target.is_file():
            raise HTTPException(status_code=400, detail=f"檔案不存在：{fn}")

    dir_key = str(dir_resolved)
    if dir_key in _active_normalize_dirs:
        raise HTTPException(status_code=409, detail="該目錄已有正在執行的正規化任務")

    settings = load_settings()
    target_db = float(body.target_db if body.target_db is not None else settings.get("normalize_target_db", 89.0))

    import uuid
    task_id = str(uuid.uuid4())
    normalize_progress[task_id] = {
        "status": "running",
        "items": {
            fn: {
                "filename": fn,
                "status": "pending",
                "measured_db": None,
                "target_db": target_db,
                "recommended_db_change": None,
                "error": None,
            }
            for fn in body.filenames
        },
    }
    _active_normalize_dirs.add(dir_key)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_normalize_batch, task_id, dir_key, body.filenames, target_db)

    return {"task_id": task_id}


class NormalizeRenameRequest(BaseModel):
    directory: str
    renames: list[dict]  # [{"from": str, "to": str}]


@app.post("/normalize/rename")
def normalize_rename(body: NormalizeRenameRequest):
    dir_path = pathlib.Path(body.directory)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"目錄不存在或不是資料夾：{body.directory}")
    dir_resolved = dir_path.resolve()

    # Validate every entry first
    pairs: list[tuple[str, str]] = []
    for entry in body.renames:
        src = entry.get("from", "")
        dst = entry.get("to", "")
        for label, val in (("from", src), ("to", dst)):
            if "/" in val or "\\" in val or val in ("", ".", ".."):
                raise HTTPException(status_code=400, detail=f"{label} 不可含路徑分隔：{val}")
            try:
                (dir_path / val).resolve().relative_to(dir_resolved)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{label} 不在目錄內：{val}")
        pairs.append((src, dst))

    renamed: list[dict] = []
    skipped: list[dict] = []
    for src, dst in pairs:
        src_p = dir_path / src
        dst_p = dir_path / dst
        if not src_p.is_file():
            skipped.append({"from": src, "to": dst, "reason": "source missing"})
            continue
        if src == dst:
            skipped.append({"from": src, "to": dst, "reason": "no-op"})
            continue
        if dst_p.exists():
            skipped.append({"from": src, "to": dst, "reason": "target exists"})
            continue
        os.replace(str(src_p), str(dst_p))
        renamed.append({"from": src, "to": dst})

    if renamed:
        from datetime import datetime as _dt
        log_path = dir_path / "_rename_log.json"
        existing: list = []
        if log_path.exists():
            try:
                existing = json.loads(log_path.read_text(encoding="utf-8"))
                if not isinstance(existing, list):
                    existing = []
            except (json.JSONDecodeError, OSError):
                existing = []
        existing.append({"ts": _dt.now().isoformat(timespec="seconds"), "mappings": renamed})
        log_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"renamed": renamed, "skipped": skipped}


@app.get("/normalize/progress/{task_id}")
async def normalize_progress_sse(task_id: str):
    async def event_stream() -> AsyncGenerator[str, None]:
        while True:
            state = normalize_progress.get(task_id)
            if state is None:
                yield f"data: {json.dumps({'error': 'task not found'})}\n\n"
                break
            yield f"data: {json.dumps(state)}\n\n"
            if state.get("status") == "done":
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Version endpoint ──────────────────────────────────────────────────────────
@app.get("/version")
def version():
    return {"version": __version__}


# ── Quota endpoint ────────────────────────────────────────────────────────────
@app.get("/quota")
def get_quota():
    """回傳當前 YouTube API 配額使用狀況。跨 PT 日期會自動重置後再回傳。"""
    settings = load_settings()
    today = _current_pt_date()
    if settings.get("quota_date") != today:
        settings["quota_used"] = 0
        settings["quota_date"] = today
        save_settings(settings)
    return {
        "used": int(settings.get("quota_used", 0)),
        "limit": YOUTUBE_QUOTA_DAILY_LIMIT,
        "date": settings.get("quota_date", today),
    }


# ── SPA static mount (LAST: matches when no API route did) ───────────────────
class _SPAStaticFiles(StaticFiles):
    """StaticFiles 子類別：對 index.html 加上 no-cache header。

    SPA 的 index.html 永遠引用 content-hashed assets（如 LoginView-<hash>.js）。
    若瀏覽器快取舊版 index.html，升版後會請求已不存在的 chunk 檔名 → 404。
    對 index.html 強制 revalidate；hashed assets 仍可長期快取。
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        # path == "" 是 mount root (回傳 index.html)；明確指定 index.html 也算
        if path in ("", "index.html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


_static_dir = _resource_path("static")
if _static_dir.is_dir():
    app.mount("/", _SPAStaticFiles(directory=str(_static_dir), html=True), name="spa")
