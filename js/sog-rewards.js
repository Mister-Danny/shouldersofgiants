/**
 * sog-rewards.js — Two-tier boss win-reward economy (gold + card gating)
 *
 * The single decision point for "what does THIS boss win pay out?", so all five
 * boss modules gate identically instead of each re-deriving it. Adapts (does not
 * replace) the existing per-boss reward flow: each boss still plays its own gold
 * animation / card-acquisition; this module only decides the AMOUNTS and whether
 * the card drops.
 *
 * Rules (two-tier system):
 *   • 15 gold on the FIRST win of a tier (serf OR giant), keyed per node+tier.
 *   • 0 gold on any replay of an already-beaten tier (anti-farming).
 *   • The boss's CARD drops on the FIRST GIANT win only (never on serf).
 *   → each boss = 30 gold total (15 serf + 15 giant) + 1 card.
 *
 * Gating source: the per-node beaten state (sog_node_<hook>_<tier>_beaten) the
 * flag/stamp system already persists. game.js endGame stamps that key on a win —
 * but it does so BEFORE the outcome hook fires, so by the time a boss's onWin
 * runs the flag already reads true. To capture the PRIOR state, game.js snapshots
 * "was this tier already beaten" at stamp time into window.__pendingReward; this
 * module consumes that one-shot. Persistence + un-farmability therefore ride
 * entirely on the (already reload-safe) beaten state.
 */
window.SOG = window.SOG || {};
SOG.rewards = (function () {
  'use strict';

  var GOLD_PER_TIER = 15;

  /* Consume the one-shot reward descriptor game.js staged for the win that just
     completed. Returns { firstTierWin, tier, gold, grantCard }.
       firstTierWin — first time this node+tier was beaten (→ pays gold)
       grantCard    — firstTierWin AND tier === 'giant' (→ drops the boss card)
     If no descriptor matches `hook` (non-tiered battle, dev path, double-consume),
     returns a zero reward so nothing is granted or double-granted. */
  function consume(hook) {
    var p = window.__pendingReward;
    window.__pendingReward = null;                     // one-shot
    if (!p || p.hook !== hook) {
      return { firstTierWin: false, tier: null, gold: 0, grantCard: false };
    }
    var first = !!p.firstTierWin;
    return {
      firstTierWin: first,
      tier:         p.tier || null,
      gold:         first ? GOLD_PER_TIER : 0,
      grantCard:    first && p.tier === 'giant'
    };
  }

  return {
    GOLD_PER_TIER: GOLD_PER_TIER,
    consume:       consume
  };
})();
