#!/usr/bin/env python3
"""
fetch_decks.py

Fetches Riftbound decklists from Mobalytics deck pages for every legend in
db.LEGENDS (the archetypes the viewer lets you build around), parses each
into card name/count, and stores them in riftbound.db (see db.py). Card
images and metadata come from the cards table (populate it first with
import_cards.py). Finally exports decks.json for index.html to display.

Usage:
    python3 import_cards.py   # once, and occasionally for new sets
    python3 fetch_decks.py

Ships with real tournament results in decks_config.json, one slice per
db.LEGENDS archetype (Diana's June 2026 regional circuit results: Vancouver
1st, Hartford 2nd, Top 4s, one Top 8; Irelia's slice seeded from decks the
meta-scraper had already found). Add more with --add-url --legend <slug>
or by editing decks_config.json, then re-run.

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
OUTPUT_FILE = Path(__file__).parent / "frontend" / "public" / "decks.json"

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
# One prefix per legend the viewer lets you build around (db.LEGENDS) — a
# sitemap slug starting with one of these is "our" archetype, either a
# tournament result (has a placement token, see parse_deck_slug) or a ladder
# brew (doesn't). Everything else is meta context (fetch_meta_decks).
PRIMARY_PREFIXES = {archetype: archetype + "-" for archetype in db.LEGENDS}
PLACEMENT_WEIGHTS = {"1st": 3.0, "2nd": 2.0, "3rd": 1.75,
                     "top-4": 1.5, "top-8": 1.0, "top-16": 0.75,
                     # Event showcase decks ("Best of <event>") — real event
                     # lists with no placement evidence. They enrich archetype
                     # profiles but are excluded from every top-cut statistic.
                     "best-of": 0.5}
EVENT_NOISE = {"s3", "regional", "qualifier", "open"}  # dropped from short labels


# Event portion of a tournament slug: "<city>-regional-qualifier" or
# "s3-regional-open-<city>", sitting between the archetype and the placement.
EVENT_SLUG_RE = re.compile(r"((?:[a-z]+-regional-qualifier)|(?:s3-regional-open-[a-z]+))$")
PLACEMENT_SLUG_RE = re.compile(r"(?:^|-)(1st|2nd|3rd|top-4|top-8|top-16|best-of)(?:-|$)")


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
    if placement_slug == "best-of":
        placement = "Best of"
    elif placement_slug.startswith("top-"):
        placement = "Top " + placement_slug.split("-")[1]
    else:
        placement = placement_slug
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

    config is {legend_archetype: {label: [url, placement, event, weight]}}
    for every db.LEGENDS entry. Decks of any of those archetypes are merged
    into their own slice of config (returned count drives a config save);
    every other archetype's deck is returned in a list for the meta fetch
    pass. Slugs without a placement token are user brews and are skipped.
    """
    try:
        xml = fetch_page(SITEMAP_URL)
    except Exception as e:
        print(f"Deck discovery failed ({e}); continuing with configured decks")
        return 0, [], []

    existing_urls = {v[0] for cfg in config.values() for v in cfg.values()}
    added, meta_decks, ladder, skipped = 0, [], [], 0
    for url in re.findall(r"<loc>(https://mobalytics\.gg/riftbound/decks/[^<]+)</loc>", xml):
        slug = url.rsplit("/", 1)[1]
        info = parse_deck_slug(slug)
        if not info:
            # No placement token: a user brew. Brews of a LEGENDS archetype
            # feed that legend's opt-in ladder tier; everything else stays
            # skipped.
            prefix = next((p for p in PRIMARY_PREFIXES.values() if slug.startswith(p)), None)
            if prefix:
                archetype = next(a for a, p in PRIMARY_PREFIXES.items() if p == prefix)
                ladder.append((url, archetype))
            else:
                skipped += 1
            continue
        if info["archetype"] in config:
            if url in existing_urls:
                continue
            if info["placement"] == "Best of":
                # Showcase lists carry no placement evidence — they go to the
                # opt-in brews tier, never into the consensus config.
                ladder.append((url, info["archetype"]))
                continue
            legend_cfg = config[info["archetype"]]
            label = f"{info['player']} - {info['short_event']} {info['placement']}"
            if label in legend_cfg:
                label = f"{label} ({slug[-6:]})"
            legend_cfg[label] = [url, info["placement"], info["event"], info["weight"]]
            print(f"Discovered: {label} ({info['archetype']})")
            added += 1
        else:
            meta_decks.append({**info, "url": url, "slug": slug})
    # Growth failures on sitemap scraping are silent by nature — report what
    # the run chose not to parse so a naming change is visible in the cron log.
    print(f"Sitemap: {added} new legend tournament, {len(meta_decks)} meta candidates, "
          f"{len(ladder)} legend ladder brews, {skipped} other-archetype brews skipped")
    return added, meta_decks, ladder


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


