# Shoulders of Giants — Full Game Script

**Purpose:** every piece of player-facing dialogue / narrative / instructional text in the game, pulled into one editable document for a polish pass.

**How to use this file:**
- Read top-to-bottom like a screenplay. Each block has a **`[source: ...]`** tag naming the exact file and the constant/variable/function the text lives in.
- **Edit the text freely** — keep the source tags and the speaker labels intact so each edited block can be mapped straight back to its source constant when the changes are folded into the game.
- Speaker labels reflect the `who`/`speaker` id in the data (Explorer, Lucy, Ötzi, Neanderthal, Hunter, Farmer, Gilgamesh, Sargon, Hammurabi, Nebuchadnezzar, Trader). `(narration)` = on-screen prose with no speaker.
- Lines marked **`> NOTE:`** are dynamic/templated/conditional or otherwise awkward to round-trip — read those before editing so nothing surprises you. Placeholders like `<IP>`, `<amount>`, `<river>` are values filled in at runtime.
- A handful of strings live in **`index.html`** (first-load modals, home screen, legend titles) rather than a JS constant — those are tagged accordingly.

---
---

# PART 1 — FIRST-LOAD & FRAMING (index.html)

> These live in `index.html` markup (element ids given), not JS constants — edit in place there.

### First-Load Welcome Modal — "Before You Begin"
[source: index.html → `#welcome-backdrop`]
- (title): Before You Begin
- (narration): **Shoulders of Giants** is an educational strategy card game built by a middle school history teacher, designed as a fun, quick extension activity to engage students in critical thinking. Cards feature historical figures and concepts from middle school world history, creating a foundation of prior knowledge for teachers to build upon in the classroom.
- (narration): The game saves your progress (deck builds, unlocks, settings) locally in your browser. Nothing is sent to a server.
- (narration): Enjoy!

### Home Screen — Subtitles & Byline
[source: index.html → `#home-subtitle-intro` / `-path` / `-adventurer`, `.home-byline`]
- (subtitle, intro): Are you ready to make history?
- (subtitle, path): Choose your path
- (subtitle, adventurer): Choose your adventurer
- (byline): By Mr. Shutler-Ojeda

### Adventure Mode — Dev Warning Modal
[source: index.html → `#adv-dev-warning-backdrop`]
- (title): Adventure Mode
- (narration): This section of the game is in active development. Proceed at your own risk. You will encounter bugs and eventually get stuck.
> NOTE: Buttons "Proceed" / "Go Back" are UI labels (excluded).

### Arcadium — Deck-Locked Modal
[source: index.html → `#arcadium-locked-backdrop`]
- (title): Build Your Deck
- (narration): You need at least 15 cards to build an Arcadium deck. Unlock more cards by playing Adventure mode, then come back to build your deck!

### Tutorial — Coming Soon Modal
[source: index.html → `#coming-soon-backdrop`]
- (title): Tutorial
- (narration): Coming Soon

### About Modal
[source: index.html → `.about-content`]
- (title): About **Shoulders of Giants**
- (heading): About the Game
- (narration): **Shoulders of Giants** is a browser-based educational strategy card game built for use in middle school classrooms. Players build decks of historical figures and key terms drawn from world history curriculum, then spend capital to play cards and gain influence at three geographical locations. The mechanics reward students for discovering connections across eras and card types.
- (narration): The game name comes from Isaac Newton's “if I have seen further, it is by standing on the shoulders of giants.” The idea that knowledge doesn't just appear out of thin air, but accumulates as prior knowledge across generations, isn't decorative; it's the game's central design principle both in mechanics and pedagogy.
- (heading): How It's Used
- (narration): The game is designed as a quick, repeatable extension activity. Individual games take 5–10 minutes and engage students in critical thinking, while creating a baseline of familiarity with names, concepts, and connections students will see in the standard curriculum. Used regularly, it gives a class a shared vocabulary of historical figures and a felt sense of how those figures relate to each other before formal study deepens that knowledge.
- (heading): About the Designer
- (narration): **Shoulders of Giants** was designed and developed by Daniel Shutler-Ojeda, a middle school history and video production teacher in the San Diego Unified School District. The game began as a physical card game prototype, which was then prototyped digitally with a college programmer, and was ultimately built into the version you're playing using AI-assisted coding tools. This development path was made possible by recent shifts in software tooling that lets practicing teachers build games to their classroom's actual needs, rather than waiting for studios or publishers to build for them.
- (heading): Get in Touch
- (narration): If you're an educator interested in using the game in your classroom, a researcher curious about the design, a fellow developer, or just want to share feedback — I'd love to hear from you.
- (heading): Acknowledgments
- (narration): This game wouldn't exist without contributions from many sources:
> NOTE: The Acknowledgments section continues with a credits list (asset/library attributions) — not narrative/dialogue, omitted here.

### Feedback Modal
[source: index.html → `#feedback-backdrop`]
- (title): Thank You for Playing / Shoulders of Giants!
- (narration): This game is in active development and we'd love to hear from you. If you have 2 minutes, please consider filling out this feedback form so we can continue to make the game better.

### Legend / "You Have Made History" End Screen
[source: index.html → `#legend-opening-title`, `#legend-subtitle`; js/legend.js → showChampion]
- (opening title): YOU HAVE MADE HISTORY
- (subtitle, default): Click to claim your victory
- (champion title, dynamic): TOURNAMENT CHAMPION
- (champion subtitle, dynamic): `<playerId> — Click to claim your crown`
> NOTE: The champion variant is templated: `(playerId ? playerId + ' — ' : '') + 'Click to claim your crown'`. The "LEGEND" burst word and opening title also live in index.html markup, not js/legend.js.

---
---

# PART 2 — HOW TO PLAY (Slideshow)

### How to Play — Slideshow
[source: js/options-panel.js → HOWTO_SLIDES]

**Slide 1 — Welcome, Explorer!**
You're an explorer traveling through history! Battle famous figures from the past by playing cards, and learn how civilization was built along the way.

**Slide 2 — The Battle Board**
Each battle has three locations. Play cards into them — every card adds its Influence Points (IP) to the location it's in. The numbers on the location show each side's total.

**Slide 3 — Winning a Location**
Whoever has the higher IP at a location wins it. Win 2 of the 3 locations, and you win the battle!

**Slide 4 — Capital**
Each turn you get Capital to spend. Every card costs Capital to play (its CC), so choose wisely — you can't play everything at once.

**Slide 5 — Card Abilities**
Many cards do something special when they're revealed — boosting nearby cards, moving around, or changing the board. Tap a card to read what it does.

**Slide 6 — The Overworld**
Between battles, walk the map and click a node to start the next challenge. New places unlock as you win.

**Slide 7 — Deck & Marketplace**
Win battles to earn gold, then spend it at the Marketplace to buy new cards. Build your deck to get stronger for the tougher figures ahead!

---
---

# PART 3 — TUTORIAL BATTLE (Lucy vs Ötzi)

### Home Intro — Lucy 3-Line Sequence
[source: js/tutorial.js → startHomeIntro() → queueDialogues]
- Lucy: You? Make history? Ha!
- Lucy: You look as ready as an Aztec inviting a conquistador to dinner.
- Lucy: If you want to make history, you're going to need a lesson from your ancestors.

### Matchup Screen — Lucy vs Ötzi Cinematic
[source: js/tutorial.js → showMatchupScreen()]
- Name card: Lucy — "The Ancient One"
- Name card: Ötzi — "The Iceman"
- (VS graphic): VS
- Lucy: Pretty cool for a 3.2 million-year-old, huh?
- Lucy: Let me show you how we do things around here…
- Ötzi: Not so fast grandma.
- Lucy: What do you want, Ötzi?
- Ötzi: The kid doesn't want to learn how to smack rocks together.
- Lucy: I didn't stand up so you could fall and die in ice.

