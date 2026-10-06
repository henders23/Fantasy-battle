# Original game artwork

Created for this project with the built-in image generation tool. These are original
illustrations, not copied SOVL game artwork. Final game assets are WebP. The five realistic
unit atlases retain transparent backgrounds and cover all 81 named definitions, including
commanders, mounts, monsters and machines. Source rectangles and ID mappings are in
`js/realistic-art.js`; companion JSON files record the prepared atlas bounds. They use one
primary pose per named unit; equipment upgrades retain that unit's illustration. Generated
figures were cropped, alpha-trimmed and packed into regular 1600 × 1280 atlases. Older generic
sprites in `js/visuals.js` and the procedural model painter remain as loading fallbacks.

| File | Use |
| --- | --- |
| `title-battle.webp` | Title screen, campaign atmosphere, battle briefs and results |
| `battlefield-ground.webp` | Clear overhead ground; all actual obstacles come from the battle state |
| `faction-portraits.webp` | Five faction illustrations in human/dwarf/elf/orc/undead order |
| `units/empire.webp`, `units/dwarves.webp`, `units/elves.webp`, `units/orcs.webp`, `units/undead.webp` | Dedicated realistic unit sprites, commanders and faction standards |
| `campaign/borderlands.webp` | Forested valley and northern fortress, Act I |
| `campaign/sunlands.webp` | Savannah, desert, canyons and oasis, Act II |
| `campaign/ashlands.webp` | Volcanic wastes and a distant citadel, Act III |
| `unit-sprites.webp` | Fallback infantry and mounted models, used only if the model painter fails |
| `terrain-sprites.webp` | Fallback terrain art, used only if the procedural painter fails |
| `music/trail-theme.mp3` | Menu and campaign theme (2:30) |
| `music/battle-the-frame.mp3` | Battle music: "The Frame" by Drbeat (3:40), supplied by the project owner |
| `fonts/` | Marcellus SC, Barlow and Barlow Semi Condensed (Latin subsets, SIL Open Font License; licences alongside), from the @fontsource npm packages |
| `sfx/` | Sound effects from 0 A.D. (CC BY-SA 3.0) and uisfx (CC0); see `sfx/CREDITS.md` |

## Prompt briefs

- **Realistic unit atlases:** One faction per transparent five-column, four-row sheet.
  Full bodies and equipment, realistic proportions and anatomy, weathered steel, cloth,
  leather and natural creature textures. Consistent elevated tabletop view and soft light,
  with separated silhouettes and no bases, text, labels or background. Each slot specifies
  its named unit, weapon, armour, mount or machine; spare slots provide standard bearers
  and veterans. Human steel and blue cloth; dwarven iron, bronze and russet; elven silver
  and teal; scarred orc iron and red; corroded undead armour and violet standards.
- **Borderlands landscape:** A tall cinematic fantasy campaign landscape, viewed from
  above, with a wooded valley, meandering river, rolling plains and a distant mountain
  fortress. Atmospheric depth, natural terrain, restrained blue-green shadows and warm
  sunlight. No routes, labels, units, icons or UI; these are drawn interactively in game.
- **Sunlands landscape:** A tall elevated campaign vista transitioning from golden
  savannah into pale dunes, sandstone canyons, a turquoise oasis and a distant desert
  citadel. Detailed natural terrain and warm late-afternoon light; no text or markers.
- **Ashlands landscape:** A tall dramatic campaign vista of barren red badlands and
  black volcanic ridges, smoke and ember light, rising toward a distant dark fortress.
  Realistic geological texture and atmospheric depth; no routes, text, markers or UI.

- **Title:** A wide, cinematic dark fantasy painting. A human commander in dark plate
  and a torn blue banner occupies the right third, surveying armies beneath a burning
  citadel, storm clouds and mountains. Dark negative space on the left for live title
  and menu controls. Storm-blue shadows, brass and ember light. No text or logos.
- **Ground:** A 3:2 straight-overhead orthographic grassland texture with desaturated
  greens, dry ochre paths, sparse tufts and gravel. Clear playable space; no trees,
  buildings, lakes, raised ground, units, grid, text or UI.
- **Portraits:** Five adjacent equal panels, showing a blue-steel human knight, a
  copper-armoured dwarf, a silver-and-teal elf, a green orc in battered iron with red
  accents, and a skeletal king in tarnished plate with violet light. Detailed heads and
  armour, consistent dark painted fantasy lighting. No labels or frames.
- **Models:** A transparent five-column, two-row atlas of overhead fantasy miniatures.
  Each column is one faction. Infantry above; human horse, dwarf ram, elven horse,
  orc boar and skeletal cavalry below. Clear silhouettes and transparent margins;
  no bases, background, labels or grid. Actual generated bounds are used rather than
  assuming perfectly even cells.
- **Terrain:** A transparent strip of overhead painted objects: dense forest cluster,
  rock outcrop, ruined stone building, small blue lake with reed-lined rocky banks, and
  dark marsh pools and reeds. Muted greens and ochres; no background, labels or grid.

## Music

The trail theme is an original instrumental track composed for this project with ElevenLabs
Music (`eleven_music_v2_5`), 192 kbps MP3. The battle music is "The Frame" by Drbeat, a file
supplied by the project owner.

- **Trail theme:** Brooding dark-fantasy orchestral underscore. Low sustained strings and
  a soft cello melody over distant frame drums at a slow march, a lone horn call and sparse
  harp, rising slightly in the middle before settling back.
- **Battle music:** "The Frame" by Drbeat, played on the battlefield; it loops with a short
  fade at each end.
