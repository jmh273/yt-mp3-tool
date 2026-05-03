# -*- coding: utf-8 -*-
"""
YT-MP3 UI 測試腳本（Playwright headed mode）
流程：已登入 → 主頁功能 → 設定 → 登出 → 登入頁驗證
"""
import asyncio
import json
import pathlib
import sys
from datetime import datetime

import aiohttp
from playwright.async_api import async_playwright, Page

SCREENSHOTS_DIR = pathlib.Path(__file__).parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)
BASE_URL = "http://localhost:5173"
results = []


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


async def shot(page: Page, name: str) -> str:
    path = SCREENSHOTS_DIR / f"{name}.png"
    await page.screenshot(path=str(path), full_page=True)
    log(f"  截圖：{name}.png")
    return str(path)


def record(name: str, desc: str, passed: bool, sc: str = "", notes: str = ""):
    status = "PASS" if passed else "FAIL"
    log(f"  [{status}] {name}: {desc}")
    if notes:
        log(f"         備註：{notes}")
    results.append({"name": name, "description": desc,
                    "status": status, "screenshot": sc, "notes": notes})


async def check_backend_login() -> bool:
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get("http://localhost:8000/auth/status",
                             timeout=aiohttp.ClientTimeout(total=3)) as r:
                return (await r.json()).get("logged_in", False)
    except Exception:
        return False


