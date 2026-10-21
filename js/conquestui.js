// The Broken March on screen: the title-screen entry, a new campaign, the map screen with its side
// panel (your realm, an army, a province), marching and attacking, the battle prompt (lead the
// battle yourself or let the army's commander fight it), the other powers' turns, the story scenes
// with their portraits, commander traits, raising armies, and the ending. Rules: js/conquest.js;
// map drawing: js/conquestmap.js.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Conquest || !SOVL.ConquestMap) return;
  var UI = SOVL.UI, K = SOVL.Conquest, D = SOVL.CONQUEST, M = SOVL.ConquestMap, A = SOVL.Army, FID = D.faction;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function btn(label, cls, fn) { var b = el("button", cls || null, label); b.type = "button"; b.onclick = fn; return b; }
  var CQ = { s: null, sel: null, prov: null, view: null, hover: null, reach: {}, busy: false, flash: {}, raf: 0 };
  UI.conquest = CQ;
  function save() { if (CQ.s) K.save(CQ.s); }
  function P(id) { return K.prov(id); }
  function powerName(p) { return p === "player" ? "Yours" : p === "neutral" ? "Free" : D.powers[p].name; }
  function chip(p) { return '<i class="cq-chip" style="background:' + D.powers[p].color + '"></i>'; }
  function unitLine(faction, e) { return A.entryLabel(faction, e); }

  // ---------- the title screen ----------
  var ICON = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 27h22M7 27V14l3 2V9l3 2V5l3 3 3-3v6l3-2v7l3-2v13"/><path d="M13 27v-6h6v6"/></svg>';
  function menuEntry() {
    var b = $("btn-conquest"); if (!b) return;
    if (!b.querySelector(".mi")) {
      var title = b.querySelector("span"), sub = b.querySelector("small"), mt = el("div", "mt"), mi = el("i", "mi", ICON);
      mi.setAttribute("aria-hidden", "true"); mt.appendChild(title); mt.appendChild(sub); b.innerHTML = ""; b.appendChild(mi); b.appendChild(mt);
    }
    var s = K.load(), sub2 = b.querySelector("small"), t2 = b.querySelector(".mt span");
    if (s && !s.over) { t2.textContent = "Continue the March"; sub2.textContent = "Turn " + s.turn + " · " + K.season(s) + " · " + K.owned(s, "player").length + " provinces · " + s.gold + " gold"; }
    else { t2.textContent = "The Broken March"; sub2.textContent = "Win back a province, one battle at a time."; }
    b.onclick = function () { var sv = K.load(); if (sv && !sv.over) { CQ.s = sv; UI.showConquest(); } else newCampaign(); };
  }
  var show = UI.show;
  UI.show = function (id) { var r = show.apply(UI, arguments); if (id === "menu") menuEntry(); if (id !== "conquest") stopDraw(); return r; };

  // ---------- a new campaign ----------
  function newCampaign() {
    var box = el("div", "cq-new"), pick = "normal";
    box.appendChild(el("div", "sy-eyebrow", "A campaign for the Empire"));
    box.appendChild(el("h2", "cq-new-title", "The Broken March"));
    box.appendChild(el("p", "cq-new-text", "The Margrave is dead and his province is coming apart. Lead Aldric of the Border Guard to win it back: take territory, hold it for its gold, raise new armies under commanders you hire, and bring down three lords, one of them a hundred years dead. About an evening's play."));
    var diffs = el("div", "cq-diffs");
    D.difficulties.forEach(function (d) {
      var c = btn("<b>" + esc(d.name) + "</b><span>" + esc(d.desc) + "</span><small>" + d.gold + " gold to start</small>", "cq-diff" + (d.id === pick ? " on" : ""), function () { pick = d.id; diffs.querySelectorAll(".cq-diff").forEach(function (x) { x.classList.remove("on"); }); c.classList.add("on"); });
      c.setAttribute("data-diff", d.id); diffs.appendChild(c);
    });
    box.appendChild(diffs);
    var ch = el("div", "choices");
    ch.appendChild(btn("Back", null, function () { UI.closeModal(); }));
    var go = btn("Begin the campaign", "primary", function () {
      UI.closeModal(); SOVL.R.setSeed(null);
      CQ.s = K.create({ difficulty: pick }); save(); M.view.zoom = 1;
      UI.showConquest();
    });
    go.id = "cq-begin"; ch.appendChild(go); box.appendChild(ch);
    UI.modalDismissable = true; UI.modal(box);
  }

  // ---------- the screen ----------
  var bound = false;
  UI.showConquest = function () {
    CQ.s = CQ.s || K.load(); if (!CQ.s) { newCampaign(); return; }
    UI.show("conquest"); if (!bound) bind();
    var r = $("cq-map").getBoundingClientRect();
    if (r.width && r.height && r.width / r.height < 1.6) { M.view.zoom = Math.max(1, (r.height / D.map.h) / (r.width / D.map.w)); M.centerOn("harrowgate"); }
    CQ.sel = null; CQ.prov = null; CQ.view = null; CQ.reach = {}; CQ.busy = false;
    render();
    resume();
  };
  // pick up where the campaign stood: a battle in progress, the other powers' turn, or your own
  function resume() {
    var s = CQ.s;
    if (s.over) { ending(); return; }
    var spec = s.leading || s.pending;
    if (spec) {
      var bs = SOVL.BattleSave && SOVL.BattleSave.load();
      if (bs && bs.meta && bs.meta.kind === "conquest" && bs.meta.conquest === spec.no && UI.resumeBattle(bs, battleEnded(spec))) return;
      battlePrompt(spec, s.pending ? "defend" : "forced");
      return;
    }
    if (s.phase === "enemy") { CQ.busy = true; banner("The other powers march"); setTimeout(enemyLoop, 300); return; }
    afterAction();
  }
  // after anything happens: story scenes, a fallen lord, a trait to learn
  function afterAction(done) {
    var s = CQ.s; render();
    if (s.over) { ending(); return; }
    var sc = K.nextScene(s);
    if (sc) { scene(sc, null, function () { afterAction(done); }); return; }
    if (s.pendingTraits.length && K.army(s, s.pendingTraits[0])) { traitModal(s.pendingTraits[0], function () { afterAction(done); }); return; }
    s.pendingTraits = s.pendingTraits.filter(function (id) { return K.army(s, id); });
    if (done) done();
  }

  // ---------- drawing ----------
  function requestDraw() { if (!CQ.raf) CQ.raf = requestAnimationFrame(drawFrame); }
  function stopDraw() { if (CQ.raf) cancelAnimationFrame(CQ.raf); CQ.raf = 0; }
  function drawFrame(now) {
    CQ.raf = 0;
    if (UI.screen !== "conquest" || !CQ.s) return;
    var more = M.draw($("cq-map"), CQ.s, { selected: CQ.sel, province: CQ.prov, hover: CQ.hover, reach: CQ.reach, flash: CQ.flash }, now);
    if (more) requestDraw();
  }
  M.onReady = function () { if (UI.screen === "conquest") requestDraw(); };
  window.addEventListener("resize", function () { if (UI.screen === "conquest") requestDraw(); });

  function render() {
    var s = CQ.s; if (!s) return;
    if (CQ.sel && !K.army(s, CQ.sel)) CQ.sel = null;
    CQ.reach = CQ.sel && !CQ.busy && s.phase === "player" ? K.reach(s, CQ.sel) : {};
    var inc = K.income(s);
    $("cq-turn").innerHTML = "<b>Turn " + Math.min(s.turn, D.maxTurns) + "</b> of " + D.maxTurns + " · " + K.season(s);
    $("cq-gold").textContent = s.gold;
    var net = $("cq-net"); net.textContent = (inc.net >= 0 ? "+" : "") + inc.net + " a turn"; net.className = inc.net >= 0 ? "cq-net" : "cq-net neg";
    net.setAttribute("data-tip", inc.lines.map(function (l) { return esc(l.label) + ": " + (l.gold >= 0 ? "+" : "") + l.gold; }).join("<br>"));
    $("cq-end").disabled = CQ.busy || s.phase !== "player" || s.over;
    renderPanel(); renderLog(); requestDraw();
  }
  function renderLog() {
    var lg = $("cq-log"); if (!lg) return;
    lg.innerHTML = '<div class="cq-loghead">Chronicle</div>' + CQ.s.log.slice(-40).map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("");
    lg.scrollTop = lg.scrollHeight;
  }
  var toastTimer = null;
  function toast(text, kind) {
    var t = $("cq-toast"); if (!t) return;
    t.innerHTML = esc(text); t.className = "on" + (kind ? " " + kind : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ""; }, 2600);
  }
  function banner(text) { var b = $("cq-banner"); if (!b) return; b.textContent = text || ""; b.className = text ? "on" : ""; }
  function flash(id, kind) { CQ.flash[id] = { kind: kind, t0: performance.now() }; requestDraw(); }

  // ---------- the side panel ----------
  function renderPanel() {
    var s = CQ.s, box = $("cq-panel"); box.innerHTML = "";
    if (CQ.sel && K.army(s, CQ.sel)) box.appendChild(armyPanel(K.army(s, CQ.sel)));
    else if (CQ.view && K.army(s, CQ.view)) box.appendChild(foePanel(K.army(s, CQ.view)));
    else if (CQ.prov) box.appendChild(provincePanel(CQ.prov));
    else box.appendChild(realmPanel());
  }
  function head(title, sub, back) {
    var h = el("div", "cq-phead");
    if (back) h.appendChild(btn("← Realm", "small cq-back", function () { CQ.sel = null; CQ.prov = null; CQ.view = null; render(); }));
    h.appendChild(el("h3", null, title)); if (sub) h.appendChild(el("div", "cq-psub", sub));
    return h;
  }
  function realmPanel() {
    var s = CQ.s, box = el("div", "cq-realm"), inc = K.income(s);
    box.appendChild(head("The Warden's March", K.owned(s, "player").length + " provinces · " + K.difficulty(s).name));
    var orders = el("div", "cq-sec");
    orders.appendChild(el("div", "cq-sechead", "Your armies"));
    K.armiesOf(s, "player").forEach(function (a) {
      var c = btn("", "cq-armyrow" + (a.moves > 0 && s.phase === "player" ? " ready" : ""), function () { select(a.id); });
      c.innerHTML = '<span class="cq-token' + (a.hero ? " hero" : "") + '">' + (a.hero ? "★" : esc((K.leaderName(a).split(" ").pop() || "?")[0])) + "</span><span class=\"cq-armytext\"><b>" + esc(K.leaderName(a)) + "</b><small>" + esc(P(a.at).name) + " · " + K.pts(a.army) + " pts · " + (a.moves > 0 ? a.moves + " move" + (a.moves > 1 ? "s" : "") + " left" : "done for the turn") + "</small></span>" + (s.pendingTraits.indexOf(a.id) >= 0 ? '<span class="cq-badge">Trait</span>' : "");
      orders.appendChild(c);
    });
    if (K.armiesOf(s, "player").length < K.armyLimit(s)) orders.appendChild(el("p", "cq-tip", "Raise another army in a town you hold: select the town on the map. (" + K.armiesOf(s, "player").length + " of " + K.armyLimit(s) + ")"));
    box.appendChild(orders);
    var money = el("div", "cq-sec");
    money.appendChild(el("div", "cq-sechead", "Treasury <b class=\"gold\">" + s.gold + "</b>"));
    money.appendChild(el("div", "cq-ledger", inc.lines.map(function (l) { return "<div><span>" + esc(l.label) + "</span><b class=\"" + (l.gold < 0 ? "neg" : "") + "\">" + (l.gold >= 0 ? "+" : "") + l.gold + "</b></div>"; }).join("") + "<div class=\"sum\"><span>Each turn</span><b>" + (inc.net >= 0 ? "+" : "") + inc.net + "</b></div>"));
    var held = K.regionsHeld(s, "player");
    Object.keys(D.regions).forEach(function (r) { var n = D.provinces.filter(function (p) { return p.region === r; }), mine = n.filter(function (p) { return s.provinces[p.id].owner === "player"; }).length; money.appendChild(el("div", "cq-region" + (held.indexOf(r) >= 0 ? " held" : ""), "<span>" + esc(D.regions[r].name) + " <small>" + mine + "/" + n.length + "</small></span><small>" + esc(D.regions[r].bonus) + "</small>")); });
    box.appendChild(money);
    var lords = el("div", "cq-sec");
    lords.appendChild(el("div", "cq-sechead", "The lords of the March"));
    Object.keys(D.lords).forEach(function (id) {
      var L = D.lords[id], st = s.lords[id], seat = P(D.powers[L.power].seat), armies = K.armiesOf(s, L.power), pts = armies.reduce(function (t, a) { return t + K.pts(a.army); }, 0);
      var state = st === "dormant" ? "Sleeping under the Ash" : st === "active" ? "Holds " + seat.name + " · " + armies.length + " arm" + (armies.length === 1 ? "y" : "ies") + ", " + pts + " pts" : s.fates[id] ? fateText(id, s.fates[id]) : "Fallen";
      var row = el("div", "cq-lord" + (st === "active" ? "" : " down"), '<span class="cq-face" style="' + M.faceStyle(L.portrait, 44) + '"></span><span><b>' + esc(L.name) + "</b><small>" + esc(L.title) + "</small><em>" + esc(state) + "</em></span>");
      row.onclick = function () { CQ.prov = seat.id; CQ.sel = null; CQ.view = null; M.centerOn(seat.id); render(); };
      lords.appendChild(row);
    });
    box.appendChild(lords);
    var q = Object.keys(s.quests).filter(function (k) { return s.quests[k].state === "open"; });
    if (q.length) { var qs = el("div", "cq-sec"); qs.appendChild(el("div", "cq-sechead", "Promises")); q.forEach(function (k) { if (k === "dunmar") qs.appendChild(el("p", "cq-tip", "Clear the Vulture Canyons for Thane Brokk by the end of turn " + s.quests[k].until + ".")); }); box.appendChild(qs); }
    box.appendChild(btn("How the March works", "small cq-howto", help));
    return box;
  }
  function fateText(id, f) { return { hanged: "Hanged at Highmoor", pardoned: "Pardoned: rides for the Warden", exiled: "Exiled", slain: "Slain at Redfang Hold", unleashed: "Marching on the dead", tribute: "Pays tribute", destroyed: "Destroyed", overthrown: "Overthrown" }[f] || "Fallen"; }

  function armyPanel(a) {
    var s = CQ.s, box = el("div", "cq-army"), cmd = K.commanderOf(a), here = P(a.at);
    box.appendChild(head(K.leaderName(a), a.name + " · at " + here.name, true));
    var stats = el("div", "cq-stats");
    [["Strength", K.pts(a.army) + " pts"], ["Moves", s.phase === "player" ? a.moves + " of " + D.moves : "—"], ["Upkeep", K.upkeep(a) + " gold"]].forEach(function (x) { stats.appendChild(el("div", null, "<small>" + x[0] + "</small><b>" + x[1] + "</b>")); });
    box.appendChild(stats);
    if (s.pendingTraits.indexOf(a.id) >= 0) box.appendChild(btn(esc(K.leaderName(a)) + " may learn a trait", "primary cq-wide", function () { traitModal(a.id, render); }));
    if (cmd && cmd.traits && cmd.traits.length) box.appendChild(el("div", "cq-traits", cmd.traits.map(function (t) { return '<span class="pill" data-tip="' + esc(SOVL.TRAITS[t].desc) + '">' + esc(SOVL.TRAITS[t].name) + "</span>"; }).join("")));
    // orders: everything the map offers, as buttons
    var reach = CQ.reach, ids = Object.keys(reach);
    if (s.phase === "player" && !CQ.busy) {
      var os = el("div", "cq-sec"); os.appendChild(el("div", "cq-sechead", "Orders"));
      if (!ids.length) os.appendChild(el("p", "cq-tip", a.moves ? "Nowhere to march from here." : "This army has marched or fought this turn. It recovers its wounded if it stays put in a province you hold."));
      ids.sort(function (x, y) { var o = { attack: 0, visit: 1, move: 2 }; return o[reach[x].kind] - o[reach[y].kind] || P(x).name.localeCompare(P(y).name); }).forEach(function (id) {
        var r = reach[id], label;
        if (r.kind === "move") label = "March to " + esc(P(id).name);
        else if (r.kind === "visit") label = "Parley at " + esc(P(id).name);
        else label = "Attack " + esc(P(id).name) + ' <small>' + chip(s.provinces[id].owner) + Math.round(K.defenderPts(s, id) / (K.has(id, "fortress") ? 1.3 : 1)) + " pts" + (K.has(id, "fortress") ? ", walls" : "") + "</small>";
        var b = btn(label, "cq-order " + r.kind, function () { act(id); });
        b.onmouseenter = function () { CQ.hover = { province: id }; requestDraw(); };
        b.onmouseleave = function () { CQ.hover = null; requestDraw(); };
        os.appendChild(b);
      });
      if (ids.length) os.appendChild(el("p", "cq-tip", "Or click a glowing province on the map: blue to march, red to attack, gold to parley."));
      box.appendChild(os);
    }
    // the regiments
    var us = el("div", "cq-sec"); us.appendChild(el("div", "cq-sechead", "Regiments <small>" + a.army.entries.length + " of " + D.armyCap + "</small>"));
    a.army.entries.forEach(function (e) {
      var t = e.kind === "commander" ? e.retinue : e, def = SOVL.findUnitDef(FID, t.id), row = el("div", "cq-unit");
      var vet = t.vet ? ' <span class="accent">' + esc(SOVL.CAMPAIGN.veteran[t.vet - 1].name) + "</span>" : "";
      var size = def.per && def.size[1] > 1 ? t.models + "/" + def.size[1] : "";
      row.innerHTML = "<span><b>" + (e.kind === "commander" ? "★ " + esc(e.name) + " + " : "") + esc(def.name) + "</b>" + vet + "<small>" + esc(t.weapon) + (t.ranged ? ", " + esc(t.ranged) : "") + (e.kind === "commander" && e.items.length ? " · " + e.items.map(function (i) { return esc(SOVL.itemById(i).name); }).join(", ") : "") + "</small></span><em>" + size + "</em>";
      var c = s.phase === "player" ? K.refillCost(s, a, e) : null;
      if (c) { var rb = btn("+" + c.n + " <small>" + c.price + "g</small>", "small cq-refill", function () { var err = K.refill(s, a.id, t.ref); if (err) toast(err, "bad"); save(); render(); }); rb.disabled = s.gold < c.price; rb.title = "Refill the ranks: " + c.n + " men for " + c.price + " gold"; row.appendChild(rb); }
      us.appendChild(row);
    });
    box.appendChild(us);
    // recruiting, in a town you hold
    if (s.phase === "player" && K.canRecruit(s, a.at)) {
      var rs = el("div", "cq-sec"); rs.appendChild(el("div", "cq-sechead", "Recruit at " + esc(here.name)));
      K.recruitOffers(s, a.id).forEach(function (o) {
        var def = SOVL.findUnitDef(FID, o.id), row = el("div", "cq-offer");
        row.innerHTML = "<span><b>" + (o.entry.models > 1 ? o.entry.models + " " : "") + esc(def.name) + "</b><small>" + esc(o.section) + " · Sk " + def.stats[0] + " Pw " + def.stats[1] + " Df " + def.stats[2] + " · " + esc(o.entry.weapon) + (o.entry.ranged ? ", " + esc(o.entry.ranged) : "") + "</small></span>";
        var b = btn(o.price + "g", "small" + (o.why ? "" : " primary"), function () { var err = K.recruit(s, a.id, o.id); if (err) toast(err, "bad"); else toast(def.name + " join " + K.leaderName(a) + "."); save(); render(); });
        b.disabled = !!o.why || s.gold < o.price; if (o.why) b.title = o.why;
        row.appendChild(b); rs.appendChild(row);
      });
      var u = K.unlocks(s), locked = [];
      if (!u.horse && !u.armoury) locked.push("knights (hold King's Meadow or Thornveld)");
      if (!u.forge) locked.push("war machines (Dunmar's forges)");
      if (locked.length) rs.appendChild(el("p", "cq-tip", "Not yet: " + locked.join("; ") + "."));
      box.appendChild(rs);
      var mk = K.marketOffers(s, a.id);
      if (mk.length) {
        var ms = el("div", "cq-sec"); ms.appendChild(el("div", "cq-sechead", "From the market at Ambergate"));
        mk.forEach(function (o) { var row = el("div", "cq-offer", "<span><b>" + esc(o.name) + "</b><small>" + esc(o.desc) + "</small></span>"); var b = btn(o.price + "g", "small", function () { var err = K.buyMarket(s, a.id, o.kind, o.id); if (err) toast(err, "bad"); save(); render(); }); b.disabled = s.gold < o.price; row.appendChild(b); ms.appendChild(row); });
        box.appendChild(ms);
      }
    } else if (s.phase === "player") box.appendChild(el("p", "cq-tip", "Recruits and fresh men are found in towns you hold: Harrowgate and every province marked with a town or castle."));
    return box;
  }
  function foePanel(a) {
    var s = CQ.s, box = el("div", "cq-army foe"), lord = a.lord && D.lords[a.lord];
    box.appendChild(head(K.leaderName(a), (lord ? lord.title + " · " : "") + powerName(a.power) + " · at " + P(a.at).name, true));
    if (lord) box.appendChild(el("div", "cq-portrait", "")).style.backgroundPosition = lord.portrait * 25 + "% 15%";
    box.appendChild(el("div", "cq-stats", "<div><small>Strength</small><b>" + K.pts(a.army) + " pts</b></div><div><small>Regiments</small><b>" + a.army.entries.length + "</b></div>"));
    var us = el("div", "cq-sec"); us.appendChild(el("div", "cq-sechead", "Regiments"));
    a.army.entries.forEach(function (e) { us.appendChild(el("div", "cq-unit", "<span>" + esc(unitLine(a.army.faction, e)) + "</span>")); });
    box.appendChild(us);
    var mine = CQ.sel && K.army(s, CQ.sel);
    box.appendChild(el("p", "cq-tip", "Select one of your armies, then click the province to attack it."));
    return box;
  }
  function provincePanel(id) {
    var s = CQ.s, p = P(id), st = s.provinces[id], box = el("div", "cq-prov"), owner = st.owner;
    box.appendChild(head(p.name, chip(owner) + esc(powerName(owner) === "Yours" ? "Yours" : powerName(owner)) + " · " + esc(D.regions[p.region].name), true));
    box.appendChild(el("p", "cq-desc", esc(p.desc)));
    box.appendChild(el("div", "cq-stats", "<div><small>Income</small><b>" + p.income + " gold</b></div><div><small>Battlefield</small><b>" + esc(SOVL.Biomes.defs[p.biome].name.replace(/^The /, "")) + "</b></div>"));
    if (p.features.length) {
      var fs = el("div", "cq-sec"); fs.appendChild(el("div", "cq-sechead", "Features"));
      p.features.forEach(function (f) { var F = D.features[f]; if (F) fs.appendChild(el("div", "cq-feature", "<b>" + esc(F.name) + "</b><small>" + esc(F.desc) + "</small>")); });
      box.appendChild(fs);
    }
    var army = K.armyAt(s, id, owner), g = st.garrison, ds = el("div", "cq-sec");
    ds.appendChild(el("div", "cq-sechead", "Defenders <small>" + Math.round(K.defenderPts(s, id) / (K.has(id, "fortress") ? 1.3 : 1)) + " pts" + (K.has(id, "fortress") ? " behind walls" : "") + "</small>"));
    if (army) { var ab = btn("<b>" + esc(K.leaderName(army)) + "</b> <small>" + esc(army.name) + " · " + K.pts(army.army) + " pts</small>", "cq-armylink", function () { if (army.power === "player") select(army.id); else { CQ.view = army.id; CQ.sel = null; render(); } }); ds.appendChild(ab); }
    if (g && g.entries.length) { ds.appendChild(el("div", "cq-levyname", esc(g.name) + " · " + K.pts(g) + " pts")); g.entries.forEach(function (e) { ds.appendChild(el("div", "cq-unit", "<span>" + esc(unitLine(g.faction, e)) + "</span>")); }); }
    else if (!army) ds.appendChild(el("p", "cq-tip", "No one holds it. March in."));
    box.appendChild(ds);
    if (owner === "player" && s.phase === "player" && !CQ.busy) {
      var acts = el("div", "cq-sec"); acts.appendChild(el("div", "cq-sechead", "Orders"));
      var hb = K.hireBlock(s, id), raise = btn("Raise an army here", "cq-wide" + (hb ? "" : " primary"), function () { hireModal(id); });
      raise.disabled = !!hb; if (hb) acts.appendChild(el("p", "cq-tip", esc(hb)));
      acts.appendChild(raise);
      var fb = K.fortifyBlock(s, id), f = btn("Strengthen the levy · " + D.fortifyPrice + " gold", "cq-wide", function () { var err = K.fortify(s, id); if (err) toast(err, "bad"); else toast("The levy of " + p.name + " is strengthened."); save(); render(); });
      f.disabled = !!fb; f.title = fb || "Adds a regiment to this province's levy for good.";
      acts.appendChild(f);
      box.appendChild(acts);
    }
    var vs = p.special && D.visits[p.power];
    if (vs && owner !== "player") box.appendChild(el("p", "cq-tip", "March an army next to it to parley."));
    return box;
  }

  // ---------- the map: select, march, attack ----------
  function select(id) {
    var s = CQ.s, a = K.army(s, id); if (!a) return;
    CQ.sel = id; CQ.prov = null; CQ.view = null; render();
  }
  function bind() {
    bound = true;
    var cv = $("cq-map"), ptrs = {}, drag = null, pinch = null;
    cv.addEventListener("pointerdown", function (e) {
      ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
      drag = { x: e.offsetX, y: e.offsetY, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    cv.addEventListener("pointermove", function (e) {
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY };
      var ids = Object.keys(ptrs);
      if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d > 0) M.zoomAt(cv, (a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d; requestDraw(); return; }
      if (drag) {
        var dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
        if (drag.moved || Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; M.pan(cv, dx, dy); drag.x = e.offsetX; drag.y = e.offsetY; cv.classList.add("panning"); requestDraw(); }
        return;
      }
      hover(e);
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; drag = null; return; }
      if (drag && !drag.moved) click(e.offsetX, e.offsetY);
      drag = null; cv.classList.remove("panning");
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; drag = null; pinch = null; });
    cv.addEventListener("pointerleave", function () { CQ.hover = null; tip(null); requestDraw(); });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); M.zoomAt(cv, e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15); requestDraw(); }, { passive: false });
    $("cq-zin").onclick = function () { var r = cv.getBoundingClientRect(); M.zoomAt(cv, r.width / 2, r.height / 2, 1.3); requestDraw(); };
    $("cq-zout").onclick = function () { var r = cv.getBoundingClientRect(); M.zoomAt(cv, r.width / 2, r.height / 2, 1 / 1.3); requestDraw(); };
    $("cq-zfit").onclick = function () { M.view.zoom = 1; requestDraw(); };
    $("cq-end").onclick = endTurn;
    $("cq-menu").onclick = menu;
    $("cq-help").onclick = help;
    document.addEventListener("keydown", function (e) {
      if (UI.screen !== "conquest" || UI.modalOpen) return;
      if (e.key === "Escape") { CQ.sel = null; CQ.prov = null; CQ.view = null; render(); }
    });
  }
  function hover(e) {
    var s = CQ.s, cv = $("cq-map"), h = M.hit(cv, s, e.offsetX, e.offsetY);
    var key = h ? (h.army || "") + "|" + h.province : "";
    if (key !== (CQ.hover ? (CQ.hover.army || "") + "|" + CQ.hover.province : "")) { CQ.hover = h; requestDraw(); }
    if (!h) { tip(null); cv.style.cursor = ""; return; }
    var p = P(h.province), owner = s.provinces[h.province].owner, r = CQ.reach[h.province], lines = [];
    lines.push("<b>" + esc(p.name) + "</b> · " + esc(powerName(owner)) + " · " + p.income + " gold");
    if (h.army) { var a = K.army(s, h.army); lines.push(esc(K.leaderName(a)) + ": " + K.pts(a.army) + " pts"); }
    else if (owner !== "player") lines.push("Defenders: " + Math.round(K.defenderPts(s, h.province) / (K.has(h.province, "fortress") ? 1.3 : 1)) + " pts" + (K.has(h.province, "fortress") ? " behind walls" : ""));
    if (r) lines.push('<span class="accent">' + (r.kind === "move" ? "Click to march here" : r.kind === "visit" ? "Click to parley" : "Click to attack") + "</span>");
    tip(lines.join("<br>"), e.clientX, e.clientY);
    cv.style.cursor = r || (h.army && K.army(s, h.army).power === "player") ? "pointer" : "";
  }
  function tip(html, x, y) {
    var t = $("tip"); if (!t) return;
    if (!html) { if (UI.canvasTip) { t.style.display = "none"; UI.canvasTip = false; } return; }
    t.innerHTML = html; t.style.display = "block"; UI.canvasTip = true;
    t.style.left = Math.min(window.innerWidth - t.offsetWidth - 8, x + 14) + "px"; t.style.top = Math.min(window.innerHeight - t.offsetHeight - 8, y + 14) + "px";
  }
  function click(px, py) {
    var s = CQ.s, cv = $("cq-map"); if (CQ.busy || UI.modalOpen || s.phase !== "player") return;
    var h = M.hit(cv, s, px, py); tip(null);
    if (!h) { CQ.sel = null; CQ.prov = null; CQ.view = null; render(); return; }
    if (CQ.sel && CQ.reach[h.province]) { act(h.province); return; }
    var mine = h.army && K.army(s, h.army).power === "player" ? h.army : null;
    if (!mine) { var own = K.armyAt(s, h.province, "player"); if (own && !h.army) mine = own.id; }
    if (mine) { if (CQ.sel === mine) { CQ.sel = null; CQ.prov = h.province; } else select(mine); render(); return; }
    if (h.army) { CQ.view = h.army; CQ.sel = null; CQ.prov = null; render(); return; }
    CQ.prov = h.province; CQ.sel = null; CQ.view = null; render();
  }
  function act(id) {
    var s = CQ.s, a = K.army(s, CQ.sel), r = CQ.reach[id]; if (!a || !r) return;
    if (r.kind === "move") {
      var from = a.at, err = K.move(s, a.id, id);
      if (err) { toast(err, "bad"); return; }
      M.march(a.id, from); save(); render(); return;
    }
    if (r.kind === "visit") { scene({ kind: "visit", id: "visit_" + id, scene: K.visitScene(s, id) }, { army: a.id, province: id, from: r.from }, function () { afterAction(); }); return; }
    var spec = K.attackSpec(s, a.id, id);
    if (K.unopposed(s, spec)) {
      var from0 = a.at, rep = K.occupy(s, spec); M.march(a.id, from0); flash(id, "won"); toast(rep.lines[0]); save(); afterAction(); return;
    }
    battlePrompt(spec, "attack");
  }

  // ---------- battles ----------
  var SCEN = { pitched: "A pitched battle: both armies deploy 24\" apart.", meeting: "A meeting engagement: the armies collide almost at once.", objectives: "An assault: the gate and the keep are objectives, and holding them scores points every turn." };
  function forceCard(s, f, mine, spec) {
    var c = el("div", "cq-force " + (mine ? "mine" : "theirs"));
    var pts = K.pts(f.army), lord = f.lord && D.lords[f.lord];
    c.appendChild(el("div", "cq-forcehead", chip(f.power) + "<span><b>" + esc(f.name) + "</b><small>" + (mine ? "Your force" : esc(powerName(f.power))) + (f.withLevy ? " · with " + esc(f.withLevy) : "") + "</small></span><em>" + pts + "</em>"));
    var ul = el("ul");
    f.army.entries.forEach(function (e) { ul.appendChild(el("li", null, esc(unitLine(f.army.faction, e)))); });
    c.appendChild(ul);
    return c;
  }
  function oddsText(a, b) {
    var r = a / Math.max(1, b);
    return r >= 1.8 ? "You outnumber them almost two to one." : r >= 1.25 ? "You have the stronger army." : r >= 0.9 ? "An even fight." : r >= 0.65 ? "They have the stronger army." : "You are badly outnumbered.";
  }
  // mode: attack (you may withdraw), defend (your army is attacked), forced (a battle that must be fought)
  function battlePrompt(spec, mode) {
    var s = CQ.s, att = K.force(s, spec, "attacker"), def = K.force(s, spec, "defender");
    var mineAtt = spec.attacker.power === "player", mine = mineAtt ? att : def, theirs = mineAtt ? def : att;
    if (!mine || !theirs) { s.leading = null; s.pending = null; save(); afterBattle(); return; }
    var p = P(spec.province), lord = theirs.lord && D.lords[theirs.lord], box = el("div", "cq-battle");
    var fort = spec.scenario === "objectives";
    box.appendChild(el("div", "sy-eyebrow", (mode === "defend" ? "Your army is attacked" : fort ? "Assault" : "Battle") + " · " + esc(D.regions[p.region].name)));
    box.appendChild(el("h2", "cq-btitle", (fort ? "The assault on " : "The battle for ") + esc(p.name)));
    if (lord) {
      var met = (s.met = s.met || {}), first = !met[theirs.lord];
      var lb = el("div", "cq-lordline", '<span class="cq-face big" style="' + M.faceStyle(lord.portrait, 74) + '"></span><div><b>' + esc(lord.name) + "</b><small>" + esc(lord.title) + "</small>" + (first ? "<p>" + esc(lord.taunt) + "</p>" : "<p>" + esc(lord.name) + " leads his army in person.</p>") + "</div>");
      box.appendChild(lb); met[theirs.lord] = true;
    }
    var cols = el("div", "cq-forces");
    cols.appendChild(forceCard(s, mine, true, spec)); cols.appendChild(el("div", "cq-vs", "vs")); cols.appendChild(forceCard(s, theirs, false, spec));
    box.appendChild(cols);
    var mp = K.pts(mine.army), tp = K.pts(theirs.army);
    box.appendChild(el("p", "cq-field", "<b>" + esc(SOVL.Biomes.defs[p.biome].name) + "</b> · " + esc(SCEN[spec.scenario]) + "<br><span class=\"accent\">" + oddsText(mp, tp) + "</span>"));
    var ch = el("div", "choices cq-bchoices"), leader = mine.armyId ? K.leaderName(K.army(s, mine.armyId)) : mine.name;
    var lead = btn("Lead the battle<small>Fight it on the table</small>", "primary", function () { UI.closeModal(); leadBattle(spec); });
    lead.id = "cq-lead"; ch.appendChild(lead);
    var auto = btn("Let " + esc(leader) + " fight it<small>The battle is fought out at once</small>", null, function () { UI.closeModal(); delegate(spec); });
    auto.id = "cq-auto"; ch.appendChild(auto);
    if (mode === "attack") { var wd = btn("Withdraw", "cq-withdraw", function () { UI.closeModal(); render(); }); wd.id = "cq-withdraw"; ch.appendChild(wd); }
    box.appendChild(ch);
    UI.modalDismissable = false; UI.modal(box);
    var mb = $("modal-body"); if (mb) mb.classList.add("m-cq");
  }
  function leadBattle(spec) {
    var s = CQ.s; if (!s.pending || s.pending.no !== spec.no) s.leading = spec; save();
    var st = K.battleSetup(s, spec);
    UI.startBattle({ armies: st.armies, terrain: st.terrain, biome: st.biome, fieldName: st.fieldName, scenario: st.scenario, names: st.names, aggression: st.aggression[1], conquest: { no: spec.no }, onEnd: battleEnded(spec) });
  }
  // a battle you led has ended
  function battleEnded(spec) {
    return function (b) {
      var s = CQ.s, rep = s.pending && s.pending.no === spec.no ? K.resolvePending(s, b, "led") : K.resolve(s, spec, b, "led");
      s.leading = null; save();
      UI.showResult(b, { extra: reportBox(rep), label: "Back to the March", onDone: function () { UI.show("conquest"); after(rep); } });
    };
  }
  function delegate(spec) {
    var s = CQ.s; banner("The armies clash at " + P(spec.province).name);
    setTimeout(function () {
      var b = K.autoresolve(s, spec), rep = s.pending && s.pending.no === spec.no ? K.resolvePending(s, b, "auto") : K.resolve(s, spec, b, "auto");
      s.leading = null; save(); banner(s.phase === "enemy" ? "The other powers march" : null);
      reportModal(rep, b, function () { after(rep); });
    }, 60);
  }
  function after(rep) {
    var s = CQ.s;
    if (rep) { var won = rep.winner === "attacker"; flash(rep.province, won && rep.spec.attacker.power === "player" ? "won" : won && rep.spec.defender.power === "player" ? "lost" : "won"); if (rep.winner === "attacker" && rep.spec.attacker.army) M.march(rep.spec.attacker.army, rep.spec.from); }
    render(); afterBattle();
  }
  function afterBattle() {
    var s = CQ.s;
    if (s.over) { ending(); return; }
    if (s.phase === "enemy") afterAction(function () { setTimeout(enemyLoop, 350); });
    else afterAction();
  }
  function reportBox(rep) {
    var box = el("div", "cq-report");
    box.appendChild(el("div", "cq-replines", rep.lines.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("")));
    return box;
  }
  function reportModal(rep, b, onDone) {
    var s = CQ.s, box = el("div", "cq-result"), you = K.involvesPlayer(rep.spec), word = !you ? (rep.winner === "attacker" ? "Taken" : "Held") : rep.playerWon ? "Victory" : rep.draw ? "Stalemate" : "Defeat";
    box.appendChild(el("div", "sy-eyebrow", "Fought by " + esc((rep.spec.attacker.power === "player" ? rep.att : rep.def).name) + " · " + esc(P(rep.province).name)));
    box.appendChild(el("h2", "cq-verdict " + (rep.playerWon ? "win" : rep.draw ? "draw" : "loss"), word));
    box.appendChild(reportBox(rep));
    // regiment by regiment, your side
    var mineIdx = rep.spec.attacker.power === "player" ? 0 : 1, f = mineIdx === 0 ? rep.spec.attacker : rep.spec.defender, list = rep.losses[mineIdx] || [];
    if (list.length) {
      var tbl = el("table", "result-table cq-losses", "<tr><th>Your regiments</th><th>Before</th><th>After</th></tr>");
      var names = {};
      b.units.concat(b.dead).forEach(function (u) { if (u.campaignRef) names[u.campaignRef] = u.name; });
      list.forEach(function (x) { tbl.innerHTML += "<tr><td>" + esc(names[x.ref] || "Regiment") + "</td><td>" + x.before + "</td><td class=\"" + (x.after == null ? "danger" : "") + "\">" + (x.after == null ? "lost" : x.after) + "</td></tr>"; });
      box.appendChild(tbl);
    }
    if (b && b.result && b.result.pct && you) box.appendChild(el("p", "cq-tip", "Your army destroyed or routed " + b.result.pct[0] + "% of the enemy's; they destroyed or routed " + b.result.pct[1] + "% of yours."));
    var ch = el("div", "choices"); var ok = btn("Continue", "primary", function () { UI.closeModal(); onDone(); }); ok.id = "cq-ok"; ch.appendChild(ok); box.appendChild(ch);
    UI.modalDismissable = false; UI.modal(box);
    var mb = $("modal-body"); if (mb) mb.classList.add("m-cq");
  }

  // ---------- the other powers' turn ----------
  function endTurn() {
    var s = CQ.s; if (CQ.busy || s.phase !== "player" || s.over || UI.modalOpen) return;
    K.endTurn(s); save();
    CQ.sel = null; CQ.prov = null; CQ.view = null; CQ.busy = true; CQ.turnStart = s.log.length;
    banner("The other powers march"); render();
    setTimeout(enemyLoop, 350);
  }
  function enemyLoop() {
    var s = CQ.s; if (UI.screen !== "conquest") return;
    if (s.over) { CQ.busy = false; banner(null); ending(); return; }
    var step;
    try { step = K.stepEnemy(s); }
    catch (err) {
      // never leave the turn hanging: finish it and carry on
      if (window.console) console.error(err);
      s.queue = []; s.pending = null;
      try { step = { kind: "done", report: K.finishTurn(s) }; } catch (err2) { s.phase = "player"; s.turn++; step = { kind: "done", report: { lines: [], income: K.income(s) } }; }
    }
    save();
    if (step.kind === "move") { M.march(step.army, step.from); render(); setTimeout(enemyLoop, 420); return; }
    if (step.kind === "auto") {
      var rep = step.report, lost = rep.spec.defender.power === "player" && rep.winner === "attacker";
      flash(rep.province, lost ? "lost" : "won");
      if (rep.winner === "attacker" && rep.spec.attacker.army) M.march(rep.spec.attacker.army, rep.spec.from);
      toast(rep.lines[0], lost ? "bad" : null); render();
      setTimeout(enemyLoop, K.involvesPlayer(rep.spec) ? 1300 : 700); return;
    }
    if (step.kind === "battle") { banner(null); render(); battlePrompt(step.spec, "defend"); return; }
    CQ.busy = false; banner(null); render();
    if (s.over) { ending(); return; }
    turnReport(step.report, function () { afterAction(); });
  }
  function turnReport(end, onDone) {
    var s = CQ.s, box = el("div", "cq-turnrep");
    box.appendChild(el("div", "sy-eyebrow", "Turn " + (s.turn - 1) + " ends"));
    box.appendChild(el("h2", null, "Turn " + Math.min(s.turn, D.maxTurns) + " · " + K.season(s)));
    var reps = s.reports || [];
    var mine = reps.filter(function (r) { return K.involvesPlayer(r.spec); }), others = reps.filter(function (r) { return !K.involvesPlayer(r.spec); });
    if (mine.length) { box.appendChild(el("div", "cq-sechead", "Your lands")); mine.forEach(function (r) { box.appendChild(el("div", "cq-repline " + (r.playerWon ? "good" : r.draw ? "" : "bad"), esc(r.lines[0]))); }); }
    if (others.length) { box.appendChild(el("div", "cq-sechead", "Across the March")); others.forEach(function (r) { box.appendChild(el("div", "cq-repline", esc(r.lines[0]))); }); }
    if (!reps.length) box.appendChild(el("p", "cq-tip", "A quiet turn. No one attacked."));
    box.appendChild(el("div", "cq-sechead", "The treasury"));
    box.appendChild(el("div", "cq-ledger", end.income.lines.map(function (l) { return "<div><span>" + esc(l.label) + "</span><b class=\"" + (l.gold < 0 ? "neg" : "") + "\">" + (l.gold >= 0 ? "+" : "") + l.gold + "</b></div>"; }).join("") + "<div class=\"sum\"><span>Treasury now</span><b>" + s.gold + "</b></div>"));
    end.lines.slice(1).forEach(function (l) { box.appendChild(el("p", "cq-tip", esc(l))); });
    if (D.maxTurns - s.turn + 1 <= 4 && !s.over) box.appendChild(el("p", "cq-warn", (D.maxTurns - s.turn + 1) + " turn" + (D.maxTurns - s.turn + 1 === 1 ? "" : "s") + " left before winter closes the roads."));
    var ch = el("div", "choices"), ok = btn("To turn " + Math.min(s.turn, D.maxTurns), "primary", function () { UI.closeModal(); onDone(); }); ok.id = "cq-ok"; ch.appendChild(ok); box.appendChild(ch);
    UI.modalDismissable = false; UI.modal(box);
    var mb = $("modal-body"); if (mb) mb.classList.add("m-cq");
  }

  // ---------- story scenes ----------
  function scene(sc, ctx, onDone) {
    var s = CQ.s, d = sc.scene, box = el("div", "sy cq-scene" + (d.portrait != null ? " has-portrait" : ""));
    if (d.portrait != null) { var pr = el("div", "cq-sport"); pr.style.backgroundPosition = d.portrait * 25 + "% 0%"; box.appendChild(pr); }
    else box.appendChild(el("div", "sy-art"));
    var body = el("div", "sy-body");
    body.appendChild(el("div", "sy-eyebrow", esc(d.eyebrow || "")));
    body.appendChild(el("h2", "sy-title", esc(d.title)));
    var tale = el("div", "sy-tale"); (d.text || []).forEach(function (p) { tale.appendChild(el("p", null, esc(p))); }); body.appendChild(tale);
    if (d.aims) { var aim = el("div", "sy-aim"); aim.appendChild(el("div", "sy-aimhead", "Your aim")); var ul = el("ul"); d.aims.forEach(function (x) { ul.appendChild(el("li", null, esc(x))); }); aim.appendChild(ul); body.appendChild(aim); }
    if (d.note) body.appendChild(el("p", "sy-note", esc(d.note)));
    var ch = el("div", "cq-choices");
    d.choices.forEach(function (c, i) {
      var b = btn("<b>" + esc(c.text) + "</b>" + (c.hint ? "<small>" + esc(c.hint) + "</small>" : ""), (d.choices.length === 1 ? "primary " : "") + "cq-choice", function () {
        var out = K.choose(s, sc, i, ctx);
        if (out.refused) { toast(out.lines[0], "bad"); return; }
        UI.closeModal(); save(); render();
        if (out.lines && out.lines.length) toast(out.lines.join(" "));
        if (out.battle) { battlePrompt(out.battle, "attack"); return; }
        onDone();
      });
      b.setAttribute("data-choice", i);
      if (c.gold && s.gold < c.gold) { b.disabled = true; b.title = "Not enough gold."; }
      ch.appendChild(b);
    });
    body.appendChild(ch); box.appendChild(body);
    UI.modalDismissable = false; UI.modal(box);
    var mb = $("modal-body"); if (mb) { mb.classList.add("m-story"); mb.classList.add("m-cq"); mb.scrollTop = 0; }
  }

  // ---------- traits, new armies, the menu, help ----------
  function traitModal(armyId, onDone) {
    var s = CQ.s, a = K.army(s, armyId), choices = K.traitChoices(s, armyId), box = el("div");
    if (!a || !choices.length) { s.pendingTraits = s.pendingTraits.filter(function (x) { return x !== armyId; }); save(); onDone(); return; }
    box.appendChild(el("h2", null, "A commander's trait"));
    box.appendChild(el("p", "text", esc(K.leaderName(a)) + " has grown in stature. Choose one trait; it lasts for the rest of the campaign."));
    var ch = el("div", "cq-choices");
    choices.forEach(function (id) { var t = SOVL.TRAITS[id]; ch.appendChild(btn("<b>" + esc(t.name) + "</b><small>" + esc(t.desc) + "</small>", "cq-choice", function () { K.learnTrait(s, armyId, id); save(); UI.closeModal(); render(); onDone(); })); });
    box.appendChild(ch); UI.modalDismissable = false; UI.modal(box);
  }
  function hireModal(prov) {
    var s = CQ.s, box = el("div", "cq-hire"), names = K.hireNames(s);
    box.appendChild(el("h2", null, "Raise an army at " + esc(P(prov).name)));
    box.appendChild(el("p", "text", "Hire a commander with a company of their own. The new army can march next turn. Upkeep is about a gold a turn for every 40 points of army."));
    var name = el("input"); name.type = "text"; name.maxLength = 16; name.value = names[0] || "Konrad"; name.setAttribute("aria-label", "Commander's name");
    var lab = el("label", "cq-namefield", "Commander's name "); lab.appendChild(name); box.appendChild(lab);
    var list = el("div", "cq-choices");
    D.hires.forEach(function (h) {
      var rdef = SOVL.findUnitDef(FID, h.retinue[0]);
      var b = btn("<b>" + esc(h.name) + " · " + h.price + " gold</b><small>" + esc(h.desc) + " " + (rdef.per && h.retinue[1] > 1 ? h.retinue[1] + " " : "") + esc(rdef.name) + ".</small>", "cq-choice", function () {
        var err = K.hire(s, prov, h.id, name.value.trim() || undefined);
        if (err) { toast(err, "bad"); return; }
        UI.closeModal(); save(); var a = K.armyAt(s, prov, "player"); if (a) select(a.id); toast("A new army gathers at " + P(prov).name + ".");
      });
      b.setAttribute("data-hire", h.id);
      b.disabled = s.gold < h.price; list.appendChild(b);
    });
    box.appendChild(list);
    var ch = el("div", "choices"); ch.appendChild(btn("Not now", null, function () { UI.closeModal(); })); box.appendChild(ch);
    UI.modalDismissable = true; UI.modal(box);
  }
  function menu() {
    var box = el("div");
    box.appendChild(el("h2", null, "The Broken March"));
    box.appendChild(el("p", "text", "The campaign is saved after every move."));
    var ch = el("div", "choices"); ch.style.flexDirection = "column"; ch.style.alignItems = "stretch";
    ch.appendChild(btn("Back to the title screen", "primary", function () { UI.closeModal(); save(); UI.show("menu"); }));
    ch.appendChild(btn("How the March works", null, function () { UI.closeModal(); help(); }));
    ch.appendChild(btn("Abandon this campaign", "danger", function () {
      UI.modal('<h2>Abandon the campaign?</h2><div class="text">Everything won so far will be lost.</div><div class="choices"><button id="m-stay">Keep it</button><button class="danger" id="m-leave">Abandon</button></div>');
      $("m-stay").onclick = UI.closeModal; $("m-leave").onclick = function () { UI.closeModal(); K.clear(); CQ.s = null; UI.show("menu"); };
    }));
    ch.appendChild(btn("Keep playing", null, function () { UI.closeModal(); }));
    box.appendChild(ch); UI.modalDismissable = true; UI.modal(box);
  }
  function help() {
    var box = el("div", "cq-help");
    box.appendChild(el("h2", null, "How the March works"));
    box.appendChild(el("div", "text", [
      "<b>Your turn.</b> Click one of your armies (the blue tokens), then a glowing province: <span class=\"cq-k move\">blue</span> to march through your own land, <span class=\"cq-k attack\">red</span> to attack, <span class=\"cq-k visit\">gold</span> to parley. Each army has two moves a turn; attacking ends its march. The Orders list in the side panel does the same.",
      "<b>Battles.</b> Lead any battle yourself on the table, or let the army's commander fight it, which settles it at once. Battles are scored by the share of each army destroyed or routed. The winner takes the province; a beaten army falls back. Half of a victor's casualties are only wounded and return.",
      "<b>Gold.</b> Every province pays gold each turn; whole regions pay a bonus. Armies cost upkeep. Recruit regiments and refill ranks in towns you hold. Stud farms open up knights, Dunmar's forges open war machines, and the market at Ambergate sells relics.",
      "<b>Armies.</b> Raise up to " + D.maxArmies + " armies, each under a commander you hire in a town. An army that stays put in your land recovers its wounded. Every province has a levy that defends it, and fights beside an army quartered there.",
      "<b>Winning.</b> Take Highmoor Keep, Redfang Hold and the Ashen Spire before turn " + D.maxTurns + " ends. Lose Harrowgate and the March is lost."
    ].map(function (p) { return "<p>" + p + "</p>"; }).join("")));
    var ch = el("div", "choices"); ch.appendChild(btn("Back to the map", "primary", function () { UI.closeModal(); })); box.appendChild(ch);
    UI.modalDismissable = true; UI.modal(box);
  }

  // ---------- the end ----------
  function ending() {
    var s = CQ.s, box = el("div", "cq-ending"), r = s.result;
    box.appendChild(el("div", "sy-art"));
    var body = el("div", "sy-body");
    body.appendChild(el("div", "sy-eyebrow", "The Broken March · " + (s.timeUp ? "Winter" : "Turn " + Math.min(s.turn, D.maxTurns))));
    body.appendChild(el("h2", "sy-title", r === "victory" ? "The March is whole" : r === "partial" ? "A March divided" : "The March is lost"));
    var tale = el("div", "sy-tale"); K.epilogue(s).forEach(function (p) { tale.appendChild(el("p", null, esc(p))); }); body.appendChild(tale);
    var st = s.stats;
    body.appendChild(el("div", "cq-endstats", [["Provinces held", K.owned(s, "player").length + " of " + K.ids.length], ["Battles", st.won + " won · " + st.lost + " lost"], ["Led in person", st.led], ["Lords fallen", s.fallen.length + " of 3"]].map(function (x) { return "<div><b>" + x[1] + "</b><small>" + x[0] + "</small></div>"; }).join("")));
    var ch = el("div", "choices sy-foot"), ok = btn("Back to the title screen", "primary", function () { UI.closeModal(); K.clear(); CQ.s = null; UI.show("menu"); }); ok.id = "cq-done"; ch.appendChild(ok); body.appendChild(ch);
    box.appendChild(body);
    UI.modalDismissable = false; UI.modal(box);
    var mb = $("modal-body"); if (mb) { mb.classList.add("m-story"); mb.classList.add("m-cq"); }
  }

  // ---------- leaving a battle you lead ----------
  var leave = UI.confirmLeaveBattle;
  UI.confirmLeaveBattle = function () {
    if (!UI.battleOpts || !UI.battleOpts.conquest) return leave.apply(UI, arguments);
    UI.modalDismissable = true;
    UI.modal('<h2>Leave the field?</h2><div class="text">The battle counts as lost: your army falls back with the losses it has taken so far.</div><div class="choices"><button id="m-stay">Keep fighting</button><button class="danger" id="m-leave">Sound the retreat</button></div>');
    $("m-stay").onclick = UI.closeModal;
    $("m-leave").onclick = function () {
      UI.closeModal(); if (UI.aiTimer) { clearTimeout(UI.aiTimer); UI.aiTimer = null; }
      var b = UI.battle; if (!b) return;
      if (SOVL.BattleSave) SOVL.BattleSave.clear();
      b.result = { why: "abandoned", winner: UI.aiSide, turn: b.turn, score: [0, 0], pct: [0, 0] }; b.phase = "end";
      UI.endShown = b; var fn = UI.battleOpts.onEnd; UI.battle = null; fn(b);
    };
  };

  // ---------- start ----------
  window.addEventListener("load", menuEntry);
  menuEntry();
})();
