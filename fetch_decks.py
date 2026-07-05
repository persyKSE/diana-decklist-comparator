#!/usr/bin/env python3
"""
fetch_decks.py

Fetches Riftbound Diana decklists from Mobalytics deck pages, parses each
into card name/count, resolves card images where known, and writes
everything to decks.json for viewer.html to display.

Usage:
    python3 fetch_decks.py

Ships with five real tournament results already in DECK_URLS below
(Vancouver 1st, Hartford 2nd, two Top 4s, one Top 8) from the June 2026
NA/OCE regional circuit. Add more URLs to DECK_URLS as new results come
in, then re-run the script.

Requires: requests, beautifulsoup4
    pip3 install requests beautifulsoup4
"""

import json
import re
import sys
import time
import argparse
import os
from pathlib import Path

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip3 install cloudscraper beautifulsoup4")
    sys.exit(1)

from card_codes import get_image_url

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


def parse_decklist(html):
    """
    Extract main deck card name/count pairs from a Mobalytics deck page.

    Mobalytics renders each card entry as "<count> <icon> <Card Name>"
    with entries separated only by whitespace (no reliable delimiter),
    all inside one block of text for the whole Main Deck section. So a
    naive "digit followed by words" regex over-matches and swallows
    every subsequent card into one giant name.

    The fix: since every entry starts with a 1-3 digit count, split the
    whole section on "count boundaries" — positions where a small
    integer appears — and treat the text between one count and the next
    as "icon-alt-text (ignored) + card name". Card names are Title Case
    and may contain a comma (e.g. "Vex, Cheerless"); this pattern holds
    across all Riftbound card names seen so far.
    """
    soup = BeautifulSoup(html, "html.parser")
    full_text = soup.get_text(separator=" ")

    if "Main Deck" not in full_text:
        return {}

    section = full_text.split("Main Deck", 1)[1]
    if "Sideboard" in section:
        section = section.split("Sideboard", 1)[0]

    # Split into tokens on count boundaries: a standalone 1-2 digit number.
    # Each match below captures (count, everything up to the next count).
    entry_re = re.compile(r"(?<!\d)([1-3])\s+(.+?)(?=(?:(?<!\d)[1-3]\s+)|$)", re.DOTALL)

    cards = {}
    runes = {}
    battlefields = {}
    
    for m in entry_re.finditer(section):
        count = int(m.group(1))
        raw_name = m.group(2).strip()
        # Card name is the last comma-containing-or-not title-case phrase
        # before the next count; strip trailing/leading whitespace and
        # collapse multiple spaces left over from removed icon alt text.
        name = re.sub(r"\s+", " ", raw_name).strip()
        
        if len(name) < 3 or len(name) > 60:
            continue
            
        if "Rune" in name:
            runes[name] = runes.get(name, 0) + count
        elif name in ("Abandoned Hall", "Targon's Peak", "Ravenbloom Conservatory", "Rockfall Path", "Seat of Power"): # Basic battlefield check
            battlefields[name] = battlefields.get(name, 0) + count
        else:
            cards[name] = cards.get(name, 0) + count

    return {"cards": cards, "runes": runes, "battlefields": battlefields}


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

def prompt_for_card_code(name):
    print(f"Image code not found for '{name}'.")
    if not sys.stdout.isatty():
        return None
    code = input(f"Enter set code for '{name}' (e.g., UNL-080) or press Enter to skip: ").strip()
    if code:
        card_codes_path = Path(__file__).parent / "card_codes.py"
        content = card_codes_path.read_text()
        new_entry = f'    "{name}": "{code}",\n'
        if "CARD_CODES = {" in content:
            content = content.replace("CARD_CODES = {", f"CARD_CODES = {{\n{new_entry}")
            card_codes_path.write_text(content)
            print(f"Added {name} -> {code} to card_codes.py")
            return f"https://static.dotgg.gg/riftbound/cards/{code}.webp"
    return None


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
    decks_out = []

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

        card_entries = []
        for name, count in parsed["cards"].items():
            img_url = get_image_url(name)
            if not img_url:
                img_url = prompt_for_card_code(name)
                
            local_img = None
            if img_url:
                filename = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_") + ".webp"
                dest = IMAGE_DIR / filename
                if download_image(img_url, dest):
                    local_img = f"cache/images/{filename}"
            card_entries.append({
                "name": name,
                "count": count,
                "image": local_img
            })

        decks_out.append({
            "label": label,
            "placement": placement,
            "event": event,
            "weight": weight,
            "url": url,
            "cards": card_entries,
            "runes": [{"name": n, "count": c} for n, c in parsed["runes"].items()],
            "battlefields": [{"name": n, "count": c} for n, c in parsed["battlefields"].items()]
        })
        print(f"  Parsed {len(card_entries)} unique cards")
        time.sleep(1)

    OUTPUT_FILE.write_text(json.dumps(decks_out, indent=2))
    print(f"\nWrote {len(decks_out)} decks to {OUTPUT_FILE}")
    print("Open viewer.html in a browser to see the comparison.")


if __name__ == "__main__":
    main()
