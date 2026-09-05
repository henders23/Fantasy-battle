// Canvas renderer for the battlefield.
'use strict';
(function () {
  var G = SOVL.G, TABLE = SOVL.TABLE;
  function Renderer(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.scale = 12; this.ox = 0; this.oy = 0; this.zoom = 1; this.panX = 0; this.panY = 0;
    this.projectiles = []; this.floaters = []; this.flashes = []; this.grass = null; this.lastT = 0;
    this.showArcs = false; this.showRanges = false;
  }
  SOVL.Renderer = Renderer;
  var RP = Renderer.prototype;
  RP.resize = function () {
    var c = this.canvas, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.dpr = dpr; this.cw = w; this.ch = h;
    var s = Math.min((w - 24) / TABLE.w, (h - 24) / TABLE.h);
    this.baseScale = s;
    this.scale = s * this.zoom;
    this.ox = (w - TABLE.w * this.scale) / 2 + this.panX; this.oy = (h - TABLE.h * this.scale) / 2 + this.panY;
  };
  RP.toScreen = function (x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; };
  RP.toWorld = function (sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; };

  RP.makeGrass = function () {
    var off = document.createElement('canvas'), W = 512, H = 512, g = off.getContext('2d');
    off.width = W; off.height = H;
    g.fillStyle = '#4c6b32'; g.fillRect(0, 0, W, H);
    var rnd = SOVL.R.makeRng(7);
    for (var i = 0; i < 9000; i++) {
      var x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 3, v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(90,130,60,' + (0.15 + rnd() * 0.25) + ')' : 'rgba(50,80,35,' + (0.1 + rnd() * 0.25) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (var j = 0; j < 400; j++) { var x2 = rnd() * W, y2 = rnd() * H; g.strokeStyle = 'rgba(120,150,80,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 + (rnd() - 0.5) * 6, y2 - 3 - rnd() * 5); g.stroke(); }
    this.grass = this.ctx.createPattern(off, 'repeat');
  };

  // ---- main draw ----
  RP.draw = function (battle, st, now) {
    st = st || {};
    this.resize();
    var ctx = this.ctx, dpr = this.dpr, dt = Math.min(0.05, (now - this.lastT) / 1000 || 0.016); this.lastT = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0b1420'; ctx.fillRect(0, 0, this.cw, this.ch);
    if (!this.grass) this.makeGrass();
    ctx.save(); ctx.translate(this.ox, this.oy); ctx.scale(this.scale, this.scale);
    // table
    if (this.groundImage && this.groundImage.complete && this.groundImage.naturalWidth) ctx.drawImage(this.groundImage, 0, 0, TABLE.w, TABLE.h);
    else { ctx.save(); ctx.scale(1 / 12, 1 / 12); ctx.fillStyle = this.grass; ctx.fillRect(0, 0, TABLE.w * 12, TABLE.h * 12); ctx.restore(); }
    ctx.fillStyle = 'rgba(11,29,36,0.15)'; ctx.fillRect(0, 0, TABLE.w, TABLE.h);
    // deployment zones
    if (battle) {
      for (var s = 0; s < 2; s++) {
        var z = battle.deployZone(s), mine = st.playerSide === s;
        if (battle.phase === 'deploy' || st.showZones) {
          ctx.fillStyle = mine ? 'rgba(80,160,255,0.10)' : 'rgba(255,80,80,0.08)'; ctx.fillRect(z.x, z.y, z.w, z.h);
          ctx.setLineDash([0.6, 0.4]); ctx.strokeStyle = mine ? 'rgba(120,190,255,0.5)' : 'rgba(255,120,120,0.4)'; ctx.lineWidth = 0.12;
          ctx.beginPath(); ctx.moveTo(z.x, s === 0 && battle.sides[0] === 'bottom' || battle.sides[s] === 'bottom' ? z.y : z.y + z.h); ctx.lineTo(z.x + z.w, battle.sides[s] === 'bottom' ? z.y : z.y + z.h); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    // grid every 6"
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 0.05;
    for (var gx = 0; gx <= TABLE.w; gx += 6) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, TABLE.h); ctx.stroke(); }
    for (var gy = 0; gy <= TABLE.h; gy += 6) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(TABLE.w, gy); ctx.stroke(); }
    ctx.strokeStyle = '#2b2f22'; ctx.lineWidth = 0.3; ctx.strokeRect(0, 0, TABLE.w, TABLE.h);
    if (!battle) { ctx.restore(); return; }
    // objectives
    battle.objectives.forEach(function (o) {
      ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, Math.PI * 2); ctx.fillStyle = o.owner == null ? 'rgba(255,255,255,0.06)' : o.owner === st.playerSide ? 'rgba(80,160,255,0.12)' : 'rgba(255,80,80,0.12)'; ctx.fill();
      ctx.setLineDash([0.5, 0.5]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.1; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e8d27a'; ctx.beginPath(); ctx.moveTo(o.x, o.y - 1); ctx.lineTo(o.x + 0.8, o.y + 0.6); ctx.lineTo(o.x - 0.8, o.y + 0.6); ctx.closePath(); ctx.fill();
    });
    // terrain
    battle.terrain.forEach(function (t) { if (!this.drawTerrainSprite || !this.drawTerrainSprite(ctx, t)) drawTerrain(ctx, t); }, this);
    var self = this;
    // ranges / arcs for the selected unit
    var sel = st.selected ? battle.unit(st.selected) : null;
    if (this.drawTacticalOverlays) this.drawTacticalOverlays(battle, st, now);
    if (sel && (this.showArcs || st.mode === 'charge' || battle.phase === 'charge')) this.drawArc(sel, battle.chargeRange(sel), 'rgba(255,220,80,0.12)', 'rgba(255,220,80,0.6)');
    if (sel && (this.showRanges || st.mode === 'shoot') && sel.ranged && SOVL.RANGED[sel.ranged]) this.drawArc(sel, SOVL.RANGED[sel.ranged].range, 'rgba(120,200,255,0.08)', 'rgba(120,200,255,0.5)', true);
    if (sel && st.mode === 'spell' && st.spell) { var sp = SOVL.SPELLS[st.spell]; ctx.beginPath(); ctx.arc(sel.x, sel.y, sp.range || 1, 0, Math.PI * 2); ctx.fillStyle = 'rgba(200,120,255,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,120,255,0.5)'; ctx.lineWidth = 0.1; ctx.stroke(); }
    // declared charges
    battle.charges.forEach(function (c) {
      var a = battle.unit(c.charger), b = battle.unit(c.target); if (!a || !b) return;
      var fa = G.frontCenter(a), tb = c.flee ? { x: a.x, y: a.y } : G.side(b, c.side || 'front').c;
      ctx.setLineDash([0.5, 0.35]); ctx.strokeStyle = c.flee ? 'rgba(255,255,255,0.7)' : (a.side === st.playerSide ? 'rgba(255,220,80,0.9)' : 'rgba(255,90,90,0.9)'); ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(tb.x, tb.y); ctx.stroke(); ctx.setLineDash([]);
      if (!c.flee) drawArrowHead(ctx, fa, tb, ctx.strokeStyle);
    });
    // units: animate render positions
    battle.units.forEach(function (u) {
      if (u._rx == null) { u._rx = u.x; u._ry = u.y; u._ra = u.a; }
      var k = this.reduceMotion ? 1 : 1 - Math.pow(0.001, dt);
      u._rx += (u.x - u._rx) * k; u._ry += (u.y - u._ry) * k; u._ra += G.angleDiff(u._ra, u.a) * k;
    }, this);
    var order = battle.units.slice().sort(function (a, b) { return (a.uid === st.selected ? 1 : 0) - (b.uid === st.selected ? 1 : 0); });
    order.forEach(function (u) { self.drawUnit(u, battle, st, now); });
    // move preview ghost
    if (st.preview && sel) this.drawGhost(sel, st.preview);
    // projectiles and floaters
    this.projectiles = this.projectiles.filter(function (p) { return now - p.t0 < p.dur; });
    this.projectiles.forEach(function (p) {
      var t = (now - p.t0) / p.dur, x = G.lerp(p.from.x, p.to.x, t), y = G.lerp(p.from.y, p.to.y, t);
      ctx.strokeStyle = p.color; ctx.lineWidth = 0.15; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(G.lerp(p.from.x, p.to.x, Math.max(0, t - 0.15)), G.lerp(p.from.y, p.to.y, Math.max(0, t - 0.15))); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
    });
    this.flashes = this.flashes.filter(function (f) { return now - f.t0 < f.dur; });
    this.flashes.forEach(function (f) { var t = (now - f.t0) / f.dur; ctx.globalAlpha = (1 - t) * 0.6; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + t), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; });
    ctx.restore();
    // floating text in screen space
    this.floaters = this.floaters.filter(function (f) { return now - f.t0 < f.dur; });
    ctx.font = 'bold 14px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    this.floaters.forEach(function (f) {
      var t = (now - f.t0) / f.dur, p = self.toScreen(f.x, f.y);
      ctx.globalAlpha = 1 - t * t; ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, p.x, p.y - t * 30); ctx.fillText(f.text, p.x, p.y - t * 30); ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';
  };
  RP.drawArc = function (u, range, fill, stroke, full) {
    var ctx = this.ctx, fc = G.frontCenter(u);
    ctx.beginPath(); ctx.moveTo(fc.x, fc.y); ctx.arc(fc.x, fc.y, range, u.a - Math.PI / 4, u.a + Math.PI / 4); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 0.1; ctx.setLineDash([0.4, 0.3]); ctx.stroke(); ctx.setLineDash([]);
    if (full) { ctx.beginPath(); ctx.moveTo(fc.x, fc.y); ctx.arc(fc.x, fc.y, range / 2, u.a - Math.PI / 4, u.a + Math.PI / 4); ctx.closePath(); ctx.strokeStyle = stroke; ctx.setLineDash([0.2, 0.3]); ctx.stroke(); ctx.setLineDash([]); }
  };
  RP.drawGhost = function (u, pv) {
    var ctx = this.ctx, r = { x: pv.x, y: pv.y, a: pv.a, w: u.w, d: u.d }, c = G.corners(r);
    ctx.save(); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (var i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y); ctx.closePath();
    ctx.fillStyle = pv.ok ? 'rgba(255,255,255,0.25)' : 'rgba(255,60,60,0.25)'; ctx.fill();
    ctx.strokeStyle = pv.ok ? '#fff' : '#f66'; ctx.lineWidth = 0.12; ctx.setLineDash([0.3, 0.2]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y); ctx.stroke();
    // path line
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(pv.x, pv.y); ctx.stroke();
    ctx.restore();
  };
  RP.drawUnit = function (u, battle, st, now) {
    var ctx = this.ctx, info = SOVL.FACTION_INFO[u.faction], mine = u.side === st.playerSide;
    var r = { x: u._rx, y: u._ry, a: u._ra, w: u.w, d: u.d }, c = G.corners(r);
    var selected = st.selected === u.uid, hovered = st.hover === u.uid, target = st.targets && st.targets.indexOf(u.uid) >= 0;
    var color = info.color, edge = mine ? '#dfe8ff' : '#ffd7d7';
    ctx.save();
    // base plate
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (var i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y); ctx.closePath();
    ctx.fillStyle = mine ? 'rgba(20,40,80,0.55)' : 'rgba(90,20,20,0.55)'; ctx.fill();
    // models
    var single = SOVL.isSingle(u.type) && !SOVL.commanderOnly(u), base, files, rk;
    if (SOVL.commanderOnly(u)) { base = (SOVL.UNIT_TYPES[u.commander.def.type] || SOVL.UNIT_TYPES.Infantry).base; files = 1; rk = 1; }
    else { base = u.typeInfo.base; files = Math.min(u.files, Math.max(1, u.models)); rk = Math.max(1, SOVL.ranks(u)); }
    var bw = base[0] * SOVL.MM, bd = base[1] * SOVL.MM, f = G.fwd(r.a), rt = G.right(r.a);
    var count = SOVL.commanderOnly(u) ? 1 : u.models, n = 0;
    for (var j = 0; j < rk && n < count; j++) {
      for (var k = 0; k < files && n < count; k++, n++) {
        var lx = (k - (files - 1) / 2) * bw, ly = u.d / 2 - (j + 0.5) * bd;
        var cx = r.x + rt.x * lx + f.x * ly, cy = r.y + rt.y * lx + f.y * ly;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(r.a + Math.PI / 2);
        var isFront = j === 0;
        ctx.fillStyle = isFront ? color : shade(color, -0.18);
        if (this.unitAtlas && this.unitAtlas.complete && this.unitAtlas.naturalWidth) ctx.globalAlpha = 0.25;
        roundRect(ctx, -bw / 2 + 0.03, -bd / 2 + 0.03, bw - 0.06, bd - 0.06, 0.08); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.03; ctx.stroke();
        ctx.globalAlpha = 1;
        if (!this.drawModelSprite || !this.drawModelSprite(ctx, u, bw, bd)) {
        // figure: a dot body + weapon tick
        var figR = Math.min(bw, bd) * 0.22;
        ctx.fillStyle = shade(color, 0.35); ctx.beginPath(); ctx.arc(0, 0, figR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = info.accent; ctx.beginPath(); ctx.arc(0, -figR * 0.4, figR * 0.45, 0, Math.PI * 2); ctx.fill();
        if (u.ranged && !single) { ctx.strokeStyle = '#f5e9c8'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.arc(figR * 0.9, 0, figR * 0.9, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke(); }
        else if (!single) { ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(figR * 0.8, figR * 0.6); ctx.lineTo(figR * 0.8, -figR * 1.6); ctx.stroke(); }
        if (single) drawMonsterGlyph(ctx, u, bw, bd, info);
        }
        // commander marker in the middle of the front rank
        if (u.commander && u.commander.alive && isFront && k === Math.floor(files / 2)) {
          ctx.fillStyle = '#ffd24a'; drawStar(ctx, 0, 0, Math.min(bw, bd) * 0.32); ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 0.03; ctx.stroke();
        }
        if (u.banner && isFront && k === Math.max(0, Math.floor(files / 2) - 1) && files > 1) { ctx.fillStyle = info.accent; ctx.fillRect(-0.03, -bd * 0.45, 0.06, bd * 0.6); ctx.beginPath(); ctx.moveTo(0.03, -bd * 0.45); ctx.lineTo(bw * 0.35, -bd * 0.32); ctx.lineTo(0.03, -bd * 0.2); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
    // front edge
    ctx.strokeStyle = mine ? '#9fd0ff' : '#ff9c9c'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y); ctx.stroke();
    // outline
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (var m = 1; m < 4; m++) ctx.lineTo(c[m].x, c[m].y); ctx.closePath();
    var pulse = 0.5 + 0.5 * Math.sin(now / 200);
    if (selected) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.18; ctx.stroke(); }
    else if (target) { ctx.strokeStyle = 'rgba(255,220,80,' + (0.6 + 0.4 * pulse) + ')'; ctx.lineWidth = 0.2; ctx.stroke(); }
    else if (hovered) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.1; ctx.stroke(); }
    else { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.05; ctx.stroke(); }
    if (battle.activeUnit === u.uid) { ctx.strokeStyle = 'rgba(120,255,160,' + (0.5 + 0.5 * pulse) + ')'; ctx.lineWidth = 0.16; ctx.setLineDash([0.4, 0.25]); ctx.stroke(); ctx.setLineDash([]); }
    // status markers
    var fc = G.frontCenter(r);
    ctx.fillStyle = mine ? '#9fd0ff' : '#ff9c9c'; ctx.beginPath(); ctx.moveTo(fc.x + f.x * 0.35, fc.y + f.y * 0.35); ctx.lineTo(fc.x + rt.x * 0.25, fc.y + rt.y * 0.25); ctx.lineTo(fc.x - rt.x * 0.25, fc.y - rt.y * 0.25); ctx.closePath(); ctx.fill();
    if (u.fleeing) { ctx.fillStyle = '#fff'; ctx.font = '0.8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚑', r.x, r.y + 0.3); ctx.textAlign = 'left'; }
    if (u.activated && battle.phase === 'strategic' && mine && battle.activeUnit !== u.uid) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (var q = 1; q < 4; q++) ctx.lineTo(c[q].x, c[q].y); ctx.closePath(); ctx.fill(); }
    // label
    if (!this.drawRegimentLabels && (this.scale > 9 || selected || hovered)) {
      var label = (SOVL.commanderOnly(u) ? u.commander.name : u.name) + (u.models > 0 && !single ? ' ×' + u.models : ''), lp = { x: r.x, y: r.y };
      ctx.font = '0.55px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      var tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, lp.x - tw / 2 - 0.15, lp.y + u.d / 2 + 0.15, tw + 0.3, 0.75, 0.12); ctx.fill();
      ctx.fillStyle = mine ? '#dfe8ff' : '#ffd7d7'; ctx.fillText(label, lp.x, lp.y + u.d / 2 + 0.72); ctx.textAlign = 'left';
    }
    // wounds bar for multi-wound singles
    if ((single || SOVL.commanderOnly(u))) {
      var W = SOVL.commanderOnly(u) ? u.commander.maxWounds : u.base.wd, cur = SOVL.commanderOnly(u) ? W - u.commander.wounds : W - u.woundsOnCurrent;
      var bx = r.x - u.w / 2, by = r.y - u.d / 2 - 0.45;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, u.w, 0.25); ctx.fillStyle = '#e04848'; ctx.fillRect(bx, by, u.w * cur / W, 0.25);
    } else if (u.commander && u.commander.alive && u.commander.wounds > 0) {
      var W2 = u.commander.maxWounds, bx2 = r.x - u.w / 2, by2 = r.y - u.d / 2 - 0.45;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx2, by2, u.w, 0.2); ctx.fillStyle = '#ffd24a'; ctx.fillRect(bx2, by2, u.w * (W2 - u.commander.wounds) / W2, 0.2);
    }
    ctx.restore();
  };

  function drawMonsterGlyph(ctx, u, bw, bd, info) {
    var s = Math.min(bw, bd);
    ctx.fillStyle = shade(info.color, 0.5); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.04;
    if (u.type === 'War Machine') {
      ctx.fillStyle = '#5a4634'; ctx.fillRect(-s * 0.35, -s * 0.15, s * 0.7, s * 0.3); ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-s * 0.08, -s * 0.45, s * 0.16, s * 0.75);
      ctx.beginPath(); ctx.arc(-s * 0.3, s * 0.2, s * 0.14, 0, Math.PI * 2); ctx.arc(s * 0.3, s * 0.2, s * 0.14, 0, Math.PI * 2); ctx.fill();
    } else if (u.type === 'Chariot' || u.type === 'War Wagon') {
      ctx.fillStyle = '#6b4a2b'; roundRect(ctx, -bw * 0.3, -bd * 0.1, bw * 0.6, bd * 0.45, 0.1); ctx.fill();
      ctx.fillStyle = shade(info.color, 0.3); ctx.beginPath(); ctx.ellipse(-bw * 0.18, -bd * 0.28, bw * 0.12, bd * 0.16, 0, 0, Math.PI * 2); ctx.ellipse(bw * 0.18, -bd * 0.28, bw * 0.12, bd * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    } else if (SOVL.hasProp(u, 'Flying')) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 0.45, s * 0.05); ctx.lineTo(s * 0.15, s * 0.05); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.15, s * 0.05); ctx.lineTo(-s * 0.45, s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.32, s * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = info.accent; ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.14, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawTerrain(ctx, t) {
    var T = SOVL.TERRAIN_TYPES[t.kind], rnd = SOVL.R.makeRng(t.seed || 1);
    ctx.save();
    if (t.kind === 'forest') {
      ctx.fillStyle = 'rgba(30,60,25,0.55)'; roundRect(ctx, t.x, t.y, t.w, t.h, 1.2); ctx.fill();
      var n = Math.floor(t.w * t.h / 2.2);
      for (var i = 0; i < n; i++) { var x = t.x + 0.6 + rnd() * (t.w - 1.2), y = t.y + 0.6 + rnd() * (t.h - 1.2), r = 0.45 + rnd() * 0.5; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + 0.15, y + 0.15, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade('#2f6a2a', rnd() * 0.3 - 0.1); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(160,220,120,0.25)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill(); }
    } else if (t.kind === 'cliff') {
      ctx.fillStyle = '#6a655c'; polyBlob(ctx, t, rnd, 0.9); ctx.fill(); ctx.strokeStyle = '#3d3a34'; ctx.lineWidth = 0.15; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.08;
      for (var j = 0; j < 8; j++) { var x1 = t.x + rnd() * t.w, y1 = t.y + rnd() * t.h; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (rnd() - 0.5) * 3, y1 + (rnd() - 0.5) * 3); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(t.x + t.w * 0.4, t.y + t.h * 0.35, t.w * 0.2, t.h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t.kind === 'building') {
      ctx.fillStyle = '#7d6b52'; ctx.fillRect(t.x, t.y, t.w, t.h); ctx.strokeStyle = '#3b3126'; ctx.lineWidth = 0.15; ctx.strokeRect(t.x, t.y, t.w, t.h);
      ctx.fillStyle = '#5e4c38'; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + t.w, t.y); ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3b2b'; ctx.beginPath(); ctx.moveTo(t.x, t.y + t.h); ctx.lineTo(t.x + t.w, t.y + t.h); ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.06; for (var k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(t.x, t.y + t.h * k / 5); ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2); ctx.stroke(); }
    } else if (t.kind === 'lake') {
      ctx.fillStyle = '#2f5f8f'; polyBlob(ctx, t, rnd, 1.1); ctx.fill(); ctx.strokeStyle = '#8fb2cc'; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.06; for (var w = 0; w < 6; w++) { var wx = t.x + 1 + rnd() * (t.w - 2), wy = t.y + 1 + rnd() * (t.h - 2); ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 0.5, wy - 0.3, wx + 1, wy); ctx.stroke(); }
    } else if (t.kind === 'swamp') {
      ctx.fillStyle = 'rgba(70,90,50,0.75)'; polyBlob(ctx, t, rnd, 1.0); ctx.fill();
      for (var m = 0; m < Math.floor(t.w * t.h / 3); m++) { var px = t.x + 0.5 + rnd() * (t.w - 1), py = t.y + 0.5 + rnd() * (t.h - 1); ctx.fillStyle = 'rgba(60,110,120,0.5)'; ctx.beginPath(); ctx.ellipse(px, py, 0.6 + rnd() * 0.6, 0.3 + rnd() * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7f9a4a'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 0.1, py - 0.8); ctx.stroke(); }
    }
    ctx.restore();
  }
  function polyBlob(ctx, t, rnd, k) {
    var cx = t.x + t.w / 2, cy = t.y + t.h / 2, n = 12; ctx.beginPath();
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, rr = 0.8 + rnd() * 0.2 * k, x = cx + Math.cos(a) * t.w / 2 * rr, y = cy + Math.sin(a) * t.h / 2 * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
  function drawStar(ctx, x, y, r) { ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  function drawArrowHead(ctx, from, to, color) { var a = Math.atan2(to.y - from.y, to.x - from.x); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - Math.cos(a - 0.4) * 0.7, to.y - Math.sin(a - 0.4) * 0.7); ctx.lineTo(to.x - Math.cos(a + 0.4) * 0.7, to.y - Math.sin(a + 0.4) * 0.7); ctx.closePath(); ctx.fill(); }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(v) { v = k < 0 ? v * (1 + k) : v + (255 - v) * k; return Math.max(0, Math.min(255, Math.round(v))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  SOVL.shade = shade;
  // find unit under world point
  RP.unitAt = function (battle, p) {
    for (var i = battle.units.length - 1; i >= 0; i--) { var u = battle.units[i]; if (G.pointInRect(u, p, 0.15)) return u; }
    return null;
  };
  RP.addProjectile = function (from, to, color, dur) { this.projectiles.push({ from: from, to: to, color: color || '#ffe9a8', t0: performance.now(), dur: dur || 450 }); };
  RP.addFloater = function (x, y, text, color) { this.floaters.push({ x: x, y: y, text: text, color: color || '#fff', t0: performance.now(), dur: 1400 }); };
  RP.addFlash = function (x, y, r, color) { this.flashes.push({ x: x, y: y, r: r || 1.5, color: color || '#ffb347', t0: performance.now(), dur: 500 }); };
})();
