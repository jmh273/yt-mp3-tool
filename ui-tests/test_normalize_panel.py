# -*- coding: utf-8 -*-
"""
音量正規化面板 UI 測試（Playwright headed mode）

驗證範圍：
- 預設右欄分頁是「下載」
- 切到「音量正規化」分頁，目錄輸入框預填當日 YYYYMMDD
- 載入空目錄顯示空狀態
- 載入有 MP3 的目錄顯示檔案清單與覆寫警告
- 切回「下載」再切回「音量正規化」，先前載入的清單仍在（KeepAlive）
"""
import asyncio
import json
import pathlib
import shutil
import sys
import tempfile
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


async def run_tests(empty_dir: pathlib.Path, mp3_dir: pathlib.Path):
    today = datetime.now().strftime("%Y%m%d")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=300)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        # NV-01: 主頁載入，預設分頁為「下載」
        log("NV-01: 開啟主頁面，確認預設右欄分頁是「下載」")
        await page.goto(BASE_URL)
        await page.wait_for_timeout(2500)
        sc = await shot(page, "nv01_default_tab")
        download_active = await page.locator(".tab.active", has_text="下載").count() > 0
        normalize_inactive = await page.locator(".tab", has_text="音量正規化").count() > 0
        record("NV-01", "預設右欄分頁是「下載」", download_active and normalize_inactive, sc)

        # NV-02: 點擊「音量正規化」分頁
        log("NV-02: 切換至「音量正規化」分頁")
        await page.locator(".tab", has_text="音量正規化").click()
        await page.wait_for_timeout(700)
        sc = await shot(page, "nv02_switched_tab")
        norm_active = await page.locator(".tab.active", has_text="音量正規化").count() > 0
        panel_visible = await page.locator(".normalizer").count() > 0
        record("NV-02", "切換至「音量正規化」分頁顯示面板", norm_active and panel_visible, sc)

        # NV-03: 目錄輸入框預填今日 YYYYMMDD
        log("NV-03: 確認目錄輸入框預填當日日期")
        await page.wait_for_timeout(500)
        dir_value = await page.locator(".dir-input").input_value()
        sc = await shot(page, "nv03_default_dir")
        record("NV-03", f"目錄預填當日 YYYYMMDD（{today}）",
               today in dir_value, sc, f"實際值：{dir_value}")

        # NV-04: 載入空目錄 → 空狀態訊息
        log(f"NV-04: 載入空目錄 {empty_dir}")
        await page.locator(".dir-input").fill(str(empty_dir))
        await page.locator(".load-btn").click()
        await page.wait_for_timeout(1000)
        sc = await shot(page, "nv04_empty_dir")
        empty_msg = await page.locator(".empty", has_text="此目錄沒有 MP3").count() > 0
        start_disabled = await page.locator(".start-btn").count() == 0
        record("NV-04", "空目錄顯示空狀態且無「開始正規化」按鈕",
               empty_msg and start_disabled, sc)

        # NV-05: 載入有 MP3 的目錄 → 顯示清單 + 覆寫警告
        log(f"NV-05: 載入有 MP3 的目錄 {mp3_dir}")
        await page.locator(".dir-input").fill(str(mp3_dir))
        await page.locator(".load-btn").click()
        await page.wait_for_timeout(1200)
        sc = await shot(page, "nv05_loaded_files")
        file_count = await page.locator(".file-item").count()
        warning_visible = await page.locator(".warning", has_text="覆寫原檔").count() > 0
        start_btn_visible = await page.locator(".start-btn").count() > 0
        record("NV-05", "目錄載入後顯示 MP3 清單、覆寫警告與開始按鈕",
               file_count > 0 and warning_visible and start_btn_visible, sc,
               f"檔案數：{file_count}")

        # NV-06: KeepAlive — 切到下載再切回，清單仍在
        log("NV-06: 切回「下載」分頁再切回「音量正規化」")
        await page.locator(".tab", has_text="下載").click()
        await page.wait_for_timeout(400)
        sc1 = await shot(page, "nv06a_back_to_download")
        await page.locator(".tab", has_text="音量正規化").click()
        await page.wait_for_timeout(400)
        sc2 = await shot(page, "nv06b_back_to_normalize")
        file_count_after = await page.locator(".file-item").count()
        dir_value_after = await page.locator(".dir-input").input_value()
        record("NV-06", "KeepAlive 保留清單與目錄輸入",
               file_count_after == file_count and dir_value_after == str(mp3_dir), sc2,
               f"切換前 {file_count} → 切換後 {file_count_after}")

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
        icon = "PASS" if r["status"] == "PASS" else "FAIL"
        fname = pathlib.Path(r["screenshot"]).name if r["screenshot"] else ""
        sc_link = f'<a href="screenshots/{fname}" target="_blank">view</a>' if fname else "-"
        rows += f"""<tr class="{r['status'].lower()}">
            <td>{icon} {r['name']}</td>
            <td>{r['description']}</td>
            <td class="s-{r['status'].lower()}">{r['status']}</td>
            <td>{sc_link}</td>
            <td>{r['notes'] or '-'}</td></tr>\n"""

    return f"""<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>YT-MP3 Normalize Panel UI Test</title>
<style>
body{{font-family:'Segoe UI',sans-serif;margin:0;background:#f4f4f4;color:#333}}
.hdr{{background:#c00;color:#fff;padding:1.5rem 2rem}}
.hdr h1{{margin:0;font-size:1.6rem}}
.sum{{display:flex;gap:1rem;padding:1rem 2rem;background:#fff;border-bottom:1px solid #ddd}}
.sc{{padding:.8rem 1.2rem;border-radius:8px;text-align:center;min-width:90px}}
.sc.t{{background:#e0e0e0}}.sc.p{{background:#d4edda;color:#155724}}
.sc.f{{background:#f8d7da;color:#721c24}}
.sc .n{{font-size:1.8rem;font-weight:700}}
.sec{{padding:1.2rem 2rem}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}}
th{{background:#333;color:#fff;padding:.6rem .9rem;text-align:left;font-size:.85rem}}
td{{padding:.6rem .9rem;border-bottom:1px solid #eee;font-size:.85rem}}
tr.fail{{background:#fff5f5}}
.s-pass{{color:#28a745;font-weight:700}}.s-fail{{color:#dc3545;font-weight:700}}
</style></head><body>
<div class="hdr"><h1>音量正規化面板 UI 測試報告</h1>
  <p>{now}</p></div>
<div class="sum">
  <div class="sc t"><div class="n">{total}</div><div>總計</div></div>
  <div class="sc p"><div class="n">{passed}</div><div>通過</div></div>
  <div class="sc f"><div class="n">{failed}</div><div>失敗</div></div>
  <div class="sc {'p' if failed==0 else 'f'}"><div class="n">{pct}%</div><div>通過率</div></div>
</div>
<div class="sec"><table>
  <thead><tr><th>案例</th><th>說明</th><th>結果</th><th>截圖</th><th>備註</th></tr></thead>
  <tbody>{rows}</tbody></table></div>
</body></html>"""


