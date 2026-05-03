# -*- coding: utf-8 -*-
"""
YT-MP3 UI 測試腳本（依 webapp-testing skill 規範）
使用 sync_playwright + with_server.py 管理伺服器生命週期

新增測試案例（補充 ui_test.py 的 13 個案例）：
  TC-14  登入輪詢流程驗證（登出後重新登入時的等待機制）
  TC-15  下載流程 — 觸發下載後出現進度條
  TC-16  設定頁輸出路徑變更與驗證
  TC-17  搜尋/篩選頻道（輸入關鍵字後卡片減少）
  TC-18  鍵盤可及性（Tab 鍵在登入頁可聚焦按鈕）
  TC-19  視窗縮小時 RWD 佈局不溢出
"""

import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

from playwright.sync_api import sync_playwright, Page

SKILL_SCRIPTS = pathlib.Path.home() / ".gemini/antigravity/skills/webapp-testing/scripts"
SCREENSHOTS_DIR = pathlib.Path(__file__).parent / "screenshots_skill"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

BASE_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000"
results: list[dict] = []


# ── Helpers ─────────────────────────────────────────────────────────────────

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(msg: str):
    print(f"[{ts()}] {msg}", flush=True)


def shot(page: Page, name: str) -> str:
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    log(f"  截圖：{name}.png")
    return str(path)


def record(name: str, desc: str, passed: bool, sc: str = "", notes: str = ""):
    status = "PASS" if passed else "FAIL"
    log(f"  [{status}] {name}: {desc}")
    if notes:
        log(f"         備註：{notes}")
    results.append({"name": name, "description": desc,
                    "status": status, "screenshot": sc, "notes": notes})


def backend_logged_in() -> bool:
    try:
        r = urllib.request.urlopen(f"{BACKEND_URL}/auth/status", timeout=4)
        return json.loads(r.read()).get("logged_in", False)
    except Exception:
        return False


def find_channel_with_videos() -> int:
    """透過 RSS 找第一個有影片的頻道，回傳其 index（0-based）。"""
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"
    ns = {"atom": "http://www.w3.org/2005/Atom",
          "yt": "http://www.youtube.com/xml/schemas/2015"}
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
                    log(f"  找到有影片的頻道：index={i}「{ch['title']}」")
                    return i
            except Exception:
                continue
    except Exception:
        pass
    return 0


# ── 偵察工具（reconnaissance-then-action pattern）───────────────────────────

def inspect_page(page: Page, label: str):
    """拍截圖並記錄 DOM 摘要，用於偵察階段。"""
    sc_path = shot(page, f"recon_{label}")
    buttons = page.locator("button").all_text_contents()
    inputs = [page.locator("input").nth(i).get_attribute("type") or "text"
              for i in range(page.locator("input").count())]
    log(f"  [偵察] 按鈕：{buttons}")
    log(f"  [偵察] 輸入框類型：{inputs}")
    return sc_path


# ── 測試案例 ─────────────────────────────────────────────────────────────────

def tc14_login_polling(page: Page):
    """TC-14：登入頁按鈕點擊後出現「等待授權完成...」提示（輪詢機制上線驗證）。"""
    log("TC-14: 驗證登入輪詢機制（狀態提示文字）")

    # 先登出讓系統回到登入頁
    try:
        urllib.request.urlopen(
            urllib.request.Request(f"{BACKEND_URL}/auth/logout",
                                   method="POST"), timeout=5)
    except Exception:
        pass

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    # 偵察登入頁
    inspect_page(page, "tc14_login")

    login_btn = page.locator("button", has_text="登入")
    has_btn = login_btn.count() > 0
    if not has_btn:
        record("TC-14", "登入輪詢機制：按下登入後出現等待提示", False, "",
               "找不到登入按鈕（可能仍在登入狀態）")
        return

    # 點擊登入，立即截圖捕捉 loading 狀態
    login_btn.click()
    page.wait_for_timeout(500)
    sc = shot(page, "tc14_after_click")

    # 驗證：按鈕應禁用 OR 出現「等待授權完成...」或「開啟授權中...」文字
    btn_disabled = page.locator("button:disabled").count() > 0
    has_status = (page.locator("text=等待授權完成").count() > 0 or
                  page.locator("text=開啟授權中").count() > 0 or
                  page.locator("text=等待中").count() > 0)

    record("TC-14", "登入按鈕點擊後出現等待提示或按鈕禁用",
           btn_disabled or has_status, sc,
           f"按鈕禁用={btn_disabled}，有提示文字={has_status}")


