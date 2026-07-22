#!/usr/bin/env python3
"""
fetch_riftools.py

Pulls data from riftools.app, a fan-made Riftbound stats site, in two parts:

1. Aggregate snapshots (winrates_set3, meta_tier_list_set3) — a REAL
   legend-vs-legend win-rate matrix computed from actual match records, and
   a meta tier list. No other source this project uses has this: Mobalytics
   only ever exposed Day1/Day2 archetype-level conversion counts, never
   per-match results (see db.py's `performance` export). Exported to
   riftools.json/riftools.js (window.RIFTOOLS).

2. Per-deck data (the `decks` snapshot + `deck-details` index) — full main/
   rune/side card lists for every parsed tournament deck riftools tracks,
   FAR beyond Mobalytics' top-cut-only coverage (thousands of decks across
   huge premier events down to small locals). These are inserted into the
   SAME decks/deck_cards/events tables fetch_decks.py uses, tagged
   source='riftools', so they flow into field.json/meta.json's whole-field
   picture. They deliberately do NOT affect decks.json (db.py's
   export_decks_json filters source='mobalytics') — the curated per-legend
   consensus/coach/optimizer dataset is untouched.

Checked before writing this: robots.txt at riftools.app explicitly allows
`ClaudeBot`/general crawling (`User-agent: ClaudeBot / Allow: /`), and the
Terms of Use permit informational-use scraping, only asking not to "scrape
aggressively" — per-deck ingestion is rate-limited (SLEEP between requests)
and capped per run (DECK_CAP), prioritizing the biggest events and most
recent dates first; a full backfill happens incrementally across multiple
weekly cron runs via the standard known-URL skip.

Dedup: a riftools deck is skipped if either its own deck_url is already
known (already ingested), or its (normalized player name, event date) pair
matches an EXISTING deck from ANY source — this is what stops the same
real-world result from being double-counted when Mobalytics and riftools
both cover the same tournament (their event-name text differs enough between
the two sites — e.g. "Hartford Regional Qualifier" vs "Riftbound Regional
Qualifier - Hartford" — that name-matching isn't reliable, but the same
player playing on the same day is).

Usage:
    python3 fetch_riftools.py                 # aggregates + up to DECK_CAP new decks
    python3 fetch_riftools.py --no-decks       # aggregates only (old behavior)
    python3 fetch_riftools.py --deck-cap 3000  # override the per-run cap
"""
import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import cloudscraper

import db

BASE = "https://www.riftools.app"
OUT_JSON = Path(__file__).parent / "riftools.json"
SOURCE_URL = "https://www.riftools.app/tournaments?set=set3"
SOURCE_TAG = "riftools"

DECK_CAP = 1500          # new decks ingested per run — keeps one run's pace reasonable
SLEEP_BETWEEN_DETAILS = 0.12   # seconds between per-deck detail fetches

# card_type -> deck_cards.section; anything not listed here is treated as
# 'main' (Unit/Spell/Gear all live there in our schema, unlike riftools'
# per-card card_type tagging).
SECTION_FOR_TYPE = {
    "Runes": "rune",
    "Sideboard": "side",
    "Battlefield": "battlefield",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
}
scraper = cloudscraper.create_scraper()


def fetch_json(path):
    url = path if path.startswith("http") else BASE + path
    resp = scraper.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def legend_slug(name):
    """'Diana, Scorn of the Moon' -> 'diana-scorn-of-the-moon', matching this
    project's archetype-slug convention (db.slugify) so riftools legends line
    up with FIELD.archetypes/db.LEGENDS keys without a separate mapping table."""
    return db.slugify(name)


def normalize_player(name):
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


# riftools' own `placement` field is inconsistent across events — sometimes
# "#4", sometimes "#4 8-2-1" (rank + Swiss W-L-D record), sometimes just a
# record string with no "#" — which exploded the viewer's Placement filter
# into dozens of one-off chips. Bucket the clean integer `rank` field into
# the SAME bracket vocabulary Mobalytics decks already use (see
# fetch_decks.py's PLACEMENT_WEIGHTS) so filter chips stay a small, stable
# set and riftools/Mobalytics decks weight consistently. riftools tracks far
# deeper into the field than Mobalytics ever did, so two extra buckets
# (Top 32 / Swiss) cover ranks Mobalytics never published anything for.
def rank_to_placement(rank):
    if rank is None:
        return None, 0.5
    if rank == 1:
        return "1st", 3.0
    if rank == 2:
        return "2nd", 2.0
    if rank == 3:
        return "3rd", 1.75
    if rank <= 4:
        return "Top 4", 1.5
    if rank <= 8:
        return "Top 8", 1.0
    if rank <= 16:
        return "Top 16", 0.75
    if rank <= 32:
        return "Top 32", 0.5
    return "Swiss", 0.25


