#!/usr/bin/env python3
"""
db.py

SQLite layer for the Riftbound decklist database (riftbound.db).

Tables:
    cards       full Riftbound card catalogue (populated by import_cards.py)
    events      tournaments (name, date, region)
    decks       one row per tournament decklist (all archetypes)
    deck_cards  card name/count per deck, by section (main/rune/battlefield/side)

The DB is the source of truth. Exports for the static viewer:
    decks.json / decks.js   LEGENDS archetypes' decks, fully enriched, keyed by
                            archetype slug — the "yours" pool the viewer's
                            legend switcher (LEGENDS below) picks between
    meta.json / meta.js     whole-field context: per-event archetype counts
                            and per-LEGENDS-archetype card baselines
    field.json / field.js   every archetype's decklists + a card index, so the
                            viewer can explore the whole meta, not just the
                            legends you can build around; also carries the
                            `legends` manifest the switcher UI reads

CLI:
    python3 db.py migrate   one-time import of a legacy decks.json
    python3 db.py export    rewrite decks.json from the DB
    python3 db.py stats     quick row counts
"""

import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

DB_FILE = Path(__file__).parent / "riftbound.db"
# Canonical viewer paths (repo root) — the vanilla index.html deploy_cloudflare.sh
# bundles, per its own comment that frontend/ ("experimental" React rewrite,
# excluded from deploy) doesn't belong on the public host. These were pointed
# at frontend/public/ during the React migration (6f67ad5, 2026-07-11) and
# never reverted after that migration was abandoned — every fetch_decks.py
# run since, including the weekly cron, was silently updating a directory
# nobody deploys from while the live site's data stayed frozen. Fixed 2026-07-12.
DECKS_JSON = Path(__file__).parent / "decks.json"
META_JSON = Path(__file__).parent / "meta.json"
FIELD_JSON = Path(__file__).parent / "field.json"
IMAGE_DIR = Path(__file__).parent / "cache" / "images"

DIANA_ARCHETYPE = "diana-scorn-of-the-moon"

# Legends the viewer lets you build around ("yours"), as opposed to the other
# ~40 archetypes in field.json which are only ever "the field"/opponents.
# Adding a legend here is the whole backend side of that decision: it flows
# into decks_config.json's shape, every export function below, and the
# viewer's legend switcher (which reads this same registry from field.json).
# `legend_slug` is how event_performance/legend_slug_for key the conversion
# tables (the archetype slug is "<champion>-<legend>"; the legend alone is
# what mobalytics prints in its Day1/Day2 table).
LEGENDS = {
    "diana-scorn-of-the-moon": {
        "name": "Diana, Scorn of the Moon",
        "legend_slug": "scorn-of-the-moon",
        "hero_image": "Diana_Lunari.webp",
    },
    "irelia-blade-dancer": {
        "name": "Irelia, Blade Dancer",
        "legend_slug": "blade-dancer",
        "hero_image": "Irelia_BladeDancer.webp",
    },
}
DEFAULT_LEGEND = "diana-scorn-of-the-moon"

# Ladder brews: sitemap decks of a LEGENDS archetype with no verified
# tournament placement. Stored under this synthetic event/placement so every
# consensus and meta statistic can exclude them — the viewer shows them only
# behind an opt-in filter chip, like community submissions.
LADDER_EVENT = "Mobalytics Ladder"
LADDER_PLACEMENT = "Ladder"

