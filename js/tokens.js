// Painted tokens for single-model units: dragons, giants, the spider, chariots, the
// dreadnought and every war machine. Drawn top-down in the model's local frame (forward is
// up, -y), shaded by the same upper-left sun as the terrain, with a shadow cast in screen space.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.Renderer) return;
  var P = SOVL.Renderer.prototype, previous = P.drawModelSprite;
  var SUN_X = -0.646, SUN_Y = -0.763; // toward the sun, screen space
  var L = { x: 0, y: 0 }; // toward the sun in the token's local frame, set per draw
  var ctx = null;

  function css(c, k, a) {
    k = k == null ? 1 : k;
    var v = [0, 1, 2].map(function (i) { return Math.round(Math.max(0, Math.min(1, c[i] * k)) * 255); });
    return a == null ? "rgb(" + v.join(",") + ")" : "rgba(" + v.join(",") + "," + a + ")";
  }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  // a rounded solid, lit from the sun
  function solid(path, col, cx, cy, r, edge) {
    var g = ctx.createRadialGradient(cx + L.x * r * 0.5, cy + L.y * r * 0.5, r * 0.05, cx, cy, r * 1.1);
    g.addColorStop(0, css(col, 1.4)); g.addColorStop(0.5, css(col, 1)); g.addColorStop(1, css(col, 0.5));
    ctx.beginPath(); path(); ctx.fillStyle = g; ctx.fill();
    if (edge !== false) { ctx.lineWidth = 0.022; ctx.strokeStyle = "rgba(10,8,6,0.6)"; ctx.stroke(); }
  }
  function ell(x, y, rx, ry, rot) { return function () { ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }; }
  function rrect(x, y, w, h, r) { return function () { if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }; }
  function box(x, y, w, h, col, r) { solid(rrect(x, y, w, h, r || Math.min(w, h) * 0.25), col, x + w / 2, y + h / 2, Math.max(w, h) * 0.6); }
  function ball(x, y, rx, ry, col, rot) { solid(ell(x, y, rx, ry, rot), col, x, y, Math.max(rx, ry)); }
  // a limb or beam: a thick stroke with a lit upper edge
  function limb(pts, w, col) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = "rgba(10,8,6,0.65)"; ctx.lineWidth = w + 0.04; ctx.stroke();
    ctx.strokeStyle = css(col, 0.85); ctx.lineWidth = w; ctx.stroke();
    ctx.translate(L.x * w * 0.18, L.y * w * 0.18); ctx.strokeStyle = css(col, 1.3, 0.8); ctx.lineWidth = w * 0.4; ctx.stroke();
    ctx.restore();
  }
  // a cylinder seen from above, lit across its width (barrels, logs, arms)
  function cylinder(x0, y0, x1, y1, w0, w1, col) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    var side = nx * L.x + ny * L.y > 0 ? 1 : -1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, wm = Math.max(w0, w1) / 2;
    var g = ctx.createLinearGradient(mx - nx * wm * side, my - ny * wm * side, mx + nx * wm * side, my + ny * wm * side);
    g.addColorStop(0, css(col, 0.45)); g.addColorStop(0.55, css(col, 1)); g.addColorStop(0.8, css(col, 1.55)); g.addColorStop(1, css(col, 0.9));
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.02; ctx.strokeStyle = "rgba(10,8,6,0.6)"; ctx.stroke();
  }
  function crewman(x, y, s, cloth, skin) { ball(x, y + s * 0.02, s * 0.09, s * 0.06, cloth); ball(x, y - s * 0.01, s * 0.045, s * 0.045, skin); }
  function wheel(x, y, w, len, wood) {
    box(x - w / 2, y - len / 2, w, len, wood, w * 0.4);
    ctx.strokeStyle = "rgba(20,16,12,0.55)"; ctx.lineWidth = 0.018;
    for (var k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - len / 2 + (len * k) / 4); ctx.lineTo(x + w / 2, y - len / 2 + (len * k) / 4); ctx.stroke(); }
    ctx.strokeStyle = "rgba(60,60,66,0.9)"; ctx.lineWidth = 0.02; ctx.strokeRect(x - w / 2, y - len / 2, w, len);
  }

  var WOOD = [0.44, 0.3, 0.17], DARKWOOD = [0.3, 0.2, 0.12], IRON = [0.36, 0.37, 0.4], BRONZE = [0.66, 0.47, 0.22], BONE = [0.82, 0.77, 0.64], SKIN = [0.78, 0.6, 0.46], STONE = [0.55, 0.53, 0.5];
  var FACE = { empires_of_men: SKIN, dwarf_holds: [0.8, 0.62, 0.48], elven_conclaves: [0.86, 0.74, 0.62], greenskin_tribes: [0.42, 0.55, 0.26], dead_nations: BONE };

  function dragon(s, body, wing, bone, eye) {
    // tail first, then wings, body, neck and head
    limb([0, s * 0.18, s * 0.06, s * 0.36, s * 0.2, s * 0.5, s * 0.34, s * 0.52], s * 0.07, body);
    [-1, 1].forEach(function (side) {
      var sx = side;
      ctx.beginPath();
      ctx.moveTo(sx * s * 0.08, -s * 0.12);
      ctx.bezierCurveTo(sx * s * 0.3, -s * 0.46, sx * s * 0.58, -s * 0.44, sx * s * 0.7, -s * 0.28);
      ctx.quadraticCurveTo(sx * s * 0.6, -s * 0.12, sx * s * 0.62, s * 0.02);
      ctx.quadraticCurveTo(sx * s * 0.5, -s * 0.02, sx * s * 0.44, s * 0.1);
      ctx.quadraticCurveTo(sx * s * 0.33, s * 0.04, sx * s * 0.26, s * 0.16);
      ctx.quadraticCurveTo(sx * s * 0.17, s * 0.08, sx * s * 0.08, s * 0.14);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, 0, sx * s * 0.7, 0);
      var lit = sx * L.x > 0 ? 1.25 : 0.85;
      g.addColorStop(0, css(wing, 0.8 * lit)); g.addColorStop(0.6, css(wing, 1.05 * lit)); g.addColorStop(1, css(wing, 0.7 * lit));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.025; ctx.strokeStyle = "rgba(10,8,6,0.7)"; ctx.stroke();
      if (bone) { ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(0,0,0,0.35)"; for (var h = 0; h < 5; h++) { ctx.beginPath(); ctx.arc(sx * s * (0.25 + 0.09 * h), s * (0.02 - 0.03 * h), s * 0.035, 0, 6.28); ctx.fill(); } ctx.restore(); }
      // wing bones from the shoulder to each scallop
      [[0.7, -0.28], [0.62, 0.02], [0.44, 0.1], [0.26, 0.16]].forEach(function (p) {
        limb([sx * s * 0.1, -s * 0.12, sx * s * 0.34, -s * 0.3, sx * s * p[0], s * p[1]], s * 0.022, bone ? BONE : body);
      });
    });
    ball(0, s * 0.03, s * 0.13, s * 0.27, body);
    if (bone) { ctx.strokeStyle = "rgba(40,30,40,0.7)"; ctx.lineWidth = 0.02; for (var r = -2; r <= 2; r++) { ctx.beginPath(); ctx.moveTo(-s * 0.11, s * (0.03 + r * 0.07)); ctx.quadraticCurveTo(0, s * (0.06 + r * 0.07), s * 0.11, s * (0.03 + r * 0.07)); ctx.stroke(); } }
    for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-s * 0.025, s * (0.2 - k * 0.09)); ctx.lineTo(0, s * (0.16 - k * 0.09)); ctx.lineTo(s * 0.025, s * (0.2 - k * 0.09)); ctx.fillStyle = css(body, 0.55); ctx.fill(); }
    limb([0, -s * 0.18, 0, -s * 0.34], s * 0.09, body);
    ball(0, -s * 0.42, s * 0.075, s * 0.11, body);
    limb([-s * 0.05, -s * 0.44, -s * 0.1, -s * 0.36], s * 0.02, BONE); limb([s * 0.05, -s * 0.44, s * 0.1, -s * 0.36], s * 0.02, BONE);
    ctx.save(); ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 6; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath(); ctx.arc(-s * 0.035, -s * 0.46, s * 0.016, 0, 6.28); ctx.arc(s * 0.035, -s * 0.46, s * 0.016, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function giant(s, skin, cloth, club) {
    ctx.save(); ctx.scale(1.35, 1.35);
    limb([s * 0.26, -s * 0.02, s * 0.3, -s * 0.26], s * 0.1, skin);
    cylinder(s * 0.29, -s * 0.2, s * 0.26, -s * 0.52, s * 0.07, s * 0.13, club);
    ball(s * 0.29, -s * 0.24, s * 0.06, s * 0.06, skin);
    limb([-s * 0.28, -s * 0.02, -s * 0.3, -s * 0.22], s * 0.1, skin);
    ball(-s * 0.3, -s * 0.24, s * 0.06, s * 0.06, skin);
    ball(0, s * 0.05, s * 0.34, s * 0.19, cloth);
    ctx.strokeStyle = "rgba(20,14,8,0.5)"; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.1); ctx.quadraticCurveTo(0, s * 0.2, s * 0.3, s * 0.1); ctx.stroke();
    ball(0, -s * 0.03, s * 0.12, s * 0.12, skin);
    ctx.fillStyle = "rgba(40,28,18,0.75)"; ctx.beginPath(); ctx.arc(0, -s * 0.01, s * 0.11, 0.1, Math.PI - 0.1); ctx.fill();
    ctx.restore();
  }
  function spider(bw, bd) {
    var body = [0.2, 0.18, 0.17], legs = [0.26, 0.22, 0.2];
    [-1, 1].forEach(function (sd) {
      for (var k = 0; k < 4; k++) {
        var ay = -bd * 0.16 + k * bd * 0.05, kx = sd * bw * (0.34 + (k === 1 || k === 2 ? 0.06 : 0)), ky = ay - bd * 0.1 + k * bd * 0.07, fx = sd * bw * 0.47, fy = ay - bd * 0.2 + k * bd * 0.14;
        limb([sd * bw * 0.08, ay, kx, ky, fx, fy], bw * 0.045, legs);
      }
    });
    ball(0, bd * 0.2, bw * 0.3, bd * 0.24, body);
    ctx.fillStyle = "rgba(170,30,24,0.9)"; ctx.beginPath(); ctx.moveTo(0, bd * 0.08); ctx.lineTo(bw * 0.07, bd * 0.18); ctx.lineTo(0, bd * 0.2); ctx.lineTo(bw * 0.07, bd * 0.3); ctx.lineTo(-bw * 0.07, bd * 0.3); ctx.lineTo(0, bd * 0.2); ctx.lineTo(-bw * 0.07, bd * 0.18); ctx.closePath(); ctx.fill();
    ball(0, -bd * 0.13, bw * 0.2, bd * 0.12, body);
    ctx.save(); ctx.fillStyle = "#e9d98a"; ctx.shadowColor = "#ffe27a"; ctx.shadowBlur = 5; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    [-0.06, -0.02, 0.02, 0.06].forEach(function (x) { ctx.beginPath(); ctx.arc(bw * x, -bd * 0.22, bw * 0.014, 0, 6.28); ctx.fill(); });
    ctx.restore();
    limb([-bw * 0.04, -bd * 0.24, -bw * 0.03, -bd * 0.3], bw * 0.03, [0.1, 0.1, 0.1]); limb([bw * 0.04, -bd * 0.24, bw * 0.03, -bd * 0.3], bw * 0.03, [0.1, 0.1, 0.1]);
  }
  function cannon(s, metal, cloth, face, inferno) {
    box(-s * 0.05, s * 0.05, s * 0.1, s * 0.4, DARKWOOD, s * 0.02);
    box(-s * 0.13, -s * 0.18, s * 0.06, s * 0.34, WOOD); box(s * 0.07, -s * 0.18, s * 0.06, s * 0.34, WOOD);
    cylinder(-s * 0.26, 0, s * 0.26, 0, s * 0.035, s * 0.035, IRON);
    wheel(-s * 0.27, 0, s * 0.07, s * 0.36, WOOD); wheel(s * 0.27, 0, s * 0.07, s * 0.36, WOOD);
    cylinder(0, s * 0.14, 0, -s * 0.46, s * 0.17, s * 0.11, metal);
    ball(0, s * 0.17, s * 0.045, s * 0.045, metal);
    cylinder(0, -s * 0.41, 0, -s * 0.47, s * 0.14, s * 0.14, metal);
    if (inferno) { ctx.save(); ctx.fillStyle = "rgba(255,140,40,0.85)"; ctx.shadowColor = "#ff8a2a"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.beginPath(); ctx.arc(0, -s * 0.47, s * 0.05, 0, 6.28); ctx.fill(); ctx.restore(); }
    crewman(-s * 0.2, s * 0.38, s, cloth, face); crewman(s * 0.2, s * 0.36, s, cloth, face);
  }
  function mortar(s, metal, cloth, face) {
    box(-s * 0.2, -s * 0.16, s * 0.4, s * 0.34, WOOD, s * 0.03);
    cylinder(0, s * 0.06, 0, -s * 0.2, s * 0.26, s * 0.3, metal);
    ctx.fillStyle = "#15120f"; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.1, s * 0.05, 0, 0, 6.28); ctx.fill();
    crewman(-s * 0.24, s * 0.34, s, cloth, face); crewman(s * 0.22, s * 0.32, s, cloth, face);
  }
  function boltThrower(s, wood, cloth, face) {
    limb([-s * 0.18, s * 0.2, 0, s * 0.02, s * 0.18, s * 0.2], s * 0.04, DARKWOOD);
    box(-s * 0.045, -s * 0.36, s * 0.09, s * 0.66, wood, s * 0.02);
    ctx.save(); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-s * 0.44, -s * 0.08); ctx.quadraticCurveTo(0, -s * 0.36, s * 0.44, -s * 0.08);
    ctx.strokeStyle = "rgba(10,8,6,0.7)"; ctx.lineWidth = s * 0.065; ctx.stroke(); ctx.strokeStyle = css(wood, 1.1); ctx.lineWidth = s * 0.045; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.44, -s * 0.08); ctx.lineTo(0, s * 0.12); ctx.lineTo(s * 0.44, -s * 0.08); ctx.strokeStyle = "rgba(230,220,190,0.85)"; ctx.lineWidth = 0.018; ctx.stroke();
    ctx.restore();
    cylinder(0, s * 0.1, 0, -s * 0.44, s * 0.03, s * 0.03, [0.5, 0.42, 0.3]);
    ctx.fillStyle = css(IRON, 1.2); ctx.beginPath(); ctx.moveTo(0, -s * 0.52); ctx.lineTo(s * 0.035, -s * 0.43); ctx.lineTo(-s * 0.035, -s * 0.43); ctx.closePath(); ctx.fill();
    crewman(-s * 0.2, s * 0.38, s, cloth, face); crewman(s * 0.2, s * 0.36, s, cloth, face);
  }
  function catapult(s, wood, cloth, face, shot, skull) {
    box(-s * 0.26, -s * 0.3, s * 0.07, s * 0.62, wood); box(s * 0.19, -s * 0.3, s * 0.07, s * 0.62, wood);
    box(-s * 0.26, s * 0.08, s * 0.52, s * 0.06, wood); box(-s * 0.26, -s * 0.22, s * 0.52, s * 0.06, wood);
    cylinder(0, s * 0.2, 0, -s * 0.36, s * 0.07, s * 0.05, DARKWOOD);
    ball(0, -s * 0.4, s * 0.09, s * 0.08, DARKWOOD);
    ball(0, -s * 0.4, s * 0.065, s * 0.065, shot);
    if (skull) { ctx.fillStyle = "#1b1410"; ctx.beginPath(); ctx.arc(-s * 0.022, -s * 0.41, s * 0.016, 0, 6.28); ctx.arc(s * 0.022, -s * 0.41, s * 0.016, 0, 6.28); ctx.fill(); }
    crewman(-s * 0.36, s * 0.3, s, cloth, face); crewman(s * 0.36, s * 0.28, s, cloth, face);
  }
  function gyrocopter(s, now) {
    limb([0, s * 0.12, 0, s * 0.42], s * 0.05, BRONZE);
    box(-s * 0.12, s * 0.36, s * 0.24, s * 0.08, BRONZE, s * 0.02);
    ball(0, -s * 0.02, s * 0.13, s * 0.2, BRONZE);
    ball(0, -s * 0.05, s * 0.06, s * 0.06, FACE.dwarf_holds);
    ctx.fillStyle = "rgba(200,160,110,0.9)"; ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.05, 0.2, Math.PI - 0.2); ctx.fill();
    var g = ctx.createRadialGradient(0, -s * 0.05, s * 0.05, 0, -s * 0.05, s * 0.5);
    g.addColorStop(0, "rgba(220,220,210,0.05)"); g.addColorStop(0.85, "rgba(220,220,210,0.18)"); g.addColorStop(1, "rgba(220,220,210,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.5, 0, 6.28); ctx.fill();
    var a = (now || 0) / 90;
    [a, a + Math.PI / 2].forEach(function (b) { limb([Math.cos(b) * s * 0.47, -s * 0.05 + Math.sin(b) * s * 0.47, -Math.cos(b) * s * 0.47, -s * 0.05 - Math.sin(b) * s * 0.47], s * 0.03, IRON); });
    ball(0, -s * 0.05, s * 0.035, s * 0.035, IRON);
  }
  function chariot(bw, bd, beast, cloth, face, boar) {
    limb([0, -bd * 0.02, 0, -bd * 0.34], bw * 0.04, DARKWOOD);
    [-1, 1].forEach(function (sd) {
      var x = sd * bw * 0.17;
      if (boar) { ball(x, -bd * 0.24, bw * 0.12, bd * 0.12, beast); ball(x, -bd * 0.38, bw * 0.07, bd * 0.06, beast); limb([x - bw * 0.04, -bd * 0.4, x - bw * 0.06, -bd * 0.44], bw * 0.02, BONE); limb([x + bw * 0.04, -bd * 0.4, x + bw * 0.06, -bd * 0.44], bw * 0.02, BONE); }
      else {
        ball(x, -bd * 0.2, bw * 0.1, bd * 0.14, beast);
        cylinder(x, -bd * 0.3, x, -bd * 0.38, bw * 0.08, bw * 0.06, beast);
        ball(x, -bd * 0.405, bw * 0.045, bd * 0.045, beast);
        limb([x, -bd * 0.3, x, -bd * 0.37], bw * 0.018, css === null ? beast : [beast[0] * 0.45, beast[1] * 0.42, beast[2] * 0.4]);
        limb([x - bw * 0.03, -bd * 0.42, x - bw * 0.04, -bd * 0.44], bw * 0.015, beast); limb([x + bw * 0.03, -bd * 0.42, x + bw * 0.04, -bd * 0.44], bw * 0.015, beast);
        limb([x, -bd * 0.07, x + bw * 0.02, -bd * 0.02], bw * 0.02, [beast[0] * 0.5, beast[1] * 0.48, beast[2] * 0.45]);
      }
    });
    wheel(-bw * 0.36, bd * 0.18, bw * 0.08, bd * 0.2, WOOD); wheel(bw * 0.36, bd * 0.18, bw * 0.08, bd * 0.2, WOOD);
    if (boar) { limb([-bw * 0.4, bd * 0.18, -bw * 0.5, bd * 0.16], bw * 0.025, IRON); limb([bw * 0.4, bd * 0.18, bw * 0.5, bd * 0.16], bw * 0.025, IRON); }
    box(-bw * 0.3, bd * 0.04, bw * 0.6, bd * 0.3, cloth, bw * 0.08);
    ctx.fillStyle = css(cloth, 0.55); if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-bw * 0.24, bd * 0.08, bw * 0.48, bd * 0.22, bw * 0.05); ctx.fill(); }
    crewman(-bw * 0.1, bd * 0.18, bw, cloth, face); crewman(bw * 0.11, bd * 0.2, bw, cloth, face);
  }
  function dreadnought(bw, bd, steel, now) {
    box(-bw * 0.42, -bd * 0.36, bw * 0.84, bd * 0.76, steel, bw * 0.12);
    ctx.strokeStyle = "rgba(15,15,20,0.55)"; ctx.lineWidth = 0.02;
    for (var k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-bw * 0.42, -bd * 0.36 + (bd * 0.76 * k) / 5); ctx.lineTo(bw * 0.42, -bd * 0.36 + (bd * 0.76 * k) / 5); ctx.stroke(); }
    ctx.fillStyle = "rgba(230,220,200,0.6)";
    for (var r = 0; r < 6; r++) { var y = -bd * 0.32 + (r * bd * 0.68) / 5; ctx.beginPath(); ctx.arc(-bw * 0.37, y, 0.018, 0, 6.28); ctx.arc(bw * 0.37, y, 0.018, 0, 6.28); ctx.fill(); }
    cylinder(0, -bd * 0.3, 0, -bd * 0.48, bw * 0.13, bw * 0.1, IRON);
    ball(0, -bd * 0.02, bw * 0.28, bw * 0.28, steel);
    ball(0, -bd * 0.02, bw * 0.13, bw * 0.13, BRONZE);
    ball(0, bd * 0.26, bw * 0.08, bw * 0.08, [0.18, 0.18, 0.2]);
    var t = ((now || 0) / 1400) % 1;
    ctx.fillStyle = "rgba(200,200,200," + (0.35 * (1 - t)) + ")"; ctx.beginPath(); ctx.arc(bw * 0.05 * t, bd * 0.26 + bd * 0.1 * t, bw * (0.08 + 0.12 * t), 0, 6.28); ctx.fill();
  }

  function paint(u, bw, bd, now) {
    var id = u.id || "", f = u.faction, info = SOVL.FACTION_INFO[f], cloth = hexRgb(info.color), face = FACE[f] || SKIN, s = Math.min(bw, bd);
    if (/dragon/.test(id)) {
      if (f === "dead_nations") return dragon(s, BONE, [0.34, 0.28, 0.34], true, "#c79bff");
      if (f === "elven_conclaves") return dragon(s, [0.2, 0.45, 0.4], [0.3, 0.55, 0.48], false, "#ffe27a");
      return dragon(s, [0.55, 0.17, 0.12], [0.62, 0.28, 0.16], false, "#ffd24a");
    }
    if (/spider/.test(id)) return spider(bw, bd);
    if (/giant/.test(id)) return f === "dead_nations" ? giant(s, [0.55, 0.6, 0.5], [0.3, 0.27, 0.3], [0.7, 0.66, 0.56]) : giant(s, [0.72, 0.56, 0.42], [0.42, 0.3, 0.18], DARKWOOD);
    if (/chariot/.test(id)) return f === "greenskin_tribes" ? chariot(bw, bd, [0.36, 0.25, 0.18], cloth, face, true) : chariot(bw, bd, [0.76, 0.75, 0.73], cloth, face, false);
    if (/dreadnought/.test(id) || u.type === "War Wagon") return dreadnought(bw, bd, [0.4, 0.46, 0.55], now);
    if (/flying_machine|gyro/.test(id)) return gyrocopter(s, now);
    if (/mortar/.test(id)) return mortar(s, BRONZE, cloth, face);
    if (/bolt/.test(id)) return boltThrower(s, f === "elven_conclaves" ? [0.6, 0.52, 0.38] : WOOD, cloth, face);
    if (/stone|catapult|lobber|trebuchet/.test(id)) return catapult(s, f === "dead_nations" ? BONE : WOOD, cloth, face, f === "dead_nations" ? BONE : STONE, f === "dead_nations");
    if (/cannon/.test(id)) return cannon(s, f === "dwarf_holds" ? BRONZE : IRON, cloth, face, /inferno/.test(id));
    if (u.type === "War Machine") return cannon(s, IRON, cloth, face, false);
    if (u.type === "Chariot") return chariot(bw, bd, [0.5, 0.36, 0.24], cloth, face, false);
    return giant(s, face, cloth, DARKWOOD);
  }

  P.drawModelSprite = function (c, u, bw, bd) {
    if (!SOVL.isSingle(u.type) || SOVL.commanderOnly(u)) return previous ? previous.call(this, c, u, bw, bd) : false;
    ctx = c;
    var th = (u._ra != null ? u._ra : u.a) + Math.PI / 2, ct = Math.cos(th), st = Math.sin(th);
    L.x = ct * SUN_X + st * SUN_Y; L.y = -st * SUN_X + ct * SUN_Y;
    var px = (this.scale || 12) * (this.dpr || 1);
    c.save();
    // a dark earthen base with a rim in the army's colour
    var round = Math.abs(bw - bd) < 0.01;
    c.beginPath(); if (round) c.ellipse(0, 0, bw * 0.47, bd * 0.47, 0, 0, Math.PI * 2); else if (c.roundRect) c.roundRect(-bw * 0.47, -bd * 0.47, bw * 0.94, bd * 0.94, bw * 0.2); else c.rect(-bw * 0.47, -bd * 0.47, bw * 0.94, bd * 0.94);
    var bg = c.createRadialGradient(L.x * bw * 0.2, L.y * bd * 0.2, 0, 0, 0, Math.max(bw, bd) * 0.6);
    bg.addColorStop(0, "rgba(78,70,52,0.95)"); bg.addColorStop(1, "rgba(38,34,26,0.95)");
    c.fillStyle = bg; c.fill();
    c.lineWidth = 0.06; c.strokeStyle = SOVL.FACTION_INFO[u.faction].color; c.stroke();
    // the model casts its shadow toward the lower right of the screen
    c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 0.12 * px; c.shadowOffsetX = 0.1 * px; c.shadowOffsetY = 0.12 * px;
    try { paint(u, bw, bd, performance.now()); } finally { c.restore(); }
    ctx = null;
    return true;
  };
})();