### Tutorial Battle — Turn 1 Opening
[source: js/tutorial.js → step_openingDialogue()]
- Lucy: Let's show Ötzi how history is written.
- Ötzi: Like you can even write…
- Lucy: See The Great Rift Valley?
- Lucy: Aside from being the birthplace of humanity…
- Lucy: That's where you play cards to gain Influence Points.
- Ötzi: Not more than me.
- Lucy: Definitely more than him.
- Lucy: You spend Capital to play cards.
- Lucy: This is this card's Capital cost.
- Lucy: Each turn you have 5 Capital to spend
- Lucy: The number on the top right of the card
- Lucy: Is the card's Influence Points.
- Lucy: Let's put that card into play.

### Tutorial Battle — After Citizens Placed
[source: js/tutorial.js → onCitizensPlaced()]
- Lucy: But your turn isn't over yet.
- Lucy: You still have more Capital to spend.
- Lucy: Select another card to play
- Lucy: When you're done click 'End Turn' and watch your influence grow.

### Tutorial Battle — Turn 1 End (Ötzi reactions by outcome)
[source: js/tutorial.js → onT1EndTurn()]
- Ötzi (tie): A tie? How exciting…
- Ötzi (player ahead): Hmm… a lucky start.
- Ötzi (player behind): I told you, I'd win.
- Lucy (after tie/ahead): You want to see excitement?
- Lucy (after behind): We're just getting started.

### Tutorial Battle — Turn 2
[source: js/tutorial.js → startTurn2() / onT2EndTurn()]
Start of turn:
- Lucy: The world is a big place.
- Lucy: Your goal is to gain more Influence Points at 2 of 3 locations.

End of turn (Ötzi reaction + Lucy reply, by outcome):
- Ötzi (draw): A tie? How exciting…
- Ötzi (player wins on tiebreaker): Locations look even… but those numbers worry me.
- Lucy: When location wins are split, total influence across all three breaks the tie — and you're ahead.
- Ötzi (Ötzi wins on tiebreaker): Locations are even, but the numbers are mine.
- Lucy: Even when locations look split, total influence breaks the tie — Otzi's edging it. Watch the totals.
- Ötzi (player wins): History has a long arc.
- Lucy: And it bends to me.
- Ötzi (Ötzi wins): The world gets bigger and you get smaller.
- Lucy: You spelled smarter wrong.

### Tutorial Battle — Turn 3 (abilities unlock)
[source: js/tutorial.js → startTurn3() / checkAllAbilitiesClicked() / onT3EndTurn()]
Start of turn:
- Lucy: Let's evolve things.
- Lucy: Most cards have special abilities.
- Lucy: Click on your cards to see what they do.
- Lucy: Put them to work.

End of turn:
- Ötzi (draw): A tie? How exciting…
- Ötzi (player wins on tiebreaker): Locations are split, but those totals…
- Lucy: Total influence is the tiebreaker when location wins are even. You're still in the lead.
- Ötzi (Ötzi wins on tiebreaker): It looks even — but the totals say otherwise.
- Lucy: Otzi's leading on total influence. Push harder at the locations you can flip.
- Ötzi (player wins): Grrr…
- Lucy: Australopithecus got your tongue?
- Ötzi (Ötzi wins): Muahahaha…
- Lucy: Do not lose to this homo sapien.

### Tutorial Battle — Turn 4 (location abilities + Magellan move)
[source: js/tutorial.js → startTurn4() / step_magellanMove() / onMagellanMoved() / onT4EndTurn()]
Start of turn:
- Lucy: The fun isn't done yet.
- Lucy: Locations also have their own abilities
- Lucy: Speaking of special abilities, some cards can move.
- Lucy: Try dragging Magellan to a new location.
- Lucy (if Magellan not on board): Now finish the rest of your turn.
- Lucy (after move): Nice. Now finish the rest of your turn.

End of turn:
- Ötzi (draw): A tie? How exciting…
- Ötzi (player wins on tiebreaker): Locations are even, but the totals are slipping away from me.
- Lucy: Total influence is breaking the tie in your favor. One more turn — keep it up.
- Ötzi (Ötzi wins on tiebreaker): Looks tied — but the totals belong to Otzi.
- Lucy: Otzi's edging the totals. One turn left to flip a location or push your numbers higher.
- Ötzi (player wins): I don't like where this is headed.
- Ötzi (Ötzi wins): I eat flint chips like you for breakfast.
- Lucy: You eat flint chips for breakfast?

### Tutorial Battle — Turn 5 (final turn)
[source: js/tutorial.js → startTurn5()]
- Lucy: I'm all out of surprises.
- Lucy: Take him down.

### Tutorial Battle — Post-Game Dialogue
[source: js/tutorial.js → showPostGameDialogue()]
- Ötzi (draw): A tie? How exciting…
- Lucy: As always, history has been written by the victors.
- Ötzi (player wins on tiebreaker): Hmph. Locations are even, but the numbers…
- Lucy: Locations were split, but total influence across all three breaks the tie. You came out ahead.
- Lucy: History was written by the one who counted further.
- Ötzi (Ötzi wins on tiebreaker): Even when it looks even, the totals favor me.
- Lucy: When location wins are split, total influence breaks the tie — and this one went Otzi's way.
- Lucy: You're not done. Adapt and try again.
- Ötzi (player wins): No! Not again.
- Lucy: As always, history has been written by the victors.
- Ötzi (Ötzi wins): The mountain keeps the strong and buries the weak.
- Lucy: You're not done. Adapt and try again.

### Tutorial Battle — Results-Screen Final Lucy Line
[source: js/tutorial.js → showTutorialResults() → `line`]
- Lucy (win or draw): You did make history afterall. The Giants are waiting for you.
- Lucy (loss): Well, I said you need a lesson or two, but keep trying. Adapt. And one day, you will be ready for those Giants.

### Tutorial Battle — Home-Screen Outcome Line
[source: js/tutorial.js → showHomeOutcomeDialogue() → `line`]
- Lucy (win or draw): You just made history, kid. The Giants are waiting for you. Think you can handle them?
- Lucy (loss): Perhaps a little more practice… but the Giants are waiting whenever you're ready.

### Tutorial Battle — Action Hints (HUD)
[source: js/tutorial.js → updateHint() → actionHints]
- (hint): DRAG CITIZENS TO THE GREAT RIFT VALLEY
- (hint): CLICK END TURN WHEN READY
- (hint): CLICK EACH GLOWING CARD TO VIEW ITS ABILITY
- (hint): PLAY MAGELLAN — DRAG HIM TO A LOCATION
- (hint): DRAG MAGELLAN TO A NEW LOCATION
- (hint, typing): ▶ Click to skip
- (hint, idle): ▶ Click to continue

### Tutorial Battle — Starter-Card Ability Placeholder
[source: js/tutorial.js → board-click handler]
- (card popup): No special ability — For now
> NOTE: Shown in the battle info popup when a Turn 1/2 "starter" card is clicked before abilities unlock.

---
---

# PART 4 — OVERWORLD INTRO (East Africa / Prehistory)

### Adventure Intro — Phase 1 (East Africa arrival)
[source: js/overworld.js → PHASE1_DIALOGUE]
- Explorer: Huh… That was strange.
- Explorer: I should probably be more careful about going through dark doorways.
- Explorer: At least this place looks familiar…
- Explorer: Is that Mount Kilimanjaro?
- Explorer: I think that means I'm in East Africa.
- Explorer: But where are all the people?

