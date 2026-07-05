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
    """Open, wait for the page to render, report, close. Used by --selftest."""
    import time
    decks = sections = 0
    for _ in range(40):
        time.sleep(0.5)
        try:
            decks = window.evaluate_js("window.DECKS ? window.DECKS.length : 0") or 0
            sections = window.evaluate_js("document.querySelectorAll('h2').length") or 0
            if decks and sections:
                break
        except Exception:
            pass
    print(f"SELFTEST decks={decks} sections={sections}", flush=True)
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