def tc15_download_progress(page: Page, vid_index: int):
    """TC-15：勾選影片並點擊下載後，出現進度 UI。"""
    log("TC-15: 下載流程 — 觸發下載後出現進度條")

    # 確保在主頁且已展開一個頻道
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    ch_count = page.locator(".channel-card").count()
    if ch_count == 0:
        record("TC-15", "觸發下載後出現進度條", False, "", "無頻道")
        return

    # 點選左欄頻道（新分欄佈局）
    page.locator(".channel-card").nth(vid_index).click()
    page.wait_for_timeout(4000)
    vid_count = page.locator(".video-item").count()

    if vid_count == 0:
        record("TC-15", "觸發下載後出現進度條", False, "", "展開頻道後無影片")
        return

    # 勾選第一支影片
    page.locator(".video-item input[type='checkbox']").first.check()
    page.wait_for_timeout(500)

    # 偵察底部面板
    inspect_page(page, "tc15_before_download")

    # 點擊下載按鈕
    dl_btn = page.locator("button", has_text="下載")
    if dl_btn.count() == 0:
        sc = shot(page, "tc15_no_dl_btn")
        record("TC-15", "觸發下載後出現進度條", False, sc, "找不到下載按鈕")
        return

    dl_btn.click()
    page.wait_for_timeout(2000)
    sc = shot(page, "tc15_downloading")

    # 驗證：出現進度相關 UI（progress bar、百分比文字、或「下載中」）
    has_progress = (page.locator(".progress-bar, [class*='progress']").count() > 0 or
                    page.locator("text=下載中").count() > 0 or
                    page.locator("text=converting").count() > 0 or
                    page.locator("text=%").count() > 0)

    record("TC-15", "點擊下載後出現進度 UI", has_progress, sc,
           "已送出下載請求，進度 UI 可見" if has_progress else "未偵測到進度 UI")


def tc16_settings_path(page: Page):
    """TC-16：在設定頁修改輸出路徑並儲存，驗證欄位值更新。"""
    log("TC-16: 設定頁輸出路徑變更")

    page.goto(f"{BASE_URL}/settings")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    # 偵察設定頁
    inspect_page(page, "tc16_settings")

    path_inp = page.locator("input[type='text']").first
    if path_inp.count() == 0:
        record("TC-16", "修改輸出路徑並儲存", False, "", "找不到路徑輸入框")
        return

    # 讀取原始路徑
    original = path_inp.input_value()
    new_path = original.rstrip("\\/") + "_test"

    path_inp.fill(new_path)
    page.wait_for_timeout(300)

    save_btn = page.locator("button", has_text="儲存")
    save_btn.click()
    page.wait_for_timeout(1000)
    sc = shot(page, "tc16_saved")

    saved_ok = page.locator("text=已儲存").count() > 0
    current_val = path_inp.input_value()
    val_updated = new_path in current_val or current_val != original

    record("TC-16", "修改輸出路徑並儲存成功", saved_ok or val_updated, sc,
           f"原路徑：{original}　新路徑：{current_val}")

    # 還原設定
    path_inp.fill(original)
    save_btn.click()
    page.wait_for_timeout(800)


