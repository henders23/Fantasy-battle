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

## Illustrated tactical edition

The title screen now opens on an original battlefield painting. **Take the field**
starts a prepared 488-point Border Guard army against a Greenskin warband; **Custom
battle** retains the full five-faction army builder. Armies are placed automatically
at deployment and can still be dragged, rotated, narrowed or widened before battle.

The battlefield includes painted infantry and cavalry miniatures, illustrated terrain,
readable regiment labels, an army selection strip and a collapsible battle chronicle.
The movement ghost shows the legal endpoint and its cost; the larger movement circle
is an upper bound before pivots and obstacles. Hovering over a charge target shows the
attack side and approximate wounds dealt/received. Estimates are advisory and do not
include every special effect.

Melee is now interactive: select an engagement on the battlefield or in the orders
panel, then choose **Fight this engagement**. Attacks within that engagement still roll
simultaneously under the original rules. The outcome appears over the battlefield with
casualties, combat score and morale; individual dice and saves are available in an
expandable section. A fight cannot be resolved twice, and the turn cannot end until all
engagements are complete. Engine consumers can omit `interactiveCombat` to retain the
original automatic simulation behavior.

The **Guide** explains each phase. **Settings** controls optional synthesized sound,
enemy action speed, motion and persistent unit labels. Sound is off initially and starts
only after it is enabled by the player. Settings and campaign saves stay on the device.
Layouts adapt to smaller screens; on phones, the orders panels appear below the field.

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
js/experience.js  title, onboarding, orders, interactive combat and accessibility
js/visuals.js     artwork, formation labels, previews and impact effects
css/experience.css illustrated edition theme and responsive layouts
assets/          original paintings, portraits and functional sprite atlases
test/sim.js       headless rules tests and AI-vs-AI simulations (node test/sim.js [games] [seed])
test/tactical.js  seeded automatic/manual combat equivalence and phase guards
test/interface.js DOM integration and native Canvas checks (optional test dependencies)
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
| F | fit the whole battlefield |
| ? / F1 | open the battle guide |
| Enter during Combat | resolve / acknowledge the selected engagement |
| Move / Pivot buttons | choose a ground-click order without a keyboard modifier |

## Tests

```
node test/sim.js 80          # rules unit tests + 80 simulated battles + campaign checks
node test/tactical.js        # 20 automatic/manual battles with matching seeded outcomes
python3 -m http.server 8123  # then, in another shell:
node test/browser.js http://127.0.0.1:8123/index.html
```

`test/interface.js` uses `linkedom` and `@napi-rs/canvas` as optional test-only
dependencies. It checks the quick-battle-to-result flow, all five faction deployments,
movement orders, repeated combat clicks, guide/settings, army building and campaign
saves without starting a browser. Set `SOVL_SHOTS` to an output directory to export the
native Canvas renders. These checks do not validate browser CSS layout. The existing
Playwright suites remain available for live browser testing and have been updated for
interactive melee.

Artwork provenance and the source prompts are recorded in `assets/README.md`.