def fetch_winrates(manifest):
    entry = manifest["snapshots"]["winrates"]
    data = fetch_json(entry["url"])
    cells = data.get("cells", {})
    out = {}
    for row_legend, opponents in cells.items():
        row_slug = legend_slug(row_legend)
        row_out = {}
        for opp_legend, stats in opponents.items():
            row_out[legend_slug(opp_legend)] = {
                "matches": stats.get("matches"),
                "wins": stats.get("wins"),
                "losses": stats.get("losses"),
                "matchWinrate": stats.get("match_winrate"),
                "gameWinrate": stats.get("game_winrate"),
                "confidence": stats.get("confidence"),
            }
        out[row_slug] = row_out
    return out, entry.get("published_at")


def fetch_tier_list(manifest):
    entry = manifest["snapshots"]["meta-tier-list"]
    chunked = entry.get("chunked")
    items = []
    if chunked:
        for chunk in chunked["chunks"]:
            chunk_data = fetch_json(chunk["url"])
            items.extend(chunk_data.get("items", []))
            time.sleep(0.3)
    else:
        items = fetch_json(entry["url"]).get("items", [])
    out = []
    for it in items:
        name = it.get("legend") or it.get("name")
        if not name:
            continue
        out.append({
            "slug": legend_slug(name),
            "name": name,
            "tier": it.get("tier"),
            "playRate": it.get("play_rate"),
            "sample": it.get("sample"),
            "standingScore": it.get("standing_score"),
            "top25Rate": it.get("top25_rate"),
            "trend": it.get("trend"),
            "trendDelta": it.get("trend_delta"),
            "rising": it.get("rising"),
        })
    return out, entry.get("published_at")


def fetch_deck_summaries(manifest):
    """All parsed-deck summary rows (~5000 for Set 3): legend, placement,
    player, tournament, date, region, quality tier — everything except the
    actual card list, which lives behind deck-details."""
    entry = manifest["snapshots"]["decks"]
    chunked = entry.get("chunked")
    items = []
    if chunked:
        for chunk in chunked["chunks"]:
            chunk_data = fetch_json(chunk["url"])
            items.extend(chunk_data.get("items", []))
            time.sleep(0.2)
    else:
        items = fetch_json(entry["url"]).get("items", [])
    return items


def fetch_deck_details_index():
    """deck_url -> relative path of that deck's full card-list JSON. One
    request for the whole index (8500+ entries as of writing), not one per
    deck — the index itself already carries the exact key->path mapping."""
    data = fetch_json("/public-snapshots/deck-details/index.json")
    return data.get("details", {})


def parse_deck_detail(detail):
    """riftools' flat cards[] (each tagged Spell/Unit/Gear/Runes/Sideboard/
    Battlefield) -> our sections dict of {name: count}."""
    sections = {"main": {}, "rune": {}, "battlefield": {}, "side": {}}
    for c in detail.get("cards", []):
        name = c.get("card_name")
        count = c.get("count") or 0
        # The champion/legend card rides in this same flat array (card_type
        # "Legend") — it's a fixed always-present binder slot, not part of
        # the 40-card main deck, and must not be counted into it.
        if not name or not count or c.get("card_type") == "Legend":
            continue
        section = SECTION_FOR_TYPE.get(c.get("card_type"), "main")
        sections[section][name] = sections[section].get(name, 0) + count
    return sections