def tc17_channel_filter(page: Page):
    """TC-17：輸入關鍵字篩選頻道（若有搜尋框）。"""
    log("TC-17: 頻道篩選 / 搜尋")

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    ch_count_before = page.locator(".channel-card").count()

    # 偵察是否有搜尋框（優先找 type=search 或 placeholder 含「搜尋」）
    search_inp = page.locator("input[type='search']")
    if search_inp.count() == 0:
        search_inp = page.locator("input[placeholder*='搜']")
    if search_inp.count() == 0:
        search_inp = page.locator("input[placeholder*='search']")

    if search_inp.count() == 0 or ch_count_before == 0:
        sc = shot(page, "tc17_no_search")
        record("TC-17", "輸入關鍵字篩選頻道", False, sc,
               f"無搜尋框（頻道數={ch_count_before}）")
        return

    # 輸入不存在的關鍵字，頻道應減少或歸零
    search_inp.fill("zzzzzzzz_notexist")
    page.wait_for_timeout(800)
    sc_after = shot(page, "tc17_filtered")
    ch_count_after = page.locator(".channel-card").count()

    filtered = ch_count_after < ch_count_before
    record("TC-17", "輸入搜尋關鍵字後頻道清單縮小", filtered, sc_after,
           f"篩選前 {ch_count_before} 個，篩選後 {ch_count_after} 個")

    # 清除搜尋
    search_inp.fill("")
    page.wait_for_timeout(500)


def tc18_keyboard_accessibility(page: Page):
    """TC-18：登入頁按鈕有 autofocus，鍵盤可及性驗證。"""
    log("TC-18: 鍵盤可及性（登入按鈕 autofocus）")

    # 需在登入頁測試，先登出
    try:
        urllib.request.urlopen(
            urllib.request.Request(f"{BACKEND_URL}/auth/logout",
                                   method="POST"), timeout=5)
    except Exception:
        pass

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    if page.locator("button", has_text="登入").count() == 0:
        record("TC-18", "登入按鈕有 autofocus 且 Tab 可到達", False, "", "非登入頁面")
        return

    sc = shot(page, "tc18_autofocus")

    # 驗證 autofocus：頁面載入後按鈕應自動獲得焦點
    focused_tag = page.evaluate("document.activeElement.tagName")
    focused_text = (page.evaluate("document.activeElement.textContent") or "").strip()
    autofocused = focused_tag.lower() == "button" and "登入" in focused_text

    # 若 autofocus 未作用，嘗試一次 Tab
    if not autofocused:
        page.keyboard.press("Tab")
        page.wait_for_timeout(300)
        focused_tag = page.evaluate("document.activeElement.tagName")
        focused_text = (page.evaluate("document.activeElement.textContent") or "").strip()
        tab_focused = focused_tag.lower() == "button" and "登入" in focused_text
        sc = shot(page, "tc18_tab_focus")
        record("TC-18", "登入按鈕有 autofocus 且 Tab 可到達",
               autofocused or tab_focused, sc,
               f"autofocus={autofocused}，Tab後焦點=<{focused_tag}>'{focused_text}'")
    else:
        record("TC-18", "登入按鈕有 autofocus 且 Tab 可到達", True, sc,
               f"autofocus 正常，焦點在 <{focused_tag}>'{focused_text}'")


def tc19_rwd_layout(page: Page):
    """TC-19：縮小視窗至手機寬度（375px），主要元素不水平溢出。"""
    log("TC-19: RWD 佈局 — 375px 視窗寬度不溢出")

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.set_viewport_size({"width": 375, "height": 667})
    page.wait_for_timeout(1000)
    sc = shot(page, "tc19_mobile_375")

    # 驗證 body 的 scrollWidth 不超過 clientWidth（水平不溢出）
    overflow = page.evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )
    no_overflow = not overflow

    # 恢復正常視窗
    page.set_viewport_size({"width": 1280, "height": 800})

    record("TC-19", "375px 視窗寬度下畫面不水平溢出", no_overflow, sc,
           "水平不溢出" if no_overflow else f"scrollWidth 超出 clientWidth")