### Adventure Intro — Phase 2 (Prehistory node, meeting Lucy)
[source: js/overworld.js → PHASE2_DIALOGUE]
- Lucy: Mmmhm…
- Lucy: I'm standing right here.
- Explorer: Woah, you can talk?
- Explorer: I thought you were an ape?
- Lucy: Australopithecus to the uninitiated.
- Explorer: Uh, yeah... I totally know what that means.
- Lucy: It means I'm one of the earliest human ancestors to stand on two legs.
- Explorer: Congratulations!
- Lucy: You're welcome.
- Explorer: But that doesn't explain why you can talk.
- Lucy: Nothing will.
- Lucy: Don't over think it.
- Explorer: Fair enough.
- Explorer: But that must mean I traveled back in time.
- Explorer: Like way back.
- Lucy: Like I said, don't over think it.
- Explorer: Well then, I guess I better get going.

---
---

# PART 5 — PREHISTORY: NEANDERTHAL BATTLE

### Neanderthal — Pre-Battle Dialogue (speech bubbles)
[source: js/sog-adventure-prehistory.js → inline array in playPreBattleDialogue()]
- Neanderthal: AARRGH!
- Explorer: Uh oh…
- Explorer: Help?

### Neanderthal — Coaching Phase 1 (intro exchange)
[source: js/sog-adventure-prehistory.js → COACHING_PHASE_1]
- Neanderthal: This my fire.
- Lucy: He thinks he invented fire and doesn't have to share it.
- Neanderthal: Me no think. Me know.
- Lucy: You no think, alright.
- Neanderthal: AARRGH!!!

### Neanderthal — Coaching Phase 2 (Lucy tutorial coaching)
[source: js/sog-adventure-prehistory.js → COACHING_PHASE_2]
- Lucy: If this Neanderthal wants to get rocked, we're ready to roll.
- Lucy: Pay attention, this is important...
- Lucy: See those cards?
- Lucy: You play one each turn on your side of The Camp.
- Lucy: See that number?
- Lucy: Those are Influence Points, or IP for short.
- Lucy: Your goal here is to gain the most IP at The Camp after four turns.
- Lucy: Oh, and most cards have special abilities.
- Lucy: If you want to win, click on them to read what they have in store.
- Lucy: When you're ready to send this guy back to whatever came before the Stone Age...
- Lucy: Click and drag your first card into play.

### Neanderthal — Turn-1 End-Turn Prompt (Lucy one-liner)
[source: js/sog-adventure-prehistory.js → PREHISTORY_SCRIPT.onPlayerPlayed → showLucyOneLiner()]
- Lucy: When you've made your decision, click the End Turn button.
> NOTE: Inline string literal (not a named constant); shown only on turn 1 after the player commits their first card (`p.turn === 1`).

### Neanderthal — Win Dialogue
[source: js/sog-adventure-prehistory.js → WIN_DIALOGUE]
- Neanderthal: Hey, you not so bad.
- Lucy: Yeah, you really know your stuff.
- Neanderthal: You join my tribe?
- Lucy: Don't let him get any ideas.
- Neanderthal: Oh fine, can I join yours?

### Neanderthal — Loss Dialogue
[source: js/sog-adventure-prehistory.js → LOSS_DIALOGUE]
- Neanderthal: You no match for me.
- Lucy: How did you let that happen?
- Neanderthal: Me the strongest.
- Lucy: Click and read your card abilities and he doesn't stand a chance.

### Neanderthal — Tie Dialogue
[source: js/sog-adventure-prehistory.js → TIE_DIALOGUE]
- Neanderthal: Hm. We same.
- Lucy: A tie is not a win.
- Neanderthal: Come back. I ready.
- Lucy: We were close. Use your abilities and go again.

### Neanderthal — Result-Screen Sublines
[source: js/sog-adventure-prehistory.js → showVictoryScreen()/showDefeatScreen()/showTieScreen()]
- (narration, win): You conquered The Camp
- (narration, loss): Neanderthal won The Camp
- (narration, tie): The Camp ended in a draw
> NOTE: Location result row is built by buildAdvResultRow('The Camp', pIP, aIP, …) with templated labels "You: <pIP>", "vs", "Opp: <aIP>" and a badge "YOU"/"OPP"/"TIE". IP values are runtime scores.

---
---

# PART 6 — ÖTZI BATTLE

### Ötzi — Pre-Battle Encounter (overworld signpost)
[source: js/overworld.js → OTZI_PRE_BATTLE_DIALOGUE]
- Ötzi: Where do you think you're going?
- Explorer: I'm ready to see the rest of the world.
- Ötzi: You look like you're ready to take an arrowhead to the back.
- Explorer: That's not very nice.
- Ötzi: The world isn't very nice.
- Explorer: Okay, I'll just be on my way...
- Ötzi: No, you won't.
- Explorer: I'm starting to sense a pattern.

### Ötzi — Pre-Shake Dialogue (opening)
[source: js/sog-adventure-otzi.js → PRE_SHAKE_LINES]
- Explorer: I know this game.
- Explorer: Play a card each turn.
- Explorer: Score the most points.
- Explorer: Easy
- Ötzi: The world is a big place.

### Ötzi — Post-Shake Dialogue (after locations reveal)
[source: js/sog-adventure-otzi.js → POST_SHAKE_LINES]
- Explorer: Oh…
- Ötzi: You can now play 2 cards each turn.
- Explorer: Cool.
- Explorer: But how do I win?
- Ötzi: You won't
- Ötzi: But try to gain the most IP at 2 of the 3 locations.

### Ötzi — Win Dialogue
[source: js/sog-adventure-otzi.js → WIN_DIALOGUE]
- Ötzi: How did you beat me?
- Explorer: Hard work and perseverance?
- Ötzi: Whatever that means.
- Explorer: It means a lot.
- Ötzi: Right.
- Ötzi: I guess you can have this...
- Ötzi: A token of me — frozen in time.

### Ötzi — Loss Dialogue
[source: js/sog-adventure-otzi.js → LOSS_DIALOGUE]
- Ötzi: As I said. You're not ready.
- Explorer: Let me try again.
- Ötzi: The world doesn't give second chances.
- Ötzi: But I will.
- Explorer: …thanks?
- Ötzi: Don't waste it.

### Ötzi — Tie Dialogue
[source: js/sog-adventure-otzi.js → TIE_DIALOGUE]
- Ötzi: A stalemate. Curious.
- Explorer: Does that mean I can pass?
- Ötzi: No.
- Ötzi: It means we go again.

### Ötzi — Result-Screen Sublines
[source: js/sog-adventure-otzi.js → _showOtziScoreboard()]
- (narration, win): You conquered Otzi at 2 of 3 locations
- (narration, tie): A stalemate — every location tied
- (narration, loss): Otzi won 2 of 3 locations
- (narration, tiebreaker): Tiebreaker — Total IP: You <playerTotal>  vs  Otzi <otziTotal>
> NOTE: Subline is conditional on outcome/tiebreaker. Location rows templated "You: <pIP>", "vs", "Otzi: <aIP>", badge "YOU"/"OTZI"/"TIE". Fallback plain-text titles (only if HTML scoreboard missing): "VICTORY" / "A TIE" / "DEFEATED".

### Post-Ötzi — Lucy's Goodbye (overworld)
[source: js/overworld.js → POST_NEANDERTHAL_DIALOGUE]
- Explorer: Wow, I can't believe I just interacted with a real Neanderthal.
- Lucy: That's an interesting way to describe a near-death experience.
- Explorer: I couldn't have done it without you.
- Lucy: You Homo sapiens wouldn't exist if it weren't for me.
- Explorer: I can't wait to see the rest of the Ancient World.
- Lucy: About that.
- Lucy: I can walk, but these old bones don't migrate.
- Explorer: I guess this is goodbye?
- Lucy: So you always remember me…
> NOTE: Constant is named POST_NEANDERTHAL_DIALOGUE but plays as Lucy's post-Ötzi goodbye.

### East Africa — Post-Ötzi Return (Hunter)
[source: js/overworld.js → EASTAFRICA_POSTOTZI_DIALOGUE]
- Explorer: Who knew history had so much conflict?
- Hunter: Tell me about it.
- Explorer: What do you mean?
- Hunter: These other tribes won't leave my antelope alone.
- Explorer: Are they like your pets?
- Hunter: They're like my lunch.
- Explorer: Oh, right.
- Explorer: Couldn't you share?
- Hunter: What does that mean?

