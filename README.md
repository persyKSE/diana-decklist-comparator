# Diana decklist comparator

Fetches real Riftbound Diana, Scorn of the Moon tournament decklists,
compares them, and shows a shared "core" plus a swap-distance ranking —
all with card images where available.

## Setup (one-time)

Needs Python 3 (already on macOS) and two packages:

    pip3 install cloudscraper beautifulsoup4

## Usage

1. Run the scraper to fetch the latest decklists:

       python3 fetch_decks.py

   This fetches the 5 tournament results listed in `DECK_URLS` at the
   top of `fetch_decks.py`, parses each decklist, downloads any card
   images it can resolve, and writes `decks.json`.

2. Open `viewer.html` in your browser (double-click it, or drag it into
   Chrome/Safari). It reads `decks.json` and shows:
   - the shared core (cards common to every deck loaded)
   - a "closest to the field" ranking (average card swaps to convert
     into every other deck — lower means more representative of the
     shared archetype)
   - a swap-distance matrix between every pair of decks

## Adding more decks

Add a new entry to `DECK_URLS` in `fetch_decks.py`:

    "Label - Event Placement": (
        "https://mobalytics.gg/riftbound/decks/...",
        "Top 8", "Some Regional Qualifier"
    ),

Then re-run `python3 fetch_decks.py`.

## Card images

Images are resolved via `card_codes.py`, a small hand-verified lookup of
card name -> set code (e.g. "Ravenbloom Student" -> "OGN-103"), which
maps to `https://static.dotgg.gg/riftbound/cards/{code}.webp`.

This list only covers cards already looked up. Cards without an entry
show a plain "no image" placeholder instead of breaking anything. To
add a card's image:

1. Find its code — search "riftbound.gg cards <card name>" and the
   card's page URL will contain it, e.g. `unl-080-hwei-brooding-painter`
   means the code is `UNL-080`.
2. Add a line to `CARD_CODES` in `card_codes.py`:

       "Hwei, Brooding Painter": "UNL-080",

3. Delete `decks.json` and re-run `fetch_decks.py` to pick up the new
   image.

## Known limitations

- Only pulls from Mobalytics deck pages for now (URL pattern is
  hand-collected, not auto-discovered — there's no public API and the
  full tournament results list is behind JavaScript pagination that a
  simple script can't crawl).
- Card image lookup is manual/best-effort, not automatic, for the same
  reason.
- If Mobalytics changes their page layout, the parser in
  `parse_decklist()` may need adjusting — it currently works by finding
  the text between "Main Deck" and "Sideboard" and splitting on
  1-3 digit count boundaries.

## Prototype deck builder (weighted)

viewer.html now builds a "prototype" 40-card Diana deck from the source
lists, not just a comparison:

- Each deck is weighted by placement (1st = 3.0, 2nd = 2.0, Top 4 = 1.5,
  Top 8 = 1.0). Adjust the weights in the DECK_URLS tuples in
  fetch_decks.py.
- Every card gets a weighted score = sum of (deck weight x copies run)
  across all decks. Cards are added highest-score-first, at their most
  common copy count, until the deck hits exactly 40 main-deck cards.
- Cards in EVERY deck are tagged "locked" (green); cards in only some are
  "flex" (amber) — these are the real deck-building decisions.
- Runes/battlefields are summarised separately (they aren't part of the
  40-card weighting).

Caveats: this is a consensus/aggregate build — a strong netdeck baseline,
not a proven-optimal list. It weighs card frequency, not synergy or
matchup targeting. "Chosen champion" cards (e.g. Diana, Lunari) sometimes
sit outside the maindeck text on the source page and so score lower than
their true near-universal inclusion.

To improve the signal, add more tournament results to DECK_URLS and
re-run.
