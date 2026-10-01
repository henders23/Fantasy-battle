// Title screen and battle interface dressing: menu icons, drifting embers, the continue card,
// a quick sound toggle, turn pips and a score bar, stat changes on the unit profile, painted
// model thumbnails in the army strip, and pips on the dice. Presentation only.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, $ = function (id) { return document.getElementById(id); };

  // ---------- title ----------
  var ICONS = {
    quick: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5l14 14M5 6l1-1M17 22l5-5M20 25l5-5M22 22l6 6"/><path d="M26 5L12 19M27 6l-1-1M15 22l-5-5M12 25l-5-5M10 22l-6 6"/></svg>',
    campaign: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c-6 0-10 4-10 9 0 3 1.5 5.5 4 7v4h12v-4c2.5-1.5 4-4 4-7 0-5-4-9-10-9z"/><circle cx="12" cy="14" r="2.2" fill="currentColor"/><circle cx="20" cy="14" r="2.2" fill="currentColor"/><path d="M14 24v3M18 24v3M16 18l-1 2h2z"/></svg>',
    custom: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4l10 4v7c0 7-4.5 11-10 13C10.5 26 6 22 6 15V8z"/><path d="M11 13l5 4 5-4M16 17v7"/></svg>',
    cont: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h14M9 28h14M10 4c0 7 6 8 6 12s-6 5-6 12M22 4c0 7-6 8-6 12s6 5 6 12"/><path d="M13 25h6" /></svg>'
  };
  function decorateTitle() {
    var h1 = document.querySelector("#screen-menu h1");
    if (h1 && !h1.querySelector(".t-line")) {
      var words = h1.textContent.trim().split(/\s+/);
      h1.setAttribute("aria-label", words.join(" "));
      h1.innerHTML = words.map(function (w) { return '<span class="t-line">' + w + "</span>"; }).join("");
      var rule = document.createElement("div"); rule.className = "title-rule"; rule.setAttribute("aria-hidden", "true"); rule.innerHTML = "<i></i>";
      h1.parentNode.insertBefore(rule, h1.nextSibling);
    }
    [["btn-quick", "quick"], ["btn-campaign", "campaign"], ["btn-skirmish", "custom"], ["btn-continue", "cont"], ["btn-resume", "cont"]].forEach(function (p) {
      var b = $(p[0]); if (!b || b.querySelector(".mi")) return;
      var arrow = b.querySelector("b"), title = b.querySelector("span"), sub = b.querySelector("small");
      var mt = document.createElement("div"); mt.className = "mt";
      if (title) mt.appendChild(title); else { var s = document.createElement("span"); s.textContent = b.textContent.trim(); mt.appendChild(s); b.textContent = ""; }
      if (sub) mt.appendChild(sub);
      var mi = document.createElement("i"); mi.className = "mi"; mi.setAttribute("aria-hidden", "true"); mi.innerHTML = ICONS[p[1]];
      b.innerHTML = ""; b.appendChild(mi); b.appendChild(mt); if (arrow) b.appendChild(arrow);
    });
    var util = document.querySelector(".menu-utilities");
    if (util && !$("btn-sound")) {
      var sb = document.createElement("button"); sb.id = "btn-sound"; sb.type = "button";
      sb.onclick = function () { var on = !(UI.settings.sound || UI.settings.music); UI.settings.sound = on; UI.settings.music = on; UI.applySettings(); soundLabel(); };
      util.appendChild(sb); soundLabel();
    }
  }
  function soundLabel() { var b = $("btn-sound"); if (b) b.textContent = UI.settings && (UI.settings.sound || UI.settings.music) ? "Sound on" : "Sound off"; }
  function continueCard() {
    var b = $("btn-continue"); if (!b) return;
    var c = SOVL.Campaign && SOVL.Campaign.load && SOVL.Campaign.load();
    var sub = b.querySelector("small");
    if (!sub) { sub = document.createElement("small"); var mt = b.querySelector(".mt"); if (mt) mt.appendChild(sub); }
    var title = b.querySelector(".mt span"); if (title) title.textContent = "Continue the Trail";
    if (c && !c.over) {
      var act = SOVL.CAMPAIGN.acts[c.act] ? SOVL.CAMPAIGN.acts[c.act].name.replace(/ — .*/, "") : "";
      sub.textContent = c.commanderName + " · " + act + " · " + c.wins + " victor" + (c.wins === 1 ? "y" : "ies") + " · " + c.gold + " gold";
    }
  }

  // drifting embers over the title painting
  var embers = null;
  function startEmbers() {
    var host = document.querySelector("#screen-menu"); if (!host) return;
    var cv = $("title-embers");
    if (!cv) { cv = document.createElement("canvas"); cv.id = "title-embers"; cv.setAttribute("aria-hidden", "true"); var art = host.querySelector(".menu-art"); host.insertBefore(cv, art ? art.nextSibling : host.firstChild); }
    if (embers) return;
    var g = cv.getContext("2d"), parts = [], last = performance.now();
    function size() { var d = Math.min(2, window.devicePixelRatio || 1); cv.width = host.clientWidth * d; cv.height = host.clientHeight * d; cv.style.width = host.clientWidth + "px"; cv.style.height = host.clientHeight + "px"; g.setTransform(d, 0, 0, d, 0, 0); }
    function spawn(W, H, anywhere) { return { x: W * (0.35 + Math.random() * 0.65), y: anywhere ? Math.random() * H : H + 10, r: 0.6 + Math.random() * 1.8, vy: 12 + Math.random() * 34, vx: -6 + Math.random() * 10, ph: Math.random() * 6.28, life: 0, max: 6 + Math.random() * 8 }; }
    size();
    embers = { raf: 0, size: size };
    (function tick(now) {
      if (UI.screen !== "menu" || document.hidden) { embers.raf = requestAnimationFrame(tick); last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var W = host.clientWidth, H = host.clientHeight, motion = !UI.settings || UI.settings.motion;
      g.clearRect(0, 0, W, H);
      if (motion) {
        while (parts.length < Math.min(70, W / 16)) parts.push(spawn(W, H, parts.length < 30));
        g.globalCompositeOperation = "lighter";
        parts.forEach(function (p) {
          p.life += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(p.ph + p.life * 1.7) * 9) * dt;
          var a = Math.min(1, p.life / 1.2) * Math.max(0, 1 - p.life / p.max) * (0.5 + 0.5 * Math.sin(p.ph + p.life * 5));
          var gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          gr.addColorStop(0, "rgba(255,210,140," + (0.9 * a) + ")"); gr.addColorStop(0.35, "rgba(255,120,40," + (0.45 * a) + ")"); gr.addColorStop(1, "rgba(255,80,20,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r * 4, 0, 6.2832); g.fill();
        });
        g.globalCompositeOperation = "source-over";
        parts = parts.filter(function (p) { return p.life < p.max && p.y > -20; });
      }
      embers.raf = requestAnimationFrame(tick);
    })(last);
    window.addEventListener("resize", size);
  }

  var show = UI.show;
  UI.show = function (id) {
    var r = show.apply(UI, arguments);
    if (id === "menu") { decorateTitle(); continueCard(); soundLabel(); startEmbers(); }
    return r;
  };
  var apply = UI.applySettings;
  UI.applySettings = function () { var r = apply.apply(UI, arguments); soundLabel(); return r; };

  // ---------- battle top bar ----------
  function topBar() {
    var b = UI.battle; if (!b) return;
    var top = $("battle-top"), turn = $("battle-turn"), score = $("battle-score");
    var pips = top.querySelector(".turn-pips");
    if (!pips) { pips = document.createElement("div"); pips.className = "turn-pips"; pips.setAttribute("aria-hidden", "true"); turn.parentNode.insertBefore(pips, turn.nextSibling); }
    if (b.phase === "deploy") pips.innerHTML = "";
    else { var h = ""; for (var t = 1; t <= b.maxTurns; t++) h += '<i class="' + (t < b.turn ? "past" : t === b.turn ? "now" : "") + '"></i>'; pips.innerHTML = h; }
    var bar = top.querySelector(".score-bar");
    if (!bar) { bar = document.createElement("div"); bar.className = "score-bar"; score.parentNode.insertBefore(bar, score); }
    if (b.phase === "deploy") { bar.innerHTML = ""; return; }
    var me = UI.colourSide(), a = b.scoreFor(me), e = b.scoreFor(1 - me), share = a + e > 0 ? a / (a + e) : 0.5;
    bar.title = "Score: " + b.names[me] + " " + a + ", " + b.names[1 - me] + " " + e + (b.scoreMode === "ratio" ? " (share of army value)" : "");
    bar.innerHTML = '<span class="mine">' + a + '</span><span class="sb-track"><i style="width:' + (share * 100).toFixed(1) + '%"></i></span><span class="theirs">' + e + "</span>";
  }
  var hud = UI.updateHud;
  UI.updateHud = function () {
    var r = hud.apply(UI, arguments), b = UI.battle;
    if (b) {
      // the deployment dock only belongs to deployment proper, not the initiative roll after it
      $("screen-battle").classList.toggle("is-deploy", b.phase === "deploy" && !UI.deployDone);
      try { topBar(); } catch (e) { /* decoration only */ }
    }
    return r;
  };

  // ---------- unit profile: show where stats differ from the unit's base profile ----------
  var info = UI.unitInfoPanel;
  UI.unitInfoPanel = function (u) {
    var box = info.apply(UI, arguments), b = UI.battle;
    try {
      box.style.setProperty("--faction", (SOVL.FACTION_INFO[u.faction] || {}).color || "#557fab");
      var portrait=box.querySelector('.unit-portrait');
      if(portrait && SOVL.Thumbs){portrait.style.backgroundImage='none';portrait.classList.add('unit-art-portrait');var model=SOVL.Thumbs.canvas(thumbFor(u,128,145));portrait.appendChild(model);}
      var lines = box.querySelectorAll(".statline"), keys = ["sk", "pw", "df", "at", "wd", "ds"];
      var pairs = [[lines[0], SOVL.effStats(u, b), u.base]];
      if (u.commander && u.commander.alive && lines[1]) pairs.push([lines[1], SOVL.effCmdStats(u, b), u.commander.base]);
      pairs.forEach(function (p) {
        if (!p[0] || !p[2]) return;
        p[0].querySelectorAll(".stat").forEach(function (cell, i) {
          var k = keys[i], now = p[1][k], base = p[2][k];
          if (now == null || base == null || now === base) return;
          var better = k === "ds" ? now > base : now > base;
          cell.classList.add(better ? "up" : "down");
          cell.title = "Base " + base + ", now " + now + " (effects, ranks, veterancy or items)";
        });
      });
    } catch (e) { /* decoration only */ }
    return box;
  };

  // ---------- army strip: painted thumbnails ----------
  var thumbs = {};
  function thumbFor(u, W, H) {
    W = W || 50; H = H || 58;
    var cmdOnly = SOVL.commanderOnly(u), key = [SOVL.RealisticArt ? SOVL.RealisticArt.revision() : 0, u.faction, u.id, u.weapon, u.ranged, cmdOnly ? u.commander.def.id : "", u.commander && u.commander.alive ? 1 : 0, W, H].join("|");
    if (thumbs[key]) return thumbs[key];
    var d = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement("canvas");
    cv.width = W * d; cv.height = H * d;
    var g = cv.getContext("2d"), P = SOVL.Renderer.prototype;
    var type = cmdOnly ? u.commander.def.type : u.type, info = SOVL.UNIT_TYPES[type] || SOVL.UNIT_TYPES.Infantry, bw = info.base[0] * SOVL.MM, bd = info.base[1] * SOVL.MM;
    var single = SOVL.isSingle(u.type) && !cmdOnly, files = single ? 1 : 3;
    var cav = /Cavalry|Hounds/.test(type), reach = single ? Math.max(bw, bd) * 1.02 : cav ? bd * 1.02 : bw * 1.3;
    var k = Math.min(W, H) * d / reach;
    g.translate(W * d / 2, H * d * (single || cav ? 0.5 : 0.58)); g.scale(k, k);
    try { P.drawModelSprite.call({ scale: k / d * 1.1, dpr: d }, g, u, bw, bd, 0, 1, files); } catch (e) { /* leave the plain plate */ }
    cv._unitArt = { unit:u, width:W, height:H };
    thumbs[key] = cv;
    return cv;
  }
  // A stand-in unit built from a faction list entry, so screens outside battle can show models.
  function unitFromDef(fid, id, opts) {
    opts = opts || {};
    var def = SOVL.findUnitDef(fid, id); if (!def) return null;
    var weapon = opts.weapon || (def.weapons[0] && def.weapons[0].name) || "Hand Weapon", ranged = opts.ranged || (def.ranged && def.ranged[0] && def.ranged[0].name) || null;
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return { uid: 10000 + (h % 50000), faction: fid, id: def.id, def: def, name: def.name, type: def.type, weapon: weapon, ranged: ranged, props: (def.props || []).slice(), models: def.per ? Math.max(3, def.size[0]) : 1, maxModels: def.per ? def.size[1] : 1, files: 3, commander: null, banner: null, a: -Math.PI / 2 };
  }
  // Paint a copy of a cached thumbnail into a fresh canvas element.
  function thumbCanvas(src, cls) {
    var cv = document.createElement("canvas"); cv._unitArt = src._unitArt; cv.className = cls || "thumb"; cv.width = src.width; cv.height = src.height; cv.setAttribute("aria-hidden", "true");
    cv.getContext("2d").drawImage(src, 0, 0); return cv;
  }
  SOVL.Thumbs = { unit: thumbFor, fromDef: unitFromDef, canvas: thumbCanvas, forDef: function (fid, id, W, H, opts) { var u = unitFromDef(fid, id, opts); return u ? thumbCanvas(thumbFor(u, W, H)) : null; } };
  var roster = UI.renderRoster;
  UI.renderRoster = function () {
    var r = roster.apply(UI, arguments), b = UI.battle;
    if (!b) return r;
    try {
      var mine = b.unitsOf(UI.playerSide), cards = $("battle-roster").querySelectorAll(".regiment");
      cards.forEach(function (card, i) {
        var u = mine[i]; if (!u) return;
        card.style.setProperty("--faction", (SOVL.FACTION_INFO[u.faction] || {}).color || "#557fab");
        card.classList.toggle("engaged", b.isEngaged(u));
        card.classList.toggle("ready", b.phase === "strategic" && b.canActivate && b.canActivate(u));
        var ratio = SOVL.commanderOnly(u) ? (u.commander.maxWounds - u.commander.wounds) / u.commander.maxWounds : u.models / Math.max(1, u.maxModels);
        card.style.setProperty("--sb", ratio > 0.6 ? "#5e9e5e" : ratio > 0.3 ? "#c9a040" : "#c0503f");
        card.style.setProperty("--sb2", ratio > 0.6 ? "#a6d98a" : ratio > 0.3 ? "#ecd07a" : "#e9867a");
        var old = card.querySelector(".mini-portrait, .thumb");
        var src = thumbFor(u), cv = document.createElement("canvas");
        cv._unitArt = src._unitArt; cv.className = "thumb"; cv.width = src.width; cv.height = src.height; cv.setAttribute("aria-hidden", "true");
        cv.getContext("2d").drawImage(src, 0, 0);
        if (old) card.replaceChild(cv, old); else card.insertBefore(cv, card.firstChild);
      });
    } catch (e) { /* decoration only */ }
    return r;
  };

  // ---------- dice: pips instead of digits ----------
  function pipDice(root) {
    root.querySelectorAll(".die").forEach(function (d) {
      var v = (d.textContent || "").trim();
      if (/^[1-6]$/.test(v)) { if (d.getAttribute("data-v") !== v) d.setAttribute("data-v", v); d.setAttribute("aria-label", v); }
      else if (d.hasAttribute("data-v")) d.removeAttribute("data-v");
    });
  }
  function watchDice() {
    ["dice-panel", "engagement-panel"].forEach(function (id) {
      var el = $(id); if (!el || el.__pips) return;
      el.__pips = true;
      new MutationObserver(function () { pipDice(el); }).observe(el, { childList: true, subtree: true, characterData: true });
    });
  }

  window.addEventListener("load", function () {
    watchDice();
    if (UI.screen === "menu" || document.querySelector("#screen-menu.active")) { decorateTitle(); continueCard(); soundLabel(); startEmbers(); }
  });
  window.addEventListener('unitartready', function () {
    document.querySelectorAll('canvas.thumb').forEach(function(cv){var a=cv._unitArt;if(!a)return;var src=thumbFor(a.unit,a.width,a.height);var g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);g.drawImage(src,0,0,cv.width,cv.height);});
  });
})();
