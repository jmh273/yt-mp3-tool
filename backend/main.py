import asyncio
import json
import os
import pathlib
import re
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
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
from pydantic import BaseModel, Field


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
DISCOVERY_PROFILES_DIR = CONFIG_DIR / "discovery_profiles"  # 同類新頻道 profile 永續快取

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
REDIRECT_URI = "http://localhost:8000/auth/callback"

DEFAULT_SETTINGS = {
    "output_path": str(pathlib.Path.home() / "Music" / "YT-MP3"),
    "videos_per_channel": 5,
    "latest_hours": 24,
    "discovery_keyword_top_n": 8,
    "min_duration_minutes": 3,
    "max_duration_minutes": 60,
    "normalize_target_db": 89.0,
    "drive_root_folder": "YT-MP3",
    "download_concurrency": 3,
    "drive_upload_concurrency": 3,
    "quota_used": 0,
    "quota_date": "",
}

YOUTUBE_QUOTA_DAILY_LIMIT = 10000

MP3GAIN_TOLERANCE_DB = 0.75
MP3GAIN_REFERENCE_DB = 89.0  # mp3gain default target = ReplayGain reference

CONFIG_DIR.mkdir(exist_ok=True)
TOKENS_DIR.mkdir(exist_ok=True)
DISCOVERY_PROFILES_DIR.mkdir(exist_ok=True)


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

# Google Drive upload progress, keyed by task id.
drive_upload_progress: dict[str, dict] = {}


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


_HIGHLIGHT_PREFIX_RE = re.compile(r"^精華[ _]?")


def _strip_highlight_prefix(stem: str) -> str:
    """Normalize away a leading `【精華】` highlight marker on a sanitized stem.

    `_sanitize_filename("【精華】My Talk")` yields `精華_My Talk` (full-width 【】 → `_`,
    leading `_` stripped, `】` → `_`). For "is this already downloaded?" comparisons we
    want `【精華】xxx` to match a plain `xxx` re-upload, so we drop a single leading `精華`
    token plus any immediately following separator. Only the start of the stem is touched;
    an interior `精華` (e.g. `年度精華回顧`) is left intact.
    """
    return _HIGHLIGHT_PREFIX_RE.sub("", stem, count=1)


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

def enhance_and_filter_videos(
    youtube,
    videos: list[dict],
    apply_duration_filter: bool = True,
    min_duration_override: int | None = None,
    max_duration_override: int | None = None,
) -> list[dict]:
    if not videos:
        return []

    v_dict = {v["video_id"]: v for v in videos}
    video_ids = list(v_dict.keys())
    valid_videos = []

    settings = load_settings() if apply_duration_filter else None
    if apply_duration_filter:
        min_minutes = (
            min_duration_override
            if min_duration_override is not None
            else settings.get("min_duration_minutes", 3)
        )
        max_minutes = (
            max_duration_override
            if max_duration_override is not None
            else settings.get("max_duration_minutes", 60)
        )
        min_sec = min_minutes * 60
        max_sec = max_minutes * 60
    else:
        min_sec = 0
        max_sec = 0

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
    "discovery_keyword_top_n": (int, 1, 100),
    "min_duration_minutes": (int, 0, 10000),
    "max_duration_minutes": (int, 1, 10000),
    "normalize_target_db": ((int, float), 80.0, 100.0),
    "output_path": (str, None, None),
    "drive_root_folder": (str, None, None),
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
        if key == "drive_root_folder" and not value.strip():
            merged[key] = DEFAULT_SETTINGS[key]
            continue
        if lo is not None and hi is not None and not (lo <= value <= hi):
            merged[key] = DEFAULT_SETTINGS[key]
    return merged


def save_settings(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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
def _credential_has_scope(creds: Credentials, scope: str) -> bool:
    granted = set(getattr(creds, "scopes", None) or getattr(creds, "granted_scopes", None) or [])
    return scope in granted


def load_drive_credentials() -> Credentials | None:
    email = _get_current_email()
    if not email:
        return None
    token_file = _token_path(email)
    if not token_file.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(token_file))
    # 缺 drive.file scope：回 None 觸發 401，由前端引導重新授權。
    # 不要動既有 token——它與 YouTube 共用，刪掉會把使用者整個登出。
    if not _credential_has_scope(creds, DRIVE_FILE_SCOPE):
        return None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            token_file.write_text(creds.to_json(), encoding="utf-8")
        except RefreshError:
            return None
    return creds if creds and creds.valid else None


def require_drive_credentials() -> Credentials:
    creds = load_drive_credentials()
    if not creds:
        raise HTTPException(
            status_code=401,
            detail="Drive upload needs one-time Google reauthorization with drive.file scope.",
        )
    return creds


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
            detail=(
                "找不到 client_secret.json。本工具採「自架者自帶憑證」：請自行到 Google "
                "Cloud Console 建立專案、啟用 YouTube Data API v3、建立「桌面應用程式」"
                "OAuth 憑證，下載後命名為 client_secret.json 放到本程式 exe 的同一個資料夾，"
                "再重新啟動。完整圖解步驟見安裝文件 docs/SELF-HOST-SETUP.md（GCP 申請 / "
                "OAuth 同意畫面 / 憑證下載）。"
            ),
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


def _subscription_error_status(message: str) -> int:
    if "subscriptionDuplicate" in message:
        return 409
    if "subscriptionForbidden" in message or "forbidden" in message.lower():
        return 403
    if "subscriptionNotFound" in message or "notFound" in message:
        return 404
    return 500


def _insert_subscription(youtube, channel_id: str) -> dict:
    resp = youtube.subscriptions().insert(
        part="snippet",
        body={"snippet": {"resourceId": {"kind": "youtube#channel", "channelId": channel_id}}},
    ).execute()
    consume_quota(_QUOTA_SUBSCRIPTIONS_INSERT)
    snippet = resp.get("snippet", {})
    resource = snippet.get("resourceId", {})
    thumbnails = snippet.get("thumbnails", {})
    channel = {
        "subscription_id": resp.get("id", ""),
        "channel_id": resource.get("channelId", channel_id),
        "title": snippet.get("title", ""),
        "thumbnail": thumbnails.get("default", {}).get("url", ""),
    }
    return {"success": True, "subscription_id": channel["subscription_id"], "channel": channel}


class ReconcileBody(BaseModel):
    channel_ids: list[str] = []


@app.post("/subscriptions/reconcile")
def reconcile_subscriptions(body: ReconcileBody):
    ids = [channel_id.strip() for channel_id in (body.channel_ids or []) if channel_id and channel_id.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="缺少 channel_ids")

    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    api_ids: set[str] = set()
    page_token = None
    while True:
        resp = youtube.subscriptions().list(
            part="snippet",
            mine=True,
            maxResults=50,
            pageToken=page_token,
            order="alphabetical",
        ).execute()
        consume_quota(1)
        for item in resp.get("items", []):
            channel_id = item.get("snippet", {}).get("resourceId", {}).get("channelId")
            if channel_id:
                api_ids.add(channel_id)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    unique_ids = list(dict.fromkeys(ids))
    missing = [channel_id for channel_id in unique_ids if channel_id not in api_ids]

    alive: set[str] = set()
    for i in range(0, len(missing), 50):
        batch = missing[i:i + 50]
        if not batch:
            continue
        resp = youtube.channels().list(part="id", id=",".join(batch)).execute()
        consume_quota(1)
        for item in resp.get("items", []):
            channel_id = item.get("id")
            if channel_id:
                alive.add(channel_id)

    dead = [channel_id for channel_id in missing if channel_id not in alive]
    desynced = [channel_id for channel_id in missing if channel_id in alive]

    return {
        "takeout_count": len(unique_ids),
        "api_count": len(api_ids),
        "missing_count": len(missing),
        "dead": dead,
        "desynced": desynced,
    }


