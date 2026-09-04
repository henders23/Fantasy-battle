# SOVL — Fantasy Warfare (browser replica)

An unofficial, fan-made browser re-implementation of **SOVL: Fantasy Warfare**, the
turn-based rank-and-flank fantasy wargame by Dalen Studios. It runs entirely in the
browser with no build step and no server: open `index.html` (or serve the folder
statically) and play.

Two modes:

- **Skirmish** — build a 500 / 1000 / 1500 point army from one of five factions in the
  army builder, then fight the AI in a Pitched Battle or the Scoring Objectives scenario.
- **Trail of Death** — a three-act roguelite campaign. Start with a commander, a small
  retinue and two supporting units, pick a path across a branching map of battles, elite
  battles, events, merchants, camps and treasure, recruit and reinforce, earn veterancy,
  and defeat each act's boss. A lost battle or a dead commander ends the run. Progress is
  saved in the browser.

## Rules

The battle rules follow the public SOVL rules document
([Perwahl/SOVLRules](https://github.com/Perwahl/SOVLRules)):

- Alternating activations across the **Charge**, **Strategic** and **Combat** phases,
  eight turns, victory by rout or on points.
- Charges need range, the 45° front arc and line of sight; charge sides (front, flank,
  rear), counter charges, charge intercepts and fleeing from charges.
- Movement as advances and pivots with per-type pivot costs, difficult and impassable
  terrain, line-of-sight-blocking terrain.
- Ranged attacks with Skill, long range and cover modifiers.
- Combat with front-rank and supporting attacks, Skill-vs-Skill hit rolls, Power-vs-Defense
  damage saves, combat score with flank and rear bonuses, break tests with rank bonus and
  flight moves, plus every weapon set and unit property in the source lists.
- All five faction source lists (Empires of Men, Dwarf Holds, Elven Conclaves, Greenskin
  Tribes, Dead Nations) with their stats, costs, unit sizes, equipment options, retinues,
  spell lists and section limits.

Spells, magic items, magic banners, the heavy-casualty test and the campaign structure are
not defined in the public rules text; this replica designs them to match the names used in
the source lists. All artwork is original.

## Layout

```
index.html        the game shell
css/sovl.css      styling
js/data.js        rules tables: unit types, weapons, properties, spells, items, campaign data
js/data_units.js  the five faction source lists (generated from the rules repo)
js/geom.js        oriented-rectangle geometry
js/rules.js       dice and the hit / save / discipline tables
js/battle.js      the battle engine (state machine, no DOM)
js/army.js        army costs, validation, random armies, terrain generation
js/ai.js          the AI opponent
js/campaign.js    Trail of Death campaign model
js/render.js      canvas renderer
js/ui.js          screens, input, campaign flow
test/sim.js       headless rules tests and AI-vs-AI simulations (node test/sim.js [games] [seed])
test/browser.js   Playwright smoke test through both modes (node test/browser.js [url])
```

## Controls

| Input | Action |
| --- | --- |
| Click a unit | select / activate it (Strategic Phase) |
| Click the ground | pivot toward the point and advance |
| Shift + click | pivot only |
| Q / E | pivot 45° left / right |
| Enter | end activation / pass |
| X, Shift + X | show charge arcs / weapon ranges |
| Mouse wheel, right-drag | zoom and pan |
| Esc | cancel targeting |

## Tests

```
node test/sim.js 80          # rules unit tests + 80 simulated battles + campaign checks
python3 -m http.server 8123  # then, in another shell:
node test/browser.js http://127.0.0.1:8123/index.html
```
