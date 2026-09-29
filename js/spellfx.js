// Spell and magic effects. Every cast begins with a rune circle kindling under the caster while
// motes spiral in; a miscast implodes into violet lightning and a fizzle gutters out in smoke.
// Each spell then has its own look: a roaring fireball, a bolt of shadow, a rift torn in the air,
// a swarm of snapping mouths, a drifting plague cloud, a stamped sigil of ruin, threads of an
// arcane web, frost shards, beams and pillars of light for blessings, soul wisps for healing and
// a grave-portal from which summoned dead climb. Lasting spells leave an aura on the unit for as
// long as they hold. Impacts land before the damage shows (see FX.incoming in js/fx.js).
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.FX || !SOVL.FX.h) return;
  var FX = SOVL.FX, H = FX.h, G = SOVL.G;
  var add = H.add, dust = H.dust, smoke = H.smoke, sparks = H.sparks, glow = H.glow, ring = H.ring, motes = H.motes, shake = H.shake;
  var rpos = H.rpos, now = H.now, rnd = H.rnd, clamp = H.clamp, ease = H.ease, at = H.at, expect = H.expect, unitOf = H.unitOf;
  var TAU = Math.PI * 2;
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")"; }
  function px(r, n) { return (n || 1) / (r.scale || 12); } // n screen pixels in table inches
  function sfx(name, o) { var ui = H.UI(); if (ui && ui.sfx) ui.sfx.play(name, o || {}); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------- the look of each spell ----------
  var LOOK = {
    "Fireball": { col: [255, 130, 35], hot: [255, 232, 170], shot: "fireball", speed: 20, snd: ["fire", 0.9] },
    "Shadow Bolt": { col: [150, 80, 235], hot: [225, 190, 255], shot: "shadow", speed: 22, snd: ["spell", 0.6] },
    "Reality Rift": { col: [255, 80, 215], hot: [255, 225, 250], rift: true, snd: ["spell", 0.5] },
    "Thousand Mouths": { col: [150, 205, 60], hot: [235, 255, 170], shot: "maw", speed: 15, snd: ["flesh", 1] },
    "Plague": { col: [135, 185, 55], hot: [215, 240, 150], shot: "miasma", speed: 10, aura: "plague", snd: ["spell", 0.7] },
    "Hex Of Ruin": { col: [230, 45, 45], hot: [255, 185, 160], shot: "shadow", speed: 18, sigil: true, aura: "ruin", snd: ["spell", 0.75] },
    "Arcane Web": { col: [120, 185, 255], hot: [230, 245, 255], threads: true, aura: "web", snd: ["spell", 1.3] },
    "Frost Ward": { col: [160, 212, 255], hot: [240, 250, 255], shot: "frost", speed: 30, aura: "frost", snd: ["shield", 1.5] },
    "Divine Favour": { col: [255, 215, 110], hot: [255, 250, 225], beam: true, aura: "favour", snd: ["spell", 1.25] },
    "Radiant Shield": { col: [255, 232, 160], hot: [255, 255, 235], beam: true, aura: "shield", snd: ["spell", 1.35] },
    "Shroud": { col: [150, 150, 178], hot: [225, 225, 240], beam: true, aura: "shroud", snd: ["spell", 0.8] },
    "Fiery Blades": { col: [255, 115, 35], hot: [255, 222, 150], beam: true, aura: "blades", snd: ["fire", 1.2] },
    "Primal Fury": { col: [230, 55, 35], hot: [255, 180, 140], beam: true, aura: "fury", snd: ["spell", 0.9] },
    "Wildform": { col: [110, 215, 85], hot: [220, 255, 190], beam: true, aura: "wild", snd: ["spell", 0.95] },
    "Unholy Vigour": { col: [110, 225, 145], hot: [215, 255, 225], beam: true, aura: "unholy", snd: ["spell", 0.7] },
    "Reanimate": { col: [110, 255, 165], hot: [225, 255, 240], heal: true, snd: ["spell", 1.1] },
    "Raise Dead": { col: [100, 250, 140], hot: [215, 255, 225], summon: true, snd: ["spell", 0.55] }
  };
  function look(name) {
    if (LOOK[name]) return LOOK[name];
    var S = SOVL.SPELLS[name] || {};
    if (S.kind === "bolt") return LOOK.Fireball;
    if (S.kind === "hex") return { col: [170, 90, 255], hot: [230, 205, 255], shot: "shadow", speed: 20, sigil: true, snd: ["spell", 0.8] };
    if (S.kind === "heal") return LOOK.Reanimate;
    if (S.kind === "summon") return LOOK["Raise Dead"];
    return { col: [255, 220, 120], hot: [255, 250, 225], beam: true, snd: ["spell", 1.2] };
  }
  function spellOf(spec) {
    if (spec.spell) return spec.spell;
    var m = / casts (.+)$/.exec(spec.label || ""); return m ? m[1] : "";
  }

  // ---------- shared pieces ----------
  // where the wizard stands: the commander fights in the middle of the front rank
  function casterPoint(u) {
    var rp = rpos(u);
    if (SOVL.commanderOnly(u) || SOVL.isSingle(u.type)) return { x: rp.x, y: rp.y };
    var f = G.fwd(rp.a), bd = u.typeInfo && u.typeInfo.base ? u.typeInfo.base[1] * SOVL.MM : 0.8, o = rp.d / 2 - bd / 2;
    return { x: rp.x + f.x * o, y: rp.y + f.y * o };
  }
  function size(u) { return Math.max(u.w || 1, u.d || 1); }
  // a point inside a unit's footprint (fractions of its width and depth from the centre)
  function inside(u, fx, fy) { var rp = rpos(u), f = G.fwd(rp.a), rt = G.right(rp.a), a = fx * rp.w, b = fy * rp.d; return { x: rp.x + rt.x * a + f.x * b, y: rp.y + rt.y * a + f.y * b }; }
  function rune(ctx, seed, s) {
    // an angular glyph of two to four strokes
    var n = 2 + Math.floor(hash(seed) * 3);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s);
    for (var i = 0; i < n; i++) {
      var y0 = (hash(seed + i * 3.1) - 0.5) * 1.6 * s, dir = hash(seed + i * 5.7) < 0.5 ? -1 : 1, len = s * (0.5 + hash(seed + i * 7.3) * 0.5);
      ctx.moveTo(0, y0); ctx.lineTo(dir * len, y0 + (hash(seed + i * 9.9) - 0.5) * s);
    }
    ctx.stroke();
  }
  function star(ctx, n, rad, skip) {
    ctx.beginPath();
    for (var i = 0; i <= n; i++) { var a = -Math.PI / 2 + (i * skip % n) * TAU / n; if (i) ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    ctx.stroke();
  }
  // a magic circle: two rings, a band of runes and a star, turning slowly
  function magicCircle(ctx, r, R, col, hot, a, spin, seed, points) {
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.35);
    g.addColorStop(0, rgba(col, 0.28 * a)); g.addColorStop(0.7, rgba(col, 0.12 * a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, TAU); ctx.fill();
    var lw = Math.max(0.05, px(r, 1.6));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(col, 0.55 * a); ctx.lineWidth = lw * 2.6; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(hot, 0.95 * a); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); ctx.stroke();
    ctx.save(); ctx.rotate(spin);
    ctx.strokeStyle = rgba(hot, 0.85 * a); ctx.lineWidth = lw * 0.8;
    var n = 12;
    for (var i = 0; i < n; i++) { ctx.save(); ctx.rotate(i * TAU / n); ctx.translate(0, -R * 0.89); rune(ctx, seed + i, R * 0.075); ctx.restore(); }
    ctx.restore();
    ctx.save(); ctx.rotate(-spin * 1.6);
    ctx.strokeStyle = rgba(col, 0.8 * a); ctx.lineWidth = lw * 0.9;
    star(ctx, points || 5, R * 0.76, points === 6 ? 1 : 2);
    if (points === 6) { ctx.rotate(Math.PI / 6); star(ctx, 6, R * 0.76, 1); }
    ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
  // particles that spiral toward (or away from) a point
  function swirl(c, n, R, col, dur, inward, delay, lift) {
    for (var i = 0; i < n; i++) {
      (function () {
        var a0 = rnd(0, TAU), r0 = inward ? R * rnd(0.8, 1.3) : R * rnd(0.05, 0.3), r1 = inward ? R * 0.05 : R * rnd(0.9, 1.4), w = rnd(2.5, 4.5) * (Math.random() < 0.5 ? -1 : 1), d = dur * rnd(0.7, 1);
        add({ kind: "glow", x: c.x, y: c.y, vx: 0, vy: 0, r: rnd(0.07, 0.14), grow: 0, dur: d, col: col, a: 0.95, add: true, t0: now() + (delay || 0) + rnd(0, dur * 0.3),
          update: function (p, el) { var q = Math.min(1, el / d), e = ease(q), rr = r0 + (r1 - r0) * e, aa = a0 + w * q; p.x = c.x + Math.cos(aa) * rr; p.y = c.y + Math.sin(aa) * rr - (lift || 0) * q; } });
      })();
    }
  }
  // flickering lightning between two points
  FX.partKinds.arc = function (ctx, p, q, r) {
    var a = (1 - q) * p.a; if (a <= 0.02) return;
    var dx = p.x2 - p.x, dy = p.y2 - p.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = Math.max(4, Math.round(len * 3));
    ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    var pts = [];
    for (var i = 0; i <= segs; i++) { var k = i / segs, j = i && i < segs ? (Math.random() - 0.5) * len * 0.22 : 0; pts.push([p.x + dx * k + nx * j, p.y + dy * k + ny * j]); }
    [[p.col, a * 0.5, px(r, 5)], [[255, 255, 255], a, px(r, 1.5)]].forEach(function (L) {
      ctx.strokeStyle = rgba(L[0], L[1]); ctx.lineWidth = L[2]; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";
  };
  function arc(x, y, x2, y2, col, dur, delay) { add({ kind: "arc", x: x, y: y, x2: x2, y2: y2, vx: 0, vy: 0, col: col, a: 1, dur: dur || 220, t0: now() + (delay || 0) }); }
  // a column of light standing on a unit
  function pillar(u, L, t0, dur, strength) {
    var s = strength || 1;
    FX.overlay.push({ t0: t0, dur: dur, draw: function (ctx, r, q) {
      var rp = rpos(u), W = Math.max(1.2, Math.min(rp.w, 6)) * 0.62, Hh = 4 + size(u) * 0.6, a = s * (q < 0.2 ? q / 0.2 : 1 - (q - 0.2) / 0.8);
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createLinearGradient(rp.x, rp.y, rp.x, rp.y - Hh);
      g.addColorStop(0, rgba(L.hot, 0.42 * a)); g.addColorStop(0.35, rgba(L.col, 0.22 * a)); g.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(rp.x - W, rp.y); ctx.lineTo(rp.x - W * 0.7, rp.y - Hh); ctx.lineTo(rp.x + W * 0.7, rp.y - Hh); ctx.lineTo(rp.x + W, rp.y); ctx.closePath(); ctx.fill();
      var bg = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, size(u) * 0.75);
      bg.addColorStop(0, rgba(L.hot, 0.45 * a)); bg.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(rp.x, rp.y, size(u) * 0.75, 0, TAU); ctx.fill();
    } });
  }

  // ---------- casting ----------
  function channel(r, u, L, mode, T0) {
    var c = casterPoint(u), R = clamp((u.w || 2) * 0.36, 1.4, 2.4), seed = Math.floor(rnd(0, 999)), dur = mode === "ok" ? 1150 : mode === "miscast" ? 900 : 980;
    // drawn over the regiment: the wizard stands in its front rank
    FX.overlay.push({ t0: T0, dur: dur, draw: function (ctx, r, q, el) {
      var inT = Math.min(1, el / 240), out = mode === "ok" ? 720 : mode === "miscast" ? 520 : 460;
      var a = inT * (el > out ? Math.max(0, 1 - (el - out) / (dur - out)) : 1);
      if (mode === "fail" && el > 300) a *= Math.random() < 0.45 ? 0.25 : 0.9;
      var RR = R * (0.8 + 0.2 * ease(inT));
      if (mode === "ok" && el > out) RR *= 1 + (el - out) / 900;
      if (mode === "miscast" && el > 300) RR *= Math.max(0.2, 1 - (el - 300) / 400);
      var col = mode === "miscast" && el > 250 ? [170, 60, 255] : L.col;
      ctx.translate(c.x, c.y); ctx.scale(1, 0.92);
      magicCircle(ctx, r, RR, col, L.hot, a, el * 0.0011 * (mode === "miscast" ? 3 : 1), seed, L.beam || L.heal ? 6 : 5);
    } });
    swirl(c, 16, R * 1.1, L.hot, 620, true, 0, 0.4);
    glow(c.x, c.y, 0.5, L.col, 700);
    return c;
  }
  function miscast(r, u, c, T) {
    at(T - 100, function () { ring(c.x, c.y, 2.8, [190, 110, 255], 260, 0.18); });
    at(T + 120, function () {
      glow(c.x, c.y, 2.2, [200, 120, 255], 420); glow(c.x, c.y, 1.1, [255, 255, 255], 200);
      ring(c.x, c.y, 1, [220, 160, 255], 520, 0.2);
      for (var i = 0; i < 7; i++) { var a = rnd(0, TAU), l = rnd(1.4, 2.8); arc(c.x, c.y, c.x + Math.cos(a) * l, c.y + Math.sin(a) * l, [180, 90, 255], rnd(160, 300), i * 40); }
      for (var j = 0; j < 8; j++) add({ kind: "dust", x: c.x + rnd(-0.4, 0.4), y: c.y + rnd(-0.4, 0.4), vx: rnd(-1.6, 1.6), vy: rnd(-1.6, 1.6) - 0.3, r: 0.4, grow: rnd(1.4, 2.2), dur: rnd(1300, 2000), col: [44, 20, 60], a: 0.55 });
      sparks(c.x, c.y, 18, [210, 150, 255]);
      shake(6, 340); u._recoil = { t0: now(), dur: 460 };
      sfx("spell", { rate: 0.45, vol: 1 }); sfx("fire", { rate: 0.6, vol: 0.7 });
    });
  }
  function fizzle(c, T) {
    at(T - 150, function () {
      for (var i = 0; i < 3; i++) smoke(c.x + rnd(-0.4, 0.4), c.y + rnd(-0.4, 0.4), 0.8, 0, -0.2);
      for (var j = 0; j < 6; j++) add({ kind: "glow", x: c.x + rnd(-0.8, 0.8), y: c.y + rnd(-0.8, 0.8), vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.7), r: 0.08, grow: 0, dur: rnd(500, 900), col: [170, 170, 170], a: 0.6, add: true });
    });
  }
  function onCast(r, b, ev) {
    var sp = ev.spec, res = ev.res || {}, u = unitOf(b, sp.uid), t = sp.targetUid != null ? unitOf(b, sp.targetUid) : null;
    if (!u) return;
    var name = spellOf(sp), L = look(name), T0 = now(), T = T0 + 620;
    var mode = res.miscast ? "miscast" : res.ok ? "ok" : "fail";
    var c = channel(r, u, L, mode, T0);
    FX.lastCast = { uid: u.uid, T: T, L: L, at: T0 };
    if (mode === "miscast") return miscast(r, u, c, T);
    if (mode === "fail") return fizzle(c, T);
    if (!t) return;
    var arrive = release(r, b, u, t, name, L, c, T);
    if (arrive) {
      expect(t, arrive);
      if (L.aura) FX.auraStart[t.uid + "|" + name] = arrive;
    }
  }

  // ---------- release: each spell's own delivery ----------
  function release(r, b, u, t, name, L, c, T) {
    var tp = rpos(t), dist = Math.hypot(tp.x - c.x, tp.y - c.y);
    if (L.summon) return 0;
    if (L.rift) return rift(t, L, T);
    if (L.threads) return threads(u, t, L, c, T);
    if (L.heal) return heal(t, L, T);
    if (L.beam) return beam(u, t, L, c, T);
    var dur = clamp(dist / (L.speed || 18) * 1000, 260, 1400), arrive = T + dur;
    if (L.shot === "maw") {
      for (var i = 0; i < 14; i++) {
        var to = inside(t, rnd(-0.45, 0.45), rnd(-0.4, 0.4)), d2 = dur * rnd(0.85, 1.05);
        FX.shots.push({ kind: "maw", L: L, from: { x: c.x + rnd(-0.4, 0.4), y: c.y + rnd(-0.4, 0.4) }, to: to, t0: T + i * 30, dur: d2, arc: 0, wob: rnd(0.4, 1), wobN: rnd(2, 4), wobP: rnd(0, 6), hit: true, target: t, last: i === 13, seed: i });
        arrive = Math.max(arrive, T + i * 30 + d2);
      }
      at(T, function () { sfx("spell", { rate: 1.4, vol: 0.6 }); });
      return arrive + 40;
    }
    if (L.shot === "frost") {
      for (var j = 0; j < 5; j++) {
        var to2 = inside(t, rnd(-0.35, 0.35), rnd(-0.3, 0.3)), d3 = dur * rnd(0.9, 1.05);
        FX.shots.push({ kind: "frost", L: L, from: { x: c.x + rnd(-0.3, 0.3), y: c.y + rnd(-0.3, 0.3) }, to: to2, t0: T + j * 45, dur: d3, arc: 0.06 * dist, hit: true, target: t, last: j === 4, name: name });
        arrive = Math.max(arrive, T + j * 45 + d3);
      }
      return arrive + 40;
    }
    FX.shots.push({ kind: L.shot || "fireball", L: L, from: { x: c.x, y: c.y }, to: { x: tp.x, y: tp.y }, t0: T, dur: dur, arc: (L.shot === "miasma" ? 0.02 : 0.08) * dist, hit: true, target: t, last: true, name: name });
    at(T, function () { if (L.shot === "fireball") sfx("fire", { rate: 1.25, vol: 0.55 }); });
    return arrive + 40;
  }
  function impactSound(L) { if (L.snd) sfx(L.snd[0], { rate: L.snd[1], vol: 0.95, max: 2 }); }

  // fireball: a roaring ball of flame with a tail of fire and smoke; bursts over the unit
  FX.shotKinds.fireball = {
    shadow: true,
    draw: function (ctx, s, p, x, y) {
      var L = s.L, f = 0.9 + Math.sin(now() * 0.05) * 0.1;
      ctx.globalCompositeOperation = "lighter";
      var tail = ctx.createLinearGradient(-1.8, 0, 0.2, 0); tail.addColorStop(0, rgba(L.col, 0)); tail.addColorStop(0.7, rgba(L.col, 0.55)); tail.addColorStop(1, rgba(L.hot, 0.9));
      ctx.fillStyle = tail; ctx.beginPath(); ctx.moveTo(0.2, 0); ctx.quadraticCurveTo(-0.4, 0.42 * f, -1.8, 0); ctx.quadraticCurveTo(-0.4, -0.42 * f, 0.2, 0); ctx.fill();
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.62 * f); g.addColorStop(0, "rgba(255,255,245,1)"); g.addColorStop(0.3, rgba(L.hot, 0.95)); g.addColorStop(0.65, rgba(L.col, 0.7)); g.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.62 * f, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      add({ kind: "glow", x: x + rnd(-0.12, 0.12), y: y + rnd(-0.12, 0.12), vx: rnd(-0.3, 0.3), vy: rnd(-0.6, 0), r: rnd(0.18, 0.32), grow: 0.25, dur: rnd(260, 480), col: Math.random() < 0.5 ? L.col : [255, 190, 80], a: 0.8, add: true });
      if (Math.random() < 0.35) add({ kind: "dust", x: x, y: y, vx: rnd(-0.2, 0.2), vy: rnd(-0.5, -0.1), r: 0.2, grow: rnd(0.6, 1), dur: rnd(700, 1100), col: [60, 50, 44], a: 0.35 });
    },
    land: function (r, s) {
      var x = s.to.x, y = s.to.y, t = s.target, L = s.L, S = t ? size(t) : 3;
      glow(x, y, 1.4, [255, 255, 235], 240); glow(x, y, 2.8, L.col, 620); ring(x, y, 3.4, L.hot, 520, 0.22);
      sparks(x, y, 26, [255, 200, 110]);
      for (var i = 0; i < 9; i++) {
        var p = t ? inside(t, rnd(-0.5, 0.5), rnd(-0.45, 0.45)) : { x: x + rnd(-1.5, 1.5), y: y + rnd(-1.5, 1.5) };
        add({ kind: "glow", x: p.x, y: p.y, vx: 0, vy: rnd(-0.4, -0.1), r: rnd(0.3, 0.5), grow: rnd(0.3, 0.6), dur: rnd(700, 1300), col: Math.random() < 0.5 ? L.col : [255, 170, 60], a: 0.75, add: true, t0: now() + rnd(0, 250) });
      }
      for (var k = 0; k < 7; k++) add({ kind: "dust", x: x + rnd(-S / 3, S / 3), y: y + rnd(-S / 3, S / 3), vx: rnd(-0.6, 0.6), vy: rnd(-0.8, -0.2), r: 0.4, grow: rnd(1.4, 2.2), dur: rnd(1600, 2600), col: [58, 48, 42], a: 0.45, t0: now() + 150 + k * 40 });
      add({ kind: "pool", x: x, y: y, vx: 0, vy: 0, r: 0.6, grow: Math.min(2.4, S * 0.35), dur: 5200, col: [34, 22, 14], a: 0.42 });
      shake(6, 340); if (t) t._recoil = { t0: now(), dur: 460 };
      impactSound(L);
    }
  };
  // shadow bolt (and hexes): a dark core ringed with light, trailing wisps of shadow
  FX.shotKinds.shadow = {
    draw: function (ctx, s, p, x, y) {
      var L = s.L, tt = now();
      ctx.globalCompositeOperation = "lighter";
      var halo = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 0.75); halo.addColorStop(0, rgba(L.hot, 0.7)); halo.addColorStop(0.45, rgba(L.col, 0.45)); halo.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      var core = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.3); core.addColorStop(0, "rgba(8,0,16,1)"); core.addColorStop(0.7, "rgba(30,6,44,0.95)"); core.addColorStop(1, "rgba(30,6,44,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(L.hot, 0.8); ctx.lineWidth = 0.05;
      for (var i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(0, 0, 0.34 + i * 0.08, tt * 0.012 + i * 2, tt * 0.012 + i * 2 + 2.2); ctx.stroke(); }
      ctx.globalCompositeOperation = "source-over";
      add({ kind: "dust", x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4), r: rnd(0.15, 0.25), grow: rnd(0.4, 0.7), dur: rnd(500, 800), col: [36, 12, 52], a: 0.5 });
      if (Math.random() < 0.5) add({ kind: "glow", x: x, y: y, vx: rnd(-1, 1), vy: rnd(-1, 1), r: 0.08, grow: 0, dur: rnd(300, 500), col: L.col, a: 0.9, add: true });
    },
    land: function (r, s) {
      var x = s.to.x, y = s.to.y, t = s.target, L = s.L;
      glow(x, y, 2, L.col, 520); ring(x, y, 2.6, L.hot, 460, 0.16);
      for (var i = 0; i < 12; i++) { var a = rnd(0, TAU), v = rnd(1.5, 3.5); add({ kind: "dust", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.25, grow: rnd(0.8, 1.3), dur: rnd(700, 1200), col: [34, 10, 48], a: 0.55 }); }
      for (var j = 0; j < 5; j++) { var b = rnd(0, TAU), l = rnd(1, 2.2); arc(x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, L.col, rnd(140, 240), j * 35); }
      shake(3, 240); if (t) t._recoil = { t0: now(), dur: 400 };
      if (s.name && look(s.name).sigil && t) sigil(t, L);
      impactSound(L);
    }
  };
  // thousand mouths: a swarm of snapping jaws weaving toward the target
  FX.shotKinds.maw = {
    draw: function (ctx, s, p, x, y) {
      var L = s.L, open = 0.5 + 0.5 * Math.sin(now() * 0.04 + s.seed * 2);
      ctx.scale(1.25, 1.25);
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.45); g.addColorStop(0, rgba(L.col, 0.45)); g.addColorStop(1, rgba(L.col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      var o = 0.1 + open * 0.5;
      ctx.fillStyle = "#1e2a0c"; ctx.strokeStyle = rgba(L.col, 1); ctx.lineWidth = 0.035;
      for (var k = -1; k <= 1; k += 2) {
        ctx.save(); ctx.rotate(k * o);
        ctx.beginPath(); ctx.moveTo(0.28, 0); ctx.quadraticCurveTo(0, k * 0.26, -0.2, k * 0.04); ctx.lineTo(0.28, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#f4f0dc"; for (var i = 0; i < 3; i++) { var tx = 0.2 - i * 0.12; ctx.beginPath(); ctx.moveTo(tx, k * 0.02); ctx.lineTo(tx - 0.04, k * 0.1); ctx.lineTo(tx - 0.08, k * 0.02); ctx.fill(); }
        ctx.fillStyle = "#1e2a0c"; ctx.restore();
      }
      if (Math.random() < 0.3) add({ kind: "glow", x: x, y: y, vx: 0, vy: 0, r: 0.07, grow: 0, dur: 300, col: L.col, a: 0.8, add: true });
    },
    land: function (r, s) {
      var x = s.to.x, y = s.to.y, L = s.L;
      ring(x, y, 0.6, L.hot, 220, 0.08);
      for (var i = 0; i < 4; i++) { var a = rnd(0, TAU), v = rnd(1, 2.5); add({ kind: "drop", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(0.05, 0.1), dur: rnd(500, 900), col: [150, 190, 60], a: 0.85 }); }
      if (s.target && Math.random() < 0.5) H.blood(x, y, 2, H.undead(s.target));
      if (s.last) { impactSound(L); if (s.target) s.target._recoil = { t0: now(), dur: 420 }; shake(2, 200); }
    }
  };
  // plague: a slow sick-green cloud that settles over the unit
  FX.shotKinds.miasma = {
    draw: function (ctx, s, p, x, y) {
      var L = s.L, tt = now() * 0.003;
      for (var i = 0; i < 4; i++) {
        var ox = Math.cos(tt + i * 1.7) * 0.35, oy = Math.sin(tt * 1.3 + i * 2.1) * 0.3, R = 0.55 + 0.15 * Math.sin(tt * 2 + i);
        var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, R); g.addColorStop(0, rgba([120, 165, 50], 0.55)); g.addColorStop(1, rgba([90, 120, 40], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter"; var c = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.35); c.addColorStop(0, rgba(L.hot, 0.5)); c.addColorStop(1, rgba(L.col, 0)); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 0.35, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      if (Math.random() < 0.6) add({ kind: "dust", x: x, y: y, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), r: 0.3, grow: rnd(0.6, 1), dur: rnd(900, 1400), col: [110, 150, 50], a: 0.3 });
    },
    land: function (r, s) {
      var t = s.target, L = s.L, S = t ? size(t) : 3;
      for (var i = 0; i < 16; i++) {
        var p = t ? inside(t, rnd(-0.55, 0.55), rnd(-0.55, 0.55)) : { x: s.to.x + rnd(-1.5, 1.5), y: s.to.y + rnd(-1.5, 1.5) };
        add({ kind: "dust", x: p.x, y: p.y, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), r: 0.4, grow: rnd(0.8, 1.4) * Math.min(2, S / 3), dur: rnd(1800, 2800), col: [115, 155, 48], a: 0.4, t0: now() + i * 25 });
      }
      ring(s.to.x, s.to.y, S * 0.7, L.col, 700, 0.12);
      for (var j = 0; j < 10; j++) add({ kind: "drop", x: s.to.x + rnd(-S / 3, S / 3), y: s.to.y + rnd(-S / 3, S / 3), vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), r: 0.035, dur: rnd(900, 1600), col: [20, 22, 12], a: 0.9 });
      if (t) t._recoil = { t0: now(), dur: 380 };
      impactSound(L);
    }
  };
  // frost ward: crystal shards that shatter into a frost burst
  FX.shotKinds.frost = {
    draw: function (ctx, s, p, x, y) {
      var L = s.L;
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.45); g.addColorStop(0, rgba(L.col, 0.5)); g.addColorStop(1, rgba(L.col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(215,238,255,0.95)"; ctx.strokeStyle = "rgba(255,255,255,1)"; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(0.42, 0); ctx.lineTo(0, 0.1); ctx.lineTo(-0.34, 0); ctx.lineTo(0, -0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (Math.random() < 0.5) add({ kind: "glow", x: x, y: y, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), r: 0.06, grow: 0, dur: rnd(300, 600), col: [235, 248, 255], a: 0.9, add: true });
    },
    land: function (r, s) {
      var x = s.to.x, y = s.to.y, L = s.L, t = s.target;
      sparks(x, y, 6, [210, 238, 255]); glow(x, y, 0.6, L.hot, 200);
      if (!s.last) return;
      var c = t ? rpos(t) : { x: x, y: y }, S = t ? size(t) : 3;
      ring(c.x, c.y, S * 0.8, [220, 240, 255], 600, 0.16); glow(c.x, c.y, S * 0.5, L.col, 600);
      for (var i = 0; i < 16; i++) add({ kind: "glow", x: c.x + rnd(-S / 2, S / 2), y: c.y + rnd(-S / 2, S / 2), vx: rnd(-0.3, 0.3), vy: rnd(0.1, 0.5), r: rnd(0.06, 0.1), grow: 0, dur: rnd(900, 1600), col: [240, 250, 255], a: 0.9, add: true, t0: now() + rnd(0, 300) });
      if (t) t._recoil = { t0: now(), dur: 360 };
      impactSound(L);
    }
  };
  // hex of ruin: a sigil of ruin stamped over the unit
  function sigil(t, L) {
    var seed = Math.floor(rnd(0, 999));
    FX.overlay.push({ t0: now(), dur: 1100, draw: function (ctx, r, q, el) {
      var rp = rpos(t), R = size(t) * 0.55, k = Math.min(1, el / 240), a = (q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4) * k * 0.85;
      ctx.translate(rp.x, rp.y); ctx.scale(1.3 - 0.3 * ease(k), (1.3 - 0.3 * ease(k)) * 0.92);
      magicCircle(ctx, r, R, L.col, L.hot, a, el * 0.0008, seed, 3);
    } });
    var rp = rpos(t); ring(rp.x, rp.y, size(t) * 0.8, L.col, 520, 0.2); shake(3, 220);
    for (var i = 0; i < 6; i++) dust(rp.x + rnd(-t.w / 2, t.w / 2), rp.y + rnd(-t.d / 2, t.d / 2), 0.8);
  }
  // reality rift: a tear opens in the air over the unit, drinks in the light and slams shut
  function rift(t, L, T) {
    var open = 300, hold = 480, close = 200, dur = open + hold + close, ang = rnd(-0.6, -0.25), seed = rnd(0, 99);
    FX.overlay.push({ t0: T, dur: dur, draw: function (ctx, r, q, el) {
      var rp = rpos(t), len = Math.max(2.4, size(t) * 0.75), k;
      if (el < open) k = ease(el / open); else if (el < open + hold) k = 1 + 0.08 * Math.sin(el * 0.03); else k = 1 - ease((el - open - hold) / close);
      var W = len * 0.17 * k, Lh = len * (el > open + hold ? 0.6 + 0.4 * k : Math.max(0.3, k)) / 2;
      ctx.translate(rp.x, rp.y - 0.6); ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, Lh * 1.5); g.addColorStop(0, rgba(L.col, 0.55 * k)); g.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, Lh * 1.5, Lh * 0.9, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      var pts = [], n = 9;
      for (var i = 0; i <= n; i++) { var y0 = -Lh + 2 * Lh * i / n, w0 = W * Math.sin(Math.PI * i / n); pts.push([w0 + (i && i < n ? (hash(seed + i + Math.floor(el / 60)) - 0.5) * W * 0.6 : 0), y0]); }
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j <= n; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      for (var m = n - 1; m >= 1; m--) ctx.lineTo(-pts[m][0] * 0.9, pts[m][1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(10,0,18,0.95)"; ctx.fill();
      ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round";
      ctx.strokeStyle = rgba(L.col, 0.6 * k); ctx.lineWidth = px(r, 6); ctx.stroke();
      ctx.strokeStyle = rgba(L.hot, 0.95 * k); ctx.lineWidth = px(r, 1.8); ctx.stroke();
      // stars seen through the tear
      for (var s2 = 0; s2 < 5; s2++) { var sy = -Lh * 0.7 + Lh * 1.4 * hash(seed + s2 * 3), sx = (hash(seed + s2 * 7) - 0.5) * W * 0.8 * Math.sin(Math.PI * (sy + Lh) / (2 * Lh)); ctx.fillStyle = rgba(L.hot, 0.8 * k); ctx.beginPath(); ctx.arc(sx, sy, px(r, 1.2), 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = "source-over";
    } });
    // light and dust are sucked into the tear
    at(T + 150, function () {
      var rp = rpos(t);
      for (var i = 0; i < 26; i++) (function () {
        var a0 = rnd(0, TAU), r0 = size(t) * rnd(0.6, 1.1), d = rnd(450, 650);
        add({ kind: "glow", x: rp.x, y: rp.y, vx: 0, vy: 0, r: rnd(0.08, 0.15), grow: 0, dur: d, col: Math.random() < 0.5 ? L.col : L.hot, a: 0.9, add: true, t0: now() + rnd(0, 380),
          update: function (p, el) { var q = Math.min(1, el / d), rr = r0 * (1 - ease(q)); p.x = rp.x + Math.cos(a0 + q * 2) * rr; p.y = rp.y - 0.6 + Math.sin(a0 + q * 2) * rr; } });
      })();
      for (var j = 0; j < 4; j++) { var b = rnd(0, TAU); arc(rp.x, rp.y - 0.6, rp.x + Math.cos(b) * 2, rp.y - 0.6 + Math.sin(b) * 2, L.col, 180, 120 + j * 110); }
    });
    var end = T + dur;
    at(end - 40, function () {
      var rp = rpos(t);
      glow(rp.x, rp.y - 0.4, 1.4, [255, 255, 255], 220); glow(rp.x, rp.y, size(t) * 0.6, L.col, 520);
      ring(rp.x, rp.y, size(t) * 1.1, L.hot, 520, 0.2); sparks(rp.x, rp.y, 24, L.hot);
      shake(5, 320); t._recoil = { t0: now(), dur: 460 };
      impactSound(L); sfx("clash", { rate: 0.5, vol: 0.5 });
    });
    return end + 20;
  }
  // arcane web: glowing threads shoot out and bind the unit
  function threads(u, t, L, c, T) {
    var go = 440, pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, -0.55], [0, 0.55]];
    FX.overlay.push({ t0: T, dur: go + 380, draw: function (ctx, r, q, el) {
      var k = ease(Math.min(1, el / go)), a = el > go ? 1 - (el - go) / 380 : 1;
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      pts.forEach(function (pp, i) {
        var e = inside(t, pp[0], pp[1]), x = c.x + (e.x - c.x) * k, y = c.y + (e.y - c.y) * k, mx = (c.x + x) / 2 + Math.sin(i * 2.3) * 0.5, my = (c.y + y) / 2 + Math.cos(i * 1.7) * 0.5;
        ctx.strokeStyle = rgba(L.col, 0.45 * a); ctx.lineWidth = px(r, 4); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo(mx, my, x, y); ctx.stroke();
        ctx.strokeStyle = rgba(L.hot, 0.95 * a); ctx.lineWidth = px(r, 1.2); ctx.stroke();
        ctx.fillStyle = rgba(L.hot, a); ctx.beginPath(); ctx.arc(x, y, px(r, 2.5), 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
    } });
    at(T + go, function () { var rp = rpos(t); ring(rp.x, rp.y, size(t) * 0.8, L.hot, 420, 0.12); sparks(rp.x, rp.y, 10, L.hot); t._recoil = { t0: now(), dur: 320 }; impactSound(L); });
    return T + go + 20;
  }
  // blessings: a ribbon of light to the unit and a pillar of light over it
  function beam(u, t, L, c, T) {
    var self = u === t, go = self ? 0 : 280;
    if (!self) FX.overlay.push({ t0: T, dur: 620, draw: function (ctx, r, q, el) {
      var tp = rpos(t), head = ease(Math.min(1, el / go)), tail = el > 330 ? ease(Math.min(1, (el - 330) / 290)) : 0;
      var x1 = c.x + (tp.x - c.x) * tail, y1 = c.y + (tp.y - c.y) * tail, x2 = c.x + (tp.x - c.x) * head, y2 = c.y + (tp.y - c.y) * head;
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.strokeStyle = rgba(L.col, 0.35); ctx.lineWidth = px(r, 12); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = rgba(L.col, 0.6); ctx.lineWidth = px(r, 5); ctx.stroke();
      ctx.strokeStyle = rgba(L.hot, 0.95); ctx.lineWidth = px(r, 1.8); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } });
    var arrive = T + go;
    pillar(t, L, arrive, 1100, 1);
    at(arrive, function () {
      var rp = rpos(t), S = size(t);
      ring(rp.x, rp.y, S * 0.75, L.hot, 620, 0.14);
      motes(rp.x, rp.y, 22, L.hot, S * 0.45, 1.3);
      impactSound(L);
    });
    return arrive + 20;
  }
  // reanimate: soul-wisps rise from the earth and pour into the unit
  function heal(t, L, T) {
    var rp = rpos(t), S = size(t);
    for (var i = 0; i < 26; i++) (function () {
      var a0 = rnd(0, TAU), r0 = S * rnd(0.7, 1.2), d = rnd(600, 900), w = rnd(1.5, 3);
      add({ kind: "glow", x: rp.x, y: rp.y, vx: 0, vy: 0, r: rnd(0.1, 0.17), grow: 0, dur: d, col: Math.random() < 0.6 ? L.col : L.hot, a: 0.9, add: true, t0: T + rnd(0, 300),
        update: function (p, el) { var q = Math.min(1, el / d), e = ease(q), rr = r0 * (1 - e * 0.9), lift = Math.sin(Math.PI * q) * 1.2; p.x = rp.x + Math.cos(a0 + w * q) * rr; p.y = rp.y + Math.sin(a0 + w * q) * rr - lift; } });
    })();
    pillar(t, L, T + 450, 1000, 0.8);
    at(T + 500, function () { var p = rpos(t); ring(p.x, p.y, size(t) * 0.7, L.hot, 600, 0.12); motes(p.x, p.y, 14, L.hot, size(t) * 0.4, 1); impactSound(L); });
    return T + 520;
  }
  // raise dead: a grave-portal opens and the dead climb out of it
  function summon(r, b, u) {
    var lc = FX.lastCast, T = lc && now() - lc.at < 3000 ? lc.T : now(), L = lc && lc.L && lc.L.summon ? lc.L : LOOK["Raise Dead"];
    var rp = rpos(u), R = size(u) * 0.62, seed = Math.floor(rnd(0, 999)), dur = 2600, cracks = [];
    for (var i = 0; i < 9; i++) { var a = i * TAU / 9 + rnd(-0.2, 0.2), x = 0, y = 0, pts = [[0, 0]], lim = R * rnd(0.9, 1.25); while (Math.hypot(x, y) < lim) { a += rnd(-0.45, 0.45); var st = rnd(0.25, 0.45); x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); } cracks.push(pts); }
    FX.ground.push({ t0: T, dur: dur, draw: function (ctx, r, q, el) {
      var k = ease(Math.min(1, el / 400)), a = (q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1) * k, p = rpos(u);
      ctx.translate(p.x, p.y);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.3 * k); g.addColorStop(0, "rgba(6,12,8," + (0.75 * a).toFixed(3) + ")"); g.addColorStop(0.75, "rgba(12,24,14," + (0.45 * a).toFixed(3) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.3 * k, 0, TAU); ctx.fill();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      cracks.forEach(function (pts) {
        var m = Math.max(2, Math.ceil(pts.length * Math.min(1, el / 700)));
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < m; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.strokeStyle = "rgba(10,8,6," + (0.8 * a).toFixed(3) + ")"; ctx.lineWidth = px(r, 3); ctx.stroke();
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(L.col, 0.55 * a); ctx.lineWidth = px(r, 1.2); ctx.stroke(); ctx.globalCompositeOperation = "source-over";
      });
      ctx.scale(1, 0.92);
      magicCircle(ctx, r, R * (0.9 + 0.1 * k), L.col, L.hot, a * 0.9, el * 0.0009, seed, 5);
    } });
    u._rise = { t0: T + 500, dur: 1500 };
    at(T + 350, function () { shake(3, 400); sfx("spell", { rate: 0.55, vol: 1 }); sfx("death", { rate: 0.7, vol: 0.5 }); });
    for (var e = 0; e < 10; e++) at(T + 400 + e * 120, function () {
      var p = inside(u, rnd(-0.45, 0.45), rnd(-0.45, 0.45));
      for (var d = 0; d < 6; d++) add({ kind: "drop", x: p.x, y: p.y, vx: rnd(-2.5, 2.5), vy: rnd(-2.5, 2.5), r: rnd(0.05, 0.11), dur: rnd(500, 900), col: [62, 48, 32], a: 0.9 });
      dust(p.x, p.y, 0.9);
    });
    at(T + 600, function () { var p = rpos(u); motes(p.x, p.y, 26, L.col, R, 1.1); });
  }
  // commander abilities
  var ABILITY = {
    warcry: [230, 70, 40], furious_charge: [255, 110, 40], inspire_valor: [255, 215, 110], rallying_cry: [255, 225, 140],
    mountains_will: [200, 170, 120], power_of_many: [150, 210, 70], mech_expertise: [255, 200, 120], web: [215, 230, 255],
    reposition: [220, 220, 220], fullsteam: [235, 235, 235]
  };
  function ability(r, b, ev) {
    var u = unitOf(b, ev.uid), t = ev.target != null ? unitOf(b, ev.target) : u, col = ABILITY[ev.id] || [255, 220, 140];
    if (!u) return;
    var c = casterPoint(u), tp = t ? rpos(t) : rpos(u), S = size(t || u);
    if (ev.id === "reposition" || ev.id === "fullsteam") { for (var i = 0; i < 5; i++) smoke(tp.x + rnd(-S / 3, S / 3), tp.y + rnd(-S / 3, S / 3), 1, 0, -0.3); return; }
    if (ev.id === "warcry" || ev.id === "inspire_valor" || ev.id === "mountains_will" || ev.id === "power_of_many") {
      for (var k = 0; k < 3; k++) (function (k) { at(now() + k * 140, function () { ring(c.x, c.y, 6 + k * 2, col, 700, 0.18); }); })(k);
      glow(c.x, c.y, 1.4, col, 500); if (ev.id === "warcry") shake(3, 300);
      if (ev.id === "mountains_will") for (var d = 0; d < 8; d++) dust(c.x + rnd(-2, 2), c.y + rnd(-2, 2), 1);
      return;
    }
    if (ev.id === "web" && t && t !== u) { threads(u, t, { col: [200, 215, 235], hot: [245, 250, 255] }, c, now()); return; }
    if (ev.id === "mech_expertise") { sparks(tp.x, tp.y, 16, col); glow(tp.x, tp.y, 0.8, col, 300); return; }
    ring(tp.x, tp.y, S * 0.8, col, 600, 0.14); motes(tp.x, tp.y, 14, col, S * 0.4, 1.1);
  }

  // ---------- lasting auras ----------
  FX.auraStart = {};
  var AURA_OF = { Web: "web", "Furious Charge": "fury" };
  Object.keys(LOOK).forEach(function (k) { if (LOOK[k].aura) AURA_OF[k] = LOOK[k].aura; });
  function auraList(u, t) {
    var out = [];
    (u.effects || []).forEach(function (e) {
      var kind = AURA_OF[e.name]; if (!kind) return;
      var key = u.uid + "|" + e.name, s0 = FX.auraStart[key];
      if (s0 == null) s0 = FX.auraStart[key] = t;
      var a = clamp((t - s0) / 500, 0, 1);
      if (a > 0 && !out.some(function (o) { return o.kind === kind; })) out.push({ kind: kind, a: a, L: LOOK[e.name] || { col: [220, 230, 255], hot: [250, 252, 255] } });
    });
    return out;
  }
  function frame(ctx, u) { var rp = rpos(u); ctx.translate(rp.x, rp.y); ctx.rotate(rp.a + Math.PI / 2); return rp; }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function chance(r, rate) { return !H.reduced(r) && Math.random() < rate; }
  var UNDER = {
    ruin: function (ctx, r, u, a, t, L) { var rp = frame(ctx, u); magicCircle(ctx, r, Math.max(rp.w, rp.d) * 0.62, L.col, L.hot, a * (0.42 + 0.1 * Math.sin(t * 0.004)), H.reduced(r) ? 0 : t * 0.00025, u.uid * 7, 3); },
    frost: function (ctx, r, u, a) {
      var rp = frame(ctx, u), m = 0.35;
      ctx.globalCompositeOperation = "lighter";
      roundRect(ctx, -rp.w / 2 - m, -rp.d / 2 - m, rp.w + 2 * m, rp.d + 2 * m, m);
      ctx.fillStyle = "rgba(150,200,255," + (0.16 * a).toFixed(3) + ")"; ctx.fill();
      ctx.strokeStyle = "rgba(220,240,255," + (0.5 * a).toFixed(3) + ")"; ctx.lineWidth = px(r, 2); ctx.stroke();
      ctx.lineWidth = px(r, 1.2); ctx.strokeStyle = "rgba(240,250,255," + (0.85 * a).toFixed(3) + ")";
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { ctx.save(); ctx.translate(s[0] * (rp.w / 2 + m * 0.4), s[1] * (rp.d / 2 + m * 0.4)); for (var i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-0.28, 0); ctx.lineTo(0.28, 0); ctx.stroke(); } ctx.restore(); });
      ctx.globalCompositeOperation = "source-over";
    },
    fury: function (ctx, r, u, a, t, L) { glowRect(ctx, r, u, L.col, a * (0.2 + 0.1 * Math.sin(t * 0.008))); },
    wild: function (ctx, r, u, a, t, L) { glowRect(ctx, r, u, L.col, a * 0.2); },
    unholy: function (ctx, r, u, a, t, L) { glowRect(ctx, r, u, L.col, a * (0.16 + 0.05 * Math.sin(t * 0.003))); },
    favour: function (ctx, r, u, a, t, L) { glowRect(ctx, r, u, L.col, a * 0.18); }
  };
  function glowRect(ctx, r, u, col, a) {
    var rp = frame(ctx, u), R = Math.max(rp.w, rp.d) * 0.75;
    ctx.globalCompositeOperation = "lighter"; ctx.scale(rp.w / Math.max(rp.w, rp.d) * 1.1 + 0.3, rp.d / Math.max(rp.w, rp.d) * 1.1 + 0.3);
    var g = ctx.createRadialGradient(0, 0, R * 0.35, 0, 0, R); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  var OVER = {
    web: function (ctx, r, u, a, t, L) {
      var rp = frame(ctx, u), hw = rp.w / 2 * 1.04, hd = rp.d / 2 * 1.04, sh = 0.75 + 0.25 * Math.sin(t * 0.003);
      var P8 = [[-hw, -hd], [0, -hd], [hw, -hd], [hw, 0], [hw, hd], [0, hd], [-hw, hd], [-hw, 0]];
      ctx.lineCap = "round"; ctx.strokeStyle = "rgba(232,242,255," + (0.6 * a * sh).toFixed(3) + ")"; ctx.lineWidth = px(r, 1.1);
      ctx.beginPath(); P8.forEach(function (p) { ctx.moveTo(0, 0); ctx.lineTo(p[0], p[1]); }); ctx.stroke();
      [0.3, 0.6, 0.92].forEach(function (k) {
        ctx.beginPath();
        for (var i = 0; i <= 8; i++) { var p = P8[i % 8], q = P8[(i + 7) % 8]; if (!i) { ctx.moveTo(p[0] * k, p[1] * k); continue; } ctx.quadraticCurveTo((p[0] + q[0]) * k * 0.4, (p[1] + q[1]) * k * 0.4, p[0] * k, p[1] * k); }
        ctx.stroke();
      });
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(200,225,255," + (0.8 * a * sh).toFixed(3) + ")";
      P8.forEach(function (p, i) { if ((i + Math.floor(t / 400)) % 3) return; ctx.beginPath(); ctx.arc(p[0] * 0.6, p[1] * 0.6, px(r, 1.8), 0, TAU); ctx.fill(); });
      ctx.globalCompositeOperation = "source-over";
    },
    shield: function (ctx, r, u, a, t, L) {
      var rp = frame(ctx, u), rx = rp.w / 2 + 0.55, ry = rp.d / 2 + 0.55, spin = H.reduced(r) ? 0 : t * 0.0018;
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, rx * 0.4, 0, 0, rx); g.addColorStop(0, rgba(L.col, 0.02 * a)); g.addColorStop(0.85, rgba(L.col, 0.14 * a)); g.addColorStop(1, rgba(L.hot, 0.28 * a));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(L.hot, 0.45 * a); ctx.lineWidth = px(r, 1.3); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba([255, 255, 255], 0.85 * a); ctx.lineWidth = px(r, 2.4); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, spin, spin + 0.9); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, spin + Math.PI, spin + Math.PI + 0.5); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    },
    shroud: function (ctx, r, u, a, t) {
      var rp = frame(ctx, u), R = Math.max(rp.w, rp.d) * 0.45;
      for (var i = 0; i < 5; i++) {
        var ox = Math.sin(t * 0.0004 + i * 1.9) * rp.w * 0.35, oy = Math.cos(t * 0.0005 + i * 2.4) * rp.d * 0.35, rr = R * (0.7 + 0.3 * Math.sin(t * 0.0007 + i));
        var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr); g.addColorStop(0, "rgba(176,178,192," + (0.34 * a).toFixed(3) + ")"); g.addColorStop(1, "rgba(160,160,176,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill();
      }
    },
    plague: function (ctx, r, u, a, t) {
      var rp = frame(ctx, u), R = Math.max(rp.w, rp.d) * 0.4;
      for (var i = 0; i < 3; i++) {
        var ox = Math.sin(t * 0.0005 + i * 2.1) * rp.w * 0.3, oy = Math.cos(t * 0.0006 + i * 1.3) * rp.d * 0.3;
        var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, R); g.addColorStop(0, "rgba(125,165,50," + (0.24 * a).toFixed(3) + ")"); g.addColorStop(1, "rgba(110,150,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "rgba(18,20,10," + (0.85 * a).toFixed(3) + ")";
      for (var f = 0; f < 7; f++) { var ang = t * 0.006 * (f % 2 ? 1 : -1.3) + f * 0.9, fx = Math.cos(ang) * rp.w * 0.3 + Math.sin(f * 3.1) * rp.w * 0.15, fy = Math.sin(ang * 1.3) * rp.d * 0.3; ctx.beginPath(); ctx.arc(fx, fy, px(r, 1.3), 0, TAU); ctx.fill(); }
    },
    favour: function (ctx, r, u, a, t, L) {
      var rp = rpos(u);
      if (chance(r, 0.12 * a)) add({ kind: "glow", x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y - rnd(1, 2.5), vx: 0, vy: rnd(0.8, 1.4), r: rnd(0.07, 0.12), grow: 0, dur: rnd(900, 1400), col: L.hot, a: 0.9, add: true });
    },
    blades: function (ctx, r, u, a, t, L) {
      var rp = frame(ctx, u), fl = 0.8 + 0.2 * Math.sin(t * 0.02);
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.strokeStyle = rgba(L.col, 0.3 * a * fl); ctx.lineWidth = px(r, 10); ctx.beginPath(); ctx.moveTo(-rp.w / 2, -rp.d / 2); ctx.lineTo(rp.w / 2, -rp.d / 2); ctx.stroke();
      ctx.strokeStyle = rgba(L.hot, 0.6 * a * fl); ctx.lineWidth = px(r, 2.5); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      if (chance(r, 0.25 * a)) { var f = G.fwd(rp.a), rt = G.right(rp.a), o = rnd(-0.5, 0.5) * rp.w; add({ kind: "glow", x: rp.x + f.x * rp.d / 2 + rt.x * o, y: rp.y + f.y * rp.d / 2 + rt.y * o, vx: rnd(-0.2, 0.2), vy: -rnd(0.6, 1.2), r: rnd(0.05, 0.09), grow: 0, dur: rnd(500, 900), col: [255, 170, 60], a: 0.95, add: true }); }
    },
    fury: function (ctx, r, u, a, t, L) { var rp = rpos(u); if (chance(r, 0.1 * a)) add({ kind: "glow", x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2), vx: 0, vy: -rnd(0.5, 1), r: rnd(0.07, 0.12), grow: 0, dur: rnd(600, 1000), col: L.col, a: 0.9, add: true }); },
    unholy: function (ctx, r, u, a, t, L) { var rp = rpos(u); if (chance(r, 0.1 * a)) add({ kind: "glow", x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2), vx: rnd(-0.2, 0.2), vy: -rnd(0.4, 0.9), r: rnd(0.1, 0.16), grow: 0.1, dur: rnd(900, 1400), col: L.col, a: 0.7, add: true }); },
    ruin: function (ctx, r, u, a, t, L) { var rp = rpos(u); if (chance(r, 0.06 * a)) add({ kind: "glow", x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2), vx: 0, vy: -rnd(0.3, 0.7), r: rnd(0.06, 0.1), grow: 0, dur: rnd(700, 1100), col: L.col, a: 0.9, add: true }); },
    frost: function (ctx, r, u, a) { var rp = rpos(u); if (chance(r, 0.08 * a)) add({ kind: "glow", x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2) - 1, vx: rnd(-0.2, 0.2), vy: rnd(0.3, 0.6), r: rnd(0.05, 0.08), grow: 0, dur: rnd(1200, 1800), col: [240, 250, 255], a: 0.9, add: true }); },
    wild: function (ctx, r, u, a, t) {
      var rp = rpos(u), R = Math.max(rp.w, rp.d) * 0.62, spin = H.reduced(r) ? 0 : t * 0.0012;
      ctx.translate(rp.x, rp.y); ctx.scale(1, 0.8);
      for (var i = 0; i < 7; i++) {
        var ang = spin + i * TAU / 7, lx = Math.cos(ang) * R, ly = Math.sin(ang) * R;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang + 1.2 + Math.sin(t * 0.005 + i) * 0.4);
        ctx.fillStyle = "rgba(" + (i % 2 ? "120,190,70" : "170,210,80") + "," + (0.9 * a).toFixed(3) + ")";
        ctx.beginPath(); ctx.ellipse(0, 0, 0.22, 0.09, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(60,90,30," + (0.8 * a).toFixed(3) + ")"; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(-0.22, 0); ctx.lineTo(0.22, 0); ctx.stroke();
        ctx.restore();
      }
    }
  };
  FX.underUnit.push(function (ctx, r, u, t) { auraList(u, t).forEach(function (o) { if (UNDER[o.kind]) { ctx.save(); UNDER[o.kind](ctx, r, u, o.a, t, o.L); ctx.restore(); } }); });
  FX.overUnit.push(function (ctx, r, u, t) { auraList(u, t).forEach(function (o) { if (OVER[o.kind]) { ctx.save(); OVER[o.kind](ctx, r, u, o.a, t, o.L); ctx.restore(); } }); });

  // ---------- engine events ----------
  FX.eventHooks.push(function (r, b, ev, calm) {
    if (calm) return;
    if (ev.type === "roll" && ev.spec && ev.spec.kind === "casting" && ev.res) onCast(r, b, ev);
    else if (ev.type === "summon") { var u = b.unit(ev.uid); if (u) summon(r, b, u); }
    else if (ev.type === "ability") ability(r, b, ev);
  });
})();
