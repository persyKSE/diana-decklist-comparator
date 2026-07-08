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

SITEMAP_URL = "https://mobalytics.gg/riftbound/sitemap.xml"
ARCHETYPE_PREFIX = "diana-scorn-of-the-moon-"
PLACEMENT_WEIGHTS = {"1st": 3.0, "2nd": 2.0, "3rd": 1.75,
                     "top-4": 1.5, "top-8": 1.0, "top-16": 0.75}
EVENT_NOISE = {"s3", "regional", "qualifier", "open"}  # dropped from short labels


# Event portion of a tournament slug: "<city>-regional-qualifier" or
# "s3-regional-open-<city>", sitting between the archetype and the placement.
EVENT_SLUG_RE = re.compile(r"((?:[a-z]+-regional-qualifier)|(?:s3-regional-open-[a-z]+))$")
PLACEMENT_SLUG_RE = re.compile(r"(?:^|-)(1st|2nd|3rd|top-4|top-8|top-16)(?:-|$)")


def parse_deck_slug(slug):
    """Split a tournament deck slug into archetype/event/placement/player.

    Slugs look like <archetype>-<event>-<placement>-<player>. Returns None
    for slugs without a placement token (user brews) or without a
    recognizable event pattern.
    """
    m = PLACEMENT_SLUG_RE.search(slug)
    if not m:
        return None
    placement_slug = m.group(1)
    prefix = slug[:m.start()]
    player = slug[m.end():].replace("-", " ").strip()
    em = EVENT_SLUG_RE.search(prefix)
    if not em:
        return None
    event_slug = em.group(1)
    archetype = prefix[:em.start()].rstrip("-")
    if not archetype:
        return None
    event_words = event_slug.split("-")
    event = " ".join(w.upper() if w == "s3" else w.capitalize() for w in event_words)
    short_event = " ".join(w.capitalize() for w in event_words if w not in EVENT_NOISE) or event
    placement = ("Top " + placement_slug.split("-")[1]) if placement_slug.startswith("top-") else placement_slug
    return {
        "archetype": archetype,
        "event": event,
        "short_event": short_event,
        "placement": placement,
        "weight": PLACEMENT_WEIGHTS.get(placement_slug, 1.0),
        "player": player,
    }


def discover_decks(config):
    """Scan the sitemap for tournament decklists of every archetype.

    Diana decks are merged into decks_config.json (returned count drives a
    config save); every other archetype's deck is returned in a list for
    the meta fetch pass. Slugs without a placement token are user brews
    and are skipped.
    """
    try:
        xml = fetch_page(SITEMAP_URL)
    except Exception as e:
        print(f"Deck discovery failed ({e}); continuing with configured decks")
        return 0, []

    existing_urls = {v[0] for v in config.values()}
    added, meta_decks = 0, []
    for url in re.findall(r"<loc>(https://mobalytics\.gg/riftbound/decks/[^<]+)</loc>", xml):
        slug = url.rsplit("/", 1)[1]
        info = parse_deck_slug(slug)
        if not info:
            continue
        if info["archetype"] == db.DIANA_ARCHETYPE:
            if url in existing_urls:
                continue
            label = f"{info['player']} - {info['short_event']} {info['placement']}"
            if label in config:
                label = f"{label} ({slug[-6:]})"
            config[label] = [url, info["placement"], info["event"], info["weight"]]
            print(f"Discovered: {label}")
            added += 1
        else:
            meta_decks.append({**info, "url": url, "slug": slug})
    return added, meta_decks


def fetch_meta_decks(conn, meta_decks):
    """Fetch non-Diana tournament decks not yet in the DB (meta context).

    Card images are not downloaded for these — only names/counts matter
    for meta share and cross-archetype baselines.
    """
    known = {r[0] for r in conn.execute("SELECT url FROM decks WHERE url IS NOT NULL")}
    todo = [m for m in meta_decks if m["url"] not in known]
    if not todo:
        return 0
    print(f"Fetching {len(todo)} new meta decks (other archetypes) ...")
    fetched = 0
    for m in todo:
        try:
            html = fetch_page(m["url"])
        except Exception as e:
            print(f"  Failed {m['slug']}: {e}")
            continue
        parsed = parse_decklist(html)
        if not parsed or not parsed.get("cards"):
            print(f"  No cards parsed for {m['slug']}")
            continue
        arch = parsed.get("legend") or m["archetype"].replace("-", " ").title()
        label = f"{m['player']} - {m['short_event']} {m['placement']} ({arch})"
        db.upsert_deck(conn, label, m["placement"], m["event"], m["weight"], m["url"], {
            "main": parsed["cards"],
            "rune": parsed["runes"],
            "battlefield": parsed["battlefields"],
            "side": parsed["sideboard"],
        }, event_date=parsed.get("date"), archetype=m["archetype"])
        fetched += 1
        if fetched % 25 == 0:
            conn.commit()
            print(f"  ... {fetched}/{len(todo)}")
        time.sleep(0.5)
    conn.commit()
    print(f"  Stored {fetched} meta decks")
    return fetched


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
    sideboard = parse_counted(
        slice_between(full_text, "Sideboard", ["Chosen Champion", "Explore more"]),
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

    # "Legend <name>" between the decklist header and the runes section
    legend = slice_between(full_text, "Decklist Legend", ["Runes"]).strip() or None
    if legend and len(legend) > 60:
        legend = None

    # "Updated on Jun 17, 2026" — best available proxy for the event date
    date = None
    m = re.search(r"Updated on ([A-Z][a-z]{2} \d{1,2}, \d{4})", full_text)
    if m:
        try:
            date = datetime.strptime(m.group(1), "%b %d, %Y").date().isoformat()
        except ValueError:
            pass

    return {"cards": cards, "sideboard": sideboard, "runes": runes,
            "battlefields": battlefields, "legend": legend, "date": date}


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
    parser.add_argument("--no-discover", action="store_true",
                        help="Skip sitemap discovery of new tournament decks")
    args = parser.parse_args()

    deck_config = load_config()

    if args.add_url:
        deck_config[args.label] = [args.add_url, args.placement, args.event, args.weight]
        save_config(deck_config)
        print(f"Added {args.label} to config.")

    meta_decks = []
    if not args.no_discover:
        added, meta_decks = discover_decks(deck_config)
        if added:
            save_config(deck_config)

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

        for name in list(parsed["cards"]) + list(parsed["sideboard"]):
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
            "side": parsed["sideboard"],
        }, event_date=parsed.get("date"))
        fetched += 1
        print(f"  Parsed {len(parsed['cards'])} main + {sum(parsed['sideboard'].values())} side cards")
        time.sleep(1)

    conn.commit()
    meta_fetched = fetch_meta_decks(conn, meta_decks) if meta_decks else 0
    total = db.export_decks_json(conn)
    events = db.export_meta_json(conn)
    db.export_cards_json(conn)
    archetypes, _ = db.export_field_json(conn)
    conn.commit()
    conn.close()
    print(f"\nStored {fetched} Diana + {meta_fetched} new meta decks; "
          f"exported {total} Diana decks, meta for {events} events, "
          f"{archetypes} archetypes to field.json")
    print("Open index.html (via a local server or GitHub Pages) to see the comparison.")


if __name__ == "__main__":
    main()