# Cards/battlefields banned from sanctioned Constructed play, by code (stable
# across reprints/renames, unlike name). Maintained by hand against Riot's
# banlist announcements — the dotgg API has no legality field of its own.
# Updated for the Vendetta (Set 5) banlist, 2026-07-18.
BANNED_CODES = {
    "SFD-122",  # Called Shot
    "SFD-020",  # Draven - Vanquisher
    "OGN-168",  # Fight or Flight
    "OGN-182",  # Scrapheap
    "OGN-177",  # Stealthy Pursuer
    "OGN-290",  # The Arena's Greatest
    "OGN-276",  # Aspirant's Climb
    "OGN-292",  # The Dreaming Tree
    "OGN-284",  # Obelisk of Power
    "OGN-285",  # Reaver's Row
}

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
    image_url TEXT,
    effect    TEXT,               -- rules text, plain
    price     REAL,               -- market price, USD
    tech_tags TEXT                -- JSON list of computed tech/sideboard tags
);
CREATE INDEX IF NOT EXISTS idx_cards_norm ON cards(norm_name);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    date       TEXT,              -- ISO date, nullable until known
    region     TEXT,
    slug       TEXT,              -- mobalytics tournament slug
    attendance INTEGER,           -- field size, from the tournament page
    day1_decks INTEGER,           -- total decks recorded on day 1
    day2_decks INTEGER            -- total that converted to day 2
);

-- Per-archetype day1/day2 counts: the only published performance data.
CREATE TABLE IF NOT EXISTS event_performance (
    event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    legend    TEXT NOT NULL,      -- as printed, e.g. "Scorn of the Moon"
    slug      TEXT NOT NULL,      -- normalized, e.g. "scorn-of-the-moon"
    day1      INTEGER NOT NULL,
    day2      INTEGER NOT NULL,
    PRIMARY KEY (event_id, legend)
);

CREATE TABLE IF NOT EXISTS decks (
    id        INTEGER PRIMARY KEY,
    label     TEXT NOT NULL UNIQUE,
    player    TEXT,
    placement TEXT,
    weight    REAL DEFAULT 1.0,
    event_id  INTEGER REFERENCES events(id),
    url       TEXT UNIQUE,
    archetype TEXT DEFAULT 'diana-scorn-of-the-moon',
    source    TEXT DEFAULT 'mobalytics',
    fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id   INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    count     INTEGER NOT NULL,
    section   TEXT NOT NULL DEFAULT 'main'
              CHECK (section IN ('main', 'rune', 'battlefield', 'side')),
    PRIMARY KEY (deck_id, card_name, section)
);
"""


def normalize_name(name):
    """Lowercase, straighten curly apostrophes, strip punctuation/spaces."""
    name = name.replace("’", "'").lower()
    return re.sub(r"[^a-z0-9]+", "", name)


def migrate_schema(conn):
    """Bring a pre-existing DB up to the current schema."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(decks)")]
    if cols and "archetype" not in cols:
        conn.execute("ALTER TABLE decks ADD COLUMN archetype TEXT "
                     f"DEFAULT '{DIANA_ARCHETYPE}'")
    if cols and "source" not in cols:
        conn.execute("ALTER TABLE decks ADD COLUMN source TEXT DEFAULT 'mobalytics'")
    card_cols = [r[1] for r in conn.execute("PRAGMA table_info(cards)")]
    if card_cols and "effect" not in card_cols:
        conn.execute("ALTER TABLE cards ADD COLUMN effect TEXT")
    if card_cols and "price" not in card_cols:
        conn.execute("ALTER TABLE cards ADD COLUMN price REAL")
    if card_cols and "tech_tags" not in card_cols:
        conn.execute("ALTER TABLE cards ADD COLUMN tech_tags TEXT")
    ev_cols = [r[1] for r in conn.execute("PRAGMA table_info(events)")]
    for col, decl in (("slug", "TEXT"), ("attendance", "INTEGER"),
                      ("day1_decks", "INTEGER"), ("day2_decks", "INTEGER")):
        if ev_cols and col not in ev_cols:
            conn.execute(f"ALTER TABLE events ADD COLUMN {col} {decl}")
    # deck_cards' section CHECK can't be altered in place; rebuild if it
    # predates the 'side' section.
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='deck_cards'"
    ).fetchone()
    if row and "'side'" not in row[0]:
        conn.executescript("""
            ALTER TABLE deck_cards RENAME TO deck_cards_old;
            CREATE TABLE deck_cards (
                deck_id   INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
                card_name TEXT NOT NULL,
                count     INTEGER NOT NULL,
                section   TEXT NOT NULL DEFAULT 'main'
                          CHECK (section IN ('main', 'rune', 'battlefield', 'side')),
                PRIMARY KEY (deck_id, card_name, section)
            );
            INSERT INTO deck_cards SELECT * FROM deck_cards_old;
            DROP TABLE deck_cards_old;
        """)
    conn.commit()


def connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    migrate_schema(conn)
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


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def name_from_slug(slug):
    return " ".join(w.upper() if re.fullmatch(r"s\d", w) else w.capitalize()
                    for w in slug.split("-"))


def upsert_tournament(conn, slug, attendance, date, day1, day2, rows):
    """Attach field size + the day1/day2 conversion table to an event.

    Events already exist for anything we have decklists from (their names
    were derived from deck slugs, so slugify(name) round-trips back to the
    tournament slug). Tournaments we hold no decklists for are still worth
    storing for meta context, so create those events too.
    """
    row = conn.execute(
        "SELECT id FROM events WHERE slug = ? OR lower(replace(name,' ','-')) = ?",
        (slug, slug),
    ).fetchone()
    if row:
        event_id = row[0]
    else:
        conn.execute("INSERT OR IGNORE INTO events (name) VALUES (?)", (name_from_slug(slug),))
        event_id = conn.execute("SELECT id FROM events WHERE name = ?", (name_from_slug(slug),)).fetchone()[0]

    conn.execute(
        "UPDATE events SET slug = ?, attendance = COALESCE(?, attendance), "
        "day1_decks = ?, day2_decks = ?, "
        "date = CASE WHEN ? IS NOT NULL THEN ? ELSE date END WHERE id = ?",
        (slug, attendance, day1, day2, date, date, event_id),
    )
    conn.execute("DELETE FROM event_performance WHERE event_id = ?", (event_id,))
    for r in rows:
        conn.execute(
            "INSERT INTO event_performance (event_id, legend, slug, day1, day2) "
            "VALUES (?, ?, ?, ?, ?)",
            (event_id, r["legend"], r["slug"], r["day1"], r["day2"]),
        )
    return event_id


def upsert_deck(conn, label, placement, event_name, weight, url, sections,
                event_date=None, archetype=DIANA_ARCHETYPE, source='mobalytics',
                player=None):
    """Insert or replace a deck and its cards.

    sections: dict of section name -> {card name: count}, where section is
    one of main / rune / battlefield / side. `player` overrides the
    label-splitting heuristic (needed for sources that give a real player
    name that itself contains " - ").
    """
    event_id = upsert_event(conn, event_name, date=event_date)
    if player is None:
        player = label.split(" - ")[0].strip() if " - " in label else None
    conn.execute(
        "INSERT INTO decks (label, player, placement, weight, event_id, url, archetype, source) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(label) DO UPDATE SET player = excluded.player, "
        "placement = excluded.placement, weight = excluded.weight, "
        "event_id = excluded.event_id, url = excluded.url, "
        "archetype = excluded.archetype, source = excluded.source, fetched_at = datetime('now')",
        (label, player, placement, weight, event_id, url, archetype, source),
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
    """Write decks.json: every LEGENDS archetype's decks, fully enriched, keyed
    by archetype slug — this is the "yours" pool the viewer's legend switcher
    picks between (as opposed to field.json, which covers every archetype but
    only enriches images for the LEGENDS ones).

    Includes every source (Mobalytics' curated, placement-weighted decks
    alongside riftools.app's much larger flat-weighted per-deck ingestion —
    see fetch_riftools.py) for LEGENDS archetypes specifically: the consensus
    builder/coach/optimizer are meant to reflect the whole picture, tech
    included, not just Mobalytics' top-cut slice. Every OTHER archetype only
    ever appears in field.json (the whole-field / opponent-analysis view).
    """
    out = {}
    for archetype, info in LEGENDS.items():
        decks_out = []
        deck_rows = conn.execute(
            "SELECT d.*, e.name AS event_name, e.date AS event_date, "
            "e.attendance AS attendance "
            "FROM decks d LEFT JOIN events e ON e.id = d.event_id "
            "WHERE d.archetype = ? ORDER BY d.id", (archetype,)
        ).fetchall()
        for d in deck_rows:
            sections = {"main": [], "rune": [], "battlefield": [], "side": []}
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
                "attendance": d["attendance"],
                "weight": d["weight"],
                "url": d["url"],
                "cards": sections["main"],
                "runes": sections["rune"],
                "battlefields": sections["battlefield"],
                "sideboard": sections["side"],
            })
        out[archetype] = {
            "name": info["name"],
            "legendSlug": info["legend_slug"],
            "heroImage": info["hero_image"],
            "decks": decks_out,
        }
    payload = json.dumps(out, indent=2)
    Path(path).write_text(payload)
    # decks.js mirrors decks.json so index.html also works from file://
    # (double-clicked in Finder), where browsers block fetch().
    Path(path).with_suffix(".js").write_text("window.DECKS = " + payload + ";\n")
    return sum(len(v["decks"]) for v in out.values())


