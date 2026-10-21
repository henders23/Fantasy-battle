// The map of the Broken March: the three painted landscapes joined into one country, provinces
// drawn over it with ragged borders tinted by their owner, names and feature marks, army tokens
// (the named lords carry their portraits), and the moves and attacks open to the selected army.
// Wheel or pinch to zoom, drag to pan. Drawing only; the rules are in js/conquest.js.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Conquest) return;
  var K = SOVL.Conquest, D = SOVL.CONQUEST, W = D.map.w, H = D.map.h;
  var M = { view: { zoom: 1, cx: W / 2, cy: H / 2 }, tweens: [], onReady: null };

  // ---------- the painted country ----------
  // the paintings load the first time the map is drawn, not with the page
  var panels = D.map.panels.map(function () { return new Image(); }), portraits = new Image(), started = false;
  function load() {
    if (started) return; started = true;
    panels.forEach(function (im, i) { im.onload = function () { base = null; if (M.onReady) M.onReady(); }; im.src = "assets/campaign/" + D.map.panels[i] + ".webp"; });
    portraits.onload = function () { if (M.onReady) M.onReady(); }; portraits.src = "assets/faction-portraits.webp";
  }
  var base = null;
  function loaded(im) { return im.complete && im.naturalWidth > 0; }
  // the three paintings, a little overlapped and feathered into each other, with mist on the joins
  function buildBase() {
    load();
    if (!panels.every(loaded)) return null;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d"), pw = W / panels.length, ov = 70;
    g.fillStyle = "#1a1d1c"; g.fillRect(0, 0, W, H);
    panels.forEach(function (im, i) {
      var x0 = i * pw - (i > 0 ? ov : 0), w = pw + (i > 0 ? ov : 0) + (i < panels.length - 1 ? ov : 0);
      if (i === 0) { g.drawImage(im, x0, 0, w, H); return; }
      var t = document.createElement("canvas"); t.width = Math.ceil(w); t.height = H;
      var tg = t.getContext("2d"); tg.drawImage(im, 0, 0, w, H);
      var fade = tg.createLinearGradient(0, 0, ov * 2, 0); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      tg.globalCompositeOperation = "destination-in"; tg.fillStyle = fade; tg.fillRect(0, 0, w, H); // one fill: destination-in clears whatever it does not cover
      g.drawImage(t, x0, 0);
    });
    // mist along the joins, where one land gives way to the next
    for (var i = 1; i < panels.length; i++) {
      var x = i * pw, mist = g.createLinearGradient(x - 140, 0, x + 140, 0);
      mist.addColorStop(0, "rgba(214,214,206,0)"); mist.addColorStop(0.5, "rgba(214,214,206,0.2)"); mist.addColorStop(1, "rgba(214,214,206,0)");
      g.fillStyle = mist; g.fillRect(x - 140, 0, 280, H);
    }
    // a darker, cooler grade so the borders and names read, and a vignette
    g.fillStyle = "rgba(14,18,26,0.26)"; g.fillRect(0, 0, W, H);
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  // ---------- view ----------
  // fit: the zoom at which the whole map fits the canvas
  function fitScale(cw, ch) { return Math.min(cw / W, ch / H); }
  function transform(cw, ch) {
    var v = M.view, sc = fitScale(cw, ch) * v.zoom;
    // keep the map covering the canvas where it can
    var halfW = cw / 2 / sc, halfH = ch / 2 / sc;
    v.cx = halfW * 2 >= W ? W / 2 : Math.max(halfW, Math.min(W - halfW, v.cx));
    v.cy = halfH * 2 >= H ? H / 2 : Math.max(halfH, Math.min(H - halfH, v.cy));
    return { s: sc, x: cw / 2 - v.cx * sc, y: ch / 2 - v.cy * sc };
  }
  M.toMap = function (cv, px, py) { var r = cv.getBoundingClientRect(), t = transform(r.width, r.height); return { x: (px - t.x) / t.s, y: (py - t.y) / t.s }; };
  M.toScreen = function (cv, x, y) { var r = cv.getBoundingClientRect(), t = transform(r.width, r.height); return { x: t.x + x * t.s, y: t.y + y * t.s }; };
  M.zoomAt = function (cv, px, py, factor) {
    var before = M.toMap(cv, px, py), v = M.view;
    v.zoom = Math.max(1, Math.min(3.5, v.zoom * factor));
    var r = cv.getBoundingClientRect(), sc = fitScale(r.width, r.height) * v.zoom;
    v.cx = before.x - (px - r.width / 2) / sc; v.cy = before.y - (py - r.height / 2) / sc;
  };
  M.pan = function (cv, dx, dy) { var r = cv.getBoundingClientRect(), sc = fitScale(r.width, r.height) * M.view.zoom; M.view.cx -= dx / sc; M.view.cy -= dy / sc; };
  M.centerOn = function (id) { var p = K.prov(id); if (p) { M.view.cx = p.x; M.view.cy = p.y; } };

  // ---------- where things are ----------
  var COLOR = {}; Object.keys(D.powers).forEach(function (k) { COLOR[k] = D.powers[k].color; });
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  // where an army stands: its province's heart, or on the road between two while it marches
  function heart(a) {
    var p = K.prov(a.at), tw = M.tweens.filter(function (t) { return t.army === a.id; })[0];
    if (!tw) return { x: p.x, y: p.y };
    var k = ease(Math.min(1, (performance.now() - tw.t0) / tw.ms)), q = K.prov(tw.from);
    return { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
  }
  function labelSize(t) { return Math.max(10.5, Math.min(17, 34 * t.s)); }
  // tokens stand above the province's mark and name, in screen space
  function tokenScreen(t, a) { var h = heart(a), R0 = tokenR(t), r = a.lord ? R0 * 1.18 : R0; return { x: t.x + h.x * t.s, y: t.y + h.y * t.s - labelSize(t) * 1.25 - r - 4, r: r }; }
  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function inPoly(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  // what is under a point on the canvas: an army token, or a province
  M.hit = function (cv, s, px, py) {
    var r = cv.getBoundingClientRect(), t = transform(r.width, r.height), m = M.toMap(cv, px, py);
    var armies = s.armies.slice().sort(function (a, b) { return (a.power === "player") - (b.power === "player"); });
    for (var i = armies.length - 1; i >= 0; i--) { var p = tokenScreen(t, armies[i]); if (Math.hypot(px - p.x, py - p.y) < p.r * 1.15) return { army: armies[i].id, province: armies[i].at }; }
    var cells = K.geometry().cells;
    for (var id in cells) if (inPoly(cells[id].path, m.x, m.y)) return { province: id };
    return null;
  };
  function tokenR(t) { return Math.max(13, Math.min(24, 50 * t.s)); }

  // ---------- drawing ----------
  // ui: { selected: armyId, province: id, hover: {province, army}, reach: {id: {kind}}, flash: {id: kind} }
  M.draw = function (cv, s, ui, now) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect(), cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    var g = cv.getContext("2d"), t = transform(cw, ch); now = now || performance.now();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0b1016"; g.fillRect(0, 0, cw, ch);
    if (!base) base = buildBase();
    g.save(); g.translate(t.x, t.y); g.scale(t.s, t.s);
    if (base) g.drawImage(base, 0, 0);
    var cells = K.geometry().cells, px = 1 / t.s, pulse = 0.5 + 0.5 * Math.sin(now / 280);
    function path(id) { var pts = cells[id].path; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); }
    // ownership
    K.ids.forEach(function (id) {
      var owner = s.provinces[id].owner, col = COLOR[owner] || "#888";
      path(id);
      g.fillStyle = owner === "neutral" ? "rgba(12,12,14,0.16)" : rgba(col, owner === "player" ? 0.2 : 0.16); g.fill();
      if (owner !== "neutral") { g.save(); g.clip(); g.lineWidth = 9 * px; g.strokeStyle = rgba(col, owner === "player" ? 0.85 : 0.7); g.stroke(); g.restore(); }
    });
    // borders in ink
    g.lineJoin = "round";
    K.ids.forEach(function (id) { path(id); g.lineWidth = 2.4 * px; g.strokeStyle = "rgba(8,8,10,0.7)"; g.stroke(); g.lineWidth = 0.8 * px; g.strokeStyle = "rgba(236,226,200,0.28)"; g.stroke(); });
    // what the selected army can do, over the borders so it stands out
    var reach = ui.reach || {};
    Object.keys(reach).forEach(function (id) {
      var k = reach[id].kind; path(id);
      if (k === "move") { g.fillStyle = "rgba(150,200,255,0.22)"; g.fill(); g.setLineDash([10 * px, 7 * px]); g.lineWidth = 3 * px; g.strokeStyle = "rgba(200,230,255,0.95)"; g.stroke(); g.setLineDash([]); }
      else { var c = k === "visit" ? "240,200,96" : "255,110,90"; g.fillStyle = "rgba(" + c + "," + (0.16 + 0.14 * pulse) + ")"; g.fill(); g.lineWidth = (3 + 1.5 * pulse) * px; g.strokeStyle = "rgba(" + c + ",0.95)"; g.stroke(); }
    });
    var hov = ui.hover && ui.hover.province;
    if (hov) { path(hov); g.fillStyle = "rgba(255,255,255,0.08)"; g.fill(); }
    if (ui.province) { path(ui.province); g.lineWidth = 3.5 * px; g.strokeStyle = "rgba(240,236,220,0.95)"; g.stroke(); }
    (ui.flash ? Object.keys(ui.flash) : []).forEach(function (id) { var f = ui.flash[id], a = Math.max(0, 1 - (now - f.t0) / 1600); if (a <= 0) return; path(id); g.fillStyle = (f.kind === "lost" ? "rgba(255,90,70," : "rgba(140,200,255,") + (0.35 * a) + ")"; g.fill(); });
    g.restore();
    // names and marks, in screen space so they stay legible at any zoom
    var fs = labelSize(t);
    K.ids.forEach(function (id) {
      var p = K.prov(id), sp = { x: t.x + p.x * t.s, y: t.y + p.y * t.s }, owner = s.provinces[id].owner;
      drawMark(g, p, sp.x, sp.y - fs * 0.2, fs, owner);
      g.font = "400 " + fs + "px 'Marcellus SC', Georgia, serif"; g.textAlign = "center"; g.textBaseline = "top";
      g.lineWidth = 3.5; g.strokeStyle = "rgba(6,8,12,0.85)"; g.strokeText(p.name, sp.x, sp.y + fs * 0.75);
      g.fillStyle = owner === "player" ? "#e4f0ff" : owner === "neutral" ? "#ece6d6" : "#f4ead6"; g.fillText(p.name, sp.x, sp.y + fs * 0.75);
    });
    // armies
    s.armies.slice().sort(function (a, b) { return (a.power === "player") - (b.power === "player"); }).forEach(function (a) {
      var sp = tokenScreen(t, a);
      drawToken(g, s, a, sp.x, sp.y, sp.r, ui, pulse);
    });
    M.tweens = M.tweens.filter(function (tw) { return now - tw.t0 < tw.ms; });
    return Object.keys(reach).some(function (id) { return reach[id].kind !== "move"; }) || M.tweens.length > 0 || (ui.flash && Object.keys(ui.flash).some(function (id) { return now - ui.flash[id].t0 < 1600; }));
  };
  // a small mark over the name: the seat's crown, a castle, a town; and the province's resource
  function drawMark(g, p, x, y, fs, owner) {
    var f = p.features, main = f.indexOf("capital") >= 0 ? "capital" : f.indexOf("seat") >= 0 ? "seat" : f.indexOf("fortress") >= 0 ? "fortress" : f.indexOf("town") >= 0 ? "town" : null;
    var extra = ["market", "horse", "forge", "mine", "shrine", "armoury"].filter(function (k) { return f.indexOf(k) >= 0; })[0];
    var sz = fs * 0.95, items = [main, extra].filter(Boolean), gap = sz * 1.25, x0 = x - (items.length - 1) * gap / 2;
    items.forEach(function (k, i) { glyph(g, k, x0 + i * gap, y - sz * 0.25, sz); });
  }
  function glyph(g, kind, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s / 20, s / 20);
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    switch (kind) {
      case "seat": case "fortress": case "capital":
        g.moveTo(-9, 8); g.lineTo(-9, -6); g.lineTo(-6, -6); g.lineTo(-6, -3); g.lineTo(-2, -3); g.lineTo(-2, -6); g.lineTo(2, -6); g.lineTo(2, -3); g.lineTo(6, -3); g.lineTo(6, -6); g.lineTo(9, -6); g.lineTo(9, 8); g.closePath();
        break;
      case "town": g.moveTo(-8, 8); g.lineTo(-8, -1); g.lineTo(0, -8); g.lineTo(8, -1); g.lineTo(8, 8); g.closePath(); break;
      case "market": g.arc(0, 0, 7.5, 0, Math.PI * 2); break;
      case "horse": g.moveTo(-7, 7); g.lineTo(-7, -2); g.arc(0, -2, 7, Math.PI, 0); g.lineTo(7, 7); g.lineTo(3.5, 7); g.lineTo(3.5, -2); g.arc(0, -2, 3.5, 0, Math.PI, true); g.lineTo(-3.5, 7); g.closePath(); break;
      case "forge": g.moveTo(-9, -4); g.lineTo(9, -4); g.lineTo(6, 1); g.lineTo(3, 1); g.lineTo(3, 5); g.lineTo(7, 8); g.lineTo(-7, 8); g.lineTo(-3, 5); g.lineTo(-3, 1); g.lineTo(-6, 1); g.closePath(); break;
      case "mine": g.moveTo(0, -8); g.lineTo(7, 0); g.lineTo(0, 8); g.lineTo(-7, 0); g.closePath(); break;
      case "shrine": for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 3.4 : 8.5; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); break;
      case "armoury": g.moveTo(-7, -7); g.lineTo(7, -7); g.lineTo(7, 0); g.quadraticCurveTo(7, 6, 0, 9); g.quadraticCurveTo(-7, 6, -7, 0); g.closePath(); break;
    }
    g.lineWidth = 4.5; g.strokeStyle = "rgba(6,8,12,0.85)"; g.stroke();
    g.fillStyle = kind === "capital" || kind === "seat" ? "#f0cf74" : kind === "market" ? "#e9c35f" : "#e9e2d0"; g.fill();
    if (kind === "capital" || kind === "seat") { g.beginPath(); g.moveTo(-5, -9); g.lineTo(-5, -14); g.lineTo(-2, -11); g.lineTo(0, -15); g.lineTo(2, -11); g.lineTo(5, -14); g.lineTo(5, -9); g.closePath(); g.lineWidth = 3; g.stroke(); g.fill(); }
    if (kind === "market") { g.fillStyle = "#6b4c12"; g.font = "bold 11px Barlow, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("g", 0, 0.5); }
    g.restore();
  }
  // faces in the portrait sheet (one 1/5 slice each): centre and size of each face
  var FACES = [[205, 160, 190], [212, 168, 210], [160, 160, 180], [142, 190, 210], [209, 180, 200]];
  // the same crop as a CSS background, for portraits in the panels and dialogs
  M.faceStyle = function (idx, size) {
    var f = FACES[idx], k = size / f[2], sw = 1983 / 5;
    return "background-size:" + (1983 * k).toFixed(1) + "px auto;background-position:" + (-(idx * sw + f[0] - f[2] / 2) * k).toFixed(1) + "px " + (-(f[1] - f[2] / 2) * k).toFixed(1) + "px";
  };
  M.face = function (g, idx, x, y, r) {
    load();
    if (!loaded(portraits)) return false;
    var sw = portraits.naturalWidth / 5, f = FACES[idx], k = portraits.naturalWidth / 1983;
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    g.drawImage(portraits, idx * sw + (f[0] - f[2] / 2) * k, (f[1] - f[2] / 2) * k, f[2] * k, f[2] * k, x - r, y - r, r * 2, r * 2);
    g.restore();
    return true;
  };
  function drawToken(g, s, a, x, y, r, ui, pulse) {
    var col = COLOR[a.power] || "#999", mine = a.power === "player", sel = ui.selected === a.id, lord = a.lord && D.lords[a.lord];
    if (sel) { g.beginPath(); g.arc(x, y, r + 7 + 2 * pulse, 0, Math.PI * 2); g.fillStyle = "rgba(190,224,255," + (0.22 + 0.18 * pulse) + ")"; g.fill(); }
    if (ui.hover && ui.hover.army === a.id && !sel) { g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.18)"; g.fill(); }
    // a shadow on the ground beneath
    g.beginPath(); g.ellipse(x, y + r * 0.95, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,0.35)"; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    var gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(1, "rgba(12,14,18,1)");
    g.fillStyle = gr; g.fill();
    var drew = lord && M.face(g, lord.portrait, x, y, r - 2.5);
    if (!drew) {
      var c = K.commanderOf(a), initial = a.hero ? "★" : (K.leaderName(a).replace(/^(Captain|Imperial Wizard|Knight Commander|Count|Sir|The) /, "")[0] || "?");
      g.fillStyle = "#f4f0e4"; g.font = "600 " + Math.round(r * (a.hero ? 1.1 : 0.95)) + "px 'Marcellus SC', Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(initial, x, y + (a.hero ? 0 : 1));
    }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.lineWidth = lord || a.hero ? 2.6 : 1.8;
    g.strokeStyle = lord || a.hero ? "#f0cf74" : mine ? "#cfe4ff" : "rgba(240,236,226,0.85)"; g.stroke();
    // strength, on a badge at the disc's shoulder
    var pts = K.pts(a.army), label = String(pts), fs = Math.max(10, Math.round(r * 0.58));
    g.font = "700 " + fs + "px 'Barlow Semi Condensed', Barlow, sans-serif"; var tw = g.measureText(label).width + 9, bx = x + r * 0.55, by = y + r * 0.2;
    g.fillStyle = mine ? "rgba(18,34,58,0.96)" : "rgba(34,16,16,0.94)"; roundRect(g, bx, by, tw, fs + 5, 4); g.fill();
    g.lineWidth = 1; g.strokeStyle = rgba(col, 0.95); g.stroke();
    g.fillStyle = "#f2efe6"; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(label, bx + tw / 2, by + 2.5);
    // moves left, for your armies
    if (mine && s.phase === "player") for (var i = 0; i < D.moves; i++) { g.beginPath(); g.arc(x - r - 3, y - r * 0.45 + i * 8, 3, 0, Math.PI * 2); g.fillStyle = i < a.moves ? "#9fd0ff" : "rgba(40,50,60,0.9)"; g.fill(); g.lineWidth = 1; g.strokeStyle = "rgba(6,8,12,0.9)"; g.stroke(); }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // a token marching from one province to the next
  M.march = function (armyId, from, ms) { M.tweens.push({ army: armyId, from: from, t0: performance.now(), ms: ms || 520 }); };
  M.portraits = portraits;
  M.backdrop = function () { if (!base) base = buildBase(); return base; };
  SOVL.ConquestMap = M;
})();
