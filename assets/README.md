# Original game artwork

Created for this project with the built-in image generation tool. These are original
illustrations, not copied SOVL game artwork. Final game assets are WebP; the two sprite
atlases retain their transparent backgrounds. Sprite source rectangles are specified
in `js/visuals.js`; the renderer turns the downward-facing models to match unit facing.
Infantry and cavalry sprites represent each faction generally, rather than every named
equipment variant. Machines and monsters retain the existing native symbols.

| File | Use |
| --- | --- |
| `title-battle.webp` | Title screen, campaign atmosphere, battle briefs and results |
| `battlefield-ground.webp` | Clear overhead ground; all actual obstacles come from the battle state |
| `faction-portraits.webp` | Five faction illustrations in human/dwarf/elf/orc/undead order |
| `unit-sprites.webp` | Fallback infantry and mounted models, used only if the model painter fails |
| `terrain-sprites.webp` | Fallback terrain art, used only if the procedural painter fails |
| `music/trail-theme.mp3` | Menu and campaign theme (2:30) |
| `music/battle-theme.mp3` | Battle theme (2:30) |
| `sfx/` | Sound effects from 0 A.D. (CC BY-SA 3.0) and uisfx (CC0); see `sfx/CREDITS.md` |

## Prompt briefs

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

Both themes are original instrumental tracks composed for this project with ElevenLabs
Music (`eleven_music_v2_5`), 192 kbps MP3.

- **Trail theme:** Brooding dark-fantasy orchestral underscore. Low sustained strings and
  a soft cello melody over distant frame drums at a slow march, a lone horn call and sparse
  harp, rising slightly in the middle before settling back.
- **Battle theme:** Tense medieval battle underscore. Steady war drums and low ostinato
  strings in a minor key, brass swells, a martial snare and a bold horn theme, with a
  modest build in the middle.