@app.post("/subscriptions/{channel_id}")
def post_subscription(channel_id: str):
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    try:
        return _insert_subscription(youtube, channel_id)
    except Exception as e:
        msg = str(e)
        raise HTTPException(status_code=_subscription_error_status(msg), detail=f"訂閱失敗：{msg}")


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
    discovery_keyword_top_n: int | None = Field(default=None, ge=1, le=100)
    min_duration_minutes: int | None = None
    max_duration_minutes: int | None = None
    normalize_target_db: float | None = None
    drive_root_folder: str | None = None
    download_concurrency: int | None = Field(default=None, ge=1, le=8)
    drive_upload_concurrency: int | None = Field(default=None, ge=1, le=8)


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
    if body.discovery_keyword_top_n is not None:
        settings["discovery_keyword_top_n"] = body.discovery_keyword_top_n
    if body.min_duration_minutes is not None:
        settings["min_duration_minutes"] = body.min_duration_minutes
    if body.max_duration_minutes is not None:
        settings["max_duration_minutes"] = body.max_duration_minutes
    if body.normalize_target_db is not None:
        if not (80.0 <= body.normalize_target_db <= 100.0):
            raise HTTPException(status_code=422, detail="normalize_target_db 必須介於 80.0 到 100.0 之間（dB SPL）")
        settings["normalize_target_db"] = body.normalize_target_db
    if body.drive_root_folder is not None:
        folder = body.drive_root_folder.strip()
        if not folder:
            raise HTTPException(status_code=422, detail="drive_root_folder must not be blank")
        settings["drive_root_folder"] = folder
    if body.download_concurrency is not None:
        settings["download_concurrency"] = body.download_concurrency
    if body.drive_upload_concurrency is not None:
        settings["drive_upload_concurrency"] = body.drive_upload_concurrency
    save_settings(settings)
    return settings


# ── 發燒影片路由 ───────────────────────────────────────────────────────────────
TRENDING_CATEGORIES = [
    {"id": None, "label": "全部"},
    {"id": "10", "label": "🎵 音樂"},
    {"id": "20", "label": "🎮 遊戲"},
    {"id": "24", "label": "🎬 娛樂"},
    {"id": "25", "label": "📰 新聞"},
    {"id": "17", "label": "⚽ 運動"},
    {"id": "1", "label": "🎞 電影"},
    {"id": "23", "label": "😄 喜劇"},
]
TRENDING_CATEGORY_WHITELIST = {
    c["id"] for c in TRENDING_CATEGORIES if c["id"] is not None
}


@app.get("/trending-videos/categories")
def get_trending_video_categories():
    require_credentials()
    return {"categories": TRENDING_CATEGORIES}


@app.get("/trending-videos")
def get_trending_videos(page_token: str | None = None, category: str | None = None):
    if category is not None and category not in TRENDING_CATEGORY_WHITELIST:
        raise HTTPException(status_code=400, detail="不支援的熱門分類")

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
        if category:
            list_kwargs["videoCategoryId"] = category
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


# ── 同類新頻道發現 ─────────────────────────────────────────────────────────────
# YouTube Data API v3 配額成本
_QUOTA_SUBSCRIPTIONS_LIST = 1
_QUOTA_CHANNELS_LIST = 1
_QUOTA_VIDEOS_LIST = 1
_QUOTA_PLAYLIST_ITEMS_LIST = 1
_QUOTA_SEARCH_LIST = 100
_QUOTA_SUBSCRIPTIONS_INSERT = 50

# Discovery 行為常數
_DISCOVERY_PAGE_SIZE = 20
_DISCOVERY_KEYWORD_TOP_N = 8
_DISCOVERY_CATEGORY_TOP_N = 6
_DISCOVERY_MAX_PER_CHANNEL = 2
_DISCOVERY_UPLOADS_PER_CANDIDATE = 5
_DISCOVERY_REGION_CODE = "TW"

# in-memory cache（key = email；生命週期 = backend process）
discovery_cache: dict[str, dict] = {}


def _discovery_keyword_top_n() -> int:
    return int(load_settings().get("discovery_keyword_top_n", _DISCOVERY_KEYWORD_TOP_N))


def _profile_keyword_top_n(profile: dict) -> int:
    configured = profile.get("keyword_top_n")
    if isinstance(configured, int) and configured > 0:
        return configured
    keywords = profile.get("keywords") or []
    return len(keywords) or _DISCOVERY_KEYWORD_TOP_N


def _select_profile_keywords(keyword_counter, keyword_categories: dict[str, str], top_n: int) -> list[str]:
    flat = [kw for kw, _ in keyword_counter.most_common(top_n)]
    category_count = len({cat for cat in keyword_categories.values() if cat})
    if category_count <= 2:
        return flat

    from collections import defaultdict, deque

    grouped: dict[str, deque[str]] = defaultdict(deque)
    uncategorized: deque[str] = deque()
    for kw, _ in keyword_counter.most_common():
        cat = keyword_categories.get(kw)
        if cat:
            grouped[cat].append(kw)
        else:
            uncategorized.append(kw)

    category_order = [
        cat for cat, _ in sorted(
            ((cat, sum(keyword_counter[kw] for kw in kws)) for cat, kws in grouped.items()),
            key=lambda item: item[1],
            reverse=True,
        )
    ]
    selected: list[str] = []
    while len(selected) < top_n and category_order:
        progressed = False
        for cat in list(category_order):
            if len(selected) >= top_n:
                break
            if grouped[cat]:
                selected.append(grouped[cat].popleft())
                progressed = True
            else:
                category_order.remove(cat)
        if not progressed:
            break

    while len(selected) < top_n and uncategorized:
        selected.append(uncategorized.popleft())

    return selected

# 中英文 stopwords（精簡列表，足以濾掉 channel title/keywords 的雜訊）
_DISCOVERY_STOPWORDS = {
    # English
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for",
    "with", "by", "is", "are", "was", "were", "be", "been", "being",
    "channel", "official", "tv", "youtube", "videos", "video", "music",
    # Chinese (common particles + generic terms)
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都",
    "一", "你", "說", "要", "去", "會", "頻道", "官方", "影片",
}


def _extract_channel_keywords(channel_resource: dict) -> list[str]:
    """從 channel resource 萃取 keyword list (lowercased, deduped, stopwords 已濾)。

    來源：snippet.title + brandingSettings.channel.keywords。
    Tokenize: ASCII alnum 詞或 CJK 連續字串。
    """
    import re
    snippet = channel_resource.get("snippet", {}) or {}
    branding = (channel_resource.get("brandingSettings", {}) or {}).get("channel", {}) or {}
    raw_text = " ".join([snippet.get("title", "") or "", branding.get("keywords", "") or ""])
    tokens = re.findall(r"[A-Za-z0-9]+|[一-鿿㐀-䶿]+", raw_text)
    out: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        t = tok.lower()
        if t in _DISCOVERY_STOPWORDS:
            continue
        if len(t) < 2:
            continue
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _downloaded_stems_all() -> set[str]:
    """掃描整個 output_path 下所有日期子資料夾的 mp3 stems（去掉序號前綴）。

    用於 discovery 過濾「已下載」影片。比 `_today_downloaded_stems` 視野更廣。
    """
    import re
    seq_re = re.compile(r"^\d+_")
    settings = load_settings()
    root = pathlib.Path(settings.get("output_path", ""))
    if not root.exists():
        return set()
    stems: set[str] = set()
    try:
        for entry in root.rglob("*"):
            if not entry.is_file():
                continue
            if entry.suffix == ".part":
                continue
            stems.add(_strip_highlight_prefix(seq_re.sub("", entry.stem, count=1)))
    except OSError:
        return set()
    return stems