def export_meta_json(conn, path=META_JSON):
    """Write meta.json/meta.js: whole-field context for the viewer.

    events: per event, deck counts by archetype (meta share of top cuts), plus
    each LEGENDS archetype's Day1/Day2 conversion under perfByLegend.
    cardBase: per LEGENDS archetype, for every card in ITS main/side, how much
    of the field EXCLUDING that archetype mains it — separates format staples
    from that legend's own tech. Keyed by archetype slug so the viewer's
    legend switcher can pick the right baseline for whichever is selected.
    """
    legend_slugs = {a: info["legend_slug"] for a, info in LEGENDS.items()}

    events = []
    for e in conn.execute(
        "SELECT id, name, date, attendance, day1_decks, day2_decks FROM events ORDER BY date, name"
    ):
        if e["name"] == LADDER_EVENT:
            continue   # ladder brews are not a tournament top cut
        counts = {}
        for row in conn.execute(
            "SELECT archetype, COUNT(*) AS n FROM decks WHERE event_id = ? "
            "AND COALESCE(placement, '') NOT IN ('Best of', 'Ladder') "
            "GROUP BY archetype", (e["id"],)
        ):
            counts[row["archetype"]] = row["n"]
        perf_by_legend = {}
        for archetype, slug in legend_slugs.items():
            perf = conn.execute(
                "SELECT day1, day2 FROM event_performance WHERE event_id = ? AND slug = ?",
                (e["id"], slug),
            ).fetchone()
            if perf:
                perf_by_legend[archetype] = {"day1": perf["day1"], "day2": perf["day2"]}
        entry = {"name": e["name"], "date": e["date"], "counts": counts}
        if e["attendance"]:
            entry["attendance"] = e["attendance"]
        if e["day1_decks"]:
            entry["day1"] = e["day1_decks"]
            entry["day2"] = e["day2_decks"]
        if perf_by_legend:
            entry["perfByLegend"] = perf_by_legend
        if counts or perf_by_legend:
            events.append(entry)

    # Aggregate archetype performance across every event that published a
    # conversion table: who actually beat the field, and by how much.
    perf_rows = []
    for row in conn.execute(
        "SELECT legend, slug, SUM(day1) AS d1, SUM(day2) AS d2, COUNT(*) AS events "
        "FROM event_performance GROUP BY slug HAVING d1 >= 20 ORDER BY d2 * 1.0 / d1 DESC"
    ):
        perf_rows.append({
            "legend": re.sub(r"\s*-\s*Starter$", "", row["legend"]),
            "slug": row["slug"],
            "day1": row["d1"], "day2": row["d2"],
            "conversion": row["d2"] / row["d1"],
            "events": row["events"],
        })
    field = conn.execute(
        "SELECT SUM(day1) AS d1, SUM(day2) AS d2 FROM event_performance"
    ).fetchone()
    performance = {
        "legends": legend_slugs,
        "fieldDay1": field["d1"] or 0,
        "fieldDay2": field["d2"] or 0,
        "fieldConversion": (field["d2"] / field["d1"]) if field["d1"] else 0,
        "archetypes": perf_rows,
    }

    other_decks = {}
    card_base = {}
    for archetype in LEGENDS:
        other_decks[archetype] = conn.execute(
            "SELECT COUNT(*) FROM decks WHERE archetype != ? "
            "AND COALESCE(placement, '') NOT IN ('Best of', 'Ladder')", (archetype,)
        ).fetchone()[0]
        base = {}
        for row in conn.execute(
            "SELECT dc.card_name, COUNT(DISTINCT dc.deck_id) AS n "
            "FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id "
            "WHERE dc.section = 'main' AND d.archetype != ? "
            "AND dc.card_name IN (SELECT DISTINCT card_name FROM deck_cards dc2 "
            "  JOIN decks d2 ON d2.id = dc2.deck_id "
            "  WHERE dc2.section IN ('main','side') AND d2.archetype = ?) "
            "GROUP BY dc.card_name", (archetype, archetype)
        ):
            base[row["card_name"]] = row["n"]
        card_base[archetype] = base

    archetype_totals = {}
    for row in conn.execute(
        "SELECT archetype, COUNT(*) AS n FROM decks "
        "WHERE COALESCE(placement, '') NOT IN ('Best of', 'Ladder') GROUP BY archetype"
    ):
        archetype_totals[row["archetype"]] = row["n"]

    # Regenerated on every scrape, but the weekly workflow only commits when
    # some other file actually changed — so this reads as "data last changed",
    # not "scraper last ran". The ladder pseudo-event's date moves with every
    # new brew, so it must not drive "latest".
    latest_event = conn.execute(
        "SELECT MAX(date) FROM events WHERE date IS NOT NULL AND name != ?", (LADDER_EVENT,)
    ).fetchone()[0]

    meta = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latestEvent": latest_event,
        "otherDecks": other_decks,
        "archetypes": archetype_totals,
        "events": events,
        "cardBase": card_base,
        "performance": performance,
    }
    payload = json.dumps(meta, indent=1)
    Path(path).write_text(payload)
    Path(path).with_suffix(".js").write_text("window.META = " + payload + ";\n")
    return len(events)