---
---

# PART 7 — MESOPOTAMIA: TRAVEL & GILGAMESH

### D1 Scene 1 — East Africa (start of migration East)
[source: js/overworld.js → D1_SCENE1_DIALOGUE]
- Explorer: History seems to have a lot of conflict.
- Hunter: Tell me about it.
- Explorer: Oh, hey Hunter, why is that?
- Hunter: Don't you see these other tribes butting in on my territory?
- Explorer: Not really.
- Hunter: How am I supposed to feed my tribe with these outlanders killing all my antelope?
- Explorer: Share?
- Hunter: Yeah, right.
- Explorer: Well, I'm going to travel east.
- Explorer: Maybe you can settle somewhere new?
- Hunter: That's so crazy, it just might work.
- Explorer: Let's go!

### D1 Scene 2 — Egypt (first pass-through, too early)
[source: js/overworld.js → D1_SCENE2_DIALOGUE]
- Explorer: Wow, look at that huge river!
- Hunter: Ah, Kemet, the black land...
- Explorer: What's that supposed to mean?
- Hunter: Look at the soil. It's so rich. It's black.
- Explorer: Oh okay.
- Hunter: I'd heard rumors of this place along the Nile.
- Explorer: Oh right, the Nile.
- Explorer: This is Egypt!
- Explorer: But where are all the pyramids?
- Hunter: What's a pyramid?
- Explorer: I think we're too early.
- Explorer: Perhaps, we'll come back later.
- Hunter: Whatever you say stranger.

### D1 Scene 3 — Mesopotamia arrival
[source: js/overworld.js → D1_SCENE3_DIALOGUE]
- Hunter: Mesopotamia!
- Explorer: What's a Meso-potato?
- Hunter: Mesopotamia. It means the land between the rivers.
- Explorer: That must be why it's so green.

### D2a — Farming Dialectic (Hunter → Farmer)
[source: js/overworld.js → D2A_FARMING_DIALOGUE]
- Explorer: You look different.
- Farmer: I feel different.
- Farmer: Maybe I don't need to hunt animals all of the time.
- Explorer: What will you do instead?
- Farmer: On this land, I can grow anything.
- Explorer: I see.
- Farmer: And if I grow enough, I could have a surplus to sell.
- Farmer: And from there, people can specialize in different jobs.
- Farmer: And with specialization, comes…

### D2a — Hunter Transformation Line (inline)
[source: js/overworld.js → inline in _d2aRiverWalkSequence (~line 1781)]
- Hunter: I feel different…
> NOTE: Standalone line just before the Hunter→Farmer portrait crossfade; precedes D2A_FARMING_DIALOGUE.

### D2a — Closing Sequence (inline)
[source: js/overworld.js → inline in _d2aClosingSequence (~lines 1892–1899)]
- Explorer: Cities!
- Farmer: But the land isn't going to farm itself. Bye!
- Explorer: Lets go check out that city!
> NOTE: Three inline lines; Farmer's portrait slides out after "Bye!", then the Explorer's final line plays alone.

### D2b — Gilgamesh Encounter (Uruk)
[source: js/overworld.js → D2B_GILGAMESH_DIALOGUE]
- Gilgamesh: Welcome to my city, Uruk.
- Explorer: Oh hi! You must be the mayor.
- Gilgamesh: How dare you confuse me for a civil servant?!
- Explorer: What?
- Gilgamesh: I am Gilgamesh. King Gilgamesh.
- Explorer: But you said it was just a city.
- Gilgamesh: Just a city? It's my city-state.
- Explorer: Oh, I'm sorry…
- Gilgamesh: You will be.

### Gilgamesh — Battle Rules Popup
[source: js/sog-adventure-gilgamesh.js → RULES_TITLE / RULES_BODY]
- (title): The Epic Battle of Gilgamesh
- (narration): 4 Turns
- (narration): Play 2 cards each turn.
- (narration): <u>Win Condition</u> — Gain the most IP at the most locations to defeat Gilgamesh.

### Gilgamesh — Opening Dialogue (pre-pause)
[source: js/sog-adventure-gilgamesh.js → OPENING_PRE]
- Gilgamesh: Prepare to be smited into the great beyond.
- Explorer: Gulp
- Explorer: How do you play this, again?

### Gilgamesh — Opening Interactive Prompt
[source: js/sog-adventure-gilgamesh.js → OPENING_PROMPT]
- Gilgamesh: Click on me, if you need a reminder.

### Gilgamesh — Opening Resume Line (after rules popup)
[source: js/sog-adventure-gilgamesh.js → inline array in _runOpeningDialogue]
- Explorer: Thank you.
> NOTE: Inline literal `[{ who: 'explorer', text: 'Thank you.' }]` after the interactive portrait-click/rules-popup pause.

### Gilgamesh — Loss/Tie Smack-Talk (before DEFEAT scoreboard)
[source: js/sog-adventure-gilgamesh.js → GILGAMESH_LOSS_SMACK]
- Gilgamesh: Muahaha...
- Explorer: I never had a chance.
- Gilgamesh: What did you expect in my city-state?
- Explorer: Your cards were too overpowering.

### Gilgamesh — Post-Victory Sequence (opening win dialogue)
[source: js/sog-adventure-gilgamesh.js → inline array in _runPostVictorySequence]
- Explorer: I did it!
- Gilgamesh: How was that possible?
- Explorer: I learned from history.
- Gilgamesh: By doing so, you've earned this.

### Gilgamesh — Post-Victory Sequence (closing, after card + gold reward)
[source: js/sog-adventure-gilgamesh.js → inline array in _runPostVictorySequence (grantGoldThenFinish)]
- Explorer: Wow!
- Gilgamesh: See what you can get yourself at the Mesopotamian Marketplace.
- Explorer: Thank you! You're such a gracious king.
- Gilgamesh: Until the next time...

---
---

# PART 8 — POST-LOSS CUNEIFORM INTERVENTION (Farmer)

> These fire after losing to Gilgamesh in Prehistory-era cards; the Farmer grants Cuneiform. Note there are BOTH overworld (js/overworld.js) and in-battle (js/sog-adventure-gilgamesh.js) copies of this beat.

### Post-Loss — Farmer Intervention Part A (overworld)
[source: js/overworld.js → D3_FARMER_POSTLOSS_A]
- Farmer: Hey, that was a tough battle you lost.
- Explorer: His cards were so much more advanced.
- Farmer: Of course. You were playing in Prehistory.
- Farmer: You didn't stand a chance.
- Explorer: What do I do?
- Farmer: Bring your cards up to date.
- Explorer: How?
- Farmer: With writing.
> NOTE: The Cuneiform card grant fires between Part A and Part B.

### Post-Loss — Farmer Intervention Part B (overworld)
[source: js/overworld.js → D3_FARMER_POSTLOSS_B]
- Farmer: With Cuneiform, you give your cards the ability to record what we know and pass it on.
- Explorer: Thank you.

### Post-Loss — Re-Challenge (overworld)
[source: js/overworld.js → D3_GILGAMESH_CHALLENGE_AGAIN]
- Gilgamesh: You dare to challenge me again?!
- Explorer: I have learned from my mistakes.
- Gilgamesh: Prepare to be swept into the dustbin of history.

### Post-Loss — Farmer Intervention Part A (in-battle variant)
[source: js/sog-adventure-gilgamesh.js → FARMER_POSTLOSS_A]
- Farmer: Hey, I think you could use this.
- Explorer: What?

