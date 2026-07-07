# Shoulders of Giants — Narrative & Dialogue Script

> **Purpose:** a single readable transcript of *all* in-game dialogue and narrative text, organized by where it appears in the game's flow, so it can be reviewed and edited in one place.
>
> **How to read this**
> - Every line is **verbatim** from the code (unicode escapes like `’` rendered as their characters `’ … — Ö`). The text in quotes is exactly what the player sees.
> - Each section has a **`Source:`** tag — the file plus the constant/variable or function name — so you can point to exactly what to edit.
> - **`Gate:`** notes say when the text appears (first-visit only, first-loss only, etc.).
> - This is a documentation file only. **No game code was changed.**

---

# PART 1 — ADVENTURE MODE (story order)

## 1.1 — East Africa: Arrival Monologue (Phase 1)
**Source:** `js/overworld.js` → `PHASE1_DIALOGUE`
**Gate:** First arrival on the East Africa map (when `sog_adventure_intro_complete` is not set). Fires ~3s after the map appears (`PHASE1_WAIT_MS`).

- **Explorer:** Huh… That was strange.
- **Explorer:** I should probably be more careful about going through dark doorways.
- **Explorer:** This place looks familiar…
Explorer: I think I saw it on a map in my history book...
- **Explorer:** But where are all the people?

## 1.2 — Meeting Lucy (Phase 2)
**Source:** `js/overworld.js` → `PHASE2_DIALOGUE`
**Gate:** First click of the Prehistory node. Sets `sog_adventure_intro_complete` when it finishes.

- **Lucy:** Mmmhm… 
Lucy: I’m standing right here.
- **Explorer:** Woah, you can talk? 
Explorer: I thought you were an ape?
- **Lucy:** Australopithecus to the uninitiated.
- **Explorer:** Uh, yeah... I totally know what that means.
- **Lucy:** It means I'm one of the earliest human ancestors to stand on two legs.
Explorer: Congratulations!
Lucy: You're welcome.
- **Explorer:** But that doesn’t explain why you can talk.
- **Lucy:** Nothing will. 
Lucy: Don’t over think it.
- **Explorer:** Fair enough. 
Explorer: Well, can you tell me where we are then?
Lucy: My friends and I call it home.
Explorer: But that must mean I traveled back in time. 
Explorer: Like way back.
- **Lucy:** Like I said, don’t over think it.
- **Explorer:** Well then, I guess I better get going.

## 1.3 — Neanderthal Battle: Pre-Battle Exchange
**Source:** `js/sog-adventure-prehistory.js` → `playPreBattleDialogue()` (inline)
**Gate:** Just before the Neanderthal battle starts.

- **Neanderthal:** AARRGH!
- **Explorer:** Uh oh…
Explorer: Help?


## 1.4 — Neanderthal Battle: In-Battle Coaching (Tutorial)
**Source:** `js/sog-adventure-prehistory.js` → `COACHING_PHASE_1`, then `COACHING_PHASE_2`
**Gate:** Plays during the Neanderthal battle (the prehistory tutorial coaching). Phase 2 includes interactive beats (an IP-number pulse on "See that number?", and the final line waits for the player to drag a card).

**Coaching Phase 1**
- **Neanderthal:** This my fire.
- **Lucy:** He thinks he invented fire and doesn't have to share it.
- **Neanderthal:** Me no think. Me know.
- **Lucy:** You no think, alright.
- **Neanderthal:** AARRGH!!!

**Coaching Phase 2**
- **Lucy:** If this Neanderthal wants to get rocked, we're ready to roll.
- **Lucy:** Pay attention, this is important...
- **Lucy:** See those cards?
- **Lucy:** You play one each turn on your side of The Camp.
- **Lucy:** See that number?
- **Lucy:** Those are Influence Points, or IP for short.
- **Lucy:** Your goal here is to gain the most IP at The Camp after four turns.
- **Lucy:** Oh, and most cards have special abilities.
- **Lucy:** If you want to win, click on them to read what they have in store.
- **Lucy:** When you're ready to send this guy back to whatever came before the Stone Age...
- **Lucy:** Click and drag your first card into play.

