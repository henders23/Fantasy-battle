# Fantasy Battle

A turn-based rank-and-flank fantasy wargame for the browser, built on the open SOVL
ruleset by Dalen Studios. It runs entirely in the browser with no build step and no
server: open `index.html` (or serve the folder statically) and play. Every attack, save,
break test and flight move is rolled by hand: the dice appear on the battlefield and you
click to roll them.

Two modes:

- **Skirmish** — build a 500 / 1000 / 1500 point army from one of five factions in the
  army builder, then fight the AI in a Pitched Battle, a Meeting Engagement (deep
  deployment zones only 12" apart) or the Scoring Objectives scenario. Choose **Second
  player (hot seat)** as the opponent to play a friend on the same screen instead.
- **Trail of Death** — a three-act roguelite campaign at one of three difficulties. Start
  with a commander, a small retinue and two supporting units, pick a path across a
  branching map of battles, elite battles, events, merchants, camps and treasure, recruit,
  reinforce and re-arm, earn veterancy, learn commander traits, and defeat each act's
  boss. Each act is a web of 20-30 stops over 8-10 steps (three ways to begin, up to four
  stops a step, roads that split, cross and merge), so there are hundreds of routes to each
  boss. The choices vary: the stops on offer at each step are all different kinds, a shop,
  camp, treasure or event never follows another of its kind along a road, every middle step
  offers a fight, and the step before each boss offers a camp or a merchant. The map closes
  up to fit the window. Battles along the trail use all three scenarios.
  On Recruit and Veteran a lost battle is a costly retreat (no plunder, a fifth of the gold
  lost) and a fallen commander is carried off wounded; losing to a boss ends the run. On
  Legend any lost battle or a fallen commander ends it. The run-over screen lists every
  battle fought and each unit's honours (battles fought and enemy models slain). Progress
  is saved in the browser.

## Illustrated tactical edition

The title screen now opens on an original battlefield painting. **Take the field**
starts a prepared 488-point Border Guard army against a Greenskin warband; **Custom
battle** retains the full five-faction army builder. Armies are placed automatically
at deployment and can still be dragged, rotated, narrowed or widened before battle.

The battlefield includes realistic miniature sprites on flocked movement trays, relief-painted terrain,
individual artwork for monsters, chariots and war machines, readable regiment labels, an army selection strip and a collapsible battle chronicle.
The movement ghost shows the legal endpoint and its cost; the larger movement circle
is an upper bound before pivots and obstacles. Hovering over a charge target shows the
attack side and approximate wounds dealt/received. Estimates are advisory and do not
include every special effect.

When the Combat Phase opens, or you choose an engagement, the camera glides in close to the
fight and eases back out to the whole table when the fighting is done. Scrolling or dragging
takes the camera back at any time.

Unit names are coloured by side wherever they are written: blue for yours, red for the
enemy's. This covers the chronicle, the dice panel, the engagement panel and its result, and
the labels on the table. So when both armies field the same unit ("Imperial Sword I attacks
Imperial Sword I"), you can still tell which is which. The engine records which units each
chronicle line mentions, in order, so identical names are told apart correctly.

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

All 81 named unit definitions across the five factions now have dedicated realistic
miniature artwork: natural proportions, worn steel, cloth, leather and detailed mounts.
This includes commanders, dragons, giants, artillery and the dreadnought. Front ranks carry
faction standards and their commander. The same sprites appear in the builder, roster and
selected-unit panel. They are cached at three resolutions, and each stationary regiment is
baked into one image; animated models retain their strides and combat poses. The procedural
painter remains a fallback if an image cannot load. Asset mappings and provenance are in
`js/realistic-art.js` and `assets/README.md`.

The campaign now crosses six battlefield environments: wooded borderlands, golden plains,
sand dunes, an oasis, red badlands and ashen ruins. Later acts introduce the desert and
volcanic regions. Each has its own ground palette and terrain layout, stable across reloads;
meeting engagements keep their deeper deployment zones clear. Dunes, scrub and scree slow
movement without blocking sight. Map nodes and battle briefings identify the battlefield.

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
Wind blows over the campaign map; the battlefield has no ambient bed, so the fighting is heard
clearly. Buttons, cards and map stops all answer with the same crisp mouse click, and dialogs open
and close silently. A blocked unit selection keeps its visible hint but has no error sound;
the old error clip and its playback hooks have been removed entirely. Dice are modelled as small
wooden cubes bouncing on a table. Clips are built from their sources by
`tools/build_sfx.py`; credits and licences are in `assets/sfx/CREDITS.md`.

The interface uses the Moonsteel theme: blue-black steel with silver and ice-blue highlights,
set in Marcellus SC, Barlow and Barlow Semi Condensed, bundled with the game (SIL Open Font
License), so it looks the same offline. The title screen has drifting embers over the
painting and shows the saved campaign on its Continue card. In battle, the top bar tracks
the turn and the score, the unit profile highlights stats raised or lowered by effects,
ranks, veterancy or items, the army strip shows each regiment's painted model with a
strength bar, and dice show pips: gold for hits, green for saves, red for failed saves.

The army builder lays each section out as a grid of cards with the unit's painted model,
stats and options, and a points gauge that turns green near the limit and red over it.
Each army entry folds to one line (its model, how it is equipped and its points), so the
whole army stays in view; click an entry to open its options, one at a time. On the campaign screen the
top bar tracks progress through the act, the roster shows each unit's model, strength and
veterancy, and the log reads as a parchment chronicle. Battle briefings set the two armies
side by side with a points comparison, and trait and run-over dialogs each have their own
look.

Events read as a page of the campaign chronicle. The page shows:

- an engraved emblem for the kind of encounter and the act it happens in;
- the story, with a drop capital;
- each choice as a card with tags for what it costs and brings (gold, a battle and its
  reward, recruits, relics, veterancy, discipline, losses);
- "You need X more gold" when you can't afford a choice.

The outcome is written up line by line on the same page, with your purse.

Treasure opens a chest in the dark: the lid lifts, light and sparks spill out, and the find
appears. Gold shows as a large number with the new purse. A relic shows as a card with its
effect, who now carries it and what it replaced.

The merchant's wagon splits its business into three tabs:

- **Wares:** recruits show their painted model and stat profile; relics and banners show
  their effect.
- **Reinforce:** each unit's strength, with +1 and fill-to-full buttons.
- **Re-arm:** options grouped by regiment, each saying what the weapon or upgrade does.

Before you pay, a ware says why it can't be used (no commander magic, no unit able to carry a
banner, the army already at its limit for that section), how much more gold you need, or what
it would replace. The purse, a note on the last purchase and the Leave button stay in view.

Every camp restores surviving regiments to their previous strength (at least their starting
size, within unit limits) and gives 50 / 75 / 100 gold in Acts I / II / III. Choose one extra benefit:

- **Reinforce:** recruit up to half each regiment's starting size, within its unit limit.
- **Drill:** promote a chosen unit by one veterancy rank, up to rank three.
- **Supplies:** take extra gold, for a total of 125 / 175 / 225 gold by act.

The firelit camp previews the exact changes and reports them at dawn. Rewards can only be
claimed once; reloading an unclaimed camp resumes its choices. Existing campaigns keep their
routes and saved armies.

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

The Trail of Death map spans three original landscape paintings: a forested borderland
valley, the savannah and desert of the Sunken Marches, and a volcanic citadel beneath the
Ashen Crown. Winding routes, glowing available stops, a blue travelled path and the army's
banner sit over the landscape. Reachable stops remain keyboard accessible and the map
adapts to phone screens. The Motion setting also controls its animated highlights.

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

**Battles are saved as you play.** Whenever no dice are waiting to be rolled, the battle is
saved in the browser. Closing the tab or reloading loses nothing: a skirmish, quick or
hot-seat battle comes back as **Resume battle** on the title screen, and a campaign battle
picks up where it stood when the campaign is continued, instead of being fought again.
A finished or abandoned battle clears its save.

**Line of sight preview.** With one of your regiments selected, point at an enemy to see the
line the rules use, from your front to the target (or to the side it would hit, in the
Charge Phase). A clear line is drawn in green; a line cut by terrain turns red at the
blocking piece, which is outlined. Cover the target stands in is outlined in amber. A tag on
the line gives the verdict from the game's own checks: the roll needed to hit with its
modifiers, the charge distance against the charge range, or why the target can't be chosen.

**Hot seat.** In Custom battle, set *Play against* to *Second player (hot seat)* and name
both players. Each builds an army in turn. Player 1 deploys first and hands over; player 2
then deploys without seeing player 1's line. During the battle, control passes to whoever
is to move, at every charge declaration, reaction and activation, with a banner naming the
player. Player 1's army is always blue and player 2's red. Combat dice are rolled at the shared
screen, and a hot-seat battle can be saved and resumed like any other.

The **Field Manual** on the title screen is a chaptered rulebook with a contents rail that
follows your place. It covers the game and turn structure (as phase cards), combat step by
step, shooting modifiers, magic with every spell and its casting value, terrain, dice colours,
controls as keycaps, the Trail of Death's map stops, and the five factions.
Layouts adapt to smaller screens. On laptop-sized windows the bars around the battlefield
slim down so the field stays as large as possible; on phones, the orders panels appear below the field.

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
js/models.js      regiment sprites, procedural fallback, movement trays and image cache
js/realistic-art.js named unit-to-atlas mappings and sprite loading
js/biomes.js      campaign battlefield selection and deterministic terrain layouts
js/biome-art.js   ground textures for campaign biomes
js/music.js       background music with crossfades
js/sfx.js         sound effects: clip player, event mapping, ambience and synthesised dice
js/campmap.js     illustrated campaign world map
css/campaign-world.css landscape map, unit portraits and expanded camp styles
js/theme.js       title screen and battle panel dressing
css/theme.css     type, panels, title screen, dice and battle interface styles
js/screens.js     army builder and campaign screen dressing
css/screens.css   army builder, campaign screen and campaign dialog styles
js/fieldscreens.js deployment dock, zone markings, field verdict and battle result screen
css/fieldscreens.css deployment dock and battle result styles
js/helpscreens.js settings, battle guide and field manual
css/helpscreens.css settings, guide and field manual styles
js/campscreens.js  merchant and camp
css/campscreens.css merchant and camp styles
js/talescreens.js  campaign events and treasure
css/talescreens.css event and treasure styles
js/command.js      combat camera, side-coloured unit names, Enter to move on to the next regiment
css/command.css    side colours for unit names, hot-seat handover banner
css/laptop.css     compact layouts for laptop windows: battlefield, title, builder, campaign, dialogs
js/battlesave.js   mid-battle save and resume (snapshots at rest, restore, title-screen card)
js/sightline.js    line of sight, cover and target verdict preview
js/hotseat.js      two players on one screen: setup, deployment handover, control follows the mover
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
test/expansion.js camp rewards, repeat claims, legacy saves and seeded terrain layouts
test/expansion-browser.js unit art, sound removal, world maps, camp choices and mobile layout
test/save.js      saved and restored battles play out identically (node test/save.js [games] [seed])
test/hotseat-browser.js a whole hot-seat battle with handovers, resume and result
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
| Space / Enter | roll the dice when a roll is waiting; otherwise end activation / pass. After Enter, your next ready regiment is brought up when your turn returns: move it, press Enter again to skip on, or click another regiment instead |
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
node test/sim.js 80          # rules unit tests + 80 simulated battles + campaign and map checks
node test/tactical.js        # 20 automatic/manual battles with matching seeded outcomes
node test/expansion.js       # campaign rewards, terrain and removed sound contracts
node test/save.js 12         # 12 battles saved and restored after every step, unchanged
python3 -m http.server 8123  # then, in another shell:
node test/browser.js http://127.0.0.1:8123/index.html
node test/interact.js
node test/features.js
node test/expansion-browser.js http://127.0.0.1:8123/index.html
node test/hotseat-browser.js http://127.0.0.1:8123/index.html
```

`test/interface.js` uses `linkedom` and `@napi-rs/canvas` as optional test-only
dependencies. It checks the quick-battle-to-result flow, all five faction deployments,
movement orders, repeated combat clicks, guide/settings, army building and campaign
saves without starting a browser. Set `SOVL_SHOTS` to an output directory to export the
native Canvas renders. These checks do not validate browser CSS layout. The existing
Playwright suites remain available for live browser testing and have been updated for
interactive melee.

Browser tests require Playwright and Chromium. Set `CHROMIUM_PATH` to use an installed
Chromium executable; `test/expansion-browser.js` accepts an optional screenshot directory
after its URL.

Artwork provenance and the source prompts are recorded in `assets/README.md`.
