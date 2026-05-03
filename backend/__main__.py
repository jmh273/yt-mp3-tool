"""Entry point for the bundled exe.

When invoked as `yt-mp3-tool.exe`, this module starts uvicorn against `main:app`
and (optionally) opens the user's browser to the app URL.

In dev (`python -m uvicorn main:app --reload`) this file is not used.
"""
import os
import sys
import webbrowser

import uvicorn


def _health_check() -> int:
    """Smoke check used by CI: print version and exit 0 without binding any port."""
    import main
    print(main.__version__)
    return 0


def main() -> int:
    if "--health-check" in sys.argv:
        return _health_check()

    host = os.environ.get("YT_MP3_HOST", "127.0.0.1")
    port = int(os.environ.get("YT_MP3_PORT", "8000"))
    open_browser = os.environ.get("YT_MP3_NO_BROWSER", "") == ""

    if open_browser:
        try:
            webbrowser.open(f"http://{host}:{port}/")
        except Exception:
            pass  # 沒瀏覽器不是 fatal

    uvicorn.run("main:app", host=host, port=port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
