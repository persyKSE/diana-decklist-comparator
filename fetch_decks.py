#!/usr/bin/env python3
"""
fetch_decks.py

Fetches Riftbound Diana decklists from Mobalytics deck pages, parses each
into card name/count, and stores them in riftbound.db (see db.py). Card
images and metadata come from the cards table (populate it first with
import_cards.py). Finally exports decks.json for index.html to display.

Usage:
    python3 import_cards.py   # once, and occasionally for new sets
    python3 fetch_decks.py

Ships with real tournament results in decks_config.json (Vancouver 1st,
Hartford 2nd, Top 4s, one Top 8) from the June 2026 regional circuit.
Add more with --add-url or by editing decks_config.json, then re-run.

Requires: cloudscraper, beautifulsoup4
    pip3 install cloudscraper beautifulsoup4
"""

import json
import re
import sys
import time
import argparse
import os
from datetime import datetime
from pathlib import Path

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip3 install cloudscraper beautifulsoup4")
    sys.exit(1)

import db

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
}

scraper = cloudscraper.create_scraper()

CACHE_DIR = Path(__file__).parent / "cache"
IMAGE_DIR = CACHE_DIR / "images"
OUTPUT_FILE = Path(__file__).parent / "decks.json"

CONFIG_FILE = Path(__file__).parent / "decks_config.json"

DEFAULT_DECK_URLS = {
    "Alanzq - Vancouver 1st": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-vancouver-regional-qualifier-1st-alanzq",
        "1st", "Vancouver Regional Qualifier", 3.0
    ),
    "bsweitz - Hartford 2nd": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-hartford-regional-qualifier-2nd-bsweitz",
        "2nd", "Hartford Regional Qualifier", 2.0
    ),
    "Dhawally - Vancouver Top 4": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-vancouver-regional-qualifier-top-4-dhawally",
        "Top 4", "Vancouver Regional Qualifier", 1.5
    ),
    "Dhawally - Utrecht Top 4": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-utrecht-regional-qualifier-top-4-dhawally",
        "Top 4", "Utrecht Regional Qualifier", 1.5
    ),
    "linsanity - Hartford Top 4": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-hartford-regional-qualifier-top-4-linsanity",
        "Top 4", "Hartford Regional Qualifier", 1.5
    ),
    "nice boy - Sydney Top 4": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-sydney-regional-qualifier-top-4-nice-boy",
        "Top 4", "Sydney Regional Qualifier", 1.5
    ),
    "CTG Alanzq - Sydney Top 8": (
        "https://mobalytics.gg/riftbound/decks/diana-scorn-of-the-moon-sydney-regional-qualifier-top-8-ctg-alanzq",
        "Top 8", "Sydney Regional Qualifier", 1.0
    ),
}

def load_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    else:
        with open(CONFIG_FILE, "w") as f:
            json.dump(DEFAULT_DECK_URLS, f, indent=4)
        return DEFAULT_DECK_URLS

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)


def fetch_page(url):
    resp = scraper.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.text


def slice_between(text, start_kw, end_kws):
    """Text after the first start_kw, cut at the earliest of end_kws."""
    if start_kw not in text:
        return ""
    section = text.split(start_kw, 1)[1]
    cut = len(section)
    for kw in end_kws:
        pos = section.find(kw)
        if pos != -1:
            cut = min(cut, pos)
    return section[:cut]


