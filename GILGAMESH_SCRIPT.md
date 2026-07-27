# Gilgamesh Arc — Full Sequence Script

> Edit the dialogue text directly in the source files at the line numbers noted for each block.
> Non-dialogue beats (card/gold acquisitions, flag animations, scoreboards, screen changes)
> are marked `▸ [ ... ]` so it's clear what happens between the spoken lines.
> `who:` maps to a portrait — `explorer` = player, `otzi` = Gilgamesh's IN-BATTLE portrait,
> `gilgamesh` = Gilgamesh's OVERWORLD portrait, `farmer`, `sargon`, `lucy`.

---

## 0. (Not part of this arc) Adventure intro — East Africa
`PHASE1_DIALOGUE` (overworld.js:57) and `PHASE2_DIALOGUE` (overworld.js:399) are the very
first arrival + Lucy conversation in Prehistory. Listed here only so you know they're
SEPARATE from Gilgamesh and editing them won't touch this arc.

---

## 1. Overworld — first time the Gilgamesh (Uruk) node is clicked
**Plays when:** player clicks the Gilgamesh node for the first time (before any battle).
**Source:** `D2B_GILGAMESH_DIALOGUE` — overworld.js:173

```
gilgamesh : Welcome to my city, Uruk.
explorer  : Oh hi! You must be the mayor!
gilgamesh : How DARE you confuse me for a civil servant?!
explorer  : What?
gilgamesh : I am Gilgamesh.
gilgamesh : KING Gilgamesh.
explorer  : But you said it was just a city.
gilgamesh : Just a city? It's my city-STATE.
explorer  : Oh, I'm sorry...
gilgamesh : You will be.
```
▸ [ transitions into BATTLE 1 (Serf tier) ]

> NOTE: `D3_GILGAMESH_CHALLENGE_AGAIN` (overworld.js:191) is defined but currently UNUSED
> (no code references it). Editing it does nothing. Flagged so you can decide to wire or delete it.

---

## 2. In-battle — BATTLE 1 opening (Serf tier), first time only
**Plays when:** BATTLE 1 starts, only if never seen AND Cuneiform not yet granted
(`onBattleStart` → `_runOpeningDialogue`, gilgamesh.js:300 / :1468).
**Source:** `OPENING_PRE` — gilgamesh.js:293

```
Gilgamesh     : Prepare to be smited into the great beyond.
explorer : Gulp.
explorer : How do you play this, again?
```
▸ [ Gilgamesh portrait glows; prompt bubble: "Click on me, if you need a reminder."
    (`OPENING_PROMPT`, gilgamesh.js:298). Clicking the portrait opens the Rules popup. ]
▸ [ after the rules popup closes: ]
```
explorer : Thank you!
```
▸ [ battle begins ]

---

## 3a. BATTLE 1 — LOSS (before the fluke win is earned)
**Plays when:** player LOSES or TIES battle 1 and has NOT yet beaten the Serf flag.
**Source:** `GILGAMESH_LOSS_SMACK` — gilgamesh.js:606

```
Gilgamesh     : Muahaha...
explorer : I never had a chance.
Gilgamesh     : What did you expect in my city-state?
```
▸ [ DEFEAT scoreboard — 2 buttons: PLAY AGAIN / GAMEBOARD (no Back To Map) ]

### 3a-i. PLAY AGAIN → post-loss Cuneiform intervention (only if Cuneiform not yet owned)
**Source:** `_runCuneiformIntervention` — gilgamesh.js:1120
▸ [ "shh" sfx → board fades to black → candle flame lights ]
**Source:** `FARMER_POSTLOSS_A` — gilgamesh.js:1060
```
farmer   : Hey. That was a tough battle.
explorer : His cards were so much more advanced than mine.
farmer   : Of course they were. You were playing in Prehistory.
farmer   : You didn't stand a chance.
explorer : Then what do I do? I can't get stuck here!
farmer   : You need to bring your cards up to date.
```
▸ [ CUNEIFORM card acquisition animation ]
**Source:** `FARMER_POSTLOSS_B` — gilgamesh.js:1068
```
explorer : What's Cuneiform?
farmer   : The first written language.
explorer : Oh, how does it work?
farmer   : You should read it, obviously.
explorer : Oh, right.
farmer   : In effect, it will empower those old prehistoric cards you have.
explorer : Thank you.
farmer   : Don't mention it.
farmer   : Seriously, he'll kill me.
```
▸ [ candle fades → back to the battle board → Gilgamesh re-challenges: ]
**Source:** `GILGAMESH_POSTLOSS_CHALLENGE` — gilgamesh.js:1079
```
Gilgamesh     : Back for more?
explorer : I think, I'm ready.
Gilgamesh     : I think you should have learned your lesson.
explorer : That's exactly what I did.
```
▸ [ board shakes → restart BATTLE 1 (still Serf tier), Cuneiform now in the deck.
    On any later PLAY AGAIN once Cuneiform is owned, it restarts directly with no intervention. ]

---

## 3b. BATTLE 1 — WIN ("the fluke"): Serf flag
**Plays when:** player WINS battle 1 for the first time (won outright or via the Cuneiform comeback).
**Reward:** 15 gold, NO card.
**Source sequence:** `_runFirstWinFlukeSequence` — gilgamesh.js:890
▸ [ battle music already faded (endGame). Dialogue plays FIRST, then the scoreboard. ]

