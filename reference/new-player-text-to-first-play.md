# New-player text: I'M READY to first card play (Neanderthal battle)

**Scope:** every line of text a brand-new player reads, in order, from pressing **I'm Ready** on the home screen to dragging their first card (Gatherer) in the scripted Neanderthal battle.
**Branch:** `editor-suite`. Updated 2026-10-17 for these changes:
- the trimmed opening (commit `decd748`);
- the camp callout, the map dialogue's "▶ Tap to continue" cue and tap-anywhere advance;
- map typing at 21 ms/char (was 28).

**Assumptions:**
- The player is a brand-new guest with empty localStorage. Flags `sog_intro_seen`, `sog_adventure_intro_complete` and `sog_battle_neanderthal_complete` are all unset, and this is attempt 1 of the Neanderthal battle (`sog_neanderthal_attempts`).
- The player picks the **female** adventurer. The male path has the same text; only the sprite and portraits change.
- The two first-visit popups ("Before You Begin" welcome, guest notice) show *before* I'm Ready, so they are not included.
- **Method:** text was copied from source. The map and camp lines were then checked in a headless-Chrome run of this exact path (localhost:8750 `?emulator=1`, mouse at 1280×800 and touch at 1366×768, Analytics stubbed, no account actions), where every line appeared as listed. Every map line also fits the HUD bar at 24px (at most 2 lines, nothing clipped) at both sizes.

**Columns:**
- *Where:* **map** is the overworld, with dialogue in the HUD bar along the bottom. **battle** is the battle screen. **overlay** is the home screen, the video, or a popup over the stage.
- *Tap?:* whether the player must tap or click to move past this line.
- Speakers are never named on screen; they are identified only by portrait.

---

## 1. Adventurer pick, intro, title cards (A)

| ID | Speaker | Text | Where | Tap? |
|---|---|---|---|---|
| — | (tap target) | **I'm Ready** button | overlay (home) | **Tap 1** |
| A1 | Narrator (subtitle) | Choose your adventurer | overlay (home, adventurer stage) | Yes. Tap target is a sprite (female / male): **Tap 2** |
| A2 | Title card (burned into video) | SHOULDERS OF GIANTS | overlay (intro video, `video/titleintro.mp4`, 8.8 s) | No. Plays on its own (optional **Skip ▸** button, or Enter / Space / Esc) |

After the pick: door opens, sprite walks in, iris wipe, then the video (first visit only), then an iris-open onto the East Africa map. None of these has text.

## 2. East Africa arrival and map dialogue (M)

M1–M4 start on their own **3 s after arrival**, and movement is locked.
- Each line types out in the HUD bar at **21 ms/char**.
- Once a line has finished typing, **"▶ Tap to continue"** blinks under the speaker's text.
- **Advance: a tap or click anywhere, or Space / Enter.**
  - A tap while the line is still typing only finishes it.
  - Taps on other controls (buttons, links) outside the bar are left to them.

| ID | Speaker | Text | Where | Tap? |
|---|---|---|---|---|
| M1 | Explorer | Jumpin' jackrabbits... | map | Yes |
| M2 | Explorer | I don't think that was a normal doorway. | map | Yes |
| M3 | Explorer | Where am I? What do I do? | map | Yes |
| M4 | Explorer | I think I'm gonna be late to soccer practice. | map | Yes |
| M5 | System callout (shared style, pointing at the camp) | Tap the camp to begin! | map | No. Stays up until the camp is tapped. The camp's name label **"Neanderthal Camp"** is pinned under it at the same time, on touch screens too. |
| — | (tap target) | **Neanderthal Camp** node | map | **Tap**. M5 and the pinned label clear. |
| M6 | Lucy | Mmmhm... I'm standing right here. | map | Yes |
| M7 | Explorer | Woah, you can talk?! I thought you were an ape! | map | Yes |
| M8 | Lucy | Australopithecus, to the uninitiated. | map | Yes |
| M9 | Explorer | Australo-what-now? | map | Yes |
| M10 | Lucy | I'm one of your earliest bipedal human ancestors to stand on two legs. | map | Yes |
| M11 | Explorer | My ancestor? We're related? | map | Yes |
| M12 | Lucy | I'm like your great aunt a million times over. | map | Yes |
| M13 | Explorer | How am I even HERE? Did I time travel? | map | Yes |
| M14 | Lucy | Relax. I might be millions of years old, but I don't have all the answers. | map | Yes |
| M15 | Explorer | That doesn't help my nerves. | map | Yes |
| M16 | Explorer | I have to get home for soccer practice. | map | Yes |
| M17 | Lucy | Right... | map | Yes |
| M18 | Lucy | All I know is that by standing on my own two feet, I always get where I want to go. | map | Yes |
| M19 | Explorer | Maybe I will find my way home. | map | Yes |
| M20 | Lucy | You do that. Now, I'm going to use my bipedal powers to get myself a drink. | map | Yes |