def _build_user_profile(creds: Credentials, email: str) -> dict:
    """建立使用者 profile 並寫入 discovery_cache[email]。

    回傳 profile dict: {
        subscribed_channel_ids: set[str],
        keywords: list[str],     # top N (按頻率)
        categories: list[str],   # top N (按頻率)
    }
    """
    from collections import Counter
    from datetime import datetime, timezone

    youtube = build("youtube", "v3", credentials=creds)

    # 1) 訂閱頻道
    subscribed_ids: list[str] = []
    page_token = None
    while True:
        resp = youtube.subscriptions().list(
            part="snippet",
            mine=True,
            maxResults=50,
            pageToken=page_token,
        ).execute()
        consume_quota(_QUOTA_SUBSCRIPTIONS_LIST)
        for item in resp.get("items", []):
            cid = item.get("snippet", {}).get("resourceId", {}).get("channelId")
            if cid:
                subscribed_ids.append(cid)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    profile: dict = {
        "subscribed_channel_ids": set(subscribed_ids),
        "keywords": [],
        "keyword_top_n": _discovery_keyword_top_n(),
        "keyword_categories": {},
        "categories": [],
        "lang": "mixed",
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }

    if not subscribed_ids:
        discovery_cache[email] = {
            "profile": profile,
            "fast_candidates": [],
            "full_candidates": [],
            "merged": [],
            "cursor": 0,
            "phase_done": set(),
            "built_at": profile["analyzed_at"],
        }
        _save_profile_to_disk(email, profile)
        return profile

    # 2) 頻道 metadata 批次抓 → keywords + 語言偵測
    keyword_counter: Counter = Counter()
    channel_keywords: dict[str, list[str]] = {}
    sub_channel_titles: list[str] = []
    for start in range(0, len(subscribed_ids), 50):
        batch = subscribed_ids[start: start + 50]
        resp = youtube.channels().list(
            part="snippet,brandingSettings",
            id=",".join(batch),
            maxResults=50,
        ).execute()
        consume_quota(_QUOTA_CHANNELS_LIST)
        for ch in resp.get("items", []):
            cid = ch.get("id")
            title = (ch.get("snippet", {}) or {}).get("title", "")
            if title:
                sub_channel_titles.append(title)
            kws = _extract_channel_keywords(ch)
            if cid:
                channel_keywords[cid] = kws
            for kw in kws:
                keyword_counter[kw] += 1

    # 3) Category 直方圖：從每個訂閱頻道最新影片的 categoryId 統計
    latest_video_ids: list[str] = []
    latest_video_channels: dict[str, str] = {}
    for cid in subscribed_ids:
        if not cid.startswith("UC"):
            continue
        uploads_id = "UU" + cid[2:]
        try:
            resp = youtube.playlistItems().list(
                part="snippet",
                playlistId=uploads_id,
                maxResults=1,
            ).execute()
            consume_quota(_QUOTA_PLAYLIST_ITEMS_LIST)
            items = resp.get("items", [])
            if items:
                vid = items[0].get("snippet", {}).get("resourceId", {}).get("videoId")
                if vid:
                    latest_video_ids.append(vid)
                    latest_video_channels[vid] = cid
        except Exception:
            continue

    category_counter: Counter = Counter()
    channel_categories: dict[str, str] = {}
    for start in range(0, len(latest_video_ids), 50):
        batch = latest_video_ids[start: start + 50]
        try:
            resp = youtube.videos().list(
                part="snippet",
                id=",".join(batch),
            ).execute()
            consume_quota(_QUOTA_VIDEOS_LIST)
            for v in resp.get("items", []):
                cat = v.get("snippet", {}).get("categoryId")
                if cat:
                    category_counter[cat] += 1
                    cid = (v.get("snippet", {}) or {}).get("channelId") or latest_video_channels.get(v.get("id"))
                    if cid:
                        channel_categories[cid] = cat
        except Exception:
            continue

    keyword_category_counter: dict[str, Counter] = {}
    for cid, kws in channel_keywords.items():
        cat = channel_categories.get(cid)
        if not cat:
            continue
        for kw in kws:
            keyword_category_counter.setdefault(kw, Counter())[cat] += 1
    keyword_categories = {
        kw: cats.most_common(1)[0][0]
        for kw, cats in keyword_category_counter.items()
        if cats
    }

    profile["keyword_categories"] = keyword_categories
    profile["keywords"] = _select_profile_keywords(
        keyword_counter,
        keyword_categories,
        _discovery_keyword_top_n(),
    )
    profile["categories"] = [c for c, _ in category_counter.most_common(_DISCOVERY_CATEGORY_TOP_N)]
    profile["lang"] = _detect_profile_lang(sub_channel_titles)

    discovery_cache[email] = {
        "profile": profile,
        "fast_candidates": [],
        "full_candidates": [],
        "merged": [],
        "cursor": 0,
        "phase_done": set(),
        "built_at": profile["analyzed_at"],
    }
    _save_profile_to_disk(email, profile)
    return profile


def _video_payload_from_videos_item(item: dict) -> dict | None:
    """把 videos.list 的單一 item 轉成前端 video 物件。回傳 None 表示應跳過。"""
    snippet = item.get("snippet", {}) or {}
    if snippet.get("liveBroadcastContent") == "upcoming":
        return None
    video_id = item.get("id")
    if not video_id:
        return None
    duration_iso = (item.get("contentDetails", {}) or {}).get("duration", "")
    try:
        view_count = int((item.get("statistics", {}) or {}).get("viewCount", 0))
    except (ValueError, TypeError):
        view_count = 0
    title = snippet.get("title", "")
    channel_id = snippet.get("channelId", "")
    channel_title = snippet.get("channelTitle", "")
    published = snippet.get("publishedAt", "")
    thumbnail = (snippet.get("thumbnails", {}) or {}).get("default", {}).get(
        "url", f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
    )
    return {
        "video_id": video_id,
        "title": title,
        "published": published,
        "thumbnail": thumbnail,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "channel_id": channel_id,
        "channel_title": channel_title,
        "category_id": snippet.get("categoryId", ""),
        "duration_seconds": parse_iso_duration(duration_iso),
        "view_count": view_count,
    }


def _fast_phase_candidates(creds: Credentials, profile: dict) -> list[dict]:
    """分支 A：依 profile 的 top categories 打 mostPopular。

    若 profile.categories 為空（從 latest video 推斷失敗），fallback 用既有
    TRENDING_CATEGORY_WHITELIST 的代表性 categories。
    """
    youtube = build("youtube", "v3", credentials=creds)
    target_categories = profile.get("categories") or [
        c["id"] for c in TRENDING_CATEGORIES if c["id"] is not None
    ][:_DISCOVERY_CATEGORY_TOP_N]
    out: list[dict] = []
    for cat_id in target_categories[:_DISCOVERY_CATEGORY_TOP_N]:
        try:
            resp = youtube.videos().list(
                part="snippet,contentDetails,statistics",
                chart="mostPopular",
                regionCode=_DISCOVERY_REGION_CODE,
                videoCategoryId=str(cat_id),
                maxResults=20,
            ).execute()
            consume_quota(_QUOTA_VIDEOS_LIST)
            for item in resp.get("items", []):
                payload = _video_payload_from_videos_item(item)
                if payload:
                    payload["_source"] = "fast"
                    out.append(payload)
        except Exception:
            continue
    return out