def fetch_ladder_decks(conn, ladder_urls, cap=30):
    """Fetch ladder brews — sitemap decks of a LEGENDS archetype with no
    placement token.

    ladder_urls is a list of (url, archetype) pairs. They carry no tournament
    result, so they are stored under the synthetic 'Mobalytics Ladder' event
    with placement 'Ladder' and half weight, tagged with their own archetype.
    The db.py exports keep them out of every consensus, meta and field
    statistic; the viewer shows them only behind an opt-in filter chip. Capped
    per run to keep the weekly cron bounded — the known-URL skip lets later
    runs catch up.
    """
    known = {r[0] for r in conn.execute("SELECT url FROM decks WHERE url IS NOT NULL")}
    todo = [(u, a) for u, a in ladder_urls if u not in known][:cap]
    if not todo:
        return 0
    print(f"Fetching {len(todo)} ladder brews (of {len(ladder_urls)} in the sitemap) ...")
    fetched = 0
    for url, archetype in todo:
        slug = url.rsplit("/", 1)[1]
        try:
            html = fetch_page(url)
        except Exception as e:
            print(f"  Failed {slug}: {e}")
            continue
        parsed = parse_decklist(html)
        if not parsed or not parsed.get("cards"):
            print(f"  No cards parsed for {slug}")
            continue
        prefix = PRIMARY_PREFIXES[archetype]
        pretty = slug[len(prefix):].replace("-", " ").strip() or slug
        label = f"{pretty} - Ladder"
        db.upsert_deck(conn, label, db.LADDER_PLACEMENT, db.LADDER_EVENT, 0.5, url, {
            "main": parsed["cards"],
            "rune": parsed["runes"],
            "battlefield": parsed["battlefields"],
            "side": parsed["sideboard"],
        }, event_date=parsed.get("date"), archetype=archetype)
        fetched += 1
        if fetched % 10 == 0:
            conn.commit()
            print(f"  ... {fetched}/{len(todo)}")
        time.sleep(0.5)
    conn.commit()
    print(f"  Stored {fetched} ladder brews")
    return fetched


def load_config():
    """Load decks_config.json as {legend_archetype: {label: [url, placement,
    event, weight]}} — one slice per db.LEGENDS entry. Older files predating
    multi-legend support are a flat {label: [...]} dict for Diana alone;
    those are wrapped under db.DEFAULT_LEGEND on first read."""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
    else:
        config = {db.DEFAULT_LEGEND: DEFAULT_DECK_URLS}
    if config and not any(isinstance(v, dict) for v in config.values()):
        config = {db.DEFAULT_LEGEND: config}   # legacy flat shape
    for archetype in db.LEGENDS:
        config.setdefault(archetype, {})
    return config

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)


def fetch_page(url):
    resp = scraper.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.text
class ScraperAdapter:
    def parse_decklist(self, html):
        raise NotImplementedError