### Post-Loss — Farmer Intervention Part B (in-battle variant)
[source: js/sog-adventure-gilgamesh.js → FARMER_POSTLOSS_B]
- Explorer: What's this?
- Farmer: Cuneiform, the first written language.
- Explorer: Oh wow, how does it work?
- Farmer: You should read it, obviously.
- Explorer: Oh, right.
- Farmer: But in effect, it will empower those old prehistoric cards you have.
- Explorer: Thank you.
- Farmer: Don't mention.
- Farmer: Seriously, he'll kill me.

### Post-Loss — Re-Challenge (in-battle variant)
[source: js/sog-adventure-gilgamesh.js → GILGAMESH_POSTLOSS_CHALLENGE]
- Gilgamesh: Back for more?
- Explorer: I think, I'm ready.
- Gilgamesh: I think you should have learned your lesson.
- Explorer: That's exactly what I did.

---
---

# PART 9 — SARGON (Akkad)

### D4 — Sargon Reveal (dust-storm bookends, overworld)
[source: js/overworld.js → D4_SARGON_REVEAL_INTRO / D4_SARGON_REVEAL_OUTRO]
- Explorer (intro): Wow, I can't wait to use my new cards!
- Explorer (outro): Uh, that was mysterious…
- Explorer (outro): Better go check it out.

### D4 — Sargon Turned Away (deck < 15, overworld)
[source: js/overworld.js → D4_SARGON_TURNED_AWAY_A / _B]
- Sargon: You think you're ready to face Sargon?
- Explorer: I guess…
- Sargon: Guess again.
- Sargon: You need a deck of at least 15 cards before you can face Sargon, the Great.
- Explorer: Maybe I need to earn more gold to buy more cards.
> NOTE: Sargon's portrait slides out between Part A and Part B (the Explorer's closing line).

### D4 — Sargon Encounter (deck ready, overworld)
[source: js/overworld.js → D4_SARGON_ENCOUNTER]
- Sargon: Who dares to cross, Sargon the Great?
- Explorer: It is I, just an explorer seeking to learn about history…
- Explorer: Great King Sargon.
- Sargon: King?!
- Sargon: Sargon is no King.
- Explorer: Oh
- Sargon: Sargon is the world's first Emperor!
- Explorer: What's the difference?
- Sargon: I don't rule over one city-state.
- Sargon: I rule over all of Mesopotamia's city-states.
- Explorer: Right.
- Sargon: That includes you!
- Explorer: Of course it does.

### Sargon — Battle Rules Popup
[source: js/sog-adventure-sargon.js → RULES_TITLE / RULES_BODY]
- (title): The Empire of Sargon
- (narration): 4 Turns
- (narration): Each card costs Capital (CC) to play.
- (narration): 5 Capital to spend each turn.
- (narration): <u>Win Condition</u> — Gain the most IP at the most locations to defeat Sargon.

### Sargon — Opening Capital-Tutorial Dialogue
[source: js/sog-adventure-sargon.js → OPENING_DIALOGUE]
- Sargon: Before we begin, observe how an empire truly operates.
- Explorer: Wait.
- Explorer: My cards look different.
- Sargon: Exactly.
- Sargon: Every card now comes with a price.
- Sargon: This is the Capital cost.
- Explorer: So I can't just play whatever I want?
- Sargon: Welcome to Empire.
- Sargon: Everything has a cost.
- Sargon: You have five Capital each turn.
- Explorer: And what if I run out?
- Sargon: Then you wait 'til next turn.
- Sargon: If there is a next turn.
- Explorer: Five to spend, every turn.
- Explorer: Got it.
- Sargon: We'll see about that.

### Sargon — First-Win Victory Dialogue
[source: js/sog-adventure-sargon.js → WIN_DIALOGUE]
- Sargon: You've bested me.
- Sargon: But how?
- Explorer: I've learned from the past…
- Explorer: And the future.
- Sargon: I don't understand.
- Explorer: I've heard its best not to overthink it.
- Sargon: You are wise.
- Sargon: And so am I.
- Sargon: Take this as a symbol of our budding alliance.

### Sargon — First-Win Closing Line (after card + gold)
[source: js/sog-adventure-sargon.js → WIN_DIALOGUE_CLOSER]
- Explorer: I see why they call you The Great.

### Sargon — Pre-Loss Smack-Talk
[source: js/sog-adventure-sargon.js → LOSS_SMACK]
- Sargon: You're no match for Empire.
- Sargon: Be gone with you.

### D4 — Sargon Reflection (overworld, after battle)
[source: js/overworld.js → D4_SARGON_LOSS_REFLECT / D4_SARGON_WIN_REFLECT]
- Explorer (loss): Perhaps, I need to build up my deck before I take on an Empire.
- Explorer (win): As one empire falls, another one rises.

---
---

# PART 10 — HAMMURABI (Babylon)

### D4 — Hammurabi Encounter (overworld, deck ready)
[source: js/overworld.js → D4_HAMMURABI_ENCOUNTER]
- Hammurabi: Halt.
- Hammurabi: State your business before the law.
- Explorer: What law?
- Explorer: I was just admiring this big stone tablet.
- Hammurabi: That "tablet" is the Code.
- Explorer: Code for what?
- Hammurabi: My code for two hundred and eighty-two laws.
- Explorer: That's a lot of rules.
- Hammurabi: Not if you want to keep order.
- Explorer: And if someone breaks one?
- Hammurabi: They pay the price.
- Explorer: That sounds fair.
- Hammurabi: Now time to put you on trial.

### D4 — Hammurabi Turned Away (deck < 15, overworld)
[source: js/overworld.js → D4_HAMMURABI_TURNED_AWAY_A / _B]
- Hammurabi: The court is not yet in session.
- Hammurabi: Return when your deck is whole — fifteen cards.
- Explorer: I should finish building my deck first.
> NOTE: Hammurabi's portrait slides out between Part A and Part B (the Explorer's closing line).

### Hammurabi — Battle Rules Popup
[source: js/sog-adventure-hammurabi.js → RULES_TITLE / RULES_BODY]
- (title): The Law of the Land
- (narration): 4 Turns
- (narration): Each card costs Capital (CC) to play.
- (narration): 5 Capital to spend each turn.
- (narration): <u>Win Condition</u> — Gain the most IP at the most locations to defeat Hammurabi.

### Hammurabi — Location Ability Text
[source: js/sog-adventure-hammurabi.js → _hammurabiLocations()]
- Euphrates River: Labor cards reveal here with +2 IP
- The Fertile Crescent: +1 Capital next turn when full.
- Tigris River: Military cards reveal here with +1 IP

### Hammurabi — Opening Dialogue
[source: js/sog-adventure-hammurabi.js → OPENING_DIALOGUE]
- Explorer: What did I do?
- Hammurabi: You answer to no city.
- Explorer: Sure, I do.
- Hammurabi: Then name the law of the land of the Fertile Crescent.
- Explorer: The… land has laws?
- Hammurabi: As Shamash, the God of Justice, has declared it.
- Explorer: I see. Every location plays by its own rules.
- Hammurabi: No, they play by my rules.
- Hammurabi: Now, you will obey.
> NOTE: The line "As Shamash…" is flagged `revealBefore: true` — the location-ability "Code" reveal (nameplate shake + ability fade-in + cuneiform-stamp sfx) plays to completion immediately before it.

### Hammurabi — First-Win Victory Dialogue
[source: js/sog-adventure-hammurabi.js → WIN_DIALOGUE]
- Hammurabi: Impossible.
- Hammurabi: The law was clearly on my side.
- Explorer: Maybe you need to study your own Code.
- Hammurabi: If you have won, then the law must recognize it.
- Hammurabi: Take this
- Hammurabi: Let it be entered into the record.
> NOTE: Last line pairs with granting card 47 + 25 gold.

### Hammurabi — First-Win Sendoff Dialogue
[source: js/sog-adventure-hammurabi.js → WIN_DIALOGUE_CLOSER]
- Hammurabi: You have been found innocent.
- Hammurabi: For now.
> NOTE: Plays after the card + gold are granted.

