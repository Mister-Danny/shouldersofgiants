# Shoulders of Giants — Full Game Script (SHIPPED — v2)

**Status:** extracted from the live code after the Explorer voice pass (commit `3b0931a`, published to main). This replaces the pre-rewrite extraction; every line below is the text currently in the game.

**How to use this file:**
- Read top-to-bottom like a screenplay. Each block has a **`[source: ...]`** tag naming the exact file and the constant/variable/function the text lives in.
- **Edit the text freely** — keep the source tags and speaker labels intact so each edited block can be mapped straight back to its source constant.
- One `- Speaker:` line = one click-to-advance bubble in-game.
- *Staging* notes describe what the code does around the lines (card grants, SFX beats, portrait slide-outs, skip-gates). **`> NOTE:`** lines flag dynamic/templated/conditional text — edit the words around placeholders like `<river>`, `<IP>`, `<amount>`, not the placeholders.
- A handful of strings live in **`index.html`** (first-load modals, home screen, legend titles) rather than a JS constant — those are tagged accordingly.

---
---

# PART 1 — FIRST-LOAD & FRAMING (index.html)

> These live in `index.html` markup (element ids given), not JS constants — edit in place there. Unchanged in the voice pass.

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
> NOTE: The Acknowledgments section continues with a credits list — not narrative, omitted here.

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

---
---

# PART 2 — HOW TO PLAY (Slideshow)

### How to Play — Slideshow
[source: js/options-panel.js → HOWTO_SLIDES]

**Slide 1 — Welcome, Explorer!**
You're an explorer lost in history, looking for the way home! Battle famous figures from the past by playing cards, and learn how civilization was built along the way.

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

> Unchanged in the voice pass except the one comma fix in the matchup scene.

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
- Ötzi: Not so fast, grandma.
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

### Tutorial Battle — Turn-End Reactions, Turns 2–5, Post-Game, Results & Home-Outcome Lines, Action Hints
[source: js/tutorial.js → onT1EndTurn() / startTurn2() / onT2EndTurn() / startTurn3() / onT3EndTurn() / startTurn4() / step_magellanMove() / onMagellanMoved() / onT4EndTurn() / startTurn5() / showPostGameDialogue() / showTutorialResults() / showHomeOutcomeDialogue() / updateHint()]
> Unchanged in the voice pass — the full outcome-branched Ötzi/Lucy exchanges (draw / player-ahead / behind / tiebreaker variants per turn), the results lines ("You did make history afterall…" / "Well, I said you need a lesson or two…"), home-screen outcome lines, and the all-caps HUD action hints. Identical text; see the source directly.

---
---

# PART 4 — OVERWORLD INTRO (East Africa / Prehistory)

### Adventure Intro — Phase 1 (East Africa arrival)
[source: js/overworld.js → PHASE1_DIALOGUE]
- Explorer: Jumpin' jackrabbits...
- Explorer: I don't think that was a normal doorway.
- Explorer: Where am I?
- Explorer: Something about this place does seem oddly familiar.
- Explorer: But it's definitely not home.
- Explorer: And I'm definitely going to be late to soccer practice.
- Explorer: What do I do?
- Explorer: And where are all the people?

### Adventure Intro — Phase 2 (Prehistory node, meeting Lucy)
[source: js/overworld.js → PHASE2_DIALOGUE]
- Lucy: Mmmhm...
- Lucy: I'm standing right here.
- Explorer: Woah, you can talk?!
- Explorer: I thought you were an ape!
- Lucy: Australopithecus, to the uninitiated.
- Explorer: Australo-what-now?
- Lucy: It means I'm one of your earliest bipedal human ancestors to stand on two legs.
- Explorer: My ancestor? Are you saying we're related?
- Lucy: I'm like your great aunt a million times over.
- Explorer: That's cool.
- Explorer: But wait.
- Explorer: How are you TALKING?
- Explorer: How am I even HERE?
- Explorer: Did I time travel?
- Explorer: Is this—
- Lucy: Relax.
- Lucy: I might be millions of years old, but I don't have all the answers.
- Explorer: That doesn't help my nerves.
- Explorer: I have to get home.
- Explorer: I have soccer practice.
- Lucy: Soccer practice?
- Explorer: It's very important.
- Lucy: If you say so.
- Lucy: All I know is that by standing upright on my own two feet...
- Lucy: I always get to where I want to go.
- Explorer: That's actually very inspiring.
- Explorer: Perhaps, I will find my way home.
- Lucy: You do that.
- Lucy: Now, I'm going to use my bipedal powers to get myself a drink.
- Lucy: Let me know if you need me.

---
---

# PART 5 — PREHISTORY: NEANDERTHAL BATTLE

### Neanderthal — Pre-Battle Dialogue (speech bubbles)
[source: js/sog-adventure-prehistory.js → inline array in playPreBattleDialogue()]
- Explorer: This fire seems promising.
- Explorer: Maybe someone here knows something.
- Neanderthal: Ughh...
- Explorer: Jugglin' jaguars... is that a caveman?
- Neanderthal: AARRGH!
- Explorer: HELP?!