**Source:** `GILGAMESH_FLUKE_A` — gilgamesh.js:623
```

Gilgamesh     : What?! A wanderer in a silly hat bested me?
explorer : Hey! I like my hat.
Gilgamesh     : Suppose underestimating you was my downfall.
Gilgamesh     : Here.
```
▸ [ (fluke-win guard: if the player never lost and so never got Cuneiform, it's granted
    here silently/idempotently) ]
▸ [ GOLD ACQUISITION — 15 ]
**Source:** `GILGAMESH_FLUKE_B` — gilgamesh.js:634
```
otzi     : Take it to the market and buy yourself a real deck.
otzi     : You'll need it for your return.
otzi     : To face a true Giant.
```
▸ [ VICTORY scoreboard — 2 buttons: CONTINUE / GAME BOARD ]
▸ [ CONTINUE → return to overworld:
      • 650ms pause
      • Serf flag STAMP animation
      • 300ms pause
      • Giant flag ERECTION animation
      • Marketplace node fades in ]

---

## 4. Overworld — first exit from the Marketplace
**Plays when:** player leaves the Marketplace for the FIRST time (after fluke-win shopping).
**Note:** the deck-builder is un-greyed SILENTLY here (no dialogue); this interstitial is the only thing that plays.
**Source:** `D4_FIRST_MARKET_INTERSTITIAL` — overworld.js:228

```
explorer : Wow, I'm really starting to build a collection.
explorer : Let's go show Gilgamesh what I've got.
```
▸ [ Sargon node does NOT appear yet — the only path forward is back to Gilgamesh for the rematch. ]

---

## 5. In-battle — BATTLE 2 opening (Giant REMATCH)
**Plays when:** the Giant rematch battle starts (`_isGilgameshRematch()` true → onBattleStart, gilgamesh.js:1458).
No portrait pause / rules popup (already learned in battle 1).
**Source:** `GILGAMESH_REMATCH_INTRO` — gilgamesh.js:641

```
Gilgamesh     : So. You came back.
explorer : I thought it the polite thing to do.
Gilgamesh     : No flukes now, wanderer.
Gilgamesh     : Witness the strength that built this city.
```
▸ [ battle begins ]

---

## 6a. BATTLE 2 — LOSS (Giant rematch)
**Plays when:** player LOSES the Giant rematch. No grant.
**Source:** `GILGAMESH_REMATCH_LOSS` — gilgamesh.js:662

```
Gilgamesh     : There.
Gilgamesh     : I knew you were a fluke of history.
Gilgamesh     : Come back when you can truly fight…
Gilgamesh     : If you dare.
```
▸ [ DEFEAT scoreboard — 3 buttons: PLAY AGAIN / GAMEBOARD / BACK TO MAP ]

## 6b. BATTLE 2 — DRAW (Giant rematch)
**Plays when:** the Giant rematch ends in a TIE. A draw is not a win → no grant.
**Source:** `GILGAMESH_REMATCH_DRAW` — gilgamesh.js:670

```
Gilgamesh     : A draw? You held against me?
Gilgamesh     : …Impressive. But a draw is not a victory, wanderer.
Gilgamesh     : We fight again.
```
▸ [ scoreboard — 3 buttons: PLAY AGAIN / GAMEBOARD / BACK TO MAP ]

---

## 6c. BATTLE 2 — WIN (Giant rematch): Giant flag
**Plays when:** player WINS the Giant rematch for the first time.
**Reward:** the Gilgamesh card + 15 gold.
**Source sequence:** `_runRematchWinSequence` — gilgamesh.js:916
▸ [ battle music already faded. Dialogue plays FIRST, then the scoreboard. ]

**Source:** `GILGAMESH_REMATCH_WIN_A` — gilgamesh.js:650
```
Gilgamesh     : You have done it again.
Gilgamesh     : You fought as an equal.
explorer : My teacher says I exceed standards.
Gilgamesh     : You earned this.
```
▸ [ CARD ACQUISITION — Gilgamesh card ]
▸ [ GOLD ACQUISITION — 15 ]
**Source:** `GILGAMESH_REMATCH_WIN_B` — gilgamesh.js:657
```
Gilgamesh     : Carry it. Along with my respect.
```
▸ [ VICTORY scoreboard — 2 buttons: CONTINUE / GAME BOARD ]
▸ [ CONTINUE → return to overworld:
      • 650ms pause
      • Giant flag STAMP animation
      • Marketplace fades / Sargon node reveal triggers (see §7) ]

---

## 7. Overworld — Sargon node reveal (after the Giant rematch win)
**Plays when:** returning to the overworld after the FIRST Giant rematch win.
**Source (intro):** `D4_SARGON_REVEAL_INTRO` — overworld.js:233
```
explorer : Wow, I can't wait to try out these new cards!
```
▸ [ dust-storm node-reveal animation for the Sargon node ]
**Source (outro):** `D4_SARGON_REVEAL_OUTRO` — overworld.js:236
```
explorer : Okay, that was mysterious.
explorer : I have to go check it out.
```

---

## 8. (Next arc) Sargon encounter
When the Sargon node is clicked, the branch depends on deck size:
- **< 15 cards:** `D4_SARGON_TURNED_AWAY_A` / `_B` (overworld.js:242 / :248) — turned away.
- **exactly 15 cards:** `D4_SARGON_ENCOUNTER` (overworld.js:255) — full Emperor encounter → battle.
(Left here for context; not part of the Gilgamesh arc proper.)