## 1.5 — Neanderthal Battle: Result Dialogue
**Source:** `js/sog-adventure-prehistory.js` → `WIN_DIALOGUE` / `LOSS_DIALOGUE` / `TIE_DIALOGUE`
**Gate:** Shown on the result, branching by outcome.

**On Win**
- **Neanderthal:** Hey, you not so bad.
- **Lucy:** Yeah, you really know your stuff.
- **Neanderthal:** You join my tribe?
- **Lucy:** Don't let him get any ideas.
- **Neanderthal:** Oh fine, can I join yours?

**On Loss**
- **Neanderthal:** You no match for me.
- **Lucy:** How did you let that happen?
- **Neanderthal:** Me the strongest.
- **Lucy:** Click and read your card abilities and he doesn't stand a chance.

**On Tie**
- **Neanderthal:** Hm. We same.
- **Lucy:** A tie is not a win.
- **Neanderthal:** Come back. I ready.
- **Lucy:** We were close. Use your abilities and go again.

## 1.6 — Post-Neanderthal Victory: Lucy's Goodbye (Overworld)
**Source:** `js/overworld.js` → `POST_NEANDERTHAL_DIALOGUE`
**Gate:** Once, after winning the Neanderthal battle and returning to the overworld. Ends with Lucy handing the player her card (Lucy card unlock); sets `sog_post_neanderthal_overworld_complete`.

- **Explorer:** Wow, I can’t believe I just interacted with a real Neanderthal.
- **Lucy:** That’s an interesting way to describe a near-death experience.
- **Explorer:** I couldn’t have done it without you.
- **Lucy:** You Homo sapiens wouldn't exist if it weren't for me.
- **Explorer:** I can’t wait to see the rest of the Ancient World.
- **Lucy:** About that. 
Lucy: I can walk, but these old bones don’t migrate.
- **Explorer:** I guess this is goodbye?
- **Lucy:** Take this.

## 1.7 — Ötzi Encounter (Overworld)
**Source:** `js/overworld.js` → `OTZI_PRE_BATTLE_DIALOGUE`
**Gate:** First click of the Egypt signpost (while `sog_battle_otzi_complete` not yet set).

- **Ötzi:** Where do you think you’re going?
- **Explorer:** I’m ready to see the rest of the world.
- **Ötzi:** You look like you’re ready to take an arrowhead to the back.
- **Explorer:** That’s not very nice.
- **Ötzi:** The world isn’t very nice.
- **Explorer:** Okay, I'll just be on my way...
- **Ötzi:** No, you won't.
- **Explorer:** I'm starting to sense a pattern.

## 1.8 — Ötzi Battle: Opening
**Source:** `js/sog-adventure-otzi.js` → `PRE_SHAKE_LINES`, then `POST_SHAKE_LINES`
**Gate:** Battle opening. A screen "shake" plays between the two blocks (Ötzi revealing the larger world / 3-location, 2-card rules).

**Before the shake**
- **Explorer:** I know this game.
- **Explorer:** Play a card each turn.
- **Explorer:** Score the most points.
- **Explorer:** Easy
- **Ötzi:** The world is a big place.

**After the shake**
- **Explorer:** Oh…
- **Ötzi:** You can now play 2 cards each turn.
- **Explorer:** Cool.
Explorer: But how do I win?
- **Ötzi:** You won't
- **Ötzi:** But try to gain the most IP at 2 of the 3 locations.

## 1.9 — Ötzi Battle: Result Dialogue
**Source:** `js/sog-adventure-otzi.js` → `WIN_DIALOGUE` / `LOSS_DIALOGUE` / `TIE_DIALOGUE`
**Gate:** On result, by outcome. Win unlocks the Ötzi card (`sog_card_otzi_unlocked`).

