// Hot seat: two players share one screen. Custom battle setup offers "Second player" as the
// opponent; each player builds an army, then the game hands control back and forth. Each player
// deploys while the other's deployment stays hidden, and charges and activations alternate as
// the rules say. A banner announces whose move it is at each handover. The interface's notion
// of "your side" (UI.playerSide) simply follows whoever is to move, so every control works for
// both players. Colours stay fixed (the first player's army is always blue, the second's red),
// and the AI never acts. Dice for either side are rolled by whoever is at the screen.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, A = SOVL.Army, R = SOVL.R, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- setup: choose a second player instead of the computer ----------
  var showSetup = UI.showSetup;
  UI.showSetup = function (kind) {
    var r = showSetup.apply(UI, arguments);
    if (kind !== "skirmish") return r;
    var opts = $("setup-skirmish-opts"), enemy = $("setup-enemy"), aggr = $("setup-aggr");
    var mode = $("setup-mode");
    if (!mode) {
      var lab = el("label", "hs-mode", 'Play against <select id="setup-mode"><option value="ai">Computer</option><option value="hotseat">Second player (hot seat)</option></select>');
      opts.insertBefore(lab, opts.firstChild);
      var names = el("div", "hs-names", '<label>Player 1 <input id="setup-p1" maxlength="24" value="Player 1"></label><label>Player 2 <input id="setup-p2" maxlength="24" value="Player 2"></label>');
      opts.appendChild(names);
      mode = $("setup-mode");
    }
    var enemyLabel = enemy.parentNode, aggrLabel = aggr.parentNode, namesBox = opts.querySelector(".hs-names");
    var sync = function () {
      var hs = mode.value === "hotseat";
      enemyLabel.firstChild.nodeValue = hs ? "Player 2 faction " : "Opponent ";
      aggrLabel.style.display = hs ? "none" : "";
      namesBox.style.display = hs ? "" : "none";
      $("setup-next").textContent = hs ? "Player 1: build your army" : "Next: build your army";
    };
    mode.onchange = sync; sync();
    var next = $("setup-next").onclick;
    $("setup-next").onclick = function () {
      if (mode.value !== "hotseat") return next.apply(this, arguments);
      var pts = parseInt($("setup-size").value, 10), f1 = UI.setup.faction;
      var f2 = enemy.value === "random" ? R.pick(Object.keys(SOVL.FACTION_DATA)) : enemy.value;
      var n1 = ($("setup-p1").value || "").trim() || "Player 1", n2 = ($("setup-p2").value || "").trim() || "Player 2";
      if (n1 === n2) n2 += " (2)";
      var army1 = UI.skirmishArmy && UI.skirmishArmy.faction === f1 ? UI.skirmishArmy : { faction: f1, name: n1, entries: [] };
      UI.showBuilder(army1, pts, function (a1) {
        UI.skirmishArmy = a1;
        var a2 = A.randomArmy({ faction: f2, pts: pts }); a2.name = n2;
        UI.showBuilder(a2, pts, function (fin2) {
          UI.startBattle({ armies: [a1, fin2], terrain: A.randomTerrain({}), scenario: $("setup-scenario").value, names: [n1, n2], hotseat: true, onEnd: function (b) { UI.showResult(b, { onDone: function () { UI.show("menu"); } }); } });
        });
        title("Player 2 · " + n2);
      });
      title("Player 1 · " + n1);
    };
    return r;
  };
  function title(who) { var t = $("builder-title"); if (t && t.textContent.indexOf(who) < 0) t.textContent = who + " — " + t.textContent; }

  // ---------- control follows whoever is to move ----------
  function setSide(s) { UI.playerSide = s; UI.aiSide = 1 - s; }
  function wantSide(b) {
    if (b.phase === "deploy") return b.hsReady && b.hsReady[0] ? 1 : 0;
    if (b.phase === "charge" || b.phase === "strategic") return b.active;
    return null;
  }
  var syncing = false;
  function sync() {
    var b = UI.battle; if (!UI.hotseat || !b || syncing) return;
    if (b.pendingRoll || UI.modalOpen || UI.combatAnimating || b.phase === "end") return;
    var want = wantSide(b);
    if (want == null || want === UI.playerSide) return;
    syncing = true;
    try {
      setSide(want);
      UI.sel = null; UI.inspect = null; UI.targets = []; UI.mode = "move"; UI.preview = null; UI.autoSel = null; UI.nextAfter = null;
      if (b.phase === "deploy") {
        // the second player deploys: their army starts in the auto-deployed line, ready to adjust
        if (b.unitsOf(want).some(function (u) { return !u.placed; })) b.autoDeploy(want);
        b.unitsOf(want).forEach(function (u) { u._rx = u.x; u._ry = u.y; u._ra = u.a; });
        UI.deployDone = false; var first = b.unitsOf(want)[0]; UI.deploySel = first ? first.uid : null;
        UI.renderDeployTray();
      }
      handover(b, want);
      UI.updateHud();
    } finally { syncing = false; }
  }
  UI.hotseatSync = sync;
  var PHASE = { deploy: "Deploy your army", charge: "Charge phase", strategic: "Manoeuvre" };
  function handover(b, side) {
    var wrap = $("battle-canvas-wrap"); if (!wrap) return;
    var old = wrap.querySelector(".hs-banner"); if (old) old.remove();
    var v = el("div", "hs-banner side-" + side, "<b>" + esc(b.names[side]) + "</b><small>" + esc((PHASE[b.phase] || "") + (b.phase === "deploy" ? "" : " · turn " + b.turn)) + " · your move</small>");
    v.setAttribute("role", "status");
    v.onclick = function () { v.remove(); };
    wrap.appendChild(v);
    setTimeout(function () { v.classList.add("out"); }, 1500);
    setTimeout(function () { if (v.parentNode) v.remove(); }, 2200);
    if (UI.sfx) UI.sfx.play("horn", { max: 1, vol: 0.6 });
  }
  // the deployment tray names whose army it is, and the first player hands over instead of starting
  var renderDeployTray = UI.renderDeployTray;
  UI.renderDeployTray = function () {
    var r = renderDeployTray.apply(UI, arguments), b = UI.battle, tray = $("deploy-tray");
    if (!UI.hotseat || !b || b.phase !== "deploy" || UI.deployDone || !tray) return r;
    var t = tray.querySelector(".md-title, h3"); if (t) t.textContent = b.names[UI.playerSide] + ": muster your army";
    var other = 1 - UI.playerSide, go = tray.querySelector("button.primary");
    if (go && !(b.hsReady && b.hsReady[other])) go.textContent = "Done: hand over to " + b.names[other];
    return r;
  };
  var updateHud = UI.updateHud;
  UI.updateHud = function () { var r = updateHud.apply(UI, arguments); if (UI.hotseat && !syncing) sync(); return r; };
  var pumpAI = UI.pumpAI;
  UI.pumpAI = function () { if (UI.hotseat) { sync(); var b = UI.battle; if (b && b.phase === "end") UI.onEnd(); return; } return pumpAI.apply(UI, arguments); };
  var closeModal = UI.closeModal;
  UI.closeModal = function () { var r = closeModal.apply(UI, arguments); if (UI.hotseat) setTimeout(sync, 0); return r; };
  // the first player finishing deployment hands over to the second; the battle starts after both.
  // (b.deployed only says a side has been auto-deployed; b.hsReady, saved with the battle, says
  // that player has finished)
  var beginBattle = UI.beginBattle;
  UI.beginBattle = function () {
    var b = UI.battle;
    if (!UI.hotseat || !b) return beginBattle.apply(UI, arguments);
    b.hsReady = b.hsReady || [false, false]; b.hsReady[UI.playerSide] = true;
    if (!b.hsReady[0] || !b.hsReady[1]) { UI.deploySel = null; sync(); return; }
    return beginBattle.apply(UI, arguments);
  };
  // each new battle starts from side 0; a resumed hot-seat battle picks up whoever is to move
  var startBattle = UI.startBattle;
  UI.startBattle = function (opts) {
    UI.hotseat = !!(opts && opts.hotseat); setSide(0);
    var r = startBattle.apply(UI, arguments), b = UI.battle;
    if (UI.hotseat && b && !b.hsReady) b.hsReady = [false, false];
    if (UI.hotseat && opts.restore) sync();
    return r;
  };
  // at the end, the result is told from the winner's side
  var onEnd = UI.onEnd;
  UI.onEnd = function () {
    var b = UI.battle;
    if (UI.hotseat && b && b.result && UI.endShown !== b) setSide(b.result.winner != null ? b.result.winner : 0);
    return onEnd.apply(UI, arguments);
  };
  var show = UI.show;
  UI.show = function (id) { if (id === "menu" || id === "campaign") { UI.hotseat = false; setSide(0); } return show.apply(UI, arguments); };
  // the table keeps each army's colours, whoever is at the screen
  var P = SOVL.Renderer && SOVL.Renderer.prototype;
  if (P) {
    var draw = P.draw;
    P.draw = function (b, st) {
      if (!UI.hotseat || !st || st.playerSide === 0) return draw.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments); args[1] = Object.assign({}, st, { playerSide: 0 });
      return draw.apply(this, args);
    };
  }
})();