def _full_phase_candidates(creds: Credentials, profile: dict) -> list[dict]:
    """分支 B：用 profile.keywords 打 search.list?type=channel，再抓候選頻道近期 uploads。

    回傳已附加 `_source`、`_matched_keyword` 的影片 list。
    """
    youtube = build("youtube", "v3", credentials=creds)
    keywords = profile.get("keywords") or []
    if not keywords:
        return []

    # 找候選 channel ids（每個 keyword 一次 search.list）
    candidate_channels: dict[str, str] = {}  # channel_id → matched keyword
    for kw in keywords[:_profile_keyword_top_n(profile)]:
        try:
            resp = youtube.search().list(
                part="snippet",
                q=kw,
                type="channel",
                regionCode=_DISCOVERY_REGION_CODE,
                maxResults=10,
            ).execute()
            consume_quota(_QUOTA_SEARCH_LIST)
            for item in resp.get("items", []):
                cid = (item.get("id", {}) or {}).get("channelId")
                if cid and cid not in candidate_channels:
                    candidate_channels[cid] = kw
        except Exception:
            continue

    if not candidate_channels:
        return []

    # 從每個候選 channel 抓近期 uploads（uploads playlist 由 UC→UU 轉換）
    out: list[dict] = []
    video_ids: list[str] = []
    video_match_map: dict[str, str] = {}
    for cid, matched_kw in candidate_channels.items():
        if not cid.startswith("UC"):
            continue
        uploads_id = "UU" + cid[2:]
        try:
            resp = youtube.playlistItems().list(
                part="snippet",
                playlistId=uploads_id,
                maxResults=_DISCOVERY_UPLOADS_PER_CANDIDATE,
            ).execute()
            consume_quota(_QUOTA_PLAYLIST_ITEMS_LIST)
            for item in resp.get("items", []):
                vid = (item.get("snippet", {}) or {}).get("resourceId", {}).get("videoId")
                if vid:
                    video_ids.append(vid)
                    video_match_map[vid] = matched_kw
        except Exception:
            continue

    if not video_ids:
        return []

    # batch videos.list 取得 contentDetails + statistics（playlistItems 沒有）
    for start in range(0, len(video_ids), 50):
        batch = video_ids[start: start + 50]
        try:
            resp = youtube.videos().list(
                part="snippet,contentDetails,statistics",
                id=",".join(batch),
            ).execute()
            consume_quota(_QUOTA_VIDEOS_LIST)
            for item in resp.get("items", []):
                payload = _video_payload_from_videos_item(item)
                if not payload:
                    continue
                payload["_source"] = "full"
                payload["_matched_keyword"] = video_match_map.get(payload["video_id"], "")
                out.append(payload)
        except Exception:
            continue

    return out


def _discovery_profile_path(email: str) -> pathlib.Path:
    """回傳指定帳號的 discovery profile 永續快取檔路徑。"""
    safe = email.replace("/", "_").replace("\\", "_")
    return DISCOVERY_PROFILES_DIR / f"{safe}.json"