**On Win**
- **Ötzi:** How did you beat me?
- **Explorer:** Hard work and perseverance?
- **Ötzi:** Whatever that means.
- **Explorer:** It means a lot.
- **Ötzi:** Right. 
Otzi: I guess you can have this...
Otzi: A token of me — frozen in time.

**On Loss**
- **Ötzi:** As I said. You’re not ready.
- **Explorer:** Let me try again.
- **Ötzi:** The world doesn’t give second chances. 
Otzi: But I will.
- **Explorer:** …thanks?
- **Ötzi:** Don’t waste it.

**On Tie**
- **Ötzi:** A stalemate. Curious.
- **Explorer:** Does that mean I can pass?
- **Ötzi:** No. 
Otzi: It means we go again.

## 1.10 — East Africa Return After Ötzi
**Source:** `js/overworld.js` → `EASTAFRICA_POSTOTZI_DIALOGUE`
**Gate:** One-time, first return to East Africa after beating Ötzi (`sog_eastafrica_postotzi_dialogue_seen`).

- **Explorer:** Who knew history had so much conflict?
- **Hunter:** Tell me about it.
- **Explorer:** What do you mean?
- **Hunter:** These other tribes won’t leave my antelope alone.
Explorer: Are they like your pets?
Hunter: They're like my lunch.
Explorer: Oh, right.
- **Explorer:** Couldn’t you share?
- **Hunter:** What does that mean?

## 1.11 — "To Egypt" Goodbye
**Source:** `js/overworld.js` → `TOEGYPT_GOODBYE_DIALOGUE`
**Gate:** One-time, first click of the "To Egypt" box; plays before the walk-off (`sog_toegypt_goodbye_seen`).

- **Hunter:** Hey, where are you going?
- **Explorer:** I want to see the rest of the world.
- **Hunter:** There’s more world out there?
- **Explorer:** Of course.
- **Hunter:** Maybe there are places where I won’t have to fight others for resources?
- **Explorer:** There's only one way to find out...
- **Explorer:** Let’s go!

## 1.12 — Travel Sequence D1 (East Africa → Egypt → Mesopotamia)
**Source:** `js/overworld.js` → `D1_SCENE1_DIALOGUE`, `D1_SCENE2_DIALOGUE`, `D1_SCENE3_DIALOGUE`
**Gate:** Triggered once from the Ötzi-victory "Back to Map" button (when `sog_mesopotamia_arrival_complete` not yet set). Each scene ends with a walk-off + "Traveling…" map swap. *(Note: `D1_SCENE2_DIALOGUE` is **reused** as the standalone Egypt-arrival dialogue, gated by `sog_egypt_arrival_seen`.)*

**Scene 1 — East Africa**
- **Explorer:** History seems to have a lot of conflict.
- **Hunter:** Tell me about it.
- **Explorer:** Oh, hey Hunter, why is that?
- **Hunter:** Don't you see these other tribes butting in on my territory?
- **Explorer:** Not really.
- **Hunter:** How am I supposed to feed my tribe with these outlanders killing all my antelope?
- **Explorer:** Share?
- **Hunter:** Yeah, right.
- **Explorer:** Well, I'm going to travel east.
- **Explorer:** Maybe you can settle somewhere new?
- **Hunter:** That's so crazy, it just might work.
- **Explorer:** Let's go!

**Scene 2 — Egypt (the Nile)**
- **Explorer:** Wow, look at that huge river!
- **Hunter:** Ah, Kemet, the black land...
- **Explorer:** What's that supposed to mean?
- **Hunter:** Look at the soil. It's so rich. It's black.
- **Explorer:** Oh okay.
Hunter: I'd heard rumors of this place along the Nile.
Explorer: Oh right, the Nile.
Explorer: This is Egypt!
Explorer: But where are all the pyramids?
- **Hunter:** What's a pyramid?
- **Explorer:** I think we're too early. 
Explorer: Perhaps, we'll come back later.
- **Hunter:** Whatever you say stranger.

