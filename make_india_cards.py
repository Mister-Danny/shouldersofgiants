#!/usr/bin/env python3
"""
Shoulders of Giants — India card definitions, deduplicated.

33 unique cards across the three India decks. Cards appearing in more than one
deck are defined ONCE; the `decks` column lists membership, `copies` gives the
number of copies per deck.

card_id matches the portrait filename. Three cards have a display name that
differs from the id:
    Lord of the Beasts -> india_pashupati
    Asoka              -> india_ashoka
    Dalit              -> india_dalits

    python3 make_india_cards.py    # writes india_cards.csv
"""

import csv

F = ["card_id", "card_name", "ip", "cc", "primary_type", "secondary_type",
     "era", "ability_name", "ability_text", "decks", "copies", "note"]

H, E = "Harappan", "Early India"
D1, D2, D3 = "priest_king", "siddhartha", "gupta"


def r(cid, name, ip, cc, ptype, era, aname, atext, decks, copies=1, note=""):
    return dict(card_id=cid, card_name=name, ip=ip, cc=cc, primary_type=ptype,
                secondary_type="", era=era, ability_name=aname,
                ability_text=atext, decks=decks, copies=copies, note=note)


ROWS = [
    # ── Priest-King deck (15 slots: 9 singles + 3 cards at 2 copies) ────
    r("india_priest_king", "Priest-King", 6, 5, "Political", H,
      "Unknown Authority",
      "At Once: Take on the text from the card at the bottom of your deck.", D1),
    r("india_great_bath", "Great Bath", 5, 4, "Religious", H,
      "Sacred Water",
      "When a card is played or moves here, restore it to its base IP.", D1),
    r("india_granary", "Granary", 2, 3, "Economic", H,
      "Surplus",
      "End of Turn: Gain +1 IP for every Capital you did not spend this turn.", D1),
    r("india_drainage_system", "Drainage System", 3, 4, "Scientific", H,
      "Carried Away",
      "At Once: Heal all damage to your cards here. Gain that much IP.", D1),
    r("india_pashupati", "Lord of the Beasts", 3, 4, "Religious", H,
      "Unleash the Beast",
      "At Once: Send a beast to another location.", D1),
    r("india_beast", "Beast", 4, 3, "Labor", H,
      "Rawr!",
      "", "", 0,
      "TOKEN - summoned by Lord of the Beasts, not in any deck"),
    r("india_cotton", "Cotton", 1, 1, "Economic", E,
      "Natural Resource",
      "At Once: Your Labor cards here gain +2 IP.", f"{D1}|{D2}|{D3}"),
    r("india_indus_seals", "Indus Seals", 3, 2, "Economic", H,
      "Stamped and Sealed",
      "At Once: Merge into a card here. Additional +1 if it's Economic.", D1),
    r("india_fired_brick", "Fired Brick", 2, 2, "Labor", H,
      "One Size",
      "At Once: Draw a card and set each card in your hand's IP equal to its CC.", D1),
    r("india_standardized_weights", "Standardized Weights", 3, 3, "Economic", H,
      "Honest Measure",
      "At Once: Set all cards here to 3 IP.", D1),
    r("india_farmer", "Farmer", 0, 1, "Labor", H,
      "Sowing Season",
      "At Once: The top card of your deck gains +3 IP.", D1, 2),
    r("india_merchant", "Merchant", 2, 1, "Economic", H,
      "Trade Route",
      "When you play an Economic card here, gain +1 IP and move. "
      "+1 more if it's from a different civilization.", D1, 2),
    r("india_priest", "Priest", 0, 2, "Religious", H,
      "Sacrificial Rites",
      "At Once: Each card in your hand gives 1 IP to your Priest.", D1, 2),

    # ── Siddhartha deck (15 slots, all single copies) ───────────────────
    r("india_the_buddha", "The Buddha", 0, 4, "Religious", E,
      "Four Noble Truths",
      "Continuous: +2 IP for each of your cards in play with damage.", D2),
    r("india_ashoka", "Asoka", 5, 5, "Political", E,
      "The Sword & The Scroll",
      "At Once: Destroy all your cards here. For each card destroyed, "
      "give +2 IP to your Religious cards in-hand.", D2),
    r("india_stupa", "Stupa", 2, 3, "Religious", E,
      "Circling the Shrine",
      "End of Turn: +1 IP to your other Religious cards here.", D2),
    r("india_jain", "Jain", 2, 2, "Religious", E,
      "Nonviolence",
      "Continuous: Military cards cannot be played here.", D2),
    r("india_missionary", "Missionary", 3, 2, "Religious", E,
      "Turn The Wheel",
      "Can move once. +1 IP to your non-Religious cards when arriving at a new location.",
      D2, 1, "also used in the China set (Zhang Qian deck)"),
    r("india_upanishads", "Upanishads", 3, 3, "Religious", E,
      "Reincarnation",
      "At Once: A discarded or destroyed card returns here.", D2),

    # ── shared by Siddhartha and Gupta ──────────────────────────────────
    r("india_brahmin", "Brahmin", 4, 4, "Religious", E,
      "The Priestly Privilege",
      "Continuous: Gain +1 IP for each other Religious or Political card you control here.",
      f"{D2}|{D3}"),
    r("india_kshatriya", "Kshatriya", 3, 3, "Military", E,
      "The Soldier's Duty",
      "At Once: Destroy an opponent card here with less IP.", f"{D2}|{D3}"),
    r("india_shudra", "Shudra", 0, 1, "Labor", E,
      "The Worker's Burden",
      "Your cards played here gain +1 IP.", f"{D2}|{D3}"),
    r("india_dalits", "Dalit", 0, 0, "Labor", E,
      "Outcaste",
      "Continuous: Decrease all other cards here by -1 IP.", f"{D2}|{D3}"),
    r("india_vaishya", "Vaishya", 2, 2, "Economic", E,
      "The Trader's Duty",
      "When you play an Economic card here, gain +2 IP and move. "
      "+1 more if it's from a different civilization.", f"{D2}|{D3}"),
    r("india_vaishya_farmer", "Vaishya", 2, 2, "Labor", E,
      "The Farmer's Duty",
      "At Once: The top card of your deck gains +2 IP.", f"{D2}|{D3}", 1,
      "same display name as india_vaishya, different card"),
    r("india_caste_system", "Caste System", 4, 4, "Political", E,
      "Social Hierarchy",
      "Continuous: Reduce the IP of all cards here that cost 0, 1, or 2 CC by -1 IP.",
      f"{D2}|{D3}"),
    r("india_sanskrit", "Sanskrit", 1, 1, "Cultural", E,
      "Sacred Script",
      "At Once: Merge into a card here. Additional +2 IP if it's Religious.",
      f"{D2}|{D3}"),

    # ── Gupta deck (15 slots, all single copies) ────────────────────────
    r("india_the_gupta", "The Gupta", 4, 5, "Political", E,
      "Golden Age",
      "End of Turn: +1 IP to each of your Scientific and Cultural cards here.", D3),
    r("india_bhagavad_gita", "Bhagavad Gita", 3, 4, "Religious", E,
      "Dharma",
      "Continuous: +2 IP to locations where your cards are all different types.", D3),
    r("india_number_zero", "Number Zero", 0, 1, "Scientific", E,
      "From Nothing",
      "End of Turn: +1 IP to your other Scientific cards here.", D3),
    r("india_inoculation", "Inoculation", 2, 2, "Scientific", E,
      "Immunity",
      "At Once: -1 IP to a card here and then 2x its IP.", D3),
    r("india_alloy", "Alloy", 1, 3, "Scientific", E,
      "Stronger Together",
      "At Once: Merge with the last card you played here, and 2x the IP.", D3),
    r("india_vedas", "Vedas", 4, 4, "Religious", E,
      "Holy Hymnals",
      "At Once: -1 CC to Religious cards in-hand.", D3),
]


def main():
    out = "india_cards.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=F)
        w.writeheader()
        w.writerows(ROWS)
    print(f"wrote {len(ROWS)} unique India cards to {out}")
    for deck, label in ((D1, "Priest-King"), (D2, "Siddhartha"), (D3, "Gupta")):
        n = sum(int(x["copies"]) for x in ROWS
                if deck in str(x["decks"]).split("|"))
        print(f"  {label}: {n} slots")


if __name__ == "__main__":
    main()