def _save_profile_to_disk(email: str, profile: dict) -> None:
    """將 profile 寫入磁碟（set 轉 list 以利 JSON 序列化）。"""
    serializable = {
        "subscribed_channel_ids": sorted(profile.get("subscribed_channel_ids", set())),
        "keywords": list(profile.get("keywords", [])),
        "keyword_top_n": profile.get("keyword_top_n"),
        "keyword_categories": dict(profile.get("keyword_categories", {})),
        "categories": list(profile.get("categories", [])),
        "lang": profile.get("lang", "mixed"),
        "analyzed_at": profile.get("analyzed_at"),
    }
    try:
        _discovery_profile_path(email).write_text(
            json.dumps(serializable, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass  # 寫檔失敗不影響功能（下次重新分析即可）


def _load_profile_from_disk(email: str) -> dict | None:
    """從磁碟讀取 profile；不存在或損壞回 None。"""
    path = _discovery_profile_path(email)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return {
        "subscribed_channel_ids": set(raw.get("subscribed_channel_ids", [])),
        "keywords": list(raw.get("keywords", [])),
        "keyword_top_n": raw.get("keyword_top_n"),
        "keyword_categories": dict(raw.get("keyword_categories", {})),
        "categories": list(raw.get("categories", [])),
        "lang": raw.get("lang", "mixed"),
        "analyzed_at": raw.get("analyzed_at"),
    }


import re as _re_lang
_CJK_CHAR_RE = _re_lang.compile(r"[一-鿿㐀-䶿]")
_LATIN_CHAR_RE = _re_lang.compile(r"[A-Za-z]")


def _detect_text_lang(text: str) -> str:
    """單一字串的語言粗判斷：'cjk' / 'latin' / 'mixed'。
    CJK 字元權重較高（一字 ≈ 一英文 word），所以用 cjk*3 vs latin 比較。
    """
    if not text:
        return "mixed"
    cjk = len(_CJK_CHAR_RE.findall(text))
    latin = len(_LATIN_CHAR_RE.findall(text))
    if cjk == 0 and latin == 0:
        return "mixed"
    if cjk > 0 and cjk * 3 >= latin:
        return "cjk"
    if latin > 0 and latin >= cjk * 3:
        return "latin"
    return "mixed"


def _detect_profile_lang(channel_titles: list[str]) -> str:
    """依使用者訂閱頻道的標題集合判斷主要語言。"""
    cjk_count = 0
    latin_count = 0
    for title in channel_titles:
        lang = _detect_text_lang(title or "")
        if lang == "cjk":
            cjk_count += 1
        elif lang == "latin":
            latin_count += 1
    if cjk_count > latin_count * 1.5:
        return "cjk"
    if latin_count > cjk_count * 1.5:
        return "latin"
    return "mixed"


def _video_matches_lang(v: dict, target_lang: str) -> bool:
    """檢查影片語言（title 或 channel_title）是否符合 target_lang。
    target_lang='mixed' 表示不限制。
    """
    if target_lang == "mixed":
        return True
    title_lang = _detect_text_lang(v.get("title", "") or "")
    channel_lang = _detect_text_lang(v.get("channel_title", "") or "")
    # 影片任一處與 target 一致（或為 mixed）就視為匹配
    return target_lang in (title_lang, channel_lang) or "mixed" in (title_lang, channel_lang)


def _has_keyword_match(v: dict, keywords: set[str]) -> bool:
    """檢查影片是否與 profile 關鍵字相關。
    Title / channel_title 任一處子字串命中、或 full phase 的 `_matched_keyword` 已設定皆算。
    """
    if v.get("_matched_keyword"):
        return True
    title = (v.get("title", "") or "").lower()
    channel = (v.get("channel_title", "") or "").lower()
    for kw in keywords:
        if kw in title or kw in channel:
            return True
    return False


def _filter_candidates(videos: list[dict], profile: dict) -> list[dict]:
    """濾掉已訂閱頻道 + 已下載影片 + 重複 video_id；當 profile.keywords 非空時，
    額外要求影片必須與關鍵字相關；當 profile.lang 非 'mixed' 時，限制候選為同語言。"""
    subscribed = profile.get("subscribed_channel_ids", set())
    downloaded = _downloaded_stems_all()
    keywords = set((profile.get("keywords") or [])[:_profile_keyword_top_n(profile)])
    require_keyword_match = bool(keywords)
    target_lang = profile.get("lang", "mixed") or "mixed"
    seen_ids: set[str] = set()
    out: list[dict] = []
    for v in videos:
        vid = v.get("video_id")
        if not vid or vid in seen_ids:
            continue
        if v.get("channel_id") in subscribed:
            continue
        # 已下載比對：用標題 sanitize 後的 stem 比對（與下載時的命名規則一致）；
        # 兩側皆去掉開頭「【精華】」標記，使精華版重新上架與原版互判為同一支。
        title_stem = _strip_highlight_prefix(_sanitize_filename(v.get("title", "")))
        if title_stem in downloaded:
            continue
        # 相關性過濾（修法 2：嚴格）
        if require_keyword_match and not _has_keyword_match(v, keywords):
            continue
        # 語言過濾（profile.lang 非 mixed 時）
        if not _video_matches_lang(v, target_lang):
            continue
        seen_ids.add(vid)
        out.append(v)
    return out


def _apply_category_gate(ranked: list[dict], profile: dict) -> list[dict]:
    profile_categories = [c for c in (profile.get("categories") or []) if c]
    if len(set(profile_categories)) <= 2:
        return ranked

    video_categories = [v.get("category_id") for v in ranked if v.get("category_id")]
    if len(set(video_categories)) <= 2:
        return ranked

    from collections import defaultdict, deque

    grouped: dict[str, deque[dict]] = defaultdict(deque)
    category_order: list[str] = []
    for v in ranked:
        cat = v.get("category_id") or "_uncategorized"
        if cat not in grouped:
            category_order.append(cat)
        grouped[cat].append(v)

    out: list[dict] = []
    while len(out) < len(ranked) and category_order:
        progressed = False
        for cat in list(category_order):
            if grouped[cat]:
                out.append(grouped[cat].popleft())
                progressed = True
            else:
                category_order.remove(cat)
        if not progressed:
            break
    return out


def _score_and_rank(videos: list[dict], profile: dict) -> list[dict]:
    """排序公式：recency × view_velocity × keyword_hit；每頻道最多 _DISCOVERY_MAX_PER_CHANNEL 部。"""
    import math
    from datetime import datetime, timezone

    keywords = set((profile.get("keywords") or [])[:_profile_keyword_top_n(profile)])
    now = datetime.now(timezone.utc)

    def score(v: dict) -> float:
        # recency: e^(-days/7)
        published = v.get("published", "")
        try:
            pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            days = max((now - pub_dt).total_seconds() / 86400.0, 0.0)
            hours = max((now - pub_dt).total_seconds() / 3600.0, 1.0)
        except (ValueError, TypeError):
            days, hours = 30.0, 24.0
        recency = math.exp(-days / 7.0)
        velocity = float(v.get("view_count", 0)) / hours
        # keyword hit: title + channel_title 命中（加上 _matched_keyword bonus）
        title_lower = (v.get("title", "") or "").lower()
        channel_lower = (v.get("channel_title", "") or "").lower()
        hits = sum(
            1 for kw in keywords
            if kw in title_lower or kw in channel_lower
        )
        if v.get("_matched_keyword"):
            hits += 1
        keyword_score = (hits / max(len(keywords), 1)) if keywords else 0.0
        # 標準化 velocity（log 壓縮，避免單一爆紅影片壟斷）
        velocity_norm = math.log10(velocity + 1.0) / 5.0
        # 修法 2：keyword 權重 1.5 → 5.0，velocity 權重 0.5 → 0.3，
        # 確保 keyword-match 候選不會被 trending 雜訊蓋過。
        return (recency * 1.0) + (velocity_norm * 0.3) + (keyword_score * 5.0)

    ranked = sorted(videos, key=score, reverse=True)

    # 每頻道最多 N 部
    from collections import Counter
    per_channel: Counter = Counter()
    out: list[dict] = []
    for v in ranked:
        cid = v.get("channel_id", "")
        if per_channel[cid] >= _DISCOVERY_MAX_PER_CHANNEL:
            continue
        per_channel[cid] += 1
        out.append(v)
    return _apply_category_gate(out, profile)


def _merge_candidates(fast: list[dict], full: list[dict], profile: dict) -> list[dict]:
    """合併 fast + full 結果 → 過濾 → 排序 → 去重。"""
    return _score_and_rank(_filter_candidates(fast + full, profile), profile)


def _strip_internal_fields(videos: list[dict]) -> list[dict]:
    """從回傳給前端的 video dict 中移除 `_source` / `_matched_keyword` 內部欄位。"""
    out = []
    for v in videos:
        clean = {k: val for k, val in v.items() if not k.startswith("_")}
        out.append(clean)
    return out


def _profile_summary(profile: dict) -> dict:
    """回傳給前端的 profile 摘要。"""
    return {
        "subscribed_count": len(profile.get("subscribed_channel_ids", set())),
        "keywords": list(profile.get("keywords", [])),
        "categories": list(profile.get("categories", [])),
        "lang": profile.get("lang", "mixed"),
        "analyzed_at": profile.get("analyzed_at"),
    }


def _ensure_profile(creds: Credentials, email: str, force_rebuild: bool = False) -> dict:
    """確保 profile 可用：先看 in-memory cache，再讀磁碟，都沒有才打 API rebuild。
    force_rebuild=True 時忽略所有 cache 強制重建。
    """
    if force_rebuild:
        return _build_user_profile(creds, email)

    # in-memory cache 命中
    entry = discovery_cache.get(email)
    if entry is not None and entry.get("profile"):
        return entry["profile"]

    # 磁碟 cache 命中 → 還原進 in-memory
    disk_profile = _load_profile_from_disk(email)
    if disk_profile is not None:
        discovery_cache[email] = {
            "profile": disk_profile,
            "fast_candidates": [],
            "full_candidates": [],
            "merged": [],
            "cursor": 0,
            "phase_done": set(),
            "built_at": disk_profile.get("analyzed_at"),
        }
        return disk_profile

    # 完全沒有 → 打 API 建立
    return _build_user_profile(creds, email)


class SubscribeRequest(BaseModel):
    channel_id: str = Field(..., min_length=1)


@app.get("/discovery/similar-channels")
def get_similar_channels(phase: str = "fast", cursor: int = 0, force_rebuild: bool = False):
    """同類但未訂閱頻道的近期影片。

    - `phase=fast`: 僅執行 mostPopular 分支（快，~1–2 秒）
    - `phase=full`: 確保 search.list 分支也執行完（慢，~10–30 秒）
    - `cursor`: 分頁游標；cache 未耗盡時不打 API
    - `force_rebuild`: 強制重新分析訂閱（重打 subscriptions.list + channels.list + 重抓 keyword）。
       否則優先使用記憶體 cache，再讀磁碟 cache（跨 backend 重啟保留）。
    """
    if phase not in ("fast", "full"):
        raise HTTPException(status_code=400, detail="phase 必須是 fast 或 full")

    creds = require_credentials()
    email = _get_current_email() or "_anonymous"

    profile = _ensure_profile(creds, email, force_rebuild=force_rebuild)
    entry = discovery_cache[email]

    # force_rebuild 時清掉 candidate cache，下面會重新撈
    if force_rebuild:
        entry["fast_candidates"] = []
        entry["full_candidates"] = []
        entry["merged"] = []
        entry["cursor"] = 0
        entry["phase_done"] = set()
        cursor = 0

    # 沒有訂閱頻道 → 空狀態
    if not profile.get("subscribed_channel_ids"):
        return {
            "videos": [],
            "cursor": 0,
            "has_more": False,
            "phase": phase,
            "phase_done": list(entry.get("phase_done", set())),
            "profile_summary": _profile_summary(profile),
            "empty_reason": "no_subscriptions",
        }

    phase_done = entry.setdefault("phase_done", set())

    # 若 cursor 在現有 merged 內 → 直接切片回傳，不打 API
    merged = entry.get("merged") or []
    page_end = cursor + _DISCOVERY_PAGE_SIZE
    if cursor < len(merged) and (page_end <= len(merged) or phase in phase_done):
        page = merged[cursor:page_end]
        return {
            "videos": _strip_internal_fields(page),
            "cursor": min(page_end, len(merged)),
            "has_more": page_end < len(merged),
            "phase": phase,
            "phase_done": list(phase_done),
            "profile_summary": _profile_summary(profile),
        }

    # 需要打 API 補候選
    if "fast" not in phase_done:
        entry["fast_candidates"] = _fast_phase_candidates(creds, profile)
        phase_done.add("fast")

    if phase == "full" and "full" not in phase_done:
        entry["full_candidates"] = _full_phase_candidates(creds, profile)
        phase_done.add("full")

    entry["merged"] = _merge_candidates(
        entry["fast_candidates"], entry["full_candidates"], profile
    )
    merged = entry["merged"]

    # cursor 超出 → 重新撈一批候選，但 **不重新分析 profile**（profile 是 sticky 的，
    # 使用者要重新分析需明確點「重新分析」按鈕 → force_rebuild=true）
    if cursor >= len(merged) and cursor > 0:
        entry["fast_candidates"] = _fast_phase_candidates(creds, profile)
        if phase == "full":
            entry["full_candidates"] = _full_phase_candidates(creds, profile)
            entry["phase_done"] = {"fast", "full"}
        else:
            entry["phase_done"] = {"fast"}
        entry["merged"] = _merge_candidates(
            entry["fast_candidates"], entry["full_candidates"], profile
        )
        merged = entry["merged"]
        cursor = 0
        page_end = _DISCOVERY_PAGE_SIZE

    page = merged[cursor:page_end]
    return {
        "videos": _strip_internal_fields(page),
        "cursor": min(page_end, len(merged)),
        "has_more": page_end < len(merged),
        "phase": phase,
        "phase_done": list(phase_done),
        "profile_summary": _profile_summary(profile),
    }


@app.post("/discovery/subscribe")
def post_discovery_subscribe(body: SubscribeRequest):
    """一鍵訂閱指定頻道，並更新 cache。"""
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    try:
        youtube.subscriptions().insert(
            part="snippet",
            body={"snippet": {"resourceId": {"kind": "youtube#channel", "channelId": body.channel_id}}},
        ).execute()
        consume_quota(_QUOTA_SUBSCRIPTIONS_INSERT)
    except Exception as e:
        msg = str(e)
        # google API client raises HttpError; 取 reason 給前端
        status = 500
        if "subscriptionDuplicate" in msg:
            status = 409
        elif "subscriptionForbidden" in msg or "forbidden" in msg.lower():
            status = 403
        elif "subscriptionNotFound" in msg or "notFound" in msg:
            status = 404
        raise HTTPException(status_code=status, detail=f"訂閱失敗：{msg}")

    # 更新 cache：加入訂閱集合 + 過濾候選池
    email = _get_current_email() or "_anonymous"
    entry = discovery_cache.get(email)
    if entry is not None:
        profile = entry["profile"]
        profile.setdefault("subscribed_channel_ids", set()).add(body.channel_id)
        entry["fast_candidates"] = [v for v in entry.get("fast_candidates", []) if v.get("channel_id") != body.channel_id]
        entry["full_candidates"] = [v for v in entry.get("full_candidates", []) if v.get("channel_id") != body.channel_id]
        entry["merged"] = [v for v in entry.get("merged", []) if v.get("channel_id") != body.channel_id]

    return {"success": True, "channel_id": body.channel_id}


# ── 最新影片路由 ───────────────────────────────────────────────────────────────
@app.get("/latest-videos")
async def get_latest_videos(
    hours: int | None = None,
    min_duration_minutes: int | None = None,
    max_duration_minutes: int | None = None,
):
    from datetime import datetime, timezone, timedelta
    settings = load_settings()
    if hours is None:
        hours = settings.get("latest_hours", 24)
    if min_duration_minutes is not None and min_duration_minutes < 0:
        min_duration_minutes = 0
    if max_duration_minutes is not None and max_duration_minutes < 1:
        max_duration_minutes = 1
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
    # 注意：此處不使用 settings["videos_per_channel"]（那是「點頻道看影片」endpoint 的 UI 顯示上限）。
    # latest-videos 是時窗聚合，必須抓滿單次 API 上限 50，否則高更新頻道在時窗內的早期影片
    # 會被截在 playlistItems 第一頁外。50 是 YouTube playlistItems 單次最大值，1 unit/call。
    limit = 50
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

    videos = enhance_and_filter_videos(
        youtube,
        videos,
        apply_duration_filter=True,
        min_duration_override=min_duration_minutes,
        max_duration_override=max_duration_minutes,
    )
    videos.sort(key=lambda v: v["published"], reverse=True)

    downloaded_stems = _today_downloaded_stems()
    for v in videos:
        v["downloaded_today"] = (
            _strip_highlight_prefix(_sanitize_filename(v.get("title", ""))) in downloaded_stems
        )

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


@app.get("/search-channels")
def search_channels(q: str):
    require_credentials()
    if not q or not q.strip():
        return {"channels": []}
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    resp = youtube.search().list(
        part="snippet",
        q=q.strip(),
        type="channel",
        maxResults=50,
    ).execute()
    consume_quota(_QUOTA_SEARCH_LIST)
    channels = []
    for item in resp.get("items", []):
        cid = (item.get("id", {}) or {}).get("channelId")
        if not cid:
            continue
        snippet = item.get("snippet", {}) or {}
        thumbs = snippet.get("thumbnails", {}) or {}
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
        channels.append({
            "channel_id": cid,
            "title": snippet.get("title", ""),
            "thumbnail": thumb,
        })
    return {"channels": channels}


# ── 網址預覽路由 ───────────────────────────────────────────────────────────────
def _sync_url_preview_yt_dlp(url: str) -> list[dict]:
    import yt_dlp
    ydl_opts = {
        "quiet": True,
        "extract_flat": "in_playlist",
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
    seq_enabled: bool = True
    start_seq: str | None = Field(default=None, pattern=r"^\d{1,10}$")
    target_dir: str | None = None


_MP3_QUALITIES = (128, 192, 256, 320)
_MP4_QUALITIES = (360, 480, 720, 1080)
_FORMAT_DEFAULT_QUALITY = {"mp3": 192, "mp4": 720}


def _normalize_format_quality(fmt: str | None, quality: int | None) -> tuple[str, int]:
    """白名單外的值無聲修正為該格式預設；未知格式回退 mp3 / 192。"""
    f = fmt if fmt in _FORMAT_DEFAULT_QUALITY else "mp3"
    allowed = _MP3_QUALITIES if f == "mp3" else _MP4_QUALITIES
    q = quality if isinstance(quality, int) and quality in allowed else _FORMAT_DEFAULT_QUALITY[f]
    return f, q


_SEQ_PREFIX_RE = None


def _today_download_dir() -> pathlib.Path:
    """Return today's date subdirectory under the configured output_path (local time)."""
    from datetime import datetime
    settings = load_settings()
    return pathlib.Path(settings.get("output_path", "")) / datetime.now().strftime("%Y%m%d")


def _resolve_output_child(output_path: str, child: str | None) -> pathlib.Path:
    from datetime import datetime
    base = pathlib.Path(output_path).resolve()
    name = child if child is not None and child.strip() else datetime.now().strftime("%Y%m%d")
    if "/" in name or "\\" in name or name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="target_dir must be a child folder name")
    target = (base / _sanitize_filename(name)).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="target_dir escapes output_path")
    return target


def _today_downloaded_stems() -> set[str]:
    """Return file stems in today's download folder, stripped of `^\\d+_` sequence prefix.

    Ignores `.part` (in-progress) files and any non-regular entries. Returns an empty set
    if the folder does not exist or is unreadable.
    """
    import re
    seq_re = re.compile(r"^\d+_")
    try:
        entries = list(_today_download_dir().iterdir())
    except (FileNotFoundError, NotADirectoryError):
        return set()
    stems: set[str] = set()
    for entry in entries:
        if not entry.is_file():
            continue
        if entry.suffix == ".part":
            continue
        stem = entry.stem
        stems.add(_strip_highlight_prefix(seq_re.sub("", stem, count=1)))
    return stems


def _format_seq(n: int) -> str:
    """Zero-pad to 2 digits, auto-widen past 99 (07 / 99 / 100 / 121)."""
    width = max(2, len(str(n)))
    return f"{n:0{width}d}"


def _scan_next_seq(directory: pathlib.Path) -> int:
    """Return the next sequence number for filenames matching `^(\\d+)_` in *directory*.

    Scans all entries regardless of extension (mp3 / mp4 / .part) so mixed-format
    batches share the same counter. Missing directory or no matches → 1.
    """
    import re
    global _SEQ_PREFIX_RE
    if _SEQ_PREFIX_RE is None:
        _SEQ_PREFIX_RE = re.compile(r"^(\d+)_")
    try:
        entries = list(directory.iterdir())
    except (FileNotFoundError, NotADirectoryError):
        return 1
    max_seq = 0
    for entry in entries:
        if not entry.is_file():
            continue
        m = _SEQ_PREFIX_RE.match(entry.name)
        if m:
            n = int(m.group(1))
            if n > max_seq:
                max_seq = n
    return max_seq + 1


def _scan_existing_seqs(directory: pathlib.Path) -> list[int]:
    """Return ascending list of every numeric prefix found in *directory*."""
    import re
    global _SEQ_PREFIX_RE
    if _SEQ_PREFIX_RE is None:
        _SEQ_PREFIX_RE = re.compile(r"^(\d+)_")
    try:
        entries = list(directory.iterdir())
    except (FileNotFoundError, NotADirectoryError):
        return []
    seqs: list[int] = []
    for entry in entries:
        if not entry.is_file():
            continue
        m = _SEQ_PREFIX_RE.match(entry.name)
        if m:
            seqs.append(int(m.group(1)))
    seqs.sort()
    return seqs


def _compute_seq_prefix(start_seq: str | None, default_next: int, idx: int) -> str:
    """Build the `nn_` prefix for the *idx*-th video in a batch.

    - `start_seq=None`: continue from scanned `default_next`, width = max(2, len(str(n))).
    - `start_seq` set: width follows the input string length, expanding when n outgrows it.
    """
    if start_seq is None:
        return f"{_format_seq(default_next + idx)}_"
    n = int(start_seq) + idx
    width = max(len(start_seq), len(str(n)))
    return f"{n:0{width}d}_"


def _build_ydl_opts(output_path: str, safe_title: str, hook, fmt: str, quality: int, seq_prefix: str = "") -> dict:
    base = {
        "outtmpl": os.path.join(output_path, f"{seq_prefix}{safe_title}.%(ext)s"),
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


def _resolve_concurrency(settings: dict) -> int:
    """Read download_concurrency from settings, clamp to 1..8, fallback 3 on missing/invalid."""
    raw = settings.get("download_concurrency", 3)
    try:
        return max(1, min(8, int(raw)))
    except (TypeError, ValueError):
        return 3


def _resolve_drive_upload_concurrency(settings: dict) -> int:
    """Read drive_upload_concurrency from settings, clamp to 1..8, fallback 3 on missing/invalid."""
    raw = settings.get("drive_upload_concurrency", 3)
    try:
        return max(1, min(8, int(raw)))
    except (TypeError, ValueError):
        return 3


def run_download(
    videos: list[dict],
    output_path: str,
    task_id: str,
    fmt: str = "mp3",
    quality: int = 192,
    seq_enabled: bool = True,
    start_seq: str | None = None,
    concurrency: int = 1,
):
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

    default_next = _scan_next_seq(pathlib.Path(output_path))

    def download_one(idx: int, v: dict):
        """Download + convert a single video. Errors are caught per-video so a
        failure never aborts sibling downloads when running concurrently."""
        vid = v["video_id"]
        safe_title = _sanitize_filename(v.get("title", ""))
        # 序號前綴依批次內 idx 計算，與完成順序解耦 → 並行下檔名編號仍正確
        seq_prefix = _compute_seq_prefix(start_seq, default_next, idx) if seq_enabled else ""
        ydl_opts = _build_ydl_opts(output_path, safe_title, make_hook(vid), fmt, quality, seq_prefix)
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([v["url"]])
            download_progress[task_id]["items"][vid]["status"] = "done"
        except Exception as e:
            download_progress[task_id]["items"][vid]["status"] = "error"
            download_progress[task_id]["items"][vid]["error"] = str(e)

    if concurrency <= 1 or len(videos) <= 1:
        for idx, v in enumerate(videos):
            download_one(idx, v)
    else:
        async def _coordinate():
            sem = asyncio.Semaphore(concurrency)

            async def _one(idx: int, v: dict):
                async with sem:
                    await asyncio.to_thread(download_one, idx, v)

            await asyncio.gather(*(_one(idx, v) for idx, v in enumerate(videos)))

        # run_download executes in a worker thread (run_in_executor), so it owns
        # no running loop here — asyncio.run is safe and keeps the sync interface.
        asyncio.run(_coordinate())

    download_progress[task_id]["status"] = "done"


@app.post("/download")
async def start_download(body: DownloadRequest):
    settings = load_settings()
    output_path = settings["output_path"]
    
    # 建立日期子目錄 YYYYMMDD
    final_output_path = _resolve_output_child(output_path, body.target_dir)
    
    final_output_path.mkdir(parents=True, exist_ok=True)

    import uuid
    task_id = str(uuid.uuid4())

    fmt, quality = _normalize_format_quality(body.format, body.quality)
    concurrency = _resolve_concurrency(settings)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        run_download,
        body.videos,
        str(final_output_path),
        task_id,
        fmt,
        quality,
        body.seq_enabled,
        body.start_seq,
        concurrency,
    )

    return {"task_id": task_id, "directory": str(final_output_path.resolve())}


@app.get("/download/next-seq")
async def download_next_seq():
    require_credentials()
    today_dir = _today_download_dir()
    existing = _scan_existing_seqs(today_dir)
    next_n = (existing[-1] + 1) if existing else 1
    return {"next_seq": _format_seq(next_n), "existing": existing}


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


def run_normalize_batch(
    task_id: str,
    directory: str,
    filenames: list[str],
    target_db: float,
    concurrency: int = 1,
) -> None:
    state = normalize_progress[task_id]
    dir_path = pathlib.Path(directory)

    def normalize_one(filename: str) -> None:
        item = state["items"][filename]
        file_path = dir_path / filename
        try:
            item["status"] = "measuring"
            analyzed = _run_mp3gain_analyze(file_path, target_db)
            item["measured_db"] = analyzed["measured_db"]
            item["recommended_db_change"] = analyzed["recommended_db_change"]

            if abs(analyzed["recommended_db_change"]) < MP3GAIN_TOLERANCE_DB:
                item["status"] = "skipped"
                return

            item["status"] = "normalizing"
            _run_mp3gain_apply(file_path, target_db)
            item["status"] = "done"
        except Exception as e:
            item["status"] = "error"
            item["error"] = str(e)

    try:
        if concurrency <= 1 or len(filenames) <= 1:
            for filename in filenames:
                normalize_one(filename)
        else:
            async def _coordinate() -> None:
                sem = asyncio.Semaphore(concurrency)

                async def _one(filename: str) -> None:
                    async with sem:
                        await asyncio.to_thread(normalize_one, filename)

                await asyncio.gather(*(_one(filename) for filename in filenames))

            asyncio.run(_coordinate())
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
    concurrency = _resolve_concurrency(settings)

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
    loop.run_in_executor(None, run_normalize_batch, task_id, dir_key, body.filenames, target_db, concurrency)

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
class DriveUploadRequest(BaseModel):
    directory: str


def _drive_error_detail(e: Exception) -> str:
    """把 Drive API 例外轉成給使用者看的繁中訊息（特別處理「API 未啟用」）。"""
    text = str(e)
    if isinstance(e, HttpError):
        reason = ""
        try:
            if e.error_details:
                reason = e.error_details[0].get("reason", "")
        except Exception:
            pass
        if reason == "accessNotConfigured" or "has not been used in project" in text:
            return (
                "Google Drive API 尚未在此 Google Cloud 專案啟用。"
                "請到 Google Cloud Console 啟用 Drive API（drive.googleapis.com），"
                "等幾分鐘後再試。"
            )
        return f"Google Drive API 錯誤：{text}"
    return text


def _drive_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _drive_folder_query(name: str, parent_id: str | None) -> str:
    parent_clause = f"'{_drive_quote(parent_id)}' in parents" if parent_id else "'root' in parents"
    return (
        f"name='{_drive_quote(name)}' and "
        "mimeType='application/vnd.google-apps.folder' and "
        f"{parent_clause} and trashed=false"
    )


def _ensure_drive_folder(service, name: str, parent_id: str | None) -> str:
    files_api = service.files()
    result = files_api.list(
        q=_drive_folder_query(name, parent_id),
        fields="files(id,name)",
        spaces="drive",
    ).execute()
    matches = result.get("files", [])
    if matches:
        return matches[0]["id"]
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    created = files_api.create(body=body, fields="id").execute()
    return created["id"]


def _drive_file_names(service, parent_id: str) -> set[str]:
    result = service.files().list(
        q=f"'{_drive_quote(parent_id)}' in parents and trashed=false",
        fields="files(name)",
        spaces="drive",
    ).execute()
    return {item["name"] for item in result.get("files", []) if item.get("name")}


_UPLOAD_EXTS = (".mp3", ".mp4")


def _local_media_files(directory: pathlib.Path) -> list[pathlib.Path]:
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in _UPLOAD_EXTS)


