# Fantasy Battle

A turn-based rank-and-flank fantasy wargame for the browser, built on the open SOVL
ruleset by Dalen Studios. It runs entirely in the browser with no build step and no
server: open `index.html` (or serve the folder statically) and play. Every attack, save,
break test and flight move is rolled by hand: the dice appear on the battlefield and you
click to roll them.

Two modes:

- **Skirmish** — build a 500 / 1000 / 1500 point army from one of five factions in the
  army builder, then fight the AI in a Pitched Battle, a Meeting Engagement (deep
  deployment zones only 12" apart) or the Scoring Objectives scenario.
- **Trail of Death** — a three-act roguelite campaign at one of three difficulties. Start
  with a commander, a small retinue and two supporting units, pick a path across a
  branching map of battles, elite battles, events, merchants, camps and treasure, recruit,
  reinforce and re-arm, earn veterancy, learn commander traits, and defeat each act's
  boss. Battles along the trail use all three scenarios. A lost battle or a dead commander
  ends the run, and the run-over screen lists every battle fought and each unit's honours
  (battles fought and enemy models slain). Progress is saved in the browser.

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

Melee is interactive: select an engagement on the battlefield or in the orders panel,
then choose **Fight this engagement**. Every roll in that fight is yours to make: the
attack dice, the armour saves, the break tests and any flight moves appear in the dice
panel and wait for a click (or Space). Attacks within an engagement still count as
simultaneous under the original rules. The outcome then appears over the battlefield with
casualties, combat score and morale. A fight cannot be resolved twice, and the turn cannot
end until all engagements are complete. Shooting, spells and rallies in the strategic
phase are rolled the same way; the enemy's own rolls are shown as they happen. Engine
consumers can omit `interactive` and `interactiveCombat` to keep the original automatic
simulation behaviour.

During movement a gold handle sits in front of the selected regiment: drag it to turn the
regiment freely (in deployment and in the Strategic Phase, where pivots still cost
movement). **Z** or the Undo button takes back the moves and pivots of the current
activation, as long as the unit has not yet shot, cast or used an ability, and **Face**
buttons pivot toward the nearest enemies. When the enemy declares a charge against one of
your regiments a prompt appears over the field offering the counter-charge, flee or hold
reactions.

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
not defined in the public rules text; this game designs them to match the names used in
the source lists. All artwork is original.

## Layout

```
index.html        the game shell
css/sovl.css      styling
js/data.js        rules tables: unit types, weapons, properties, spells, items, traits, scenarios, campaign data
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
test/interact.js  Playwright interaction test of orders, dice and engagements
test/features.js  Playwright test of scenarios, the rotation handle, undo, charge reactions,
                  difficulty, traits, honours and re-arming
```

## Controls

| Input | Action |
| --- | --- |
| Click a unit | select / activate it (Strategic Phase) |
| Click the ground | pivot toward the point and advance |
| Shift + click | pivot only |
| Q / E | pivot 45° left / right |
| Drag the gold handle | turn the selected unit freely |
| Z | undo the moves and pivots of the current activation |
| Space / Enter | roll the dice when a roll is waiting; otherwise end activation / pass |
| X, Shift + X | show charge arcs / weapon ranges |
| Mouse wheel, right-drag | zoom and pan |
| Esc | cancel targeting |
| F | fit the whole battlefield |
| ? / F1 | open the battle guide |
| Enter during Combat | resolve / acknowledge the selected engagement |
| Move / Pivot buttons | choose a ground-click order without a keyboard modifier |

## AI

The AI assigns each unit a role (line, flanker, shooter, skirmisher, artillery, monster)
and moves by role: the line advances together and screens threatened shooters, flankers
work round exposed flanks, shooters keep their distance and creep forward for a shot.
Charge scoring rewards gang-ups on units already engaged and penalises charges that would
lose to the enemy's rank bonus, counter-charges are only declared when they improve on
standing, and spells are weighted by the target's value and situation. Against the
previous opponent it wins about 55% of seeded head-to-head games
(150 games, mixed factions and sizes).

## Tests

```
node test/sim.js 80          # rules unit tests + 80 simulated battles + campaign checks
node test/tactical.js        # 20 automatic/manual battles with matching seeded outcomes
python3 -m http.server 8123  # then, in another shell:
node test/browser.js http://127.0.0.1:8123/index.html
node test/interact.js
node test/features.js
```

`test/interface.js` uses `linkedom` and `@napi-rs/canvas` as optional test-only
dependencies. It checks the quick-battle-to-result flow, all five faction deployments,
movement orders, repeated combat clicks, guide/settings, army building and campaign
saves without starting a browser. Set `SOVL_SHOTS` to an output directory to export the
native Canvas renders. These checks do not validate browser CSS layout. The existing
Playwright suites remain available for live browser testing and have been updated for
interactive melee.

Artwork provenance and the source prompts are recorded in `assets/README.md`.
