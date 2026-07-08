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
- **`fetch_decks.py`** — auto-discovers new Diana tournament decklists
  from the Mobalytics sitemap (slug pattern
  `diana-scorn-of-the-moon-<event>-<placement>-<player>`; placement
  determines the weight), merges them into `decks_config.json`, scrapes
  every configured deck, stores them in the DB, downloads card images
  to `cache/images/`, and exports `decks.json`. Pass `--no-discover`
  to skip the sitemap step.
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

Then open the site — as a native app window (needs `pip3 install pywebview`):

    python3 app.py             # open the app
    python3 app.py --fetch     # re-scrape latest decks first, then open

or directly in a browser (works offline, no server needed):

    open index.html        # or double-click it in Finder

or served, if you prefer a localhost URL:

    python3 -m http.server 8000
    # -> http://localhost:8000/

(The scraper exports both `decks.json` and `decks.js`; the page loads
`decks.js` so it also works from `file://`, where browsers block
`fetch`.)

The site is a single-page app with a sidebar and four views (Build,
Analyze, Compare, Decks), a dark "moonlight" theme, and card hover
previews. A **global filter bar** (region / sub-archetype / placement /
date range) recomputes every view from the chosen subset, so you can
ask e.g. "what does the majority build's curve look like without the
off-meta variant?" or "did the CN circuit build differently?".

- **Build** — a weighted consensus 40 (deck weight × copies, summed),
  locked vs. flex slots, runes/battlefields, and a **coach**: paste
  your list to get distance to each winning deck, missing core cards,
  and one-click "apply" swaps toward the consensus. Your list is saved
  in the browser and re-analyzed as you type.
- **Analyze** — card inclusion table, card packages, energy curves and
  a sub-archetype dendrogram, and an inclusion timeline. Charts have
  hover tooltips and legend/leaf highlighting.
- **Compare** — git-style diff of any two lists and a swap-distance
  matrix with a "closest to the field" ranking.
- **Decks** — every source list; click one for a visual decklist modal
  (card-art stacks per cost column, with an in-modal compare-diff).
- **Card details** — click any card image or inclusion-table row for
  its rules text, cost/domain/might, copy-count splits, field-wide play
  rate, package membership, and every deck running it.
- **Command palette** — ⌘K / Ctrl-K fuzzy-searches every card, deck and
  player; Enter opens its detail modal.
- **Deck workspace** — save named versions of your list, diff any two,
  copy a share link (the list is encoded in the URL), and export any
  deck (yours, the prototype, or a winner's) as a shareable PNG.

### Results data (what exists, and what doesn't)

`fetch_tournaments.py` scrapes each event's tournament page for the only
results data the format publishes: **field size** and the **Day 1 → Day 2
conversion table** (how many decks of each archetype started, and how many
survived to Day 2). Across 9 events that's **13,798 recorded decks** —
far more evidence than the handful of top-cut decklists. Diana converts
**23.1%** vs the field's **16.3%** (1.42×, 4th of 40 archetypes).

What is *not* published anywhere: per-player match records, standings, or
round results. So conversion is archetype-level only — it proves the deck
is strong, but it cannot rank one Diana list against another, and no
optimizer can score an individual decklist on results. That's why the
optimizer remains explicitly consensus-driven.

Field size does unlock one thing: the **weight by field size** filter
scales each deck's placement weight by √(attendance ÷ median), so a 1st
at a 1900-player event outweighs a 1st at an 1100-player one.

### On reading the numbers

Inclusion percentages come from a small sample, so the Analyze table
shows a **Wilson 95% interval** under each one — on 13 decks, "12/13"
honestly means *somewhere around 67–99%*. A player who brought two
near-identical lists also double-counts toward the "consensus", so the
filter bar has a **one list per player** toggle (keeps their best
placement). And with no win/match data published for these events,
placement is only a proxy for deck strength: the optimizer therefore
optimizes toward *evidenced consensus*, not toward results.

### Install as an app (PWA)

The hosted site ships a web-app manifest and a service worker, so it can
be installed to your desktop or phone home screen and works offline
(the app shell and card images are cached). In Chrome/Edge, use the
install icon in the address bar; on iOS Safari, "Add to Home Screen".

## Adding more decks

New tournament results are picked up automatically from the sitemap on
every run (including the weekly Actions run). To add a deck manually
(e.g. one that isn't on Mobalytics' sitemap):

    python3 fetch_decks.py \
      --add-url "https://mobalytics.gg/riftbound/decks/..." \
      --label "Player - Event 1st" --placement "1st" \
      --event "Some Regional Qualifier" --weight 3.0

or edit `decks_config.json` directly and re-run `fetch_decks.py`.
Weights: 1st = 3.0, 2nd = 2.0, Top 4 = 1.5, Top 8 = 1.0 (auto-assigned
for discovered decks; tweak in the config afterwards if you like).

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

- Discovery only sees decks in the Mobalytics sitemap under the
  `diana-scorn-of-the-moon-*` slug; results published elsewhere (or
  under a different archetype slug) still need `--add-url`.
- If Mobalytics changes their page layout, `parse_decklist()` in
  `fetch_decks.py` may need adjusting — it works by taking the text
  between "Main Deck" and "Sideboard" and splitting on 1–3 digit count
  boundaries.
- The prototype deck is a consensus/aggregate build — a strong netdeck
  baseline, not a proven-optimal list. It weighs card frequency, not
  synergy or matchup targeting.
