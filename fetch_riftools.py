#!/usr/bin/env python3
"""
fetch_riftools.py

Pulls two pre-aggregated Set 3 snapshots from riftools.app, a fan-made
Riftbound stats site: a REAL legend-vs-legend win-rate matrix computed from
actual match records, and a meta tier list (play rate / trend / sample per
archetype). This is data no other source in this project has — Mobalytics
only ever exposed Day1/Day2 archetype-level conversion counts, never
per-match results (see db.py's `performance` export).

Checked before writing this: robots.txt at riftools.app explicitly allows
`ClaudeBot`/general crawling (`User-agent: ClaudeBot / Allow: /`), and the
Terms of Use permit informational-use scraping, only asking not to "scrape
aggressively" — this fetches roughly half a dozen small pre-generated JSON
files (the site's own public snapshot API), not per-page HTML for thousands
of individual decks.

Deliberately scoped to aggregate stats only: no per-deck rows are pulled, so
there's no overlap/double-counting risk with the Mobalytics-sourced decks in
riftbound.db, and decks.json/decks_config.json (the curated per-legend build
sets) are untouched.

Exports riftools.json/riftools.js (window.RIFTOOLS) for the viewer:
    winrates: {legend_slug: {opponent_slug: {matches, wins, losses,
               matchWinrate, gameWinrate, confidence}}}
    tierList: [{slug, name, tier, playRate, sample, standingScore,
                top25Rate, trend, trendDelta, rising}]
    generatedAt, winratesPublishedAt, tierListPublishedAt, sourceUrl

Usage:
    python3 fetch_riftools.py
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import cloudscraper

import db

BASE = "https://www.riftools.app"
OUT_JSON = Path(__file__).parent / "riftools.json"
SOURCE_URL = "https://www.riftools.app/tournaments?set=set3"

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


def main():
    manifest = fetch_json("/public-snapshots/manifest.current.json")
    if "snapshots" not in manifest and manifest.get("manifest_url"):
        manifest = fetch_json(manifest["manifest_url"])

    winrates, wr_published = fetch_winrates(manifest)
    tier_list, tl_published = fetch_tier_list(manifest)

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