### Neanderthal — Coaching Phase 1 (intro exchange)
[source: js/sog-adventure-prehistory.js → COACHING_PHASE_1]
- Neanderthal: This my fire.
- Lucy: He thinks he invented fire and doesn't have to share it.
- Neanderthal: Me no think. Me know.
- Lucy: You no think, alright.
- Neanderthal: AARRGH!!!

*Staging: Lucy pops in as her first line starts (`popLucyOnStart`).*

### Neanderthal — Coaching Phase 2 (Lucy tutorial coaching)
[source: js/sog-adventure-prehistory.js → COACHING_PHASE_2]
- Lucy: Alright, lets try and avoid an early extinction event.
- Lucy: See those cards?
- Lucy: You play one each turn on your side of The Camp.
- Lucy: See that number?
- Lucy: Those are Influence Points, or IP for short.
- Lucy: Your goal here is to gain the most IP at The Camp after four turns.
- Lucy: Oh, and most cards have special abilities.
- Lucy: If you want to survive, click on them to read what they have in store.
- Lucy: When you're ready, send this guy back to whatever came before the Stone Age...
- Lucy: Click and drag your first card into play.

*Staging: "See that number?" starts the IP-badge pulse on the rightmost hand card (`startIPPulse`); the next line clears it.*

### Neanderthal — Turn-1 End-Turn Prompt (Lucy one-liner)
[source: js/sog-adventure-prehistory.js → PREHISTORY_SCRIPT.onPlayerPlayed (inline)]
- Lucy: When you've made your decision, click the End Turn button.
> NOTE: Turn 1 only, after the first card is committed; the End Turn button pulses.

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
- Lucy: That was embarrassing.
- Lucy: Did you even read the cards?
- Lucy: If you click on your cards and learn what they do, he doesn't stand a chance.

### Neanderthal — Tie Dialogue
[source: js/sog-adventure-prehistory.js → TIE_DIALOGUE]
- Neanderthal: Hm. We same.
- Lucy: A tie is not a win.
- Neanderthal: Come back. I ready.
- Lucy: We were close. Use your abilities and go again.

### Neanderthal — Result-Screen Sublines
[source: js/sog-adventure-prehistory.js → showVictoryScreen() / showDefeatScreen() / showTieScreen()]
- (win): You conquered The Camp
- (loss): Neanderthal won The Camp
- (tie): The Camp ended in a draw

---
---

# PART 6 — ÖTZI BATTLE

### Ötzi — Pre-Battle Encounter (overworld signpost)
[source: js/overworld.js → OTZI_PRE_BATTLE_DIALOGUE]
- Ötzi: Where do you think you're going?
- Explorer: I'm trying to find my way home.
- Ötzi: You look like you're trying to find an arrowhead to the back of the head.
- Explorer: That's not nice.
- Ötzi: The world isn't nice.
- Explorer: Okay! Great talk! I'll just be on my way—
- Ötzi: No. You won't.
- Explorer: Dancin' dingos...
- Explorer: I'm starting to sense a pattern here.

### Ötzi — Pre-Shake Dialogue (opening)
[source: js/sog-adventure-otzi.js → PRE_SHAKE_LINES]
- Explorer: Okay, I know this game!
- Explorer: Play a card each turn.
- Explorer: Score the most points.
- Explorer: I've got this.
- Ötzi: The world is a big place.

> NOTE: The intro lines (pre + post shake) are gated by `sog_otzi_opening_seen` — once watched, every later entry (Play Again after a loss included) skips them; the shake / side-location reveal / deal still run.

### Ötzi — Post-Shake Dialogue (after locations reveal)
[source: js/sog-adventure-otzi.js → POST_SHAKE_LINES]
- Explorer: Oh
- Ötzi: You can now play 2 cards each turn.
- Explorer: Bigger world, more cards.
- Explorer: Makes sense...
- Explorer: How do I win?
- Ötzi: You won't.
- Ötzi: But try to gain the most IP at 2 of the 3 locations.

### Ötzi — Win Dialogue (first half)
[source: js/sog-adventure-otzi.js → WIN_DIALOGUE]
- Ötzi: How did you beat me?
- Explorer: I do my homework.
- Ötzi: Hm. Whatever that means.
- Explorer: It means a lot.
- Ötzi: Right.
- Ötzi: I guess you can have this...

*Staging: the Ötzi card (35) acquisition animation plays here, then the token line below. On a repeat win (card already owned) the reveal is skipped and the token line plays immediately.*

### Ötzi — Win Token Line (second half)
[source: js/sog-adventure-otzi.js → WIN_TOKEN_LINE]
- Ötzi: A token of me frozen in time.

### Ötzi — Loss Dialogue
[source: js/sog-adventure-otzi.js → LOSS_DIALOGUE]
- Ötzi: As I said. You're not ready.
- Explorer: Please let me try again.
- Explorer: I have to get home.
- Ötzi: The world doesn't give second chances.
- Ötzi: But I will.
- Explorer: Really? Thank you!
- Ötzi: Don't waste it.

### Ötzi — Tie Dialogue
[source: js/sog-adventure-otzi.js → TIE_DIALOGUE]
- Ötzi: A stalemate. Curious.
- Explorer: Does that mean I can pass?
- Ötzi: No.
- Ötzi: It means we go again.