def ingest_decks(conn, manifest, deck_details_index, cap):
    known_urls = {r[0] for r in conn.execute("SELECT url FROM decks WHERE url IS NOT NULL")}
    known_player_dates = {
        (normalize_player(r[0]), r[1]) for r in conn.execute(
            "SELECT d.player, e.date FROM decks d LEFT JOIN events e ON e.id = d.event_id "
            "WHERE d.player IS NOT NULL AND e.date IS NOT NULL"
        )
    }

    summaries = fetch_deck_summaries(manifest)
    candidates = []
    for it in summaries:
        if it.get("parse_status") != "parsed" or it.get("last_error"):
            continue
        url = it.get("deck_url")
        player = it.get("player_name")
        date = it.get("event_date")
        legend = it.get("legend_name")
        if not (url and player and date and legend):
            continue
        if url in known_urls:
            continue
        if (normalize_player(player), date) in known_player_dates:
            continue
        if url not in deck_details_index:
            continue
        candidates.append(it)

    # Biggest, most significant events first; within that, most recent first —
    # if a run gets capped, the next weekly cron run picks up where this left
    # off. Two stable sorts (least-significant key first) rather than one
    # combined-tuple key, so "premier" always sorts before anything else
    # regardless of date formatting.
    candidates.sort(key=lambda it: it.get("event_date") or "", reverse=True)
    candidates.sort(key=lambda it: 0 if it.get("quality_tier") == "premier" else 1)

    todo = candidates[:cap]
    print(f"Deck ingestion: {len(summaries)} riftools decks total, {len(candidates)} new "
          f"(not already known from any source), processing {len(todo)} this run "
          f"({len(candidates) - len(todo)} left for next run)")

    fetched, failed = 0, 0
    for i, it in enumerate(todo):
        url = it["deck_url"]
        try:
            detail = fetch_json(BASE + deck_details_index[url])
        except Exception as e:
            print(f"  Failed detail fetch for {url}: {e}")
            failed += 1
            continue
        sections = parse_deck_detail(detail)
        if not sections["main"]:
            failed += 1
            continue
        archetype = legend_slug(it["legend_name"])
        placement, weight = rank_to_placement(it.get("rank"))
        rank_tag = f"#{it['rank']}" if it.get("rank") is not None else ""
        label = f"{it['player_name']} - {it['tournament_name']} {rank_tag} [riftools]".strip()
        db.upsert_deck(
            conn, label, placement, it["tournament_name"], weight, url,
            sections, event_date=it["event_date"], archetype=archetype,
            source=SOURCE_TAG, player=it["player_name"],
        )
        fetched += 1
        if fetched % 50 == 0:
            conn.commit()
            print(f"  ... {fetched}/{len(todo)}")
        time.sleep(SLEEP_BETWEEN_DETAILS)
    conn.commit()
    print(f"  Stored {fetched} riftools decks ({failed} failed/skipped)")
    return fetched


def main():
    parser = argparse.ArgumentParser(description="Fetch riftools.app aggregate + per-deck data.")
    parser.add_argument("--no-decks", action="store_true", help="Skip per-deck ingestion (aggregates only)")
    parser.add_argument("--deck-cap", type=int, default=DECK_CAP, help="Max new decks to ingest this run")
    args = parser.parse_args()

    manifest = fetch_json("/public-snapshots/manifest.current.json")
    if "snapshots" not in manifest and manifest.get("manifest_url"):
        manifest = fetch_json(manifest["manifest_url"])

    winrates, wr_published = fetch_winrates(manifest)
    tier_list, tl_published = fetch_tier_list(manifest)

    if not args.no_decks:
        conn = db.connect()
        deck_details_index = fetch_deck_details_index()
        ingest_decks(conn, manifest, deck_details_index, args.deck_cap)
        db.export_decks_json(conn)
        db.export_meta_json(conn)
        db.export_cards_json(conn)
        db.export_field_json(conn)
        conn.commit()
        conn.close()

    payload = {
        "source": "riftools.app",
        "sourceUrl": SOURCE_URL,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "winratesPublishedAt": wr_published,
        "tierListPublishedAt": tl_published,
        "winrates": winrates,
        "tierList": tier_list,
    }
    payload_json = json.dumps(payload, indent=1)
    OUT_JSON.write_text(payload_json)
    # .js mirror so index.html also works from file:// (see db.py exports)
    OUT_JSON.with_suffix(".js").write_text("window.RIFTOOLS = " + payload_json + ";\n")
    print(f"Exported riftools.json: {len(winrates)} legends in the winrate matrix, "
          f"{len(tier_list)} tier-list entries")


if __name__ == "__main__":
    main()