async def _find_channel_with_videos(page) -> int:
    """透過後端 API 找第一個有影片的頻道，回傳其在清單中的 index（0-based）。"""
    import urllib.request, xml.etree.ElementTree as ET
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"
    ns = {"atom": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    try:
        r = urllib.request.urlopen("http://localhost:8000/subscriptions", timeout=20)
        channels = __import__("json").loads(r.read())["channels"]
        for i, ch in enumerate(channels[:50]):
            url = f"https://www.youtube.com/feeds/videos.xml?channel_id={ch['channel_id']}"
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                resp = urllib.request.urlopen(req, timeout=6)
                root = ET.fromstring(resp.read())
                if root.findall("atom:entry", ns):
                    log(f"  API 確認：index={i} 「{ch['title']}」有影片")
                    return i
            except Exception:
                continue
    except Exception:
        pass
    return 0  # fallback


async def run_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=400)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        # ────────────────────────────────────────────────────────────────────
        # TC-01  主頁面載入（已登入狀態）
        # ────────────────────────────────────────────────────────────────────
        log("TC-01: 開啟主頁面")
        await page.goto(BASE_URL)
        await page.wait_for_timeout(2000)
        sc = await shot(page, "tc01_home")
        is_home = await page.locator("h1").filter(has_text="YT").count() > 0
        no_login_btn = await page.locator("button", has_text="登入").count() == 0
        record("TC-01", "已登入時直接顯示主頁面（不跳回登入頁）", is_home and no_login_btn, sc)

        # ────────────────────────────────────────────────────────────────────
        # TC-02  訂閱清單載入
        # ────────────────────────────────────────────────────────────────────
        log("TC-02: 等待訂閱清單載入")
        await page.wait_for_timeout(4000)
        sc = await shot(page, "tc02_subscriptions")
        ch_count = await page.locator(".channel-card").count()
        loading_gone = await page.locator("text=載入訂閱清單中").count() == 0
        record("TC-02", "訂閱頻道清單成功載入", ch_count > 0 and loading_gone, sc,
               f"共 {ch_count} 個頻道")

        # ────────────────────────────────────────────────────────────────────
        # TC-03  點選頻道在右欄顯示影片（新分欄佈局）
        # ────────────────────────────────────────────────────────────────────
        log("TC-03: 找出有影片的頻道並點選（右欄顯示）")
        vid_count = 0
        tried_ch_name = ""
        if ch_count > 0:
            target_idx = await _find_channel_with_videos(page)
            log(f"  API 確認頻道 index={target_idx} 有影片，點選")

            cards = page.locator(".channel-card")
            card = cards.nth(target_idx)
            tried_ch_name = (await card.locator(".channel-title").text_content() or "").strip()
            selected_idx = target_idx
            await card.click()
            await page.wait_for_timeout(5000)
            vid_count = await page.locator(".video-item").count()

            if vid_count == 0:
                log("  右欄 0 支，等待後重試...")
                await page.wait_for_timeout(3000)
                vid_count = await page.locator(".video-item").count()

            sc = await shot(page, "tc03_channel_videos")
            record("TC-03", "點選頻道後右欄顯示影片列表", vid_count > 0, sc,
                   f"顯示 {vid_count} 支影片（頻道：{tried_ch_name}）")
        else:
            record("TC-03", "點選頻道後右欄顯示影片列表", False, "", "無頻道可點選")
            vid_count = 0

        # ────────────────────────────────────────────────────────────────────
        # TC-04  勾選第一支影片
        # ────────────────────────────────────────────────────────────────────
        log("TC-04: 勾選第一支影片")
        if vid_count > 0:
            cb = page.locator(".video-item input[type='checkbox']").first
            await cb.check()
            await page.wait_for_timeout(600)
            sc = await shot(page, "tc04_video_checked")
            checked = await cb.is_checked()
            panel = await page.locator(".selected-panel").count() > 0
            record("TC-04", "勾選影片後 checkbox 打勾且底部面板出現", checked and panel, sc)
        else:
            record("TC-04", "勾選影片", False, "", "無影片可勾選")

        # ────────────────────────────────────────────────────────────────────
        # TC-05  多選影片（勾選第二支）
        # ────────────────────────────────────────────────────────────────────
        log("TC-05: 勾選第二支影片")
        if vid_count >= 2:
            await page.locator(".video-item input[type='checkbox']").nth(1).check()
            await page.wait_for_timeout(400)
            sc = await shot(page, "tc05_multi_selected")
            panel_text = await page.locator(".selected-panel .header span").text_content() or ""
            record("TC-05", "多選後底部面板顯示正確數量", "2" in panel_text, sc,
                   f"面板顯示：{panel_text.strip()}")
        else:
            record("TC-05", "多選影片", False, "", "影片數不足 2 支")

        # ────────────────────────────────────────────────────────────────────
        # TC-06  清除全部選取
        # ────────────────────────────────────────────────────────────────────
        log("TC-06: 點擊清除全部")
        clear_btn = page.locator(".selected-panel button", has_text="清除")
        if await clear_btn.count() > 0:
            await clear_btn.click()
            await page.wait_for_timeout(500)
            sc = await shot(page, "tc06_cleared")
            panel_gone = await page.locator(".selected-panel").count() == 0
            record("TC-06", "清除全部後底部面板消失", panel_gone, sc)
        else:
            record("TC-06", "清除全部", False, "", "找不到清除按鈕")

        # ────────────────────────────────────────────────────────────────────
        # TC-07  切換至不同頻道，右欄內容更新
        # ────────────────────────────────────────────────────────────────────
        log("TC-07: 點擊「最新影片」按鈕，右欄切換")
        latest_btn = page.locator("button", has_text="最新影片")
        if await latest_btn.count() > 0:
            await latest_btn.click()
            await page.wait_for_timeout(1000)
            sc = await shot(page, "tc07_latest_switched")
            # 右欄應不再顯示單頻道影片，而是最新影片 loading 或內容
            no_channel_videos = await page.locator(".channel-videos").count() == 0
            latest_visible = await page.locator(".latest-feed").count() > 0
            record("TC-07", "點擊最新影片按鈕後右欄切換至最新影片視圖",
                   no_channel_videos or latest_visible, sc,
                   f"channel-videos={not no_channel_videos}, latest-feed={latest_visible}")
        else:
            record("TC-07", "切換至最新影片視圖", False, "", "找不到最新影片按鈕")

        # ────────────────────────────────────────────────────────────────────
        # TC-08  進入設定頁面
        # ────────────────────────────────────────────────────────────────────
        log("TC-08: 前往設定頁面")
        await page.locator("a[href='/settings']").click()
        await page.wait_for_timeout(1000)
        sc = await shot(page, "tc08_settings")
        has_inputs = await page.locator("input").count() >= 2
        record("TC-08", "設定頁面正常顯示欄位", has_inputs, sc)

        # ────────────────────────────────────────────────────────────────────
        # TC-09  修改每頻道影片數
        # ────────────────────────────────────────────────────────────────────
        log("TC-09: 修改每頻道影片數為 3")
        num_inp = page.locator("input[type='number']").first
        if await num_inp.count() > 0:
            await num_inp.fill("3")
            await page.locator("button", has_text="儲存").click()
            await page.wait_for_timeout(800)
            sc = await shot(page, "tc09_settings_saved")
            ok = await page.locator("text=已儲存").count() > 0
            record("TC-09", "修改設定後顯示儲存成功", ok, sc)
        else:
            record("TC-09", "修改設定", False, "", "找不到數字欄位")

        # ────────────────────────────────────────────────────────────────────
        # TC-10  返回主頁
        # ────────────────────────────────────────────────────────────────────
        log("TC-10: 返回主頁面")
        await page.locator("a[href='/']").click()
        await page.wait_for_timeout(800)
        sc = await shot(page, "tc10_back_home")
        is_home2 = await page.locator("h1").filter(has_text="YT").count() > 0
        record("TC-10", "返回按鈕正確導覽回主頁", is_home2, sc)

        # ────────────────────────────────────────────────────────────────────
        # TC-11  標頭元素驗證（設定連結、登出按鈕存在）
        # ────────────────────────────────────────────────────────────────────
        log("TC-11: 驗證標頭元素")
        sc = await shot(page, "tc11_header")
        has_settings_link = await page.locator("a[href='/settings']").count() > 0
        has_logout_btn = await page.locator("button", has_text="登出").count() > 0
        record("TC-11", "標頭有設定連結與登出按鈕", has_settings_link and has_logout_btn, sc)

        # ────────────────────────────────────────────────────────────────────
        # TC-12  登出
        # ────────────────────────────────────────────────────────────────────
        log("TC-12: 點擊登出")
        await page.locator("button", has_text="登出").click()
        await page.wait_for_timeout(1500)
        sc = await shot(page, "tc12_logout")
        back_to_login = await page.locator("button", has_text="登入").count() > 0
        backend_logged_out = not await check_backend_login()
        record("TC-12", "登出後跳回登入頁且 token 清除", back_to_login and backend_logged_out, sc)

        # ────────────────────────────────────────────────────────────────────
        # TC-13  登入頁面元素驗證（登出後）
        # ────────────────────────────────────────────────────────────────────
        log("TC-13: 驗證登入頁面元素")
        sc = await shot(page, "tc13_login_page")
        has_title = await page.locator("h1").count() > 0
        has_btn = await page.locator("button", has_text="登入").count() > 0
        no_home = await page.locator(".channel-card").count() == 0
        record("TC-13", "登入頁顯示標題與登入按鈕，無頻道清單", has_title and has_btn and no_home, sc)

        await browser.close()
    return results


