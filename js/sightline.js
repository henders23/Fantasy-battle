// Line of sight and cover preview. With one of your regiments selected, pointing at an enemy
// draws the line the rules use: from the selected regiment's front to the target (to the side
// it would hit, when charging). A clear line is drawn in steel; one cut by terrain turns red at
// the blocking piece, which is outlined and named. A tag on the line gives the verdict in the
// rules' own words: the roll needed with its modifiers (long range, cover), the charge distance
// against the charge range, or why the target cannot be chosen (out of range, outside the 45°
// arc, sight blocked, engaged, shrouded). Everything is read from the engine's own checks
// (rangedInfo, chargeInfo, losBlocked), so the preview never disagrees with the game.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Renderer) return;
  var UI = SOVL.UI, G = SOVL.G, P = SOVL.Renderer.prototype, T = SOVL.TERRAIN_TYPES;

  // where segment p→q first enters box t (0..1 along the segment), or -1
  function entry(p, q, t) {
    var t0 = 0, t1 = 1, d = [q.x - p.x, q.y - p.y], lo = [t.x, t.y], hi = [t.x + t.w, t.y + t.h], o = [p.x, p.y];
    for (var i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
      var a = (lo[i] - o[i]) / d[i], b = (hi[i] - o[i]) / d[i];
      if (a > b) { var s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  // the terrain piece that cuts the line, mirroring Battle.losBlocked
  function blocker(b, p, q) {
    var best = null;
    (b.terrain || []).forEach(function (t) {
      if (!T[t.kind] || !T[t.kind].blocksLos) return;
      if (G.pointInAabb(p, t) || G.pointInAabb(q, t)) return;
      if (!G.segHitsAabb(p, q, t)) return;
      var k = entry(p, q, t);
      if (k >= 0 && (!best || k < best.k)) best = { t: t, k: k };
    });
    return best;
  }
  function coverPiece(b, pt) {
    var hit = null;
    (b.terrain || []).forEach(function (t) { if (!hit && T[t.kind] && T[t.kind].blocksLos && G.pointInAabb(pt, t)) hit = t; });
    return hit;
  }
  function centre(u) { return { x: u.x, y: u.y }; }

  // what the line should show right now, or null
  UI.sightPreview = function () {
    var b = UI.battle; if (!b || b.pendingRoll || UI.modalOpen) return null;
    if (b.phase !== "charge" && b.phase !== "strategic") return null;
    var me = b.unit(UI.sel), t = b.unit(UI.hover);
    if (!me || !t || me.side === t.side || me.side !== b.active) return null;
    if (UI.hotseat ? false : me.side !== UI.playerSide) return null;
    var from = G.frontCenter(me), to = centre(t), ok = false, verdict = "", detail = "", kind = "sight";
    if (b.phase === "charge") {
      kind = "charge";
      var ci = b.chargeInfo(me, t);
      if (ci.side) to = G.side(t, ci.side).c;
      ok = !!ci.ok;
      verdict = ok ? "Charge the " + ci.side + (ci.runDown ? " · run them down" : "") : ci.reason;
      if (ci.dist != null) detail = ci.dist.toFixed(1) + '" of ' + b.chargeRange(me) + '"' + (ci.difficult ? " · difficult ground" : "");
    } else if (UI.mode === "spell" && UI.spell) {
      kind = "spell";
      var sp = SOVL.SPELLS[UI.spell] || {}, d0 = G.dist(from, t) - Math.min(t.w, t.d) / 2;
      ok = (UI.targets || []).indexOf(t.uid) >= 0;
      verdict = ok ? UI.spell + " can reach it" : d0 > (sp.range || 0) ? "Out of range (" + d0.toFixed(1) + " > " + sp.range + ")" : b.losBlocked(from, to) ? "Line of sight blocked" : "Not a valid target";
      detail = d0.toFixed(1) + '"' + (sp.range ? ' of ' + sp.range + '"' : "");
    } else if (UI.mode === "shoot" || (UI.mode === "move" && b.rangedWeaponOf && b.rangedWeaponOf(me, false))) {
      kind = "shoot";
      var ri = b.rangedInfo(me, t, !!UI.shootCommander && UI.mode === "shoot");
      ok = !!ri.ok;
      var w = b.rangedWeaponOf(me, !!UI.shootCommander && UI.mode === "shoot"), dist = G.dist(from, t) - Math.min(t.w, t.d) / 2;
      if (ok) { verdict = (ri.target || "?") + "+ to hit" + (ri.notes && ri.notes.length ? " · " + ri.notes.join(", ") : ""); }
      else verdict = ri.reason;
      detail = dist.toFixed(1) + '"' + (w ? " of " + w.range + '"' : "");
    } else {
      var d1 = G.dist(from, to);
      ok = !b.losBlocked(from, to);
      verdict = ok ? (b.inArc && !b.inArc(me, t) ? "In sight, but outside the front arc" : "In sight") : "Line of sight blocked";
      detail = d1.toFixed(1) + '"';
    }
    var blk = blocker(b, from, to), cov = coverPiece(b, { x: t.x, y: t.y });
    if (blk && (!ok || /sight/i.test(verdict))) verdict = verdict.replace(/Line of sight blocked( by terrain)?/, "Sight blocked by " + (T[blk.t.kind].name || "terrain").toLowerCase());
    return { from: from, to: to, ok: ok, verdict: verdict, detail: detail, kind: kind, block: blk, cover: cov && cov !== (blk && blk.t) ? cov : null, me: me, target: t };
  };

  function rect(ctx, t) { ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); }
  var draw = P.draw;
  P.draw = function (b, st) {
    var r = draw.apply(this, arguments);
    var sp; try { sp = b && UI.screen === "battle" ? UI.sightPreview() : null; } catch (e) { sp = null; }
    this.sight = sp;
    if (!sp) return r;
    var ctx = this.ctx, px = 1 / (this.scale || 10), f = sp.from, q = sp.to;
    var cut = sp.block ? { x: f.x + (q.x - f.x) * sp.block.k, y: f.y + (q.y - f.y) * sp.block.k } : null;
    var good = sp.ok ? "143,214,165" : "233,134,122", line = sp.ok ? "rgba(" + good + ",0.95)" : "rgba(233,134,122,0.95)";
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.translate(this.ox, this.oy); ctx.scale(this.scale, this.scale);
    ctx.lineCap = "round";
    // the piece that blocks the line, and any cover the target stands in
    if (sp.block) { rect(ctx, sp.block.t); ctx.fillStyle = "rgba(233,134,122,0.16)"; ctx.fill(); ctx.setLineDash([6 * px, 4 * px]); ctx.strokeStyle = "rgba(233,134,122,0.95)"; ctx.lineWidth = 2 * px; ctx.stroke(); ctx.setLineDash([]); }
    if (sp.cover) { rect(ctx, sp.cover); ctx.setLineDash([4 * px, 4 * px]); ctx.strokeStyle = "rgba(240,200,110,0.9)"; ctx.lineWidth = 1.6 * px; ctx.stroke(); ctx.setLineDash([]); }
    // the line itself: dark underlay, then colour; dashed and red beyond the blocking piece
    var seg = function (a, z, col, dash) { ctx.setLineDash(dash ? [7 * px, 5 * px] : []); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.strokeStyle = "rgba(6,10,16,0.75)"; ctx.lineWidth = 5 * px; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2.4 * px; ctx.stroke(); };
    if (cut) { seg(f, cut, "rgba(198,214,230,0.95)", false); seg(cut, q, "rgba(233,134,122,0.9)", true); }
    else seg(f, q, line, !sp.ok);
    ctx.setLineDash([]);
    // ends: a sighting ring at the shooter, a target ring (or a cross where sight is cut)
    ctx.fillStyle = "rgba(198,214,230,0.95)"; ctx.beginPath(); ctx.arc(f.x, f.y, 3.5 * px, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 2.2 * px; ctx.beginPath(); ctx.arc(q.x, q.y, 9 * px, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(q.x - 13 * px, q.y); ctx.lineTo(q.x - 5 * px, q.y); ctx.moveTo(q.x + 5 * px, q.y); ctx.lineTo(q.x + 13 * px, q.y); ctx.moveTo(q.x, q.y - 13 * px); ctx.lineTo(q.x, q.y - 5 * px); ctx.moveTo(q.x, q.y + 5 * px); ctx.lineTo(q.x, q.y + 13 * px); ctx.stroke();
    if (cut) { var s = 6 * px; ctx.strokeStyle = "rgba(255,170,155,1)"; ctx.lineWidth = 3 * px; ctx.beginPath(); ctx.moveTo(cut.x - s, cut.y - s); ctx.lineTo(cut.x + s, cut.y + s); ctx.moveTo(cut.x + s, cut.y - s); ctx.lineTo(cut.x - s, cut.y + s); ctx.stroke(); }
    ctx.restore();
    // the verdict, in screen space beside the line nearer the shooter: the unit tooltip opens to
    // the right of the pointer, at the target end
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var m = this.toScreen(f.x + (q.x - f.x) * 0.38, f.y + (q.y - f.y) * 0.38), title = sp.verdict, sub = sp.detail + (sp.cover ? " · target in " + (T[sp.cover.kind].name || "cover").toLowerCase() : "");
    ctx.font = '600 13px "Barlow", "Segoe UI", sans-serif'; var w1 = ctx.measureText(title).width;
    ctx.font = '12px "Barlow", "Segoe UI", sans-serif'; var w2 = ctx.measureText(sub).width;
    var W = Math.ceil(Math.max(w1, w2)) + 22, H = sub ? 42 : 26, x = Math.max(6, Math.min(this.cw - W - 6, m.x - W - 18)), y = Math.max(6, Math.min(this.ch - H - 6, m.y - H / 2));
    ctx.fillStyle = "rgba(8,13,20,0.92)"; ctx.strokeStyle = sp.ok ? "rgba(" + good + ",0.9)" : "rgba(233,134,122,0.9)"; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, W, H, 4); else ctx.rect(x, y, W, H); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sp.ok ? "rgb(" + good + ")" : "rgb(240,160,148)"; ctx.fillRect(x, y, 3, H);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = '600 13px "Barlow", "Segoe UI", sans-serif'; ctx.fillStyle = "#eef3f8"; ctx.fillText(title, x + 12, y + 17);
    if (sub) { ctx.font = '12px "Barlow", "Segoe UI", sans-serif'; ctx.fillStyle = "#a9b6c2"; ctx.fillText(sub, x + 12, y + 34); }
    ctx.restore();
    return r;
  };
})();
