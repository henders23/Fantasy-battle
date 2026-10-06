// A page of story at the start of each game: the setting, who you lead and what you are trying
// to achieve. The campaign gets the tale of the Trail of Death (with a line for each faction and
// the run's rules for its difficulty); the quick battle, custom battles and hot seat get the
// stakes of the fight and how it is won, from the scenario and the armies on the field.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, C = SOVL.Campaign, A = SOVL.Army, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // o: { eyebrow, title, story: [paragraphs], aims: [lines], note, button, onBegin }
  UI.showStory = function (o) {
    var box = el("div", "sy" + (o.dropCap === false ? "" : " drop"));
    box.appendChild(el("div", "sy-art"));
    var body = el("div", "sy-body");
    body.appendChild(el("div", "sy-eyebrow", esc(o.eyebrow || "")));
    body.appendChild(el("h2", "sy-title", esc(o.title)));
    var tale = el("div", "sy-tale");
    (o.story || []).forEach(function (p, i) { tale.appendChild(el("p", i === 0 ? "sy-first" : null, esc(p))); });
    body.appendChild(tale);
    if (o.aims && o.aims.length) {
      var aim = el("div", "sy-aim");
      aim.appendChild(el("div", "sy-aimhead", "Your aim"));
      var ul = el("ul");
      o.aims.forEach(function (a) { ul.appendChild(el("li", null, esc(a))); });
      aim.appendChild(ul);
      body.appendChild(aim);
    }
    if (o.note) body.appendChild(el("p", "sy-note", esc(o.note)));
    var ch = el("div", "choices sy-foot"), go = el("button", "primary", esc(o.button || "Begin")); go.id = "m-ok"; go.type = "button";
    go.onclick = function () { UI.closeModal(); if (o.onBegin) o.onBegin(); };
    ch.appendChild(go); body.appendChild(ch); box.appendChild(body);
    UI.modalDismissable = false; UI.modal(box);
    var m = $("modal-body"); if (m) { m.classList.add("m-story"); m.scrollTop = 0; }
    go.focus();
  };
  var modal = UI.modal;
  UI.modal = function () { var m = $("modal-body"); if (m) m.classList.remove("m-story"); return modal.apply(UI, arguments); };

  // ---------- the campaign ----------
  var WHY = {
    empires_of_men: "The Emperor's armies are far to the south. {name} has been given a warband, a writ and a road, and told to buy the realm time.",
    dwarf_holds: "The holds have sealed their gates. {name} marches out anyway, with whoever would follow, to settle a grudge older than the mountains.",
    elven_conclaves: "The Conclave has read the omens and will send no army, only {name} and a handful of the bold.",
    greenskin_tribes: "Every tribe from here to the mountains is running from the dead. {name} smells a better fight going the other way.",
    dead_nations: "Not every dead lord bends the knee. {name} rises against the Deathless Host to take the crown of ash for their own."
  };
  UI.campaignStory = function (camp) {
    var acts = SOVL.CAMPAIGN.acts, diff = C.difficulty(camp), name = camp.commanderName;
    var actNames = acts.map(function (a) { return a.name.replace(/^Act [IV]+ — /, ""); }), bosses = acts.map(function (a) { return a.boss.name; });
    UI.showStory({
      eyebrow: "The Trail of Death · " + diff.name,
      title: "Beyond the pass, the dead are gathering",
      story: [
        "For a generation the border held. Now the barrow-fields beyond the pass stand empty, and something wearing a crown of ash is calling the dead to war: the Deathless Host.",
        (WHY[camp.faction] || WHY.empires_of_men).replace("{name}", name),
        "Three lands lie between you and the Ashen Crown, and each is held by a warlord who must fall before the road opens. You ride out with " + camp.army.entries.map(function (e) { return A.entryLabel(camp.faction, e); }).join(", ") + "."
      ],
      aims: [
        "Cross three lands, one act each: " + actNames.join(", ") + ".",
        "Defeat the master of each land: " + bosses.slice(0, -1).join(" and ") + ", and at the last " + bosses[bosses.length - 1] + ".",
        "Grow the warband on the way: battles pay gold and veterancy, merchants sell recruits and relics, camps restore the ranks.",
        diff.lossEndsRun ? "On " + diff.name + ", one lost battle or a fallen commander ends the trail." : "A lost battle is a costly retreat, but defeat at a master's hands ends the trail."
      ],
      note: "Choose a glowing stop on the map to travel. Every battle, purchase and choice is saved as you go.",
      button: "Ride out"
    });
  };

  // ---------- single battles ----------
  function scen(id) { return SOVL.SCENARIOS.filter(function (s) { return s.id === id; })[0] || SOVL.SCENARIOS[0]; }
  function fname(fid) { return (SOVL.FACTION_DATA[fid] || {}).name || "the enemy"; }
  function howToWin(b) {
    var t = b.maxTurns || 8, aims = [];
    if (b.scenario === "objectives") aims.push("Two objective markers stand on the field. At the end of each turn the side holding more of them scores 50 points.");
    aims.push("Win by routing the enemy army, or by leading on points when the " + t + " turns are done.");
    aims.push("Points come from enemy regiments destroyed, routed or cut below half strength, and from commanders slain.");
    if (b.scenario === "meeting") aims.push("Only 12\" separate the deployment zones: the lines will meet almost at once.");
    return aims;
  }
  function battleStory(opts, b) {
    var sc = scen(opts.scenario), names = opts.names || b.names, f0 = opts.armies[0].faction, f1 = opts.armies[1].faction;
    if (opts.quick) return {
      eyebrow: "Take the field · " + sc.name,
      title: "The ford at Harrow's End",
      story: [
        "Captain Aldric's Border Guard holds the last ford before the farmlands. Across the river the Broken Tusk, a greenskin warband grown fat on burned villages, is massing to cross.",
        "If the ford falls, nothing stands between the warband and the harvest. Aldric has spears, bows, a few knights and one afternoon."
      ],
      aims: howToWin(b).concat(["Deploy in the blue zone, then press Begin Battle. The Guide (?) explains each phase."]),
      button: "To the ford"
    };
    if (opts.hotseat) return {
      eyebrow: "Hot seat · " + sc.name,
      title: names[0] + " against " + names[1],
      story: [
        names[0] + " leads the " + fname(f0) + " (blue). " + names[1] + " leads the " + fname(f1) + " (red). One table, two commanders, and only one of you will leave the field with an army.",
        names[0] + " deploys first while " + names[1] + " looks away; then the screen passes over."
      ],
      aims: howToWin(b).concat(["Pass the screen whenever the banner names the other player."]),
      button: "Deploy"
    };
    return {
      eyebrow: "Custom battle · " + sc.name,
      title: "The " + fname(f0) + " against the " + fname(f1),
      story: [
        "You lead the " + fname(f0) + ". " + ((SOVL.FACTION_INFO[f0] || {}).tagline || ""),
        "Facing you are the " + fname(f1) + ". " + ((SOVL.FACTION_INFO[f1] || {}).tagline || ""),
        sc.name + ": " + sc.desc
      ],
      dropCap: false,
      aims: howToWin(b),
      button: "Deploy"
    };
  }
  var startBattle = UI.startBattle;
  UI.startBattle = function (opts) {
    var r = startBattle.apply(UI, arguments), b = UI.battle;
    if (opts && !opts.restore && !opts.campaign && b && opts.armies && opts.armies.length === 2) {
      var story = battleStory(opts, b);
      if (story) UI.showStory(story);
    }
    return r;
  };
})();
