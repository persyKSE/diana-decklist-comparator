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
- **`fetch_riftools.py`** — pulls two pre-aggregated snapshots from
  riftools.app (a fan-made stats site whose `robots.txt` explicitly allows
  crawling and whose ToS permits informational-use scraping): a real
  legend-vs-legend win-rate matrix computed from actual match records, and
  a meta tier list. Exports `riftools.json`. This is the only *real* win
  rate data in the project — Mobalytics never published per-match results,
  only archetype-level Day1→Day2 conversion counts.
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

The site is a single-page app with a sidebar and six views (Build,
Analyze, Meta, Log, Compare, Decks), a hextech-styled theme drawn from
Riftbound's own visual language — near-black navy with gold chrome and a
parchment light mode — and card hover previews. A **global filter bar** (region / sub-archetype /
placement / date range) recomputes every view from the chosen subset, so
you can ask e.g. "what does the majority build's curve look like without
the off-meta variant?" or "did the CN circuit build differently?". (The
Meta and Log views read the whole field / your own data, so the filters
don't apply there.)

- **Build** — a hands-on **deck builder** in three panes (card preview +
  deck management, the deck as a grid of card art, and a card-search
  panel), styled after summonersbase.com. Click a search result to add
  it to the main deck, right-click to send it to the sideboard;
  left/right-click a deck card to add/remove a copy, shift-click to move
  it between main and sideboard; click a rune to shift the 12-rune split,
  toggle up to three battlefields, scroll the results to page. "Load
  consensus build" fills it from the weighted field average. The deck you
  build IS the list every analysis below reads, so it live-drives the
  **coach** (distance to each winning deck, missing core cards, one-click
  swaps toward the consensus), the **Consistency** draw odds, the **Rune
  math** optimal-split panel (all described below), and the Sideboard
  coverage on the Meta view. Everything is saved in the browser; a banner
  summarises what the last event changed.
- **Analyze** — a **What changed** timeline (the consensus prototype
  rebuilt after each event and diffed against the one before it), card
  inclusion table, card packages, energy curves and a sub-archetype
  dendrogram, and an inclusion timeline. Charts have hover tooltips and
  legend/leaf highlighting.
- **Meta** — every archetype in the scraped field ranked by *threat*
  (field share × Day 1→Day 2 conversion index), with a trend arrow.
  A **field model** bar reweights everything for the field you're
  actually prepping for: *recent form* (exponential decay, 28-day
  half-life) and/or a single region — the recent-form field looks very
  different from the all-time average. Click an archetype for its
  consensus list, curve, staples, unit-size histogram and source
  decklists. Below that, **sideboard coverage** and **mirror prep**
  (see below).
- **Log** — a personal match log, one tap per game (opponent archetype,
  W/L, play/draw, mulligans, notes). Per-matchup records with Wilson
  intervals, ordered by threat rank, with a "drill this" flag on losing
  records against top threats. Stored locally, export/import as JSON
  (merges by game id). No event publishes per-match data, so after
  enough games this is the only matchup table for your list anywhere —
  and your record appears beside each archetype in the coverage table.
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

### Rune math (Build view)

The rune deck is exactly 12 cards and you channel 2 per turn, so "do I
have the colours for this card on curve?" is the same hypergeometric
maths as the draw odds, pointed at the rune deck. The panel derives your
list's colour demand from each card's printed domains (a dual-domain
card needs one rune of each, computed exactly by inclusion–exclusion),
scores **every possible 12-rune split** by expected on-curve colour
misses per game, and recommends the minimum — with the field's consensus
split marked on the same curve for comparison. On the current consensus
list it confirms the field's 7 Chaos / 5 Mind is optimal; the panel earns
its keep when *your* list shifts the demand. Assumes on-curve play going
first and one rune per printed domain; read it as relative evidence
between splits.

### Mirror prep (Meta view)

The better the consensus gets, the more other Diana players converge on
the same 40 — so the mirror is the most predictable matchup in the room.
This section runs the coverage engine against the Diana field itself:
the mirror's threat rank and share under the active field model, what its
board looks like, the cheapest removal size that answers 80%+ of mirror
units, and the best mirror tech you're not holding (ranked by marginal
breadth added, drawn only from cards winning Diana lists already play).
The mirror also appears as a row in the coverage table.

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
exists. Right now it says the consensus sideboard covers **~51%** of the
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

## Hosting (Cloudflare Pages canonical + weekly auto-update)

The site's home is **https://diana-decklist-comparator.pages.dev**
(Cloudflare Pages). It hosts everything GitHub Pages did — the viewer,
the PWA, the card art — plus `/api/submissions`, the backend for the
builder's **Share to community** button. Submissions land in a D1
(SQLite) table, atomically and deduped by content hash; the server
rebuilds every stored row from the deployed card catalogue
(`field.json`), validates deck legality (40-card main, ≤3 copies,
12 runes, ≤10 sideboard, ≤3 battlefields, no banned cards) and
rate-limits per IP, so nothing client-authored is stored or served
back. The viewer fetches
the pool on load and shows it behind an opt-in **community decks**
filter chip — community lists never join the tournament clustering or
the default consensus math. Anywhere without the API (`file://`, a
plain static host) the fetch fails silently and the feature simply
isn't there.

Two workflows ship in `.github/workflows/`:

- `update-data.yml` — every Monday (and on demand from the Actions
  tab) re-scrapes the configured decks, refreshes the card catalogue,
  and commits any changes.
- `pages.yml` — after every push/data update, deploys to Cloudflare
  (the `deploy_cloudflare.sh` script: assembles a clean `dist/` — the
  database, scrapers and `frontend/` never ship — then
  `wrangler pages deploy`). It needs the `CLOUDFLARE_API_TOKEN`
  (permission: Cloudflare Pages — Edit) and `CLOUDFLARE_ACCOUNT_ID`
  repo secrets. Until those exist the job skips and GitHub Pages keeps
  serving the full site; once they exist, GitHub Pages switches to
  `redirect.html`, which forwards visitors — along with their saved
  decks and match logs, carried in the URL fragment — to the canonical
  host.

Deploy by hand anytime with `./deploy_cloudflare.sh` (uses your
`npx wrangler login` session locally).

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