**Scene 3 — Mesopotamia**
- **Hunter:** Mesopotamia! 
- **Explorer:** What's a Meso-potato?
- **Hunter:** Mesopotamia. It means the land between the rivers.
- **Explorer:** That must be why it's so green.

## 1.13 — Mesopotamia Arrival (D2a): Farming Dialectic
**Source:** `js/overworld.js` → `_d2aSequence()` / `_d2aClosingSequence()` (inline lines) + `D2A_FARMING_DIALOGUE`
**Gate:** Continues straight from D1 Scene 3. Mid-sequence the NPC portrait crossfades **Hunter → Farmer**. Ends by revealing the Walls of Uruk node and setting `sog_mesopotamia_arrival_complete`.

- **Hunter:** I feel different…  *(`_d2aSequence`, inline — said as Hunter, just before the crossfade to Farmer)*
- **Explorer:** You look different.  *(`D2A_FARMING_DIALOGUE` begins)*
- **Farmer:** I feel different.
- **Farmer:** Maybe I don't need to hunt animals all of the time.
- **Explorer:** What will you do instead?
- **Farmer:** On this land, I can grow anything.
- **Explorer:** I see.
- **Farmer:** And if I grow enough, I could have a surplus to sell.
Farmer: And from there, people can specialize in different jobs.
- **Farmer:** And with specialization, comes…
- **Explorer:** Cities!  *(`_d2aClosingSequence`, inline)*
- **Farmer:** But the land isn't going to farm itself. Bye!
- *(Farmer slides away)*
- **Explorer:** Lets go check out that city!

## 1.14 — Gilgamesh Encounter (D2b): "Welcome to Uruk"
**Source:** `js/overworld.js` → `D2B_GILGAMESH_DIALOGUE` (played via `_runGilgameshEncounter`)
**Gate:** First time clicking the Walls of Uruk node (no Cuneiform yet, battle not done). Sets `sog_met_gilgamesh` after "You will be."

- **Gilgamesh:** Welcome to my city, Uruk.
- **Explorer:** Oh hi! You must be the mayor.
- **Gilgamesh:** How dare you confuse me for a civil servant?!
- **Explorer:** What?
- **Gilgamesh:** I am Gilgamesh. King Gilgamesh.
Explorer: But you said it was just a city.
Gilgamesh: Just a city? It's my city-state.
- **Explorer:** Oh, I’m sorry…
- **Gilgamesh:** You will be.