def _media_mimetype(path: pathlib.Path) -> str:
    return "video/mp4" if path.suffix.lower() == ".mp4" else "audio/mpeg"


def run_drive_upload_batch(task_id: str, directory: pathlib.Path, service, root_folder: str, concurrency: int = 1):
    state = drive_upload_progress.setdefault(task_id, {
        "status": "running",
        "directory": str(directory),
        "items": {
            p.name: {"filename": p.name, "status": "pending", "error": None}
            for p in _local_media_files(directory)
        },
    })

    def upload_one(file_path: pathlib.Path, leaf_id: str, existing: set[str]) -> None:
        item = state["items"][file_path.name]
        if file_path.name in existing:
            item["status"] = "skipped"
            return
        item["status"] = "uploading"
        try:
            svc = _build_drive_service()
            media = MediaFileUpload(str(file_path), mimetype=_media_mimetype(file_path), resumable=False)
            svc.files().create(
                body={"name": file_path.name, "parents": [leaf_id]},
                media_body=media,
                fields="id",
            ).execute()
            item["status"] = "done"
        except Exception as e:
            item["status"] = "error"
            item["error"] = _drive_error_detail(e)

    try:
        root_id = _ensure_drive_folder(service, root_folder, None)
        leaf_id = _ensure_drive_folder(service, directory.name, root_id)
        existing = _drive_file_names(service, leaf_id)
        files = _local_media_files(directory)
        if concurrency <= 1 or len(files) <= 1:
            for file_path in files:
                upload_one(file_path, leaf_id, existing)
        else:
            async def _coordinate() -> None:
                sem = asyncio.Semaphore(concurrency)

                async def _one(file_path: pathlib.Path) -> None:
                    async with sem:
                        await asyncio.to_thread(upload_one, file_path, leaf_id, existing)

                await asyncio.gather(*(_one(file_path) for file_path in files))

            asyncio.run(_coordinate())
        state["status"] = "done"
    except Exception as e:
        detail = _drive_error_detail(e)
        state["status"] = "done"
        state["error"] = detail
        for item in state["items"].values():
            if item["status"] in ("pending", "uploading"):
                item["status"] = "error"
                item["error"] = detail