class MobalyticsScraper(ScraperAdapter):
    def slice_between(self, text, start_kw, end_kws):
        if start_kw not in text:
            return ""
        section = text.split(start_kw, 1)[1]
        cut = len(section)
        for kw in end_kws:
            pos = section.find(kw)
            if pos != -1:
                cut = min(cut, pos)
        return section[:cut]

    def parse_decklist(self, html):
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
            self.slice_between(full_text, "Main Deck", ["Sideboard", "Chosen Champion", "Explore more"]),
            r"[1-3]",
        )
        sideboard = parse_counted(
            self.slice_between(full_text, "Sideboard", ["Chosen Champion", "Explore more"]),
            r"[1-3]",
        )
        runes = parse_counted(
            self.slice_between(full_text, "Runes", ["Battlefields", "Main Deck"]),
            r"\d{1,2}",
        )

        battlefields = {}
        bf_re = re.compile(r"([A-Z][A-Za-z',\-\s]+?)\s*\(\d+\)")
        for m in bf_re.finditer(self.slice_between(full_text, "Battlefields", ["Main Deck"])):
            name = m.group(1).strip()
            battlefields[name] = battlefields.get(name, 0) + 1

        legend = self.slice_between(full_text, "Decklist Legend", ["Runes"]).strip() or None
        if legend and len(legend) > 60:
            legend = None

        date = None
        m = re.search(r"Updated on ([A-Z][a-z]{2} \d{1,2}, \d{4})", full_text)
        if m:
            try:
                date = datetime.strptime(m.group(1), "%b %d, %Y").date().isoformat()
            except ValueError:
                pass

        return {"cards": cards, "sideboard": sideboard, "runes": runes,
                "battlefields": battlefields, "legend": legend, "date": date}

def parse_decklist(html):
    return MobalyticsScraper().parse_decklist(html)


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
    parser.add_argument("--legend", help=f"Which legend archetype --add-url belongs to "
                        f"(one of {', '.join(db.LEGENDS)})", default=db.DEFAULT_LEGEND)
    parser.add_argument("--no-discover", action="store_true",
                        help="Skip sitemap discovery of new tournament decks")
    args = parser.parse_args()

    deck_config = load_config()

    if args.add_url:
        if args.legend not in db.LEGENDS:
            print(f"Unknown --legend {args.legend!r} (known: {', '.join(db.LEGENDS)})")
            sys.exit(1)
        deck_config[args.legend][args.label] = [args.add_url, args.placement, args.event, args.weight]
        save_config(deck_config)
        print(f"Added {args.label} ({args.legend}) to config.")

    meta_decks, ladder_urls = [], []
    if not args.no_discover:
        added, meta_decks, ladder_urls = discover_decks(deck_config)
        if added:
            save_config(deck_config)

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = db.connect()
    if conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 0:
        print("Card catalogue is empty — run python3 import_cards.py first "
              "(images and cost/type data come from it).")

    fetched = 0
    for legend_archetype, legend_cfg in deck_config.items():
        for label, data in legend_cfg.items():
            url, placement, event, weight = data
            print(f"Fetching {label} ({legend_archetype}) ...")
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
            }, event_date=parsed.get("date"), archetype=legend_archetype)
            fetched += 1
            print(f"  Parsed {len(parsed['cards'])} main + {sum(parsed['sideboard'].values())} side cards")
            time.sleep(1)

    conn.commit()
    meta_fetched = fetch_meta_decks(conn, meta_decks) if meta_decks else 0
    ladder_fetched = fetch_ladder_decks(conn, ladder_urls) if ladder_urls else 0
    total = db.export_decks_json(conn)
    events = db.export_meta_json(conn)
    db.export_cards_json(conn)
    archetypes, _ = db.export_field_json(conn)
    conn.commit()
    conn.close()
    print(f"\nStored {fetched} legend + {meta_fetched} new meta decks + {ladder_fetched} ladder brews; "
          f"exported {total} legend decks, meta for {events} events, "
          f"{archetypes} archetypes to field.json")
    print("Open index.html (via a local server or GitHub Pages) to see the comparison.")


if __name__ == "__main__":
    main()