def legend_slug_for(archetype, legend_slugs):
    """Archetype slugs are '<champion>-<legend>' ("irelia-blade-dancer") while the
    conversion tables key on the legend alone ("blade-dancer"). Match by suffix,
    longest first so 'wuju-master' never swallows 'wuju-bladesman'."""
    for slug in sorted(legend_slugs, key=len, reverse=True):
        if archetype == slug or archetype.endswith("-" + slug):
            return slug
    return None


def pretty_archetype(archetype, legend_slug, legend_name):
    """'irelia-blade-dancer' -> 'Irelia, Blade Dancer' using the printed legend
    name when we have one, else a plain title-casing of the slug."""
    champion = archetype[: -(len(legend_slug) + 1)] if legend_slug and archetype.endswith("-" + legend_slug) else ""
    title = lambda s: " ".join(w.capitalize() for w in s.split("-") if w)
    if champion and legend_name:
        return f"{title(champion)}, {legend_name}"
    return title(archetype)


def export_field_json(conn, path=FIELD_JSON):
    """Write field.json/field.js: every archetype's tournament decklists plus a
    card index covering them.

    decks.json is Diana-only and meta.json is counts-only, so neither lets the
    viewer show what an opposing archetype actually plays. This does: it powers
    the Meta view (browse any archetype's consensus list) and the sideboard
    coverage heuristic (which needs the opponents' unit sizes, gear counts and
    spell density to know what a tech card is answering).
    """
    legend_rows = {
        r["slug"]: re.sub(r"\s*-\s*Starter$", "", r["legend"])
        for r in conn.execute("SELECT DISTINCT slug, legend FROM event_performance")
    }

    archetypes = {}
    for d in conn.execute(
        "SELECT d.id, d.label, d.player, d.placement, d.archetype, d.url, "
        "e.name AS event_name, e.date AS event_date "
        "FROM decks d LEFT JOIN events e ON e.id = d.event_id "
        "WHERE COALESCE(d.placement, '') != ? ORDER BY d.id", (LADDER_PLACEMENT,)
    ):
        arch = d["archetype"]
        if arch not in archetypes:
            slug = legend_slug_for(arch, legend_rows.keys())
            archetypes[arch] = {
                "name": pretty_archetype(arch, slug, legend_rows.get(slug)),
                "legend": slug,
                "decks": [],
            }
        sections = {"main": {}, "side": {}, "rune": {}, "battlefield": {}}
        for row in conn.execute(
            "SELECT card_name, count, section FROM deck_cards WHERE deck_id = ?", (d["id"],)
        ):
            sections[row["section"]][row["card_name"]] = row["count"]
        archetypes[arch]["decks"].append({
            "label": d["label"],
            "player": d["player"],
            "placement": d["placement"],
            "event": d["event_name"],
            "date": d["event_date"],
            "url": d["url"],
            "main": sections["main"],
            "side": sections["side"],
            "runes": sections["rune"],
            "battlefields": sorted(sections["battlefield"]),
        })

    # One card index for every name any deck plays, so the viewer can render
    # opposing lists (cost gems, might, art) without a second lookup table.
    cards = {}
    for row in conn.execute("SELECT DISTINCT card_name FROM deck_cards"):
        name = row["card_name"]
        card = lookup_card(conn, name)
        if not card:
            continue
        local = local_image_path(name)
        cards[name] = {
            "cost": card["cost"],
            "type": card["type"],
            "might": card["might"],
            "color": json.loads(card["color"]) if card["color"] else [],
            "tags": json.loads(card["tags"]) if card["tags"] else [],
            "techTags": json.loads(card["tech_tags"]) if card["tech_tags"] else [],
            "effect": card["effect"],
            "image": f"cache/images/{local.name}" if local.exists() else card["image_url"],
            "price": card["price"],
            "banned": card["code"] in BANNED_CODES,
            "set": card["set_name"],
        }

    # Deliberately no "generated" stamp: meta.json already carries one, and a
    # timestamp here would make field.json churn on every scrape, defeating the
    # weekly workflow's "did the data actually change?" check.
    legends = [
        {"slug": archetype, "name": info["name"], "legendSlug": info["legend_slug"],
         "heroImage": info["hero_image"]}
        for archetype, info in LEGENDS.items()
    ]
    field = {
        "legends": legends,
        "defaultLegend": DEFAULT_LEGEND,
        "archetypes": archetypes,
        "cards": cards,
    }
    payload = json.dumps(field, indent=1)
    Path(path).write_text(payload)
    Path(path).with_suffix(".js").write_text("window.FIELD = " + payload + ";\n")
    return len(archetypes), len(cards)