### Ötzi — Scoreboard Sublines
[source: js/sog-adventure-otzi.js → _showOtziScoreboard()]
- (win): You conquered Otzi at 2 of 3 locations
- (tie): A stalemate — every location tied
- (loss): Otzi won 2 of 3 locations
- (tiebreaker): Tiebreaker — Total IP: You <playerTotal>  vs  Otzi <otziTotal>
> NOTE: The tiebreaker subline (two spaces around "vs") replaces the outcome subline whenever the tiebreaker decided it.

### Post-Neanderthal Victory — Lucy's Goodbye (Part A)
[source: js/overworld.js → POST_NEANDERTHAL_DIALOGUE]
- Explorer: Wow, he gave me his card.
- Explorer: That was so nice of him.
- Lucy: That wasn't nice.
- Lucy: To the winners of history go the spoils.
- Explorer: I'm not sure what that means.
- Explorer: But it sounds really smart.
- Lucy: You'll learn.
- Explorer: With your help, I'll be home in no time.
- Explorer: Where to next?
- Lucy: About that.
- Lucy: I can walk, but these old bones don't migrate.
- Explorer: Wait. You're not coming?
- Explorer: But I don't know anything about anything yet!
- Lucy: Give yourself some credit.
- Lucy: You outsmarted a knuckle-draggin' Neanderthal.
- Explorer: I guess...
- Lucy: Here. Take this.

*Staging: Lucy's card-acquisition reveal (card 33) fires between Part A and Part B.*

### Post-Neanderthal Victory — Lucy's Goodbye (Part B)
[source: js/overworld.js → POST_NEANDERTHAL_DIALOGUE_B]
- Explorer: Your card?
- Lucy: Every time you stand on two legs and reach into your deck...
- Lucy: I will be there.

### East Africa — Post-Ötzi Return (Hunter)
[source: js/overworld.js → EASTAFRICA_POSTOTZI_DIALOGUE]
- Explorer: Who knew history had so much conflict?
- Hunter: Tell me about it.
- Explorer: Oh, hi. You're not going to want to fight me, are you?
- Hunter: Are you from one of those tribes taking my antelope?
- Explorer: No. Definitely not.
- Hunter: Alright, then.
- Explorer: I'm so sorry people are stealing your pets.
- Hunter: Pets? They're my lunch.
- Explorer: Oh. I see.
- Explorer: Well, couldn't you share?
- Hunter: What does that mean?

### To Egypt — Hunter's Goodbye (first "To Egypt" click)
[source: js/overworld.js → TOEGYPT_GOODBYE_DIALOGUE]
- Hunter: Hey, where are you going?
- Explorer: I'm going to try and find my way home by exploring the rest of the world.
- Hunter: There's more world out there?
- Explorer: Of course.
- Hunter: Maybe there are places where I won't have to fight others for resources?
- Explorer: There's only one way to find out...
- Explorer: Let's go!

---
---

# PART 7 — MESOPOTAMIA: TRAVEL & GILGAMESH

### D1 Scene 1 — Leaving East Africa (with Hunter)
[source: js/overworld.js → D1_SCENE1_DIALOGUE]
- Hunter: Hey, where are you going?
- Explorer: I need to get home, so I'm going to explore beyond this area.
- Hunter: What do you mean beyond this area?
- Explorer: It's a big world out there.
- Hunter: How big?
- Explorer: I don't know how to answer that.
- Hunter: Big enough to get away from these other tribes.
- Explorer: I think so.
- Hunter: Alright, I'm coming with you.
- Explorer: Let's go!

### D1 Scene 2 — Egypt (first pass-through, too early)
[source: js/overworld.js → D1_SCENE2_DIALOGUE]
- Explorer: WOW. Look at that huge river!
- Hunter: Ah, Kemet. The black land...
- Explorer: The black land? It looks pretty green to me.
- Hunter: Look at the soil. It's so rich, it's black.
- Explorer: Ohhh. Rich soil, big river...
- Explorer: Wait. Is that the Nile?
- Explorer: I know Egypt!
- Explorer: It has pyramids and mummies and King Tut!
- Hunter: What's a pyramid?
- Explorer: You're right. Where are all the pyramids?
- Explorer: Am I so early there aren't even pyramids yet?
- Hunter: I cannot express enough that I have no idea what you're talking about.
- Explorer: Right. We'll have to come back later.
- Explorer: It's going to be so cool.
- Hunter: Whatever you say, stranger.

### D1 Scene 3 — Mesopotamia arrival
[source: js/overworld.js → D1_SCENE3_DIALOGUE]
- Hunter: Mesopotamia!
- Explorer: Mess-o-potato?
- Hunter: Mesopotamia. It means the land between the rivers.
- Explorer: Ohhh. Two rivers! That must be why it's so green!

### D2a — Hunter Transformation Line (inline)
[source: js/overworld.js → inline in the D2a river-walk sequence]
- Hunter: I feel different…

*Staging: the Hunter portrait crossfades into the Farmer (~800ms, transform.m4a) right after this line.*

