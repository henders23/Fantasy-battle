// Events and treasure on the Trail of Death. An event is a page from the campaign chronicle: an
// engraved emblem for the kind of encounter, the act it happens in, the story, and each choice
// as a card with its cost and consequences spelled out as tags (gold, a battle, recruits, relics,
// veterancy, discipline, losses) and a warning when you cannot afford it. Its outcome is written
// up on the same page, line by line. Treasure opens a chest in the dark: gold spills out as a
// number, a relic arrives as a card saying who now carries it and what it replaced.
// The choices and their effects are the campaign's own; only the presentation is new.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Campaign) return;
  var UI = SOVL.UI, C = SOVL.Campaign, R = SOVL.R, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var COIN = '<svg class="coin" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#e0b85a" stroke="#7a5a1c" stroke-width="2"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#9c7426" stroke-width="1.5"/><path d="M16 11v10M13 14h6" stroke="#9c7426" stroke-width="1.6" stroke-linecap="round"/></svg>';

  // ---------- engraved emblems ----------
  var S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var EMBLEM = {
    banner: '<path d="M18 10v46" ' + S + '/><path d="M18 12h26l-7 9 7 9H18" ' + S + '/><path d="M12 56h14" ' + S + "/>",
    coins: '<ellipse cx="32" cy="46" rx="14" ry="5" ' + S + '/><path d="M18 46v-6M46 46v-6" ' + S + '/><ellipse cx="32" cy="40" rx="14" ry="5" ' + S + '/><ellipse cx="30" cy="28" rx="11" ry="4" ' + S + '/><path d="M19 28v-5M41 28v-5" ' + S + '/><ellipse cx="30" cy="23" rx="11" ry="4" ' + S + "/>",
    wagon: '<path d="M10 38h40l-4-16H14z" ' + S + '/><path d="M14 22c4-8 28-8 32 0" ' + S + '/><circle cx="20" cy="44" r="6" ' + S + '/><circle cx="42" cy="44" r="6" ' + S + '/><path d="M50 34l8-2" ' + S + "/>",
    shrine: '<path d="M14 54h36M18 54V30M46 54V30M12 30l20-16 20 16z" ' + S + '/><path d="M32 36v10M28 40h8" ' + S + "/>",
    skull: '<path d="M18 34c0-12 6-20 14-20s14 8 14 20c0 5-3 8-6 9v7H24v-7c-3-1-6-4-6-9z" ' + S + '/><circle cx="26" cy="33" r="4" ' + S + '/><circle cx="38" cy="33" r="4" ' + S + '/><path d="M30 44l2-4 2 4M28 50v-4M36 50v-4" ' + S + "/>",
    swords: '<path d="M14 14l26 26M50 14L24 40" ' + S + '/><path d="M36 44l8-8M20 36l8 8M14 50l6-6M50 50l-6-6" ' + S + "/>",
    flask: '<path d="M26 12h12M28 12v12L16 48c-2 4 1 6 4 6h24c3 0 6-2 4-6L36 24V12" ' + S + '/><path d="M20 42h24" ' + S + '/><circle cx="30" cy="48" r="1.5" fill="currentColor"/><circle cx="36" cy="46" r="1.2" fill="currentColor"/>',
    star: '<path d="M32 10l5 14h14l-11 9 4 14-12-8-12 8 4-14-11-9h14z" ' + S + '/><path d="M32 50v6" ' + S + "/>",
    bridge: '<path d="M8 36h48M8 36c8-12 40-12 48 0M16 36v12M48 36v12M24 32v4M32 30v6M40 32v4" ' + S + '/><path d="M8 52c6-3 10 3 16 0s10 3 16 0 10 3 16 0" ' + S + "/>",
    sun: '<circle cx="32" cy="34" r="9" ' + S + '/><path d="M32 16v5M32 47v5M14 34h5M45 34h5M19 21l3 3M42 44l3 3M45 21l-3 3M22 44l-3 3" ' + S + '/><path d="M10 54h44" ' + S + "/>",
    cup: '<path d="M20 14h24l-3 18c-1 5-5 8-9 8s-8-3-9-8zM32 40v10M22 54h20" ' + S + '/><path d="M44 18h5c2 0 3 2 2 4l-5 6" ' + S + "/>",
    anvil: '<path d="M12 26h34c0 6-4 10-10 10H26M28 36v8M20 52h24l-4-8H24z" ' + S + '/><path d="M46 26l8-4" ' + S + "/>",
    road: '<path d="M26 54l4-44M38 54l-4-44M31 50v-4M32 38v-4M32 26v-3" ' + S + '/><path d="M10 54h44" ' + S + "/>"
  };
  var EMBLEM_OF = { deserters: "banner", shrine: "shrine", merchant_caravan: "wagon", plague: "flask", armoury: "anvil", hermit: "star", mercenaries: "coins", drill: "swords", ambush: "swords", tomb: "skull", tax: "bridge", feast: "cup", bridge_storm: "bridge", relic_seller: "star", lost_patrol: "banner", omen: "sun", siege_train: "anvil", gravefield: "skull", necro_pact: "skull", dwarf_hold: "anvil", elf_grove: "shrine", orc_challenge: "swords", imperial_levy: "banner", deserters_night: "road", wandering_wizard: "star" };
  function emblem(id) { return '<svg viewBox="0 0 64 64" aria-hidden="true">' + (EMBLEM[EMBLEM_OF[id]] || EMBLEM.road) + "</svg>"; }

  // ---------- what a choice does, as tags ----------
  var BATTLE = { small: "Small battle", normal: "Battle", undead: "Undead warband" };
  function tagsFor(eff) {
    var t = [], n;
    if (eff.gold) t.push([eff.gold > 0 ? "good" : "cost", COIN + (eff.gold > 0 ? "+" : "−") + Math.abs(eff.gold) + " gold"]);
    if (eff.battle) t.push(["war", "⚔ " + (BATTLE[eff.battle] || "Battle")]);
    if (eff.goldAfter) t.push(["good", COIN + "+" + eff.goldAfter + " gold after"]);
    if (eff.itemAfter) t.push(["good", "✦ Magic " + eff.itemAfter + " after"]);
    if (eff.recruitRandom) t.push(["good", "+ " + (eff.big ? "A unit joins" : "A small unit joins")]);
    if (eff.recruitMachine) t.push(["good", "+ War machine"]);
    if (eff.randomItem) t.push(["good", "✦ Magic item"]);
    if (eff.randomWeapon) t.push(["good", "✦ Magic weapon"]);
    if (eff.grantProp) t.push(["good", "⛨ " + eff.grantProp + " for a unit"]);
    if (eff.trainOne) t.push(["good", "★ A veterancy rank"]);
    if (eff.traitOffer) t.push(["good", "✎ A commander's trait"]);
    if (eff.commanderWounds) t.push(["good", "♥ +" + eff.commanderWounds + " Wound for the commander"]);
    if (eff.healAll) t.push(["good", "✚ All units restored"]);
    if ((n = eff.disciplineAll)) t.push([n > 0 ? "good" : "cost", (n > 0 ? "+" : "−") + Math.abs(n) + " Discipline, all units"]);
    if (eff.loseModelsPct) t.push(["cost", "☠ Lose " + Math.round(eff.loseModelsPct * 100) + "% of every unit"]);
    if (eff.reputation) t.push([eff.reputation > 0 ? "good" : "cost", "Reputation " + (eff.reputation > 0 ? "+" : "−") + Math.abs(eff.reputation)]);
    if (!t.length) t.push(["none", "Nothing changes"]);
    return t;
  }
  // "Pay him (-20 gold): a random magic item" -> "Pay him: a random magic item"; the tags carry the numbers
  function headline(text) { var s = text.replace(/\s*\([^)]*\)/g, "").trim(); return s || text; }
  function actName(camp) { var a = SOVL.CAMPAIGN.acts[camp.act]; return a ? a.name : ""; }
  var ROMAN = ["I", "II", "III", "IV"];

  // an outcome written up on the chronicle page
  var LINE_ICON = [[/gold/i, COIN], [/join|column/i, "+"], [/Discipline/i, "⚑"], [/Wound|blessed/i, "♥"], [/veterancy/i, "★"], [/loses|lose/i, "☠"], [/strength/i, "✚"], [/trait/i, "✎"], [/receives|takes up|claim|relic|item/i, "✦"], [/now has|armour/i, "⛨"]];
  function lineIcon(t) { for (var i = 0; i < LINE_ICON.length; i++) if (LINE_ICON[i][0].test(t)) return LINE_ICON[i][1]; return "•"; }
  UI.chronicleOutcome = function (title, choice, lines, onOk, id) {
    var camp = UI.campaign, box = el("div", "tl");
    box.appendChild(el("div", "tl-seal small", emblem(id)));
    box.appendChild(el("div", "tl-eyebrow", "The outcome"));
    box.appendChild(el("h2", null, esc(title)));
    if (choice) box.appendChild(el("div", "text tl-chosen", "You chose: " + esc(choice)));
    var list = el("ul", "tl-lines");
    (lines.length ? lines : ["Nothing much happens."]).forEach(function (l) { list.appendChild(el("li", /−|lose|useless|loses/i.test(l) && !/\+/.test(l) ? "bad" : "", '<span class="tl-li">' + lineIcon(l) + "</span><span>" + esc(l) + "</span>")); });
    box.appendChild(list);
    if (camp) box.appendChild(el("div", "tl-purse", COIN + "<span>Purse</span><b>" + camp.gold + "</b>"));
    var ch = el("div", "choices"), ok = el("button", "primary", "Continue"); ok.id = "m-ok"; ok.type = "button";
    ok.onclick = function () { UI.closeModal(); if (onOk) onOk(); };
    ch.appendChild(ok); box.appendChild(ch);
    UI.modalDismissable = false; UI.modal(box); $("modal-body").classList.add("m-tale");
  };

  // ---------- events ----------
  // The reward an event battle promises, paid once the battle is won. Built from a plain
  // description (kept on the function as .spec) so a battle resumed after a reload pays it too.
  UI.eventAftermath = function (spec) {
    var fn = function () {
      var camp = UI.campaign, more = [];
      if (spec.goldAfter) { camp.gold += spec.goldAfter; more.push("+" + spec.goldAfter + " gold."); }
      if (spec.itemAfter) { var it = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === spec.itemAfter; })); var err = C.buy(camp, { kind: "item", item: it, price: 0 }); more.push(err ? "The relic is useless to you." : "You claim " + it.name + "."); }
      if (more.length) { camp.log.push(more.join(" ")); C.save(camp); UI.renderCampaign(); UI.chronicleOutcome("Aftermath", spec.title, more, null, spec.id); }
    };
    fn.spec = spec;
    return fn;
  };
  UI.campaignEvent = function (node) {
    var camp = UI.campaign, ev = C.randomEvent(camp), box = el("div", "tl");
    box.appendChild(el("div", "tl-seal", emblem(ev.id)));
    box.appendChild(el("div", "tl-eyebrow", "An encounter · " + esc(actName(camp) || "Act " + (ROMAN[camp.act] || camp.act + 1))));
    box.appendChild(el("h2", null, esc(ev.title)));
    box.appendChild(el("div", "text tl-story", esc(ev.text)));
    var ch = el("div", "choices tl-choices");
    ev.choices.forEach(function (c) {
      var short = c.effect.gold && c.effect.gold < 0 && camp.gold < -c.effect.gold;
      var btn = el("button", "tl-choice", '<span class="tl-say">' + esc(headline(c.text)) + '</span><span class="tl-tags">' + tagsFor(c.effect).map(function (t) { return '<i class="' + t[0] + '">' + t[1] + "</i>"; }).join("") + "</span>" + (short ? '<span class="tl-short">You need ' + (-c.effect.gold - camp.gold) + " more gold.</span>" : ""));
      btn.type = "button"; btn.title = c.text; btn.setAttribute("aria-label", c.text); btn.disabled = !!short;
      btn.onclick = function () {
        UI.closeModal();
        var eff = Object.assign({}, c.effect), battleKind = eff.battle; delete eff.battle;
        var goldAfter = eff.goldAfter, itemAfter = eff.itemAfter; delete eff.goldAfter; delete eff.itemAfter;
        var lines = C.applyEffect(camp, eff);
        camp.log.push(ev.title + ": " + (lines.join(" ") || "nothing much happens.")); C.save(camp); UI.renderCampaign();
        var trait = function () { if (camp.pendingTrait) UI.traitModal(); };
        if (battleKind) {
          UI.campaignBattle(node, battleKind, UI.eventAftermath({ goldAfter: goldAfter || 0, itemAfter: itemAfter || null, title: ev.title, id: ev.id }));
        } else if (lines.length) UI.chronicleOutcome(ev.title, headline(c.text), lines, trait, ev.id);
        else trait();
      };
      ch.appendChild(btn);
    });
    box.appendChild(ch);
    box.appendChild(el("div", "tl-purse", COIN + "<span>Purse</span><b>" + camp.gold + "</b>"));
    UI.modalDismissable = false; UI.modal(box); $("modal-body").classList.add("m-tale");
  };

  // ---------- treasure ----------
  var CHEST = '<svg class="tr-chest" viewBox="0 0 160 120" aria-hidden="true">' +
    '<ellipse cx="80" cy="108" rx="62" ry="8" fill="rgba(0,0,0,0.45)"/>' +
    '<g class="tr-body"><rect x="28" y="56" width="104" height="50" rx="6" fill="#6b4222" stroke="#2a180a" stroke-width="3"/>' +
    '<path d="M28 70h104M28 92h104" stroke="#3d2412" stroke-width="3"/><rect x="40" y="56" width="10" height="50" fill="#b08a3e" stroke="#2a180a" stroke-width="2"/><rect x="110" y="56" width="10" height="50" fill="#b08a3e" stroke="#2a180a" stroke-width="2"/>' +
    '<rect x="72" y="62" width="16" height="18" rx="3" fill="#d8b25a" stroke="#2a180a" stroke-width="2"/><circle cx="80" cy="70" r="2.5" fill="#2a180a"/></g>' +
    '<g class="tr-lid"><path d="M28 58V44c0-14 22-24 52-24s52 10 52 24v14z" fill="#7a4c28" stroke="#2a180a" stroke-width="3"/><path d="M40 28v30M120 28v30" stroke="#b08a3e" stroke-width="10"/><path d="M40 28v30M120 28v30" stroke="#2a180a" stroke-width="2" fill="none"/></g></svg>';
  UI.treasureReveal = function (snap, text, onOk) {
    var camp = UI.campaign, cmd = camp.army.entries[0], gold = camp.gold - snap.gold;
    var gained = (cmd.items || []).filter(function (id) { return snap.items.indexOf(id) < 0; }).map(SOVL.itemById).filter(Boolean)[0];
    var lost = snap.items.filter(function (id) { return (cmd.items || []).indexOf(id) < 0; }).map(SOVL.itemById).filter(Boolean)[0];
    var box = el("div", "tr");
    var scene = el("div", "tr-scene", '<div class="tr-rays"></div>' + CHEST + '<div class="tr-sparks">' + new Array(10).join("<i></i>") + "</div>");
    box.appendChild(scene);
    var find = el("div", "tr-find");
    find.appendChild(el("div", "tl-eyebrow", "Treasure"));
    if (gained) {
      find.appendChild(el("h2", null, "A relic in the dark"));
      var card = el("div", "tr-relic k-" + gained.kind, '<div class="tr-relic-ic">' + (gained.kind === "weapon" ? "⚔" : "✦") + '</div><div><b>' + esc(gained.name) + "</b><em>Magic " + esc(gained.kind) + "</em><p>" + esc(gained.desc) + "</p><small>" + esc(cmd.name) + " now carries it" + (lost ? ", setting aside " + esc(lost.name) : "") + ".</small></div>");
      find.appendChild(card);
    } else {
      var relic = /relic/i.test(text);
      find.appendChild(el("h2", null, relic ? "A relic nobody can use" : "A buried strongbox"));
      find.appendChild(el("div", "tr-gold", COIN + "<b>+" + gold + "</b><span>gold</span>"));
      if (relic) find.appendChild(el("p", "text", "Your commander cannot use it, so it is sold on."));
    }
    find.appendChild(el("div", "tr-purse", "Purse now <b>" + camp.gold + "</b> gold"));
    var ch = el("div", "choices"), ok = el("button", "primary", gained ? "Take it" : "Pocket it"); ok.id = "m-ok"; ok.type = "button";
    ok.onclick = function () { UI.closeModal(); if (onOk) onOk(); };
    ch.appendChild(ok); find.appendChild(ch); box.appendChild(find);
    UI.modalDismissable = false; UI.modal(box); $("modal-body").classList.add("m-hoard");
    if (UI.sfx) UI.sfx.play(gained ? "reward" : "coin", { max: 1 });
  };
  var travel = UI.travel;
  UI.travel = function (idx) {
    var camp = UI.campaign, snap = camp ? { gold: camp.gold, items: (camp.army.entries[0].items || []).slice() } : null, simple = UI.simpleModal;
    UI.simpleModal = function (title, text, onOk) { if (title === "Treasure" && snap) return UI.treasureReveal(snap, text, onOk); return simple.apply(UI, arguments); };
    try { return travel.apply(UI, arguments); } finally { UI.simpleModal = simple; }
  };
  var modal = UI.modal;
  UI.modal = function () { var m = $("modal-body"); if (m) m.classList.remove("m-tale", "m-hoard"); return modal.apply(UI, arguments); };
})();