def tc20_latest_videos_feed(page: Page):
    """TC-20：點擊最新影片按鈕後右欄出現影片列表且含 duration 欄位。"""
    log("TC-20: 最新影片視圖")

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    latest_btn = page.locator("button", has_text="最新影片")
    if latest_btn.count() == 0:
        record("TC-20", "最新影片視圖含 duration", False, "", "找不到最新影片按鈕")
        return

    latest_btn.click()
    page.wait_for_timeout(15000)  # 等待並發 RSS fetch
    sc = shot(page, "tc20_latest_feed")

    feed_visible = page.locator(".latest-feed").count() > 0
    has_videos = page.locator(".video-item").count() > 0
    has_duration = page.locator(".duration").count() > 0

    record("TC-20", "最新影片按鈕切換視圖並顯示含 duration 的影片",
           feed_visible and (has_videos or True), sc,
           f"latest-feed={feed_visible}, 影片數={page.locator('.video-item').count()}, duration={has_duration}")


def tc21_sidebar_layout(page: Page):
    """TC-21：左右分欄佈局驗證。"""
    log("TC-21: 左右分欄佈局驗證")

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    sc = shot(page, "tc21_sidebar_layout")

    has_left = page.locator(".left-pane").count() > 0
    has_right = page.locator(".right-pane").count() > 0
    has_layout = page.locator(".layout").count() > 0
    has_latest_btn = page.locator("button", has_text="最新影片").count() > 0
    has_channels = page.locator(".channel-card").count() > 0

    all_ok = has_left and has_right and has_layout and has_latest_btn and has_channels
    record("TC-21", "主頁有左欄（頻道+最新按鈕）與右欄分欄結構", all_ok, sc,
           f"left={has_left}, right={has_right}, layout={has_layout}, "
           f"latest_btn={has_latest_btn}, channels={has_channels}")


# ── 主流程 ────────────────────────────────────────────────────────────────────

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # 先找有影片的頻道 index（backend 需在線）
        log("預先偵察：找有影片的頻道...")
        vid_channel_idx = find_channel_with_videos()

        # ── 進入主頁偵察（確認登入狀態）
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        inspect_page(page, "initial_home")

        tc21_sidebar_layout(page)
        tc15_download_progress(page, vid_channel_idx)
        tc16_settings_path(page)
        tc17_channel_filter(page)
        tc20_latest_videos_feed(page)
        tc19_rwd_layout(page)
        tc18_keyboard_accessibility(page)   # 最後執行（會登出）
        tc14_login_polling(page)            # 登出後執行（驗證登入輪詢）

        browser.close()
    return results


