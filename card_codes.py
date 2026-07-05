"""
Card name -> set code lookup, used to build image URLs on static.dotgg.gg.

Image URL pattern (confirmed from riftbound.gg card pages):
  https://static.dotgg.gg/riftbound/cards/{CODE}.webp
  e.g. OGN-103.webp for Ravenbloom Student, UNL-079.webp for Diana, Lunari

This table only needs to cover cards that actually show up in the decklists
you paste in. It is deliberately small and hand-verified rather than scraped
in bulk, because riftbound.gg's card list is paginated behind JS and bulk
scraping it reliably needs a headless browser we don't have here. Add new
cards as you encounter them: run `python3 fetch_card_image.py "Card Name"`
to look one up interactively, or add a line below once you know the code.

Format: "Card Name": "SET-NUMBER"
"""

CARD_CODES = {
    "Diana, Lunari": "UNL-079",
    "Ravenbloom Student": "OGN-103",
    "Diana, Scorn of the Moon": "UNL-197",
    "Hwei, Brooding Painter": "UNL-080",
    "Tideturner": "OGN-199",
    "Traveling Merchant": "OGN-185",
    "Fizz, Trickster": "SFD-140",
    "Vex, Apathetic": "UNL-150",
    "Vex, Cheerless": "SFD-146",
    "Kha'Zix, Mutating Horror": "UNL-143",
    "Stacked Deck": "OGN-183",
    "Stupefy": "OGN-095",
    "Ride the Wind": "OGN-173",
    "Gust": "OGN-169",
    "Moonfall": "UNL-198",
    "Acceptable Losses": "OGN-179",
    "Flash": "OGS-011",
    "Hard Bargain": "SFD-136",
    "Smoke Screen": "OGN-093",
    "Turn to Dust": "UNL-070",
    "Star-Crossed": "UNL-128",
    "Sprite Fountain": "UNL-078",
    "Rebuke": "OGN-172",
    "Eclipse": "UNL-063",
    "Frigid Jewel": "UNL-074",
    "Consult the Past": "OGN-083",
    "Mindsplitter": "OGN-192",
    "Last Rites": "SFD-150",
    "Fading Memories": "OGN-180",
    "Plundering Poro": "SFD-069",
    "Thousand-Tailed Watcher": "OGN-116",
    "Existential Dread": "UNL-134",
    "Abandon": "UNL-131",
    "Eager Apprentice": "OGN-084",
}

def get_image_url(card_name):
    """Return the static.dotgg.gg image URL for a card name, or None if unknown."""
    code = CARD_CODES.get(card_name.strip())
    if not code:
        return None
    return f"https://static.dotgg.gg/riftbound/cards/{code}.webp"