After M20 the explorer walks to the camp on her own. There is no text during the walk.

## 3. Pre-battle lines at the Neanderthal camp (C)

These use the same HUD bar, cue and advance rule as section 2. They start on their own when the walk ends.

| ID | Speaker | Text | Where | Tap? |
|---|---|---|---|---|
| C1 | Explorer | This fire seems promising. Maybe someone here knows something. | map | Yes |
| C2 | Neanderthal | Ughh... | map | Yes |
| C3 | Explorer | Jugglin' jaguars... is that a caveman? | map | Yes |
| C4 | Neanderthal | AARRGH! | map | Yes |
| C5 | Explorer | HELP?! | map | Yes |

Next comes a 1 s radial wipe (no text) into the battle screen. There is **no rules popup** on this path.

## 4. In-battle Lucy / Neanderthal exchange and Lucy's story line (B)

These are speech bubbles with portraits, typed at 32 ms/char (unchanged).
- "▶ Click to continue" appears under each bubble once it has finished typing.
- **Advance: click anywhere, or Space / Enter.**
- Lucy's avatar pops in on B2.
- After B5 the camera shakes and the hand, turn box and buttons slide in, then B6 plays.

| ID | Speaker | Text | Where | Tap? |
|---|---|---|---|---|
| B1 | Neanderthal | This my fire. | battle | Yes |
| B2 | Lucy | He thinks he invented fire and doesn't have to share it. | battle | Yes |
| B3 | Neanderthal | Me no think. Me know. | battle | Yes |
| B4 | Lucy | You no think, alright. | battle | Yes |
| B5 | Neanderthal | AARRGH!!! | battle | Yes |
| B6 | Lucy | Alright, let's try and avoid an early extinction event. | battle | Yes |

In the scripted first battle, B6 is Lucy's **only** remaining story line. Her old 9-line instruction block ("See those cards?" … "Click and drag your first card into play.") is not shown.

## 5. Instruction callouts up to the first play (K)

