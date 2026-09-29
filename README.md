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

The battlefield includes painted miniatures on flocked movement trays, relief-painted terrain,
illustrated tokens for monsters, chariots and war machines, readable regiment labels, an army selection strip and a collapsible battle chronicle.
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

Terrain is painted procedurally for every piece. Each forest, swamp, lake, cliff and ruin
gets its own heightmap and colour map, lit by one sun from the upper left with cast shadows
and ambient occlusion, so no two pieces look alike and the art fills the piece's rules
footprint. Painting runs in a background worker and falls back to the page when workers are
unavailable. Hovering a piece shows its exact footprint and its rules. Regiments and tokens
cast shadows from the same sun.

Every regiment is painted model by model. Each faction and unit type has its own look:
Empire state troops with kite shields, halberds and handguns, bearded dwarves in bronze
helms, elves with crested silver helms and pennanted lances, green-skinned orcs and
eared goblins, skeletons, zombies and armoured wights. Weapons, shields and mounts
(horses, barded warhorses, boars, wolves, skeletal steeds) follow the unit's equipment,
and each front rank carries a standard and the commander where they fight. Models vary
slightly and are shaded by the same sun as the terrain. Sprites are cached in atlas sheets
at three resolutions, and each regiment is baked into one image that is redrawn only when
it loses models, changes formation or turns through the light.

Regiments move across the table instead of jumping. A move pivots first, then marches at
a pace set by the unit type: infantry step with a slight stride, cavalry trot faster, and
war machines trundle slowly. Moving units raise dust. Charges accelerate into contact and
hit with a burst of dust and sparks. The front ranks lunge forward and the target is
knocked back. Missiles fly from the shooters to their target, each drawn to suit its
weapon, with a shadow on the ground:

- arrows arc through the air;
- bolts fly flat;
- handgun shots leave tracers and muzzle smoke;
- cannonballs, mortar shells and thrown stones shake the field where they land;
- spears are thrown;
- fire and steam are sprayed;
- bombs are lobbed;
- magic flies as glowing orbs.

Hits and misses land where the dice say. In melee, sparks mark each blow along the contact
line. Saved wounds glance off shields, and failed saves spill blood (or bone dust from the
undead). Fallen models tip over, darken and fade, leaving a stain. Combat numbers pop and
rise over the field. Missiles and spells land before their damage shows: the target keeps
its models, its strength on the label, and its place on the table (even if the volley
destroys it) until the shot strikes.

Every spell starts with a rune circle glowing under the caster while motes spiral in. A
miscast collapses into violet lightning and smoke; a failed cast sputters out. Each spell
then looks different:

- Fireball: a roaring ball of flame that bursts, leaving fire and a scorch mark.
- Shadow Bolt: a dark orb ringed with light, trailing shadow.
- Reality Rift: a tear opens over the target, draws in the light and slams shut.
- Thousand Mouths: a swarm of snapping jaws.
- Plague: a slow green cloud full of flies.
- Hex Of Ruin: a sigil of ruin stamped over the target.
- Arcane Web: glowing threads shoot out and bind the target.
- Frost Ward: ice shards that burst into frost.
- Blessings: a beam of light to the unit and a pillar of light over it.
- Reanimate: soul wisps rise from the ground and pour into the unit.
- Raise Dead: a grave portal cracks the earth and the zombies climb out of it.

Lasting spells show on the unit until they end: a web over rooted troops, frost around a
frozen unit, a shimmering dome for Radiant Shield, mist for Shroud, burning front ranks for
Fiery Blades, a turning red sigil for Hex Of Ruin, a plague cloud, swirling leaves for
Wildform and glows for the other blessings. Commander abilities have their own rings,
steam or sparks. The **Motion** setting turns animation and effects off.

Two orchestral themes play in the background: a brooding march on the menus and the
campaign trail, and a battle theme on the field. They crossfade between screens and fade
at each loop. Browsers only allow audio after the first click or key press.

Battle sounds are recorded effects drawn from open libraries: sword clashes, spear
thrusts, shield blocks, bow releases, arrows in flight and striking home, handguns,
bolt throwers and stone throwers, marching feet, galloping horses, war horns and fanfares
from 0 A.D. (CC BY-SA 3.0), and interface sounds from uisfx (CC0). Each event picks the
sound that fits the unit's weapon and mount, with small variations in pitch and level.
Birdsong plays under the battle and wind over the campaign map. Dice are modelled as small
wooden cubes bouncing on a table. Clips are built from their sources by
`tools/build_sfx.py`; credits and licences are in `assets/sfx/CREDITS.md`.