def _resolve_upload_directory(directory: str, output_path: str) -> pathlib.Path:
    base = pathlib.Path(output_path).resolve()
    target = pathlib.Path(directory).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="directory must be under output_path")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="directory does not exist")
    return target


def _build_drive_service():
    creds = require_drive_credentials()
    return build("drive", "v3", credentials=creds)


@app.post("/drive/upload")
async def drive_upload_start(body: DriveUploadRequest):
    settings = load_settings()
    directory = _resolve_upload_directory(body.directory, settings["output_path"])
    files = _local_media_files(directory)
    import uuid
    task_id = str(uuid.uuid4())
    drive_upload_progress[task_id] = {
        "status": "running",
        "directory": str(directory),
        "items": {p.name: {"filename": p.name, "status": "pending", "error": None} for p in files},
    }
    service = _build_drive_service()
    root_folder = settings.get("drive_root_folder", "YT-MP3") or "YT-MP3"
    concurrency = _resolve_drive_upload_concurrency(settings)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_drive_upload_batch, task_id, directory, service, root_folder, concurrency)
    return {"task_id": task_id}


@app.get("/drive/upload/progress/{task_id}")
async def drive_upload_progress_sse(task_id: str):
    async def event_stream() -> AsyncGenerator[str, None]:
        while True:
            state = drive_upload_progress.get(task_id)
            if state is None:
                yield f"data: {json.dumps({'error': 'task not found'})}\n\n"
                break
            yield f"data: {json.dumps(state)}\n\n"
            if state.get("status") == "done":
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _list_work_folders(settings: dict) -> list[pathlib.Path]:
    """列 output_path 下的日期子資料夾，依名稱倒序。純 filesystem，不碰 Drive。"""
    output = pathlib.Path(settings["output_path"]).resolve()
    if not output.is_dir():
        return []
    return sorted((p for p in output.iterdir() if p.is_dir()), key=lambda p: p.name, reverse=True)