### D2a — Farming Dialectic (Hunter → Farmer)
[source: js/overworld.js → D2A_FARMING_DIALOGUE]
- Explorer: You LOOK different.
- Farmer: I am different.
- Farmer: I no longer have a desire to hunt all the time.
- Explorer: You don't?
- Farmer: No. On this land, I can grow anything.
- Explorer: If you grow your own food, you won't have to fight over antelope again!
- Farmer: Exactly!
- Farmer: And if I grow enough, I might have extra to trade.
- Explorer: I think they call that a surplus.
- Farmer: I don't care what you call it,
- Farmer: If I grow enough to trade someone else can make my tools and I can just focus on farming.
- Explorer: I think you're talking about job specialization.
- Farmer: I think we're talking about building something bigger than a tribe...

*Staging: the Walls of Uruk node drops in from above (uruk.mp3 plays fully) before the closing sequence.*

### D2a — Closing Sequence (inline)
[source: js/overworld.js → inline in _d2aClosingSequence]
- Explorer: Leapin' llamas...
- Explorer: Did you just create a city?!
- Farmer: I am but a humble farmer who needs to tend his land.
- Farmer: So long.

*Staging: Farmer's portrait slides out, then the Explorer finishes alone:*

- Explorer: Wow, a real ancient city...
- Explorer: Maybe somebody there will help me get home.
- Explorer: Let's go check it out!

### D2b — Gilgamesh Encounter (Uruk)
[source: js/overworld.js → D2B_GILGAMESH_DIALOGUE]
- Gilgamesh: Welcome to my city, Uruk.
- Explorer: Oh hi! You must be the mayor!
- Gilgamesh: How DARE you confuse me for a civil servant?!
- Explorer: What?
- Gilgamesh: I am Gilgamesh.
- Gilgamesh: KING Gilgamesh.
- Explorer: But you said it was just a city.
- Gilgamesh: Just a city? It's my city-STATE.
- Explorer: Oh, I'm sorry...
- Gilgamesh: You will be.

### Gilgamesh — Battle Rules Popup
[source: js/sog-adventure-gilgamesh.js → RULES_TITLE / RULES_BODY]
- (title): The Epic Battle of Gilgamesh
- (narration): 4 Turns
- (narration): Play 2 cards each turn.
- (narration): <u>Win Condition</u> — Gain the most IP at the most locations to defeat Gilgamesh.

### Gilgamesh — Opening Dialogue (pre-prompt)
[source: js/sog-adventure-gilgamesh.js → OPENING_PRE]
- Gilgamesh: Prepare to be smited into the great beyond.
- Explorer: Gulp.
- Explorer: How do you play this, again?
> NOTE: First attempt only — skipped once `sog_gilgamesh_opening_seen` or the Cuneiform grant is set (every retry).

### Gilgamesh — Opening Interactive Prompt + Resume
[source: js/sog-adventure-gilgamesh.js → OPENING_PROMPT + inline in _runOpeningDialogue]
- Gilgamesh: Click on me, if you need a reminder.
- Explorer: Thank you!

*Staging: the prompt line holds (no click-advance) while the opponent portrait glows with a "Click Here" tag; clicking it opens the rules popup, and "Thank you!" plays on dismiss.*

### Gilgamesh — Loss/Tie Smack-Talk (before DEFEAT scoreboard)
[source: js/sog-adventure-gilgamesh.js → GILGAMESH_LOSS_SMACK]
- Gilgamesh: Muahaha...
- Explorer: I never had a chance.
- Gilgamesh: What did you expect in my city-state?
- Explorer: Your cards were too strong. Everything I've learned so far... it wasn't enough.
> NOTE: First-encounter losses/ties only; after Gilgamesh has been beaten, losses go straight to the scoreboard.

### Gilgamesh — Post-Victory Sequence (opening win dialogue)
[source: js/sog-adventure-gilgamesh.js → inline array in _runPostVictorySequence]
- Explorer: I DID IT!
- Gilgamesh: How is that possible?
- Explorer: I learned from history.
- Gilgamesh: By doing so, you've earned this.

*Staging: runs after CONTINUE on the first-win scoreboard → Gilgamesh card (43) acquisition → gold → closer below.*

### Gilgamesh — Post-Victory Sequence (closing, after card + gold)
[source: js/sog-adventure-gilgamesh.js → inline array in _runPostVictorySequence (grantGoldThenFinish)]
- Explorer: Wow!
- Gilgamesh: See what you can get yourself at the Mesopotamian Marketplace.
- Explorer: Thank you! You're such a gracious king.
- Gilgamesh: Until the next time...

---
---

# PART 8 — POST-LOSS CUNEIFORM INTERVENTION (Farmer)

> The LIVE intervention lives in the Gilgamesh battle module (candlelit "shh" sequence off PLAY AGAIN after a first-encounter loss). The overworld copies `D3_FARMER_POSTLOSS_A/B` are **dead code** kept in sync — edit the Gilgamesh versions.

### Post-Loss — Farmer Intervention Part A
[source: js/sog-adventure-gilgamesh.js → FARMER_POSTLOSS_A]
- Farmer: Hey. That was a tough battle.
- Explorer: His cards were so much more advanced than mine.
- Farmer: Of course they were. You were playing in Prehistory.
- Farmer: You didn't stand a chance.
- Explorer: Then what do I do? I can't get stuck here!
- Farmer: You need to bring your cards up to date.