### Hammurabi — Pre-Defeat Loss Dialogue
[source: js/sog-adventure-hammurabi.js → LOSS_DIALOGUE]
- Hammurabi: The verdict stands.
- Hammurabi: The law does not make exceptions.
- Explorer: Can I appeal?
- Hammurabi: You may.
- Hammurabi: The law is patient.
> NOTE: Plays before the defeat scoreboard, and only before Hammurabi has ever been beaten (after a win, losses skip straight to the scoreboard).

### Hammurabi — Pre-Tie Dialogue
[source: js/sog-adventure-hammurabi.js → TIE_DIALOGUE]
- Hammurabi: A hung verdict.
- Hammurabi: The law abhors an unresolved case.
- Hammurabi: We will try this again
- Hammurabi: Until judgment is clear.
> NOTE: Plays before the tie scoreboard, only before Hammurabi has been beaten.

---
---

# PART 11 — NEBUCHADNEZZAR (The Hanging Gardens)

### D5 — Hanging Gardens Reflection & Reaction (sparkle reveal, overworld)
[source: js/overworld.js → D5_HANGING_GARDENS_REFLECT / D5_HANGING_GARDENS_REACTION]
- Explorer (reflect): That was a close one.
- Explorer (reflect): True justice really is blind.
- Explorer (reaction): Wow, look at that palace!
- Explorer (reaction): All the gardens…
- Explorer (reaction): That has to be a safe place to explore.

### D5 — Hanging Gardens Node Click (overworld)
[source: js/overworld.js → D5_HANGING_GARDENS_CLICK_A / _B]
- Explorer: Wow, this place is wonderful!
- Explorer: And no sign of a mean King.
- Explorer: If no one is going to answer the door
- Explorer: I'm going to explore myself.
> NOTE: knocking.m4a plays in full between Part A and Part B; opendoor.m4a plays after Part B, then a wipe into the battle.

### Nebuchadnezzar — Battle Rules Popup
[source: js/sog-adventure-hanginggardens.js → RULES_TITLE / RULES_BODY]
- (title): In The Garden
- (narration): 5 Turns
- (narration): Each card costs Capital (CC) to play.
- (narration): 5 Capital to spend each turn.
- (narration): Watch out for flooding rivers!
- (narration): <u>Win Condition</u> — Gain the most IP at the most locations to defeat Nebuchadnezzar.

### Nebuchadnezzar — Location Ability Text
[source: js/sog-adventure-hanginggardens.js → _hgLocations()]
- Euphrates River: Labor cards reveal here with +2 IP
- Babylon: 5-CC cards cost -1 CC
- Tigris River: Military cards reveal here with +1 IP

### Nebuchadnezzar — Opening Dialogue
[source: js/sog-adventure-hanginggardens.js → OPENING_DIALOGUE]
- Nebuchadnezzar: Welcome, welcome!
- Nebuchadnezzar: A traveler, in my gardens!
- Explorer: Oh, these are your gardens?
- Nebuchadnezzar: I built them.
- Nebuchadnezzar: Every terrace, every bloom, every falling stream.
- Explorer: You must be so proud.
- Nebuchadnezzar: I built the greatest city the world has ever seen.
- Explorer: It really is beautiful here.
- Nebuchadnezzar: And then tell me, little traveler…
- Nebuchadnezzar: …who gave you permission to enter the garden of a king?
- Explorer: Uh, the door was kind of open.
- Nebuchadnezzar: No one walks my paradise uninvited.
- Nebuchadnezzar: No one.
- Explorer: Here we go again.

### Nebuchadnezzar — Flood Presentation Text
[source: js/sog-adventure-hanginggardens.js → _floodPresentation]
- (narration): <River> River - Flooded
- (narration): No cards can be played here
> NOTE: DYNAMIC — the flooded location's nameplate becomes "<loc.name> - Flooded" (e.g. "Euphrates River - Flooded") and its ability line becomes "No cards can be played here"; both revert on un-flood.

### Nebuchadnezzar — First-Flood Interjection
[source: js/sog-adventure-hanginggardens.js → _runFloodIntro]
- Explorer: What happened?
- Nebuchadnezzar: The <river> flooded.
- Explorer: But I can't play cards there while it's flooded.
- Nebuchadnezzar: Welcome to Mesopotamia.
> NOTE: First-flood-only. DYNAMIC — `<river>` is the flooded river's name ("Euphrates" or "Tigris"), e.g. "The Euphrates flooded."

### Nebuchadnezzar — First-Win Victory Dialogue
[source: js/sog-adventure-hanginggardens.js → WIN_DIALOGUE]
- Nebuchadnezzar: Hmm… How unexpected.
- Explorer: I won?
- Nebuchadnezzar: Yes, somehow the stranger in the tawdry hat prevailed.
- Explorer: Hey, I like my hat.
- Nebuchadnezzar: How unfortunate.
- Nebuchadnezzar: Perhaps, the Egyptians will find it more amusing.
- Explorer: Egyptians?
- Nebuchadnezzar: Take this and your little hat and be gone, will you?
> NOTE: First-win-only (a repeat win skips to the VICTORY flourish + gold). Last line is the beat card 50 + 25 gold grant fires on.

### Nebuchadnezzar — Loss Dialogue
[source: js/sog-adventure-hanginggardens.js → LOSS_DIALOGUE]
- Nebuchadnezzar: Predictable.
- Nebuchadnezzar: Excellence was never meant for the likes of you.
- Explorer: Can I have another shot?
- Nebuchadnezzar: I do enjoy a captive audience.

### Nebuchadnezzar — Tie Dialogue
[source: js/sog-adventure-hanginggardens.js → TIE_DIALOGUE]
- Nebuchadnezzar: A stalemate?
- Nebuchadnezzar: How unrefined.
- Nebuchadnezzar: We shall do this again.
- Nebuchadnezzar: Properly this time.

---
---

# PART 12 — EGYPT ON-RAMP

### Egypt On-Ramp — Abracadabra Sequence (post-Nebuchadnezzar)
[source: js/overworld.js → EGYPT_ONRAMP_DIALOGUE]
- Explorer: Okay…
- Explorer: Abracadabra?!
- Explorer: Open sesame?!
- Explorer: Something magically mysterious can pop up now…
- Explorer: Is that it?
- Explorer: Is my historical adventure over?
- Explorer: Hmm…
- Explorer: Nebuchadnezzar did say something about Egypt.
- Explorer: Maybe I should check that out.
> NOTE: Plays on the Mesopotamia overworld after beating Nebuchadnezzar (~5s idle); then the "To Egypt" exit flashes for 3s.

### To Egypt — Hunter's Goodbye (first "To Egypt" click)
[source: js/overworld.js → TOEGYPT_GOODBYE_DIALOGUE]
- Hunter: Hey, where are you going?
- Explorer: I want to see the rest of the world.
- Hunter: There's more world out there?
- Explorer: Of course.
- Hunter: Maybe there are places where I won't have to fight others for resources?
- Explorer: There's only one way to find out...
- Explorer: Let's go!

### Egypt On-Ramp — Double Crown Arrival ("funny hat")
[source: js/overworld.js → EGYPT_NODE_ARRIVAL_DIALOGUE]
- Explorer: Still no pyramids?
- Explorer: That's a bummer.
- Explorer: What's that funny hat?
> NOTE: Plays once when the player reaches the Egypt map with the Double Crown node live (`sog_egypt_node_live`). The node is Narmer's "The Double Crown" (Nile Delta); its click leads to the Egypt battle stub.

### Egypt — Stub Screen (placeholder)
[source: js/sog-adventure-egypt.js → start()]
- (heading): Egypt
- (subtext): Coming in the next phase…
> NOTE: Placeholder screen; the only prose is "Coming in the next phase…". Button "BACK TO MAP" is a UI label.

