// Game-facing presentation and orders. The battle engine remains authoritative.
"use strict";
(function () {
  var UI = SOVL.UI,
    A = SOVL.Army,
    R = SOVL.R,
    G = SOVL.G;
  var $ = function (id) {
    return document.getElementById(id);
  };
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function elem(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function button(label, fn, cls) {
    var e = elem("button", cls, label);
    e.type = "button";
    e.onclick = fn;
    return e;
  }
  function portrait(fid, cls) {
    var e = elem("div", cls || "mini-portrait");
    e.style.backgroundPosition = SOVL.factionIndex(fid) * 25 + "% 18%";
    e.setAttribute("aria-hidden", "true");
    return e;
  }
  function safelyRead(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }
  var showHint = UI.hint;
  UI.hint = function (text) {
    UI.lastHint = {
      text: text,
      time: performance.now(),
      phase: UI.battle && UI.battle.phase,
    };
    showHint(text);
  };
  var stored = safelyRead("sovl-experience-settings") || {};
  UI.settings = {
    sound: stored.sound === true,
    motion: stored.motion !== false,
    labels: stored.labels !== false,
    pace:
      ["normal", "fast", "deliberate"].indexOf(stored.pace) >= 0
        ? stored.pace
        : "normal",
  };
  var mediaReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (mediaReduced && stored.motion == null) UI.settings.motion = false;
  UI.applySettings = function () {
    UI.aiDelay = { normal: 550, fast: 180, deliberate: 950 }[UI.settings.pace];
    document.body.classList.toggle("reduce-motion", !UI.settings.motion);
    if (UI.renderer) {
      UI.renderer.reduceMotion = !UI.settings.motion;
      UI.renderer.showLabels = UI.settings.labels;
    }
    try {
      localStorage.setItem(
        "sovl-experience-settings",
        JSON.stringify(UI.settings),
      );
    } catch (e) {
      /* Play remains available when storage is disabled. */
    }
  };

  // Short, quiet impact cues. Sound starts only after the player enables it.
  var audioContext = null,
    noise = null;
  UI.sound = function (kind) {
    if (!UI.settings.sound || document.hidden) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioContext) audioContext = new AC();
      if (audioContext.state === "suspended")
        audioContext.resume().catch(function () {});
      var t = audioContext.currentTime,
        impact = kind === "combat" || kind === "destroy",
        dur = impact ? 0.36 : kind === "shoot" ? 0.15 : 0.1;
      var gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(impact ? 0.12 : 0.05, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      gain.connect(audioContext.destination);
      var osc = audioContext.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(
        impact ? 125 : kind === "phase" ? 220 : 175,
        t,
      );
      osc.frequency.exponentialRampToValueAtTime(impact ? 45 : 85, t + dur);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur);
      if (impact || kind === "shoot") {
        if (!noise) {
          noise = audioContext.createBuffer(
            1,
            Math.floor(audioContext.sampleRate * 0.4),
            audioContext.sampleRate,
          );
          var data = noise.getChannelData(0);
          for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        var source = audioContext.createBufferSource(),
          filter = audioContext.createBiquadFilter();
        source.buffer = noise;
        filter.type = "lowpass";
        filter.frequency.value = kind === "shoot" ? 2200 : 1300;
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
        source.stop(t + dur);
      }
    } catch (e) {
      /* Audio availability never blocks an order. */
    }
  };
  UI.showSettings = function () {
    var box = elem("div");
    box.appendChild(elem("h2", null, "Battle settings"));
    function setting(label, choices, value, cb) {
      var row = elem("label", "setting", label),
        select = elem("select");
      choices.forEach(function (c) {
        select.appendChild(new Option(c[1], c[0]));
      });
      select.value = value;
      select.onchange = function () {
        cb(select.value);
        UI.applySettings();
      };
      row.appendChild(select);
      box.appendChild(row);
    }
    setting(
      "Battle sounds",
      [
        ["off", "Off"],
        ["on", "On"],
      ],
      UI.settings.sound ? "on" : "off",
      function (v) {
        UI.settings.sound = v === "on";
        UI.sound("select");
      },
    );
    setting(
      "Enemy action speed",
      [
        ["deliberate", "Deliberate"],
        ["normal", "Normal"],
        ["fast", "Fast"],
      ],
      UI.settings.pace,
      function (v) {
        UI.settings.pace = v;
      },
    );
    setting(
      "Motion and effects",
      [
        ["on", "On"],
        ["off", "Reduced"],
      ],
      UI.settings.motion ? "on" : "off",
      function (v) {
        UI.settings.motion = v === "on";
      },
    );
    setting(
      "Regiment labels",
      [
        ["on", "Always visible"],
        ["off", "Selected units"],
      ],
      UI.settings.labels ? "on" : "off",
      function (v) {
        UI.settings.labels = v === "on";
      },
    );
    var actions = elem("div", "choices");
    actions.appendChild(button("Done", UI.closeModal, "primary"));
    box.appendChild(actions);
    UI.modalDismissable = true;
    UI.modal(box);
  };
  UI.showGuide = function () {
    var box = elem("div");
    box.appendChild(elem("h2", null, "Your first battle"));
    [
      [
        "01",
        "Deploy your line",
        "Your army is already placed in the blue zone. Drag regiments to reposition them, or begin immediately.",
      ],
      [
        "02",
        "Declare charges",
        "Select a blue regiment, then an enemy in the gold arc. A flank or rear attack reduces the attacks coming back at you. Pass when you have no more charges.",
      ],
      [
        "03",
        "Move and shoot",
        "Select a ready regiment. Point at the ground to preview its route and movement cost, then click to move. Use Shoot or a spell, and end the activation. Your opponent acts next.",
      ],
      [
        "04",
        "Fight on the field",
        "Click an engagement and choose Fight this engagement. Watch casualties and morale resolve, then select the next fight. Wounds are rolled simultaneously within each engagement.",
      ],
    ].forEach(function (s) {
      box.appendChild(
        elem(
          "div",
          "guide-step",
          "<span>" +
            s[0] +
            "</span><div><b>" +
            s[1] +
            "</b><p>" +
            s[2] +
            "</p></div>",
        ),
      );
    });
    box.appendChild(
      elem(
        "p",
        "notice",
        "Blue edges mark your troops. Red edges mark enemies. The number beside a regiment is its surviving models. Click any card in the bottom strip to find that regiment.",
      ),
    );
    var actions = elem("div", "choices");
    actions.appendChild(
      button("Return to the field", UI.closeModal, "primary"),
    );
    box.appendChild(actions);
    UI.modalDismissable = true;
    UI.modal(box);
  };

  UI.quickBattle = function () {
    UI.campaign = null;
    var fid = "empires_of_men";
    var army = {
      faction: fid,
      name: "The Border Guard",
      entries: [
        A.defaultCommander(
          fid,
          "captain",
          "imperial_sword",
          18,
          "Captain Aldric",
        ),
        A.defaultEntry(fid, "imperial_spear", 20),
        A.defaultEntry(fid, "imperial_archers", 15),
        A.defaultEntry(fid, "imperial_knights", 5),
      ],
    };
    R.setSeed(4826);
    var enemy = A.randomArmy({ faction: "greenskin_tribes", pts: 500 });
    R.setSeed(null);
    UI.startBattle({
      armies: [army, enemy],
      terrain: [
        { kind: "forest", x: 8, y: 17, w: 9, h: 8, seed: 9 },
        { kind: "cliff", x: 48, y: 15, w: 7, h: 6, seed: 17 },
        { kind: "swamp", x: 44, y: 27, w: 6, h: 5, seed: 13 },
      ],
      scenario: "pitched",
      names: ["The Border Guard", "The Broken Tusk"],
      aggression: 0.5,
      quick: true,
      onEnd: function (b) {
        UI.showResult(b, {
          onDone: function () {
            UI.show("menu");
          },
        });
      },
    });
    UI.hint(
      "Your army is ready in the blue zone. Reposition it if you wish, then Begin Battle.",
    );
  };

  var show = UI.show;
  UI.show = function (id) {
    show.call(UI, id);
    if (id !== "battle") {
      $("tip").style.display = "none";
      UI.canvasTip = false;
    }
    if (id === "menu") UI.sound("select");
  };
  var openModal = UI.modal,
    closeModal = UI.closeModal;
  UI.modal = function (html, opts) {
    if (!UI.modalOpen) UI.modalReturnFocus = document.activeElement;
    var box = openModal.call(UI, html, opts),
      title = box.querySelector("h2");
    if (title) {
      title.id = "dialog-title";
      box.setAttribute("aria-labelledby", "dialog-title");
    }
    var focus = box.querySelector(
      'button:not([disabled]),select,input,[tabindex="0"]',
    );
    if (focus) focus.focus();
    return box;
  };
  UI.closeModal = function () {
    closeModal.call(UI);
    if (UI.modalReturnFocus && UI.modalReturnFocus.isConnected)
      UI.modalReturnFocus.focus();
  };
  var startBattle = UI.startBattle;
  UI.startBattle = function (opts) {
    if (UI.combatTimer) clearTimeout(UI.combatTimer);
    if (UI.phaseTimer) clearTimeout(UI.phaseTimer);
    UI.combatAnimating = false;
    UI.combatReport = null;
    UI.combatChoice = null;
    UI.lastPhaseKey = null;
    UI.pendingEnd = false;
    UI.orderPivot = false;
    UI.lastHint = null;
    UI.lessons = { move: false, shoot: false, charge: false, combat: false };
    $("screen-battle").classList.remove("log-open");
    $("engagement-panel").hidden = true;
    startBattle.call(UI, opts);
    var b = UI.battle;
    b.autoDeploy(UI.playerSide);
    b.unitsOf(UI.playerSide).forEach(function (u) {
      u._rx = u.x;
      u._ry = u.y;
      u._ra = u.a;
    });
    UI.deploySel = b.unitsOf(UI.playerSide)[0].uid;
    UI.applySettings();
    UI.renderDeployTray();
    UI.updateHud();
  };
  var setup = UI.showSetup;
  UI.showSetup = function (kind) {
    setup.call(UI, kind);
    var fids = Object.keys(SOVL.FACTION_DATA);
    $("setup-factions")
      .querySelectorAll(".faction-card")
      .forEach(function (card, i) {
        var art = elem("div", "faction-art f" + i);
        card.insertBefore(art, card.firstChild);
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.setAttribute("aria-pressed", i === 0 ? "true" : "false");
        var click = card.onclick;
        card.onclick = function () {
          click();
          $("setup-factions")
            .querySelectorAll(".faction-card")
            .forEach(function (c) {
              c.setAttribute(
                "aria-pressed",
                c.classList.contains("on") ? "true" : "false",
              );
            });
        };
        card.onkeydown = function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            card.click();
          }
        };
      });
  };
  var unitInfo = UI.unitInfoPanel;
  UI.unitInfoPanel = function (u) {
    var box = unitInfo.call(UI, u),
      art = portrait(u.faction, "unit-portrait");
    art.appendChild(
      elem(
        "span",
        null,
        u.side === UI.playerSide ? "YOUR REGIMENT" : "ENEMY REGIMENT",
      ),
    );
    box.insertBefore(art, box.firstChild);
    return box;
  };
  var showBuilder = UI.showBuilder;
  UI.showBuilder = function (army, pts, onDone) {
    showBuilder.call(UI, army, pts, onDone);
    decorateBuilder();
  };
  function decorateBuilder() {
    if (!UI.builder) return;
    var fid = UI.builder.army.faction;
    $("builder-catalog")
      .querySelectorAll(".unit-card")
      .forEach(function (card) {
        if (card.querySelector(".unit-family")) return;
        var head = card.querySelector(".head"),
          wrap = elem("div", "unit-family");
        wrap.appendChild(portrait(fid));
        card.insertBefore(wrap, head);
        wrap.appendChild(head);
      });
  }
  // Builder controls redraw the catalogue; decorate only new cards, not every frame.
  var builderObserver = new MutationObserver(function () {
    decorateBuilder();
  });
  builderObserver.observe($("builder-catalog"), { childList: true });

  function unitStatus(b, u) {
    if (u.fleeing) return "Routing";
    if (b.phase === "deploy") return u.placed ? "Deployed" : "Place unit";
    if (b.isEngaged(u)) return "Engaged";
    if (b.phase === "strategic")
      return u.activated
        ? "Spent"
        : b.activeUnit === u.uid
          ? "Active"
          : "Ready";
    if (b.phase === "charge") return u.declaredCharge ? "Charging" : "Ready";
    return "Standing";
  }
  UI.renderRoster = function () {
    var b = UI.battle;
    if (!b) return;
    var box = $("battle-roster"),
      scroll = box.scrollLeft;
    box.innerHTML = "";
    var mine = b.unitsOf(UI.playerSide),
      ready = mine.filter(function (u) {
        return !u.activated && !u.fleeing;
      }).length;
    $("army-ready").textContent =
      b.phase === "strategic" ? ready + " ready" : mine.length + " regiments";
    mine.forEach(function (u) {
      var cls =
        "regiment" +
        ((UI.sel || UI.deploySel) === u.uid ? " selected" : "") +
        (u.activated && b.phase === "strategic" ? " spent" : "") +
        (u.fleeing ? " fleeing" : "");
      var btn = button(
        "",
        function () {
          UI.renderer.focusUnits([u], false);
          if (b.phase === "deploy") {
            UI.deploySel = u.uid;
            UI.renderDeployTray();
          } else if (b.phase === "combat") UI.selectEngagement(u.uid);
          else UI.canvasClick({ x: u.x, y: u.y }, {});
          UI.sound("select");
          UI.updateHud();
        },
        cls,
      );
      btn.setAttribute(
        "aria-label",
        u.name + ", " + unitStatus(b, u) + ", " + u.models + " models",
      );
      btn.setAttribute(
        "aria-pressed",
        (UI.sel || UI.deploySel) === u.uid ? "true" : "false",
      );
      btn.appendChild(portrait(u.faction));
      var ratio = SOVL.commanderOnly(u)
        ? (u.commander.maxWounds - u.commander.wounds) / u.commander.maxWounds
        : u.models / Math.max(1, u.maxModels);
      var count = SOVL.commanderOnly(u)
        ? Math.max(0, u.commander.maxWounds - u.commander.wounds) + " wounds"
        : u.models + "/" + u.maxModels + " models";
      btn.appendChild(
        elem(
          "div",
          "regiment-text",
          "<strong>" +
            esc(u.name) +
            "</strong><small>" +
            count +
            " · " +
            unitStatus(b, u) +
            '</small><div class="strength-bar"><i style="width:' +
            Math.max(0, ratio * 100) +
            '%"></i></div>',
        ),
      );
      box.appendChild(btn);
    });
    box.scrollLeft = scroll;
  };
  function phaseHint(b) {
    if (b.phase === "deploy")
      return "Drag regiments within the blue zone, or begin with this formation.";
    if (b.phase === "combat")
      return UI.combatReport
        ? "Read the outcome below, then continue to the next engagement."
        : "Select an engagement on the field, then order the fight.";
    if (b.phase === "end") return "The battle is over.";
    if (b.active !== UI.playerSide)
      return "Enemy activation. Watch their move; you can inspect any regiment.";
    if (b.phase === "charge")
      return UI.sel
        ? UI.targets.length
          ? "Click a gold-highlighted enemy to charge. Hover to compare the likely exchange."
          : "No charge in reach. Choose another regiment or pass to movement."
        : "Select a blue regiment to see its charge arc, or pass to movement.";
    if (UI.mode === "shoot" || UI.mode === "spell" || UI.mode === "ability")
      return "Click a highlighted target. Escape cancels the order.";
    if (b.activeUnit) {
      var u = b.unit(b.activeUnit);
      return u && u.fleeing
        ? "Try to rally this regiment."
        : "Point at the ground to preview a move. Click to " +
            (UI.orderPivot ? "pivot" : "advance") +
            ". End Activation when ready.";
    }
    return "Choose a ready regiment from the field or the army strip.";
  }
  var hud = UI.updateHud;
  UI.updateHud = function () {
    var b = UI.battle;
    if (!b) return;
    $("screen-battle").classList.toggle("is-deploy", b.phase === "deploy");
    $("dock-title").textContent =
      b.phase === "deploy" ? "Deployment" : "Battle chronicle";
    hud.call(UI);
    var phases = [
      ["deploy", "00", "Deploy"],
      ["charge", "01", "Charges"],
      ["strategic", "02", "Manoeuvre"],
      ["combat", "03", "Fight"],
    ];
    $("phase-track").innerHTML = phases
      .map(function (p) {
        return (
          '<div class="phase-step' +
          (b.phase === p[0] ? " current" : "") +
          '"' +
          (b.phase === p[0] ? ' aria-current="step"' : "") +
          "><b>" +
          p[1] +
          "</b>" +
          p[2] +
          "</div>"
        );
      })
      .join("");
    if (b.phase === "combat") {
      $("battle-who").textContent = "Choose the next engagement";
      $("battle-who").className = "who";
    }
    var selected = b.unit(UI.sel || UI.inspect || UI.deploySel),
      act = $("battle-actions");
    if (!selected) {
      var heading =
        b.phase === "deploy"
          ? "Form your line"
          : b.phase === "charge"
            ? "Choose your moment"
            : b.phase === "combat"
              ? "Steel meets steel"
              : "Issue your orders";
      $("battle-unitinfo").innerHTML =
        '<div class="selection-empty"><div class="eyebrow">COMMANDER’S FIELD NOTES</div><h3>' +
        heading +
        "</h3><p>" +
        esc(phaseHint(b)) +
        '</p><div class="guide-tip">' +
        (b.phase === "charge"
          ? "Protect your flanks. Turning an enemy before charging it can matter more than superior numbers."
          : "Use the army strip below to find a regiment. Blue fronts are yours; red fronts are the enemy.") +
        '</div><div class="terrain-key"><span>Forest · blocks sight</span><span>Swamp · slows movement</span><span>Rock · impassable</span></div></div>';
    }
    if (
      b.phase === "strategic" &&
      b.active === UI.playerSide &&
      b.activeUnit &&
      selected &&
      selected.uid === b.activeUnit &&
      !selected.fleeing
    ) {
      var row = elem("div", "order-buttons");
      row.appendChild(
        button(
          "Move",
          function () {
            UI.mode = "move";
            UI.orderPivot = false;
            UI.targets = [];
            UI.updateHud();
          },
          !UI.orderPivot && UI.mode === "move" ? "primary" : "",
        ),
      );
      row.appendChild(
        button(
          "Pivot",
          function () {
            UI.mode = "move";
            UI.orderPivot = true;
            UI.targets = [];
            UI.updateHud();
          },
          UI.orderPivot ? "primary" : "",
        ),
      );
      act.insertBefore(row, act.firstChild);
      var piv = elem("div", "order-buttons");
      piv.appendChild(
        button("↶ Left", function () {
          UI.pivotOrder(-1);
        }),
      );
      piv.appendChild(
        button("Right ↷", function () {
          UI.pivotOrder(1);
        }),
      );
      act.insertBefore(piv, row.nextSibling);
    }
    if (b.phase === "combat") UI.renderCombatOrders();
    if (b.phase !== "combat") $("engagement-panel").hidden = true;
    if (
      !UI.lastHint ||
      UI.lastHint.phase !== b.phase ||
      performance.now() - UI.lastHint.time > 3200
    )
      showHint(phaseHint(b));
    UI.renderRoster();
  };
  UI.pivotOrder = function (dir) {
    if (!UI.battle || !UI.sel) return;
    var ok = UI.battle.pivot(UI.sel, dir);
    UI.updateHud();
    if (!ok) UI.hint("Not enough movement or room to pivot.");
    else {
      UI.sound("move");
      UI.processEvents();
    }
  };

  var click = UI.canvasClick;
  UI.canvasClick = function (p, e) {
    if (UI.combatAnimating) return;
    var b = UI.battle;
    if (!b) return;
    var before = UI.sel;
    click.call(UI, p, { shiftKey: (e && e.shiftKey) || UI.orderPivot });
    if (before !== UI.sel) {
      UI.orderPivot = false;
      UI.sound("select");
    }
  };
  var bind = UI.bindCanvas;
  UI.bindCanvas = function () {
    bind.call(UI);
    var cv = $("battle-canvas");
    cv.addEventListener("mousemove", function (e) {
      var b = UI.battle;
      if (!b || UI.modalOpen) return;
      if (
        UI.orderPivot &&
        b.phase === "strategic" &&
        UI.sel &&
        b.activeUnit === UI.sel &&
        UI.mode === "move"
      )
        UI.preview = b.previewMove(
          UI.sel,
          UI.renderer.toWorld(e.offsetX, e.offsetY),
          true,
        );
      UI.updateForecast();
    });
    cv.addEventListener("mouseleave", function () {
      $("target-preview").style.display = "none";
    });
    // Touch input uses the same validated click path; no duplicate touch orders.
    cv.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") return;
      UI.touchStart = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "touch" || !UI.touchStart) return;
      var dx = e.clientX - UI.touchStart.x,
        dy = e.clientY - UI.touchStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) {
        UI.renderer.panX += dx;
        UI.renderer.panY += dy;
        UI.touchMoved = true;
        UI.touchStart = { x: e.clientX, y: e.clientY };
      }
    });
    cv.addEventListener("pointerup", function (e) {
      if (e.pointerType === "touch") UI.touchStart = null;
    });
    cv.addEventListener(
      "click",
      function (e) {
        if (UI.touchMoved) {
          UI.touchMoved = false;
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
  };
  UI.updateForecast = function () {
    var box = $("target-preview"),
      b = UI.battle,
      u = b && b.unit(UI.sel),
      t = b && b.unit(UI.hover);
    box.style.display = "none";
    if (
      !u ||
      !t ||
      u.side === t.side ||
      UI.modalOpen ||
      UI.combatAnimating ||
      b.phase === "deploy" ||
      b.phase === "combat"
    )
      return;
    var html = "<strong>" + esc(t.name) + "</strong>";
    if (b.phase === "charge") {
      var ci = b.chargeInfo(u, t);
      if (!ci.ok) {
        html += '<span class="danger">' + esc(ci.reason) + "</span>";
      } else {
        var dealt = UI.ai.expectedMelee(u, t, true, ci.side),
          taken = UI.ai.expectedRetaliation(u, t, ci.side),
          side =
            ci.side === "left" || ci.side === "right"
              ? "FLANK"
              : ci.side.toUpperCase();
        html +=
          '<span class="accent">' +
          side +
          " CHARGE · " +
          ci.dist.toFixed(1) +
          '″</span><div class="forecast-row"><div><small>Wounds dealt ≈</small><b>' +
          dealt.toFixed(1) +
          "</b></div><div><small>Wounds taken ≈</small><b>" +
          taken.toFixed(1) +
          "</b></div></div><small>Estimate before special effects. Dice decide the result.</small>";
      }
    } else if (UI.mode === "shoot") {
      var ri = b.rangedInfo(u, t, UI.shootCommander);
      if (!ri.ok) html += '<span class="danger">' + esc(ri.reason) + "</span>";
      else
        html +=
          '<span class="accent">' +
          esc((ri.weapon && ri.weapon.name) || u.ranged || "Ranged attack") +
          '</span><div class="forecast-row"><div><small>Hit roll</small><b>' +
          ri.target +
          "+</b></div><div><small>Distance</small><b>" +
          ri.dist.toFixed(1) +
          "″</b></div></div><small>" +
          esc(ri.notes.length ? ri.notes.join(" · ") : "Clear shot") +
          "</small>";
    } else return;
    box.innerHTML = html;
    box.style.display = "block";
    $("tip").style.display = "none";
  };

  var processEvents = UI.processEvents;
  UI.processEvents = function () {
    var b = UI.battle;
    if (!b) return;
    var events = b.events.slice();
    processEvents.call(UI);
    events.forEach(function (ev) {
      if (ev.type === "move") {
        UI.lessons = UI.lessons || {};
        UI.lessons.move = true;
        UI.sound("move");
      }
      if (ev.type === "shoot") {
        UI.sound("shoot");
        var t =
          b.unit(ev.to) ||
          b.dead.find(function (u) {
            return u.uid === ev.to;
          });
        if (t && ev.wounds) UI.renderer.addImpact(t.x, t.y, "#e8c397");
      }
      if (ev.type === "destroy") UI.sound("destroy");
      if (ev.type === "charge") UI.sound("combat");
      if (ev.type === "phase") {
        var key = ev.turn + ":" + ev.phase;
        if (UI.lastPhaseKey !== key) {
          UI.lastPhaseKey = key;
          UI.orderPivot = false;
          UI.preview = null;
          UI.lastHint = null;
          $("target-preview").style.display = "none";
          if (ev.phase === "combat") {
            UI.combatChoice = null;
            UI.combatReport = null;
          }
          if (
            UI.settings.motion &&
            ["charge", "strategic", "combat"].indexOf(ev.phase) >= 0
          ) {
            var banner = $("phase-banner");
            banner.classList.remove("show");
            banner.innerHTML =
              "<b>" +
              {
                charge: "Declare your charges",
                strategic: "Manoeuvre",
                combat: "The lines collide",
              }[ev.phase] +
              "</b><small>TURN " +
              ev.turn +
              "</small>";
            void banner.offsetWidth;
            banner.classList.add("show");
            if (UI.phaseTimer) clearTimeout(UI.phaseTimer);
            UI.phaseTimer = setTimeout(function () {
              banner.classList.remove("show");
            }, 2900);
          }
          UI.sound("phase");
        }
      }
    });
  };

  UI.selectEngagement = function (uid) {
    var b = UI.battle;
    if (!b || b.phase !== "combat" || UI.combatAnimating || UI.combatReport)
      return;
    var group = b.pendingCombats.find(function (g) {
      return g.indexOf(uid) >= 0;
    });
    if (!group) return;
    UI.combatChoice = group;
    UI.sel =
      group.find(function (id) {
        var u = b.unit(id);
        return u && u.side === UI.playerSide;
      }) || uid;
    UI.targets = group.slice();
    UI.renderer.focusUnits(
      group
        .map(function (id) {
          return b.unit(id);
        })
        .filter(Boolean),
      true,
    );
    UI.updateHud();
    UI.sound("select");
  };
  UI.renderCombatOrders = function () {
    var b = UI.battle,
      act = $("battle-actions"),
      panel = $("engagement-panel");
    act.innerHTML = "";
    panel.hidden = false;
    if (UI.combatReport) {
      UI.renderEngagementResult();
      return;
    }
    if (UI.combatAnimating) {
      panel.innerHTML =
        '<div class="engagement-kicker">Engagement resolving</div><h3>The lines collide</h3><p class="combat-instruction">Attacks, armour saves and morale…</p>';
      return;
    }
    if (!b.pendingCombats.length) {
      panel.innerHTML =
        '<div class="engagement-kicker">Combat complete</div><div class="engagement-head"><h3>The line holds. For now.</h3></div>';
      panel.appendChild(
        button("Continue to the next turn", UI.continueCombat, "primary"),
      );
      return;
    }
    if (
      !UI.combatChoice ||
      !b.pendingCombats.some(function (g) {
        return g === UI.combatChoice;
      })
    )
      UI.combatChoice = b.pendingCombats[0];
    act.appendChild(
      elem(
        "div",
        "combat-instruction",
        b.pendingCombats.length +
          " engagement" +
          (b.pendingCombats.length === 1 ? "" : "s") +
          " to fight. Choose the order.",
      ),
    );
    b.pendingCombats.forEach(function (group) {
      var names = group.map(function (id) {
        var u = b.unit(id);
        return u ? u.name : "Destroyed";
      });
      var choose = button(
        "<strong>" + esc(names.join(" / ")) + "</strong>",
        function () {
          UI.selectEngagement(group[0]);
        },
        "engagement-choice" + (UI.combatChoice === group ? " on" : ""),
      );
      act.appendChild(choose);
    });
    var units = UI.combatChoice
        .map(function (id) {
          return b.unit(id);
        })
        .filter(Boolean),
      ours = units.filter(function (u) {
        return u.side === UI.playerSide;
      }),
      theirs = units.filter(function (u) {
        return u.side !== UI.playerSide;
      });
    UI.targets = UI.combatChoice.slice();
    panel.innerHTML =
      '<div class="engagement-kicker">Combat phase · Turn ' +
      b.turn +
      '</div><div class="engagement-head"><h3>' +
      esc(
        ours
          .map(function (u) {
            return u.name;
          })
          .join(" + "),
      ) +
      '<br><span class="muted">vs ' +
      esc(
        theirs
          .map(function (u) {
            return u.name;
          })
          .join(" + "),
      ) +
      '</span></h3></div><p class="combat-instruction">Attacks within this engagement resolve simultaneously. The losing side must hold its nerve or flee.</p>';
    panel
      .querySelector(".engagement-head")
      .appendChild(
        button("Fight this engagement", UI.fightEngagement, "primary"),
      );
  };
  UI.fightEngagement = function () {
    var b = UI.battle;
    if (
      !b ||
      b.phase !== "combat" ||
      UI.combatAnimating ||
      UI.combatReport ||
      !UI.combatChoice
    )
      return;
    var chosen = UI.combatChoice.slice(),
      units = chosen
        .map(function (id) {
          return b.unit(id);
        })
        .filter(Boolean);
    UI.renderer.focusUnits(units, true);
    UI.combatAnimating = true;
    var res = b.resolveEngagement(chosen[0]);
    if (!res.ok) {
      UI.combatAnimating = false;
      UI.hint(res.reason);
      return;
    }
    UI.lessons.combat = true;
    units.forEach(function (u) {
      UI.renderer.addImpact(
        u.x,
        u.y,
        u.side === UI.playerSide ? "#f0d093" : "#dd9b81",
      );
    });
    if (res.report)
      res.report.rounds.forEach(function (rd) {
        var t =
          b.unit(rd.target) ||
          b.dead.find(function (u) {
            return u.uid === rd.target;
          });
        if (t && rd.wounds)
          UI.renderer.addFloater(t.x, t.y - 1, "−" + rd.wounds, "#ffb49f");
      });
    UI.sound("combat");
    UI.processEvents();
    UI.updateHud();
    UI.combatTimer = setTimeout(
      function () {
        if (UI.battle !== b) return;
        UI.combatAnimating = false;
        UI.combatReport = res.report;
        UI.combatChoice = null;
        UI.targets = [];
        if (!res.report) UI.continueCombat();
        else UI.updateHud();
      },
      UI.settings.motion ? 650 : 0,
    );
  };
  UI.renderEngagementResult = function () {
    var rep = UI.combatReport,
      b = UI.battle,
      box = $("engagement-panel");
    if (!rep) return;
    var dead = b.dead,
      all = b.units.concat(dead),
      loss = [0, 0];
    rep.rounds.forEach(function (rd) {
      var target = all.find(function (u) {
        return u.uid === rd.target;
      });
      if (target) loss[target.side] += rd.killed || 0;
    });
    var score = rep.score,
      headline =
        score[0] === score[1]
          ? "Neither side gives ground"
          : score[0] > score[1]
            ? "You win the exchange"
            : "The enemy wins the exchange";
    box.innerHTML =
      '<div class="engagement-kicker">Engagement resolved · Turn ' +
      rep.turn +
      '</div><div class="engagement-head"><h3>' +
      headline +
      '</h3></div><div class="clash-score"><div class="score-side"><strong>' +
      score[0] +
      '</strong>Your combat score</div><div class="vs">against</div><div class="score-side enemy"><strong>' +
      score[1] +
      '</strong>Enemy combat score</div></div><div class="combat-casualties"><span>Your losses: <b>' +
      loss[0] +
      "</b></span><span>Enemy losses: <b>" +
      loss[1] +
      "</b></span></div>";
    var out = elem("div", "engagement-summary");
    rep.breakTests.forEach(function (bt) {
      out.appendChild(
        elem(
          "p",
          null,
          esc(bt.name) +
            " " +
            (bt.reanimated
              ? "crumbles: " + (bt.crumble || 0) + " wounds."
              : bt.ok
                ? '<span class="ok">holds the line.</span>'
                : '<span class="danger">breaks' +
                  (bt.escaped ? " and leaves the field." : " and flees.") +
                  "</span>"),
        ),
      );
    });
    rep.rounds.forEach(function (rd) {
      if (rd.commanderKilled)
        out.appendChild(
          elem(
            "p",
            "danger",
            "The commander of " + esc(rd.targetName) + " is slain.",
          ),
        );
    });
    box.appendChild(out);
    var details = elem(
      "details",
      "combat-details",
      "<summary>Inspect dice and armour saves</summary>",
    );
    rep.rounds.forEach(function (rd) {
      var row = elem(
        "div",
        "atk",
        "<b>" +
          esc(rd.who) +
          "</b> → " +
          esc(rd.targetName) +
          "<br>" +
          rd.hits +
          " hits · " +
          rd.wounds +
          " wounds · " +
          rd.hitTarget +
          "+ to hit",
      );
      row.appendChild(diceRow(rd.hitDice, rd.hitTarget));
      if (rd.saveDice.length) {
        row.appendChild(
          elem("div", null, "Armour saves: " + rd.saveTarget + "+"),
        );
        row.appendChild(diceRow(rd.saveDice, rd.saveTarget, true));
      }
      details.appendChild(row);
    });
    rep.breakTests.forEach(function (bt) {
      details.appendChild(
        elem(
          "p",
          null,
          esc(bt.name) +
            ": morale " +
            (bt.dice && bt.dice.length ? bt.dice.join(" + ") : "automatic") +
            "; needs " +
            bt.value +
            " or less.",
        ),
      );
    });
    box.appendChild(details);
    box
      .querySelector(".engagement-head")
      .appendChild(
        button(
          b.pendingCombats.length ? "Next engagement" : "Finish combat",
          UI.continueCombat,
          "primary",
        ),
      );
    $("battle-actions").appendChild(
      elem(
        "p",
        "combat-instruction",
        b.pendingCombats.length
          ? b.pendingCombats.length +
              " engagement" +
              (b.pendingCombats.length === 1 ? " remains." : "s remain.")
          : "All engagements have fought. Finish combat to score objectives and begin the next turn.",
      ),
    );
  };
  function diceRow(dice, target, saves) {
    var row = elem("div", "dice");
    (dice || []).forEach(function (d) {
      row.appendChild(
        elem(
          "span",
          "die " +
            (d >= target ? (saves ? "save" : "hit") : saves ? "fail" : "miss"),
          String(d),
        ),
      );
    });
    return row;
  }
  UI.continueCombat = function () {
    var b = UI.battle;
    if (!b || b.phase !== "combat" || UI.combatAnimating) return;
    // Do not allow a pending fight to be skipped; this only acknowledges a result.
    UI.combatReport = null;
    UI.combatChoice = null;
    UI.sel = null;
    UI.inspect = null;
    UI.targets = [];
    if (b.pendingCombats.length) {
      UI.selectEngagement(b.pendingCombats[0][0]);
      return;
    }
    $("engagement-panel").hidden = true;
    UI.renderer.zoom = 1;
    UI.renderer.panX = 0;
    UI.renderer.panY = 0;
    b.finishCombatPhase();
    UI.afterPlayerAction();
  };

  var renderCampaign = UI.renderCampaign;
  UI.renderCampaign = function () {
    renderCampaign.call(UI);
    var c = UI.campaign,
      act = SOVL.Campaign.currentAct(c),
      map = $("camp-map");
    var heading = elem(
      "div",
      "campaign-heading",
      '<div class="eyebrow">THE TRAIL OF DEATH</div><h3>' +
        esc(act.name) +
        "</h3><p>Choose a glowing destination. Gold and survivors carry into the next battle.</p>",
    );
    map.insertBefore(heading, map.firstChild);
    map.querySelectorAll(".node.avail").forEach(function (node) {
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", "Travel to " + node.textContent);
      node.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          node.onclick();
        }
      };
    });
    map.scrollTop = map.scrollHeight;
  };
  var showResult = UI.showResult;
  UI.showResult = function (b, opts) {
    showResult.call(UI, b, opts);
    $("modal-body").insertBefore(
      elem("div", "result-art"),
      $("modal-body").firstChild,
    );
  };
  var campaignBattle = UI.campaignBattle;
  UI.campaignBattle = function (node, kind) {
    campaignBattle.call(UI, node, kind);
    if (UI.modalOpen) {
      var art = elem("div", "result-art");
      $("modal-body").insertBefore(art, $("modal-body").firstChild);
    }
  };

  window.addEventListener("keydown", function (e) {
    if (UI.modalOpen) {
      if (e.key === "Escape" && UI.modalDismissable) {
        e.preventDefault();
        UI.closeModal();
        return;
      }
      if (e.key === "Tab") {
        var focusable = Array.from(
          $("modal-body").querySelectorAll(
            'button:not([disabled]),select,input,[tabindex="0"]',
          ),
        );
        if (focusable.length) {
          var first = focusable[0],
            last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      return;
    }
    if (
      UI.screen !== "battle" ||
      UI.modalOpen ||
      /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)
    )
      return;
    if (e.key === "?" || e.key === "F1") {
      e.preventDefault();
      UI.showGuide();
    }
    if (e.key === "Tab" && !e.shiftKey && e.target === $("battle-canvas")) {
      e.preventDefault();
      var card = $("battle-roster").querySelector("button");
      if (card) card.focus();
    }
    if (e.key === "Escape") {
      UI.orderPivot = false;
      $("target-preview").style.display = "none";
    }
    if (e.key.toLowerCase() === "f") {
      UI.renderer.zoom = 1;
      UI.renderer.panX = 0;
      UI.renderer.panY = 0;
    }
    if (e.key === "Enter" && UI.battle.phase === "combat") {
      e.preventDefault();
      if (UI.combatReport) UI.continueCombat();
      else UI.fightEngagement();
    }
  });
  window.addEventListener("load", function () {
    $("btn-quick").onclick = UI.quickBattle;
    $("btn-settings").onclick = UI.showSettings;
    $("battle-settings").onclick = UI.showSettings;
    $("battle-help").onclick = UI.showGuide;
    $("toggle-log").onclick = function () {
      var open = $("screen-battle").classList.toggle("log-open");
      $("toggle-log").setAttribute("aria-expanded", String(open));
    };
    $("toggle-log").setAttribute("aria-expanded", "false");
    $("close-log").onclick = function () {
      $("screen-battle").classList.remove("log-open");
      $("toggle-log").setAttribute("aria-expanded", "false");
    };
    $("battle-canvas").tabIndex = 0;
    $("battle-canvas").setAttribute(
      "aria-label",
      "Tactical battlefield. Select regiments using the army strip below.",
    );
    $("modal-body").setAttribute("role", "dialog");
    $("modal-body").setAttribute("aria-modal", "true");
    UI.applySettings();
  });
})();
