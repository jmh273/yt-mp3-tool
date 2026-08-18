"""受管 yt-dlp 的載入策略：使用者資料夾中的版本優先、發行版內建版本為保底。

yt-dlp 依賴 YouTube 的內部實作，上游高頻發版；而本程式以 PyInstaller 打包，內建的
yt_dlp 被凍進 exe 無法用 pip 更新。此模組讓使用者能在不等新發行版的情況下自行更新。

關鍵限制：PyInstaller 的 FrozenImporter 位於 sys.meta_path 且優先於 sys.path，
因此單純 sys.path.insert 無法覆蓋內建版本——必須在 meta_path 最前端插入 finder。

安全性：受管版本一旦無法載入即自動退回內建版本，一次壞掉的更新不會讓程式無法下載。
"""
from __future__ import annotations

import importlib
import importlib.abc
import importlib.machinery
import importlib.util
import pathlib
import shutil
import sys

# 受管套件根目錄。與 settings.json / tokens 同層，回退等同刪除此目錄。
MANAGED_ROOT = pathlib.Path.home() / ".yt-mp3-tool" / "lib"

# yt-dlp 與其 EJS solver 有版本相依，必須成組管理
MANAGED_PACKAGES = ("yt_dlp", "yt_dlp_ejs")

_active_source = "bundled"


class _ManagedFinder(importlib.abc.MetaPathFinder):
    """只攔截 MANAGED_PACKAGES，其餘一律讓給既有的 import 機制。"""

    def __init__(self, root: pathlib.Path):
        self._root = str(root)

    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".")[0] not in MANAGED_PACKAGES:
            return None
        if path is None:
            # 頂層套件：從受管根目錄解析
            return importlib.machinery.PathFinder.find_spec(fullname, [self._root])
        # 子模組：父套件的 __path__ 已指向受管目錄，沿用即可
        return importlib.machinery.PathFinder.find_spec(fullname, path)


def managed_version() -> str | None:
    """回傳受管 yt_dlp 的版本；沒有受管版本或讀不到回 None。"""
    vfile = MANAGED_ROOT / "yt_dlp" / "version.py"
    if not vfile.is_file():
        return None
    try:
        for line in vfile.read_text(encoding="utf-8").splitlines():
            if line.startswith("__version__"):
                return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        return None
    return None


def active_source() -> str:
    """'managed' 或 'bundled'——目前生效的是哪一份。"""
    return _active_source


def activate_managed_ytdlp() -> str:
    """在 import yt_dlp 之前呼叫。回傳實際生效的來源。

    受管版本不存在、損毀或無法載入時，靜默退回內建版本並記錄原因。
    """
    global _active_source

    if "yt_dlp" in sys.modules:
        # 已經被載入，改不了了——回報現況而非假裝成功
        return _active_source

    if not (MANAGED_ROOT / "yt_dlp").is_dir():
        _active_source = "bundled"
        return _active_source

    finder = _ManagedFinder(MANAGED_ROOT)
    sys.meta_path.insert(0, finder)
    try:
        mod = importlib.import_module("yt_dlp")
        # 確認真的載到受管版本，而不是被別的 finder 搶先
        origin = getattr(mod, "__file__", "") or ""
        if str(MANAGED_ROOT) not in origin:
            raise ImportError(f"managed yt_dlp not in effect (loaded from {origin})")
        _active_source = "managed"
        print(f"[yt-dlp] 使用受管版本 {managed_version()} ({MANAGED_ROOT})", flush=True)
    except Exception as e:
        # 退回內建版本：移除 finder 並清掉半載入的模組
        sys.meta_path.remove(finder)
        for name in list(sys.modules):
            if name.split(".")[0] in MANAGED_PACKAGES:
                del sys.modules[name]
        _active_source = "bundled"
        print(f"[yt-dlp] 受管版本無法載入（{e}），已退回內建版本", flush=True)
    return _active_source


def revert_to_bundled() -> None:
    """移除受管版本。下次啟動即以內建版本生效。"""
    if MANAGED_ROOT.is_dir():
        shutil.rmtree(MANAGED_ROOT, ignore_errors=True)


# ── 上游版本查詢與安裝 ────────────────────────────────────────────────────────
# 刻意不依賴 pip：打包後的 exe 沒有 pip，也不該在使用者機器上跑 pip。
# yt-dlp 與 yt-dlp-ejs 都是純 Python 的 py3-none-any wheel（本質是 zip），
# 直接解壓即可使用。

_PYPI_JSON = "https://pypi.org/pypi/{name}/json"
_DIST_NAMES = {"yt_dlp": "yt-dlp", "yt_dlp_ejs": "yt-dlp-ejs"}


def _fetch_json(url: str, timeout: float = 15.0) -> dict:
    import json
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "yt-mp3-tool"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _wheel_url(info: dict) -> tuple[str, str]:
    """從 PyPI JSON 取出 (版本, py3-none-any wheel 網址)。"""
    version = info["info"]["version"]
    for f in info.get("urls", []):
        if f.get("packagetype") == "bdist_wheel" and f.get("filename", "").endswith(
            "-py3-none-any.whl"
        ):
            return version, f["url"]
    raise LookupError("找不到 py3-none-any wheel")


def latest_versions() -> dict[str, str]:
    """查詢上游最新版。連不上時由呼叫端處理例外（優雅降級為維持現況）。"""
    out = {}
    for pkg, dist in _DIST_NAMES.items():
        out[pkg] = _wheel_url(_fetch_json(_PYPI_JSON.format(name=dist)))[0]
    return out


def install_managed() -> dict[str, str]:
    """下載並安裝最新的 yt-dlp + yt-dlp-ejs 到受管目錄。

    兩者成組安裝——版本相依，不允許只更新其中之一。
    先解壓到暫存目錄驗證結構完整，確認後才換掉現有的受管目錄，
    避免下載中斷留下半套無法載入的安裝。
    """
    import io
    import tempfile
    import urllib.request
    import zipfile

    staging = pathlib.Path(tempfile.mkdtemp(prefix="ytdlp_stage_"))
    installed: dict[str, str] = {}
    try:
        for pkg, dist in _DIST_NAMES.items():
            version, url = _wheel_url(_fetch_json(_PYPI_JSON.format(name=dist)))
            req = urllib.request.Request(url, headers={"User-Agent": "yt-mp3-tool"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                z.extractall(staging)
            installed[pkg] = version

        # 驗證結構：缺任一項就視為失敗，不要換掉可用的舊版本
        for pkg in MANAGED_PACKAGES:
            if not (staging / pkg / "__init__.py").is_file():
                raise RuntimeError(f"安裝結果缺少 {pkg}/__init__.py")
        if not (staging / "yt_dlp" / "version.py").is_file():
            raise RuntimeError("安裝結果缺少 yt_dlp/version.py")

        MANAGED_ROOT.parent.mkdir(parents=True, exist_ok=True)
        if MANAGED_ROOT.is_dir():
            shutil.rmtree(MANAGED_ROOT, ignore_errors=True)
        shutil.move(str(staging), str(MANAGED_ROOT))
        staging = None  # 已移走
        return installed
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)