*Staging: the Cuneiform card (46) acquisition fires between Part A and Part B.*

### Post-Loss — Farmer Intervention Part B
[source: js/sog-adventure-gilgamesh.js → FARMER_POSTLOSS_B]
- Explorer: What's Cuneiform?
- Farmer: The first written language.
- Explorer: Oh, how does it work?
- Farmer: You should read it, obviously.
- Explorer: Oh, right.
- Farmer: But in effect, it will empower those old prehistoric cards you have.
- Explorer: Thank you.
- Farmer: Don't mention it.
- Farmer: Seriously, he'll kill me.

### Post-Loss — Re-Challenge (in-battle, after the candle snuffs)
[source: js/sog-adventure-gilgamesh.js → GILGAMESH_POSTLOSS_CHALLENGE]
- Gilgamesh: Back for more?
- Explorer: I think, I'm ready.
- Gilgamesh: I think you should have learned your lesson.
- Explorer: That's exactly what I did.

### Post-Loss — Re-Challenge (overworld node re-click variant)
[source: js/overworld.js → D3_GILGAMESH_CHALLENGE_AGAIN]
- Gilgamesh: You dare to challenge me again?!
- Explorer: I'm not the same kid you beat last time.
- Explorer: I've been reading.
- Gilgamesh: You naive little puppet.
- Gilgamesh: Prepare to be swept into the dustbin of history.

---
---

# PART 9 — SARGON (Akkad)

### D4 — Sargon Node Reveal (dust-storm bookends)
[source: js/overworld.js → D4_SARGON_REVEAL_INTRO / D4_SARGON_REVEAL_OUTRO]
- Explorer (intro): Wow, I can't wait to try out these new cards!
- Explorer (outro): Okay, that was mysterious.
- Explorer (outro): I have to go check it out.

*Staging: the map music fades out entirely before the dust storm (sargonintro.mp3 plays against silence) and fades back in when the reveal is done.*

### D4 — Sargon Turned Away (deck < 15)
[source: js/overworld.js → D4_SARGON_TURNED_AWAY_A / _B]
- Sargon: You think you're ready to face Sargon?
- Explorer: I guess…
- Sargon: Guess again.
- Sargon: You need a deck of at least 15 cards before you can face Sargon, the Great.

*Staging: Sargon's portrait slides out, then the Explorer alone:*

- Explorer: 15 cards...
- Explorer: I'd better earn more gold and grow my collection.

### D4 — Sargon Encounter (deck ready)
[source: js/overworld.js → D4_SARGON_ENCOUNTER]
- Sargon: Who dares to cross Sargon the Great?
- Explorer: It is I! Just a humble explorer, trying to get home in time for soccer practice...
- Explorer: Great King Sargon.
- Sargon: King?!
- Sargon: Sargon is no King.
- Explorer: Uhh, what?
- Sargon: Sargon is the world's first EMPEROR!
- Explorer: Isn't that like the same thing?
- Sargon: I don't rule over one measly city-state.
- Sargon: I rule over ALL the city-states of Mesopotamia!
- Explorer: Of course you do.
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
- Explorer: My cards look different!
- Sargon: Exactly.
- Sargon: Every card now comes with a price.
- Sargon: This is the Capital cost.
- Explorer: So I can't just play whatever I want?
- Sargon: Welcome to Empire.
- Sargon: You have five Capital each turn.
- Explorer: And what if I run out?
- Sargon: Then you wait 'til next turn.
- Sargon: If there is a next turn.
- Explorer: Five to spend, every turn.
- Explorer: Got it!
- Sargon: We'll see about that.
> NOTE: First-time only — gated by `sog_sargon_opening_seen` / battle-complete.

### Sargon — First-Win Victory Dialogue
[source: js/sog-adventure-sargon.js → WIN_DIALOGUE]
- Sargon: You've bested me.
- Sargon: But how?
- Explorer: I've learned from the past...
- Explorer: And the future.
- Sargon: I don't understand.
- Explorer: A very wise old friend told me you can see further if you stand on two feet.
- Sargon: You are wise.
- Sargon: And so am I.
- Sargon: Take this as a symbol of our budding alliance.

*Staging: Sargon card (37) grant → +25 gold → closer below → scoreboard (CONTINUE exits to map, then the Hammurabi node earth-rise plays with the music held — silence until the node has fully risen).*

### Sargon — First-Win Closing Line
[source: js/sog-adventure-sargon.js → WIN_DIALOGUE_CLOSER]
- Explorer: I see why they call you The Great.

### Sargon — Pre-Loss Smack-Talk
[source: js/sog-adventure-sargon.js → LOSS_SMACK]
- Sargon: You're no match for Empire.
- Sargon: Be gone with you.

### D4 — Sargon Reflections (overworld)
[source: js/overworld.js → D4_SARGON_LOSS_REFLECT / D4_SARGON_WIN_REFLECT]
- Explorer (loss): Okay. Maybe I build up my deck before I take on an entire EMPIRE.
- Explorer (win): I guess when one empire falls, another one rises.

---
---

# PART 10 — HAMMURABI (Babylon)

