// Mid-battle saving. A battle is snapshotted as plain JSON whenever it is at rest (no dice waiting
// to be rolled, no engagement half-fought) and kept in localStorage, so closing the tab or
// reloading loses nothing. Skirmish, quick and hot-seat battles are resumed from the title
// screen; a campaign battle resumes when the campaign is continued, instead of being refought.
// Snapshots keep units' references to game data (unit definitions, unit types, banners) as ids
// and re-link them on restore; everything else in a battle is already plain data keyed by uid.
"use strict";
(function () {
  var KEY = "fantasy_battle_battle", VERSION = 1;
  // battle fields that are never saved: per-step queues, pending callbacks and derived state
  var SKIP = { units: 1, dead: 1, events: 1, pendingRoll: 1, autoRoll: 1 };

  function packUnit(u) {
    var o = {};
    Object.keys(u).forEach(function (k) {
      if (k.charAt(0) === "_" || typeof u[k] === "function") return; // render state, caches
      o[k] = u[k];
    });
    o.def = null; o.typeInfo = null;
    o.banner = u.banner ? u.banner.id : null;
    if (u.commander) { o.commander = Object.assign({}, u.commander); o.commander.def = null; }
    return o;
  }
  function unpackUnit(o) {
    var u = JSON.parse(JSON.stringify(o));
    u.def = SOVL.findUnitDef(u.faction, u.id);
    u.typeInfo = SOVL.UNIT_TYPES[u.type];
    u.banner = u.banner ? SOVL.bannerById(u.banner) : null;
    if (u.commander) u.commander.def = SOVL.findUnitDef(u.faction, u.commander.id);
    if (!u.def || !u.typeInfo) throw new Error("Unknown unit in saved battle: " + u.id);
    return u;
  }
  function atRest(b) { return !!b && !b.pendingRoll && !b.engagementBusy && b.phase !== "end"; }
  function snapshot(b) {
    if (!atRest(b)) return null;
    var s = {};
    Object.keys(b).forEach(function (k) {
      if (SKIP[k] || typeof b[k] === "function") return;
      s[k] = b[k];
    });
    s.units = b.units.map(packUnit);
    s.dead = b.dead.map(packUnit);
    return JSON.parse(JSON.stringify(s));
  }
  function restore(s) {
    var b = Object.create(SOVL.Battle.prototype), data = JSON.parse(JSON.stringify(s));
    Object.keys(data).forEach(function (k) { if (k !== "units" && k !== "dead") b[k] = data[k]; });
    b.units = s.units.map(unpackUnit);
    b.dead = s.dead.map(unpackUnit);
    b.events = []; b.pendingRoll = null; b.autoRoll = false;
    var maxUid = 0;
    b.units.concat(b.dead).forEach(function (u) { if (u.uid > maxUid) maxUid = u.uid; });
    if (SOVL.reserveUnitIds) SOVL.reserveUnitIds(maxUid);
    return b;
  }
  function read() { try { var s = localStorage.getItem(KEY); var d = s ? JSON.parse(s) : null; return d && d.v === VERSION ? d : null; } catch (e) { return null; } }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* storage may be blocked */ } }
  SOVL.BattleSave = { snapshot: snapshot, restore: restore, atRest: atRest, load: read, clear: clear, key: KEY };

  // ---------- interface ----------
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, C = SOVL.Campaign, $ = function (id) { return document.getElementById(id); };
  function kindOf(opts) { return opts.campaign ? "campaign" : opts.hotseat ? "hotseat" : opts.quick ? "quick" : "skirmish"; }
  // what is needed to start the same battle again, minus the armies (the snapshot has them)
  function metaOf(opts) {
    return { kind: kindOf(opts), scenario: opts.scenario, names: opts.names, biome: opts.biome || null, fieldName: opts.fieldName || null, aggression: opts.aggression || 0.5, hotseat: !!opts.hotseat, quick: !!opts.quick, campaign: !!opts.campaign };
  }
  UI.saveBattle = function () {
    var b = UI.battle, opts = UI.battleOpts;
    if (!b || !opts || UI.screen !== "battle" || UI.combatAnimating || !atRest(b)) return false;
    var snap = snapshot(b); if (!snap) return false;
    var camp = UI.campaign, pb = opts.campaign && camp ? camp.pendingBattle : null;
    return write({ v: VERSION, at: Date.now(), meta: metaOf(opts), playerSide: UI.playerSide, campaign: pb ? { commander: camp.commanderName, layer: pb.layer, idx: pb.idx } : null, battle: snap });
  };
  var saveTimer = null;
  function scheduleSave() { if (saveTimer) return; saveTimer = setTimeout(function () { saveTimer = null; try { UI.saveBattle(); } catch (e) { /* saving never blocks play */ } }, 300); }
  var updateHud = UI.updateHud;
  UI.updateHud = function () { var r = updateHud.apply(UI, arguments); if (UI.battle && UI.battle.phase !== "end" && !UI.resuming) scheduleSave(); return r; };
  window.addEventListener("pagehide", function () { try { UI.saveBattle(); } catch (e) { /* ignore */ } });
  document.addEventListener("visibilitychange", function () { if (document.hidden) try { UI.saveBattle(); } catch (e) { /* ignore */ } });
  // a battle that has ended, or been abandoned, is no longer resumable
  var onEnd = UI.onEnd;
  UI.onEnd = function () { clear(); return onEnd.apply(UI, arguments); };
  var leave = UI.confirmLeaveBattle;
  UI.confirmLeaveBattle = function () {
    var r = leave.apply(UI, arguments), btn = $("m-leave");
    if (btn) btn.addEventListener("click", clear, true);
    return r;
  };
  var startBattle = UI.startBattle;
  UI.startBattle = function (opts) { if (!opts || !opts.restore) clear(); return startBattle.apply(UI, arguments); };

  function toMenu() { UI.show("menu"); }
  // start the saved battle again, exactly where it stood
  UI.resumeBattle = function (save, onEndFn) {
    save = save || read(); if (!save) return false;
    var m = save.meta, b;
    try { b = restore(save.battle); } catch (e) { clear(); UI.hint && UI.hint("The saved battle could not be restored."); return false; }
    var opts = { armies: b.armies, terrain: b.terrain, scenario: m.scenario, names: m.names, biome: m.biome, fieldName: m.fieldName, aggression: m.aggression, campaign: m.campaign, quick: m.quick, hotseat: m.hotseat, restore: b,
      onEnd: onEndFn || function (bb) { UI.showResult(bb, { onDone: toMenu }); } };
    UI.resuming = true;
    try { UI.startBattle(opts); } finally { UI.resuming = false; }
    UI.hint && UI.hint("Battle resumed: turn " + Math.max(1, b.turn) + ", " + (b.phase === "deploy" ? "deployment" : b.phase + " phase") + ".");
    if (b.phase !== "deploy") UI.pumpAI();
    return true;
  };
  // campaign: a battle in progress is resumed instead of refought
  var showCampaign = UI.showCampaign;
  UI.showCampaign = function () {
    var camp = UI.campaign, save = read(), pb = camp && camp.pendingBattle;
    if (camp && !camp.over && pb && save && save.meta.kind === "campaign" && save.campaign && save.campaign.layer === pb.layer && save.campaign.idx === pb.idx && save.campaign.commander === camp.commanderName) {
      var node = C.nodeAt(camp, pb.layer, pb.idx);
      if (node) {
        UI.show("campaign"); UI.renderCampaign();
        var enemy = save.battle.armies[1], after = pb.after && UI.eventAftermath ? UI.eventAftermath(pb.after) : undefined;
        if (UI.resumeBattle(save, UI.campaignOnEnd(node, after, enemy))) return;
      }
    }
    return showCampaign.apply(UI, arguments);
  };
  // title screen: a card to resume a skirmish, quick or hot-seat battle
  function describe(save) {
    var b = save.battle, names = save.meta.names || ["", ""];
    var when = new Date(save.at), mins = Math.round((Date.now() - save.at) / 60000);
    var ago = mins < 1 ? "just now" : mins < 60 ? mins + " min ago" : mins < 1440 ? Math.round(mins / 60) + " h ago" : when.toLocaleDateString();
    return (save.meta.kind === "hotseat" ? "Hot seat · " : "") + names[0] + " vs " + names[1] + " · turn " + Math.max(1, b.turn) + " · " + ago;
  }
  function resumeCard() {
    var btn = $("btn-resume"), save = read(); if (!btn) return;
    var show = !!save && save.meta.kind !== "campaign";
    btn.style.display = show ? "" : "none";
    if (show) { var sub = btn.querySelector("small"); if (sub) sub.textContent = describe(save); }
    var cont = $("btn-continue"), csub = cont && cont.querySelector("small");
    if (csub && save && save.meta.kind === "campaign" && !/battle in progress/.test(csub.textContent)) csub.textContent += " · battle in progress";
  }
  var show = UI.show;
  UI.show = function (id) { var r = show.apply(UI, arguments); if (id === "menu") resumeCard(); return r; };
  window.addEventListener("load", function () {
    var btn = $("btn-resume");
    if (btn) btn.onclick = function () { UI.campaign = null; UI.resumeBattle(); };
    resumeCard();
  });
})();