## 1.15 — Gilgamesh Battle: Opening (In-Battle)
**Source:** `js/sog-adventure-gilgamesh.js` → `OPENING_PRE`, `OPENING_PROMPT`, plus the rules popup `RULES_TITLE` / `RULES_BODY`
**Gate:** First battle entry only (`sog_gilgamesh_opening_seen`). *(In this opening, Gilgamesh's lines are tagged `who: 'otzi'` in code — the shared opponent-portrait speaker slot — but they are Gilgamesh speaking.)*

- **Gilgamesh:** Prepare to be smited into the great beyond.
- **Explorer:** Gulp
- **Explorer:** How do you play this, again?
- **Gilgamesh (prompt over portrait):** Click on me, if you need a reminder.
- **Explorer (if the player clicks the portrait):** Thank you.

**Rules popup** (title + bullet body)
- **Title:** The Epic Battle of Gilgamesh
- **Win Condition** — Gain more Influence Points than your opponent at the most locations.
- Draw 2 cards per turn.
- 4 turns total.

## 1.16 — Gilgamesh Battle: Loss "Smack Talk"
**Source:** `js/sog-adventure-gilgamesh.js` → `GILGAMESH_LOSS_SMACK`
**Gate:** On every loss/tie, on the board, *before* the DEFEAT scoreboard appears. *(Spoken by Gilgamesh; tagged `who: 'otzi'`.)*

- **Gilgamesh:** Muahaha...
- **Explorer:** I never had a chance.
- **Gilgamesh:** What did you expect in my city-state?
- **Explorer:** Your cards were too overpowering.

## 1.17 — Gilgamesh: Loss / Cuneiform Intervention (The Candle Flow)
**Source:** `js/sog-adventure-gilgamesh.js` → `_runCuneiformIntervention()` using `FARMER_POSTLOSS_A`, `FARMER_POSTLOSS_B`, `GILGAMESH_POSTLOSS_CHALLENGE`
**Gate:** After the DEFEAT scoreboard's "Play Again," **first loss** — grants the Cuneiform card once (`sog_cuneiform_granted`). Visuals: board fades to black, a candle flame fills the dark, Farmer speaks, Cuneiform card is acquired mid-conversation, then back to the board for Gilgamesh's re-challenge.

- **Farmer:** Hey, I think you could use this.
- **Explorer:** What?
- *(Cuneiform card acquisition animation plays here)*
- **Explorer:** What's this?
- **Farmer:** Cuneiform, the first written language.
- **Explorer:** Oh wow, how does it work?
- **Farmer:** You should read it, obviously.
- **Explorer:** Oh, right.
- **Farmer:** But in effect, it will empower those old prehistoric cards you have.
- **Explorer:** Thank you.
- **Farmer:** Don't mention. 
Farmer: Seriously, he'll kill me.
- *(Candle snuffed; battle board returns)*
- **Gilgamesh:** Back for more?  *(`GILGAMESH_POSTLOSS_CHALLENGE`; tagged `who: 'otzi'`)*
- **Explorer:** I think, I'm ready.
- **Gilgamesh:** I think you should have learned your lesson.
- **Explorer:** That's exactly what I did.

## 1.18 — Gilgamesh: Re-Challenge from the Map
**Source:** `js/overworld.js` → `D3_GILGAMESH_CHALLENGE_AGAIN` (played via `_runGilgameshEncounter`)
**Gate:** Re-clicking the Walls of Uruk node when the player *has* Cuneiform but hasn't won yet.

- **Gilgamesh:** You dare to challenge me again?!
- **Explorer:** I have learned from my mistakes.
- **Gilgamesh:** Prepare to be swept into the dustbin of history.

## 1.19 — Gilgamesh: Win Sequence
**Source:** `js/sog-adventure-gilgamesh.js` → `_runPostVictorySequence()` (two inline `runLines` blocks)
**Gate:** On victory (sets `sog_battle_gilgamesh_complete`). Between the two blocks: the Gilgamesh card is granted (acquisition animation **first win only**) and gold is awarded (**25 first win / 10 repeat**). *(Gilgamesh tagged `who: 'otzi'`.)*

- **Explorer:** I did it!
- **Gilgamesh:** How was that possible?
- **Explorer:** I learned from history.
- **Gilgamesh:** By doing so, you've earned this.
- *(Gilgamesh card acquisition + gold reward animations)*
- **Explorer:** Wow!
- **Gilgamesh:** See what you can get yourself at the Mesopotamian Marketplace.
- **Explorer:** Thank you! You're such a gracious king.
- **Gilgamesh:** Until the next time...

## 1.20 — Marketplace: Trader Intro
**Source:** `js/overworld.js` → `MARKET_TRADER_INTRO`
**Gate:** First marketplace visit only (`sog_market_intro_seen`).

- **Trader:** Ah, a traveler with coin to spend! 
Trader: Welcome to the Mesopotamian Marketplace.
- **Explorer:** What is all this?
- **Trader:** The finest cards this civilization has to offer...
 Trader: And they can all be yours, for the right price in gold.
- **Explorer:** How does it work?
- **Trader:** Simple. Tap any card to take a closer look. 
Trader: If you have enough gold, the Buy button lights up. 
Trader: Tap it, confirm, and the card is yours.
- **Explorer:** And then?
- **Trader:** Then it joins your collection — ready for you to build into your deck. 
Trader: Spend wisely. 
Trader: Gold doesn't grow on date palms.

## 1.21 — Deck Builder Unlock
**Source:** `js/overworld.js` → `DECKBUILDER_UNLOCK_DIALOGUE`
**Gate:** One-time, on the first return from the marketplace (after the Gilgamesh win); sets `sog_deckbuilder_unlocked` and un-greys the HUD deck button.

- **Explorer:** I’m starting to build quite a collection.
- **Explorer:** Let’s see if I can build a deck.

---

# PART 2 — TUTORIALS

## 2.1 — Deck Builder Tutorial (Arcadium variant)
**Source:** `js/dbtutorial.js` → `ARCADIUM_STEPS` (spoken by "Lucy / The Ancient One")
**Gate:** Runs in the Arcadium deck builder for players who haven't completed it. Each `line` is a spotlight step.

- **Lucy:** Welcome to the Deck Builder! Here is where you will create your decks to play with.
- **Lucy:** You need 15 cards to complete a deck.
- **Lucy:** This counter tracks how many you have.
- **Lucy:** Double-click any card to add it to your deck. Start with Citizens.
- **Lucy:** You're good at this. Double-click it again if you want to remove it.
- **Lucy:** Single-click any card to see what it does.
- **Lucy:** When you've added 15 cards, click here to play!

## 2.2 — Deck Builder Tutorial (Adventure variant)
**Source:** `js/dbtutorial.js` → `ADVENTURE_STEPS`
**Gate:** ⚠️ **Currently suppressed** — the adventure-mode deck-builder tutorial is intentionally not fired (`!window.deckBuilderFromOverworld` guard in `deckbuilder.js`). Text retained for when it's rebuilt. **Note the stale "12 cards" copy.**

- **Lucy:** Welcome to the Deck Builder! Here is where you will create your decks to play with.
- **Lucy:** You need 12 cards to complete a deck.
- **Lucy:** This counter tracks how many you have.
- **Lucy:** Double-click any card to add it to your deck. Start with Canals.
- **Lucy:** You're good at this. Double-click it again if you want to remove it.
- **Lucy:** Single-click Canals to see what it does.
- **Lucy:** Each card has a specific type.
- **Lucy:** Card types are also identified by the icon here and their background color.
- **Lucy:** When you've added 12 cards, click here to play!

## 2.3 — Arcadium "Learn" Tutorial (Lucy vs. Ötzi narrated game)
**Source:** `js/tutorial.js` (`startTutorial`) — narration via `queueDialogues(...)` (Lucy) and `showLucyLine(...)` / `showOtziLine(...)`.
**Gate:** The separate Arcadium learning flow (the "I'm Ready To Learn" path). A scripted 5-turn game; Ötzi's turn-end reactions **branch** on whether the player is tied / ahead / behind. This is **not** part of the adventure storyline. *(This is the longest single script in the game.)*

### Home intro (before the tutorial video)
**Source:** `js/tutorial.js` → `startHomeIntro` (Lucy, no nickname). Fires when a first-time player chooses the Arcadium/Learn path from home (`home.js` → `onArcadiumClick`), then plays the intro video.
- **Lucy:** You? Make history? Ha!
- **Lucy:** You look as ready as an Aztec inviting a conquistador to dinner.
- **Lucy:** If you want to make history, you're going to need a lesson from your ancestors.

### Matchup / opening banter
*(Speaker card: "Lucy — The Ancient One")*
- **Lucy:** Let me show you how we do things around here…
- **Ötzi:** Not so fast grandma.
- **Lucy:** What do you want, Ötzi?
- **Ötzi:** The kid doesn’t want to learn how to smack rocks together.
- **Lucy:** I didn’t stand up so you could fall and die in ice.
- **Lucy:** Pretty cool for a 3.2 million-year-old, huh?

### Turn 1 — the basics
- **Lucy:** Let’s show Ötzi how history is written.
- **Ötzi:** Like you can even write…
- **Lucy:** See The Great Rift Valley?
- **Lucy:** Aside from being the birthplace of humanity…
- **Lucy:** That’s where you play cards to gain Influence Points.
- **Ötzi:** Not more than me.
- **Lucy:** Definitely more than him.
- **Lucy:** You spend Capital to play cards.
- **Lucy:** This is this card’s Capital cost.
- **Lucy:** Each turn you have 5 Capital to spend
- **Lucy:** The number on the top right of the card
- **Lucy:** Is the card’s Influence Points.
- **Lucy:** Let’s put that card into play.
- **Lucy:** But your turn isn’t over yet.
- **Lucy:** You still have more Capital to spend.
- **Lucy:** Select another card to play
- **Lucy:** When you’re done click ‘End Turn’ and watch your influence grow.

### Turn 1 → 2 reaction (branches)
- **Ötzi (tie):** A tie? How exciting… → **Lucy:** You want to see excitement?
- **Ötzi (player ahead):** Hmm… a lucky start. → **Lucy:** You want to see excitement?
- **Ötzi (player behind):** I told you, I’d win. → **Lucy:** We’re just getting started.
- **Lucy:** The world is a big place.
- **Lucy:** Your goal is to gain more Influence Points at 2 of 3 locations.

### Turn 2 → 3 reaction (branches)
- **Ötzi (tie):** A tie? How exciting…
- **Ötzi (locations even, player ahead on total):** Locations look even… but those numbers worry me. → **Lucy:** When location wins are split, total influence across all three breaks the tie — and you’re ahead.
- **Ötzi (locations even, Ötzi ahead on total):** Locations are even, but the numbers are mine. → **Lucy:** Even when locations look split, total influence breaks the tie — Otzi’s edging it. Watch the totals.
- **Ötzi (ahead):** History has a long arc. → **Lucy:** And it bends to me.
- **Ötzi (behind):** The world gets bigger and you get smaller. → **Lucy:** You spelled smarter wrong.
- **Lucy:** Let’s evolve things.
- **Lucy:** Most cards have special abilities.
- **Lucy:** Click on your cards to see what they do.
- **Lucy:** Put them to work.

### Turn 3 → 4 reaction (branches)
- **Ötzi (tie):** A tie? How exciting…
- **Ötzi (even/ahead):** Locations are split, but those totals… → **Lucy:** Total influence is the tiebreaker when location wins are even. You’re still in the lead.
- **Ötzi (even/behind):** It looks even — but the totals say otherwise. → **Lucy:** Otzi’s leading on total influence. Push harder at the locations you can flip.
- **Ötzi (ahead, no special):** Australopithecus got your tongue?
- **Ötzi (behind):** Do not lose to this homo sapien.
- **Lucy:** The fun isn’t done yet.
- **Lucy:** Locations also have their own abilities
- **Lucy:** Speaking of special abilities, some cards can move.
- **Lucy:** Now finish the rest of your turn.
- **Lucy:** Try dragging Magellan to a new location.
- **Lucy:** Nice. Now finish the rest of your turn.

### Turn 4 → 5 reaction (branches)
- **Ötzi (tie):** A tie? How exciting…
- **Ötzi (even/ahead):** Locations are even, but the totals are slipping away from me. → **Lucy:** Total influence is breaking the tie in your favor. One more turn — keep it up.
- **Ötzi (even/behind):** Looks tied — but the totals belong to Otzi. → **Lucy:** Otzi’s edging the totals. One turn left to flip a location or push your numbers higher.
- **Ötzi (behind):** I don’t like where this is headed.
- **Ötzi (ahead):** I eat flint chips like you for breakfast. → **Lucy:** You eat flint chips for breakfast?
- **Lucy:** I’m all out of surprises.
- **Lucy:** Take him down.

### Final result reaction (branches)
- **Ötzi (tie):** A tie? How exciting… → **Lucy:** As always, history has been written by the victors.
- **Ötzi (even, player won on total):** Hmph. Locations are even, but the numbers… → **Lucy:** Locations were split, but total influence across all three breaks the tie. You came out ahead. / History was written by the one who counted further.
- **Ötzi (even, Ötzi won on total):** Even when it looks even, the totals favor me. → **Lucy:** When location wins are split, total influence breaks the tie — and this one went Otzi’s way. / You’re not done. Adapt and try again.
- **Ötzi (player won):** No! Not again. → **Lucy:** As always, history has been written by the victors.
- **Ötzi (player lost):** The mountain keeps the strong and buries the weak. → **Lucy:** You’re not done. Adapt and try again.

### Closing summary lines (branch on win/lose)
**Source:** `js/tutorial.js` (final summary, ~lines 1387–1388 and 1442–1443)
- **(Win):** You did make history afterall. The Giants are waiting for you.
- **(Lose):** Well, I said you need a lesson or two, but keep trying. Adapt. And one day, you will be ready for those Giants.
- **(Win, alt closing):** You just made history, kid. The Giants are waiting for you. Think you can handle them?
- **(Lose, alt closing):** Perhaps a little more practice… but the Giants are waiting whenever you’re ready.

---

# PART 3 — UI / FLAVOR TEXT (flagged: not character dialogue)

These are short interface strings adjacent to the narrative. Flagging them since they read like flavor but are UI labels.

- **Card-acquisition banner:** "New Card Acquired" — `index.html` `#adv-card-reveal-banner` (shown over every card the player earns).
- **Tutorial action hints (directive overlays):** `js/tutorial.js` `updateHint()` → `actionHints`:
  - "DRAG CITIZENS TO THE GREAT RIFT VALLEY"
  - "CLICK END TURN WHEN READY"
  - "CLICK EACH GLOWING CARD TO VIEW ITS ABILITY"
  - "PLAY MAGELLAN — DRAG HIM TO A LOCATION"
  - "DRAG MAGELLAN TO A NEW LOCATION"
- **Tutorial ability placeholder:** "No special ability — For now" — `js/tutorial.js` (shown for null-ability cards while clicked during the tutorial).
- **Battle scoreboards / result popups** (Prehistory, Ötzi, Gilgamesh) use the standard scoreboard component for the win/loss headline + per-location IP rows; the *flavor* spoken over them is the Result Dialogue captured in Parts 1.5 / 1.9 / 1.16–1.19. The Gilgamesh location rows are built in `js/sog-adventure-gilgamesh.js` `_buildLocRow()` (numbers only, no flavor text).

---

# THINGS TO FLAG / VERIFY

1. **Dead duplicate of the Cuneiform intervention.** `js/overworld.js` contains a *second*, differently-worded post-loss Cuneiform script — `D3_FARMER_POSTLOSS_A`, `D3_FARMER_POSTLOSS_B` (used by `runGilgameshCuneiformIntervention`, which is **exported but never called**). The **live** intervention is the gilgamesh.js one transcribed in **1.17**. The overworld version reads differently (e.g. *"Hey, that was a tough battle you lost." … "Bring your cards up to date." … "With writing." … "With Cuneiform, you give your cards the ability to record what we know and pass it on."*). If you want that wording instead, the wiring would need changing — flagging so you don't edit dead text by mistake.

2. **Speaker tag vs. actual character.** In the Gilgamesh battle scripts (1.15–1.19) the King's lines are tagged `who: 'otzi'` in code — that's just the shared "opponent portrait" speaker slot, not Ötzi. I've labeled them **Gilgamesh** here since that's who's speaking.

3. **Adventure deck-builder tutorial (2.2) is currently turned off** and its copy says "12 cards," which no longer matches the live rule (decks cap at 15; partial decks allowed). Stale until that tutorial is rebuilt.

4. **Misspelling preserved:** "Mesopotomia!" (Hunter) in **1.12 Scene 3** is spelled that way in code — left verbatim in case it's intentional.

5. **`D1_SCENE2_DIALOGUE` does double duty** — it's both Travel Scene 2 *and* the one-time Egypt-arrival dialogue. Editing it changes both moments.

6. **Two "Hunter/antelope/share" exchanges exist** and are similar but distinct: `D1_SCENE1_DIALOGUE` (1.12) and `EASTAFRICA_POSTOTZI_DIALOGUE` (1.10). Not a bug, but easy to confuse when editing.