def generate_html(results: list) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = len(results) - passed
    total = len(results)
    pct = int(passed / total * 100) if total else 0

    rows = ""
    for r in results:
        icon = "✅" if r["status"] == "PASS" else "❌"
        fname = pathlib.Path(r["screenshot"]).name if r["screenshot"] else ""
        sc_link = f'<a href="screenshots/{fname}" target="_blank">📷</a>' if fname else "—"
        rows += f"""<tr class="{r['status'].lower()}">
            <td>{icon} {r['name']}</td>
            <td>{r['description']}</td>
            <td class="s-{r['status'].lower()}">{r['status']}</td>
            <td>{sc_link}</td>
            <td>{r['notes'] or '—'}</td></tr>\n"""

    gallery = ""
    for r in results:
        if r["screenshot"]:
            fname = pathlib.Path(r["screenshot"]).name
            icon = "✅" if r["status"] == "PASS" else "❌"
            gallery += f"""<div class="gi">
                <a href="screenshots/{fname}" target="_blank">
                  <img src="screenshots/{fname}" alt="{r['name']}"/>
                </a>
                <p>{icon} {r['name']}</p>
                <small>{r['description']}</small></div>\n"""

    return f"""<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>YT-MP3 UI 測試報告</title>
<style>
body{{font-family:'Segoe UI',sans-serif;margin:0;background:#f4f4f4;color:#333}}
.hdr{{background:#c00;color:#fff;padding:1.5rem 2rem}}
.hdr h1{{margin:0;font-size:1.6rem}}.hdr p{{margin:.4rem 0 0;opacity:.85;font-size:.9rem}}
.sum{{display:flex;gap:1rem;padding:1rem 2rem;background:#fff;border-bottom:1px solid #ddd}}
.sc{{padding:.8rem 1.2rem;border-radius:8px;text-align:center;min-width:90px}}
.sc.t{{background:#e0e0e0}}.sc.p{{background:#d4edda;color:#155724}}
.sc.f{{background:#f8d7da;color:#721c24}}
.sc .n{{font-size:1.8rem;font-weight:700}}.sc .l{{font-size:.8rem;margin-top:.2rem}}
.sec{{padding:1.2rem 2rem}}
h2{{font-size:1.1rem;border-left:4px solid #c00;padding-left:.6rem;margin-bottom:.8rem}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;
       overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}}
th{{background:#333;color:#fff;padding:.6rem .9rem;text-align:left;font-size:.85rem}}
td{{padding:.6rem .9rem;border-bottom:1px solid #eee;font-size:.85rem;vertical-align:top}}
tr:last-child td{{border-bottom:none}}
tr.fail{{background:#fff5f5}}tr.pass:hover{{background:#f0fff4}}
.s-pass{{color:#28a745;font-weight:700}}.s-fail{{color:#dc3545;font-weight:700}}
.gallery{{display:flex;flex-wrap:wrap;gap:.8rem}}
.gi{{text-align:center;width:200px}}
.gi img{{width:200px;height:125px;object-fit:cover;border:1px solid #ddd;border-radius:6px}}
.gi p{{margin:.3rem 0 .1rem;font-size:.8rem;font-weight:600}}
.gi small{{color:#777;font-size:.72rem}}
a{{color:#c00}}
.foot{{text-align:center;padding:1rem;color:#999;font-size:.8rem}}
</style></head><body>
<div class="hdr">
  <h1>YT-MP3 UI 測試報告</h1>
  <p>測試時間：{now}　｜　環境：localhost:5173 + localhost:8000　｜　真實 Google 帳號</p>
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
<div class="foot">YT-MP3 Tool UI Test Report　｜　Playwright {now}</div>
</body></html>"""


async def main():
    print("=" * 60)
    print("YT-MP3 UI 測試開始（真實 Google 帳號）")
    print("=" * 60, flush=True)

    logged_in = await check_backend_login()
    if not logged_in:
        print("⚠ 後端顯示未登入，請先完成 Google 授權再執行測試")
        return 1

    print(f"[OK] 後端登入確認，開始執行 13 個測試案例...", flush=True)
    res = await run_tests()

    report = pathlib.Path(__file__).parent / "test_report.html"
    report.write_text(generate_html(res), encoding="utf-8")
    pathlib.Path(__file__).parent / "test_results.json"
    (pathlib.Path(__file__).parent / "test_results.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = sum(1 for r in res if r["status"] == "PASS")
    print(f"\n{'='*60}")
    print(f"完成：{passed}/{len(res)} 通過")
    print(f"報告：{report}")
    print("=" * 60)
    return 0 if passed == len(res) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
