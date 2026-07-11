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
import re
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


TECH_RULES = [
    {"tag": 'counter', "label": 'counter', "rx": re.compile(r'counter a spell|opponents can\'?t play cards', re.IGNORECASE)},
    {"tag": 'sweep', "label": 'sweeper', "rx": re.compile(r'to all (enemy )?units|deal \d+ to all|return all units|each player kills one of their units', re.IGNORECASE),
     "size": lambda e: (re.search(r'deal (\d+) to all', e, re.IGNORECASE) or re.search(r'return all units with (\d+)', e, re.IGNORECASE) or [None, None])[1]},
    {"tag": 'gearHate', "label": 'gear hate', "rx": re.compile(r'kill a gear|kills one of their gear|give a gear \[temporary\]|or a gear \[temporary\]', re.IGNORECASE)},
    {"tag": 'killSmall', "label": 'conditional removal', "rx": re.compile(r'(kill|return|deal \d+ to)[\s\S]{0,90}?(\d+) :rb_might: or less', re.IGNORECASE),
     "size": lambda e: (re.search(r'(\d+) :rb_might: or less', e, re.IGNORECASE) or [None, None])[1]},
    {"tag": 'kill', "label": 'hard removal', "rx": re.compile(r'\bkill (a|an|target|one) (unit|enemy unit)', re.IGNORECASE)},
    {"tag": 'damage', "label": 'damage', "rx": re.compile(r'deal (\d+) to (a|an|each|up to|enemy)', re.IGNORECASE),
     "size": lambda e: (re.search(r'deal (\d+) to', e, re.IGNORECASE) or [None, None])[1]},
    {"tag": 'shrink', "label": 'shrink', "rx": re.compile(r'-(\d+) :rb_might: this turn(?![\s\S]{0,40}minimum)', re.IGNORECASE),
     "size": lambda e: (re.search(r'-(\d+) :rb_might:', e, re.IGNORECASE) or [None, None])[1]},
    {"tag": 'shrinkSoft', "label": 'combat trick', "rx": re.compile(r'-(\d+) :rb_might: this turn[\s\S]{0,40}minimum', re.IGNORECASE)},
    {"tag": 'bounce', "label": 'bounce', "rx": re.compile(r'return (a|an|another|all|up to|target)[\s\S]{0,70}owner', re.IGNORECASE)},
    {"tag": 'handAttack', "label": 'hand attack', "rx": re.compile(r'they discard|each player discards|opponent[\s\S]{0,60}discard that card', re.IGNORECASE)},
    {"tag": 'stun', "label": 'stun', "rx": re.compile(r'\[stun\]', re.IGNORECASE)},
]

def generate_tech_tags(effect_text):
    if not effect_text:
        return []
    tags = []
    for r in TECH_RULES:
        if r["rx"].search(effect_text):
            size = None
            if "size" in r:
                size_str = r["size"](effect_text)
                if size_str and str(size_str).isdigit():
                    size = int(size_str)
            tags.append({"tag": r["tag"], "label": r["label"], "size": size})
    
    def has(tag_name):
        return any(t["tag"] == tag_name for t in tags)
    
    if has("killSmall"):
        tags = [t for t in tags if t["tag"] not in ("kill", "damage")]
    if has("sweep"):
        tags = [t for t in tags if t["tag"] not in ("damage", "bounce")]
    if has("shrink"):
        tags = [t for t in tags if t["tag"] != "shrinkSoft"]
        
    return tags


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
        eff = clean_effect(card["effect"])
        tech_tags = generate_tech_tags(eff)
        
        conn.execute(
            "INSERT INTO cards (code, name, norm_name, color, cost, type, "
            "supertype, might, tags, rarity, set_name, promo, image_url, effect, price, tech_tags) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(code) DO UPDATE SET name = excluded.name, "
            "norm_name = excluded.norm_name, color = excluded.color, "
            "cost = excluded.cost, type = excluded.type, "
            "supertype = excluded.supertype, might = excluded.might, "
            "tags = excluded.tags, rarity = excluded.rarity, "
            "set_name = excluded.set_name, promo = excluded.promo, "
            "image_url = excluded.image_url, effect = excluded.effect, "
            "price = excluded.price, tech_tags = excluded.tech_tags",
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
                eff,
                to_float(card.get("price")),
                json.dumps(tech_tags) if tech_tags else None,
            ),
        )
        count += 1
    conn.commit()
    conn.close()
    print(f"Imported/updated {count} cards")


if __name__ == "__main__":
    main()