The interface is set in Cinzel and Alegreya Sans, bundled with the game (SIL Open Font
License), so it looks the same offline. The title screen has drifting embers over the
painting and shows the saved campaign on its Continue card. In battle, the top bar tracks
the turn and the score, the unit profile highlights stats raised or lowered by effects,
ranks, veterancy or items, the army strip shows each regiment's painted model with a
strength bar, and dice show pips: gold for hits, green for saves, red for failed saves.

The army builder lays each section out as a grid of cards with the unit's painted model,
stats and options, and a points gauge that turns green near the limit and red over it.
Army entries show their model, and options are labelled fields. On the campaign screen the
top bar tracks progress through the act, the roster shows each unit's model, strength and
veterancy, and the log reads as a parchment chronicle. Battle briefings set the two armies
side by side with a points comparison; the merchant shows wares as cards with models or
icons; events appear as parchment scrolls; and camp, trait and run-over dialogs each have
their own look.

Deployment opens a muster dock beside the table. It shows the scenario, the turn limit, the
depth of the zones and the gap between the armies, and compares the two armies' points. A
checklist counts regiments in position. Each regiment card shows its painted model and
formation; the selected one gets frontage (−/+) and facing (Q/E) controls. The scouts' report
lists the enemy's regiments before they take the field. Auto-deploy and Begin Battle stay in
reach at the foot of the dock. On the table, each deployment zone is edged with a marked
front line and named, and the distance between the zones is measured at the side. Regiment
labels move above their unit or beside a neighbour's label instead of piling up.

When a battle ends, the verdict sweeps across the field, then the result screen opens:

- a Victory, Defeat or Draw banner with laurels and the reason the battle ended;
- both armies' scores, counting up, with a bar showing the balance;
- the enemy slain and broken, your own losses, and commanders slain on each side;
- a roll of both armies, one row per regiment with its model, remaining strength and fate
  (unscathed, holding, battered, routing, fled or destroyed, and any commander slain);
- in the campaign, the spoils or losses on a parchment panel.

The continue button stays in view however long the lists are.

The Trail of Death map is drawn as an old campaign chart: a parchment sheet with inked
woods, hills, marsh, mountains and a river that change with each act, a winding road
between the stops, wax-seal markers for each kind of stop, the route already marched in
red ink, and a banner where the army stands.

The **Guide** (the Guide button, or **?** in battle) walks through a first battle in five
illustrated steps: deploying, declaring charges, moving and shooting, fighting, and answering
a charge. It opens on the step for the current phase, and the arrow keys page through it.

**Settings** are grouped into sound, battle and motion cards:
- switches for battle sounds, music, and animation and effects;
- volume sliders from 0 to 100%, with a test sound for effects;
- choices for enemy action speed (with what each speed means) and for regiment labels;
- a link to restore the defaults.

Changes apply at once. Audio starts after the first click or key press. Settings and
campaign saves stay on the device.

The **Field Manual** on the title screen is a chaptered rulebook with a contents rail that
follows your place. It covers the game and turn structure (as phase cards), combat step by
step, shooting modifiers, magic with every spell and its casting value, terrain, dice colours,
controls as keycaps, the Trail of Death's map stops, and the five factions.
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
js/fx.js          battle animation and effects (tweens, strides, lunges, casualties, missiles, particles)
js/spellfx.js     spell effects (casting circles, per-spell missiles and impacts, auras, summoning)
js/ui.js          screens, input, campaign flow
js/experience.js  title, onboarding, orders, interactive combat and accessibility
js/visuals.js     artwork, formation labels, previews and impact effects
js/terrain.js     procedural relief terrain (heightmap, lighting, shadows), painted in a worker
js/tokens.js      painted tokens for monsters, chariots, the dreadnought and war machines
js/models.js      painted regiment models, movement trays and the regiment image cache
js/music.js       background music with crossfades
js/sfx.js         sound effects: clip player, event mapping, ambience and synthesised dice
js/campmap.js     the parchment campaign map
js/theme.js       title screen and battle panel dressing
css/theme.css     type, panels, title screen, dice and battle interface styles
js/screens.js     army builder and campaign screen dressing
css/screens.css   army builder, campaign screen and campaign dialog styles
js/fieldscreens.js deployment dock, zone markings, field verdict and battle result screen
css/fieldscreens.css deployment dock and battle result styles
js/helpscreens.js settings, battle guide and field manual
css/helpscreens.css settings, guide and field manual styles
tools/build_sfx.py builds assets/sfx from the 0 A.D. and uisfx libraries
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
