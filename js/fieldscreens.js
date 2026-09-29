// Deployment and battle-result screens. Deployment gets a muster dock (scenario, points odds,
// a placement checklist of painted regiment cards with formation and facing controls, and what
// the scouts report of the enemy) and a marked-out table (zone labels, the gap between the
// armies). The battle's end is announced on the field, then shown as a result screen: a
// verdict banner, the score, the cost to each side and both armies' rolls of honour.
// Presentation only: every control calls the same engine functions as before.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, G = SOVL.G, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function thumb(u, W, H) { try { return SOVL.Thumbs.canvas(SOVL.Thumbs.unit(u, W, H)); } catch (e) { return el("span", "thumb"); } }
  function scen(b) { return SOVL.SCENARIOS.filter(function (s) { return s.id === b.scenario; })[0] || { name: "Battle", desc: "" }; }
  function factionIndex(fid) { return Math.max(0, Object.keys(SOVL.FACTION_DATA).indexOf(fid)); }
  function factionOf(b, side) { var u = b.units.concat(b.dead).filter(function (x) { return x.side === side; })[0]; return u ? u.faction : null; }
  function value(u) { return (u.cost || 0) + (u.commander ? u.commander.costPts || 0 : 0); }
  function calm() { return (UI.settings && UI.settings.motion === false) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  var ICON = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    laurel: '<svg viewBox="0 0 60 100" fill="currentColor"><path d="M50 96C22 84 10 60 12 30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="16" cy="28" rx="5" ry="11" transform="rotate(-18 16 28)"/><ellipse cx="7" cy="40" rx="4.5" ry="10" transform="rotate(-60 7 40)"/><ellipse cx="22" cy="44" rx="5" ry="11" transform="rotate(-8 22 44)"/><ellipse cx="10" cy="56" rx="4.5" ry="10" transform="rotate(-68 10 56)"/><ellipse cx="28" cy="60" rx="5" ry="11" transform="rotate(4 28 60)"/><ellipse cx="18" cy="72" rx="4.5" ry="10" transform="rotate(-74 18 72)"/><ellipse cx="37" cy="74" rx="5" ry="10" transform="rotate(20 37 74)"/><ellipse cx="30" cy="85" rx="4.5" ry="9" transform="rotate(-80 30 85)"/></svg>'
  };

  // ---------- deployment dock ----------
  UI.renderDeployTray = function () {
    var b = UI.battle, tray = $("deploy-tray");
    if (b.phase !== "deploy" || UI.deployDone) { tray.style.display = "none"; $("battle-log").style.display = ""; return; }
    var scroll = tray.querySelector(".md-list") ? tray.querySelector(".md-list").scrollTop : 0;
    tray.style.display = ""; $("battle-log").style.display = "none"; tray.innerHTML = "";
    tray.className = "muster-dock";
    var side = UI.playerSide, foe = 1 - side, sc = scen(b), mine = b.unitsOf(side), theirs = b.unitsOf(foe);
    var vMine = mine.reduce(function (s, u) { return s + value(u); }, 0), vTheirs = theirs.reduce(function (s, u) { return s + value(u); }, 0);
    var placed = mine.filter(function (u) { return u.placed; }).length;

    var head = el("div", "md-head");
    head.appendChild(el("div", "md-eyebrow", "Deployment · " + esc(sc.name)));
    head.appendChild(el("div", "md-title", "Muster your army"));
    head.appendChild(el("p", "md-scen", esc(sc.desc)));
    head.appendChild(el("div", "md-facts", "<span>" + b.maxTurns + " turns</span><span>Zone " + (b.deployDepth || 12) + '" deep</span><span>' + (SOVL.TABLE.h - 2 * (b.deployDepth || 12)) + '" between the armies</span>'));
    tray.appendChild(head);

    var share = Math.round(100 * vMine / Math.max(1, vMine + vTheirs));
    tray.appendChild(el("div", "odds md-odds", '<span class="mine">' + vMine + '</span><span class="odds-bar"><i style="width:' + share + '%"></i></span><span class="theirs">' + vTheirs + "</span>"));
    tray.appendChild(el("div", "md-oddlabel", "<span>" + esc(b.names[side]) + "</span><span>points</span><span>" + esc(b.names[foe]) + "</span>"));

    var prog = el("div", "md-progress" + (placed === mine.length ? " done" : ""), "<b>" + placed + " of " + mine.length + "</b> regiments in position<i><em style=\"width:" + Math.round(100 * placed / Math.max(1, mine.length)) + '%"></em></i>');
    tray.appendChild(prog);

    var list = el("div", "md-list");
    mine.forEach(function (u) {
      var single = SOVL.isSingle(u.type), on = UI.deploySel === u.uid;
      var card = el("div", "tray-unit" + (on ? " on" : "") + (u.placed ? " placed" : ""));
      card.setAttribute("role", "button"); card.tabIndex = 0;
      card.setAttribute("aria-pressed", on ? "true" : "false");
      card.appendChild(thumb(u, 40, 46));
      var ranks = single ? 1 : Math.max(1, SOVL.ranks(u));
      var meta = single ? esc(u.type) : u.models + " models · " + u.files + " wide × " + ranks + " deep";
      var body = el("div", "md-body", "<b>" + esc(u.name) + (u.commander && u.commander.alive ? ' <span class="md-star" title="Commander">★</span>' : "") + '</b><span class="md-meta">' + meta + "</span>");
      card.appendChild(body);
      card.appendChild(el("span", "md-state", u.placed ? ICON.check + "<span>Placed</span>" : "<span>Place</span>"));
      card.onclick = function () { UI.deploySel = u.uid; UI.renderDeployTray(); };
      card.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.onclick(); } };
      if (on) {
        var ctl = el("div", "md-controls");
        if (!single) {
          var form = el("div", "md-form", '<span class="md-lbl">Frontage</span>');
          var narrow = el("button", "small md-step", "−"), widen = el("button", "small md-step", "+");
          narrow.setAttribute("aria-label", "Narrower"); widen.setAttribute("aria-label", "Wider");
          narrow.title = "Narrower (fewer files)"; widen.title = "Wider (more files)";
          narrow.disabled = u.files <= 1; widen.disabled = u.files >= u.models;
          narrow.onclick = function (e) { e.stopPropagation(); b.setFiles(u.uid, u.files - 1); if (u.placed && !b.placementValid(u, u, [])) u.placed = false; UI.renderDeployTray(); };
          widen.onclick = function (e) { e.stopPropagation(); b.setFiles(u.uid, u.files + 1); if (u.placed && !b.placementValid(u, u, [])) u.placed = false; UI.renderDeployTray(); };
          form.appendChild(narrow); form.appendChild(el("span", "md-files", u.files + " wide")); form.appendChild(widen);
          ctl.appendChild(form);
        }
        var face = el("div", "md-face", '<span class="md-lbl">Facing</span>');
        var rotL = el("button", "small md-rot", ICON.left + "<kbd>Q</kbd>"), rotR = el("button", "small md-rot", ICON.right + "<kbd>E</kbd>");
        rotL.setAttribute("aria-label", "Turn left (Q)"); rotR.setAttribute("aria-label", "Turn right (E)");
        rotL.onclick = function (e) { e.stopPropagation(); UI.rotateDeploy(u, -1); }; rotR.onclick = function (e) { e.stopPropagation(); UI.rotateDeploy(u, 1); };
        face.appendChild(rotL); face.appendChild(rotR); ctl.appendChild(face);
        ctl.appendChild(el("p", "md-tip", u.placed ? "Drag it on the table to move it." : "Click inside the blue zone to place it."));
        card.appendChild(ctl);
      }
      list.appendChild(card);
    });
    tray.appendChild(list);

    // what the scouts report: the enemy's regiments, though not yet where they will stand
    var scout = el("details", "md-scout");
    if (UI.scoutOpen !== false && window.innerWidth > 760) scout.open = true;
    scout.addEventListener("toggle", function () { UI.scoutOpen = scout.open; });
    var fi = factionIndex(factionOf(b, foe));
    scout.appendChild(el("summary", null, '<span class="md-crest" style="background-position:' + fi * 25 + '% 18%"></span><span><b>' + esc(b.names[foe]) + "</b><small>" + ICON.eye + " Scouts report " + theirs.length + " regiments</small></span>"));
    var sl = el("div", "md-scout-list");
    theirs.forEach(function (u) {
      var row = el("div", "md-scout-row");
      row.appendChild(thumb(u, 28, 32));
      row.appendChild(el("span", null, esc(u.name) + (u.commander ? ' <span class="md-star">★</span>' : "")));
      row.appendChild(el("em", null, SOVL.isSingle(u.type) ? esc(u.type) : u.models + ""));
      sl.appendChild(row);
    });
    scout.appendChild(sl);
    tray.appendChild(scout);

    var act = el("div", "md-actions");
    var auto = el("button", null, "Auto-deploy");
    auto.onclick = function () { b.unitsOf(UI.playerSide).forEach(function (u) { u.placed = false; u.x = -1000; u.y = -1000; }); b.autoDeploy(UI.playerSide); b.units.forEach(function (u) { if (u.side === UI.playerSide) { u._rx = u.x; u._ry = u.y; u._ra = u.a; } }); UI.renderDeployTray(); };
    var go = el("button", "primary", "Begin Battle"); go.disabled = !b.allPlaced(UI.playerSide);
    go.onclick = function () { UI.beginBattle(); };
    act.appendChild(auto); act.appendChild(go);
    if (go.disabled) act.appendChild(el("p", "md-wait", (mine.length - placed) + " regiment" + (mine.length - placed === 1 ? "" : "s") + " still to place."));
    tray.appendChild(act);
    var newList = tray.querySelector(".md-list"); if (newList) newList.scrollTop = scroll;
    UI.updateHud();
  };

  // ---------- the table during deployment: marked-out zones ----------
  var P = SOVL.Renderer.prototype, overlays = P.drawTacticalOverlays;
  P.drawTacticalOverlays = function (b, st) {
    if (overlays) overlays.apply(this, arguments);
    if (!b || b.phase !== "deploy") return;
    var ctx = this.ctx, TW = SOVL.TABLE.w, px = 1 / (this.scale || 10);
    ctx.save();
    for (var s = 0; s < 2; s++) {
      var z = b.deployZone(s), mine = s === st.playerSide, top = b.sides[s] === "top", edge = top ? z.y + z.h : z.y;
      var col = mine ? "143,195,240" : "240,140,128";
      // a glowing front line with a tick every 6"
      var g = ctx.createLinearGradient(0, edge - (top ? 2.5 : -2.5), 0, edge);
      g.addColorStop(0, "rgba(" + col + ",0)"); g.addColorStop(1, "rgba(" + col + "," + (mine ? 0.16 : 0.09) + ")");
      ctx.fillStyle = g; ctx.fillRect(z.x, top ? edge - 2.5 : edge, z.w, 2.5);
      ctx.strokeStyle = "rgba(" + col + "," + (mine ? 0.85 : 0.5) + ")"; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.moveTo(z.x, edge); ctx.lineTo(z.x + z.w, edge); ctx.stroke();
      ctx.lineWidth = 1.5 * px;
      for (var x = 6; x < TW; x += 6) { ctx.beginPath(); ctx.moveTo(x, edge); ctx.lineTo(x, edge + (top ? -0.6 : 0.6)); ctx.stroke(); }
      // the zone's name, set into the ground
      var fs = Math.max(0.9, Math.min(1.6, 15 * px));
      ctx.font = "600 " + fs.toFixed(2) + 'px "Cinzel", Georgia, serif'; ctx.textAlign = "right"; ctx.textBaseline = top ? "bottom" : "top";
      ctx.fillStyle = "rgba(" + col + "," + (mine ? 0.75 : 0.5) + ")";
      var label = mine ? "Your deployment zone" : b.names[s] + " — deployment";
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = (fs * 0.12).toFixed(2) + "px";
      ctx.fillText(label.toUpperCase(), z.x + z.w - 1.2, top ? edge - 0.5 : edge + 0.5);
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
    }
    // the gap between the armies, measured at the left edge
    var z0 = b.deployZone(0), z1 = b.deployZone(1), y0 = Math.min(z0.y + z0.h, z1.y + z1.h), y1 = Math.max(z0.y, z1.y);
    if (y1 > y0 + 2) {
      var mx = 2.2;
      ctx.strokeStyle = "rgba(240,225,190,0.55)"; ctx.fillStyle = "rgba(240,225,190,0.7)"; ctx.lineWidth = 1.3 * px;
      ctx.setLineDash([4 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(mx, y0 + 0.4); ctx.lineTo(mx, y1 - 0.4); ctx.stroke(); ctx.setLineDash([]);
      [[y0, 1], [y1, -1]].forEach(function (a) { ctx.beginPath(); ctx.moveTo(mx, a[0]); ctx.lineTo(mx - 0.35, a[0] + 0.6 * a[1]); ctx.lineTo(mx + 0.35, a[0] + 0.6 * a[1]); ctx.closePath(); ctx.fill(); });
      var fs2 = Math.max(0.8, Math.min(1.3, 13 * px));
      ctx.font = "600 " + fs2.toFixed(2) + 'px "Cinzel", Georgia, serif'; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(Math.round(y1 - y0) + '"', mx + 0.6, (y0 + y1) / 2);
    }
    ctx.restore();
  };

  // ---------- the verdict on the field ----------
  var onEnd = UI.onEnd;
  UI.onEnd = function () {
    var b = UI.battle, first = b && UI.endShown !== b;
    onEnd.apply(UI, arguments);
    if (!first || !b || !b.result) return;
    var wrap = $("battle-canvas-wrap"); if (!wrap) return;
    var old = wrap.querySelector(".field-verdict"); if (old) old.remove();
    var r = b.result, won = r.winner === UI.playerSide, kind = r.winner == null ? "draw" : won ? "win" : "loss";
    var v = el("div", "field-verdict " + kind + (calm() ? " calm" : ""), "<b>" + (kind === "draw" ? "Draw" : won ? "Victory" : "Defeat") + "</b><small>" + esc(r.winner == null ? "Neither army carries the field" : b.names[r.winner] + " holds the field") + "</small>");
    v.setAttribute("aria-hidden", "true");
    wrap.appendChild(v);
    setTimeout(function () { v.classList.add("out"); }, 1700);
    setTimeout(function () { v.remove(); }, 2600);
  };

  // ---------- result screen ----------
  function statusOf(u) {
    if (u.removed) {
      if (u.removedHow === "fled") return ["Fled the field", "warn"];
      return [u.removedHow ? u.removedHow.charAt(0).toUpperCase() + u.removedHow.slice(1) : "Destroyed", "bad"];
    }
    if (u.fleeing) return ["Routing", "warn"];
    if (SOVL.commanderOnly(u)) return ["Standing", "good"];
    if (SOVL.isSingle(u.type)) return ["Standing", "good"];
    if (u.models >= u.maxModels) return ["Unscathed", "good"];
    if (u.models < u.maxModels / 2) return ["Battered", "warn"];
    return ["Holding", "good"];
  }
  function strength(u) {
    if (u.removed && u.removedHow !== "fled") return 0;
    if (SOVL.commanderOnly(u)) return (u.commander.maxWounds - u.commander.wounds) / Math.max(1, u.commander.maxWounds);
    if (SOVL.isSingle(u.type)) return u.removed ? 0 : 1;
    return Math.max(0, u.models) / Math.max(1, u.maxModels);
  }
  function losses(b, side) {
    var all = b.units.concat(b.dead).filter(function (u) { return u.side === side; }), slain = 0, broken = 0, lords = 0, lost = 0;
    all.forEach(function (u) {
      if (SOVL.isSingle(u.type) && !SOVL.commanderOnly(u)) { if (u.removed && u.removedHow !== "fled") slain++; }
      else if (!SOVL.commanderOnly(u)) slain += Math.max(0, u.maxModels - Math.max(0, u.models));
      if (u.removed || u.fleeing) broken++;
      if (u.commander && !u.commander.alive) lords++;
      if (u.removed || u.fleeing) lost += value(u);
    });
    return { slain: slain, broken: broken, total: all.length, lords: lords, lost: lost, units: all };
  }
  function countUp(node, to, dur) {
    if (calm() || !to) { node.textContent = to; return; }
    var t0 = performance.now();
    (function step(t) { var q = Math.min(1, (t - t0) / dur); node.textContent = Math.round(to * (1 - Math.pow(1 - q, 3))); if (q < 1) requestAnimationFrame(step); })(t0);
  }
  UI.showResult = function (b, opts) {
    opts = opts || {};
    var res = b.result, me = UI.playerSide, foe = 1 - me, won = res.winner === me, kind = res.winner == null ? "draw" : won ? "win" : "loss";
    var ratio = b.scoreMode === "ratio", sc = scen(b), box = el("div", "res");
    var why = res.why === "turns" ? "The battle ran its " + b.maxTurns + " turns and was decided on points."
      : res.why === "mutual" ? "Both armies broke and fled the field."
      : res.why === "rout" + foe ? esc(b.names[foe]) + " is destroyed or driven from the field."
      : esc(b.names[me]) + " is destroyed or driven from the field.";

    var hero = el("div", "res-hero " + kind);
    hero.appendChild(el("div", "res-eyebrow", "Battle Over · " + esc(sc.name) + " · Turn " + (res.turn || b.turn)));
    hero.appendChild(el("div", "res-verdict", '<span class="laurel l">' + ICON.laurel + '</span><span class="res-word">' + (kind === "draw" ? "Draw" : won ? "Victory" : "Defeat") + '</span><span class="laurel r">' + ICON.laurel + "</span>"));
    hero.appendChild(el("div", "res-why", why));
    box.appendChild(hero);

    // the score
    var score = el("div", "res-score");
    [me, foe].forEach(function (s, i) {
      var fi = factionIndex(factionOf(b, s));
      var side = el("div", "res-side " + (i ? "theirs" : "mine") + (res.winner === s ? " winner" : ""));
      side.appendChild(el("span", "res-crest", ""));
      side.lastChild.style.backgroundPosition = fi * 25 + "% 18%";
      var num = el("b", "res-num", "0");
      var txt = el("div", "res-sidetext", "<span>" + esc(b.names[s]) + "</span>");
      txt.appendChild(num);
      txt.appendChild(el("small", null, ratio ? res.pct[s] + "% of the enemy army" : "victory points"));
      side.appendChild(txt);
      score.appendChild(side);
      setTimeout(function () { countUp(num, res.score[s], 900); }, 350);
      if (!i) score.appendChild(el("div", "res-vs", "vs"));
    });
    box.appendChild(score);
    var a = ratio ? Math.max(0, res.pct[me]) : res.score[me], c = ratio ? Math.max(0, res.pct[foe]) : res.score[foe];
    var bar = el("div", "odds-bar res-bar"), fill = el("i"); bar.appendChild(fill); box.appendChild(bar);
    var share = a + c > 0 ? (100 * a / (a + c)) : 50;
    if (calm()) fill.style.width = share + "%"; else { fill.style.width = "50%"; setTimeout(function () { fill.style.width = share + "%"; }, 400); }

    // the cost of the day
    var L = [losses(b, me), losses(b, foe)];
    var stats = el("div", "res-stats");
    [["Enemy slain", L[1].slain, "models"], ["Enemy broken", L[1].broken + " / " + L[1].total, "regiments"], ["Your losses", L[0].slain, "models"], ["Commanders slain", L[1].lords + " : " + L[0].lords, "theirs : yours"]].forEach(function (t, i) {
      stats.appendChild(el("div", "res-stat" + (i === 2 ? " cost" : ""), "<b>" + t[1] + "</b><span>" + t[0] + "</span><small>" + t[2] + "</small>"));
    });
    box.appendChild(stats);

    // both armies, regiment by regiment
    var cols = el("div", "res-cols");
    [me, foe].forEach(function (s, i) {
      var col = el("div", "res-col " + (i ? "theirs" : "mine"));
      col.appendChild(el("div", "res-colhead", "<b>" + esc(b.names[s]) + "</b><span>" + (L[i].total - L[i].broken) + " of " + L[i].total + " regiments stand</span>"));
      L[i].units.slice().sort(function (x, y) { return strength(y) - strength(x); }).forEach(function (u, k) {
        var st = statusOf(u), row = el("div", "res-unit " + st[1]);
        row.style.setProperty("--d", (k * 40) + "ms");
        row.appendChild(thumb(u, 30, 34));
        var mid = el("div", "res-umid", "<span>" + esc(u.name) + (u.commander && !u.commander.alive && !SOVL.commanderOnly(u) ? ' <em class="res-lord">★ commander slain</em>' : "") + "</span>");
        var sb = el("i", "res-ubar"), sf = el("em"); sf.style.width = Math.round(100 * strength(u)) + "%"; sb.appendChild(sf); mid.appendChild(sb);
        row.appendChild(mid);
        var count = SOVL.isSingle(u.type) || SOVL.commanderOnly(u) ? "" : Math.max(0, u.removed && u.removedHow !== "fled" ? 0 : u.models) + "/" + u.maxModels;
        row.appendChild(el("span", "res-ustate", "<b>" + st[0] + "</b>" + (count ? "<small>" + count + "</small>" : "")));
        col.appendChild(row);
      });
      cols.appendChild(col);
    });
    box.appendChild(cols);

    if (opts.extra) {
      var spoils = el("div", "res-spoils " + kind);
      spoils.appendChild(el("div", "res-spoilhead", won ? "Spoils of war" : kind === "draw" ? "The day's reckoning" : "The reckoning"));
      opts.extra.classList.add("res-spoiltext"); spoils.appendChild(opts.extra);
      box.appendChild(spoils);
    }
    var foot = el("div", "res-foot");
    var ok = el("button", "primary", esc(opts.label || "Continue")); ok.onclick = function () { UI.closeModal(); if (opts.onDone) opts.onDone(); };
    foot.appendChild(ok); box.appendChild(foot);
    UI.modalDismissable = false; UI.modal(box);
    var body = $("modal-body"); if (body) { body.classList.add("m-result", "r-" + kind); body.classList.toggle("calm", !!calm()); body.scrollTop = 0; }
    ok.focus();
  };
  var modal = UI.modal;
  UI.modal = function () { var body = $("modal-body"); if (body) body.classList.remove("m-result", "r-win", "r-loss", "r-draw", "calm"); return modal.apply(UI, arguments); };
})();
