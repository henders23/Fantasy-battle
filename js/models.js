// Painted models for regiments: infantry, cavalry, hounds and monstrous infantry, plus lone
// commanders. Each model is drawn top-down (forward is up, -y) with its race, armour, weapon,
// shield and mount, lit by the same upper-left sun as the terrain. A model is painted once
// into a small cached image per unit, role, variant and light direction, then stamped with a
// little jitter so ranks look like troops rather than a grid of tiles.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.Renderer) return;
  var P = SOVL.Renderer.prototype, previous = P.drawModelSprite;
  var SUN = Math.atan2(-0.763, -0.646), LEVELS = [24, 48, 96]; // sprite resolutions, pixels per inch
  var cache = {}, cacheCount = 0; // key -> sprite slot in an atlas sheet
  var c = null, L = { x: 0, y: 0 }; // canvas being painted and the sun in model space

  // ---------- painting helpers (inch units, model space) ----------
  function css(col, k, a) {
    k = k == null ? 1 : k;
    var v = [0, 1, 2].map(function (i) { return Math.round(Math.max(0, Math.min(1, col[i] * k)) * 255); });
    return a == null ? "rgb(" + v.join(",") + ")" : "rgba(" + v.join(",") + "," + a + ")";
  }
  function tint(col, k) { return [col[0] * k, col[1] * k, col[2] * k]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function lit(path, col, cx, cy, r, edge) {
    var g = c.createRadialGradient(cx + L.x * r * 0.5, cy + L.y * r * 0.5, r * 0.05, cx, cy, r * 1.12);
    g.addColorStop(0, css(col, 1.38)); g.addColorStop(0.5, css(col, 1)); g.addColorStop(1, css(col, 0.52));
    c.beginPath(); path(); c.fillStyle = g; c.fill();
    if (edge !== false) { c.lineWidth = 0.014; c.strokeStyle = "rgba(12,9,6,0.6)"; c.stroke(); }
  }
  function ball(x, y, rx, ry, col, rot) { lit(function () { c.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); }, col, x, y, Math.max(rx, ry)); }
  function poly(pts, col, cx, cy, r) { lit(function () { c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }, col, cx, cy, r); }
  function stick(x0, y0, x1, y1, w, col) {
    c.save(); c.lineCap = "round";
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.strokeStyle = "rgba(12,9,6,0.7)"; c.lineWidth = w + 0.018; c.stroke();
    c.strokeStyle = css(col, 0.9); c.lineWidth = w; c.stroke();
    c.translate(L.x * w * 0.2, L.y * w * 0.2); c.strokeStyle = css(col, 1.45, 0.75); c.lineWidth = w * 0.35; c.stroke();
    c.restore();
  }
  function limb(pts, w, col) {
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.strokeStyle = "rgba(12,9,6,0.62)"; c.lineWidth = w + 0.02; c.stroke();
    c.strokeStyle = css(col, 0.88); c.lineWidth = w; c.stroke();
    c.translate(L.x * w * 0.18, L.y * w * 0.18); c.strokeStyle = css(col, 1.3, 0.8); c.lineWidth = w * 0.4; c.stroke();
    c.restore();
  }
  function blade(x0, y0, x1, y1, w, col) { // a flat blade: bright edge toward the sun
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len * w / 2, ny = dx / len * w / 2;
    c.beginPath(); c.moveTo(x0 + nx, y0 + ny); c.lineTo(x1 + nx * 0.3, y1 + ny * 0.3); c.lineTo(x1 + dx / len * w * 0.8, y1 + dy / len * w * 0.8); c.lineTo(x1 - nx * 0.3, y1 - ny * 0.3); c.lineTo(x0 - nx, y0 - ny); c.closePath();
    var g = c.createLinearGradient(x0 - nx, y0 - ny, x0 + nx, y0 + ny), side = nx * L.x + ny * L.y > 0;
    g.addColorStop(0, css(col, side ? 0.6 : 1.5)); g.addColorStop(0.5, css(col, 1)); g.addColorStop(1, css(col, side ? 1.5 : 0.6));
    c.fillStyle = g; c.fill(); c.lineWidth = 0.01; c.strokeStyle = "rgba(12,9,6,0.7)"; c.stroke();
  }
  function shadow(x, y, rx, ry) {
    var sx = x - L.x * 0.05, sy = y - L.y * 0.05, g = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(rx, ry));
    g.addColorStop(0, "rgba(0,0,0,0.42)"); g.addColorStop(0.6, "rgba(0,0,0,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.save(); c.translate(sx, sy); c.scale(1, ry / rx); c.translate(-sx, -sy);
    c.fillStyle = g; c.beginPath(); c.arc(sx, sy, rx, 0, 6.2832); c.fill(); c.restore();
  }

  // ---------- palettes ----------
  var STEEL = [0.64, 0.66, 0.7], IRON = [0.36, 0.37, 0.4], BRONZE = [0.68, 0.49, 0.24], GOLD = [0.86, 0.68, 0.28], SILVER = [0.8, 0.82, 0.86];
  var WOOD = [0.46, 0.32, 0.18], LEATHER = [0.4, 0.27, 0.16], BONE = [0.84, 0.8, 0.68], RUST = [0.47, 0.33, 0.22];
  var HAIR = { dwarf: [[0.66, 0.32, 0.14], [0.36, 0.22, 0.12], [0.7, 0.68, 0.64], [0.78, 0.62, 0.32]], elf: [[0.9, 0.84, 0.62], [0.85, 0.86, 0.88], [0.62, 0.42, 0.2]], human: [[0.36, 0.24, 0.14], [0.55, 0.4, 0.22], [0.2, 0.15, 0.1]] };
  var SKIN = { human: [[0.86, 0.66, 0.52], [0.76, 0.56, 0.42], [0.62, 0.44, 0.32]], dwarf: [[0.84, 0.64, 0.5]], elf: [[0.9, 0.78, 0.66]], orc: [[0.38, 0.52, 0.24], [0.34, 0.47, 0.22], [0.42, 0.5, 0.26]], goblin: [[0.46, 0.6, 0.28], [0.52, 0.62, 0.3]], zombie: [[0.55, 0.6, 0.47], [0.5, 0.52, 0.45]], vampire: [[0.88, 0.86, 0.84]] };

  function has(u, p) { return SOVL.hasProp(u, p); }
  // Work out how a unit's models look: race, colours, armour, headgear and gear.
  function lookOf(u, cmd) {
    var id = cmd ? cmd.def.id : u.id, f = u.faction, heavy = cmd ? cmd.props.indexOf("Heavy Armor") >= 0 : has(u, "Heavy Armor") || has(u, "Masterwork Armor");
    var weapon = cmd ? cmd.weapon : u.weapon, ranged = cmd ? cmd.ranged : u.ranged;
    var k = { race: "human", cloth: [0.3, 0.45, 0.66], trim: GOLD, metal: STEEL, armour: heavy, helm: "kettle", shield: "kite", weapon: weapon || "", ranged: ranged || "", bulk: 1, cloak: false, hood: false, crest: null, eyes: null, caster: false, beardless: false };
    if (f === "empires_of_men") {
      k.cloth = [0.3, 0.45, 0.66]; k.trim = [0.86, 0.8, 0.62];
      if (/knight|foot_knights/.test(id)) { k.helm = "great"; k.crest = [0.3, 0.45, 0.66]; k.armour = true; }
      if (/handgun/.test(id)) k.helm = "hat";
      if (/archer|crossbow/.test(id)) { k.helm = "hood"; k.cloth = [0.36, 0.44, 0.3]; }
      if (/light_cavalry/.test(id)) k.helm = "hat";
      if (/captain|knight_commander/.test(id)) { k.cloak = [0.62, 0.16, 0.14]; k.crest = [0.9, 0.9, 0.86]; k.helm = "great"; }
      if (/wizard/.test(id)) { k.caster = true; k.cloth = [0.24, 0.3, 0.6]; k.helm = "wizard"; }
    } else if (f === "dwarf_holds") {
      k.race = "dwarf"; k.bulk = 1.12; k.cloth = [0.56, 0.24, 0.16]; k.metal = BRONZE; k.helm = "dwarf"; k.shield = "round"; k.trim = GOLD;
      if (/berserker/.test(id)) { k.helm = "mohawk"; k.armour = false; k.cloth = SKIN.dwarf[0]; k.shield = "none"; }
      if (/ranger/.test(id)) { k.helm = "hood"; k.cloth = [0.32, 0.38, 0.26]; }
      if (/miner/.test(id)) k.helm = "miner";
      if (/deep_guard|veterans/.test(id)) { k.armour = true; k.metal = [0.5, 0.5, 0.54]; k.crest = GOLD; }
      if (/foreman|engineer/.test(id)) { k.cloak = [0.5, 0.2, 0.12]; k.crest = GOLD; }
    } else if (f === "elven_conclaves") {
      k.race = "elf"; k.bulk = 0.9; k.cloth = [0.25, 0.55, 0.52]; k.metal = SILVER; k.helm = "elf"; k.shield = "leaf"; k.cloak = [0.2, 0.46, 0.44]; k.trim = [0.9, 0.8, 0.5];
      if (/archer|watcher|reaver/.test(id)) { k.helm = "elfhood"; k.cloak = [0.3, 0.38, 0.3]; }
      if (/weapon_master/.test(id)) { k.armour = true; k.crest = [0.9, 0.92, 0.94]; }
      if (/dragon_knight/.test(id)) { k.cloak = [0.62, 0.18, 0.14]; k.metal = [0.86, 0.68, 0.3]; k.crest = [0.7, 0.16, 0.12]; }
      if (/noble|spellsword/.test(id)) { k.cloak = [0.18, 0.3, 0.6]; k.crest = [0.95, 0.95, 0.95]; }
      if (/mage/.test(id)) { k.caster = true; k.helm = "elfhood"; k.cloth = [0.86, 0.86, 0.9]; k.cloak = [0.24, 0.38, 0.7]; }
    } else if (f === "greenskin_tribes") {
      k.race = /goblin/.test(id) ? "goblin" : "orc"; k.cloth = [0.5, 0.2, 0.14]; k.metal = IRON; k.shield = "round"; k.trim = [0.72, 0.2, 0.14];
      k.bulk = k.race === "orc" ? 1.2 : 0.82; k.helm = k.race === "orc" ? "orc" : "goblin";
      if (/brute/.test(id)) { k.armour = true; k.helm = "horned"; }
      if (/war_chief|goblin_king/.test(id)) { k.cloak = [0.5, 0.14, 0.1]; k.helm = "horned"; k.crest = [0.9, 0.84, 0.7]; }
      if (/shaman/.test(id)) { k.caster = true; k.helm = "goblin"; k.cloth = [0.3, 0.24, 0.18]; }
      if (/boar_riders/.test(id)) { k.race = "orc"; k.bulk = 1.15; k.helm = "orc"; }
    } else if (f === "dead_nations") {
      k.race = "skeleton"; k.cloth = [0.34, 0.26, 0.42]; k.metal = RUST; k.helm = "none"; k.shield = "round"; k.eyes = [0.72, 0.52, 1];
      if (/zombie/.test(id)) { k.race = "zombie"; k.cloth = [0.36, 0.3, 0.24]; k.shield = "none"; k.eyes = null; }
      if (/wight|dread|skeleton_knights/.test(id)) { k.armour = true; k.metal = [0.3, 0.3, 0.34]; k.helm = "great"; k.crest = [0.34, 0.26, 0.42]; }
      if (/vampire/.test(id)) { k.race = "vampire"; k.cloak = [0.5, 0.06, 0.08]; k.helm = "none"; k.armour = true; k.metal = [0.24, 0.24, 0.28]; k.eyes = [1, 0.3, 0.3]; }
      if (/necromancer/.test(id)) { k.caster = true; k.helm = "hood"; k.cloth = [0.16, 0.14, 0.18]; k.race = "vampire"; }
      if (/wight_lord/.test(id)) { k.cloak = [0.26, 0.2, 0.34]; k.crest = GOLD; }
    }
    return k;
  }
  function pick(list, v) { return list[v % list.length]; }

  // ---------- the figure ----------
  // One soldier from above: shadow, cloak, arms and gear, torso, head and headgear.
  // s is the base width; ox, oy shift the figure (riders sit on their mounts).
  function figure(k, s, v, rank, role, ox, oy) {
    var b = k.bulk * (role === "cmd" ? 1.1 : 1), skin = pick(SKIN[k.race] || SKIN.human, v), hair = pick(HAIR[k.race] || HAIR.human, v);
    var body = k.armour ? k.metal : (k.race === "orc" ? skin : k.cloth), sh = s * 0.3 * b, sy = s * 0.16;
    c.save(); c.translate(ox || 0, oy || 0);
    if (!oy) shadow(0, 0.02 * s, s * 0.36 * b, s * 0.3);
    var cloak = k.cloak && (role === "cmd" || k.caster || rank < 2 || k.race === "elf") ? k.cloak : null;
    if (cloak) poly([-sh * 0.95, -s * 0.02, sh * 0.95, -s * 0.02, sh * 1.1, s * 0.34, 0, s * 0.4, -sh * 1.1, s * 0.34], cloak, 0, s * 0.15, s * 0.3);
    // gear held behind or to the side comes first
    var w = k.weapon, r = k.ranged, spearUp = rank >= 2;
    if (/Bow/.test(r)) { stick(sh * 0.7, s * 0.12, sh * 0.9, s * 0.34, s * 0.07, LEATHER); c.fillStyle = "rgba(230,225,210,0.9)"; c.beginPath(); c.arc(sh * 0.7, s * 0.1, s * 0.03, 0, 6.28); c.fill(); }
    // arms
    var skinArm = k.race === "skeleton" ? BONE : k.armour ? k.metal : k.race === "human" || k.race === "elf" || k.race === "dwarf" ? k.cloth : skin;
    if (k.race === "orc" && !k.armour) skinArm = skin;
    if (k.race === "zombie") { limb([-sh * 0.8, -s * 0.02, -sh * 0.7, -s * 0.36], s * 0.08, skin); limb([sh * 0.8, -s * 0.02, sh * 0.6, -s * 0.38], s * 0.08, skin); }
    // weapons and shields
    if (k.caster) {
      stick(sh * 0.9, s * 0.1, sh * 0.95, -s * 0.46, s * 0.045, WOOD);
      c.save(); c.shadowColor = k.race === "vampire" ? "#9cff8a" : "#9fd8ff"; c.shadowBlur = 8; ball(sh * 0.95, -s * 0.48, s * 0.05, s * 0.05, k.race === "vampire" ? [0.6, 1, 0.5] : [0.7, 0.9, 1]); c.restore();
    } else if (/Spear|Halberd|Lance/.test(w) && !/Bow|Crossbow|Handgun/.test(r)) {
      var lance = /Lance/.test(w), hal = /Halberd/.test(w), x = sh * 0.72;
      if (spearUp && !lance) { ball(x, -s * 0.05, s * 0.045, s * 0.045, WOOD); poly([x, -s * 0.2, x + s * 0.035, -s * 0.07, x - s * 0.035, -s * 0.07], STEEL, x, -s * 0.12, s * 0.08); }
      else {
        var tip = lance ? -s * 1.55 : -s * 1.05;
        stick(x, s * 0.25, x, tip, s * (lance ? 0.06 : 0.042), lance ? mixc(WOOD, k.cloth, 0.35) : WOOD);
        if (hal) { poly([x, tip + s * 0.22, x + s * 0.2, tip + s * 0.16, x + s * 0.2, tip + s * 0.36, x, tip + s * 0.32], STEEL, x + s * 0.1, tip + s * 0.26, s * 0.14); }
        poly([x, tip - s * 0.14, x + s * 0.045, tip + s * 0.02, x, tip + s * 0.06, x - s * 0.045, tip + s * 0.02], STEEL, x, tip - s * 0.03, s * 0.1);
        if (lance) { c.fillStyle = css(k.cloth, 1.05); c.beginPath(); c.moveTo(x, tip + s * 0.18); c.quadraticCurveTo(x - s * 0.2, tip + s * 0.26, x - s * 0.34, tip + s * 0.2); c.lineTo(x - s * 0.2, tip + s * 0.3); c.lineTo(x, tip + s * 0.36); c.closePath(); c.fill(); }
      }
      limb([sh * 0.85, -s * 0.02, x, -s * 0.12], s * 0.075, skinArm);
    } else if (/Handgun|Pistol/.test(r) && !/Hand Weapon and Shield/.test(w)) {
      stick(sh * 0.45, s * 0.12, sh * 0.35, -s * 0.72, s * 0.05, IRON);
      stick(sh * 0.48, s * 0.14, sh * 0.42, -s * 0.18, s * 0.075, WOOD);
      limb([sh * 0.85, -s * 0.02, sh * 0.45, -s * 0.2], s * 0.07, skinArm); limb([-sh * 0.8, -s * 0.02, sh * 0.35, -s * 0.36], s * 0.07, skinArm);
    } else if (/Crossbow/.test(r)) {
      stick(0, s * 0.02, 0, -s * 0.5, s * 0.07, WOOD);
      c.save(); c.beginPath(); c.moveTo(-s * 0.3, -s * 0.36); c.quadraticCurveTo(0, -s * 0.52, s * 0.3, -s * 0.36); c.lineCap = "round"; c.strokeStyle = "rgba(12,9,6,0.7)"; c.lineWidth = s * 0.06; c.stroke(); c.strokeStyle = css(IRON, 1.3); c.lineWidth = s * 0.035; c.stroke(); c.restore();
      limb([-sh * 0.8, -s * 0.02, -s * 0.06, -s * 0.3], s * 0.07, skinArm); limb([sh * 0.8, -s * 0.02, s * 0.06, -s * 0.12], s * 0.07, skinArm);
    } else if (/Bow/.test(r)) {
      c.save(); c.beginPath(); c.moveTo(-s * 0.46, -s * 0.18); c.quadraticCurveTo(-s * 0.16, -s * 0.56, s * 0.16, -s * 0.34); c.lineCap = "round";
      c.strokeStyle = "rgba(12,9,6,0.7)"; c.lineWidth = s * 0.06; c.stroke(); c.strokeStyle = css(k.race === "elf" ? [0.86, 0.78, 0.56] : WOOD, 1.2); c.lineWidth = s * 0.036; c.stroke();
      c.beginPath(); c.moveTo(-s * 0.46, -s * 0.18); c.lineTo(sh * 0.3, -s * 0.06); c.lineTo(s * 0.16, -s * 0.34); c.strokeStyle = "rgba(235,228,205,0.8)"; c.lineWidth = 0.008; c.stroke(); c.restore();
      limb([-sh * 0.8, -s * 0.02, -s * 0.16, -s * 0.36], s * 0.07, skinArm); limb([sh * 0.8, -s * 0.02, sh * 0.3, -s * 0.08], s * 0.07, skinArm);
    } else if (k.race !== "zombie" && !/Fangs|Claws/.test(w)) {
      var great = /Greatweapon/.test(w), two = /Two Hand/.test(w), axe = k.race === "dwarf" || k.race === "orc" || k.race === "goblin", steel = k.race === "skeleton" ? RUST : STEEL;
      if (great) {
        if (axe) { stick(-s * 0.08, s * 0.06, s * 0.2, -s * 0.66, s * 0.05, WOOD); poly([s * 0.16, -s * 0.56, s * 0.42, -s * 0.66, s * 0.4, -s * 0.36, s * 0.2, -s * 0.46], steel, s * 0.3, -s * 0.5, s * 0.16); }
        else { blade(s * 0.02, -s * 0.1, s * 0.22, -s * 0.78, s * 0.08, steel); stick(-s * 0.1, -s * 0.13, s * 0.14, -s * 0.07, s * 0.04, GOLD); }
        limb([-sh * 0.8, -s * 0.02, -s * 0.02, -s * 0.12], s * 0.075, skinArm); limb([sh * 0.8, -s * 0.02, s * 0.04, -s * 0.16], s * 0.075, skinArm);
      } else {
        var sword = function (x, flip) {
          if (axe) { stick(x, -s * 0.08, x + flip * s * 0.06, -s * 0.46, s * 0.036, WOOD); poly([x + flip * s * 0.04, -s * 0.38, x + flip * s * 0.2, -s * 0.44, x + flip * s * 0.19, -s * 0.28, x + flip * s * 0.05, -s * 0.32], steel, x + flip * s * 0.12, -s * 0.36, s * 0.1); }
          else { blade(x, -s * 0.14, x + flip * s * 0.06, -s * 0.52, s * 0.05, steel); stick(x - s * 0.07, -s * 0.13, x + s * 0.07, -s * 0.13, s * 0.025, BRONZE); }
        };
        sword(sh * 0.75, 1);
        limb([sh * 0.85, -s * 0.02, sh * 0.75, -s * 0.14], s * 0.075, skinArm);
        if (two) { sword(-sh * 0.75, -1); limb([-sh * 0.85, -s * 0.02, -sh * 0.75, -s * 0.14], s * 0.075, skinArm); }
      }
    }
    // shield on the left arm
    if (/Shield/.test(w) && k.shield !== "none" && !k.caster) {
      var scx = -sh * 0.62, scy = -s * 0.16, face = k.race === "skeleton" ? RUST : k.race === "orc" || k.race === "goblin" ? WOOD : k.cloth;
      limb([-sh * 0.85, -s * 0.02, scx, scy + s * 0.04], s * 0.075, skinArm);
      if (k.shield === "kite") lit(function () { c.moveTo(scx - s * 0.17, scy - s * 0.05); c.quadraticCurveTo(scx, scy - s * 0.14, scx + s * 0.17, scy - s * 0.05); c.quadraticCurveTo(scx + s * 0.12, scy + s * 0.08, scx, scy + s * 0.12); c.quadraticCurveTo(scx - s * 0.12, scy + s * 0.08, scx - s * 0.17, scy - s * 0.05); }, face, scx, scy, s * 0.18);
      else if (k.shield === "leaf") ball(scx, scy, s * 0.21, s * 0.1, face);
      else ball(scx, scy, s * (k.race === "dwarf" ? 0.2 : 0.18), s * 0.12, face);
      c.lineWidth = s * 0.025; c.strokeStyle = css(k.shield === "round" ? (k.race === "skeleton" ? RUST : IRON) : k.trim, 1); c.beginPath();
      if (k.shield === "kite") { c.moveTo(scx - s * 0.13, scy - s * 0.045); c.quadraticCurveTo(scx, scy - s * 0.12, scx + s * 0.13, scy - s * 0.045); }
      else c.ellipse(scx, scy, s * (k.shield === "leaf" ? 0.17 : k.race === "dwarf" ? 0.165 : 0.145), s * (k.shield === "leaf" ? 0.075 : 0.092), 0, 0, 6.28);
      c.stroke();
      if (k.shield !== "leaf") ball(scx, scy, s * 0.04, s * 0.03, k.shield === "kite" ? k.trim : IRON);
    }
    // torso and shoulders
    if (k.race === "skeleton") {
      limb([-sh * 0.9, -s * 0.02, sh * 0.9, -s * 0.02], s * 0.06, BONE);
      c.strokeStyle = css(BONE, 0.85); c.lineWidth = s * 0.03; for (var q = 0; q < 3; q++) { c.beginPath(); c.moveTo(-sh * 0.45, s * (0.05 + q * 0.06)); c.quadraticCurveTo(0, s * (0.09 + q * 0.06), sh * 0.45, s * (0.05 + q * 0.06)); c.stroke(); }
      if (k.armour) ball(0, s * 0.04, sh * 0.8, sy * 0.9, k.metal);
    } else {
      ball(0, s * 0.03, sh, sy, body);
      if (k.armour || k.race === "orc") { ball(-sh * 0.8, -s * 0.01, s * 0.1 * b, s * 0.09, k.armour ? k.metal : IRON); ball(sh * 0.8, -s * 0.01, s * 0.1 * b, s * 0.09, k.armour ? k.metal : IRON); }
      if (k.race === "orc" && !k.armour) { c.strokeStyle = css(LEATHER, 0.9); c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(-sh * 0.7, -s * 0.06); c.lineTo(sh * 0.5, s * 0.16); c.stroke(); ball(0, s * 0.15, sh * 0.7, sy * 0.45, k.cloth); }
      if (!k.armour && k.race !== "orc" && k.race !== "zombie") { c.strokeStyle = css(k.trim, 0.9, 0.8); c.lineWidth = s * 0.02; c.beginPath(); c.moveTo(0, -s * 0.12); c.lineTo(0, s * 0.18); c.stroke(); }
      if (k.race === "zombie") { c.fillStyle = "rgba(40,30,24,0.55)"; c.beginPath(); c.arc(sh * 0.3, s * 0.08, s * 0.05, 0, 6.28); c.arc(-sh * 0.4, s * 0.02, s * 0.035, 0, 6.28); c.fill(); }
    }
    // head and headgear
    var hr = s * (k.race === "goblin" ? 0.12 : k.race === "orc" ? 0.125 : k.race === "dwarf" ? 0.12 : 0.11) * (role === "cmd" ? 1.08 : 1), hy = -s * 0.02;
    if (k.race === "dwarf" && k.helm !== "mohawk") { poly([-hr * 0.8, hy - hr * 0.2, hr * 0.8, hy - hr * 0.2, hr * 0.5, hy - hr * 2.2, 0, hy - hr * 2.6, -hr * 0.5, hy - hr * 2.2], hair, 0, hy - hr * 1.3, hr * 1.4); c.strokeStyle = css(hair, 0.7); c.lineWidth = 0.008; for (var bl = -1; bl <= 1; bl++) { c.beginPath(); c.moveTo(bl * hr * 0.4, hy - hr * 0.5); c.lineTo(bl * hr * 0.25, hy - hr * 2.2); c.stroke(); } }
    if (k.race === "goblin") { poly([-hr * 0.7, hy, -hr * 2.2, hy + hr * 0.4, -hr * 0.8, hy + hr * 0.5], skin, -hr * 1.3, hy + hr * 0.3, hr); poly([hr * 0.7, hy, hr * 2.2, hy + hr * 0.4, hr * 0.8, hy + hr * 0.5], skin, hr * 1.3, hy + hr * 0.3, hr); }
    if (k.race === "elf" && (k.helm === "elf" || k.helm === "none")) poly([-hr * 0.8, hy + hr * 0.2, hr * 0.8, hy + hr * 0.2, hr * 0.6, hy + hr * 2.6, 0, hy + hr * 3, -hr * 0.6, hy + hr * 2.6], hair, 0, hy + hr * 1.5, hr * 1.5);
    var headCol = k.race === "skeleton" ? BONE : k.race === "vampire" ? SKIN.vampire[0] : skin;
    switch (k.helm) {
      case "kettle": ball(0, hy, hr * 1.35, hr * 1.25, STEEL); ball(0, hy, hr * 0.8, hr * 0.75, STEEL); break;
      case "great": ball(0, hy, hr * 1.1, hr * 1.15, k.metal); c.fillStyle = "rgba(10,8,8,0.7)"; c.fillRect(-hr * 0.6, hy - hr * 0.95, hr * 1.2, hr * 0.14); break;
      case "hat": ball(0, hy, hr * 1.6, hr * 1.45, tint(k.cloth, 0.55)); ball(0, hy, hr * 0.85, hr * 0.8, tint(k.cloth, 0.65)); if (v % 2 === 0) limb([hr * 0.3, hy + hr * 0.2, hr * 1.1, hy + hr * 1.3], s * 0.03, [0.92, 0.9, 0.84]); break;
      case "hood": case "elfhood": ball(0, hy + hr * 0.1, hr * 1.2, hr * 1.35, k.helm === "elfhood" ? k.cloak || k.cloth : tint(k.cloth, 0.85)); c.fillStyle = "rgba(10,8,6,0.5)"; c.beginPath(); c.ellipse(0, hy - hr * 0.7, hr * 0.55, hr * 0.35, 0, 0, 6.28); c.fill(); break;
      case "wizard": ball(0, hy, hr * 1.7, hr * 1.6, k.cloth); ball(0, hy - hr * 0.1, hr * 0.7, hr * 0.7, tint(k.cloth, 1.2)); break;
      case "dwarf": case "miner": ball(0, hy, hr * 1.1, hr * 1.05, k.metal); stick(0, hy - hr * 0.95, 0, hy + hr * 0.6, s * 0.03, tint(k.metal, 0.8)); if (k.helm === "miner") { c.save(); c.shadowColor = "#ffd27a"; c.shadowBlur = 6; ball(0, hy - hr * 0.8, hr * 0.28, hr * 0.28, [1, 0.86, 0.5]); c.restore(); } else if (v % 3 === 0) { limb([-hr * 0.9, hy, -hr * 1.6, hy - hr * 0.7], s * 0.03, BONE); limb([hr * 0.9, hy, hr * 1.6, hy - hr * 0.7], s * 0.03, BONE); } break;
      case "mohawk": ball(0, hy, hr, hr, headCol); stick(0, hy - hr * 0.9, 0, hy + hr * 0.9, hr * 0.5, [0.9, 0.42, 0.12]); break;
      case "elf": ball(0, hy, hr, hr * 1.1, k.metal); stick(0, hy - hr * 0.9, 0, hy + hr * 1.4, s * 0.035, k.crest || tint(k.metal, 0.8)); break;
      case "orc": ball(0, hy, hr, hr, headCol); ball(0, hy + hr * 0.25, hr * 0.8, hr * 0.62, IRON); limb([-hr * 0.35, hy - hr * 0.8, -hr * 0.45, hy - hr * 1.15], s * 0.022, BONE); limb([hr * 0.35, hy - hr * 0.8, hr * 0.45, hy - hr * 1.15], s * 0.022, BONE); break;
      case "horned": ball(0, hy, hr * 1.1, hr * 1.1, IRON); limb([-hr * 0.7, hy, -hr * 1.7, hy - hr * 0.8], s * 0.04, BONE); limb([hr * 0.7, hy, hr * 1.7, hy - hr * 0.8], s * 0.04, BONE); break;
      case "goblin": ball(0, hy, hr, hr, headCol); poly([-hr * 0.8, hy + hr * 0.3, hr * 0.8, hy + hr * 0.3, 0, hy + hr * 1.9], tint(k.cloth, 0.6), 0, hy + hr, hr); c.fillStyle = "rgba(255,210,60,0.9)"; c.beginPath(); c.arc(-hr * 0.35, hy - hr * 0.55, hr * 0.13, 0, 6.28); c.arc(hr * 0.35, hy - hr * 0.55, hr * 0.13, 0, 6.28); c.fill(); break;
      default:
        ball(0, hy, hr, hr * 1.05, headCol);
        if (k.race === "skeleton") { c.fillStyle = "rgba(20,14,12,0.8)"; c.beginPath(); c.arc(-hr * 0.35, hy - hr * 0.6, hr * 0.2, 0, 6.28); c.arc(hr * 0.35, hy - hr * 0.6, hr * 0.2, 0, 6.28); c.fill(); }
        else if (k.race === "zombie") { c.fillStyle = "rgba(40,34,26,0.8)"; c.beginPath(); c.arc(hr * 0.2, hy + hr * 0.2, hr * 0.6, 0, 3.4); c.fill(); }
        else if (k.race === "vampire") { poly([-hr * 0.9, hy + hr * 0.1, hr * 0.9, hy + hr * 0.1, hr * 0.6, hy + hr * 1.5, -hr * 0.6, hy + hr * 1.5], [0.12, 0.1, 0.1], 0, hy + hr * 0.7, hr); }
    }
    if (k.crest && k.helm !== "elf") { if (k.helm === "great" || k.helm === "dwarf" || k.helm === "horned") limb([0, hy - hr * 0.6, 0, hy + hr * 1.7], s * 0.05, k.crest); }
    if (k.eyes && (k.race === "skeleton" || k.helm === "great") && k.race !== "human") { c.save(); c.fillStyle = css(k.eyes, 1); c.shadowColor = css(k.eyes, 1); c.shadowBlur = 5; c.beginPath(); c.arc(-hr * 0.35, hy - hr * 0.72, hr * 0.12, 0, 6.28); c.arc(hr * 0.35, hy - hr * 0.72, hr * 0.12, 0, 6.28); c.fill(); c.restore(); }
    c.restore();
  }

  // ---------- mounts ----------
  function horse(bw, bd, coat, barding, trim, bone, v) {
    var mane = bone ? [0.2, 0.18, 0.2] : tint(coat, 0.45);
    shadow(0, bd * 0.02, bw * 0.34, bd * 0.46);
    limb([0, bd * 0.32, bw * 0.03 * (v % 2 ? 1 : -1), bd * 0.46], bw * 0.1, mane);
    if (bone) {
      ball(0, bd * 0.06, bw * 0.24, bd * 0.3, [0.22, 0.2, 0.22]);
      c.strokeStyle = css(BONE, 0.95); c.lineWidth = bw * 0.035; for (var i = 0; i < 6; i++) { var yy = -bd * 0.12 + i * bd * 0.07; c.beginPath(); c.moveTo(-bw * 0.2, yy + bd * 0.02); c.quadraticCurveTo(0, yy - bd * 0.02, bw * 0.2, yy + bd * 0.02); c.stroke(); }
      limb([0, -bd * 0.2, 0, bd * 0.3], bw * 0.05, BONE);
    } else {
      ball(-bw * 0.13, bd * 0.22, bw * 0.17, bd * 0.13, coat); ball(bw * 0.13, bd * 0.22, bw * 0.17, bd * 0.13, coat);
      ball(-bw * 0.12, -bd * 0.08, bw * 0.15, bd * 0.11, coat); ball(bw * 0.12, -bd * 0.08, bw * 0.15, bd * 0.11, coat);
      ball(0, bd * 0.07, bw * 0.25, bd * 0.26, coat);
    }
    if (barding) {
      lit(function () { c.moveTo(-bw * 0.31, -bd * 0.08); c.quadraticCurveTo(0, -bd * 0.18, bw * 0.31, -bd * 0.08); c.lineTo(bw * 0.33, bd * 0.22); c.quadraticCurveTo(0, bd * 0.3, -bw * 0.33, bd * 0.22); c.closePath(); }, barding, 0, bd * 0.06, bw * 0.4);
      c.strokeStyle = css(trim, 1); c.lineWidth = bw * 0.03; c.beginPath(); c.moveTo(-bw * 0.33, bd * 0.2); c.quadraticCurveTo(0, bd * 0.28, bw * 0.33, bd * 0.2); c.stroke();
    }
    cylinderNeck(0, -bd * 0.14, 0, -bd * 0.36, bw * 0.2, bw * 0.13, bone ? BONE : coat);
    if (!bone) limb([0, -bd * 0.12, 0, -bd * 0.34], bw * 0.05, mane);
    ball(0, -bd * 0.41, bw * 0.085, bd * 0.085, bone ? BONE : coat); ball(0, -bd * 0.47, bw * 0.065, bd * 0.04, bone ? BONE : tint(coat, 0.85));
    if (bone) { c.fillStyle = "rgba(20,14,12,0.85)"; c.beginPath(); c.arc(-bw * 0.04, -bd * 0.39, bw * 0.02, 0, 6.28); c.arc(bw * 0.04, -bd * 0.39, bw * 0.02, 0, 6.28); c.fill(); }
    else { c.fillStyle = css(coat, 0.45); c.beginPath(); c.arc(-bw * 0.035, -bd * 0.45, bw * 0.02, 0, 6.28); c.arc(bw * 0.035, -bd * 0.45, bw * 0.02, 0, 6.28); c.fill(); }
    limb([-bw * 0.05, -bd * 0.35, -bw * 0.08, -bd * 0.31], bw * 0.03, bone ? BONE : coat); limb([bw * 0.05, -bd * 0.35, bw * 0.08, -bd * 0.31], bw * 0.03, bone ? BONE : coat);
    if (!bone) { c.strokeStyle = "rgba(30,20,12,0.8)"; c.lineWidth = 0.012; c.beginPath(); c.moveTo(-bw * 0.07, -bd * 0.38); c.lineTo(-bw * 0.12, -bd * 0.12); c.moveTo(bw * 0.07, -bd * 0.38); c.lineTo(bw * 0.12, -bd * 0.12); c.stroke(); }
  }
  function cylinderNeck(x0, y0, x1, y1, w0, w1, col) {
    var nx = 1, g = c.createLinearGradient(x0 - w0 / 2, 0, x0 + w0 / 2, 0), right = L.x > 0;
    g.addColorStop(0, css(col, right ? 0.55 : 1.3)); g.addColorStop(0.5, css(col, 1)); g.addColorStop(1, css(col, right ? 1.3 : 0.55));
    c.beginPath(); c.moveTo(x0 - w0 / 2, y0); c.lineTo(x1 - w1 / 2, y1); c.lineTo(x1 + w1 / 2, y1); c.lineTo(x0 + w0 / 2, y0); c.closePath();
    c.fillStyle = g; c.fill(); c.lineWidth = 0.012; c.strokeStyle = "rgba(12,9,6,0.55)"; c.stroke();
    return nx;
  }
  function boar(bw, bd, v) {
    var hide = pick([[0.36, 0.25, 0.18], [0.3, 0.22, 0.17], [0.42, 0.3, 0.2]], v), dark = tint(hide, 0.55);
    shadow(0, bd * 0.02, bw * 0.4, bd * 0.42);
    paws(bw, bd, dark, -bd * 0.14, bd * 0.2, 0.3, bw * 0.08);
    limb([0, bd * 0.3, bw * 0.04, bd * 0.38], bw * 0.035, dark);
    ball(-bw * 0.12, bd * 0.18, bw * 0.17, bd * 0.13, hide); ball(bw * 0.12, bd * 0.18, bw * 0.17, bd * 0.13, hide);
    ball(0, bd * 0.02, bw * 0.3, bd * 0.26, hide);
    ball(0, -bd * 0.16, bw * 0.3, bd * 0.13, tint(hide, 1.05));
    c.strokeStyle = css(dark, 1); c.lineWidth = bw * 0.07; c.lineCap = "round"; c.beginPath(); c.moveTo(0, -bd * 0.24); c.lineTo(0, bd * 0.2); c.stroke();
    ball(0, -bd * 0.31, bw * 0.17, bd * 0.1, hide);
    ball(0, -bd * 0.41, bw * 0.09, bd * 0.045, [0.55, 0.4, 0.34]);
    c.fillStyle = "rgba(20,12,8,0.8)"; c.beginPath(); c.arc(-bw * 0.03, -bd * 0.42, bw * 0.015, 0, 6.28); c.arc(bw * 0.03, -bd * 0.42, bw * 0.015, 0, 6.28); c.fill();
    limb([-bw * 0.08, -bd * 0.38, -bw * 0.17, -bd * 0.45, -bw * 0.14, -bd * 0.48], bw * 0.035, BONE); limb([bw * 0.08, -bd * 0.38, bw * 0.17, -bd * 0.45, bw * 0.14, -bd * 0.48], bw * 0.035, BONE);
    poly([-bw * 0.12, -bd * 0.33, -bw * 0.26, -bd * 0.3, -bw * 0.14, -bd * 0.26], dark, -bw * 0.17, -bd * 0.3, bw * 0.08);
    poly([bw * 0.12, -bd * 0.33, bw * 0.26, -bd * 0.3, bw * 0.14, -bd * 0.26], dark, bw * 0.17, -bd * 0.3, bw * 0.08);
  }
  function paws(bw, bd, col, fy, hy, spread, w) {
    [-1, 1].forEach(function (sd) {
      limb([sd * bw * 0.1, fy, sd * bw * spread, fy - bd * 0.1], w, col);
      limb([sd * bw * 0.1, hy, sd * bw * spread, hy + bd * 0.09], w, col);
    });
  }
  function wolf(bw, bd, fur, undead, v) {
    var dark = tint(fur, 0.7);
    shadow(0, bd * 0.02, bw * 0.3, bd * 0.42);
    paws(bw, bd, dark, -bd * 0.12, bd * 0.17, 0.27, bw * 0.09);
    limb([0, bd * 0.24, bw * 0.08 * (v % 2 ? 1 : -1), bd * 0.36, bw * 0.02 * (v % 2 ? 1 : -1), bd * 0.44], bw * 0.1, dark);
    ball(0, bd * 0.06, bw * 0.21, bd * 0.23, fur);
    ball(0, -bd * 0.12, bw * 0.26, bd * 0.12, tint(fur, 1.1));
    if (undead) { c.strokeStyle = css(BONE, 0.9); c.lineWidth = bw * 0.025; for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(bw * 0.04, bd * (0.02 + i * 0.045)); c.quadraticCurveTo(bw * 0.12, bd * (0.01 + i * 0.045), bw * 0.15, bd * (0.04 + i * 0.045)); c.stroke(); } }
    ball(0, -bd * 0.25, bw * 0.15, bd * 0.09, fur);
    ball(0, -bd * 0.33, bw * 0.06, bd * 0.06, tint(fur, 0.92));
    c.fillStyle = "rgba(15,10,8,0.9)"; c.beginPath(); c.arc(0, -bd * 0.385, bw * 0.025, 0, 6.28); c.fill();
    poly([-bw * 0.1, -bd * 0.26, -bw * 0.15, -bd * 0.33, -bw * 0.04, -bd * 0.29], dark, -bw * 0.1, -bd * 0.29, bw * 0.07);
    poly([bw * 0.1, -bd * 0.26, bw * 0.15, -bd * 0.33, bw * 0.04, -bd * 0.29], dark, bw * 0.1, -bd * 0.29, bw * 0.07);
    c.save(); c.fillStyle = undead ? "#b89cff" : "#ffd24a"; c.shadowColor = c.fillStyle; c.shadowBlur = 4; c.beginPath(); c.arc(-bw * 0.045, -bd * 0.29, bw * 0.018, 0, 6.28); c.arc(bw * 0.045, -bd * 0.29, bw * 0.018, 0, 6.28); c.fill(); c.restore();
  }
  function wings(s, col, kind) {
    [-1, 1].forEach(function (sd) {
      c.beginPath(); c.moveTo(sd * s * 0.1, -s * 0.1);
      c.bezierCurveTo(sd * s * 0.3, -s * 0.4, sd * s * 0.55, -s * 0.38, sd * s * 0.66, -s * 0.2);
      if (kind === "feather") { for (var i = 0; i < 5; i++) c.quadraticCurveTo(sd * s * (0.62 - i * 0.1), -s * (0.02 - i * 0.03), sd * s * (0.56 - i * 0.1), s * (0.06 + i * 0.02)); }
      else { c.quadraticCurveTo(sd * s * 0.5, -s * 0.08, sd * s * 0.52, s * 0.06); c.quadraticCurveTo(sd * s * 0.36, 0, sd * s * 0.3, s * 0.12); c.quadraticCurveTo(sd * s * 0.2, s * 0.05, sd * s * 0.1, s * 0.12); }
      c.closePath();
      var g = c.createLinearGradient(0, 0, sd * s * 0.66, 0), k = sd * L.x > 0 ? 1.2 : 0.85;
      g.addColorStop(0, css(col, 0.8 * k)); g.addColorStop(0.7, css(col, 1.05 * k)); g.addColorStop(1, css(col, 0.7 * k));
      c.fillStyle = g; c.fill(); c.lineWidth = 0.016; c.strokeStyle = "rgba(12,9,6,0.7)"; c.stroke();
      c.strokeStyle = css(col, kind === "feather" ? 0.65 : 0.5); c.lineWidth = 0.01;
      for (var j = 0; j < 4; j++) { c.beginPath(); c.moveTo(sd * s * 0.14, -s * 0.1); c.lineTo(sd * s * (0.62 - j * 0.12), s * (-0.12 + j * 0.06)); c.stroke(); }
    });
  }
  function monstrous(u, s, v) {
    var id = u.id;
    if (/troll/.test(id)) {
      var hide = pick([[0.36, 0.44, 0.34], [0.4, 0.46, 0.32], [0.34, 0.4, 0.36]], v);
      shadow(0, 0, s * 0.42, s * 0.34);
      limb([s * 0.28, 0, s * 0.3, -s * 0.28], s * 0.12, hide); stick(s * 0.3, -s * 0.2, s * 0.26, -s * 0.52, s * 0.1, [0.36, 0.26, 0.16]);
      limb([-s * 0.28, 0, -s * 0.32, -s * 0.24], s * 0.12, hide);
      ball(0, s * 0.05, s * 0.34, s * 0.2, hide);
      c.fillStyle = "rgba(60,70,50,0.5)"; for (var i = 0; i < 5; i++) { c.beginPath(); c.arc(-s * 0.2 + i * s * 0.1, s * (0.05 + (i % 2) * 0.05), s * 0.03, 0, 6.28); c.fill(); }
      ball(0, -s * 0.04, s * 0.11, s * 0.11, tint(hide, 1.05));
      return;
    }
    if (/fell_bat/.test(id)) { shadow(0, 0, s * 0.5, s * 0.3); wings(s * 0.9, [0.24, 0.2, 0.24], "membrane"); ball(0, 0, s * 0.1, s * 0.16, [0.28, 0.24, 0.26]); ball(0, -s * 0.16, s * 0.07, s * 0.07, [0.3, 0.26, 0.28]); return; }
    var body = /wyvern/.test(id) ? [0.3, 0.42, 0.26] : /eagle/.test(id) ? [0.46, 0.34, 0.2] : [0.6, 0.46, 0.26];
    shadow(0, 0, s * 0.55, s * 0.36);
    if (/gryphon/.test(id)) limb([0, s * 0.2, s * 0.1, s * 0.4, s * 0.2, s * 0.44], s * 0.05, [0.62, 0.48, 0.28]);
    wings(s, /wyvern/.test(id) ? tint(body, 0.9) : /gryphon/.test(id) ? [0.72, 0.6, 0.4] : body, /wyvern/.test(id) ? "membrane" : "feather");
    ball(0, s * 0.04, s * 0.13, s * 0.24, body);
    ball(0, -s * 0.24, s * 0.08, s * 0.09, /gryphon|eagle/.test(id) ? [0.9, 0.88, 0.82] : body);
    poly([0, -s * 0.4, s * 0.035, -s * 0.3, -s * 0.035, -s * 0.3], /wyvern/.test(id) ? BONE : GOLD, 0, -s * 0.34, s * 0.05);
  }

  // ---------- standard ----------
  function standard(k, s, magic) {
    var x = sStdX(s), top = -s * 0.1;
    c.save();
    if (magic) { c.shadowColor = "#ffe08a"; c.shadowBlur = 10; }
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + s * 0.02, top + s * 0.8); c.quadraticCurveTo(x - s * 0.18, top + s * 0.86, x - s * 0.34, top + s * 0.8); c.lineTo(x - s * 0.36, top + s * 0.02); c.quadraticCurveTo(x - s * 0.18, top + s * 0.08, x, top); c.closePath();
    var g = c.createLinearGradient(x - s * 0.36, 0, x, 0), right = L.x > 0;
    g.addColorStop(0, css(k.cloth, right ? 0.7 : 1.2)); g.addColorStop(0.5, css(k.cloth, 1.05)); g.addColorStop(1, css(k.cloth, right ? 1.2 : 0.75));
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = s * 0.03; c.strokeStyle = css(magic ? GOLD : k.trim, 1); c.stroke();
    c.fillStyle = css(k.trim, 1.05); c.beginPath(); c.arc(x - s * 0.17, top + s * 0.4, s * 0.08, 0, 6.28); c.fill();
    c.fillStyle = css(k.cloth, 0.6); c.beginPath(); c.arc(x - s * 0.17, top + s * 0.4, s * 0.04, 0, 6.28); c.fill();
    stick(x - s * 0.4, top, x + s * 0.04, top, s * 0.03, GOLD);
    ball(x, top, s * 0.045, s * 0.045, GOLD);
  }
  function sStdX(s) { return s * 0.2; }

  // ---------- sprite cache ----------
  function paintModel(u, role, v, rank, bw, bd, cmd) {
    var type = cmd ? (cmd.def.type || "Infantry") : u.type, k = lookOf(u, cmd), s = bw;
    if (type === "Monstrous Infantry" && !cmd) return monstrous(u, s, v);
    if (type === "Hounds") return wolf(bw, bd, pick([[0.3, 0.28, 0.28], [0.26, 0.25, 0.26], [0.34, 0.31, 0.28]], v), u.faction === "dead_nations", v);
    if (type === "Cavalry" || (cmd && cmd.mount)) {
      var id = cmd ? cmd.def.id : u.id, f = u.faction, rider = 0.84;
      if (/boar/.test(id) || (f === "greenskin_tribes" && !/wolf/.test(id))) boar(bw, bd, v);
      else if (/wolf/.test(id)) wolf(bw, bd, pick([[0.36, 0.33, 0.3], [0.3, 0.29, 0.28]], v), false, v);
      else if (f === "dead_nations") horse(bw, bd, [0.3, 0.28, 0.3], /dread/.test(id) ? [0.16, 0.14, 0.18] : [0.3, 0.22, 0.36], [0.6, 0.5, 0.3], true, v);
      else if (f === "elven_conclaves") horse(bw, bd, pick([[0.86, 0.85, 0.82], [0.72, 0.72, 0.72], [0.8, 0.78, 0.72]], v), /reaver/.test(id) ? null : k.cloak || k.cloth, k.trim, false, v);
      else horse(bw, bd, pick([[0.42, 0.27, 0.16], [0.3, 0.2, 0.13], [0.55, 0.4, 0.26], [0.2, 0.16, 0.14]], v), /knight/.test(id) ? k.cloth : null, k.trim, false, v);
      if (/goblin/.test(id)) { k = lookOf({ id: "goblin_mob", faction: "greenskin_tribes", props: [] }, null); k.weapon = u.weapon; k.ranged = u.ranged; }
      rider = /wolf/.test(id) ? 1.0 : 1.18;
      c.save(); c.translate(0, bd * 0.02); c.scale(rider, rider); figure(k, bw * 0.9, v, 0, role, 0, 0.001); c.restore();
      return;
    }
    if (type === "Infantry Large") k.bulk *= 1.05;
    // miniatures fill their bases: paint the figure larger than the bare proportions
    c.save(); c.scale(1.32, 1.32);
    figure(k, s, v, rank, role, 0, 0);
    if (role === "std") standard(k, s, !!u.banner);
    c.restore();
  }
  // Painting is capped per frame: past the budget a model borrows the sprite of the nearest
  // light direction already painted, and its own is painted on a later frame.
  var BUDGET_MS = 5, spent = 0;
  var scratchCv = null, silCv = null;
  function grow(cv, w, h) { if (cv.width < w) cv.width = w; if (cv.height < h) cv.height = h; return cv; }
  function scratchFor(w, h) { if (!scratchCv) scratchCv = document.createElement("canvas"); return grow(scratchCv, w, h); }
  // Stamp a figure so it stands out: lifted a little, inside a thin dark outline and a soft pale
  // rim, both made from its silhouette drawn at small offsets (plain image draws: canvas blur
  // filters are far too slow to run on every sprite).
  var RING = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];
  function standOut(page, src, x, y, w, h, px) {
    if (!silCv) silCv = document.createElement("canvas");
    grow(silCv, w, h);
    var sc = src.getContext("2d"), sil = silCv.getContext("2d");
    sc.save(); sc.globalCompositeOperation = "source-atop"; sc.fillStyle = "rgba(255,246,228,0.04)"; sc.fillRect(0, 0, w, h); sc.restore();
    function tint(col) { sil.save(); sil.setTransform(1, 0, 0, 1, 0, 0); sil.globalCompositeOperation = "copy"; sil.drawImage(src, 0, 0, w, h, 0, 0, w, h); sil.globalCompositeOperation = "source-in"; sil.fillStyle = col; sil.fillRect(0, 0, w, h); sil.restore(); }
    page.save(); page.beginPath(); page.rect(x, y, w, h); page.clip(); page.clearRect(x, y, w, h);
    tint("rgba(236,228,206,1)"); page.globalAlpha = 0.10;
    RING.forEach(function (d) { page.drawImage(silCv, 0, 0, w, h, x + d[0] * px * 2.2, y + d[1] * px * 2.2, w, h); });
    tint("rgba(8,10,14,1)"); page.globalAlpha = 0.8;
    RING.forEach(function (d) { page.drawImage(silCv, 0, 0, w, h, x + d[0] * px, y + d[1] * px, w, h); });
    page.globalAlpha = 1; page.drawImage(src, 0, 0, w, h, x, y, w, h);
    page.restore();
  }
  function spriteFor(u, role, v, rank, bw, bd, bucket, cmd, PPI) {
    // Authored overhead art already contains its lighting. Reuse it across facings,
    // ranks and pose seeds; the regiment transform supplies the actual direction.
    var authored = SOVL.RealisticArt && SOVL.RealisticArt.resolve(u, role, cmd);
    var overhead = !!(authored && authored.image.complete && authored.image.naturalWidth);
    if (overhead) { v = 0; rank = 0; bucket = 0; }
    var base = [u.faction, cmd ? "c:" + cmd.def.id + cmd.weapon : u.id + u.weapon + (u.ranged || ""), role, v, rank >= 2 ? 2 : rank].join("|"), tail = [bw.toFixed(2), bd.toFixed(2), u.banner ? 1 : 0, PPI].join("|");
    tail += "|" + (SOVL.RealisticArt ? SOVL.RealisticArt.revision() : 0);
    var key = base + "|" + bucket + "|" + tail;
    var hit = cache[key];
    if (hit) return hit;
    if (spent > BUDGET_MS) {
      for (var d = 1; d <= 4; d++) {
        var near = cache[base + "|" + ((bucket + d) % 8) + "|" + tail] || cache[base + "|" + ((bucket + 8 - d) % 8) + "|" + tail];
        if (near && near !== "failed") return near;
      }
    }
    var t0 = performance.now();
    var padX = bw * 0.75, back = bd * 0.55, front = bd * 0.5 + Math.max(bw * 1.7, 0.4);
    var sw = Math.ceil((bw + 2 * padX) * PPI), sh = Math.ceil((back + front) * PPI), slot = allocate(sw, sh);
    if (!slot) { cache[key] = "failed"; return "failed"; }
    // the figure is painted on a scratch canvas, then stamped into the atlas with its contrast
    // lifted: a touch brighter and crisper, a thin dark outline and a soft pale rim, so each
    // model reads clearly against its tray and the ground (done once per sprite, not per frame)
    var page = slot.page.getContext("2d"), scratch = scratchFor(sw, sh), g = scratch.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, sw, sh);
    g.save(); g.scale(PPI, PPI); g.translate(bw / 2 + padX, front);
    var a = SUN - bucket * (Math.PI / 4); L.x = Math.cos(a); L.y = Math.sin(a);
    c = g;
    try { if (!SOVL.RealisticArt || !SOVL.RealisticArt.draw(g, u, bw, bd, role, cmd)) paintModel(u, role, v, rank, bw, bd, cmd); } catch (e) { g.restore(); cache[key] = "failed"; c = null; return "failed"; }
    g.restore(); c = null;
    standOut(page, scratch, slot.x, slot.y, sw, sh, Math.max(1, PPI * 0.018));
    hit = { cv: slot.page, sx: slot.x, sy: slot.y, sw: sw, sh: sh, ox: bw / 2 + padX, oy: front, w: sw / PPI, h: sh / PPI, bucket: bucket, overhead: overhead };
    cache[key] = hit; cacheCount++;
    spent += performance.now() - t0;
    return hit;
  }
  // Sprites are packed into a few large atlas sheets: one texture per sheet instead of
  // hundreds of small canvases, which browsers handle far better.
  var SHEET = 2048, MAX_SHEETS = 6, sheets = [], cursor = null;
  function newSheet() {
    var cv = document.createElement("canvas"); cv.width = cv.height = SHEET;
    sheets.push(cv); cursor = { page: cv, x: 0, y: 0, row: 0 };
  }
  function allocate(w, h) {
    if (w > SHEET || h > SHEET) return null;
    if (!cursor) newSheet();
    if (cursor.x + w > SHEET) { cursor.x = 0; cursor.y += cursor.row + 2; cursor.row = 0; }
    if (cursor.y + h > SHEET) {
      if (sheets.length >= MAX_SHEETS) { sheets = []; cache = {}; cacheCount = 0; }
      newSheet();
    }
    var slot = { page: cursor.page, x: cursor.x, y: cursor.y };
    cursor.x += w + 2; cursor.row = Math.max(cursor.row, h);
    return slot;
  }
  function hash(a, b) { var h = Math.sin(a * 91.7 + b * 47.3) * 43758.5453; return h - Math.floor(h); }

  // Regiments get a flocked movement tray instead of a flat coloured plate.
  var flock = null;
  function flockPattern(ctx) {
    if (flock) return flock;
    var cv = document.createElement("canvas"); cv.width = cv.height = 96;
    var g = cv.getContext("2d"), rnd = SOVL.R.makeRng(99);
    // a dark, fine-grained base: darker than any battlefield, so painted figures stand out on it
    g.fillStyle = "#1b1e1a"; g.fillRect(0, 0, 96, 96);
    for (var i = 0; i < 1100; i++) { var t = rnd(); g.fillStyle = t < 0.45 ? "rgba(52,58,44,0.5)" : t < 0.8 ? "rgba(34,36,30,0.6)" : "rgba(70,72,58,0.35)"; g.fillRect(rnd() * 96, rnd() * 96, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    flock = ctx.createPattern(cv, "repeat");
    if (flock && flock.setTransform && typeof DOMMatrix !== "undefined") flock.setTransform(new DOMMatrix().scale(1 / 40));
    return flock;
  }
  P.paintsModels = function (u) { return !SOVL.isSingle(u.type) || SOVL.commanderOnly(u); };
  P.drawTray = function (ctx, u, corners, mine) {
    if (SOVL.isSingle(u.type) && !SOVL.commanderOnly(u)) { ctx.fillStyle = mine ? "rgba(20,40,80,0.55)" : "rgba(90,20,20,0.55)"; ctx.fill(); return; }
    ctx.save();
    ctx.fillStyle = flockPattern(ctx) || "#3d3a26"; ctx.fill();
    ctx.fillStyle = mine ? "rgba(46,92,170,0.24)" : "rgba(170,46,46,0.24)"; ctx.fill();
    ctx.lineWidth = 0.11; ctx.strokeStyle = mine ? "rgba(150,200,255,0.85)" : "rgba(255,150,150,0.8)"; ctx.stroke();
    ctx.restore();
  };

  function levelFor(r) {
    var need = (r.scale || 12) * (r.dpr || 1);
    for (var li = 0; li < LEVELS.length; li++) if (LEVELS[li] >= need * 0.95) return LEVELS[li];
    return LEVELS[LEVELS.length - 1];
  }
  // Which sprite a model uses and how it is jittered on its base.
  function modelSprite(r, u, bw, bd, rank, file, files) {
    var cmdOnly = SOVL.commanderOnly(u), cmd = null, role = "r";
    var mid = Math.floor(files / 2);
    if (cmdOnly) { cmd = u.commander; role = "cmd"; }
    else if (rank === 0 && u.commander && u.commander.alive && file === mid) { cmd = u.commander; role = "cmd"; }
    else if (rank === 0 && files > 1 && file === Math.max(0, mid - 1) && u.models >= 6 && u.type !== "Hounds" && u.type !== "Monstrous Infantry") role = "std";
    else if (rank === 0) role = "f";
    // commanders who share a regiment's base size are painted on it; others keep the unit's model
    if (cmd && !cmdOnly) { var ct = cmd.def.type; if (ct !== u.type && !(ct === "Infantry" && u.type === "Infantry Large")) cmd = null; }
    // model space is the screen turned by th, so the sun sits at SUN - th there; quantise th to 45 degrees
    // while a unit turns, light it for its final facing so no sprites are painted mid-turn
    var th = (u._tw ? u.a : u._ra != null ? u._ra : u.a) + Math.PI / 2, bucket = ((Math.round(th / (Math.PI / 4)) % 8) + 8) % 8;
    var seed = u.uid * 131 + rank * 17 + file, v = Math.floor(hash(seed, 3) * 3);
    var ppi = levelFor(r); // the sprite resolution closest above what the screen shows, like a mipmap
    var sp = spriteFor(u, role, v, rank, bw, bd, bucket, cmd && (cmdOnly || role === "cmd") ? { def: cmd.def, weapon: cmd.weapon, ranged: cmd.ranged, props: cmd.props || [], mount: cmdOnly && /Cavalry/.test(cmd.def.type) } : null, ppi);
    if (sp === "failed") return null;
    var jr = (hash(seed, 13) - 0.5) * 0.05;
    if (u.fleeing) jr += (hash(seed, 17) - 0.5) * 0.8;
    var jx = (hash(seed, 7) - 0.5) * bw * 0.04, jy = (hash(seed, 11) - 0.5) * bd * 0.03;
    if (SOVL.FX && SOVL.FX.animating(u)) { var po = SOVL.FX.pose(u, rank, file, bw, bd); jx += po.x; jy += po.y; jr += po.r; }
    return { sp: sp, jx: jx, jy: jy, jr: jr, exact: sp.overhead || sp.bucket === bucket };
  }
  function stamp(ctx, m) {
    ctx.save(); ctx.translate(m.jx, m.jy); ctx.rotate(m.jr);
    ctx.drawImage(m.sp.cv, m.sp.sx, m.sp.sy, m.sp.sw, m.sp.sh, -m.sp.ox, -m.sp.oy, m.sp.w, m.sp.h);
    ctx.restore();
  }
  P.drawModelSprite = function (ctx, u, bw, bd, rank, file, files) {
    if (SOVL.isSingle(u.type) && !SOVL.commanderOnly(u)) {
      ctx.save();
      try {
        if (SOVL.FX && SOVL.FX.animating(u)) { var po = SOVL.FX.pose(u, 0, 0, bw, bd); ctx.translate(po.x, po.y * 0.6); ctx.rotate(po.r * 0.5); }
        if (SOVL.RealisticArt && SOVL.RealisticArt.draw(ctx, u, bw, bd, "r", null)) return true;
        return previous ? previous.call(this, ctx, u, bw, bd) : false;
      } finally { ctx.restore(); }
    }
    var m = modelSprite(this, u, bw, bd, rank || 0, file || 0, files || 1);
    if (!m) return previous ? previous.call(this, ctx, u, bw, bd) : false;
    stamp(ctx, m);
    return true;
  };
  // A whole regiment is baked into one image in its own frame (x right, forward up) and
  // re-baked only when its models, formation, light direction or zoom level change.
  P.drawRegiment = function (ctx, u, rect, bw, bd, files, rk, count) {
    if (SOVL.isSingle(u.type) && !SOVL.commanderOnly(u)) return false;
    if (SOVL.FX && SOVL.FX.animating(u)) return false; // moving or fighting: draw each model with its pose
    var th = rect.a + Math.PI / 2, bucket = ((Math.round(th / (Math.PI / 4)) % 8) + 8) % 8, ppi = levelFor(this);
    var cmdStar = u.commander && u.commander.alive && !SOVL.commanderOnly(u);
    var key = [SOVL.RealisticArt ? SOVL.RealisticArt.revision() : 0, u.weapon, u.ranged, count, files, rk, bucket, ppi, cmdStar ? 1 : 0, u.fleeing ? 1 : 0, u.banner ? 1 : 0, bw.toFixed(2), bd.toFixed(2)].join("|");
    var comp = u._comp;
    if (!comp || comp.key !== key || comp.dirty) {
      var padX = bw * 0.9, front = Math.max(bw * 1.8, 0.5) + 0.2, back = bd * 0.4;
      var W = u.w + 2 * padX, H = u.d + front + back, cv = comp && comp.cv && comp.ppi === ppi ? comp.cv : document.createElement("canvas");
      cv.width = Math.ceil(W * ppi); cv.height = Math.ceil(H * ppi);
      var g = cv.getContext("2d"), dirty = false, n = 0;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.scale(ppi, ppi); g.translate(u.w / 2 + padX, u.d / 2 + front);
      for (var j = 0; j < rk && n < count; j++) for (var k = 0; k < files && n < count; k++, n++) {
        var m = modelSprite(this, u, bw, bd, j, k, files);
        if (!m) return false;
        if (!m.exact) dirty = true;
        var mx = (k - (files - 1) / 2) * bw, my = -(u.d / 2 - (j + 0.5) * bd);
        g.save(); g.translate(mx, my); stamp(g, m);
        if (cmdStar && j === 0 && k === Math.floor(files / 2)) { g.fillStyle = "#ffd24a"; star(g, bw * 0.34, bd * 0.34, Math.min(bw, bd) * 0.17); g.strokeStyle = "#3a2a00"; g.lineWidth = 0.03; g.stroke(); }
        g.restore();
      }
      comp = u._comp = { key: key, cv: cv, ppi: ppi, ox: u.w / 2 + padX, oy: u.d / 2 + front, w: cv.width / ppi, h: cv.height / ppi, dirty: dirty };
    }
    ctx.save(); ctx.translate(rect.x, rect.y); ctx.rotate(th);
    ctx.drawImage(comp.cv, -comp.ox, -comp.oy, comp.w, comp.h);
    ctx.restore();
    return true;
  };
  function star(g, x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  var draw = P.draw;
  P.draw = function () { SOVL.ModelArt.lastSpent = spent; spent = 0; return draw.apply(this, arguments); };
  SOVL.ModelArt = { cache: function () { return cache; }, sheets: function () { return sheets.length; } };
})();