### D4 — Hammurabi Encounter (overworld, deck ready)
[source: js/overworld.js → D4_HAMMURABI_ENCOUNTER]
- Hammurabi: Halt.
- Hammurabi: State your business before the Law.
- Explorer: What law?
- Explorer: I was just admiring this big stone tablet.
- Hammurabi: That "tablet" is the Code.
- Explorer: Code for what?
- Hammurabi: My code of 282 laws.
- Explorer: That's a lot of laws.
- Hammurabi: Not if you want to keep order.
- Explorer: And if someone breaks one?
- Hammurabi: They pay the price.
- Explorer: Fair enough.
- Hammurabi: Now, time to put you on trial.
> NOTE: Once Hammurabi has been beaten, clicking the node skips this encounter (and the deck gate) and goes straight into a rematch.

### D4 — Hammurabi Turned Away (deck < 15)
[source: js/overworld.js → D4_HAMMURABI_TURNED_AWAY_A / _B]
- Hammurabi: The court is not yet in session.
- Hammurabi: Return when your deck is whole — fifteen cards.

*Staging: portrait slides out, then:*

- Explorer: I should finish building my deck first.

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

### Hammurabi — Opening Dialogue (the Trial)
[source: js/sog-adventure-hammurabi.js → OPENING_DIALOGUE]
- Hammurabi: Order. Order.
- Hammurabi: The Court of Hammurabi is now in session.
- Explorer: What did I do?!
- Hammurabi: The stranger before me is in violation of Law 7.
- Explorer: I'm innocent.
- Hammurabi: You answer to no city--
- Hammurabi: Arriving with no witness, no contract, no account of oneself.
- Explorer: That doesn't make me a criminal!
- Hammurabi: Under the Code, a stranger who cannot account for himself is judged as a thief.
- Explorer: A thief?! But I didn't take anything!
- Hammurabi: Then where did you get that funny hat?
- Explorer: I don't know. Costco?
- Hammurabi: This is not the Costco.
- Hammurabi: Without a receipt, you stand trial.
- Hammurabi: As Shamash, the God of Justice, has declared it.
- Hammurabi: Does the accused understand the law of the land?
- Explorer: Maybe
- Explorer: I see now. Each location plays by its own rules.
- Hammurabi: No, they play by my rules.
- Hammurabi: Now, you will obey.

*Staging — two gavel beats synced to gavel.m4a's measured pounds (~30ms / ~520ms): GAVEL BEAT 1 before "Does the accused understand the law of the land?" — the location tiles bounce/slam into place (one bounce per pound), ability text still hidden. GAVEL BEAT 2 before "I see now…" — the ability text falls into place on each nameplate and the tiles bounce on the second pound. First-time only (`sog_hammurabi_opening_seen`).*

### Hammurabi — First-Win Victory Dialogue
[source: js/sog-adventure-hammurabi.js → WIN_DIALOGUE]
- Hammurabi: Impossible.
- Hammurabi: The law was clearly on my side.
- Explorer: I read every rule on the board. Twice.
- Hammurabi: If you have won, then the law must recognize it.
- Hammurabi: Take this.
- Hammurabi: Let it be entered into the record.

*Staging: first-win ordering — VICTORY scoreboard first → CONTINUE → this dialogue → gavel strike → Hammurabi card (47) acquisition → +25 gold → closer below → exit.*

### Hammurabi — First-Win Sendoff
[source: js/sog-adventure-hammurabi.js → WIN_DIALOGUE_CLOSER]
- Hammurabi: You have been found innocent.
- Hammurabi: For now.

### Hammurabi — Pre-Defeat Loss Dialogue
[source: js/sog-adventure-hammurabi.js → LOSS_DIALOGUE]
- Hammurabi: The verdict stands.
- Hammurabi: The law does not make exceptions.
- Explorer: Can I appeal? Please? I'm kind of on a deadline to get home.
- Hammurabi: You may.
- Hammurabi: The law is patient.

*Staging: the loss verdict lands with a gavel strike before the DEFEAT scoreboard (ties get no gavel). Pre-first-victory only.*

### Hammurabi — Pre-Tie Dialogue
[source: js/sog-adventure-hammurabi.js → TIE_DIALOGUE]
- Hammurabi: A hung verdict.
- Hammurabi: The law abhors an unresolved case.
- Hammurabi: We will try this again
- Hammurabi: Until judgment is clear.

---
---

# PART 11 — NEBUCHADNEZZAR (The Hanging Gardens)

### D5 — Hanging Gardens Reflection & Reaction (sparkle reveal)
[source: js/overworld.js → D5_HANGING_GARDENS_REFLECT / D5_HANGING_GARDENS_REACTION]
- Explorer (reflect): That was a close one.
- Explorer (reflect): I almost lost an eye in there.
- Explorer (reflect): Perhaps, that's why justice is blind?
- Explorer (reaction): Whoa!
- Explorer (reaction): Cool Gardens...
- Explorer (reaction): How is that even possible?
- Explorer (reaction): Finally, a safe place to explore.

### D5 — Hanging Gardens Node Click
[source: js/overworld.js → D5_HANGING_GARDENS_CLICK_A / _B]
- Explorer: This place is literally wonderful!
- Explorer: And no sign of a mean king anywhere.

*Staging: knocking.m4a plays in full, then:*

