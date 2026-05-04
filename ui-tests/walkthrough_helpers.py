# -*- coding: utf-8 -*-
"""共用 helpers — step-based test API + HTML reporter.

由 feature_walkthrough.py 呼叫。本檔不直接執行測試。
"""
from __future__ import annotations

import asyncio
import pathlib
import sys
import traceback
from datetime import datetime
from typing import Any, Awaitable, Callable

import aiohttp
from playwright.async_api import Page

SCREENSHOTS_DIR = pathlib.Path(__file__).parent / "screenshots_walkthrough"
SCREENSHOTS_DIR.mkdir(exist_ok=True)


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(msg: str) -> None:
    print(f"[{now()}] {msg}", flush=True)


def start_case(case_id: str, name: str, description: str, min_steps: int) -> dict:
    """Return a fresh case context dict."""
    return {
        "id": case_id,
        "name": name,
        "description": description,
        "min_steps": min_steps,
        "steps": [],
        "started_at": datetime.now().isoformat(timespec="seconds"),
    }


async def step(
    page: Page,
    ctx: dict,
    narration: str,
    action: Callable[[], Awaitable[None]] | None = None,
    wait_ms: int = 500,
) -> dict:
    """Execute one step: optionally run action, wait, screenshot, record.

    Never raises. On error, captures error info and a screenshot of the failure
    state, marks the step FAIL, and returns. Subsequent step() calls in the
    same case still run.
    """
    case_id = ctx["id"]
    idx = len(ctx["steps"]) + 1
    fname = f"{case_id}_step{idx:02d}.png"
    path = SCREENSHOTS_DIR / fname

    entry: dict[str, Any] = {
        "n": idx,
        "narration": narration,
        "screenshot": fname,
        "status": "PASS",
        "error": None,
    }

    log(f"  {case_id} step {idx}: {narration}")
    try:
        if action is not None:
            await action()
        if wait_ms:
            await page.wait_for_timeout(wait_ms)
    except Exception as e:
        entry["status"] = "FAIL"
        entry["error"] = "".join(traceback.format_exception_only(type(e), e)).strip()
        log(f"    [FAIL] {entry['error']}")

    # Always screenshot — even on FAIL — so the report shows the failure state
    try:
        await page.screenshot(path=str(path), full_page=True)
    except Exception as e:
        # Screenshot itself failed (page closed?). Record but don't crash.
        entry["error"] = (entry["error"] or "") + f" | screenshot failed: {e}"

    ctx["steps"].append(entry)
    return entry


def case_status(ctx: dict) -> str:
    """PASS if all steps pass and step count >= min_steps; else FAIL."""
    if any(s["status"] == "FAIL" for s in ctx["steps"]):
        return "FAIL"
    if len(ctx["steps"]) < ctx["min_steps"]:
        return "FAIL"
    return "PASS"


async def precondition_check(base_url: str = "http://localhost:8000") -> None:
    """Backend up + Google logged in. Else SystemExit with actionable message."""
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{base_url}/auth/status",
                             timeout=aiohttp.ClientTimeout(total=3)) as r:
                data = await r.json()
                if not data.get("logged_in"):
                    sys.stderr.write(
                        "[precondition] 後端已啟動但尚未登入。請到 http://localhost:5173 "
                        "完成 Google 授權後再重新執行此測試。\n"
                    )
                    raise SystemExit(1)
    except SystemExit:
        raise
    except Exception as e:
        sys.stderr.write(
            "[precondition] 連不到後端 / 前端：請確認:\n"
            "  1. 後端 (uvicorn) 在 http://localhost:8000\n"
            "  2. 前端 (vite) 在 http://localhost:5173\n"
            "  3. 你在 http://localhost:5173 已完成 Google 登入\n"
            f"  原始錯誤：{e}\n"
        )
        raise SystemExit(1)


def make_html(cases: list[dict], out_path: pathlib.Path) -> None:
    """Render the self-contained HTML report."""
    total = len(cases)
    passed = sum(1 for c in cases if case_status(c) == "PASS")
    failed = total - passed
    pct = int(passed / total * 100) if total else 0
    failed_names = [c["name"] for c in cases if case_status(c) == "FAIL"]

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    sections = []
    for c in cases:
        status = case_status(c)
        is_open = "open" if status == "FAIL" else ""
        badge_class = "badge-pass" if status == "PASS" else "badge-fail"
        step_count = len(c["steps"])
        warn = ""
        if step_count < c["min_steps"]:
            warn = f' <span class="warn">(MISSING STEPS: {step_count}/{c["min_steps"]})</span>'

        steps_html = []
        for s in c["steps"]:
            row_class = "step" if s["status"] == "PASS" else "step step-fail"
            err_html = ""
            if s["error"]:
                err_html = f'<pre class="err">{_html_escape(s["error"])}</pre>'
            steps_html.append(f"""
            <div class="{row_class}">
              <div class="narration"><span class="num">Step {s['n']}</span> {_html_escape(s['narration'])}</div>
              <a href="screenshots_walkthrough/{s['screenshot']}" target="_blank">
                <img src="screenshots_walkthrough/{s['screenshot']}" alt="step {s['n']}"/>
              </a>
              {err_html}
            </div>""")
        steps_block = "\n".join(steps_html)

        sections.append(f"""
        <details {is_open} class="case case-{status.lower()}">
          <summary><span class="case-id">{c['id']}</span> {_html_escape(c['name'])} <span class="{badge_class}">{status}</span>{warn}</summary>
          <p class="case-desc">{_html_escape(c['description'])}</p>
          <div class="steps">{steps_block}</div>
        </details>""")

    failed_list = ""
    if failed_names:
        items = "".join(f"<li>{_html_escape(n)}</li>" for n in failed_names)
        failed_list = f'<div class="failed-list"><strong>失敗案例：</strong><ul>{items}</ul></div>'

    out_path.write_text(_HTML_TEMPLATE.format(
        timestamp=timestamp,
        passed=passed, failed=failed, total=total, pct=pct,
        summary_color="ok" if failed == 0 else "fail",
        failed_list=failed_list,
        sections="\n".join(sections),
    ), encoding="utf-8")