---
---

# PART 13 — MARKETPLACE & DECK BUILDER

### Mesopotamian Marketplace — Trader Intro
[source: js/overworld.js → MARKET_TRADER_INTRO]
- Trader: Ah, a traveler with coin to spend!
- Trader: Welcome to the Mesopotamian Marketplace.
- Explorer: What is all this?
- Trader: The finest cards this civilization has to offer...
- Trader: And they can all be yours, for the right price in gold.
- Explorer: How does it work?
- Trader: Simple. Tap any card to take a closer look.
- Trader: If you have enough gold, then click the Buy button and the card is yours.
Trader: If not, come back with more gold.
- Explorer: And then?
- Trader: Then it joins your collection.
Trader: Ready for you in your deck builder.
- Trader: Spend wisely.
- Trader: Gold doesn't grow on date palms.

### Deck Builder — Unlock (first marketplace return)
[source: js/overworld.js → DECKBUILDER_UNLOCK_DIALOGUE]
- Explorer: I'm starting to build quite a collection.
- Explorer: Let's see if I can build a deck.

### Deck Builder Tutorial — Speaker Labels
[source: js/dbtutorial.js → applySpeaker()]
- (Arcadium speaker): Lucy — "The Ancient One"
- (Adventure speaker): Farmer (no subtitle)

### Deck Builder Tutorial — Arcadium Steps
[source: js/dbtutorial.js → ARCADIUM_STEPS]
- (welcome): Welcome to the Deck Builder! Here is where you will create your decks to play with.
- (intro-15): You need 15 cards to complete a deck.
- (counter): This counter tracks how many you have.
- (dblclick): Double-click any card to add it to your deck. Start with Citizens.
- (just-added): You're good at this. Double-click it again if you want to remove it.
- (single-click): Single-click any card to see what it does.
- (lets-play): When you've added 15 cards, click here to play!

### Deck Builder Tutorial — Adventure Steps
[source: js/dbtutorial.js → ADVENTURE_STEPS]
- (welcome): Welcome to the Deck Builder! Here is where you will create your decks to play with.
- (intro-15): You need 12 cards to complete a deck.
- (counter): This counter tracks how many you have.
- (dblclick): Double-click any card to add it to your deck. Start with Canals.
- (just-added): You're good at this. Double-click it again if you want to remove it.
- (single-click): Single-click Canals to see what it does.
- (popup-type): Each card has a specific type.
- (card-type-icon): Card types are also identified by the icon here and their background color.
- (lets-play): When you've added 12 cards, click here to play!

---
---

# PART 14 — LEARNING CHECK (Focus Gate)

### Focus Gate — Overworld Prompts (before a learning check)
[source: js/overworld.js → FOCUS_GATE_FIRST / FOCUS_GATE_AGAIN]
- Explorer (first): I'm losing my focus.
- Explorer (first): I think I need a learning check to keep going.
- Explorer (again): That place looks so cool.
- Explorer (again): If only there was a way to restore my focus.

### Learning Check — UI Strings
[source: js/sog-learning-check.js → STR]
- (title): Learning Check
- (prompt): Answer to restore focus:
- (correct): Correct!
- (correct sub): Focus Boosted!
- (wrong): Not quite!
- (wrong sub): Here's another one — try again.
- (next): Next Question
- (done): Done
- (answer true): True
- (answer false): False
- (gate title): Out of Focus
- (gate message): You're out of focus! Answer a learning check to continue.
- (gate answer button): Answer a Question
- (gate close button): Not Now
> NOTE: sog-focus.js (the focus-economy module) contains no player-facing strings — all gate/prompt text lives here in STR.

### Learning Check — Question Bank
[source: js/sog-learning-check.js → QUESTIONS]
> NOTE: All questions are multiple-choice. In the source the CORRECT answer is always listed first (`correct: 0`) then shuffled on screen; the correct option is marked ✓ below.

**Q1. What does the term "hunter-gatherer" mean?**
- ✓ People who hunted animals and gathered plants for food
- People who only farmed grain
- People who traded goods between cities
- People who built the first permanent cities

**Q2. What is a nomad?**
- ✓ A person who moves from place to place
- A person who studies ancient bones
- A skilled craftsperson
- A village leader

**Q3. About how many people typically made up a hunter-gatherer band?**
- ✓ Around 30
- Around 5
- Around 500
- Around 5,000

**Q4. Around what time did early humans learn to make and control fire?**
- ✓ 500,000 years ago
- 8,000 years ago
- 2,000 years ago
- 100 years ago

**Q5. What does the word "technology" mean, based on its Greek roots?**
- ✓ The study and application of crafts or skills
- The study of the stars
- The worship of many gods
- The trading of surplus goods

**Q6. Why do some archaeologists believe early humans made cave paintings of animals?**
- ✓ To honor the spirits of animals killed for food
- To teach children math
- To record business deals
- To mark the boundaries of their land

**Q7. What is migration?**
- ✓ Moving from one place to settle in another
- Watering crops with canals
- Trading goods for food
- Building walls around a village

**Q8. How did early humans first enter the Americas?**
- ✓ By crossing a land bridge connecting Siberia and Alaska
- By sailing across the Atlantic Ocean
- By following rivers from Africa
- By building large ships

**Q9. Around what year did people begin the practice of agriculture?**
- ✓ 8000 B.C.
- 500,000 B.C.
- 2340 B.C.
- 539 B.C.

**Q10. What is the name given to the shift from food gathering to food raising?**
- ✓ The Agricultural Revolution
- The Industrial Revolution
- Cultural diffusion
- Domestication

**Q11. What does it mean to "domesticate" a plant or animal?**
- ✓ To learn to grow, tend, or raise it for human use
- To trade it to another village
- To paint it on a cave wall
- To worship it as a god

**Q12. In slash-and-burn agriculture, what did early farmers do?**
- ✓ Cut and burned trees and brush to clear land for crops
- Built dams across rivers
- Used iron weapons to hunt
- Traded grain for metal tools

**Q13. What is a surplus?**
- ✓ More than what is needed to survive
- A shortage of food
- A type of farming tool
- A religious ceremony

**Q14. What is "specialization"?**
- ✓ When a person uses a skill for one kind of work
- When a group of many people are under one ruler
- The way early people write on clay tablets
- A flooding river

**Q15. What is a social class?**
- ✓ A group of people with similar customs, background, training, and income
- A school for scribes
- A type of irrigation canal
- A religious holiday

**Q16. How did surpluses help villages survive?**
- ✓ They were stores of food to survive bad seasons
- They were used as weapons
- They were always given to the gods
- They prevented flooding

**Q17. What does the word "Mesopotamia" mean in Greek?**
- ✓ Land between the rivers
- Cradle of civilization
- City of gods
- Fertile Crescent

**Q18. Which two rivers framed Mesopotamia?**
- ✓ The Tigris and the Euphrates
- The Nile and the Jordan
- The Huang He and the Indus
- The Red Sea and the Persian Gulf

**Q19. What is silt?**
- ✓ Fine, fertile soil deposited by rivers
- A type of wedge-shaped writing
- A building made of mud bricks
- A weapon made of bronze

**Q20. What is the Fertile Crescent?**
- ✓ A curving strip of rich farmland from the Mediterranean Sea to the Persian Gulf
- A desert in southern Egypt
- A mountain range in Turkey
- The capital city of the Chaldeans

**Q21. What is irrigation?**
- ✓ Watering crops by bringing water to fields through canals and ditches
- Worshiping many gods
- Trading grain for metal
- A system of writing

**Q22. Why was unpredictable flooding a problem for Mesopotamian farmers?**
- ✓ Farmers could not predict when to plant, and floods could be too big or too small
- The floods always came at the same time each year
- The floods carried away all the fertile soil
- The floods never reached the fields

