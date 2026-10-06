// The combat phase's controls: the engagement panel ("Fight this engagement", the result and
// "Finish combat") and the dice sit at the bottom centre of the battlefield, the dice a little
// larger than before, and the camera keeps the fight itself in the clear space above them. Before
// the first engagement is fought, the panel also offers each commander's once-per-battle
// abilities that bear on the fighting (Inspire Valor, Warcry and the like).
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Renderer) return;
  var UI = SOVL.UI, G = SOVL.G, RP = SOVL.Renderer.prototype, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- the camera keeps the fight clear of the panels ----------
  // this.insetBottom: screen pixels at the bottom of the field taken by the panels
  RP.focusUnits = (function (prev) {
    return function (units, combat) {
      if (!combat || !this.insetBottom) return prev.apply(this, arguments);
      units = (units || []).filter(Boolean);
      if (!units.length) return;
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      units.forEach(function (u) {
        var r = Math.max(u.w, u.d) / 2;
        minX = Math.min(minX, u.x - r); maxX = Math.max(maxX, u.x + r); minY = Math.min(minY, u.y - r); maxY = Math.max(maxY, u.y + r);
      });
      this.resize();
      var top = 56, room = Math.max(120, this.ch - this.insetBottom - top - 12); // clear of the toggles above and the panels below
      var base = this.baseScale, zoom = G.clamp(Math.min(this.cw * 0.62 / ((maxX - minX + 4) * base), room * 0.9 / ((maxY - minY + 3) * base)), 1, 3);
      var scale = base * zoom, x = (minX + maxX) / 2, y = (minY + maxY) / 2;
      var panX = this.cw / 2 - ((this.cw - SOVL.TABLE.w * scale) / 2 + x * scale);
      var panY = top + room / 2 - ((this.ch - SOVL.TABLE.h * scale) / 2 + y * scale);
      this.flyTo(zoom, panX, panY, 650);
    };
  })(RP.focusUnits);

  // the engagement on screen: the one chosen, or being fought
  function fightUnits(b) {
    var ids = UI.combatChoice || UI.focusedGroup || [];
    return ids.map(function (id) { return b.unit(id); }).filter(Boolean);
  }
  function screenBox(r, units) {
    var box = null;
    units.forEach(function (u) {
      var s = r.toScreen(u._rx != null ? u._rx : u.x, u._ry != null ? u._ry : u.y), h = Math.max(u.w, u.d) / 2 * r.scale;
      var bb = { l: s.x - h, t: s.y - h, r: s.x + h, b: s.y + h };
      box = box ? { l: Math.min(box.l, bb.l), t: Math.min(box.t, bb.t), r: Math.max(box.r, bb.r), b: Math.max(box.b, bb.b) } : bb;
    });
    return box;
  }
  // stack the visible panels from the bottom of the field, then make sure the fight is above them
  var lastInset = 0, lastGroup = null;
  function layout() {
    var b = UI.battle, wrap = $("battle-canvas-wrap"), r = UI.renderer;
    if (!wrap || !r) return;
    var combat = !!b && b.phase === "combat" && UI.screen === "battle";
    wrap.classList.toggle("combat-desk", combat);
    var panel = $("engagement-panel"), dice = $("dice-panel");
    if (!combat) { if (dice) dice.style.bottom = ""; r.insetBottom = 0; lastInset = 0; lastGroup = null; return; }
    var gap = 12, y = 14, inset = 0;
    var panelOn = panel && !panel.hidden && panel.offsetHeight > 0, diceOn = dice && dice.classList.contains("on") && dice.offsetHeight > 0;
    if (panelOn) { panel.style.bottom = y + "px"; y += panel.offsetHeight + gap; }
    if (diceOn) { dice.style.bottom = y + "px"; y += dice.offsetHeight + gap; }
    inset = y > 14 ? y : 0;
    r.insetBottom = inset;
    var units = fightUnits(b); if (!units.length) return;
    var box = screenBox(r, units), group = units.map(function (u) { return u.uid; }).join(",");
    var blocked = box && (box.b > r.ch - inset - 6 || box.t < 50);
    // refocus when the fight would be covered, or the panels grew or shrank a lot
    if (!r.flight && blocked && (group !== lastGroup || Math.abs(inset - lastInset) > 24 || box.b > r.ch - inset + 4)) {
      r.focusUnits(units, true);
      lastGroup = group; lastInset = inset;
    }
  }
  UI.combatDeskLayout = layout;
  var frame = UI.frame;
  UI.frame = function () { try { layout(); } catch (e) { /* layout never blocks drawing */ } return frame.apply(UI, arguments); };

  // ---------- commander abilities before the first fight ----------
  function abilityBox(b) {
    var sides = UI.hotseat ? [0, 1] : [UI.playerSide], list = [];
    sides.forEach(function (s) { list = list.concat(b.combatAbilities ? b.combatAbilities(s) : []); });
    if (!list.length) return null;
    var box = el("div", "cd-abilities");
    box.appendChild(el("div", "cd-abhead", "Before the first fight, a commander may rouse the army"));
    var row = el("div", "cd-abrow");
    list.forEach(function (a) {
      var u = b.unit(a.uid), who = UI.hotseat ? b.names[u.side] + " · " : "";
      var btn = el("button", "cd-ability", "<b>" + esc(a.name) + "</b><span>" + esc(who + a.commander) + "</span>");
      btn.type = "button"; btn.title = a.desc;
      btn.onclick = function () {
        var res = b.useCombatAbility(a.uid, a.id);
        if (!res.ok) { UI.hint(res.reason); return; }
        UI.processEvents(); UI.updateHud();
        UI.hint(a.commander + " uses " + a.name + ": " + a.desc.replace(/^Once per battle: /, ""));
        if (UI.sound) UI.sound("select");
      };
      row.appendChild(btn);
    });
    box.appendChild(row);
    return box;
  }
  var renderCombatOrders = UI.renderCombatOrders;
  UI.renderCombatOrders = function () {
    var r = renderCombatOrders.apply(UI, arguments), b = UI.battle, panel = $("engagement-panel");
    try {
      if (b && panel && !panel.hidden && !UI.combatAnimating && !UI.combatReport && b.pendingCombats.length) {
        var ab = abilityBox(b);
        if (ab) { var kick = panel.querySelector(".engagement-kicker"); panel.insertBefore(ab, kick ? kick.nextSibling : panel.firstChild); }
      }
    } catch (e) { /* the fight goes on without the shortcut */ }
    return r;
  };
})();