- Explorer: Well, if no one is going to answer the door...

*Staging: opendoor.m4a plays in full, then the wipe into the battle. Once Neb is beaten, the node click skips all of this.*

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
- Nebuchadnezzar: Foreign traveler in the funny head covering...
- Explorer: You think my hat is funny?
- Nebuchadnezzar: ...take awe in the splendor of my gardens!
- Explorer: Your gardens?
- Nebuchadnezzar: I built them.
- Nebuchadnezzar: Every terrace, every bloom, every falling stream.
- Explorer: You must be so proud!
- Nebuchadnezzar: I built the greatest city the world has ever seen.
- Explorer: So far...
- Nebuchadnezzar: Then tell me, young traveler in the bizarre bonnet...
- Nebuchadnezzar: ...who gave you permission to enter the garden of a king?
- Explorer: Uh. The door was kind of open?
- Nebuchadnezzar: No one walks my paradise uninvited.
- Nebuchadnezzar: No one.
- Explorer: I guess that means I'm a fried ferret.
> NOTE: First-time only — gated by `sog_hanging_gardens_battle_opening_seen` / battle-complete.

### Nebuchadnezzar — First-Flood Interjection
[source: js/sog-adventure-hanginggardens.js → _runFloodIntro]
- Explorer: What happened?!
- Nebuchadnezzar: The <river> flooded.
- Explorer: But I can't play cards there while it's flooded!
- Nebuchadnezzar: Welcome to Mesopotamia.
> NOTE: DYNAMIC — `<river>` is "Euphrates" or "Tigris" (whichever flooded). First flood only.

### Nebuchadnezzar — Flood Presentation Text
[source: js/sog-adventure-hanginggardens.js → _floodPresentation]
- (nameplate): <location name> - Flooded
- (ability line): No cards can be played here

### Nebuchadnezzar — First-Win Victory Dialogue
[source: js/sog-adventure-hanginggardens.js → WIN_DIALOGUE]
- Nebuchadnezzar: Hmm... How unexpected.
- Explorer: I won?
- Nebuchadnezzar: Yes, somehow the stranger in the tawdry hat prevailed.
- Explorer: Hey, I like my hat.
- Nebuchadnezzar: How unfortunate.
- Nebuchadnezzar: But perhaps, the Egyptians will find it more amusing.
- Explorer: Egyptians?
- Nebuchadnezzar: Take this and be gone, will you?

*Staging: first-win ordering (story first, unlike Hammurabi) — this dialogue plays FIRST → Neb card (50) acquisition on the final line → +25 gold → then the VICTORY scoreboard (CONTINUE exits to map).*

### Nebuchadnezzar — Loss Dialogue
[source: js/sog-adventure-hanginggardens.js → LOSS_DIALOGUE]
- Nebuchadnezzar: Predictable.
- Nebuchadnezzar: Your play was as putrid as the pileus on your head.
- Explorer: Can I have another shot?
- Explorer: My road home cannot stop here.
- Nebuchadnezzar: But your tears will make fantastic fertilizer.

### Nebuchadnezzar — Tie Dialogue
[source: js/sog-adventure-hanginggardens.js → TIE_DIALOGUE]
- Nebuchadnezzar: A stalemate?
- Nebuchadnezzar: How unrefined.
- Nebuchadnezzar: We shall do this again.
- Nebuchadnezzar: Properly this time.

---
---

# PART 12 — EGYPT ON-RAMP

### Egypt On-Ramp — Post-Nebuchadnezzar (the want, re-centered)
[source: js/overworld.js → EGYPT_ONRAMP_DIALOGUE]
- Explorer: Okay. I'm done, right?
- Explorer: Abracadabra?!
- Explorer: Open sesame?!
- Explorer: Come on... magic doorway home is now where you take me.
- Explorer: Well, no sense in just standing here.
- Explorer: Nebuchadnezzar did say something about Egypt.
- Explorer: Maybe the only way back is forward.

*Staging: plays after a ~5s idle on the Mesopotamia map post-Neb; then the To Egypt exit flashes for 3s.*

### Egypt On-Ramp — Double Crown Arrival ("funny hat")
[source: js/overworld.js → EGYPT_NODE_ARRIVAL_DIALOGUE]
- Explorer: STILL no pyramids?
- Explorer: How early am I?!
- Explorer: Oohh!
- Explorer: Now that's a funny hat...

### Egypt — Stub Screen (placeholder)
[source: js/sog-adventure-egypt.js → start()]
- (heading): Egypt
- (subtext): Coming in the next phase…

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
- Trader: If not, come back with more gold.
- Explorer: And then?
- Trader: Then it joins your collection.
- Trader: Ready for you in your deck builder.
- Trader: Spend wisely.
- Trader: Gold doesn't grow on date palms.

### Deck Builder — Unlock (first marketplace return)
[source: js/overworld.js → DECKBUILDER_UNLOCK_DIALOGUE]
- Explorer: I'm starting to build quite a collection.
- Explorer: Let's see if I can build a deck.

### Deck Builder Tutorial — Steps (Arcadium + Adventure)
[source: js/dbtutorial.js → ARCADIUM_STEPS / ADVENTURE_STEPS / applySpeaker()]
> Unchanged in the voice pass — Lucy ("The Ancient One") narrates the Arcadium steps (15 cards, "Start with Citizens"), the Farmer narrates the Adventure steps (12 cards, "Start with Canals", card-type/icon steps). Identical text; see source.

