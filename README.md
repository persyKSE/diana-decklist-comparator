# Diana decklist comparator

A database of winning Riftbound *Diana, Scorn of the Moon* tournament
decklists, with a static site that compares them: shared core, swap
distances, card inclusion rates, deck diffs, and a weighted prototype
deck builder.

## Architecture

- **`riftbound.db`** (SQLite) — source of truth. Tables: `cards` (the
  full 1100+ card Riftbound catalogue with cost/type/color/might/rarity),
  `events`, `decks`, `deck_cards`.
- **`import_cards.py`** — imports/refreshes the card catalogue from the
  dotgg API (the same source that hosts the card images).
- **`fetch_decks.py`** — scrapes the decklists in `decks_config.json`
  from Mobalytics, stores them in the DB, downloads card images to
  `cache/images/`, and exports `decks.json`.
- **`db.py`** — schema + helpers; also a small CLI
  (`migrate` / `export` / `stats`).
- **`decks.json`** — export for the viewer, enriched with per-card
  cost/type/color from the catalogue.
- **`index.html`** — the static site. Reads `decks.json`; no build step.

## Setup (one-time)

Needs Python 3 and two packages:

    pip3 install cloudscraper beautifulsoup4

## Usage

    python3 import_cards.py   # once, and occasionally for new sets
    python3 fetch_decks.py    # scrape decks -> DB -> decks.json

Then serve the folder and open the site:

    python3 -m http.server 8000
    # -> http://localhost:8000/

The site shows:

- **Prototype deck** — a weighted consensus 40, built
  highest-score-first (deck weight × copies, summed across decks).
  Locked (green) = in every deck; flex (amber) = contested slot. Click
  to add/remove flex cards.
- **Card inclusion table** — every card seen in the field: inclusion
  rate, cost, type, average copies, and the copy-count split (e.g.
  "x3 in 5 decks, x2 in 2 decks").
- **Deck diff** — git-style comparison of any two lists.
- **Swap-distance analysis** — pairwise distance matrix plus a
  "closest to the field" ranking.

## Adding more decks

    python3 fetch_decks.py \
      --add-url "https://mobalytics.gg/riftbound/decks/..." \
      --label "Player - Event 1st" --placement "1st" \
      --event "Some Regional Qualifier" --weight 3.0

or edit `decks_config.json` directly and re-run `fetch_decks.py`.
Suggested weights: 1st = 3.0, 2nd = 2.0, Top 4 = 1.5, Top 8 = 1.0.

## Hosting (GitHub Pages + weekly auto-update)

Two workflows ship in `.github/workflows/`:

- `pages.yml` — deploys the repo to GitHub Pages on every push to
  `main` (and after each data update).
- `update-data.yml` — every Monday (and on demand from the Actions
  tab) re-scrapes the configured decks, refreshes the card catalogue,
  and commits any changes.

One-time setup after pushing the repo to GitHub: in the repo settings
under **Pages**, set **Source** to **GitHub Actions**.

## Known limitations

- Deck URLs are hand-collected in `decks_config.json` — Mobalytics has
  no public API and its tournament-results listing is behind JS
  pagination. Auto-discovery is the next milestone.
- If Mobalytics changes their page layout, `parse_decklist()` in
  `fetch_decks.py` may need adjusting — it works by taking the text
  between "Main Deck" and "Sideboard" and splitting on 1–3 digit count
  boundaries.
- The prototype deck is a consensus/aggregate build — a strong netdeck
  baseline, not a proven-optimal list. It weighs card frequency, not
  synergy or matchup targeting.
