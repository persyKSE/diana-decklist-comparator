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
- **`field.json`** — every archetype's decklists (not just Diana's) plus a
  card index covering them. Powers the Meta view and the sideboard
  coverage heuristic, which needs the *opponents'* unit sizes, gear counts
  and spell density. Carries no timestamp, so it only changes when the
  data does.
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

The site is a single-page app with a sidebar and five views (Build,
Analyze, Meta, Compare, Decks), a dark "moonlight" theme, and card hover
previews. A **global filter bar** (region / sub-archetype / placement /
date range) recomputes every view from the chosen subset, so you can
ask e.g. "what does the majority build's curve look like without the
off-meta variant?" or "did the CN circuit build differently?". (The Meta
view reads the whole field, so the filters don't apply there.)

- **Build** — a weighted consensus 40 (deck weight × copies, summed),
  locked vs. flex slots, runes/battlefields, and a **coach**: paste
  your list to get distance to each winning deck, missing core cards,
  and one-click "apply" swaps toward the consensus. Your list is saved
  in the browser and re-analyzed as you type. A **Consistency** section
  gives exact draw odds for whatever list you're holding (see below),
  and a banner summarises what the last event changed.
- **Analyze** — a **What changed** timeline (the consensus prototype
  rebuilt after each event and diffed against the one before it), card
  inclusion table, card packages, energy curves and a sub-archetype
  dendrogram, and an inclusion timeline. Charts have hover tooltips and
  legend/leaf highlighting.
- **Meta** — every archetype in the scraped field ranked by *threat*
  (field share × Day 1→Day 2 conversion index), with a trend arrow.
  Click one for its consensus list, curve, staples, unit-size histogram
  and source decklists. Below that, **sideboard coverage** (see below).
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

### Consistency (Build view)

The one axis the tournament data can't speak to is whether a given 40
actually *delivers* its cards. That is pure hypergeometric probability
over the list itself, so it needs no results data at all. Riftbound deals
an opening hand of **4**, lets you set aside up to **2** for replacements
without reshuffling, then draws **1 per turn** — so by turn T you have
seen 4+T cards. The table gives, per card: odds in the opening 4, odds
after a mulligan (exactly computed — a miss gets two more looks at a
36-card deck that still holds every copy), and odds of ≥1 and ≥2 by turn
T. "Deal a hand" goldfishes a real opener you can mulligan and draw from.

### Sideboard coverage (Meta view)

Each card's printed rules text is matched against a small set of patterns
— counter a spell, unconditional kill, deal *N*, kill/return up to *N*
Might, −*N* Might (a "to a minimum of 1 Might" floor means it can never
kill, so it scores as a combat trick), sweeper, bounce, gear removal,
stun. Where a size is printed it is extracted. Then, for every card copy
in an opposing archetype's averaged main deck, we ask whether anything in
your sideboard handles *that specific card*: a 4-Might unit needs
something that deals 4, kills outright, or shrinks it by 4; a Gear needs
gear removal; a Spell needs a counter. Clean answers count 1, bounce 0.6,
stun 0.35, a non-lethal combat trick 0.25.

The result is **breadth**: the quality-weighted share of their 40 that you
hold *any* answer to. The denominator is literally their decklist, so
there are no tuning constants beyond those four discounts.

**It saturates by design.** One counterspell "covers" every spell they
run; one six-damage spell covers nearly every unit. A sideboard with one
of each type scores very high on breadth while being far too thin to
play — which is why the table also reports the **Answers** count (how
many relevant cards you actually hold) and why the two must be read
together. Breadth is good at finding holes; it is bad at telling you that
you have none. It is not a win rate and cannot be: no per-match data
exists. Right now it says the consensus sideboard covers **52%** of the
weighted field, and that its biggest hole is having **no counterspell**
against a field whose best decks are spell-heavy.

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
- Sideboard coverage classifies cards by regex over their rules text. Cards
  whose interaction is implicit, conditional in a way the pattern misses, or
  phrased unusually will read as "no interaction". The tags shown in each
  card's detail modal make the classification inspectable — if one looks
  wrong, `TECH_RULES` in `index.html` is where to fix it.
- The Meta view's per-archetype consensus counts every scraped list once;
  unlike the Diana lists, field decks carry no placement weighting. Several
  archetypes have only 1–2 lists, so their "consensus" is just that list.
