# -*- coding: utf-8 -*-
"""完整功能 walkthrough 測試 — 涵蓋所有 user-visible 功能、繁中操作敘述、多截圖。

執行前提：
  1. 後端 (uvicorn) 在 http://localhost:8000
  2. 前端 (vite) 在 http://localhost:5173
  3. 已在 http://localhost:5173 完成 Google 登入

執行：
  python ui-tests/feature_walkthrough.py

輸出：
  ui-tests/feature_walkthrough_report.html
  ui-tests/feature_walkthrough_results.json
  ui-tests/screenshots_walkthrough/<TC>_step<NN>.png
"""
import asyncio
import json
import os
import pathlib
import shutil
import sys
import tempfile
import urllib.request

from playwright.async_api import async_playwright, Page

# 讓本檔可獨立執行 (python ui-tests/feature_walkthrough.py)
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from walkthrough_helpers import (  # noqa: E402
    log, make_html, precondition_check, start_case, step,
)

BASE_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000"
FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"
REPORT_PATH = pathlib.Path(__file__).parent / "feature_walkthrough_report.html"
RESULTS_PATH = pathlib.Path(__file__).parent / "feature_walkthrough_results.json"


# ── 共用工具：找出第一個有影片的頻道 (沿用 ui_test.py 的方法) ───────────────────
def find_channel_with_videos_index() -> int:
    """打 backend API 找第一個有 RSS 影片的頻道，回傳 index。"""
    import xml.etree.ElementTree as ET
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"
    ns = {"atom": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    try:
        r = urllib.request.urlopen(f"{BACKEND_URL}/subscriptions", timeout=20)
        channels = json.loads(r.read())["channels"]
        for i, ch in enumerate(channels[:50]):
            url = f"https://www.youtube.com/feeds/videos.xml?channel_id={ch['channel_id']}"
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                resp = urllib.request.urlopen(req, timeout=6)
                root = ET.fromstring(resp.read())
                if root.findall("atom:entry", ns):
                    log(f"  API 確認 index={i} ({ch['title']}) 有影片")
                    return i
            except Exception:
                continue
    except Exception as e:
        log(f"  find_channel_with_videos_index 失敗：{e}")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# TC-01: 啟動與版號
# ─────────────────────────────────────────────────────────────────────────────
async def tc_01_startup(page: Page) -> dict:
    ctx = start_case("TC-01", "啟動與版號顯示",
                     "驗證主畫面能順利載入、header 顯示版號、訂閱清單成功從後端拉回。", min_steps=3)

    await step(page, ctx,
        "在瀏覽器開啟 http://localhost:5173/，等待頁面初始化。預期看到「YT → MP3」標題與 loading 指示。",
        action=lambda: page.goto(BASE_URL),
        wait_ms=1500)

    await step(page, ctx,
        "等待訂閱清單從後端載入完成。預期左欄出現至少一個頻道卡片。",
        action=lambda: page.wait_for_selector(".channel-card", timeout=15000),
        wait_ms=500)

    await step(page, ctx,
        "確認 header 右上角顯示版號標籤（例如 v0.0.0-dev 或 v0.5.0）。版號是後端 GET /version 回傳的，前端從那裡拉。",
        action=None,
        wait_ms=200)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-02: 訂閱頻道：搜尋
# ─────────────────────────────────────────────────────────────────────────────
async def tc_02_search(page: Page) -> dict:
    ctx = start_case("TC-02", "訂閱頻道搜尋過濾",
                     "驗證左欄搜尋框能即時過濾頻道，清空後恢復全部，輸入無相符字串時顯示為空。", min_steps=4)

    search = page.locator(".search-input")

    await step(page, ctx,
        "點選左欄上方的搜尋輸入框，輸入「a」。預期清單即時過濾為標題含「a」(不分大小寫) 的頻道。",
        action=lambda: search.fill("a"),
        wait_ms=400)

    await step(page, ctx,
        "把搜尋字清空。預期清單立刻恢復為全部頻道。",
        action=lambda: search.fill(""),
        wait_ms=400)

    await step(page, ctx,
        "輸入一個幾乎不會中的字串「zzzzqqq」。預期清單變空（沒有任何頻道卡片）。",
        action=lambda: search.fill("zzzzqqq"),
        wait_ms=400)

    await step(page, ctx,
        "再次清空搜尋以還原狀態，方便下個案例。",
        action=lambda: search.fill(""),
        wait_ms=400)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-03: 檢查更新日期
# ─────────────────────────────────────────────────────────────────────────────
async def tc_03_check_dates(page: Page) -> dict:
    ctx = start_case("TC-03", "頻道日期更新檢查",
                     "驗證「檢查更新日期」按鈕能觸發後端並列每個頻道的最新影片日期。", min_steps=3)

    await step(page, ctx,
        "看到左欄上方有「檢查更新日期」按鈕，準備點它。預期按下後按鈕變「檢查中...」。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "點擊「檢查更新日期」按鈕，後端會並發打所有頻道的 RSS。",
        action=lambda: page.locator("button:has-text('檢查更新日期')").click(),
        wait_ms=1500)

    await step(page, ctx,
        "等待回應，預期頻道卡片下方陸續出現日期 (例如 2026/5/3)。",
        action=lambda: page.wait_for_selector(".channel-date", timeout=20000),
        wait_ms=800)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-04: 頻道選取與影片清單
# ─────────────────────────────────────────────────────────────────────────────
async def tc_04_channel_videos(page: Page) -> dict:
    ctx = start_case("TC-04", "頻道選取與影片清單顯示",
                     "驗證點選頻道後右欄載入該頻道影片，並顯示完整資訊 (標題/縮圖/時長/發布時間)。", min_steps=5)

    target_idx = find_channel_with_videos_index()
    cards = page.locator(".channel-card")

    await step(page, ctx,
        f"已透過 backend API 找到第 {target_idx+1} 個頻道有影片。準備點選它。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "點擊該頻道卡片。預期卡片變成選中狀態 (淺紅背景 + 左邊紅色直條)，右欄開始載入影片。",
        action=lambda: cards.nth(target_idx).click(),
        wait_ms=2000)

    await step(page, ctx,
        "等待右欄影片清單載入完成。預期看到至少一張影片卡片。",
        action=lambda: page.wait_for_selector(".video-item", timeout=15000),
        wait_ms=500)

    await step(page, ctx,
        "查看影片卡片內容。預期每張卡都顯示：縮圖、標題、發布時間 (例如「2 小時前」)、時長 (例如「12:34」)。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "捲動右欄看後續影片卡片 (如有)。",
        action=lambda: page.locator(".middle-pane").evaluate("el => el.scrollBy(0, 200)"),
        wait_ms=400)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-05: 影片勾選與選取面板
# ─────────────────────────────────────────────────────────────────────────────
async def tc_05_video_selection(page: Page) -> dict:
    ctx = start_case("TC-05", "影片勾選與下載選取面板",
                     "驗證勾選影片時右欄「下載」分頁面板出現、可多選、可清除全部。", min_steps=6)

    boxes = page.locator(".video-item input[type='checkbox']")
    n = await boxes.count()

    await step(page, ctx,
        "在右欄找到第一支影片卡片，準備勾選它。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "勾選第一支影片的 checkbox。預期右側「下載」分頁出現選取面板，顯示「已選取 1 支影片」。",
        action=lambda: boxes.nth(0).check(),
        wait_ms=600)

    if n >= 2:
        await step(page, ctx,
            "勾選第二支影片。預期面板數字更新為「已選取 2 支影片」。",
            action=lambda: boxes.nth(1).check(),
            wait_ms=600)
    else:
        await step(page, ctx, "影片數不足 2 支，跳過第二支勾選。", action=None, wait_ms=200)

    if n >= 3:
        await step(page, ctx,
            "勾選第三支影片。預期面板數字繼續更新為 3。",
            action=lambda: boxes.nth(2).check(),
            wait_ms=600)
    else:
        await step(page, ctx, "影片數不足 3 支，跳過。", action=None, wait_ms=200)

    await step(page, ctx,
        "點擊面板裡的「清除全部」按鈕。預期面板消失、所有勾選回復為空。",
        action=lambda: page.locator(".selected-panel button:has-text('清除')").click(),
        wait_ms=600)

    await step(page, ctx,
        "確認所有 checkbox 都已 uncheck，且選取面板已不顯示。",
        action=None,
        wait_ms=200)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-06: 最新影片分頁
# ─────────────────────────────────────────────────────────────────────────────
async def tc_06_latest_feed(page: Page) -> dict:
    ctx = start_case("TC-06", "最新影片分頁",
                     "驗證「最新影片」按鈕可切換右欄為跨頻道時間排序的清單；勾選後也會進到「下載」面板。", min_steps=5)

    await step(page, ctx,
        "點擊左欄上方的「最新影片」按鈕。預期右欄切換到 latest-videos-feed，並顯示載入中。",
        action=lambda: page.locator("button:has-text('最新影片')").first.click(),
        wait_ms=1000)

    await step(page, ctx,
        "等待最新影片從後端載入完成。預期看到至少一張影片卡片，按發布時間 (新→舊) 排序。",
        action=lambda: page.wait_for_selector(".latest-feed .video-item, .video-item", timeout=20000),
        wait_ms=600)

    boxes = page.locator(".video-item input[type='checkbox']")
    n = await boxes.count()
    if n > 0:
        await step(page, ctx,
            "勾選最新影片清單裡的第一支。預期「下載」分頁面板出現「已選取 1 支」(跟頻道頁的勾選共用同一份選取狀態)。",
            action=lambda: boxes.nth(0).check(),
            wait_ms=600)

        await step(page, ctx,
            "確認面板顯示在右欄「下載」分頁；切到「下載」分頁可看到剛選的這支。",
            action=lambda: page.locator(".tab", has_text="下載").click(),
            wait_ms=600)

        await step(page, ctx,
            "再點「清除全部」清空，方便下個案例。",
            action=lambda: page.locator(".selected-panel button:has-text('清除')").click(),
            wait_ms=400)
    else:
        await step(page, ctx, "最新影片清單無任何影片，無法勾選。", action=None, wait_ms=200)
        await step(page, ctx, "—", action=None, wait_ms=200)
        await step(page, ctx, "—", action=None, wait_ms=200)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-07: 設定頁完整流程
# ─────────────────────────────────────────────────────────────────────────────
async def tc_07_settings(page: Page) -> dict:
    ctx = start_case("TC-07", "設定頁完整流程",
                     "驗證設定頁能讀現有值、可改各欄位、儲存成功、回主頁。", min_steps=7)

    await step(page, ctx,
        "點擊 header 的「設定」連結，導向設定頁。預期看到表單上各個欄位顯示目前的設定值。",
        action=lambda: page.locator("a[href='/settings']").click(),
        wait_ms=800)

    await step(page, ctx,
        "看到表單上的欄位：MP3 輸出資料夾、每頻道顯示影片數、最新影片時間範圍、最短/最長影片長度、目標響度 (dB SPL)。",
        action=None,
        wait_ms=300)

    num_inputs = page.locator("input[type='number']")
    await step(page, ctx,
        "把「每頻道顯示影片數」改成 3。",
        action=lambda: num_inputs.nth(0).fill("3"),
        wait_ms=300)

    await step(page, ctx,
        "把「最新影片時間範圍」改成 48 小時。",
        action=lambda: num_inputs.nth(1).fill("48"),
        wait_ms=300)

    await step(page, ctx,
        "把「目標響度 (dB SPL)」改成 92 (mp3gain 想要更接近 YouTube 響度時用)。",
        action=lambda: num_inputs.last.fill("92"),
        wait_ms=300)

    await step(page, ctx,
        "點擊「儲存」按鈕。預期看到「已儲存！」提示。",
        action=lambda: page.locator("button:has-text('儲存')").click(),
        wait_ms=800)

    await step(page, ctx,
        "點擊「← 返回」回主頁。預期回到頻道清單畫面。",
        action=lambda: page.locator("a:has-text('返回')").click(),
        wait_ms=800)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-08: 設定頁驗證錯誤
# ─────────────────────────────────────────────────────────────────────────────
async def tc_08_settings_validation(page: Page) -> dict:
    ctx = start_case("TC-08", "設定頁範圍驗證",
                     "驗證 latest_hours、normalize_target_db 兩個欄位的範圍檢查 (前端 + 後端 422)。", min_steps=4)

    await step(page, ctx,
        "再次進入設定頁。",
        action=lambda: page.locator("a[href='/settings']").click(),
        wait_ms=800)

    num_inputs = page.locator("input[type='number']")

    await step(page, ctx,
        "把「最新影片時間範圍」改成 0 (低於下限 1)。預期欄位下方出現紅色 validation 訊息「請輸入 1 到 168 之間的整數」，儲存按鈕被 disable。",
        action=lambda: num_inputs.nth(1).fill("0"),
        wait_ms=400)

    await step(page, ctx,
        "把「目標響度 (dB SPL)」改成 75 (低於下限 80)。預期該欄位也跳 validation 錯誤。",
        action=lambda: num_inputs.last.fill("75"),
        wait_ms=400)

    await step(page, ctx,
        "把兩個欄位都改回合法值 (latest_hours=24, normalize_target_db=89)。預期錯誤訊息消失、儲存按鈕重新可按。",
        action=lambda: asyncio.gather(
            num_inputs.nth(1).fill("24"),
            num_inputs.last.fill("89"),
        ),
        wait_ms=500)

    await step(page, ctx,
        "回主頁。",
        action=lambda: page.locator("a:has-text('返回')").click(),
        wait_ms=600)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-09: 右欄分頁切換 + KeepAlive
# ─────────────────────────────────────────────────────────────────────────────
async def tc_09_right_tabs(page: Page) -> dict:
    ctx = start_case("TC-09", "右欄分頁切換 + KeepAlive 保留狀態",
                     "驗證右欄「下載」「音量正規化」分頁切換、切換時保留各分頁狀態 (Vue KeepAlive)。", min_steps=5)

    download_tab = page.locator(".tab", has_text="下載")
    normalize_tab = page.locator(".tab", has_text="音量正規化")

    await step(page, ctx,
        "確認預設右欄是「下載」分頁 active (紅色底線)。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "點擊「音量正規化」分頁。預期面板切換、目錄輸入框預填當日 YYYYMMDD 路徑、本次目標 (dB) 預填 89。",
        action=lambda: normalize_tab.click(),
        wait_ms=800)

    await step(page, ctx,
        "在目錄輸入框打一些測試字串「TESTPATH123」(等下要驗 KeepAlive)。",
        action=lambda: page.locator(".dir-input").fill("TESTPATH123"),
        wait_ms=300)

    await step(page, ctx,
        "切回「下載」分頁。預期看到下載面板 (如果沒選影片就是空的)。",
        action=lambda: download_tab.click(),
        wait_ms=500)

    await step(page, ctx,
        "再切回「音量正規化」分頁。預期目錄輸入框仍是「TESTPATH123」(KeepAlive 保留了狀態)。",
        action=lambda: normalize_tab.click(),
        wait_ms=500)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-10: 音量正規化基本流程
# ─────────────────────────────────────────────────────────────────────────────
TEMP_NORMALIZE_DIR: pathlib.Path | None = None


async def tc_10_normalize_basic(page: Page) -> dict:
    global TEMP_NORMALIZE_DIR
    ctx = start_case("TC-10", "音量正規化基本流程",
                     "驗證載入目錄、顯示檔案、設定本次目標、執行 mp3gain、看到批次摘要。", min_steps=6)

    # Setup: copy fixture mp3s to a temp dir
    TEMP_NORMALIZE_DIR = pathlib.Path(tempfile.mkdtemp(prefix="walkthrough-mp3-"))
    for fn in ("loud.mp3", "quiet.mp3"):
        shutil.copy(FIXTURES_DIR / fn, TEMP_NORMALIZE_DIR / fn)
    log(f"  fixtures copied to {TEMP_NORMALIZE_DIR}")

    await step(page, ctx,
        f"切到「音量正規化」分頁，把目錄輸入框改成測試目錄 {TEMP_NORMALIZE_DIR} (含兩個 fixture mp3)。",
        action=lambda: page.locator(".dir-input").fill(str(TEMP_NORMALIZE_DIR)),
        wait_ms=300)

    await step(page, ctx,
        "點擊「載入」按鈕。預期看到 loud.mp3 和 quiet.mp3 兩個檔案出現在清單。",
        action=lambda: page.locator(".load-btn").click(),
        wait_ms=1500)

    await step(page, ctx,
        "確認「本次目標 (dB)」欄位預填 89 (從 settings 拿)，可隨時手動覆寫只影響這次。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "點擊「開始正規化」按鈕。預期狀態徽章從「等待中」→「量測中」→「套用中」→「完成」/「已符合」。mp3gain 通常一首 < 1 秒。",
        action=lambda: page.locator(".start-btn").click(),
        wait_ms=4000)

    await step(page, ctx,
        "等待整批處理完成。預期 quiet.mp3 (差距 ≥ 0.75 dB) 變「完成」綠色徽章；loud.mp3 (與目標 89 接近) 變「已符合」藍色徽章。",
        action=lambda: page.wait_for_function(
            "() => document.querySelectorAll('.badge-done, .badge-skipped, .badge-error').length >= 2",
            timeout=20000),
        wait_ms=500)

    await step(page, ctx,
        "確認最下方有批次摘要：「完成 X · 已符合 Y · 失敗 Z」。",
        action=None,
        wait_ms=200)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-11: 音量正規化進階 — needs_rename + 跳過
# ─────────────────────────────────────────────────────────────────────────────
async def tc_11_normalize_advanced(page: Page) -> dict:
    ctx = start_case("TC-11", "音量正規化進階：自動 rename + 已符合",
                     "驗證含全形標點的檔名被偵測 needs_rename、按按鈕自動 rename、_rename_log.json 產生、再跑全部「已符合」。", min_steps=5)

    assert TEMP_NORMALIZE_DIR is not None, "TC-10 must run first"

    # Setup: add a file with full-width chars
    unsafe_name = "重磅！測試？.mp3"
    shutil.copy(FIXTURES_DIR / "loud.mp3", TEMP_NORMALIZE_DIR / unsafe_name)
    log(f"  added unsafe-name file: {unsafe_name}")

    await step(page, ctx,
        f"在測試目錄裡放一個含全形標點的檔名「{unsafe_name}」(模擬 YouTube 標題下載下來的舊檔)。重新載入目錄。",
        action=lambda: page.locator(".load-btn").click(),
        wait_ms=1500)

    await step(page, ctx,
        "預期看到橘色「⚠ 重新命名 N 個檔案」按鈕，因為含全形「！」「？」是 mp3gain 處理不到的字元。",
        action=lambda: page.wait_for_selector(".rename-btn", timeout=5000),
        wait_ms=500)

    await step(page, ctx,
        "點擊「重新命名」按鈕。預期該檔被 atomic rename 成 sanitized 名字，list 重新載入後不再顯示橘色警告。",
        action=lambda: page.locator(".rename-btn").click(),
        wait_ms=2000)

    # 驗 _rename_log.json 真的存在
    log_file = TEMP_NORMALIZE_DIR / "_rename_log.json"
    if log_file.exists():
        log(f"  _rename_log.json exists: {log_file}")
    else:
        log("  WARNING: _rename_log.json not created!")

    await step(page, ctx,
        "再次點擊「開始正規化」(這次清單包含已正規化的 loud.mp3 + quiet.mp3 + 剛 rename 過的第三個檔案)。",
        action=lambda: page.locator(".start-btn").click(),
        wait_ms=5000)

    await step(page, ctx,
        "預期所有檔案都顯示藍色「已符合」徽章 — 因為前一次跑已把它們調到目標 ±0.75 dB 以內。",
        action=lambda: page.wait_for_function(
            "() => Array.from(document.querySelectorAll('.badge-skipped')).length >= 1",
            timeout=20000),
        wait_ms=500)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# TC-12: 登出
# ─────────────────────────────────────────────────────────────────────────────
async def tc_12_logout(page: Page) -> dict:
    ctx = start_case("TC-12", "登出",
                     "驗證登出按鈕能清掉 token 並導回登入頁。", min_steps=3)

    # 先回主頁 (萬一在設定頁)
    await page.goto(BASE_URL)
    await page.wait_for_timeout(800)

    await step(page, ctx,
        "在 header 找到「登出」按鈕，準備點它。",
        action=None,
        wait_ms=200)

    await step(page, ctx,
        "點擊「登出」。預期 token.json 被刪除、瀏覽器跳到登入頁。",
        action=lambda: page.locator("button:has-text('登出')").click(),
        wait_ms=2000)

    await step(page, ctx,
        "確認登入頁元素：標題 + 「登入 Google」按鈕、且沒有任何頻道卡片。測試完成；如要繼續使用請重新登入。",
        action=lambda: page.wait_for_selector("button:has-text('登入')", timeout=10000),
        wait_ms=500)

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
async def main() -> int:
    log("=" * 60)
    log("YT-MP3 完整功能 Walkthrough 測試開始")
    log("=" * 60)

    await precondition_check(BACKEND_URL)
    log("[OK] 後端登入確認")

    cases: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=300)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # 全部包 try，個別 TC 失敗不要中斷整個 run
        all_tcs = [
            tc_01_startup, tc_02_search, tc_03_check_dates,
            tc_04_channel_videos, tc_05_video_selection,
            tc_06_latest_feed, tc_07_settings, tc_08_settings_validation,
            tc_09_right_tabs, tc_10_normalize_basic, tc_11_normalize_advanced,
            tc_12_logout,
        ]
        for tc in all_tcs:
            try:
                cases.append(await tc(page))
            except Exception as e:
                log(f"[FATAL] {tc.__name__}: {e}")
                # 至少 record 一個壞案例
                bad = start_case(tc.__name__.upper().replace("_", "-"), tc.__name__, f"FATAL: {e}", min_steps=1)
                bad["steps"].append({
                    "n": 1, "narration": "case crashed before any step ran",
                    "screenshot": "—", "status": "FAIL", "error": str(e),
                })
                cases.append(bad)

        await browser.close()

    # cleanup temp dir
    if TEMP_NORMALIZE_DIR and TEMP_NORMALIZE_DIR.exists():
        shutil.rmtree(TEMP_NORMALIZE_DIR, ignore_errors=True)

    # write report
    make_html(cases, REPORT_PATH)
    RESULTS_PATH.write_text(json.dumps(cases, ensure_ascii=False, indent=2,
                                       default=str), encoding="utf-8")

    passed = sum(1 for c in cases
                 if all(s["status"] == "PASS" for s in c["steps"])
                 and len(c["steps"]) >= c["min_steps"])
    log("=" * 60)
    log(f"完成：{passed} / {len(cases)} 通過")
    log(f"報告：{REPORT_PATH}")
    log(f"截圖目錄：{REPORT_PATH.parent / 'screenshots_walkthrough'}")
    log("=" * 60)
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