async def main():
    print("=" * 60)
    print("音量正規化面板 UI 測試")
    print("=" * 60, flush=True)

    if not await check_backend_login():
        print("⚠ 後端顯示未登入，請先完成 Google 授權再執行測試")
        return 1

    # 準備測試目錄
    tmp_root = pathlib.Path(tempfile.mkdtemp(prefix="norm-ui-"))
    empty_dir = tmp_root / "empty"
    mp3_dir = tmp_root / "with-mp3"
    empty_dir.mkdir()
    mp3_dir.mkdir()
    # 寫兩個 placeholder MP3 檔（內容不重要，只測試 UI 列表）
    (mp3_dir / "song-a.mp3").write_bytes(b"\xff\xfb" + b"\x00" * 64)
    (mp3_dir / "song-b.mp3").write_bytes(b"\xff\xfb" + b"\x00" * 64)
    log(f"測試目錄：{tmp_root}")

    try:
        res = await run_tests(empty_dir, mp3_dir)
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    report = pathlib.Path(__file__).parent / "test_normalize_panel_report.html"
    report.write_text(generate_html(res), encoding="utf-8")
    (pathlib.Path(__file__).parent / "test_normalize_panel_results.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = sum(1 for r in res if r["status"] == "PASS")
    print(f"\n完成：{passed}/{len(res)} 通過")
    print(f"報告：{report}")
    return 0 if passed == len(res) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