def parse_decklist(html):
    """
    Extract card name/count pairs from a Mobalytics deck page.

    The page text lays the decklist out as:

        Legend <name> Runes 6 Mind Rune 6 Chaos Rune
        Battlefields Abandoned Hall (205) Targon's Peak (289) ...
        Main Deck 1 Diana, Lunari 3 Ravenbloom Student ...
        Sideboard ...

    Entries are separated only by whitespace (no reliable delimiter), so
    a naive "digit followed by words" regex over-matches and swallows
    every subsequent card into one giant name. Instead, each section is
    sliced by its heading and split on "count boundaries" — positions
    where a small integer appears — treating the text between one count
    and the next as the card name. Main-deck counts are 1-3; rune counts
    go up to 12. Battlefields have no counts at all, just names followed
    by a collector number in parens, one copy each.
    """
    soup = BeautifulSoup(html, "html.parser")
    full_text = re.sub(r"\s+", " ", soup.get_text(separator=" "))

    if "Main Deck" not in full_text:
        return {}

    def parse_counted(section, count_re):
        entry_re = re.compile(
            r"(?<!\d)(" + count_re + r")\s+(.+?)(?=(?:(?<!\d)" + count_re + r"\s+)|$)"
        )
        out = {}
        for m in entry_re.finditer(section):
            name = m.group(2).strip()
            if 3 <= len(name) <= 60:
                out[name] = out.get(name, 0) + int(m.group(1))
        return out

    cards = parse_counted(
        slice_between(full_text, "Main Deck", ["Sideboard", "Chosen Champion", "Explore more"]),
        r"[1-3]",
    )
    runes = parse_counted(
        slice_between(full_text, "Runes", ["Battlefields", "Main Deck"]),
        r"\d{1,2}",
    )

    battlefields = {}
    bf_re = re.compile(r"([A-Z][A-Za-z',\- ]+?)\s*\(\d+\)")
    for m in bf_re.finditer(slice_between(full_text, "Battlefields", ["Main Deck"])):
        name = m.group(1).strip()
        battlefields[name] = battlefields.get(name, 0) + 1

    # "Updated on Jun 17, 2026" — best available proxy for the event date
    date = None
    m = re.search(r"Updated on ([A-Z][a-z]{2} \d{1,2}, \d{4})", full_text)
    if m:
        try:
            date = datetime.strptime(m.group(1), "%b %d, %Y").date().isoformat()
        except ValueError:
            pass

    return {"cards": cards, "runes": runes, "battlefields": battlefields, "date": date}


def download_image(url, dest_path):
    if dest_path.exists():
        return True
    try:
        resp = scraper.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200 and resp.content:
            dest_path.write_bytes(resp.content)
            return True
    except Exception:
        pass
    return False

def main():
    parser = argparse.ArgumentParser(description="Fetch Riftbound decklists.")
    parser.add_argument("--add-url", help="Add a new deck URL to config and fetch")
    parser.add_argument("--label", help="Label for the new deck (e.g. 'Player - Event 1st')", default="New Deck")
    parser.add_argument("--placement", help="Placement (e.g. '1st', 'Top 4')", default="Unknown")
    parser.add_argument("--event", help="Event name", default="Unknown Event")
    parser.add_argument("--weight", type=float, help="Deck weight", default=1.0)
    args = parser.parse_args()

    deck_config = load_config()

    if args.add_url:
        deck_config[args.label] = [args.add_url, args.placement, args.event, args.weight]
        save_config(deck_config)
        print(f"Added {args.label} to config.")

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = db.connect()
    if conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 0:
        print("Card catalogue is empty — run python3 import_cards.py first "
              "(images and cost/type data come from it).")

    fetched = 0
    for label, data in deck_config.items():
        url, placement, event, weight = data
        print(f"Fetching {label} ...")
        try:
            html = fetch_page(url)
        except Exception as e:
            print(f"  Failed: {e}")
            continue

        parsed = parse_decklist(html)
        if not parsed or not parsed.get("cards"):
            print(f"  Warning: no cards parsed for {label}, check page structure")
            continue

        for name in parsed["cards"]:
            card = db.lookup_card(conn, name)
            if not card:
                print(f"  Unknown card (not in catalogue): {name}")
            elif card["image_url"]:
                download_image(card["image_url"], db.local_image_path(name))

        for section, expected_type in (("runes", "Rune"), ("battlefields", "Battlefield")):
            for name in parsed[section]:
                card = db.lookup_card(conn, name)
                if not card or card["type"] != expected_type:
                    print(f"  Suspect {expected_type.lower()} entry "
                          f"(catalogue type: {card['type'] if card else 'not found'}): {name}")

        db.upsert_deck(conn, label, placement, event, weight, url, {
            "main": parsed["cards"],
            "rune": parsed["runes"],
            "battlefield": parsed["battlefields"],
        }, event_date=parsed.get("date"))
        fetched += 1
        print(f"  Parsed {len(parsed['cards'])} unique cards")
        time.sleep(1)

    conn.commit()
    total = db.export_decks_json(conn)
    conn.close()
    print(f"\nStored {fetched} fetched decks; exported {total} decks to {OUTPUT_FILE}")
    print("Open index.html (via a local server or GitHub Pages) to see the comparison.")


if __name__ == "__main__":
    main()