---
---

# PART 14 — LEARNING CHECK (Focus Gate)

### Focus Gate — Overworld Prompts
[source: js/overworld.js → FOCUS_GATE_FIRST / FOCUS_GATE_AGAIN]
- Explorer (first): I'm losing my focus.
- Explorer (first): I think I need a learning check to keep going.
- Explorer (again): That place looks so cool.
- Explorer (again): If only there was a way to restore my focus.

*Staging: after the first-hit lines, a pulsing gold halo rises on the learning-check (book) button.*

### Learning Check — UI Strings & Question Bank
[source: js/sog-learning-check.js → STR / QUESTIONS]
> Unchanged in the voice pass — the 14 UI strings ("Learning Check", "Answer to restore focus:", "Out of Focus" gate, etc.) and the full 42-question bank (hunter-gatherers → Chaldeans; the correct answer is always listed FIRST in source and shuffled on screen). Identical text; see the source directly.

---
---

# APPENDIX A — Result Screens & Templated UI Strings

> Win/loss/tie scoreboards. Headline + templated score rows; each battle has its own copy.

- **Button convention (updated):** every post-game **WIN** scoreboard's exit button says **CONTINUE**; loss/tie scoreboards keep **BACK TO MAP**. PLAY AGAIN on a loss skips straight into the battle (all intros are seen-gated).
- **Gilgamesh** [_showResultPopup]: "VICTORY"/"DEFEAT"; rows "You: <IP>" / "Gilgamesh: <IP>"; badges YOU/GILGAMESH/TIE; "SHOW RESULTS"; "Click Here" portrait tag; "Turn <n> / 4".
- **Sargon** [_showResultScoreboard]: "VICTORY"/"A TIE"/"DEFEAT"; rows "You:"/"Sargon:"; badges YOU/SARGON/TIE. First win: victory sequence plays BEFORE the scoreboard.
- **Hammurabi** [_showResultScoreboard]: same pattern, badges YOU/HAMMURABI/TIE. First win: scoreboard FIRST, CONTINUE starts the victory sequence.
- **Nebuchadnezzar** [_showResultScoreboard, OPP_NAME/OPP_BADGE]: rows "You:"/"Nebuchadnezzar:"; badge "NEB". First win: victory sequence BEFORE the scoreboard (matches Sargon).
- **Gold reward label** (all bosses): "<amount> Gold" — 25 first win / 10 repeat.
- **Ötzi/Neanderthal** result screens are HTML-defined (index.html `adv-result-*` / `adv-otzi-result-*`); win screens use CONTINUE.

# APPENDIX B — Map Labels & Speaker Registry

- (exits): "To Egypt →", "To Mesopotamia →", "← To East Africa", "← To Egypt"
- (nodes): Prehistory · The Double Crown (Egypt) · Walls of Uruk · Mesopotamian Marketplace · Akkad (Sargon) · Babylon (Hammurabi) · The Hanging Gardens
- (regions): East Africa · Egypt · Mesopotamia
- Speaker ids: explorer, lucy, neanderthal, otzi, hunter, farmer, gilgamesh, sargon, hammurabi, nebuchadnezzar, trader. (In sog-adventure-gilgamesh.js the opponent bubble id is 'otzi' but the speaker is Gilgamesh.)

# APPENDIX C — Dynamic / Structural Notes (read before editing)

- **Placeholders** (`<river>`, `<IP>`, `<amount>`, `<playerTotal>`) are runtime values — edit around them.
- **Skip-gates**: every battle intro is seen-once (`sog_otzi_opening_seen`, `sog_gilgamesh_opening_seen`, `sog_sargon_opening_seen`, `sog_hammurabi_opening_seen`, `sog_hanging_gardens_battle_opening_seen`) — retries and re-entries go straight to the board. The Hammurabi/Neb overworld encounters also skip entirely once those battles are beaten.
- **Card-grant splits**: Lucy's goodbye (A → grant → B), Ötzi's win (dialogue → grant → token line), the Cuneiform intervention (A → grant → B), HG's win (dialogue → grant on the last line → gold → scoreboard), Hammurabi's win (scoreboard → CONTINUE → dialogue → gavel → grant → gold → closer).
- **Gavel beats** (Hammurabi opening): two staged beats synced to gavel.m4a's pounds at ~30ms/~520ms — tiles slam (no abilities), then abilities fall in. The animation anchors to the flagged lines (`slamBefore` / `revealBefore`) — keep those lines where the beats should land.
- **Music holds**: the Sargon node dust-storm and the Hammurabi earth-rise play against silence (map music fades out before, back in after).
- **Dead code**: overworld `D3_FARMER_POSTLOSS_A/B` are unreferenced (live copies in sog-adventure-gilgamesh.js, currently identical — edit the Gilgamesh ones).
- **HTML-defined text** (Part 1, legend titles, adv result screens) lives in `index.html`.
- Pure UI button labels (PLAY AGAIN, GAME BOARD, Next/Back/Close…) are excluded unless narrative.