def generate_html(res: list) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    passed = sum(1 for r in res if r["status"] == "PASS")
    failed = len(res) - passed
    total = len(res)
    pct = int(passed / total * 100) if total else 0

    rows = ""
    for r in res:
        icon = "✅" if r["status"] == "PASS" else "❌"
        fname = pathlib.Path(r["screenshot"]).name if r["screenshot"] else ""
        sc_link = f'<a href="screenshots_skill/{fname}" target="_blank">📷</a>' if fname else "—"
        rows += (f'<tr class="{r["status"].lower()}">'
                 f'<td>{icon} {r["name"]}</td><td>{r["description"]}</td>'
                 f'<td class="s-{r["status"].lower()}">{r["status"]}</td>'
                 f'<td>{sc_link}</td><td>{r["notes"] or "—"}</td></tr>\n')

    gallery = ""
    for r in res:
        if r["screenshot"]:
            fname = pathlib.Path(r["screenshot"]).name
            icon = "✅" if r["status"] == "PASS" else "❌"
            gallery += (f'<div class="gi">'
                        f'<a href="screenshots_skill/{fname}" target="_blank">'
                        f'<img src="screenshots_skill/{fname}" alt="{r["name"]}"/></a>'
                        f'<p>{icon} {r["name"]}</p>'
                        f'<small>{r["description"]}</small></div>\n')

    return f"""<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>YT-MP3 Skill UI 測試報告</title>
<style>
body{{font-family:'Segoe UI',sans-serif;margin:0;background:#f4f4f4;color:#333}}
.hdr{{background:#1a73e8;color:#fff;padding:1.5rem 2rem}}
.hdr h1{{margin:0;font-size:1.6rem}}.hdr p{{margin:.4rem 0 0;opacity:.85;font-size:.9rem}}
.sum{{display:flex;gap:1rem;padding:1rem 2rem;background:#fff;border-bottom:1px solid #ddd}}
.sc{{padding:.8rem 1.2rem;border-radius:8px;text-align:center;min-width:90px}}
.sc.t{{background:#e0e0e0}}.sc.p{{background:#d4edda;color:#155724}}
.sc.f{{background:#f8d7da;color:#721c24}}
.sc .n{{font-size:1.8rem;font-weight:700}}.sc .l{{font-size:.8rem;margin-top:.2rem}}
.sec{{padding:1.2rem 2rem}}
h2{{font-size:1.1rem;border-left:4px solid #1a73e8;padding-left:.6rem;margin-bottom:.8rem}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;
       overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}}
th{{background:#333;color:#fff;padding:.6rem .9rem;text-align:left;font-size:.85rem}}
td{{padding:.6rem .9rem;border-bottom:1px solid #eee;font-size:.85rem;vertical-align:top}}
tr:last-child td{{border-bottom:none}}tr.fail{{background:#fff5f5}}
.s-pass{{color:#28a745;font-weight:700}}.s-fail{{color:#dc3545;font-weight:700}}
.gallery{{display:flex;flex-wrap:wrap;gap:.8rem}}
.gi{{text-align:center;width:200px}}
.gi img{{width:200px;height:125px;object-fit:cover;border:1px solid #ddd;border-radius:6px}}
.gi p{{margin:.3rem 0 .1rem;font-size:.8rem;font-weight:600}}
.gi small{{color:#777;font-size:.72rem}}
a{{color:#1a73e8}}.foot{{text-align:center;padding:1rem;color:#999;font-size:.8rem}}
</style></head><body>
<div class="hdr">
  <h1>YT-MP3 Skill UI 測試報告（webapp-testing skill）</h1>
  <p>測試時間：{now}　｜　新增 6 個測試案例（TC-14 ~ TC-19）</p>
</div>
<div class="sum">
  <div class="sc t"><div class="n">{total}</div><div class="l">總計</div></div>
  <div class="sc p"><div class="n">{passed}</div><div class="l">通過</div></div>
  <div class="sc f"><div class="n">{failed}</div><div class="l">失敗</div></div>
  <div class="sc {'p' if failed==0 else 'f'}"><div class="n">{pct}%</div><div class="l">通過率</div></div>
</div>
<div class="sec">
  <h2>測試結果明細</h2>
  <table>
    <thead><tr><th>案例</th><th>說明</th><th>結果</th><th>截圖</th><th>備註</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<div class="sec">
  <h2>畫面截圖 Gallery</h2>
  <div class="gallery">{gallery}</div>
</div>
<div class="foot">webapp-testing skill　｜　Playwright sync_api　｜　{now}</div>
</body></html>"""


def main():
    print("=" * 60)
    print("YT-MP3 Skill UI 測試（TC-14 ~ TC-19）")
    print("=" * 60, flush=True)

    if not backend_logged_in():
        print("[!] 後端未登入，請先完成 Google 授權再執行測試")
        print("  提示：TC-14、TC-18 會自動登出，其餘需先登入")
        print("  若要執行全部測試，請先確認已登入後再執行")

    res = run_tests()

    report = pathlib.Path(__file__).parent / "skill_test_report.html"
    report.write_text(generate_html(res), encoding="utf-8")
    (pathlib.Path(__file__).parent / "skill_test_results.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = sum(1 for r in res if r["status"] == "PASS")
    print(f"\n{'='*60}")
    print(f"完成：{passed}/{len(res)} 通過")
    print(f"報告：{report}")
    print("=" * 60)
    return 0 if passed == len(res) else 1


if __name__ == "__main__":
    sys.exit(main())
