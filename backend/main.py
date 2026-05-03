import asyncio
import json
import os
import pathlib
import shutil
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiohttp
import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from pydantic import BaseModel

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
CONFIG_DIR = pathlib.Path.home() / ".yt-mp3-tool"
TOKEN_FILE = CONFIG_DIR / "token.json"
SETTINGS_FILE = CONFIG_DIR / "settings.json"
CLIENT_SECRET_FILE = pathlib.Path(__file__).parent / "client_secret.json"

SCOPES = ["https://www.googleapis.com/auth/youtube"]
REDIRECT_URI = "http://localhost:8000/auth/callback"

DEFAULT_SETTINGS = {
    "output_path": str(pathlib.Path.home() / "Music" / "YT-MP3"),
    "videos_per_channel": 5,
    "latest_hours": 24,
    "min_duration_minutes": 3,
    "max_duration_minutes": 60,
    "normalize_target_db": 89.0,
}

MP3GAIN_TOLERANCE_DB = 0.75
MP3GAIN_REFERENCE_DB = 89.0  # mp3gain default target = ReplayGain reference

CONFIG_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
    yield


app = FastAPI(title="YT-MP3 Tool", lifespan=lifespan)
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

def enhance_and_filter_videos(youtube, videos: list[dict]) -> list[dict]:
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
            
            for item in resp.get("items", []):
                vid = item["id"]
                if item.get("snippet", {}).get("liveBroadcastContent") == "upcoming":
                    continue
                duration_iso = item.get("contentDetails", {}).get("duration", "")
                dur_sec = parse_iso_duration(duration_iso)
                
                settings = load_settings()
                min_sec = settings.get("min_duration_minutes", 3) * 60
                max_sec = settings.get("max_duration_minutes", 60) * 60
                
                if min_sec <= dur_sec <= max_sec:
                    v_dict[vid]["duration_seconds"] = dur_sec
                    valid_videos.append(v_dict[vid])
        except Exception as e:
            print(f"[YouTube API Error] {e}")
            for vid in batch_ids:
                valid_videos.append(v_dict[vid])
                
    return [v for v in videos if v in valid_videos]

def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text())}
    return DEFAULT_SETTINGS.copy()


def save_settings(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def load_credentials() -> Credentials | None:
    if not TOKEN_FILE.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        TOKEN_FILE.write_text(creds.to_json())
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
    return {"logged_in": creds is not None}


@app.get("/auth/login")
def auth_login():
    """
    使用 InstalledAppFlow.run_local_server() 在背景執行授權流程。
    Google 建議 Desktop App 使用此方式，自動管理 localhost redirect URI。
    """
    if not CLIENT_SECRET_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail="找不到 client_secret.json，請先從 GCP 下載並放至 backend/ 資料夾",
        )

    def _do_oauth():
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CLIENT_SECRET_FILE), scopes=SCOPES
        )
        # run_local_server 自動啟動本機 HTTP server、開啟瀏覽器、等待 callback
        creds = flow.run_local_server(
            port=0,           # 讓系統自動選可用 port
            open_browser=True,
            prompt="consent",
            access_type="offline",
        )
        TOKEN_FILE.write_text(creds.to_json())

    import threading
    t = threading.Thread(target=_do_oauth, daemon=True)
    t.start()
    return {"message": "已開啟瀏覽器，請完成授權，授權完成後重新整理頁面"}


@app.get("/auth/callback")
def auth_callback():
    return {"message": "callback received"}


@app.post("/auth/logout")
def auth_logout():
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    return {"message": "已登出"}


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
        for item in resp.get("items", []):
            channels.append(item["snippet"]["resourceId"]["channelId"])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    dates = {}
    async with aiohttp.ClientSession() as session:
        sem = asyncio.Semaphore(10)
        async def _fetch(cid):
            async with sem:
                _, vlist = await fetch_channel_rss(session, cid, 1)
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


_RSS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
}


async def fetch_channel_rss(
    session: aiohttp.ClientSession,
    channel_id: str,
    limit: int,
    channel_title: str = "",
):
    import xml.etree.ElementTree as ET
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15),
                               headers=_RSS_HEADERS) as r:
            if r.status != 200:
                print(f"[RSS Error] {url} HTTP {r.status}")
                return channel_id, []
            text = await r.text()
    except Exception as e:
        print(f"[RSS Error] Request failed {url}: {e}")
        return channel_id, []

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return channel_id, []

    videos = []
    for entry in root.findall("atom:entry", ns)[:limit]:
        video_id = entry.findtext("yt:videoId", namespaces=ns) or ""
        title = entry.findtext("atom:title", namespaces=ns) or ""
        published = entry.findtext("atom:published", namespaces=ns) or ""
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
        media_content = entry.find(".//media:content", ns)
        duration_seconds: int | None = None
        if media_content is not None:
            raw = media_content.get("duration")
            if raw is not None:
                try:
                    duration_seconds = int(raw)
                except ValueError:
                    pass
        videos.append(
            {
                "video_id": video_id,
                "title": title,
                "published": published,
                "thumbnail": thumbnail,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "duration_seconds": duration_seconds,
                "channel_id": channel_id,
                "channel_title": channel_title,
            }
        )
    return channel_id, videos


@app.get("/subscriptions/{channel_id}/videos")
async def get_channel_videos(channel_id: str):
    settings = load_settings()
    limit = settings["videos_per_channel"]
    async with aiohttp.ClientSession() as session:
        _, videos = await fetch_channel_rss(session, channel_id, limit)
        
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    videos = enhance_and_filter_videos(youtube, videos)
    
    return {"videos": videos}


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
        for item in resp.get("items", []):
            sn = item["snippet"]
            channels.append({
                "channel_id": sn["resourceId"]["channelId"],
                "title": sn["title"],
            })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    # 並發擷取 RSS
    limit = settings.get("videos_per_channel", 5)
    async with aiohttp.ClientSession() as session:
        sem = asyncio.Semaphore(5)

        async def _bound_fetch(ch):
            async with sem:
                return await fetch_channel_rss(session, ch["channel_id"], limit, ch["title"])

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


# ── 下載路由 ───────────────────────────────────────────────────────────────────
class DownloadRequest(BaseModel):
    videos: list[dict]  # [{video_id, title, url}]


def run_download(videos: list[dict], output_path: str, task_id: str):
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
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_path, f"{safe_title}.%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "progress_hooks": [make_hook(vid)],
            "quiet": True,
            "no_warnings": True,
        }
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

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_download, body.videos, final_output_path, task_id)

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
