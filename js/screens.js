// Army builder and campaign screen dressing: painted models on catalogue cards, army entries,
// the campaign roster, merchant wares and battle briefings; a points gauge; act progress;
// a chronicle-style log; and distinct looks for events, the merchant, camp and the run's end.
// Presentation only: game state is never changed here.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, C = SOVL.Campaign, A = SOVL.Army, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function thumb(fid, id, W, H, opts) { try { return SOVL.Thumbs && SOVL.Thumbs.forDef(fid, id, W, H, opts); } catch (e) { return null; } }
  function defByName(fid, name) {
    var hit = null;
    SOVL.FACTION_DATA[fid].sections.forEach(function (s) { s.units.forEach(function (u) { if (!hit && u.name === name) hit = u; }); });
    return hit;
  }
  var ICON = {
    weapon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 4l4 4-15 15-4-4z"/><path d="M8 18l6 6M6 26l4-4M5 21l6 6"/></svg>',
    item: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5c0 5 12 5 12 0"/><path d="M16 10v3"/><path d="M16 13l6 5-6 9-6-9z"/><circle cx="16" cy="19" r="2" fill="currentColor"/></svg>',
    banner: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v25"/><path d="M8 5h16l-4 6 4 6H8"/></svg>',
    equip: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26l11-11"/><path d="M15 9l8 8 4-4-8-8z"/><path d="M5 27l2 0 0-2"/></svg>',
    coin: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#e0b85a" stroke="#7a5a1c" stroke-width="2"/><circle cx="16" cy="16" r="7" fill="none" stroke="#9c7426" stroke-width="1.5"/></svg>'
  };

  // ---------- army builder ----------
  function decorateCatalog() {
    if (!UI.builder) return;
    var fid = UI.builder.army.faction, cat = $("builder-catalog");
    cat.querySelectorAll("h3").forEach(function (h) {
      if (h.classList.contains("sec-head")) return;
      h.classList.add("sec-head");
      var m = h.querySelector(".muted"); if (m) { m.removeAttribute("style"); m.className = "sec-count"; }
    });
    // wrap each section's cards in a grid so the catalogue reads as a muster board
    var kids = Array.prototype.slice.call(cat.children), grid = null;
    if (!kids.some(function (k) { return k.classList && k.classList.contains("unit-card"); })) kids = [];
    kids.forEach(function (k) {
      if (k.tagName === "H3") { grid = el("div", "cat-grid"); cat.insertBefore(grid, k.nextSibling); }
      else if (k.classList.contains("unit-card") && grid) grid.appendChild(k);
    });
    cat.querySelectorAll(".unit-card").forEach(function (card) {
      if (card.__dressed) return; card.__dressed = true;
      var name = card.querySelector(".head b"), def = name && defByName(fid, name.textContent);
      var fam = card.querySelector(".unit-family"), old = card.querySelector(".mini-portrait");
      var t = def && thumb(fid, def.id, 64, 74);
      if (t && old) old.parentNode.replaceChild(t, old);
      else if (t && fam) fam.insertBefore(t, fam.firstChild);
      var add = card.querySelector("button"); if (add) { add.classList.add("add-btn"); add.textContent = add.disabled ? "Section full" : "+ Add to army"; }
      if (add && add.disabled) card.classList.add("full");
    });
  }
  function decorateList() {
    if (!UI.builder) return;
    var b = UI.builder, army = b.army, fid = army.faction, list = $("builder-list");
    list.querySelectorAll(".entry").forEach(function (box, i) {
      var e = army.entries[i]; if (!e || box.__dressed) return; box.__dressed = true;
      var t = e.kind === "commander" ? e.retinue : e, head = box.querySelector(".head");
      var th = thumb(fid, e.kind === "commander" ? e.id : t.id, 44, 50, { weapon: e.kind === "commander" ? e.weapon : t.weapon, ranged: t.ranged });
      if (th && head) head.insertBefore(th, head.firstChild);
      if (e.kind === "commander") box.classList.add("is-cmd");
      box.querySelectorAll(".opts > label").forEach(function (l) { if (l.querySelector("input[type=checkbox]")) l.classList.add("check"); if (l.querySelector("input[type=range]")) l.classList.add("range"); });
    });
    // the points gauge
    var total = A.armyCost(army), pts = b.pts, top = document.querySelector("#screen-builder .topbar");
    var gauge = top.querySelector(".pts-gauge");
    if (!gauge) { gauge = el("div", "pts-gauge"); var p = $("builder-points"); p.parentNode.insertBefore(gauge, p.nextSibling); }
    var over = total > pts;
    gauge.className = "pts-gauge" + (over ? " over" : total >= pts * 0.9 ? " full" : "");
    gauge.innerHTML = '<i style="width:' + Math.min(100, total / Math.max(1, pts) * 100).toFixed(1) + '%"></i>';
    gauge.title = total + " of " + pts + " points" + (over ? " (over the limit)" : ", " + (pts - total) + " left");
    var probs = list.querySelector(".problems"); if (probs) probs.classList.add("warn-box");
    var go = $("builder-go"); if (go) go.classList.toggle("blocked", !!probs);
  }
  function watchBuilder() {
    var cat = $("builder-catalog"), list = $("builder-list");
    if (!cat || cat.__watch) return; cat.__watch = true;
    new MutationObserver(function () { try { decorateCatalog(); } catch (e) { /* decoration only */ } }).observe(cat, { childList: true });
    new MutationObserver(function () { try { decorateList(); } catch (e) { /* decoration only */ } }).observe(list, { childList: true });
  }

  // ---------- campaign screen ----------
  var rosterList = UI.rosterList;
  UI.rosterList = function (camp, actionFn) {
    var box = rosterList.apply(UI, arguments);
    try {
      var entries = camp.army.entries;
      box.querySelectorAll(".entry").forEach(function (d, i) {
        var e = entries[i]; if (!e) return;
        var t = e.kind === "commander" ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id);
        var th = thumb(camp.faction, e.kind === "commander" ? e.id : t.id, 44, 52, { weapon: e.kind === "commander" ? e.weapon : t.weapon, ranged: t.ranged });
        var head = d.querySelector(".head");
        if (th && head) { var wrap = el("div", "entry-row"); d.insertBefore(wrap, head); wrap.appendChild(th); var col = el("div", "entry-col"); wrap.appendChild(col); col.appendChild(head); var pr = d.querySelector(".props"); if (pr) col.appendChild(pr); }
        if (e.kind === "commander") d.classList.add("is-cmd");
        if (def && def.per) {
          var ratio = Math.max(0, Math.min(1, t.models / def.size[1]));
          var bar = el("div", "entry-bar", '<i style="width:' + (ratio * 100).toFixed(0) + '%"></i>');
          bar.title = t.models + " of " + def.size[1] + " models";
          (d.querySelector(".entry-col") || d).appendChild(bar);
        }
        if (t.vet) d.classList.add("vet-" + t.vet);
      });
    } catch (err) { /* decoration only */ }
    return box;
  };
  var renderCampaign = UI.renderCampaign;
  UI.renderCampaign = function () {
    var r = renderCampaign.apply(UI, arguments), camp = UI.campaign;
    try {
      var act = C.currentAct(camp), top = document.querySelector("#screen-campaign .topbar");
      var prog = top.querySelector(".act-progress");
      if (!prog) { prog = el("div", "act-progress"); var a = $("camp-act"); a.parentNode.insertBefore(prog, a.nextSibling); }
      var at = camp.nodeIndex == null ? 0 : camp.layer + 1, n = act.layers.length, h = "";
      for (var i = 0; i < n; i++) h += '<i class="' + (i < at ? "done" : i === at ? "next" : "") + (i === n - 1 ? " boss" : "") + '"></i>';
      prog.innerHTML = h; prog.title = "Stage " + Math.min(at + 1, n) + " of " + n + " in " + act.name;
      var gold = $("camp-gold"); if (gold && !gold.parentNode.querySelector(".coin")) { var c = el("i", "coin", ICON.coin); gold.parentNode.insertBefore(c, gold.parentNode.firstChild); }
      var lg = $("camp-log");
      if (lg && !lg.querySelector(".log-title")) lg.insertBefore(el("div", "log-title", "Chronicle"), lg.firstChild);
      lg.scrollTop = lg.scrollHeight;
    } catch (e) { /* decoration only */ }
    return r;
  };

  // ---------- dialogs ----------
  var modal = UI.modal;
  UI.modal = function () {
    var body = $("modal-body");
    body.classList.remove("m-event", "m-merchant", "m-camp", "m-brief", "m-runover", "m-victory", "m-trait");
    return modal.apply(UI, arguments);
  };
  function tag(cls) { var b = $("modal-body"); if (UI.modalOpen && b) b.classList.add(cls); }

  var campaignEvent = UI.campaignEvent;
  UI.campaignEvent = function () { var r = campaignEvent.apply(UI, arguments); tag("m-event"); return r; };
  var campaignCamp = UI.campaignCamp;
  UI.campaignCamp = function () { var r = campaignCamp.apply(UI, arguments); tag("m-camp"); return r; };
  var traitModal = UI.traitModal;
  UI.traitModal = function () { var r = traitModal.apply(UI, arguments); tag("m-trait"); return r; };
  var runOver = UI.showRunOver;
  UI.showRunOver = function () { var r = runOver.apply(UI, arguments); tag("m-runover"); if (UI.campaign && UI.campaign.victory) tag("m-victory"); return r; };

  // merchant: pictures on every ware; the modal redraws after each purchase
  function dressMerchant() {
    var body = $("modal-body"), camp = UI.campaign; if (!camp || !body) return;
    body.classList.add("m-merchant");
    var wares = el("div", "wares"), first = null;
    body.querySelectorAll(".shop-item").forEach(function (it) {
      if (it.__dressed) return; it.__dressed = true;
      var bold = it.querySelector(".desc b"), txt = bold ? bold.textContent : "", kind = (it.querySelector(".desc .muted") || {}).textContent || "";
      var name = txt.replace(/^\d+\s+/, ""), def = defByName(camp.faction, name), pic;
      if (def && !/switch to|add /.test(kind)) pic = thumb(camp.faction, def.id, 56, 64);
      else { pic = el("div", "ware-icon", /banner/.test(kind) ? ICON.banner : /weapon/.test(kind) ? ICON.weapon : /switch to|add /.test(kind) ? ICON.equip : ICON.item); }
      if (pic) it.insertBefore(pic, it.firstChild);
      var btn = it.querySelector("button"); if (btn) btn.classList.add("price");
      if (!it.previousElementSibling || !it.previousElementSibling.classList.contains("shop-item")) first = it;
    });
    // lay the first run of wares out as a grid
    var items = body.querySelectorAll(".shop-item");
    if (items.length && !body.querySelector(".wares")) {
      var start = items[0]; start.parentNode.insertBefore(wares, start);
      var n = start;
      while (n && n.classList && n.classList.contains("shop-item")) { var next = n.nextElementSibling; wares.appendChild(n); n = next; }
    }
  }
  var merchant = UI.campaignMerchant;
  UI.campaignMerchant = function () { var r = merchant.apply(UI, arguments); dressMerchant(); return r; };
  // purchases re-open the merchant modal from inside its own render(); catch those too
  new MutationObserver(function () { var b = $("modal-body"); if (b && b.querySelector(".shop-item") && !b.querySelector(".wares")) try { dressMerchant(); } catch (e) { /* decoration only */ } }).observe($("modal-body"), { childList: true });

  // battle briefing: the two armies side by side
  var lastEnemy = null, enemyFor = C.enemyArmyFor;
  C.enemyArmyFor = function () { lastEnemy = enemyFor.apply(C, arguments); return lastEnemy; };
  function muster(fid, entries, cls, title, pts) {
    var col = el("div", "muster " + cls);
    col.appendChild(el("div", "muster-head", '<b>' + esc(title) + '</b><span>' + pts + " pts</span>"));
    entries.forEach(function (e) {
      var t = e.kind === "commander" ? e.retinue : e;
      var row = el("div", "muster-row");
      var th = thumb(fid, e.kind === "commander" ? e.id : t.id, 34, 40, { weapon: e.kind === "commander" ? e.weapon : t.weapon, ranged: t.ranged });
      if (th) row.appendChild(th);
      row.appendChild(el("span", null, esc(A.entryLabel(fid, e))));
      col.appendChild(row);
    });
    return col;
  }
  var campaignBattle = UI.campaignBattle;
  UI.campaignBattle = function () {
    var r = campaignBattle.apply(UI, arguments), camp = UI.campaign, body = $("modal-body");
    try {
      if (UI.modalOpen && $("m-fight") && lastEnemy && camp) {
        body.classList.add("m-brief");
        var text = body.querySelector(".text"), parts = text.innerHTML.split("<br><br>");
        var intro = parts[0], scen = parts.length > 3 ? parts[parts.length - 1] : "";
        var own = A.armyCost(camp.army), foe = lastEnemy.pts || A.armyCost(lastEnemy), share = own / Math.max(1, own + foe);
        text.innerHTML = "";
        text.appendChild(el("p", "brief-intro", intro));
        var odds = el("div", "odds", '<span class="mine">' + own + '</span><span class="odds-bar"><i style="width:' + (share * 100).toFixed(1) + '%"></i></span><span class="theirs">' + foe + "</span>");
        odds.title = "Army points: yours " + own + ", theirs " + foe;
        text.appendChild(odds);
        var grid = el("div", "muster-grid");
        grid.appendChild(muster(camp.faction, camp.army.entries, "mine", camp.commanderName + "'s warband", own));
        grid.appendChild(muster(lastEnemy.faction, lastEnemy.entries, "theirs", SOVL.FACTION_DATA[lastEnemy.faction].name, foe));
        text.appendChild(grid);
        if (scen) text.appendChild(el("p", "brief-scen", scen));
      }
    } catch (e) { /* decoration only */ }
    return r;
  };

  window.addEventListener("load", watchBuilder);
})();