def _collect_upload_folders(settings: dict) -> list[dict]:
    """列 output_path 下各批資料夾並標記是否已全數上傳。含 Drive 同步 I/O，須在 executor 跑。"""
    work_folders = _list_work_folders(settings)
    if not work_folders:
        return []
    service = _build_drive_service()
    root_folder = settings.get("drive_root_folder", "YT-MP3") or "YT-MP3"
    root_id = _ensure_drive_folder(service, root_folder, None)
    folders = []
    for folder in work_folders:
        local_names = {p.name for p in _local_media_files(folder)}
        uploaded = False
        if local_names:
            result = service.files().list(
                q=_drive_folder_query(folder.name, root_id),
                fields="files(id,name)",
                spaces="drive",
            ).execute()
            matches = result.get("files", [])
            if matches:
                remote_names = _drive_file_names(service, matches[0]["id"])
                uploaded = local_names.issubset(remote_names)
        folders.append({"name": folder.name, "directory": str(folder), "uploaded": uploaded})
    return folders


@app.get("/folders")
def list_folders():
    """列 output_path 下的工作資料夾（日期子資料夾）。純 filesystem，不需 Drive 授權。"""
    settings = load_settings()
    folders = [{"name": p.name, "directory": str(p)} for p in _list_work_folders(settings)]
    return {"folders": folders}


@app.get("/drive/upload/folders")
async def drive_upload_folders():
    settings = load_settings()
    loop = asyncio.get_event_loop()
    try:
        folders = await loop.run_in_executor(None, _collect_upload_folders, settings)
    except HttpError as e:
        raise HTTPException(status_code=502, detail=_drive_error_detail(e))
    return {"folders": folders}


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
