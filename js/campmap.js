// The Trail of Death map, drawn as an old campaign chart: a parchment sheet with inked hills,
// forests, marsh, mountains and a river that change with each act, a winding road between
// the stops, the route already marched inked in red, and wax-seal markers for every stop.
// The static sheet is painted once per act and size; seals and the open routes animate on
// top. Real buttons sit over the reachable seals so the map works with keyboard and tests.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, C = SOVL.Campaign;
  var INK = "rgba(52,34,18,", PAPER = [226, 208, 166];
  var TYPE = {
    battle: { name: "Battle", seal: [148, 38, 30], note: "An enemy army bars the road. Victory brings gold and veterancy." },
    elite: { name: "Elite battle", seal: [86, 22, 26], note: "A veteran force. A harder fight for better plunder." },
    boss: { name: "Boss", seal: [40, 14, 16], note: "The master of this land, with a full army. Win to open the next act." },
    event: { name: "Event", seal: [48, 66, 118], note: "Something waits on the road: a choice, a stranger, or trouble." },
    merchant: { name: "Merchant", seal: [176, 132, 44], note: "Recruits, relics, re-arming and reinforcements, for gold." },
    camp: { name: "Camp", seal: [58, 96, 54], note: "Rest to recover stragglers, or drill one unit." },
    treasure: { name: "Treasure", seal: [188, 124, 36], note: "Unguarded spoils: gold or a magic item." }
  };
  var THEME = [
    { forest: 0.55, hill: 0.3, mountain: 0.05, marsh: 0.05, dead: 0, ruin: 0.05, wash: [120, 150, 80], river: true, fields: true },
    { forest: 0.25, hill: 0.15, mountain: 0.05, marsh: 0.4, dead: 0.1, ruin: 0.1, wash: [100, 120, 100], river: true, fields: false },
    { forest: 0.05, hill: 0.15, mountain: 0.45, marsh: 0.05, dead: 0.25, ruin: 0.1, wash: [120, 110, 100], river: false, fields: false }
  ];
  var sheet = null, state = null, raf = null, hoverIdx = null;

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s += 0x6d2b79f5; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise(seed) {
    var r = rng(seed), p = [], v = [];
    for (var i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
    for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    function n(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      function h(a, b) { return v[p[(p[a & 255] + b) & 255]]; }
      var a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    }
    return function (x, y) { return (n(x, y) * 0.55 + n(x * 2.1 + 5, y * 2.1) * 0.3 + n(x * 4.3 + 9, y * 4.3) * 0.15) - 0.5; };
  }

  // ---------- layout ----------
  function layout(camp, W) {
    var act = C.currentAct(camp), r = rng(camp.seed * 7 + camp.act * 131 + 3), phone = W < 520;
    var layerH = phone ? 96 : 112, top = 120, H = act.layers.length * layerH + top + 60, pos = [];
    act.layers.forEach(function (layer, li) {
      pos.push(layer.map(function (n, i) {
        var spread = Math.min(phone ? 110 : 230, (W - 60) / (layer.length + 0.2));
        var jx = n.type === "boss" ? 0 : (r() - 0.5) * spread * 0.28, jy = n.type === "boss" ? 0 : (r() - 0.5) * layerH * 0.22;
        return { x: W / 2 + (i - (layer.length - 1) / 2) * spread + jx, y: H - 70 - li * layerH + jy };
      }));
    });
    // each road bends a little, the same way every time
    var roads = [];
    act.layers.forEach(function (layer, li) {
      if (li >= act.layers.length - 1) return;
      layer.forEach(function (n, i) {
        n.next.forEach(function (j) {
          var a = pos[li][i], b = pos[li + 1][j], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          var bend = (r() - 0.5) * 34;
          roads.push({ li: li, i: i, j: j, a: a, b: b, c: { x: mx - dy / len * bend, y: my + dx / len * bend } });
        });
      });
    });
    return { act: act, W: W, H: H, pos: pos, roads: roads, phone: phone };
  }
  function bez(r, t) { var u = 1 - t; return { x: u * u * r.a.x + 2 * u * t * r.c.x + t * t * r.b.x, y: u * u * r.a.y + 2 * u * t * r.c.y + t * t * r.b.y }; }
  function distToRoads(L, x, y) {
    var best = 1e9;
    L.roads.forEach(function (r) { for (var t = 0; t <= 1; t += 0.1) { var p = bez(r, t); best = Math.min(best, Math.hypot(p.x - x, p.y - y)); } });
    return best;
  }
  function distToNodes(L, x, y) { var best = 1e9; L.pos.forEach(function (row) { row.forEach(function (p) { best = Math.min(best, Math.hypot(p.x - x, p.y - y)); }); }); return best; }

  // ---------- the parchment sheet ----------
  function paintSheet(camp, L, dpr) {
    var W = L.W, H = L.H, cv = document.createElement("canvas");
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext("2d"), n = noise(camp.seed + camp.act * 17), r = rng(camp.seed * 3 + camp.act), theme = THEME[Math.min(2, camp.act)] || THEME[0];
    g.scale(dpr, dpr);
    // paper: mottled fibres, stains and burnt edges, built at half resolution
    var pw = Math.ceil(W / 2), ph = Math.ceil(H / 2), pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
    var pg = pc.getContext("2d"), img = pg.createImageData(pw, ph), d = img.data;
    for (var y = 0; y < ph; y++) for (var x = 0; x < pw; x++) {
      var m = n(x / 90, y / 90) * 0.9 + n(x / 14 + 40, y / 14) * 0.25, stain = Math.max(0, n(x / 40 + 70, y / 40 + 20) - 0.18) * 1.6;
      var ex = Math.min(x, pw - 1 - x) / pw, ey = Math.min(y, ph - 1 - y) / ph, edge = Math.min(ex * 9, ey * (9 * ph / pw) * 0.6, 1);
      var burn = Math.pow(1 - Math.min(1, edge + n(x / 25, y / 25) * 0.4), 2.2);
      var k = 1 + m * 0.16 - stain * 0.18, o = (y * pw + x) * 4;
      d[o] = PAPER[0] * k * (1 - burn * 0.55); d[o + 1] = PAPER[1] * k * (1 - burn * 0.62); d[o + 2] = PAPER[2] * k * (1 - burn * 0.72);
      d[o + 3] = edge < 0.02 + (n(x / 12, y / 12) + 0.5) * 0.03 ? 0 : 255;
    }
    pg.putImageData(img, 0, 0);
    g.save(); g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 18; g.drawImage(pc, 0, 0, W, H); g.restore();
    g.drawImage(pc, 0, 0, W, H);
    // an old fold across the middle
    g.strokeStyle = "rgba(120,90,50,0.18)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(W / 2, 8); g.lineTo(W / 2 + 3, H - 8); g.stroke();
    // a river winding up the sheet
    if (theme.river) {
      var rx = W * (0.15 + r() * 0.7), pts = [];
      for (var ry = H + 10; ry > -10; ry -= 40) { rx += (r() - 0.5) * 70; rx = Math.max(30, Math.min(W - 30, rx)); pts.push({ x: rx, y: ry }); }
      g.lineCap = "round"; g.lineJoin = "round";
      [[9, "rgba(90,120,140,0.28)"], [5, "rgba(110,140,160,0.35)"], [1.4, INK + "0.55)"]].forEach(function (s) {
        g.strokeStyle = s[1]; g.lineWidth = s[0]; g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        g.stroke();
      });
    }
    // scenery, kept clear of the stops and roads
    var tries = Math.floor(W * H / 2400);
    for (var t = 0; t < tries; t++) {
      var sx = 14 + r() * (W - 28), sy = 40 + r() * (H - 60);
      if (distToNodes(L, sx, sy) < 44 || distToRoads(L, sx, sy) < 18) continue;
      var biome = n(sx / 170 + 11, sy / 170) + 0.5, pick = r(), kind;
      var acc = 0, order = ["forest", "hill", "mountain", "marsh", "dead", "ruin"];
      for (var q = 0; q < order.length; q++) { acc += theme[order[q]]; if (pick < acc) { kind = order[q]; break; } }
      if (!kind || (biome < 0.42 && kind !== "hill") || (kind === "hill" && biome > 0.7)) continue;
      if (kind === "forest" && r() < 0.7) { for (var f = 0, nf = 7 + Math.floor(r() * 8); f < nf; f++) { var fx = sx + (r() - 0.5) * 46, fy = sy + (r() - 0.5) * 26; if (distToNodes(L, fx, fy) > 40 && distToRoads(L, fx, fy) > 14) tree(g, fx, fy, 5 + r() * 3, r, theme, camp.act); } }
      else if (kind === "forest") tree(g, sx, sy, 6 + r() * 3, r, theme, camp.act);
      else if (kind === "hill") hill(g, sx, sy, 12 + r() * 10);
      else if (kind === "mountain" && distToNodes(L, sx, sy) > 56) mountain(g, sx, sy, 16 + r() * 16, r, camp.act === 2);
      else if (kind === "marsh") marsh(g, sx, sy, r);
      else if (kind === "dead") deadTree(g, sx, sy, 8 + r() * 5, r);
      else if (kind === "ruin" && r() < 0.35) ruin(g, sx, sy, r);
    }
    if (theme.fields) for (var fi = 0; fi < 4; fi++) { var fx2 = 30 + r() * (W - 60), fy2 = H - 40 - r() * 120; if (distToNodes(L, fx2, fy2) > 50 && distToRoads(L, fx2, fy2) > 24) field(g, fx2, fy2, r); }
    compass(g, W - (L.phone ? 40 : 62), H - (L.phone ? 46 : 64), L.phone ? 22 : 30);
    // roads: dashed ink, the marched route drawn over later
    L.roads.forEach(function (rd) {
      g.strokeStyle = INK + "0.5)"; g.lineWidth = 1.6; g.setLineDash([5, 5]);
      g.beginPath(); g.moveTo(rd.a.x, rd.a.y); g.quadraticCurveTo(rd.c.x, rd.c.y, rd.b.x, rd.b.y); g.stroke(); g.setLineDash([]);
    });
    // act cartouche
    cartouche(g, W / 2, 46, L.act.name.replace(/^Act [IV]+ — /, ""), L.act.name.match(/^Act [IV]+/) ? L.act.name.match(/^Act [IV]+/)[0].toUpperCase() : "", L.phone);
    return cv;
  }
  function tree(g, x, y, s, r, theme, act) {
    g.fillStyle = "rgba(60,40,20,0.12)"; g.beginPath(); g.ellipse(x + s * 0.35, y + s * 0.8, s * 0.9, s * 0.35, 0, 0, 6.28); g.fill();
    g.strokeStyle = INK + "0.75)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + s * 0.3); g.lineTo(x, y + s * 0.95); g.stroke();
    var wash = theme.wash;
    g.fillStyle = "rgba(" + wash[0] + "," + wash[1] + "," + wash[2] + ",0.45)";
    if (act === 1 && r() < 0.5) { g.beginPath(); g.moveTo(x, y - s * 1.1); g.lineTo(x + s * 0.7, y + s * 0.45); g.lineTo(x - s * 0.7, y + s * 0.45); g.closePath(); g.fill(); g.stroke(); return; }
    g.beginPath();
    for (var k = 0; k < 6; k++) { var a = k / 6 * 6.28, rr = s * (0.62 + r() * 0.12); g.arc(x + Math.cos(a) * s * 0.28, y - s * 0.2 + Math.sin(a) * s * 0.22, rr * 0.55, a - 1.2, a + 1.2); }
    g.closePath(); g.fill(); g.stroke();
  }
  function hill(g, x, y, s) {
    g.strokeStyle = INK + "0.55)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - s, y); g.quadraticCurveTo(x, y - s * 0.9, x + s, y); g.stroke();
    g.lineWidth = 0.8; for (var k = 1; k < 4; k++) { var hx = x + s * (0.15 + k * 0.18); g.beginPath(); g.moveTo(hx, y - s * (0.5 - k * 0.12)); g.lineTo(hx + s * 0.08, y - 1); g.stroke(); }
  }
  function mountain(g, x, y, s, r, snow) {
    var px = x + (r() - 0.5) * s * 0.3;
    g.fillStyle = "rgba(150,130,100,0.35)"; g.beginPath(); g.moveTo(x - s, y); g.lineTo(px, y - s * 1.1); g.lineTo(x + s, y); g.closePath(); g.fill();
    g.fillStyle = "rgba(90,70,45,0.28)"; g.beginPath(); g.moveTo(px, y - s * 1.1); g.lineTo(x + s, y); g.lineTo(px + s * 0.1, y); g.closePath(); g.fill();
    if (snow) { g.fillStyle = "rgba(245,240,228,0.9)"; g.beginPath(); g.moveTo(px, y - s * 1.1); g.lineTo(px + s * 0.28, y - s * 0.78); g.lineTo(px + s * 0.08, y - s * 0.82); g.lineTo(px - s * 0.1, y - s * 0.72); g.lineTo(px - s * 0.3, y - s * 0.8); g.closePath(); g.fill(); }
    g.strokeStyle = INK + "0.8)"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x - s, y); g.lineTo(px, y - s * 1.1); g.lineTo(x + s, y); g.stroke();
    g.lineWidth = 0.7; for (var k = 1; k < 5; k++) { var t = k / 5; g.beginPath(); g.moveTo(px + (x + s - px) * t * 0.9, y - s * 1.1 * (1 - t * 0.9)); g.lineTo(px + (x + s - px) * t * 0.9 - s * 0.12, y - s * 0.1); g.stroke(); }
  }
  function marsh(g, x, y, r) {
    g.strokeStyle = "rgba(70,100,110,0.55)"; g.lineWidth = 1;
    for (var k = 0; k < 3; k++) { var yy = y + k * 4, w = 8 + r() * 8; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x + w, yy); g.stroke(); }
    g.strokeStyle = INK + "0.6)"; for (var t = 0; t < 4; t++) { var tx = x - 8 + t * 5; g.beginPath(); g.moveTo(tx, y - 1); g.lineTo(tx + (t - 1.5), y - 7 - r() * 4); g.stroke(); }
  }
  function deadTree(g, x, y, s, r) {
    g.strokeStyle = INK + "0.75)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s); g.stroke();
    g.lineWidth = 0.8; for (var k = 0; k < 4; k++) { var by = y - s * (0.4 + k * 0.15), d = k % 2 ? 1 : -1; g.beginPath(); g.moveTo(x, by); g.lineTo(x + d * s * (0.4 + r() * 0.3), by - s * 0.3); g.stroke(); }
  }
  function ruin(g, x, y, r) {
    g.strokeStyle = INK + "0.7)"; g.lineWidth = 1.1; g.fillStyle = "rgba(150,130,100,0.35)";
    for (var k = 0; k < 3; k++) { var h = 5 + r() * 8; g.fillRect(x + k * 6 - 9, y - h, 4, h); g.strokeRect(x + k * 6 - 9, y - h, 4, h); }
    g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 10, y); g.stroke();
  }
  function field(g, x, y, r) {
    var w = 26 + r() * 16, h = 14 + r() * 8, a = (r() - 0.5) * 0.5;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = "rgba(190,160,80,0.25)"; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = INK + "0.35)"; g.lineWidth = 0.7; g.strokeRect(-w / 2, -h / 2, w, h);
    for (var k = -w / 2 + 3; k < w / 2; k += 4) { g.beginPath(); g.moveTo(k, -h / 2 + 1); g.lineTo(k, h / 2 - 1); g.stroke(); }
    g.restore();
  }
  function compass(g, x, y, s) {
    g.save(); g.translate(x, y);
    g.strokeStyle = INK + "0.6)"; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, s * 0.62, 0, 6.28); g.stroke();
    for (var k = 0; k < 4; k++) {
      g.save(); g.rotate(k * Math.PI / 2);
      g.fillStyle = k === 0 ? "rgba(140,40,30,0.85)" : INK + "0.7)"; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.16, 0); g.lineTo(-s * 0.16, 0); g.closePath(); g.fill();
      g.restore();
    }
    g.font = "700 " + Math.round(s * 0.36) + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.textAlign = "center"; g.fillStyle = INK + "0.85)"; g.fillText("N", 0, -s - 4);
    g.restore();
  }
  function cartouche(g, x, y, title, act, phone) {
    var fs = phone ? 15 : 19;
    g.font = "700 " + fs + "px 'Marcellus SC', 'Barlow Semi Condensed', serif";
    var w = Math.max(g.measureText(title).width + 70, 200), h = phone ? 44 : 52;
    g.save(); g.translate(x, y);
    g.fillStyle = "rgba(236,222,186,0.95)"; g.strokeStyle = INK + "0.8)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.quadraticCurveTo(w / 2 + 14, 0, w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.quadraticCurveTo(-w / 2 - 14, 0, -w / 2, -h / 2); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-w / 2 + 8, -h / 2 + 5); g.lineTo(w / 2 - 8, -h / 2 + 5); g.moveTo(-w / 2 + 8, h / 2 - 5); g.lineTo(w / 2 - 8, h / 2 - 5); g.lineWidth = 0.7; g.stroke();
    g.textAlign = "center"; g.fillStyle = "rgba(140,40,30,0.9)"; g.font = "700 " + Math.round(fs * 0.6) + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.fillText(act, 0, -h / 2 + (phone ? 16 : 18));
    g.fillStyle = INK + "0.95)"; g.font = "700 " + fs + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.fillText(title, 0, h / 2 - (phone ? 9 : 11));
    g.restore();
  }

  // ---------- seals, route and army ----------
  function seal(g, x, y, R, col, t, alpha, seed) {
    var r = rng(seed);
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = "rgba(40,20,10,0.35)"; g.beginPath(); g.ellipse(x + 2, y + 3, R * 1.02, R * 0.96, 0, 0, 6.28); g.fill();
    g.beginPath();
    for (var k = 0; k <= 18; k++) { var a = k / 18 * 6.28, rr = R * (1 + (r() - 0.5) * 0.12); if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath();
    var gr = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R * 1.1);
    gr.addColorStop(0, "rgb(" + col.map(function (c) { return Math.min(255, c * 1.5 + 30); }).join(",") + ")");
    gr.addColorStop(0.55, "rgb(" + col.join(",") + ")"); gr.addColorStop(1, "rgb(" + col.map(function (c) { return c * 0.55; }).join(",") + ")");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(255,240,210,0.28)"; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, R * 0.74, 0, 6.28); g.stroke();
    g.restore();
  }
  function icon(g, type, x, y, R, alpha) {
    g.save(); g.globalAlpha = alpha; g.translate(x, y);
    var s = R * 0.55; g.strokeStyle = "rgba(250,236,204,0.95)"; g.fillStyle = "rgba(250,236,204,0.95)"; g.lineWidth = Math.max(1.4, R * 0.1); g.lineCap = "round"; g.lineJoin = "round";
    if (type === "battle") { [-1, 1].forEach(function (d) { g.beginPath(); g.moveTo(-s * d, s); g.lineTo(s * 0.9 * d, -s * 0.9); g.stroke(); g.beginPath(); g.moveTo(-s * d * 0.55 - s * 0.25, s * 0.35 * 1.2); g.lineTo(-s * d * 0.55 + s * 0.25, s * 0.75); g.stroke(); }); }
    else if (type === "elite") { g.beginPath(); g.arc(0, -s * 0.15, s * 0.7, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(s * 0.4, s * 0.8); g.lineTo(-s * 0.4, s * 0.8); g.closePath(); g.fill(); g.fillStyle = "rgba(60,15,15,1)"; g.beginPath(); g.arc(-s * 0.28, -s * 0.1, s * 0.18, 0, 6.28); g.arc(s * 0.28, -s * 0.1, s * 0.18, 0, 6.28); g.fill(); }
    else if (type === "boss") { g.beginPath(); g.moveTo(-s, s * 0.6); g.lineTo(-s, -s * 0.4); g.lineTo(-s * 0.5, s * 0.05); g.lineTo(0, -s * 0.8); g.lineTo(s * 0.5, s * 0.05); g.lineTo(s, -s * 0.4); g.lineTo(s, s * 0.6); g.closePath(); g.fillStyle = "rgba(232,190,90,0.95)"; g.fill(); }
    else if (type === "merchant") { g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.8); g.moveTo(-s * 0.5, s * 0.8); g.lineTo(s * 0.5, s * 0.8); g.moveTo(-s, -s * 0.55); g.lineTo(s, -s * 0.55); g.stroke(); [-1, 1].forEach(function (d) { g.beginPath(); g.arc(d * s * 0.8, -s * 0.05, s * 0.35, 0, Math.PI); g.stroke(); }); }
    else if (type === "camp") { g.beginPath(); g.moveTo(-s, s * 0.75); g.lineTo(0, -s * 0.85); g.lineTo(s, s * 0.75); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(0, -s * 0.85); g.lineTo(-s * 0.2, s * 0.75); g.lineTo(s * 0.25, s * 0.75); g.closePath(); g.fill(); }
    else if (type === "treasure") { g.strokeRect(-s * 0.9, -s * 0.2, s * 1.8, s); g.beginPath(); g.moveTo(-s * 0.9, -s * 0.2); g.quadraticCurveTo(0, -s * 1.1, s * 0.9, -s * 0.2); g.stroke(); g.fillRect(-s * 0.15, -s * 0.05, s * 0.3, s * 0.35); }
    else { g.font = "700 " + Math.round(R * 1.1) + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, s * 0.1); }
    g.restore();
  }
  function banner(g, x, y, color, t) {
    var wave = Math.sin(t / 380) * 2.5;
    g.save(); g.translate(x, y);
    g.strokeStyle = INK + "0.95)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -42); g.stroke();
    g.fillStyle = color; g.strokeStyle = INK + "0.8)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(1, -41); g.quadraticCurveTo(12, -44 + wave, 24, -40 + wave * 0.5); g.lineTo(18, -33 + wave * 0.3); g.lineTo(24, -26 + wave * 0.5); g.quadraticCurveTo(12, -29 + wave, 1, -26); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(232,190,90,1)"; g.beginPath(); g.arc(0, -43, 2.5, 0, 6.28); g.fill();
    g.restore();
  }
  function label(g, text, x, y, size, bold) {
    g.font = (bold ? "700 " : "600 ") + size + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.lineWidth = 4; g.strokeStyle = "rgba(232,216,178,0.9)"; g.strokeText(text, x, y);
    g.fillStyle = INK + "0.95)"; g.fillText(text, x, y);
  }

  // ---------- drawing and interaction ----------
  function draw(now) {
    var s = state; if (!s) return;
    var g = s.cv.getContext("2d"), L = s.L, camp = UI.campaign, act = L.act;
    g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    g.drawImage(sheet.cv, 0, 0, L.W, L.H);
    var cur = camp.nodeIndex == null ? null : { li: camp.layer, i: camp.nodeIndex }, nextLayer = camp.nodeIndex == null ? 0 : camp.layer + 1;
    // the route already marched: solid red ink with small footfalls
    L.roads.forEach(function (rd) {
      var a = act.layers[rd.li][rd.i], b = act.layers[rd.li + 1][rd.j];
      var walked = a.visited && b.visited && !(cur && rd.li + 1 > cur.li);
      var open = cur && rd.li === cur.li && rd.i === cur.i && s.avail.indexOf(rd.j) >= 0;
      if (walked) { g.strokeStyle = "rgba(140,34,26,0.85)"; g.lineWidth = 3.2; g.setLineDash([]); g.beginPath(); g.moveTo(rd.a.x, rd.a.y); g.quadraticCurveTo(rd.c.x, rd.c.y, rd.b.x, rd.b.y); g.stroke(); }
      else if (open) {
        g.strokeStyle = "rgba(214,160,40," + (0.65 + 0.3 * Math.sin(now / 300)) + ")"; g.lineWidth = 3; g.setLineDash([7, 6]); g.lineDashOffset = -now / 60;
        g.beginPath(); g.moveTo(rd.a.x, rd.a.y); g.quadraticCurveTo(rd.c.x, rd.c.y, rd.b.x, rd.b.y); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
      }
    });
    act.layers.forEach(function (layer, li) {
      layer.forEach(function (n, i) {
        var p = L.pos[li][i], T = TYPE[n.type] || TYPE.battle, R = n.type === "boss" ? 25 : L.phone ? 16 : 18;
        var avail = li === nextLayer && s.avail.indexOf(i) >= 0, here = cur && cur.li === li && cur.i === i;
        var alpha = n.visited && !here ? 0.5 : li < nextLayer && !here ? 0.35 : 1;
        if (avail) {
          var pulse = 0.5 + 0.5 * Math.sin(now / 260 + i);
          g.save(); g.fillStyle = "rgba(240,200,90," + (0.25 + 0.25 * pulse) + ")"; g.beginPath(); g.arc(p.x, p.y, R + 7 + pulse * 3, 0, 6.28); g.fill();
          g.strokeStyle = "rgba(200,140,30,0.9)"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, R + 5 + pulse * 2, 0, 6.28); g.stroke(); g.restore();
        }
        if (hoverIdx === i && avail) { g.save(); g.strokeStyle = "rgba(90,40,10,0.9)"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, R + 11, 0, 6.28); g.stroke(); g.restore(); }
        seal(g, p.x, p.y, R, T.seal, now, alpha, camp.seed + li * 31 + i * 7);
        icon(g, n.type, p.x, p.y, R, alpha);
        if (n.visited && !here) { g.save(); g.strokeStyle = "rgba(60,30,15,0.7)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(p.x - R * 0.7, p.y - R * 0.7); g.lineTo(p.x + R * 0.7, p.y + R * 0.7); g.moveTo(p.x + R * 0.7, p.y - R * 0.7); g.lineTo(p.x - R * 0.7, p.y + R * 0.7); g.stroke(); g.restore(); }
        g.save(); g.globalAlpha = Math.max(alpha, 0.6);
        if (n.type === "boss") label(g, act.boss.name, p.x, p.y + R + 20, L.phone ? 12 : 14, true);
        else label(g, T.name, p.x, p.y + R + 16, L.phone ? 10 : 12, false);
        g.restore();
      });
    });
    var bp = cur ? L.pos[cur.li][cur.i] : { x: L.W / 2, y: L.H - 22 };
    banner(g, bp.x + (cur ? 12 : 0), bp.y - (cur ? 10 : 0), (SOVL.FACTION_INFO[camp.faction] || {}).color || "#557fab", now);
  }
  function loop(now) {
    raf = null;
    if (!state || UI.screen !== "campaign" || !document.body.contains(state.cv)) { state = null; return; }
    draw(now || performance.now());
    raf = requestAnimationFrame(loop);
  }
  function hitNode(x, y) {
    var s = state; if (!s) return null;
    var nextLayer = UI.campaign.nodeIndex == null ? 0 : UI.campaign.layer + 1, row = s.L.pos[nextLayer];
    if (!row) return null;
    for (var i = 0; i < row.length; i++) if (s.avail.indexOf(i) >= 0 && Math.hypot(row[i].x - x, row[i].y - y) < 28) return i;
    return null;
  }

  UI.renderCampaign = (function (prev) {
    return function () {
      prev.apply(UI, arguments);
      var camp = UI.campaign, map = document.getElementById("camp-map");
      if (!camp || !map) return;
      var old = map.querySelector("svg"); if (old) old.remove();
      var W = Math.max(300, Math.min(map.clientWidth - 24, 1100)), L = layout(camp, W), dpr = Math.min(2, window.devicePixelRatio || 1);
      var key = [camp.seed, camp.act, W, dpr].join("|");
      if (!sheet || sheet.key !== key) sheet = { key: key, cv: paintSheet(camp, L, dpr) };
      var wrap = document.createElement("div"); wrap.className = "trail-map"; wrap.style.width = W + "px"; wrap.style.height = L.H + "px";
      var cv = document.createElement("canvas"); cv.width = Math.round(W * dpr); cv.height = Math.round(L.H * dpr); cv.style.width = W + "px"; cv.style.height = L.H + "px";
      cv.setAttribute("aria-hidden", "true");
      wrap.appendChild(cv);
      var avail = C.availableNodes(camp), nextLayer = camp.nodeIndex == null ? 0 : camp.layer + 1;
      avail.forEach(function (i) {
        var n = L.act.layers[nextLayer][i], p = L.pos[nextLayer][i], T = TYPE[n.type] || TYPE.battle;
        var b = document.createElement("button"); b.className = "node avail"; b.type = "button";
        b.style.left = (p.x - 24) + "px"; b.style.top = (p.y - 24) + "px";
        b.setAttribute("aria-label", "Travel to " + (n.type === "boss" ? L.act.boss.name : T.name));
        b.title = (n.type === "boss" ? L.act.boss.name + ". " : T.name + ". ") + T.note;
        b.onclick = function () { UI.travel(i); };
        b.onmouseenter = function () { hoverIdx = i; }; b.onmouseleave = function () { hoverIdx = null; };
        b.onfocus = b.onmouseenter; b.onblur = b.onmouseleave;
        wrap.appendChild(b);
      });
      var heading = map.querySelector(".campaign-heading");
      map.innerHTML = ""; if (heading) map.appendChild(heading);
      map.appendChild(wrap);
      state = { cv: cv, L: L, dpr: dpr, avail: avail };
      draw(performance.now());
      if (!raf) raf = requestAnimationFrame(loop);
      // bring the army's position into view
      var focusY = (camp.nodeIndex == null ? L.H - 80 : L.pos[camp.layer][camp.nodeIndex].y) - map.clientHeight * 0.55;
      map.scrollTop = Math.max(0, Math.min(focusY + (heading ? heading.offsetHeight : 0), map.scrollHeight));
    };
  })(UI.renderCampaign);
  window.addEventListener("resize", function () { if (UI.screen === "campaign" && UI.campaign && !UI.campaign.over) UI.renderCampaign(); });
  SOVL.TrailMap = { layout: layout, hit: hitNode };
})();