def _html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>YT-MP3 完整功能 Walkthrough 測試報告</title>
<style>
  body {{ font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; margin: 0; background: #f6f6f8; color: #222; }}
  .hdr {{ background: #c00; color: #fff; padding: 1.4rem 2rem; }}
  .hdr h1 {{ margin: 0; font-size: 1.5rem; }}
  .hdr p {{ margin: .3rem 0 0; opacity: .85; font-size: .85rem; }}
  .summary {{ display: flex; gap: 1rem; padding: 1rem 2rem; background: #fff; border-bottom: 1px solid #ddd; align-items: center; }}
  .summary .num {{ font-size: 1.6rem; font-weight: 700; }}
  .summary .label {{ font-size: .75rem; color: #888; }}
  .summary .ok .num {{ color: #2e7d32; }}
  .summary .fail .num {{ color: #c62828; }}
  .failed-list {{ padding: .8rem 2rem; background: #fff5f5; border-bottom: 1px solid #ffd1d1; font-size: .9rem; }}
  .failed-list ul {{ margin: .3rem 0 0; padding-left: 1.2rem; }}
  main {{ padding: 1rem 2rem; }}
  details.case {{ background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: .8rem; padding: .6rem 1rem; }}
  details.case-fail {{ border-color: #f5a5a5; background: #fffafa; }}
  summary {{ cursor: pointer; font-size: 1rem; font-weight: 600; padding: .3rem 0; outline: none; }}
  .case-id {{ display: inline-block; min-width: 4em; color: #c00; font-family: monospace; }}
  .badge-pass, .badge-fail {{ float: right; padding: .1rem .6rem; border-radius: 10px; font-size: .75rem; font-weight: 600; }}
  .badge-pass {{ background: #e8f5e9; color: #2e7d32; }}
  .badge-fail {{ background: #ffebee; color: #c62828; }}
  .warn {{ background: #fff3e0; color: #e65100; padding: .1rem .4rem; border-radius: 4px; font-size: .7rem; }}
  .case-desc {{ color: #555; font-size: .85rem; margin: .3rem 0 .8rem; }}
  .steps {{ display: flex; flex-direction: column; gap: 1rem; }}
  .step {{ border-left: 3px solid #ccc; padding: .4rem .8rem; }}
  .step-fail {{ border-left-color: #c62828; background: #fff5f5; }}
  .narration {{ font-size: .92rem; line-height: 1.6; margin-bottom: .4rem; }}
  .narration .num {{ color: #c00; font-family: monospace; font-weight: 600; margin-right: .4rem; }}
  .step img {{ max-width: 480px; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }}
  .step img:hover {{ box-shadow: 0 2px 8px rgba(0,0,0,.2); }}
  .err {{ background: #fff; border: 1px solid #f5a5a5; border-radius: 4px; padding: .4rem .6rem; font-size: .75rem; color: #c62828; white-space: pre-wrap; margin-top: .4rem; }}
  footer {{ text-align: center; padding: 1.5rem; color: #888; font-size: .75rem; }}
</style>
</head>
<body>
  <div class="hdr">
    <h1>YT-MP3 完整功能 Walkthrough 測試報告</h1>
    <p>{timestamp} · Playwright headed mode · 11 個測試案例</p>
  </div>
  <div class="summary">
    <div class="ok"><div class="num">{passed}</div><div class="label">通過</div></div>
    <div class="fail"><div class="num">{failed}</div><div class="label">失敗</div></div>
    <div><div class="num">{total}</div><div class="label">總計</div></div>
    <div class="{summary_color}"><div class="num">{pct}%</div><div class="label">通過率</div></div>
  </div>
  {failed_list}
  <main>
    {sections}
  </main>
  <footer>YT-MP3 Tool · feature walkthrough · 自動產生於 {timestamp}</footer>
</body>
</html>
"""
