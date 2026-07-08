#!/usr/bin/env python3
"""
import_cards.py

Imports the full Riftbound card catalogue into the cards table of
riftbound.db, from the same dotgg source that hosts the card images.
This replaces the old hand-maintained card_codes.py lookup and adds
cost / type / color / might / rarity for every card.

Usage:
    python3 import_cards.py

Safe to re-run; upserts by card code. Run it occasionally to pick up
new sets.
"""

import json
import sys

try:
    import cloudscraper
except ImportError:
    print("Missing dependency. Run: pip3 install cloudscraper")
    sys.exit(1)

from db import connect, normalize_name

API_URL = "https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_float(value):
    try:
        f = float(value)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def clean_effect(html):
    """Rules text arrives with HTML markup; keep it as readable plain text."""
    if not html:
        return None
    import re
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip() or None


def fetch_catalogue():
    scraper = cloudscraper.create_scraper()
    resp = scraper.get(API_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    idx = {name: i for i, name in enumerate(payload["names"])}
    for row in payload["data"]:
        yield {key: row[idx[key]] for key in idx}


def main():
    conn = connect()
    count = 0
    for card in fetch_catalogue():
        conn.execute(
            "INSERT INTO cards (code, name, norm_name, color, cost, type, "
            "supertype, might, tags, rarity, set_name, promo, image_url, effect, price) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(code) DO UPDATE SET name = excluded.name, "
            "norm_name = excluded.norm_name, color = excluded.color, "
            "cost = excluded.cost, type = excluded.type, "
            "supertype = excluded.supertype, might = excluded.might, "
            "tags = excluded.tags, rarity = excluded.rarity, "
            "set_name = excluded.set_name, promo = excluded.promo, "
            "image_url = excluded.image_url, effect = excluded.effect, "
            "price = excluded.price",
            (
                card["id"],
                card["name"],
                normalize_name(card["name"]),
                json.dumps(card["color"]) if card["color"] else None,
                to_int(card["cost"]),
                card["type"],
                card["supertype"] or None,
                to_int(card["might"]),
                json.dumps(card["tags"]) if card["tags"] else None,
                card["rarity"] or None,
                card["set_name"] or None,
                1 if card["promo"] else 0,
                card["image"] or None,
                clean_effect(card["effect"]),
                to_float(card.get("price")),
            ),
        )
        count += 1
    conn.commit()
    conn.close()
    print(f"Imported/updated {count} cards")


if __name__ == "__main__":
    main()