def export_cards_json(conn, path=None):
    """Write cards.json/cards.js: full details for every card that appears in
    any LEGENDS archetype's deck section — powers the viewer's card-detail
    modal and (via builderPool) the deck-builder's search results."""
    path = path or (Path(__file__).parent / "cards.json")
    out = {}
    placeholders = ",".join("?" for _ in LEGENDS)
    for row in conn.execute(
        "SELECT DISTINCT card_name FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id "
        f"WHERE d.archetype IN ({placeholders})", tuple(LEGENDS.keys())
    ):
        name = row["card_name"]
        card = lookup_card(conn, name)
        if not card:
            continue
        out[name] = {
            "code": card["code"],
            "cost": card["cost"],
            "type": card["type"],
            "color": json.loads(card["color"]) if card["color"] else [],
            "might": card["might"],
            "rarity": card["rarity"],
            "tags": json.loads(card["tags"]) if card["tags"] else [],
            "techTags": json.loads(card["tech_tags"]) if card["tech_tags"] else [],
            "effect": card["effect"],
            "price": card["price"],
            "banned": card["code"] in BANNED_CODES,
            "set": card["set_name"],
        }
    payload = json.dumps(out, indent=1)
    Path(path).write_text(payload)
    Path(path).with_suffix(".js").write_text("window.CARDS = " + payload + ";\n")
    return len(out)


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
        m = export_meta_json(conn)
        k = export_cards_json(conn)
        a, c = export_field_json(conn)
        conn.commit()
        print(f"Exported {n} legend decks, meta for {m} events, {k} card details, "
              f"{a} archetypes / {c} cards to field.json")
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