**Q23. What is a drought?**
- ✓ A period when not enough rain and snow fall
- A flooding of the rivers
- A type of mud-brick building
- A group of traveling merchants

**Q24. Because Mesopotamia lacked stone and wood, what did people use as their main building material?**
- ✓ Mud (for bricks and plaster)
- Iron
- Bronze
- Marble

**Q25. Why was Mesopotamia easy to invade?**
- ✓ It had few mountains or other natural barriers
- It had no rivers
- Its people had no weapons
- It had too many walls

**Q26. How did Mesopotamians get resources like stone, wood, and metal that they lacked?**
- ✓ They traded their surplus grain for them
- They mined them locally
- They stole them from Egypt
- They made them from mud

**Q27. Most historians believe the first civilization arose around 3300 B.C. in what region?**
- ✓ Sumer
- Egypt
- Babylon
- Assyria

**Q28. What is a city-state?**
- ✓ A city and the surrounding land it controls, with its own government
- A group of many lands under one ruler
- A temple where priests lived
- A traveling group of merchants

**Q29. What was a ziggurat?**
- ✓ A large temple that was the center of a Sumerian city
- A type of farming tool
- A wedge-shaped writing symbol
- A king's crown

**Q30. What was the name of the wedge-shaped writing system the Sumerians invented?**
- ✓ Cuneiform
- Hieroglyphics
- Pictographs
- The alphabet

**Q31. What tool did the Sumerians use to press markings into clay tablets?**
- ✓ A stylus (a sharpened reed)
- An iron dagger
- A potter's wheel
- A plow

**Q32. Who were scribes in Sumerian society?**
- ✓ Professional record keepers who could read and write
- Soldiers who fought in wars
- Farmers who grew surplus grain
- Priests who ran the ziggurat

**Q33. What is polytheism?**
- ✓ The belief in many gods
- The belief in one god
- The worship of kings
- The study of the stars

**Q34. Which of these inventions are the Sumerians believed to have created?**
- ✓ The wheel, the plow, and the sailboat
- The printing press and gunpowder
- Iron weapons and the battering ram
- The calendar with a seven-day week

**Q35. In Sumerian society, who were at the top of the social classes?**
- ✓ Kings and priests
- Farmers and artisans
- Slaves and merchants
- Soldiers and scribes

**Q36. What is an empire?**
- ✓ A group of many different lands under one ruler
- A single city and its farmland
- A temple for worship
- A type of clay tablet

**Q37. Around 2340 B.C., who conquered Mesopotamia to create the world's first empire?**
- ✓ Sargon of Akkad
- Hammurabi
- Nebuchadnezzar
- Gilgamesh

**Q38. King Hammurabi of Babylon is best known for what?**
- ✓ His code, or collection of laws
- Building the Hanging Gardens
- Inventing cuneiform
- Defeating the Assyrians

**Q39. About how many laws were in Hammurabi's Code?**
- ✓ 282
- 60
- 100
- 600

**Q40. What made the Assyrian army so strong?**
- ✓ They were the first large army to use iron weapons
- They used elephants in battle
- They never lost a single soldier
- They fought only at night

**Q41. The Chaldeans built which famous landmark, considered one of the Seven Wonders of the Ancient World?**
- ✓ The Hanging Gardens of Babylon
- The Great Pyramid
- The Walls of Uruk
- The Ishtar Gate

**Q42. What important scientific advancement did the Chaldeans develop?**
- ✓ The first calendar with a seven-day week
- The wheel
- Iron weapons
- The potter's wheel

---
---

# APPENDIX A — Result Screens & Templated UI Strings

> These are the win/loss/tie result screens. They are largely templated UI (headline word + score rows), not narrative — but listed so every source is accounted for. Each battle has its own copy in its own file.

- **Gilgamesh** [js/sog-adventure-gilgamesh.js → _showResultPopup / _buildLocRow]: headline "VICTORY"/"DEFEAT"/"TIE"; rows "You: <IP>", "vs", "Gilgamesh: <IP>"; badges "YOU"/"GILGAMESH"/"TIE"; repeat-win flourish "VICTORY"; floating "SHOW RESULTS" button; portrait indicator "Click Here"; turn counter "Turn <n> / 4".
- **Sargon** [js/sog-adventure-sargon.js → _showResultScoreboard / _buildLocRow]: headline "VICTORY"/"A TIE"/"DEFEAT"; rows "You: <IP>" / "Sargon: <IP>"; badges "YOU"/"SARGON"/"TIE"; flourish "VICTORY"; "SHOW RESULTS".
- **Hammurabi** [js/sog-adventure-hammurabi.js → _showResultScoreboard / _buildLocRow]: headline "VICTORY"/"A TIE"/"DEFEAT"; rows "You: <IP>" / "Hammurabi: <IP>"; badges "YOU"/"HAMMURABI"/"TIE"; flourish "VICTORY".
- **Nebuchadnezzar** [js/sog-adventure-hanginggardens.js → _showResultScoreboard / _buildLocRow, OPP_NAME/OPP_BADGE]: headline "VICTORY"/"A TIE"/"DEFEAT"; rows "You: <IP>" / "Nebuchadnezzar: <IP>"; badges "YOU"/"NEB"/"TIE"; flourish "VICTORY".
- **Gold reward label** (all boss battles) [_runGoldRewardAnimation]: "<amount> Gold" — DYNAMIC, amount = 25 (first win) or 10 (repeat win).

---

# APPENDIX B — Map Labels & Speaker Registry (reference)

> Player-facing place names and the speaker-id registry. Mostly labels, included so edits to place names / who-speaks can be mapped back.

### Node & Region Display Names
[source: js/overworld.js → MAPS.*.nodes[].name / exits[].label / region displayName]
- (exits): "To Egypt →", "To Mesopotamia →", "← To East Africa", "← To Egypt"
- (nodes): Prehistory · The Double Crown (Egypt) · Walls of Uruk · Mesopotamian Marketplace · Akkad (Sargon) · Babylon (Hammurabi) · The Hanging Gardens
- (regions): East Africa · Egypt · Mesopotamia

### Speaker Registry
[source: js/sog-adventure-hud.js → CHARACTERS]
- Speaker ids used across all dialogue arrays: explorer, lucy, neanderthal, otzi, hunter, farmer, gilgamesh, sargon, hammurabi, nebuchadnezzar, trader.
- Default player label: "Explorer"; region label set dynamically.
> NOTE: The CHARACTERS keys double as speaker ids (no separate display-name strings). Portrait/audio config skipped.

---

# APPENDIX C — Notes on What's Missing / Dynamic (read before editing)

- **Templated values** (`<IP>`, `<amount>`, `<river>`, `<playerTotal>`, tiebreaker totals) are filled at runtime — edit the surrounding words, not the placeholders.
- **HTML-defined text** (Part 1 first-load/framing, legend titles) lives in `index.html`, not JS constants — edit there (element ids given).
- **Tutorial end-of-turn reactions** (Ötzi + Lucy) branch by outcome (win / loss / draw / two tiebreaker cases) — every branch is included and labeled; each is a separate string.
- **Two copies of the Cuneiform post-loss beat** exist — an overworld version (js/overworld.js: D3_FARMER_POSTLOSS_A/B, D3_GILGAMESH_CHALLENGE_AGAIN) and an in-battle version (js/sog-adventure-gilgamesh.js: FARMER_POSTLOSS_A/B, GILGAMESH_POSTLOSS_CHALLENGE). Edit both if you want them to match.
- **legend.js** LOCATION_SLIDES / CARD_SLIDES hold only asset paths / image names, no prose — nothing to edit there.
- **welcome.js / home.js** contain no literal strings — their visible copy is in `index.html` (captured in Part 1).
- Pure UI button labels (PLAY AGAIN, CONTINUE, BACK TO MAP, Next/Back/Close, etc.) were intentionally excluded unless they carried narrative.
