#!/usr/bin/env python3
"""
db.py

SQLite layer for the Diana decklist database (riftbound.db).

Tables:
    cards       full Riftbound card catalogue (populated by import_cards.py)
    events      tournaments (name, date, region)
    decks       one row per tournament decklist
    deck_cards  card name/count per deck, split by section (main/rune/battlefield)

The DB is the source of truth; decks.json is exported from it for the
static viewer (index.html).

CLI:
    python3 db.py migrate   one-time import of a legacy decks.json
    python3 db.py export    rewrite decks.json from the DB
    python3 db.py stats     quick row counts
"""

import json
import re
import sqlite3
import sys
from pathlib import Path

DB_FILE = Path(__file__).parent / "riftbound.db"
DECKS_JSON = Path(__file__).parent / "decks.json"
IMAGE_DIR = Path(__file__).parent / "cache" / "images"

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    code      TEXT PRIMARY KEY,   -- e.g. UNL-079
    name      TEXT NOT NULL,
    norm_name TEXT NOT NULL,      -- normalized for lookup
    color     TEXT,               -- JSON list, e.g. ["Mind"]
    cost      INTEGER,
    type      TEXT,               -- Unit / Spell / Gear / Rune / Battlefield / Legend
    supertype TEXT,
    might     INTEGER,
    tags      TEXT,               -- JSON list
    rarity    TEXT,
    set_name  TEXT,
    promo     INTEGER DEFAULT 0,
    image_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_norm ON cards(norm_name);

CREATE TABLE IF NOT EXISTS events (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL UNIQUE,
    date   TEXT,                  -- ISO date, nullable until known
    region TEXT
);

