#!/usr/bin/env python3
"""
fetch_tournaments.py

Scrapes Mobalytics' Riftbound tournament pages for the only *results* data
the format publishes: field size and the Day 1 -> Day 2 conversion table.

No per-player match records or standings are published anywhere on these
pages (checked: no "record", "standings", "Swiss", or W-L columns exist),
so per-decklist win rates remain unavailable. What we do get, per event:

    attendance             e.g. "Over 1800 players"
    date range             the actual weekend played
    per-legend Day 1 / Day 2 deck counts

Conversion rate (Day 2 count / Day 1 count) is a genuine archetype-level
performance measure: it says what fraction of the decks that showed up
survived into Day 2. An archetype converting above the field average
beat the field; below, it underperformed. Attendance additionally lets
decks from big events be weighted above decks from small ones.

Usage:
    python3 fetch_tournaments.py

Safe to re-run; upserts by event.
"""

import re
import sys
import time
from datetime import datetime

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip3 install cloudscraper beautifulsoup4")
    sys.exit(1)

import db

SITEMAP_URL = "https://mobalytics.gg/riftbound/sitemap.xml"
scraper = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "darwin", "desktop": True}
)

# "Scorn of the Moon" -> "scorn-of-the-moon", which is the tail of the
# archetype slug "diana-scorn-of-the-moon". Mobalytics appends " - Starter"
# to precon variants; that's the same legend for our purposes.
def legend_slug(legend):
    base = re.sub(r"\s*-\s*Starter$", "", legend).strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")


def fetch(url):
    resp = scraper.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def tournament_urls():
    xml = fetch(SITEMAP_URL)
    urls = re.findall(r"<loc>(https://mobalytics\.gg/riftbound/tournaments/[^<]+)</loc>", xml)
    # skip the index page and profile listings
    return [u for u in urls if u.rstrip("/").count("/") > 4 and "/profile/" not in u]


ORDINAL = re.compile(r"([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})")


def parse_date(s):
    m = ORDINAL.match(s.strip())
    if not m:
        return None
    try:
        return datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date().isoformat()
    except ValueError:
        return None


def parse_tournament(html):
    soup = BeautifulSoup(html, "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(separator=" "))

    attendance = None
    m = re.search(r"(?:[Oo]ver\s+)?([\d,]{3,7})\s+players", text)
    if m:
        attendance = int(m.group(1).replace(",", ""))

    start = end = None
    m = re.search(r"weekend of ([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})"
                  r"(?:\s*(?:to|-|–)\s*([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4}))?", text)
    if m:
        start = parse_date(m.group(1))
        end = parse_date(m.group(2)) if m.group(2) else start

    rows = []
    table = soup.find("table")
    if table:
        for tr in table.find_all("tr")[1:]:
            cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            legend = cells[0]
            try:
                day1, day2 = int(cells[1]), int(cells[2])
            except ValueError:
                continue
            rows.append({"legend": legend, "slug": legend_slug(legend), "day1": day1, "day2": day2})

    return {"attendance": attendance, "date": start, "end_date": end, "rows": rows}


def main():
    conn = db.connect()
    urls = tournament_urls()
    print(f"Found {len(urls)} tournament pages")
    total_rows = 0
    for url in urls:
        slug = url.rstrip("/").rsplit("/", 1)[1]
        try:
            data = parse_tournament(fetch(url))
        except Exception as e:
            print(f"  {slug}: failed ({e})")
            continue
        if not data["rows"]:
            print(f"  {slug}: no conversion table (skipped)")
            continue
        d1 = sum(r["day1"] for r in data["rows"])
        d2 = sum(r["day2"] for r in data["rows"])
        db.upsert_tournament(conn, slug, data["attendance"], data["date"], d1, d2, data["rows"])
        total_rows += len(data["rows"])
        att = data["attendance"] or "?"
        print(f"  {slug}: {att} players, {len(data['rows'])} legends, "
              f"{d1}->{d2} decks ({100*d2/d1:.1f}% conversion)")
        time.sleep(0.6)
    conn.commit()
    n = db.export_meta_json(conn)
    conn.commit()
    conn.close()
    print(f"\nStored {total_rows} legend-performance rows; meta exported for {n} events")


if __name__ == "__main__":
    main()