| ID | Speaker | Text | Where | Tap? |
|---|---|---|---|---|
| K1 | System (pinned goal, top centre) | Get more IP than the Neanderthal! | battle | No. Stays up for the whole battle |
| K2 | System callout (points at Gatherer's IP number) | This number is the card's IP. | battle | Yes. Shows "Tap to continue ▸"; tap anywhere (input is blocked until then) |
| K3 | System callout, 2nd line of K2 | IP = Influence Points | battle | Same tap as K2 |
| K4 | System instruction (left of the Gatherer card) | Drag Gatherer onto The Camp. | battle | No. Stays up with an animated hand drag guide (2 loops) until the player **drags Gatherer** (the first play) |

K1 and K2 appear together. K4 appears after the K2 tap.

Just past the end of this scope, the next text is "Now press End Turn." It appears once Gatherer is placed.

### On-screen labels (static UI, not counted as lines)
- **Home / pick:** "Shoulders of Giants" title (already on screen before I'm Ready), ← back arrow, "By Mr. Shutler-Ojeda".
- **Video:** "Skip ▸".
- **Map HUD:** "East Africa" region label, "GUEST" corner strip, "Deck 1", gold "0", "FOCUS".
- **Map dialogue:** the "▶ Tap to continue" cue.
- **Map:** the pinned "Neanderthal Camp" label.
- **Battle:**
  - turn box: "TURN 1 / 4", "CARDS TO PLAY 1";
  - board: "THE CAMP", scores "0 / 0", "DECK 5";
  - buttons: "END TURN 1/4", ↻ reset;
  - the Gatherer card face: "GATHERER", "Prehistory", IP 2.

---

## Totals

| Measure | Before trim | After trim (`decd748`) | **Now** |
|---|---|---|---|
| Lines | 47 | 36 | **37** (A 2 · M 20 · C 5 · B 6 · K 4; 36 if K2 and K3 count as one callout) |
| Taps to advance (minimum) | 45 | 34 | **34** |
| Words | 252 | 230 | **235** (A 6 · M 158 · C 18 · B 33 · K 20). Split on spaces; "=" is not counted as a word. |
| Read time at 150 wpm | 1:41 | 1:32 | **1:34** (235 / 150 = 1.57 min) |
| Map typewriter (HUD) | 28.2 s (1,006 chars × 28 ms) | 25.3 s (905 × 28 ms) | **19.0 s** (905 × 21 ms) |
| Battle typewriter (bubbles) | 5.6 s (175 × 32 ms) | 5.6 s (176 × 32 ms) | **5.6 s** |
| Fixed waits | 11.8 s | 11.8 s | **11.8 s** (8.8 s video + 3 s arrival pause) |
| **Total to first card** | **≈ 2:26** | **≈ 2:15** | **≈ 2:10** |

The total is reading time + typewriter + fixed waits. It does not count:
- the walk to the camp;
- the radial wipe;
- the shake and slide-in animations;
- any time the player spends looking for the camp before tapping it. The new M5 callout is meant to cut that last one to almost nothing.

**What the 34 taps are:**
- I'm Ready (1)
- adventurer sprite (1)
- M1–M4 (4)
- Neanderthal Camp node (1)
- M6–M20 (15)
- C1–C5 (5)
- B1–B6 (6)
- the K2/K3 callout (1)

M5 needs no tap of its own: it is cleared by the camp tap. The first play itself is a drag and is not counted. The video needs 0 taps, though Skip is optional.

This is the **minimum**: it assumes the player waits for every typewriter line to finish. A tap during typing only fills in the rest of the line, so an impatient player taps twice per dialogue line. That makes up to 30 more taps across M, C and B (64 in total).

---

## Notes / ambiguities

1. **I'm Ready (first visit)** goes straight to the adventurer stage. It skips the path menu and the Adventure dev-warning popup.
   - Source: `js/home.js:403-411`, `440-457`, `619-628`.
   - Subtitle text: `index.html:49`.
   - Pick handler: `js/home.js:775`.
2. **Intro video** is gated to the first visit (`js/home.js:926-930`), played by `playTitleIntro` (`js/home.js:939-990`), with markup at `index.html:225-228`.
   - The only readable text is the burned-in "SHOULDERS OF GIANTS" title. It also briefly flashes card art, which is not counted.
   - If autoplay is rejected, the video is skipped and A2 never shows.
3. **Map dialogue (M1–M4):** `PHASE1_DIALOGUE`, `js/overworld.js:69`. Fired 3 s after arrival by `maybePlayAdventureIntro` (`js/overworld.js:3208`, `PHASE1_WAIT_MS` at `:508`).
4. **Camp callout (M5):** `_showCampPrompt` / `_hideCampPrompt` in `js/overworld.js:3247-3273`, called from `onPhase1End` (`:3228`).
   - Cleared on the first camp tap (`:2951`) and on leaving the map (`transitionToMap`, `:3065`).
   - It uses the shared `SOG.Callouts` toolkit (`js/game/callouts.js`) in a layer inside `#screen-overworld`, so menus and the deck builder cover it.
   - The name label is pinned by `_pinNodeLabel` (`js/overworld.js:2023`): it stays up without hover, and hovering another node shows that one, then the pin comes back.
5. **Map dialogue (M6–M20):** `PHASE2_DIALOGUE`, `js/overworld.js:490`. It fires only on the first click of the Neanderthal Camp node, *before* the walk (`playPhase2Then`, `:3560`).
6. **HUD typing and advance:**
   - Typing speed: `TYPE_SPEED_MS = 21`, `js/sog-adventure-hud.js:175`.
   - Advance handler: `_onAdvance` / `_attachAdvanceListener` (`:810`, `:841`).
     - A click anywhere on the page advances. The handler is armed 300 ms after the dialogue opens, so the tap that started it (and a touch screen's late synthetic click) cannot skip the first line.
     - Clicks on buttons, links and form fields outside the bar are ignored.
   - The cue is `#adv-hud-dlg-cue` (`index.html`, inside `#adv-hud-dialogue`), styled at `css/style.css:10102-10119`. It shows when `#adv-hud.is-ready`, and sits under the active speaker's side.
   - The same HUD runner also serves the other overworld dialogues and battle-hook dialogue, so they get the cue, tap-anywhere and the faster typing too.
7. **Pre-battle (C):** `playPreBattleDialogue`, `js/sog-adventure-prehistory.js:220`. It is run on the map through `Overworld.runPreBattleLines`.
8. **No rules popup:** the Neanderthal config sets `opening: { dealBeforeIntro: true }`, so the engine skips `_openingRulesGate`.
9. **Battle bubbles (B):** B1–B5 are `COACHING_PHASE_1` (`js/sog-adventure-prehistory.js:504`); B6 is `COACHING_PHASE_2_SCRIPTED` (`:528`).
   - The first line of the unscripted `COACHING_PHASE_2` (used after the first win) carries the same "let's" fix.
10. **Callouts (K):** `_snapTurn1` at `js/sog-adventure-prehistory.js:1856`. K2/K3 appear only on attempt 1; a retry skips them.
11. **Not on this path:**
    - The account/save prompt is post-Ötzi only.
    - Order badges need more than one location.
    - The teacher onboarding card is for teachers only.
12. **Gender:** no dialogue line depends on the pick. Only the walking sprite and the Explorer portrait change. The player is always "Explorer"; no name variable is used.
