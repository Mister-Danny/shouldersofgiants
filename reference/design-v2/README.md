# Design pass v2: the approved subset (behind the flag)

**Branch:** `design-pass`.
**Flag:** `SOG_FEATURES.DESIGN_V2` in `js/feature-flags.js`, default **false**. Preview with `?design=v2`.

**Code:**
- `css/design-v2.css`: every rule is scoped to `html.design-v2`.
- `js/design-v2.js`: only splits the turn line; it returns at once without the class.

**Screenshots:** all at 1366×768 unless named otherwise, before (flag off) on the left and after (flag on) on the right.

## What the flag turns on (and nothing else)

1. **Battle location scores at 44px (were 28), vertically centred.**
   - At 44px, CTGalbite's digits sit 4.4px above the middle of their line box. The score uses a zero-height line box plus 8.8px of top padding, so the ink's centre lands on the box's centre without making the location bar taller.
   - Checked at 1366×768 and 1280×800: within half a pixel.
   - Screenshots: `compare-scores-and-turnbox-zoom.png`, `compare-score-1280x800-zoom.png`.
2. **Turn box.**
   - "TURN 2 / 4" is split into a 16px "TURN" and a 44px "2/4".
   - "CARDS TO PLAY" is 16px, with a 44px number.
   - Labels are top-aligned: each row aligns to the top, and the label drops 1.4px so its capitals' tops meet the digits' tops.
   - Label colours are unchanged.
3. **End Turn, enabled:** purple (I'M READY gradient, light-purple edge). Its turn-1 attention pulse is purple to match. The disabled state is unchanged.
4. **Result screens: the scoreboard version.** Big VICTORY, subline and per-location rows, with the subline and rows at 18px.
   - CONTINUE and PLAY AGAIN are purple.
   - GAME BOARD and BACK TO MAP are neutral (dark wood, bronze edge, cream text, purple edge on hover).
   - No reward card in the panel. A newly won card keeps its own reveal, unchanged: `compare-card-reveal-unchanged.png`.
5. **Map transition (exit) boxes:** purple dashed outline and a faint purple fill on hover and flash. On touch-only screens the always-on outline is also purple.
6. **Map objective:** a purple ground ring, a little bigger and thicker than the gold one. The node's own glow stays gold.
7. **Deck builder Save Decks / Let's Play (`.btn-save`), enabled:** purple. The disabled state is unchanged.
8. **Learning check popup:** only its frame changes. Nothing else on it was touched by design-v2: question text, options, the right/wrong colours, the Next / Done buttons, the close ×, the title.
   - The border goes from gold `#d4aa50` to bronze `#8a6a40`.
   - The outer rings go from dark 3px / brown `#6a4418` 6px / dark 7px, plus a warm inner glow (`inset 0 0 28px rgba(60,30,0,.55)`), to black 2px / bronze `#6b4a1e` 5px, plus a soft drop shadow (`0 8px 30px rgba(0,0,0,.8)`). The inner glow is gone.
   - This was confirmed by comparing computed styles with the flag off and on.
   - Screenshot: `compare-learning-check.png`.

Reverted to the live look: the home screen, the faded name behind the card reveal, map label and HUD region sizes, the map explorer size, deck pile colours, playable-card outlines in hand, the node's glow colour, secondary buttons outside the result screens, popup frames other than the learning check, and every other recolour.

## Separate fix (no flag): the cross through the round check / counter circles

**Circles:**
- the deck builder tick (`.db-pick::before`);
- the map ✓ on beaten nodes (`.overworld-node-complete::before`, e.g. Neanderthal Camp and the Ötzi signpost);
- the battle order badges (`.order-badge`, the numbered circles under your staged cards).

**Cause:** each circle was a box with `border-radius: 50%` plus a thin `border` and `box-shadow`s, drawn inside the stage, which is scaled by a non-integer factor. The GPU draws a thin border on a fully rounded box in pieces, and at fractional scales the pieces can leave a faint line along each axis through the centre: the cross in the screenshot.
- Headless Chrome (software raster) doesn't show it, at device scale 1 or 2. It needs a real GPU-rendered screen.

**Fix:** each circle is now ONE radial-gradient image (fill, ring and dark edge), with no border / border-radius / box-shadow. Glows and cast shadows moved to `filter: drop-shadow`, which follows the drawn circle. The move badge's dashed ring is a conic stripe under the fill, masked to the circle.
- Sizes, colours and states are as before (hover, selected, lit, waiting, move).
- Screenshots: `compare-check-deckbuilder-zoom.png` (2× device pixels), `compare-check-map-zoom.png`, `compare-check-order-badge-zoom.png`.

**Did it creep in recently? No.** None of these rules changed in the recent commits:
- the deck builder circle dates from `da4e40e` (2026-09-28);
- the map ✓ from `06e9300` / `c3796d0` (2026-10-04);
- the order badges from `d5109d9` (2026-10-17), built the same way from the start;
- the stage scaling (`js/sog-stage.js`) was last changed in `8e1811a` (2026-08-24).

So it is a rendering artifact of how they were drawn all along. It may have become visible with a browser / GPU update or a particular screen scale.
