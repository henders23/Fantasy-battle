// Battlefield command helpers.
// 1. The camera glides instead of jumping. Choosing or fighting an engagement flies in close
//    to it, the first engagement of each combat phase is framed as the phase opens, and the
//    view eases back out when the fighting is done. Any wheel, drag or key zoom by the player
//    takes over at once.
// 2. Unit names are coloured by side wherever they are written: the chronicle, the dice panel,
//    the engagement panel and its result, and the regiment labels on the table. When both
//    armies field the same unit, the colour still tells them apart: the engine records which
//    units each line mentions, in order.
// 3. Enter ends the active regiment's activation, and when your turn comes round again the
//    next ready regiment is brought up for you. Click another regiment before it does anything
//    and that one is activated instead.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Renderer) return;
  var UI = SOVL.UI, G = SOVL.G, RP = SOVL.Renderer.prototype, BP = SOVL.Battle.prototype, $ = function (id) { return document.getElementById(id); };
  function now() { return performance.now(); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // ---------- camera ----------
  RP.flyTo = function (zoom, panX, panY, ms) {
    if (this.reduceMotion || !ms) { this.zoom = zoom; this.panX = panX; this.panY = panY; this.flight = null; return; }
    var from = { z: this.zoom, x: this.panX, y: this.panY };
    this.flight = { from: from, to: { z: zoom, x: panX, y: panY }, t0: now(), dur: ms, last: from };
  };
  var draw = RP.draw;
  RP.draw = function () {
    var f = this.flight;
    if (f) {
      // the player zoomed or panned: hand the camera back
      if (Math.abs(this.zoom - f.last.z) > 1e-6 || Math.abs(this.panX - f.last.x) > 0.01 || Math.abs(this.panY - f.last.y) > 0.01) this.flight = null;
      else {
        var q = Math.min(1, (now() - f.t0) / f.dur), e = ease(q);
        this.zoom = f.from.z + (f.to.z - f.from.z) * e; this.panX = f.from.x + (f.to.x - f.from.x) * e; this.panY = f.from.y + (f.to.y - f.from.y) * e;
        f.last = { z: this.zoom, x: this.panX, y: this.panY };
        if (q >= 1) this.flight = null;
      }
    }
    return draw.apply(this, arguments);
  };
  // frame a group of units: close in for a fight, gently for anything else
  RP.focusUnits = function (units, combat) {
    units = (units || []).filter(Boolean);
    if (!units.length) return;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    units.forEach(function (u) {
      var r = Math.max(u.w, u.d) / 2;
      minX = Math.min(minX, u.x - r); maxX = Math.max(maxX, u.x + r); minY = Math.min(minY, u.y - r); maxY = Math.max(maxY, u.y + r);
    });
    var x = (minX + maxX) / 2, y = (minY + maxY) / 2;
    this.resize();
    var base = this.baseScale, zoom = combat
      ? G.clamp(Math.min(this.cw * 0.62 / ((maxX - minX + 4) * base), this.ch * 0.5 / ((maxY - minY + 4) * base)), 1.5, 3)
      : Math.max(this.flight ? this.flight.to.z : this.zoom, 1);
    var scale = base * zoom;
    // fights sit above the engagement panel; other units near the middle
    var panX = this.cw / 2 - ((this.cw - SOVL.TABLE.w * scale) / 2 + x * scale);
    var panY = this.ch * (combat ? 0.36 : 0.47) - ((this.ch - SOVL.TABLE.h * scale) / 2 + y * scale);
    this.flyTo(zoom, panX, panY, combat ? 750 : 500);
  };
  RP.ensureVisible = function (u) {
    // at normal zoom the whole table is already on screen: never shove part of it off
    if (!u || (this.flight ? this.flight.to.z : this.zoom) <= 1.01) return;
    var p = this.toScreen(u._rx == null ? u.x : u._rx, u._ry == null ? u.y : u._ry), mx = this.cw * 0.12, my = this.ch * 0.12;
    if (p.x < mx || p.x > this.cw - mx || p.y < my || p.y > this.ch - my * 2.5) this.focusUnits([u], false);
  };
  function groupUnits(group) { var b = UI.battle; return (group || []).map(function (id) { return b.unit(id); }).filter(Boolean); }

  // ---------- names in side colours ----------
  var WORD = /[A-Za-z0-9À-ɏ']/;
  function findWord(text, name, from) {
    if (!name) return -1;
    var i = text.indexOf(name, from || 0);
    while (i >= 0) {
      var before = i > 0 ? text[i - 1] : "", after = text[i + name.length] || "";
      if (!WORD.test(before) && !WORD.test(after)) return i;
      i = text.indexOf(name, i + 1);
    }
    return -1;
  }
  function unitById(b, id) { return b.unit(id) || (b.dead || []).find(function (u) { return u.uid === id; }); }
  var dictCache = { b: null, n: -1, d: null };
  // names that belong to one side only (the armies' names too); shared names map to -1
  function sideDict(b) {
    var all = b.units.concat(b.dead || []);
    if (dictCache.b === b && dictCache.n === all.length) return dictCache.d;
    var d = {};
    function put(n, s) { if (!n) return; d[n] = d[n] == null || d[n] === s ? s : -1; }
    all.forEach(function (u) { put(u.name, u.side); if (u.commander) put(u.commander.name, u.side); });
    (b.names || []).forEach(function (n, i) { put(n, i); });
    dictCache = { b: b, n: all.length, d: d };
    return d;
  }
  // where each name sits in the text and whose it is: listed units in order first, then unambiguous names
  function spansFor(text, uids, b) {
    var spans = [], cursor = 0;
    (uids || []).forEach(function (id) {
      var u = unitById(b, id); if (!u) return;
      var best = -1, len = 0;
      [u.name, u.commander && u.commander.name].forEach(function (n) { var i = findWord(text, n, cursor); if (i >= 0 && (best < 0 || i < best)) { best = i; len = n.length; } });
      if (best >= 0) { spans.push({ s: best, e: best + len, side: u.side }); cursor = best + len; }
    });
    var d = sideDict(b);
    Object.keys(d).sort(function (a, c) { return c.length - a.length; }).forEach(function (n) {
      if (d[n] < 0) return;
      for (var i = findWord(text, n, 0); i >= 0; i = findWord(text, n, i + n.length)) {
        var e = i + n.length;
        if (!spans.some(function (s) { return i < s.e && e > s.s; })) spans.push({ s: i, e: e, side: d[n] });
      }
    });
    return spans.sort(function (a, c) { return a.s - c.s; });
  }
  function cls(side) { return "nm " + (side === UI.playerSide ? "nm-mine" : "nm-foe"); }
  // colour the names inside an element, leaving its markup alone
  function colourElement(el, uids) {
    var b = UI.battle; if (!el || !b || el.__nm) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], text = "", n;
    while ((n = walker.nextNode())) { if (n.parentNode && n.parentNode.closest && n.parentNode.closest(".nm")) continue; nodes.push({ node: n, start: text.length }); text += n.nodeValue + "\n"; } // separate pieces: a <br> must end a name
    var spans = spansFor(text, uids, b); if (!spans.length) return;
    nodes.forEach(function (it) {
      var t = it.node.nodeValue, s0 = it.start, s1 = s0 + t.length, parts = [], pos = 0;
      spans.forEach(function (s) {
        var a = Math.max(s.s, s0), z = Math.min(s.e, s1); if (a >= z) return;
        if (a - s0 > pos) parts.push(document.createTextNode(t.slice(pos, a - s0)));
        var span = document.createElement("span"); span.className = cls(s.side); span.textContent = t.slice(a - s0, z - s0); parts.push(span);
        pos = z - s0;
      });
      if (!parts.length) return;
      if (pos < t.length) parts.push(document.createTextNode(t.slice(pos)));
      var frag = document.createDocumentFragment(); parts.forEach(function (p) { frag.appendChild(p); });
      it.node.parentNode.replaceChild(frag, it.node);
    });
    el.__nm = true;
  }
  UI.colourNames = colourElement;
  // chronicle
  var renderLog = UI.renderLog;
  UI.renderLog = function () {
    var b = UI.battle, box = $("battle-log");
    var fresh = UI.logBattle !== b, done = fresh ? 0 : UI.logCount, total = (b && b.logSeq) || 0;
    var r = renderLog.apply(UI, arguments);
    if (!b || !box) return r;
    var k = Math.min(b.log.length, total - done, box.children.length);
    for (var i = 0; i < k; i++) {
      var child = box.children[box.children.length - k + i], entry = b.log[b.log.length - k + i];
      if (child && entry && child.firstChild && child.firstChild.nodeType === 3) {
        var wrap = document.createElement("span"); child.insertBefore(wrap, child.firstChild); wrap.appendChild(child.childNodes[1]);
        colourElement(wrap, entry.data && entry.data.units);
      }
    }
    return r;
  };
  // dice panel: the sequence title and every roll row
  var renderDice = UI.renderDice;
  UI.renderDice = function () {
    var r = renderDice.apply(UI, arguments), d = UI.dice, b = UI.battle, panel = $("dice-panel");
    if (!d || !b || !panel) return r;
    var uids = (d.uids || []).slice();
    // engagement titles list the player's side first
    if (d.kind === "engagement") uids.sort(function (x, y) { var a = unitById(b, x), c = unitById(b, y); return (a ? a.side : 0) - (c ? c.side : 0); });
    colourElement(panel.querySelector(".dp-title"), uids);
    (d.rows || []).forEach(function (row) { var el = $("dp-row-" + row.id); if (el) colourElement(el.querySelector(".dp-label"), [row.spec.uid, row.spec.targetUid]); });
    if (d.pending) colourElement(panel.querySelector(".dp-pending .dp-label"), [d.pending.uid, d.pending.targetUid]);
    return r;
  };
  // engagement panel, choices and results
  var renderCombatOrders = UI.renderCombatOrders;
  UI.renderCombatOrders = function () {
    var r = renderCombatOrders.apply(UI, arguments), b = UI.battle; if (!b) return r;
    var panel = $("engagement-panel"), rep = UI.combatReport;
    if (rep) {
      var paras = panel.querySelectorAll(".engagement-summary p"), ids = [];
      rep.breakTests.forEach(function (bt) { ids.push([bt.uid]); });
      rep.rounds.forEach(function (rd) { if (rd.commanderKilled) ids.push([rd.target]); });
      paras.forEach(function (p, i) { colourElement(p, ids[i] || []); });
    } else if (UI.combatChoice) {
      var units = groupUnits(UI.combatChoice), ours = units.filter(function (u) { return u.side === UI.playerSide; }), theirs = units.filter(function (u) { return u.side !== UI.playerSide; });
      colourElement(panel.querySelector(".engagement-head h3"), ours.concat(theirs).map(function (u) { return u.uid; }));
      var choices = $("battle-actions").querySelectorAll(".engagement-choice");
      (b.pendingCombats || []).forEach(function (g, i) { if (choices[i]) colourElement(choices[i], g); });
      // the fight in hand is framed as soon as it is offered
      if (b.phase === "combat" && !UI.combatAnimating && UI.focusedGroup !== UI.combatChoice) { UI.focusedGroup = UI.combatChoice; UI.renderer.focusUnits(units, true); }
    }
    return r;
  };
  var selectEngagement = UI.selectEngagement;
  UI.selectEngagement = function () { var r = selectEngagement.apply(UI, arguments); if (UI.combatChoice) UI.focusedGroup = UI.combatChoice; return r; };
  // the fighting is over: ease back out to the whole table
  var continueCombat = UI.continueCombat;
  UI.continueCombat = function () {
    var ren = UI.renderer, before = ren ? { z: ren.zoom, x: ren.panX, y: ren.panY } : null;
    var r = continueCombat.apply(UI, arguments), b = UI.battle;
    if (ren && before && b && b.phase !== "combat" && ren.zoom === 1 && ren.panX === 0 && ren.panY === 0) { ren.zoom = before.z; ren.panX = before.x; ren.panY = before.y; ren.flyTo(1, 0, 0, 700); UI.focusedGroup = null; }
    return r;
  };

  // ---------- Enter: end this activation, then bring up the next regiment ----------
  var endActivation = UI.endActivation;
  UI.endActivation = function () {
    var b = UI.battle;
    UI.nextAfter = b && b.phase === "strategic" && b.active === UI.playerSide && b.activeUnit ? b.activeUnit : null;
    UI.autoSel = null;
    return endActivation.apply(UI, arguments);
  };
  function offerNext() {
    var b = UI.battle; if (!b || UI.offering) return;
    if (b.phase !== "strategic") { UI.nextAfter = null; UI.autoSel = null; return; }
    if (UI.nextAfter == null || b.active !== UI.playerSide || b.activeUnit || b.pendingRoll || UI.modalOpen) return;
    var list = b.unitsOf(UI.playerSide), ready = b.activatable(UI.playerSide), at = list.findIndex(function (u) { return u.uid === UI.nextAfter; }), next = null;
    UI.nextAfter = null;
    for (var i = 1; i <= list.length && !next; i++) { var u = list[(Math.max(0, at) + i) % list.length]; if (ready.indexOf(u) >= 0) next = u; }
    if (!next) return;
    UI.offering = true;
    try {
      if (!b.beginActivation(next.uid).ok) return;
      UI.sel = next.uid; UI.inspect = null; UI.mode = "move"; UI.targets = []; UI.preview = null; UI.autoSel = next.uid;
      UI.processEvents(); UI.updateHud();
      UI.renderer.ensureVisible(next);
      UI.hint("Next: " + next.name + ". Move it, press Enter to end its activation, or click another regiment.");
    } finally { UI.offering = false; }
  }
  var updateHud = UI.updateHud;
  UI.updateHud = function () { var r = updateHud.apply(UI, arguments); try { offerNext(); } catch (e) { /* never block the interface */ } return r; };
  // a regiment brought up for you can be swapped for another until it does something
  var canvasClick = UI.canvasClick;
  UI.canvasClick = function (p, e) {
    var b = UI.battle;
    if (b && b.phase === "strategic" && b.active === UI.playerSide && UI.autoSel && b.activeUnit === UI.autoSel && !b.pendingRoll && UI.mode === "move") {
      var u = UI.renderer.unitAt(b, p);
      if (u && u.side === UI.playerSide && u.uid !== UI.autoSel && b.canActivate(u) && b.releaseActivation(UI.autoSel).ok) { UI.autoSel = null; UI.sel = null; }
    }
    return canvasClick.apply(UI, arguments);
  };
  var startBattle = UI.startBattle;
  UI.startBattle = function () { UI.nextAfter = null; UI.autoSel = null; UI.focusedGroup = null; return startBattle.apply(UI, arguments); };
})();