CREATE TABLE IF NOT EXISTS decks (
    id        INTEGER PRIMARY KEY,
    label     TEXT NOT NULL UNIQUE,
    player    TEXT,
    placement TEXT,
    weight    REAL DEFAULT 1.0,
    event_id  INTEGER REFERENCES events(id),
    url       TEXT UNIQUE,
    fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id   INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    count     INTEGER NOT NULL,
    section   TEXT NOT NULL DEFAULT 'main'
              CHECK (section IN ('main', 'rune', 'battlefield')),
    PRIMARY KEY (deck_id, card_name, section)
);
"""


def normalize_name(name):
    """Lowercase, straighten curly apostrophes, strip punctuation/spaces."""
    name = name.replace("’", "'").lower()
    return re.sub(r"[^a-z0-9]+", "", name)


def connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def lookup_card(conn, name):
    """Best card row for a scraped name: non-promo first, then shortest code."""
    rows = conn.execute(
        "SELECT * FROM cards WHERE norm_name = ? "
        "ORDER BY promo ASC, length(code) ASC, code ASC LIMIT 1",
        (normalize_name(name),),
    ).fetchall()
    return rows[0] if rows else None


def upsert_event(conn, name, date=None, region=None):
    # Decks from the same event can carry different page dates; keep the earliest.
    conn.execute(
        "INSERT INTO events (name, date, region) VALUES (?, ?, ?) "
        "ON CONFLICT(name) DO UPDATE SET "
        "date = CASE WHEN events.date IS NULL THEN excluded.date "
        "            WHEN excluded.date IS NULL THEN events.date "
        "            WHEN excluded.date < events.date THEN excluded.date "
        "            ELSE events.date END, "
        "region = COALESCE(excluded.region, events.region)",
        (name, date, region),
    )
    return conn.execute("SELECT id FROM events WHERE name = ?", (name,)).fetchone()[0]


def upsert_deck(conn, label, placement, event_name, weight, url, sections, event_date=None):
    """Insert or replace a deck and its cards.

    sections: dict like {"main": {name: count}, "rune": {...}, "battlefield": {...}}
    """
    event_id = upsert_event(conn, event_name, date=event_date)
    player = label.split(" - ")[0].strip() if " - " in label else None
    conn.execute(
        "INSERT INTO decks (label, player, placement, weight, event_id, url) "
        "VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(label) DO UPDATE SET player = excluded.player, "
        "placement = excluded.placement, weight = excluded.weight, "
        "event_id = excluded.event_id, url = excluded.url, "
        "fetched_at = datetime('now')",
        (label, player, placement, weight, event_id, url),
    )
    deck_id = conn.execute("SELECT id FROM decks WHERE label = ?", (label,)).fetchone()[0]
    conn.execute("DELETE FROM deck_cards WHERE deck_id = ?", (deck_id,))
    for section, cards in sections.items():
        for name, count in cards.items():
            conn.execute(
                "INSERT INTO deck_cards (deck_id, card_name, count, section) "
                "VALUES (?, ?, ?, ?)",
                (deck_id, name, count, section),
            )
    return deck_id


def local_image_path(name):
    filename = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_") + ".webp"
    return IMAGE_DIR / filename


def card_json(conn, name, count):
    """Viewer JSON for one deck card, enriched from the cards table."""
    entry = {"name": name, "count": count, "image": None}
    local = local_image_path(name)
    card = lookup_card(conn, name)
    if local.exists():
        entry["image"] = f"cache/images/{local.name}"
    elif card and card["image_url"]:
        entry["image"] = card["image_url"]
    if card:
        entry["code"] = card["code"]
        entry["cost"] = card["cost"]
        entry["type"] = card["type"]
        entry["color"] = json.loads(card["color"]) if card["color"] else []
        entry["might"] = card["might"]
    return entry


def export_decks_json(conn, path=DECKS_JSON):
    """Write decks.json for the static viewer."""
    decks_out = []
    deck_rows = conn.execute(
        "SELECT d.*, e.name AS event_name, e.date AS event_date "
        "FROM decks d LEFT JOIN events e ON e.id = d.event_id ORDER BY d.id"
    ).fetchall()
    for d in deck_rows:
        sections = {"main": [], "rune": [], "battlefield": []}
        for row in conn.execute(
            "SELECT card_name, count, section FROM deck_cards WHERE deck_id = ? "
            "ORDER BY section, card_name", (d["id"],)
        ):
            sections[row["section"]].append(
                card_json(conn, row["card_name"], row["count"])
            )
        decks_out.append({
            "label": d["label"],
            "player": d["player"],
            "placement": d["placement"],
            "event": d["event_name"],
            "event_date": d["event_date"],
            "weight": d["weight"],
            "url": d["url"],
            "cards": sections["main"],
            "runes": sections["rune"],
            "battlefields": sections["battlefield"],
        })
    payload = json.dumps(decks_out, indent=2)
    Path(path).write_text(payload)
    # decks.js mirrors decks.json so index.html also works from file://
    # (double-clicked in Finder), where browsers block fetch().
    Path(path).with_suffix(".js").write_text("window.DECKS = " + payload + ";\n")
    return len(decks_out)


def migrate_from_json(conn, path=DECKS_JSON):
    """One-time import of a legacy decks.json produced by the old scraper."""
    decks = json.loads(Path(path).read_text())
    for d in decks:
        sections = {
            "main": {c["name"]: c["count"] for c in d.get("cards", [])},
            "rune": {c["name"]: c["count"] for c in d.get("runes", [])},
            "battlefield": {c["name"]: c["count"] for c in d.get("battlefields", [])},
        }
        upsert_deck(conn, d["label"], d.get("placement"), d.get("event"),
                    d.get("weight", 1.0), d.get("url"), sections)
    conn.commit()
    return len(decks)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    conn = connect()
    if cmd == "migrate":
        n = migrate_from_json(conn)
        print(f"Migrated {n} decks from decks.json into {DB_FILE.name}")
    elif cmd == "export":
        n = export_decks_json(conn)
        conn.commit()
        print(f"Exported {n} decks to {DECKS_JSON.name}")
    elif cmd == "stats":
        for table in ("cards", "events", "decks", "deck_cards"):
            n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"{table}: {n}")
    else:
        print(f"Unknown command: {cmd} (use migrate / export / stats)")
        sys.exit(1)
    conn.close()


if __name__ == "__main__":
    main()
