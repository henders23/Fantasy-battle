// Battle animation and effects. Moves, charges and flights play as timed tweens (pivot, then
// march) with a stride on every model; front ranks lunge when they strike and recoil when hit;
// casualties topple and fade where they fell; missiles fly by weapon (arcing arrows with
// shadows, crossbow bolts, musket tracers with muzzle smoke, cannonballs, catapult stones,
// bolt-thrower spears, spell orbs); impacts throw sparks, dust, blood or bone; charges land
// with a shockwave and a small screen shake. Everything respects the reduced-motion setting.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.Renderer) return;
  var P = SOVL.Renderer.prototype, G = SOVL.G;
  var FX = { parts: [], shots: [], fallen: [], floats: [], shake: { t0: 0, dur: 0, amp: 0 }, contact: {}, gen: 0,
    // missiles and spells in flight: their target's casualties, floaters and removal wait for the impact
    incoming: {}, hold: {}, ghosts: [],
    // extension points used by js/spellfx.js
    ground: [], overlay: [], shotKinds: {}, partKinds: {}, eventHooks: [], underUnit: [], overUnit: [] };
  SOVL.FX = FX;
  var MAX_PARTS = 700;
  function now() { return performance.now(); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeIn(t) { return Math.pow(t, 1.7); }
  function reduced(r) { return r && r.reduceMotion; }
  function mounted(u) { return /Cavalry|Chariot|Hounds|Wagon/.test(u.type) || SOVL.isFlying && SOVL.isFlying(u); }
  function undead(u) { return u.faction === "dead_nations"; }
  function rpos(u) { return { x: u._rx == null ? u.x : u._rx, y: u._ry == null ? u.y : u._ry, a: u._ra == null ? u.a : u._ra, w: u.w, d: u.d }; }
  function at(time, fn) { var g = FX.gen, w = time - now(); var go = function () { if (g === FX.gen) try { fn(); } catch (e) { /* effects only */ } }; if (w > 0) setTimeout(go, w); else go(); }
  function expect(u, until) { var e = FX.incoming[u.uid]; if (!e || e.until < until) FX.incoming[u.uid] = { until: until, u: u }; }
  function pending(uid) { var e = FX.incoming[uid]; return e && e.until > now() ? e.until : 0; }
  function later(uid, fn) { at(pending(uid), fn); }
  // the models a unit still shows while the missile that kills some of them is in the air
  FX.shownModels = function (u) { var h = FX.hold[u.uid]; return u.models + (h && h.until > now() ? h.killed : 0); };
  // the latest impact due on a unit near this point (floaters and flashes wait for it)
  function arrivalNear(x, y) {
    var best = 0, t = now();
    for (var k in FX.incoming) {
      var e = FX.incoming[k]; if (e.until <= t) { delete FX.incoming[k]; continue; }
      var p = rpos(e.u), rad = Math.max(e.u.w || 1, e.u.d || 1) / 2 + 1.5;
      if (Math.hypot(p.x - x, p.y - y) < rad && e.until > best) best = e.until;
    }
    return best;
  }

  // ---------- movement tweens ----------
  function speed(u, kind) {
    var s = mounted(u) ? 16 : u.type === "War Machine" ? 5 : 9;
    return kind === "charge" ? s * 1.15 : kind === "flee" ? s * 1.3 : s;
  }
  function queueMove(u, to, kind) {
    var tw = u._tw, start = tw && tw.segs.length ? tw.segs[tw.segs.length - 1].to : rpos(u);
    if (!tw || !tw.segs.length) { tw = u._tw = { segs: [], t0: now(), kind: kind }; }
    var turn = G.angleDiff(start.a, to.a), dist = Math.hypot(to.x - start.x, to.y - start.y);
    var pivotDur = Math.abs(turn) / (Math.PI / 4) * (mounted(u) ? 260 : 190);
    if (kind === "charge") {
      tw.segs.push({ from: start, to: to, dur: clamp(dist / speed(u, kind) * 1000, 520, 1300), kind: kind, turnFirst: 0.25 });
    } else {
      if (Math.abs(turn) > 0.04 && dist > 0.05) {
        var mid = { x: start.x, y: start.y, a: start.a + turn };
        tw.segs.push({ from: start, to: mid, dur: clamp(pivotDur, 140, 600), kind: "pivot" });
        start = mid;
      }
      var d2 = dist > 0.05 ? clamp(dist / speed(u, kind) * 1000, 220, 1600) : clamp(pivotDur, 140, 600);
      tw.segs.push({ from: start, to: { x: to.x, y: to.y, a: start.a + G.angleDiff(start.a, to.a) }, dur: d2, kind: dist > 0.05 ? kind : "pivot" });
    }
    // never let animation fall far behind the game: compress a long queue
    var left = 0, el = now() - tw.t0; tw.segs.forEach(function (s) { left += s.dur; }); left -= el;
    if (left > 1800) { var k = 1800 / left; tw.segs.forEach(function (s) { s.dur *= k; }); }
  }
  function stepTweens(r, b, t) {
    b.units.forEach(function (u) {
      var tw = u._tw; if (!tw) { u._pose = null; return; }
      var el = t - tw.t0, seg = null, i;
      for (i = 0; i < tw.segs.length; i++) { if (el < tw.segs[i].dur) { seg = tw.segs[i]; break; } el -= tw.segs[i].dur; }
      if (!seg) {
        var last = tw.segs[tw.segs.length - 1];
        u._rx = u.x; u._ry = u.y; u._ra = u.a; u._tw = null; u._pose = null;
        if (last && last.kind === "charge") chargeImpact(r, b, u);
        return;
      }
      var p = el / seg.dur, f = seg.from, to = seg.to, k = seg.kind === "charge" ? easeIn(p) : ease(p);
      var ka = seg.turnFirst ? clamp(p / seg.turnFirst, 0, 1) : k;
      u._rx = f.x + (to.x - f.x) * k; u._ry = f.y + (to.y - f.y) * k; u._ra = f.a + G.angleDiff(f.a, to.a) * ease(ka);
      var moving = seg.kind !== "pivot";
      var travelled = Math.hypot(to.x - f.x, to.y - f.y) * k;
      u._pose = { moving: moving || seg.kind === "pivot", phase: (moving ? travelled * (mounted(u) ? 2.2 : 3.4) : el / 70), cav: mounted(u), run: seg.kind === "charge" || seg.kind === "flee" };
      // dust kicked up behind a moving block
      if (moving && !reduced(r)) {
        var rate = (mounted(u) ? 0.5 : 0.22) * (seg.kind === "charge" ? 2 : 1);
        if (Math.random() < rate) {
          var rp = rpos(u), fw = G.fwd(rp.a), rt = G.right(rp.a), off = (Math.random() - 0.5) * u.w;
          dust(rp.x - fw.x * u.d / 2 + rt.x * off, rp.y - fw.y * u.d / 2 + rt.y * off, mounted(u) ? 1 : 0.7, -fw.x, -fw.y);
        }
      }
    });
  }

  // ---------- poses used by the model painter ----------
  FX.animating = function (u) {
    var t = now();
    return !!(u._tw || (u._clash && t - u._clash.t0 < u._clash.dur + 200) || (u._recoil && t - u._recoil.t0 < u._recoil.dur));
  };
  FX.pose = function (u, rank, file, bw, bd) {
    var t = now(), x = 0, y = 0, r = 0, p = u._pose;
    if (p && p.moving) {
      var ph = p.phase + file * 1.13 + rank * 2.31, amp = p.cav ? 0.075 : 0.05;
      if (p.run) amp *= 1.5;
      y += Math.sin(ph) * bd * amp; x += Math.sin(ph * 0.5 + rank) * bw * 0.025; r += Math.sin(ph * 0.5 + 1) * (p.cav ? 0.06 : 0.04);
    }
    var c = u._clash;
    if (c && rank <= 1) {
      var tc = (t - c.t0 - ((file * 37 + rank * 53) % 160)) / c.dur;
      if (tc > 0 && tc < 1) { var s = Math.sin(Math.PI * tc); y -= s * bd * (rank ? 0.12 : 0.3); r += Math.sin(tc * 9 + file) * 0.08 * s; }
    }
    var rc = u._recoil;
    if (rc) {
      var tr = (t - rc.t0) / rc.dur;
      if (tr > 0 && tr < 1) { var s2 = Math.sin(Math.PI * tr) * (1 - tr * 0.4); y += s2 * bd * 0.16 * (rank === 0 ? 1 : 0.6); x += Math.sin(tr * 20 + file) * bw * 0.03 * s2; }
    }
    return { x: x, y: y, r: r };
  };

  // ---------- particles ----------
  function add(p) { if (FX.parts.length > MAX_PARTS) FX.parts.shift(); p.t0 = p.t0 || now(); FX.parts.push(p); return p; }
  function dust(x, y, size, dx, dy) {
    add({ kind: "dust", x: x, y: y, vx: (dx || 0) * rnd(0.3, 0.9) + rnd(-0.3, 0.3), vy: (dy || 0) * rnd(0.3, 0.9) + rnd(-0.3, 0.3), r: rnd(0.3, 0.5) * (size || 1), grow: rnd(1, 1.7) * (size || 1), dur: rnd(800, 1400), col: [160, 136, 98], a: rnd(0.32, 0.5) });
  }
  function smoke(x, y, size, dx, dy) {
    add({ kind: "dust", x: x, y: y, vx: (dx || 0) + rnd(-0.25, 0.25), vy: (dy || 0) - rnd(0.1, 0.4), r: rnd(0.3, 0.5) * size, grow: rnd(1.2, 2) * size, dur: rnd(1300, 2200), col: [205, 205, 200], a: rnd(0.35, 0.55) });
  }
  function sparks(x, y, n, col, dirx, diry) {
    for (var i = 0; i < n; i++) {
      var a = Math.atan2(diry || 0, dirx || 0) + rnd(-1.4, 1.4), v = rnd(4, 11), any = !dirx && !diry;
      if (any) a = rnd(0, 6.283);
      add({ kind: "spark", x: x, y: y, z: rnd(0, 0.3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(2, 6), dur: rnd(160, 340), col: col || [255, 226, 150], w: rnd(0.035, 0.06), add: true });
    }
  }
  function blood(x, y, n, bone) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.283), v = rnd(0.8, 3);
      add({ kind: "drop", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(0.05, 0.12), dur: rnd(600, 1100), col: bone ? [220, 214, 196] : [120, 18, 14], a: bone ? 0.8 : 0.85 });
    }
  }
  function glow(x, y, r, col, dur) { add({ kind: "glow", x: x, y: y, vx: 0, vy: 0, r: r, grow: r * 0.6, dur: dur || 500, col: col, a: 0.9, add: true }); }
  function ring(x, y, r, col, dur, width) { add({ kind: "ring", x: x, y: y, vx: 0, vy: 0, r: r * 0.2, grow: r, dur: dur || 500, col: col, a: 0.8, w: width || 0.12 }); }
  function motes(x, y, n, col, spread, rise) {
    for (var i = 0; i < n; i++) add({ kind: "glow", x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), vx: rnd(-0.2, 0.2), vy: -rnd(0.4, 1.4) * (rise || 1), r: rnd(0.08, 0.16), grow: 0, dur: rnd(700, 1400), col: col, a: 0.9, add: true, t0: now() + rnd(0, 400) });
  }
  function shake(amp, dur) { if (amp > FX.shake.amp * (1 - (now() - FX.shake.t0) / Math.max(1, FX.shake.dur))) FX.shake = { t0: now(), dur: dur || 260, amp: amp }; }
  FX.dust = dust; FX.sparks = sparks; FX.shakeScreen = shake;

  // ---------- missiles ----------
  function shotKind(u, commander) {
    var id = u.id || "", w = (commander && u.commander ? u.commander.ranged : u.ranged) || "";
    if (/mortar/.test(id) || /Mortar/.test(w)) return "mortar";
    if (/cannon/.test(id) || /Cannon/.test(w)) return /inferno/.test(id) || /Inferno/.test(w) ? "fire" : "ball";
    if (/bolt_thrower|bolt/.test(id) || /Bolt Thrower/.test(w)) return "spear";
    if (/stone|catapult|lobber/.test(id) || /Catapult/.test(w)) return "stone";
    if (/Fire Breath/.test(w)) return "fire";
    if (/Steam Gun/.test(w)) return "steam";
    if (/Handgun|Pistol|Rifle/.test(w)) return "bullet";
    if (/Crossbow/.test(w)) return "bolt";
    if (/Explosive/.test(w)) return "bomb";
    return "arrow";
  }
  var SHOT = {
    arrow: { speed: 26, arc: 0.28, n: 14 },
    bolt: { speed: 36, arc: 0.12, n: 12 },
    bullet: { speed: 120, arc: 0, n: 10 },
    ball: { speed: 34, arc: 0.1, n: 1 },
    mortar: { speed: 16, arc: 0.55, n: 1 },
    stone: { speed: 18, arc: 0.45, n: 1 },
    spear: { speed: 40, arc: 0.08, n: 1 },
    fire: { speed: 22, arc: 0, n: 1 },
    steam: { speed: 30, arc: 0, n: 1 },
    bomb: { speed: 14, arc: 0.5, n: 3 },
    orb: { speed: 16, arc: 0.05, n: 1 }
  };
  function launch(r, u, t, hits, n, commander, onAll) {
    var kind = shotKind(u, commander), cfg = SHOT[kind], shooter = rpos(u), target = rpos(t);
    var count = Math.max(1, Math.min(cfg.n, n || 1)), hitCount = Math.round(count * (hits || 0) / Math.max(1, n || 1));
    if (hits > 0 && hitCount === 0) hitCount = 1;
    var fw = G.fwd(shooter.a), rt = G.right(shooter.a), tfw = G.fwd(target.a), trt = G.right(target.a), start = now();
    var muzzle = { x: shooter.x + fw.x * shooter.d / 2, y: shooter.y + fw.y * shooter.d / 2 };
    if (kind === "bullet" || kind === "ball" || kind === "mortar" || kind === "steam") {
      for (var m = 0; m < Math.min(5, count); m++) { var off = (m / Math.max(1, count - 1) - 0.5) * shooter.w * 0.8; smoke(muzzle.x + rt.x * off, muzzle.y + rt.y * off, kind === "bullet" ? 0.7 : 1.4, fw.x * 0.6, fw.y * 0.6); }
      glow(muzzle.x, muzzle.y, kind === "bullet" ? 0.6 : 1.1, [255, 200, 120], 180);
      if (kind !== "bullet") shake(kind === "mortar" ? 3 : 4, 220);
    }
    for (var i = 0; i < count; i++) {
      var hit = i < hitCount, so = (Math.random() - 0.5) * shooter.w * 0.9;
      var from = { x: muzzle.x + rt.x * so, y: muzzle.y + rt.y * so };
      var to;
      if (hit) { var a1 = (Math.random() - 0.5) * target.w * 0.85, b1 = (Math.random() - 0.5) * target.d * 0.8; to = { x: target.x + trt.x * a1 + tfw.x * b1, y: target.y + trt.y * a1 + tfw.y * b1 }; }
      else {
        var ang = rnd(0, 6.283), rad = Math.max(target.w, target.d) * rnd(0.55, 0.95);
        to = { x: target.x + Math.cos(ang) * rad, y: target.y + Math.sin(ang) * rad };
      }
      var dist = Math.hypot(to.x - from.x, to.y - from.y), dur = clamp(dist / cfg.speed * 1000, 90, 1500) * rnd(0.92, 1.08);
      var t0 = start + (kind === "bullet" ? rnd(0, 140) : i * rnd(25, 55));
      FX.shots.push({ kind: kind, from: from, to: to, t0: t0, dur: dur, arc: cfg.arc * dist, hit: hit, target: t, last: i === count - 1, onAll: onAll, side: u.side });
      if (hit) expect(t, t0 + dur + 40);
    }
  }
  function land(r, s) {
    var t = s.target, x = s.to.x, y = s.to.y, K = FX.shotKinds[s.kind];
    if (s.onLand) s.onLand(r, s);
    if (K && K.land) return K.land(r, s);
    if (s.kind === "ball" || s.kind === "mortar" || s.kind === "stone" || s.kind === "bomb") {
      for (var i = 0; i < 6; i++) dust(x + rnd(-0.4, 0.4), y + rnd(-0.4, 0.4), 1.6);
      ring(x, y, 1.6, [230, 200, 150], 450, 0.14);
      if (s.kind !== "stone") { glow(x, y, 1.2, [255, 160, 70], 260); smoke(x, y, 1.6); }
      for (var d = 0; d < 10; d++) add({ kind: "drop", x: x, y: y, vx: rnd(-4, 4), vy: rnd(-4, 4), r: rnd(0.06, 0.12), dur: rnd(400, 800), col: [70, 58, 40], a: 0.9 });
      if (s.hit && t) blood(x, y, 6, undead(t));
      shake(s.kind === "stone" ? 3 : 5, 260);
      if (UI() && UI().sfx && s.kind !== "bomb") UI().sfx.play(s.kind === "stone" ? "shield" : "clash", { vol: 0.6, rate: 0.6, max: 2 });
      return;
    }
    if (s.kind === "fire" || s.kind === "steam") {
      for (var f = 0; f < 10; f++) add({ kind: "glow", x: x + rnd(-0.8, 0.8), y: y + rnd(-0.8, 0.8), vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), r: rnd(0.3, 0.6), grow: 0.8, dur: rnd(400, 800), col: s.kind === "fire" ? [255, 140, 50] : [230, 230, 230], a: 0.8, add: s.kind === "fire" });
      return;
    }
    if (s.hit) {
      if (t && Math.random() < 0.6) blood(x, y, 2, undead(t));
      sparks(x, y, 3, [255, 236, 190]);
    } else dust(x, y, 0.5);
    if (s.last && UI() && UI().sfx) UI().sfx.play(s.hit ? "arrow_hit" : "arrow_miss", { max: 3, vol: 0.8 });
  }
  function drawShots(ctx, r, t) {
    FX.shots = FX.shots.filter(function (s) {
      var p = (t - s.t0) / s.dur;
      if (p < 0) return true;
      if (p >= 1) { land(r, s); return false; }
      var gx = s.from.x + (s.to.x - s.from.x) * p, gy = s.from.y + (s.to.y - s.from.y) * p, h = s.arc * 4 * p * (1 - p);
      var dx = s.to.x - s.from.x, dy = s.to.y - s.from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      if (s.wob) { var wo = Math.sin(p * Math.PI * (s.wobN || 3) + (s.wobP || 0)) * s.wob * Math.sin(Math.PI * p); gx -= uy * wo; gy += ux * wo; }
      var K = FX.shotKinds[s.kind];
      // the missile rises toward the viewer: drawn up-left of its ground track, shadow on the ground
      var ox = -h * 0.28, oy = -h * 0.42, x = gx + ox, y = gy + oy, slope = s.arc * 4 * (1 - 2 * p) / len;
      var vx = ux - 0.28 * slope * len / Math.max(1, len), vy = uy - 0.42 * slope * len / Math.max(1, len), vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
      if (s.arc > 0.2 || s.kind === "ball" || s.kind === "stone" || s.kind === "mortar" || (K && K.shadow)) {
        ctx.fillStyle = "rgba(0,0,0," + (0.28 - Math.min(0.2, h * 0.02)) + ")";
        ctx.beginPath(); ctx.ellipse(gx + 0.1, gy + 0.12, s.kind === "arrow" || s.kind === "bolt" ? 0.22 : 0.3, 0.07 + (s.kind === "arrow" ? 0 : 0.12), Math.atan2(uy, ux), 0, 6.283); ctx.fill();
      }
      var sc = (1 + h * 0.05) * Math.max(1, 13 / (0.6 * (r.scale || 12))); // never smaller than ~13px on screen
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx)); ctx.scale(sc, sc);
      switch (s.kind) {
        case "arrow": case "bolt": {
          var L = s.kind === "arrow" ? 0.62 : 0.45;
          ctx.strokeStyle = "rgba(255,245,220,0.18)"; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(-L * 2.2, 0); ctx.lineTo(-L / 2, 0); ctx.stroke();
          ctx.strokeStyle = "#6b4a28"; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
          ctx.fillStyle = "#c8ccd2"; ctx.beginPath(); ctx.moveTo(L / 2 + 0.12, 0); ctx.lineTo(L / 2 - 0.02, 0.06); ctx.lineTo(L / 2 - 0.02, -0.06); ctx.closePath(); ctx.fill();
          ctx.fillStyle = s.side === 0 ? "#dfe8ff" : "#ffd7d0"; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 0.12, 0.07); ctx.lineTo(-L / 2 + 0.06, 0); ctx.lineTo(-L / 2 - 0.12, -0.07); ctx.closePath(); ctx.fill();
          break;
        }
        case "bullet": {
          ctx.globalCompositeOperation = "lighter";
          var gr = ctx.createLinearGradient(-1.6, 0, 0.1, 0); gr.addColorStop(0, "rgba(255,210,120,0)"); gr.addColorStop(1, "rgba(255,240,200,0.95)");
          ctx.strokeStyle = gr; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(0.1, 0); ctx.stroke();
          break;
        }
        case "ball": case "mortar": case "bomb": {
          var bg = ctx.createRadialGradient(-0.05, -0.05, 0.02, 0, 0, 0.2); bg.addColorStop(0, "#8a8f98"); bg.addColorStop(1, "#15171b");
          ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, s.kind === "bomb" ? 0.12 : 0.18, 0, 6.283); ctx.fill();
          if (Math.random() < 0.5) smoke(x - vx * 0.3, y - vy * 0.3, 0.5);
          break;
        }
        case "stone": {
          ctx.rotate(p * 10);
          var sg = ctx.createRadialGradient(-0.1, -0.1, 0.03, 0, 0, 0.35); sg.addColorStop(0, "#b8b0a0"); sg.addColorStop(1, "#4a4438");
          ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0.3, 0); ctx.lineTo(0.12, 0.26); ctx.lineTo(-0.22, 0.2); ctx.lineTo(-0.3, -0.06); ctx.lineTo(-0.05, -0.28); ctx.lineTo(0.22, -0.2); ctx.closePath(); ctx.fill();
          break;
        }
        case "spear": {
          ctx.strokeStyle = "#5a3f22"; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(-0.9, 0); ctx.lineTo(0.5, 0); ctx.stroke();
          ctx.fillStyle = "#c8ccd2"; ctx.beginPath(); ctx.moveTo(0.78, 0); ctx.lineTo(0.48, 0.1); ctx.lineTo(0.48, -0.1); ctx.closePath(); ctx.fill();
          break;
        }
        case "fire": case "steam": case "orb": {
          ctx.globalCompositeOperation = s.kind === "steam" ? "source-over" : "lighter";
          var col = s.col || (s.kind === "fire" ? [255, 140, 50] : [235, 235, 235]);
          var og = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.55); og.addColorStop(0, "rgba(255,255,240,0.95)"); og.addColorStop(0.35, "rgba(" + col.join(",") + ",0.85)"); og.addColorStop(1, "rgba(" + col.join(",") + ",0)");
          ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, 6.283); ctx.fill();
          if (Math.random() < 0.8) add({ kind: "glow", x: x, y: y, vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4), r: rnd(0.12, 0.25), grow: 0.1, dur: rnd(250, 450), col: col, a: 0.7, add: s.kind !== "steam" });
          break;
        }
        default: if (K && K.draw) K.draw(ctx, s, p, x, y, r, t);
      }
      ctx.restore();
      return true;
    });
  }

  // ---------- melee: lunges, recoil, sparks, casualties ----------
  function contactLine(a, t) {
    var ra = rpos(a), rt = rpos(t), fa = G.frontCenter(ra), ft = G.frontCenter(rt);
    var useA = G.pointInRect(t, fa, 0.8) || !G.pointInRect(a, ft, 0.8);
    var src = useA ? ra : rt, fc = useA ? fa : ft, rv = G.right(src.a), fw = G.fwd(src.a);
    return { x: fc.x, y: fc.y, rx: rv.x, ry: rv.y, fx: fw.x * (useA ? 1 : -1), fy: fw.y * (useA ? 1 : -1), w: Math.min(ra.w, rt.w) * 0.9 };
  }
  function alongLine(c) { var o = (Math.random() - 0.5) * c.w; return { x: c.x + c.rx * o, y: c.y + c.ry * o }; }
  function strike(r, att, tgt, hits) {
    var t = now(), line = contactLine(att, tgt);
    FX.contact[tgt.uid] = { line: line, t: t };
    att._clash = { t0: t, dur: 420 };
    if (hits > 0) tgt._recoil = { t0: t + 200, dur: 380 };
    setTimeout(function () {
      var n = Math.min(12, 2 + hits);
      for (var i = 0; i < n; i++) { var p = alongLine(line); sparks(p.x, p.y, hits ? 5 : 2, [255, 230, 170], line.fx, line.fy); if (hits && i % 2 === 0) glow(p.x, p.y, 0.45, [255, 240, 200], 160); }
      if (!hits) { var q = alongLine(line); dust(q.x, q.y, 0.6); }
    }, 180);
  }
  function saves(r, tgt, failed, saved) {
    var c = FX.contact[tgt.uid], line = c && now() - c.t < 6000 ? c.line : null, rp = rpos(tgt);
    for (var i = 0; i < Math.min(8, saved); i++) { var p = line ? alongLine(line) : { x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2) }; sparks(p.x, p.y, 2, [210, 230, 255]); }
    for (var j = 0; j < Math.min(8, failed); j++) { var q = line ? alongLine(line) : { x: rp.x + rnd(-rp.w / 2, rp.w / 2), y: rp.y + rnd(-rp.d / 2, rp.d / 2) }; blood(q.x, q.y, 4, undead(tgt)); }
    if (failed) tgt._recoil = { t0: now(), dur: 360 };
  }
  function casualties(r, u, killed) {
    if (!killed || SOVL.commanderOnly(u)) return;
    var info = u.typeInfo || SOVL.UNIT_TYPES[u.type] || SOVL.UNIT_TYPES.Infantry, bw = info.base[0] * SOVL.MM, bd = info.base[1] * SOVL.MM;
    var c = FX.contact[u.uid], line = c && now() - c.t < 6000 ? c.line : null, rp = rpos(u), fw = G.fwd(rp.a), rt = G.right(rp.a);
    for (var i = 0; i < Math.min(10, killed); i++) {
      var pos;
      if (line) { var p = alongLine(line); pos = { x: p.x - line.fx * bd * rnd(0.1, 0.6), y: p.y - line.fy * bd * rnd(0.1, 0.6) }; }
      else { var a = rnd(-0.45, 0.45) * rp.w, b = rnd(-0.45, 0.45) * rp.d; pos = { x: rp.x + rt.x * a + fw.x * b, y: rp.y + rt.y * a + fw.y * b }; }
      var still = Object.create(u); still._tw = null; still._clash = null; still._recoil = null; still._pose = null;
      FX.fallen.push({ u: still, x: pos.x, y: pos.y, a: rp.a, tip: (Math.random() < 0.5 ? -1 : 1) * rnd(1.1, 1.6), bw: bw, bd: bd, t0: now() + i * 60, dur: 2600, rank: 2 + (i % 3), file: i });
      if (!undead(u)) add({ kind: "pool", x: pos.x + rnd(-0.1, 0.1), y: pos.y + rnd(-0.1, 0.1), vx: 0, vy: 0, r: bw * 0.18, grow: bw * 0.25, dur: 2800, col: [90, 14, 10], a: 0.55, t0: now() + i * 60 + 200 });
      else for (var k = 0; k < 3; k++) add({ kind: "drop", x: pos.x, y: pos.y, vx: rnd(-1, 1), vy: rnd(-1, 1), r: rnd(0.05, 0.09), dur: 1600, col: [200, 195, 180], a: 0.8 });
      dust(pos.x, pos.y, 0.6);
    }
  }
  function drawFallen(ctx, r, t) {
    FX.fallen = FX.fallen.filter(function (f) {
      var el = t - f.t0; if (el < 0) return true; if (el > f.dur) return false;
      var tip = clamp(el / 320, 0, 1), fade = el > f.dur - 900 ? (f.dur - el) / 900 : 1;
      ctx.save(); ctx.globalAlpha = 0.95 * fade;
      ctx.filter = "brightness(" + (1 - 0.45 * ease(tip)).toFixed(2) + ") saturate(" + (1 - 0.5 * ease(tip)).toFixed(2) + ")";
      ctx.translate(f.x, f.y); ctx.rotate(f.a + Math.PI / 2 + f.tip * ease(tip) * 0.9);
      ctx.translate(0, f.bd * 0.3 * ease(tip)); ctx.scale(0.92, 1 - 0.45 * ease(tip));
      try { if (r.drawModelSprite) r.drawModelSprite(ctx, f.u, f.bw, f.bd, f.rank, f.file, 3); } catch (e) { /* skip */ }
      ctx.restore();
      return true;
    });
  }

  // ---------- charges ----------
  function chargeImpact(r, b, u) {
    if (reduced(r)) return;
    var tgt = null;
    (b.contacts || []).forEach(function (k) { if (k.a === u.uid) tgt = b.unit(k.b); else if (k.b === u.uid && !tgt) tgt = b.unit(k.a); });
    var rp = rpos(u), fc = G.frontCenter(rp), fw = G.fwd(rp.a), rt = G.right(rp.a);
    for (var i = 0; i < 10; i++) { var o = (Math.random() - 0.5) * u.w; dust(fc.x + rt.x * o, fc.y + rt.y * o, mounted(u) ? 1.5 : 1.1, fw.x, fw.y); }
    for (var j = 0; j < 8; j++) { var o2 = (Math.random() - 0.5) * u.w; sparks(fc.x + rt.x * o2, fc.y + rt.y * o2, 3, [255, 225, 160], fw.x, fw.y); }
    ring(fc.x, fc.y, Math.max(2, u.w * 0.6), [255, 230, 180], 420, 0.1);
    u._clash = { t0: now(), dur: 380 };
    if (tgt) tgt._recoil = { t0: now() + 60, dur: 460 };
    shake(mounted(u) ? 7 : 5, 320);
  }

  // ---------- floating text and flashes ----------
  P.addFloater = function (x, y, text, color) {
    var t = Math.max(now(), arrivalNear(x, y)), stack = FX.floats.filter(function (f) { return Math.abs(f.x - x) < 2 && Math.abs(f.y - y) < 2 && Math.abs(t - f.t0) < 500; }).length;
    FX.floats.push({ x: x, y: y, text: text, color: color || "#fff", t0: t, dur: 1600, stack: stack, big: /SLAIN|DESTROYED|BREAKS|FLED|RUN DOWN|CHARGE|MISCAST|wins by|win by/i.test(text) });
  };
  P.addFlash = function (x, y, r, color) {
    var c = hexRgb(color || "#ffb347"), t0 = arrivalNear(x, y) || now();
    add({ kind: "glow", x: x, y: y, vx: 0, vy: 0, r: (r || 1.5) * 0.8, grow: (r || 1.5) * 0.5, dur: 500, col: c, a: 0.9, add: true, t0: t0 });
    add({ kind: "ring", x: x, y: y, vx: 0, vy: 0, r: (r || 1.5) * 0.28, grow: (r || 1.5) * 1.4, dur: 600, col: c, a: 0.8, w: 0.1, t0: t0 });
  };
  function hexRgb(h) { if (!/^#/.test(h)) return [255, 200, 120]; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function drawFloats(ctx, r, t) {
    FX.floats = FX.floats.filter(function (f) { return t - f.t0 < f.dur; });
    FX.floats.forEach(function (f) {
      if (t < f.t0) return;
      var p = (t - f.t0) / f.dur, s = r.toScreen(f.x, f.y), pop = p < 0.12 ? 0.6 + 0.6 * (p / 0.12) : p < 0.2 ? 1.2 - 0.2 * ((p - 0.12) / 0.08) : 1;
      var rise = (1 - Math.pow(1 - Math.min(1, p * 1.4), 3)) * 34, a = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      var size = f.big ? 18 : 15;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(s.x, s.y - rise - f.stack * 18); ctx.scale(pop, pop);
      ctx.font = "700 " + size + 'px "Cinzel", Georgia, serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,6,4,0.85)"; ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    });
  }

  // ---------- drawing ----------
  function drawParts(ctx, r, t, dt) {
    FX.parts = FX.parts.filter(function (p) {
      var el = t - p.t0; if (el < 0) return true; if (el > p.dur) return false;
      var q = el / p.dur, sec = dt;
      if (p.update) { p.update(p, el, sec); if (p.kind === "glow" || p.kind === "dust") { p.vx = 0; p.vy = 0; } }
      p.x += p.vx * sec; p.y += p.vy * sec;
      if (p.kind === "spark") { p.z += p.vz * sec; p.vz -= 18 * sec; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; } p.vx *= 0.92; p.vy *= 0.92; }
      else { p.vx *= 0.95; p.vy *= 0.95; }
      var col = p.col, a;
      switch (p.kind) {
        case "dust": case "glow": case "pool": {
          var rad = p.r + p.grow * (p.kind === "pool" ? Math.min(1, q * 3) : q);
          a = p.a * (p.kind === "pool" ? (q > 0.6 ? (1 - q) / 0.4 : 1) : (1 - q) * Math.min(1, q * 6));
          if (a <= 0.01) return true;
          if (p.add) ctx.globalCompositeOperation = "lighter";
          var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
          g.addColorStop(0, "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + a + ")");
          g.addColorStop(p.kind === "pool" ? 0.7 : 0.45, "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (a * (p.kind === "pool" ? 0.9 : 0.45)) + ")");
          g.addColorStop(1, "rgba(" + col[0] + "," + col[1] + "," + col[2] + ",0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          break;
        }
        case "ring": {
          var rr = p.r + p.grow * ease(q); a = p.a * (1 - q);
          ctx.strokeStyle = "rgba(" + col.join(",") + "," + a + ")"; ctx.lineWidth = p.w * (1 - q * 0.5);
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.283); ctx.stroke();
          break;
        }
        case "spark": {
          a = 1 - q; ctx.globalCompositeOperation = "lighter";
          var sx = p.x - p.z * 0.3, sy = p.y - p.z * 0.45, len = 0.022, px = Math.max(1, 1.6 / (r.scale || 12) / p.w);
          ctx.lineCap = "round";
          ctx.strokeStyle = "rgba(" + col.join(",") + "," + (a * 0.55) + ")"; ctx.lineWidth = p.w * 2.4 * px;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * len, sy - p.vy * len); ctx.stroke();
          ctx.strokeStyle = "rgba(255,252,235," + a + ")"; ctx.lineWidth = p.w * px;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * len * 0.7, sy - p.vy * len * 0.7); ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
          break;
        }
        case "drop": {
          a = p.a * (q > 0.5 ? (1 - q) / 0.5 : 1);
          ctx.fillStyle = "rgba(" + col.join(",") + "," + a + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          break;
        }
        default: if (FX.partKinds[p.kind]) FX.partKinds[p.kind](ctx, p, q, r, t);
      }
      return true;
    });
  }
  function drawTimed(list, ctx, r, t) {
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i], el = t - e.t0;
      if (el > e.dur) { list.splice(i, 1); continue; }
      if (el < 0) continue;
      ctx.save(); try { e.draw(ctx, r, el / e.dur, el, t); } catch (err) { list.splice(i, 1); } ctx.restore();
    }
  }
  var lastT = 0;
  var baseDraw = P.draw;
  P.draw = function (b, st, t) {
    t = t || now();
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (b && b.units) try { stepTweens(this, b, t); } catch (e) { /* animation never blocks play */ }
    var sh = FX.shake, sx = 0, sy = 0;
    if (sh.amp && !reduced(this)) { var q = (t - sh.t0) / sh.dur; if (q < 1) { var m = sh.amp * (1 - q) * (1 - q); sx = Math.sin(t * 0.09) * m; sy = Math.cos(t * 0.11) * m; } else sh.amp = 0; }
    this.panX += sx; this.panY += sy;
    // regiments destroyed by a missile still in the air stay on the table until it lands
    var extra = [];
    if (b && b.units) {
      FX.ghosts = FX.ghosts.filter(function (g) { return g.until > t; });
      FX.ghosts.forEach(function (g) { if (b.units.indexOf(g.u) < 0 && extra.indexOf(g.u) < 0) extra.push(g.u); });
      extra.forEach(function (u) { b.units.push(u); });
    }
    try { baseDraw.call(this, b, st, t); } finally {
      this.panX -= sx; this.panY -= sy;
      extra.forEach(function (u) { var i = b.units.lastIndexOf(u); if (i >= 0) b.units.splice(i, 1); });
    }
    if (!b) return;
    var ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.translate(this.ox, this.oy); ctx.scale(this.scale, this.scale);
    try { drawFallen(ctx, this, t); drawParts(ctx, this, t, dt); drawTimed(FX.overlay, ctx, this, t); drawShots(ctx, this, t); } catch (e) { /* effects only */ }
    ctx.restore();
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    try { drawFloats(ctx, this, t); } catch (e) { /* effects only */ }
    ctx.restore();
  };

  // ---------- engine events ----------
  function UI() { return SOVL.UI; }
  function unitOf(b, uid) { return b.unit(uid) || (b.dead || []).find(function (u) { return u.uid === uid; }); }
  function onEvent(r, b, ev) {
    var calm = reduced(r), u, t;
    switch (ev.type) {
      case "move": case "charge": case "flee":
        u = b.unit(ev.uid); if (!u || b.phase === "deploy") break;
        if (calm || ev.undo) { u._tw = null; u._rx = u.x; u._ry = u.y; u._ra = u.a; break; }
        if (u._rx == null && ev.from) { u._rx = ev.from.x; u._ry = ev.from.y; u._ra = ev.from.a; }
        queueMove(u, ev.to, ev.type === "move" ? "move" : ev.type);
        break;
      case "roll": {
        if (calm) break;
        var sp = ev.spec || {}, res = ev.res || {};
        u = unitOf(b, sp.uid); t = sp.targetUid != null ? unitOf(b, sp.targetUid) : null;
        if (sp.kind === "hits" && sp.ranged && u && t) launch(r, u, t, res.hits || 0, sp.n || 1, /fires/.test(sp.label || "") && !u.ranged);
        else if (sp.kind === "hits" && u && t) strike(r, u, t, res.hits || 0);
        else if (sp.kind === "saves" && u) { var su = u, sf = res.failed || 0, ss = Math.max(0, (sp.n || 0) - sf); later(u.uid, function () { saves(r, su, sf, ss); }); }
        else if (sp.kind === "discipline" && u && sp.n && !res.ok) { var rp = rpos(u); for (var i = 0; i < 6; i++) dust(rp.x + rnd(-u.w / 2, u.w / 2), rp.y + rnd(-u.d / 2, u.d / 2), 0.8); }
        break;
      }
      case "wounds": {
        u = unitOf(b, ev.uid); if (!u || calm) break;
        var due = pending(u.uid), wu = u, killed = ev.killed || 0;
        if (due && killed) { var h = FX.hold[u.uid]; if (!h || h.until <= now()) h = FX.hold[u.uid] = { until: due, killed: 0 }; h.killed += killed; h.until = Math.max(h.until, due); }
        later(u.uid, function () { casualties(r, wu, killed); });
        break;
      }
      case "destroy": {
        u = unitOf(b, ev.uid); if (!u || calm) break;
        if (pending(u.uid)) FX.ghosts.push({ u: u, until: pending(u.uid) });
        var du = u, how = ev.how;
        later(u.uid, function () {
          var dp = rpos(du);
          for (var d = 0; d < 12; d++) dust(dp.x + rnd(-du.w / 2, du.w / 2), dp.y + rnd(-du.d / 2, du.d / 2), how === "fled" ? 1 : 1.5);
          if (how !== "fled" && SOVL.isSingle(du.type)) { casualties(r, Object.assign(Object.create(du), { models: 1 }), 1); shake(5, 300); }
        });
        break;
      }
      case "commanderDeath":
        u = unitOf(b, ev.uid); if (!u || calm) break;
        var cp = rpos(u); ring(cp.x, cp.y, 3, [255, 210, 120], 700, 0.15); glow(cp.x, cp.y, 1.5, [255, 190, 90], 600);
        break;
    }
  }
  function runHooks(r, b, ev) { var calm = reduced(r); FX.eventHooks.forEach(function (fn) { try { fn(r, b, ev, calm); } catch (e) { /* effects only */ } }); }
  FX.h = { add: add, dust: dust, smoke: smoke, sparks: sparks, blood: blood, glow: glow, ring: ring, motes: motes, shake: shake, rpos: rpos, now: now, rnd: rnd, clamp: clamp, ease: ease, easeIn: easeIn,
    reduced: reduced, at: at, expect: expect, pending: pending, later: later, casualties: casualties, undead: undead, mounted: mounted, unitOf: unitOf, hexRgb: hexRgb, UI: UI };

  window.addEventListener("load", function () {
    var ui = UI(); if (!ui) return;
    var pe = ui.processEvents;
    ui.processEvents = function () {
      var b = ui.battle, r = ui.renderer;
      if (b && r && b.events && b.events.length) { var evs = b.events.slice(); evs.forEach(function (ev) { try { onEvent(r, b, ev); } catch (e) { /* effects only */ } runHooks(r, b, ev); }); }
      return pe.apply(ui, arguments);
    };
    // replace the old square spark burst with metal sparks and dust
    P.addImpact = function (x, y) { if (reduced(this)) return; sparks(x, y, 10, [255, 225, 160]); dust(x, y, 1); };
    // a new battle starts with a clean slate
    var start = ui.startBattle;
    ui.startBattle = function () {
      FX.gen++; FX.parts = []; FX.shots = []; FX.fallen = []; FX.floats = []; FX.contact = {};
      FX.incoming = {}; FX.hold = {}; FX.ghosts = []; FX.ground = []; FX.overlay = []; FX.auraStart = {};
      return start.apply(ui, arguments);
    };
    // ground effects (rune circles, portals) are painted under the regiments
    var overlays = P.drawTacticalOverlays;
    P.drawTacticalOverlays = function (b, st, t) {
      if (overlays) overlays.apply(this, arguments);
      if (FX.ground.length) try { drawTimed(FX.ground, this.ctx, this, now()); } catch (e) { /* effects only */ }
    };
    // regiments: held casualties, rising summons and spell auras under and over the models
    var drawUnit = P.drawUnit;
    P.drawUnit = function (u, battle, st, t) {
      var ctx = this.ctx, tt = now(), h = FX.hold[u.uid], keep = null, rise = u._rise, lift = null;
      if (h && h.until <= tt) { delete FX.hold[u.uid]; h = null; }
      if (rise) { var q = (tt - rise.t0) / rise.dur; if (q < 0) return; if (q >= 1) u._rise = null; else lift = ease(q); }
      if (h && h.killed && SOVL.refreshFootprint) {
        keep = { models: u.models, x: u.x, y: u.y, w: u.w, d: u.d, rx: u._rx, ry: u._ry };
        u.models += h.killed; SOVL.refreshFootprint(u, true); u._rx += u.x - keep.x; u._ry += u.y - keep.y;
      }
      var self = this;
      ctx.save();
      try {
        if (lift != null) { var rp = rpos(u), sc = 0.82 + 0.18 * lift; ctx.globalAlpha = lift; ctx.translate(rp.x, rp.y + (1 - lift) * 0.5); ctx.scale(sc, sc); ctx.translate(-rp.x, -rp.y); }
        FX.underUnit.forEach(function (fn) { try { ctx.save(); fn(ctx, self, u, tt); } catch (e) { /* effects only */ } finally { ctx.restore(); } });
        drawUnit.call(this, u, battle, st, t);
        FX.overUnit.forEach(function (fn) { try { ctx.save(); fn(ctx, self, u, tt); } catch (e) { /* effects only */ } finally { ctx.restore(); } });
      } finally {
        ctx.restore();
        if (keep) { u.models = keep.models; u.x = keep.x; u.y = keep.y; u.w = keep.w; u.d = keep.d; u._rx = keep.rx; u._ry = keep.ry; }
      }
    };
  });
})();
