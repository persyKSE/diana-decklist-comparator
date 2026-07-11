#!/usr/bin/env python3
"""
app.py

Opens the deck comparator in its own native window (no browser chrome),
using the same index.html + decks.js the site serves.

Usage:
    python3 app.py            # open the app
    python3 app.py --fetch    # re-scrape latest decks first, then open

Requires: pip3 install pywebview
"""

import argparse
import subprocess
import sys
from pathlib import Path

try:
    import webview
except ImportError:
    print("Missing dependency. Run: pip3 install pywebview")
    sys.exit(1)

HERE = Path(__file__).parent


def selftest(window):
    """Drive the page's own smoke test (window.__smoke) through WKWebView —
    WebKit is Safari's engine, so this doubles as the Safari lap. Prints
    SELFTEST PASS/FAIL plus the per-check breakdown. Used by --selftest."""
    import json
    import time

    # Wait for the app (data + smoke hook) to be ready.
    for _ in range(40):
        time.sleep(0.5)
        try:
            if window.evaluate_js("window.DECKS && window.__smoke ? 1 : 0"):
                break
        except Exception:
            pass

    # __smoke is async; stash its result on window and poll for it.
    window.evaluate_js(
        "window.__smoke().then(r => { window.__smokeResult = JSON.stringify(r); })"
    )
    raw = None
    for _ in range(60):
        time.sleep(0.5)
        try:
            raw = window.evaluate_js("window.__smokeResult || null")
            if raw:
                break
        except Exception:
            pass

    if not raw:
        print("SELFTEST FAIL timeout — __smoke never returned", flush=True)
    else:
        res = json.loads(raw)
        failed = [k for k, ok in res.get("checks", {}).items() if not ok]
        status = "PASS" if res.get("pass") else "FAIL"
        detail = f"{len(res.get('checks', {}))} checks"
        if failed:
            detail += ", failed: " + ", ".join(failed)
        if res.get("errors"):
            detail += ", js errors: " + "; ".join(res["errors"][:3])
        print(f"SELFTEST {status} ({detail})", flush=True)
    window.destroy()


def main():
    parser = argparse.ArgumentParser(description="Diana decklist comparator app")
    parser.add_argument("--fetch", action="store_true",
                        help="Run fetch_decks.py before opening")
    parser.add_argument("--selftest", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.fetch:
        subprocess.run([sys.executable, str(HERE / "fetch_decks.py")], check=False)

    index = HERE / "index.html"
    if not index.exists():
        sys.exit(f"{index} not found")
    if not (HERE / "decks.js").exists():
        print("No deck data yet — run: python3 fetch_decks.py")

    window = webview.create_window("Diana Deck Lab", index.as_uri(),
                                   width=1080, height=860, min_size=(720, 500))
    if args.selftest:
        webview.start(selftest, window)
    else:
        webview.start()


if __name__ == "__main__":
    main()
