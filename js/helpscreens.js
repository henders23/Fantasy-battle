// Settings, the battle guide and the field manual. Settings are grouped into sound, battle and
// display cards with switches, volume sliders (with a test sound) and segmented choices. The
// guide walks through a first battle one illustrated step at a time and opens on the step for
// the current phase. The field manual is a chaptered reference with a contents rail: phase
// cards, a combat walkthrough, spells, terrain, dice, keycaps, the campaign and the factions.
// Presentation only: settings keep their names and every rule is read from the game data.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- volume as a percentage (older saves stored low / medium / high) ----------
  var SND = { low: 35, medium: 60, high: 90 }, MUS = { low: 32, medium: 60, high: 96 };
  function nearest(v, map) { var best = "medium", d = 1e9; Object.keys(map).forEach(function (k) { var e = Math.abs(map[k] - v); if (e < d) { d = e; best = k; } }); return best; }
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("sovl-experience-settings") || "{}") || {}; } catch (e) { /* storage may be blocked */ }
  var S = UI.settings;
  if (S) {
    S.soundLevel = typeof saved.soundLevel === "number" ? clamp(saved.soundLevel, 0, 100) : SND[S.soundVolume] || 60;
    S.musicLevel = typeof saved.musicLevel === "number" ? clamp(saved.musicLevel, 0, 100) : MUS[S.musicVolume] || 60;
  }
  var reducedByDevice = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
  };

  // ---------- settings ----------
  function sw(on, onChange, label) {
    var b = el("button", "st-switch" + (on ? " on" : ""), "<i></i>");
    b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", on ? "true" : "false"); b.setAttribute("aria-label", label);
    b.onclick = function () { var v = !b.classList.contains("on"); b.classList.toggle("on", v); b.setAttribute("aria-checked", v ? "true" : "false"); onChange(v); };
    return b;
  }
  function seg(options, value, onChange, label) {
    var g = el("div", "st-seg"); g.setAttribute("role", "radiogroup"); g.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = el("button", o[0] === value ? "on" : "", esc(o[1])); b.type = "button";
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", o[0] === value ? "true" : "false");
      b.onclick = function () { g.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); }); b.classList.add("on"); b.setAttribute("aria-checked", "true"); onChange(o[0]); };
      g.appendChild(b);
    });
    return g;
  }
  function row(title, desc, control) {
    var r = el("div", "st-row");
    r.appendChild(el("div", "st-text", "<b>" + esc(title) + "</b>" + (desc ? "<small>" + desc + "</small>" : "")));
    r.appendChild(control); return r;
  }
  function slider(value, onInput, label, test) {
    var w = el("div", "st-slider"), input = el("input"), out = el("output", null, value + "%");
    input.type = "range"; input.min = 0; input.max = 100; input.step = 5; input.value = value; input.setAttribute("aria-label", label);
    var paint = function () { w.style.setProperty("--p", input.value + "%"); out.textContent = input.value + "%"; };
    input.oninput = function () { paint(); onInput(+input.value); };
    input.onchange = function () { if (test) test(); };
    paint(); w.appendChild(input); w.appendChild(out);
    if (test) { var t = el("button", "st-test", ICON.play); t.type = "button"; t.title = "Play a sample"; t.setAttribute("aria-label", "Play a sample of " + label.toLowerCase()); t.onclick = test; w.appendChild(t); }
    return w;
  }
  function apply() { if (S) { S.soundVolume = nearest(S.soundLevel, SND); S.musicVolume = nearest(S.musicLevel, MUS); } UI.applySettings(); }
  var PACE = { deliberate: "Enemy moves play slowly, one at a time: easy to follow.", normal: "A steady pace for most battles.", fast: "Enemy turns fly by. For players who know the game." };
  UI.showSettings = function () {
    var box = el("div", "st");
    box.appendChild(el("div", "st-head", '<div><div class="st-eyebrow">Fantasy Battle</div><h2>Settings</h2></div><span class="st-saved">Changes apply at once and are saved on this device</span>'));
    var grid = el("div", "st-grid");
    function card(icon, title) { var c = el("section", "st-card"); c.appendChild(el("h3", null, '<span class="st-ic">' + icon + "</span>" + esc(title))); grid.appendChild(c); return c; }

    var snd = card(ICON.sound, "Sound");
    var fxSlider = slider(S.soundLevel, function (v) { S.soundLevel = v; apply(); }, "Effects volume", function () { if (UI.sfx) UI.sfx.play("clash", { vol: 1, max: 1 }); });
    var musSlider = slider(S.musicLevel, function (v) { S.musicLevel = v; apply(); }, "Music volume");
    var syncSound = function () { fxSlider.classList.toggle("off", !S.sound); fxSlider.querySelectorAll("input,button").forEach(function (x) { x.disabled = !S.sound; }); musSlider.classList.toggle("off", !S.music); musSlider.querySelector("input").disabled = !S.music; };
    snd.appendChild(row("Battle sounds", "Weapons, spells, marching feet and the table's dice.", sw(S.sound, function (v) { S.sound = v; apply(); syncSound(); if (v) UI.sound("select"); }, "Battle sounds")));
    snd.appendChild(row("Effects volume", null, fxSlider));
    snd.appendChild(row("Music", "Orchestral themes for the menus, the campaign and the field.", sw(S.music, function (v) { S.music = v; apply(); syncSound(); }, "Music")));
    snd.appendChild(row("Music volume", null, musSlider));
    snd.appendChild(el("p", "st-note", "Browsers only play sound after your first click or key press."));
    syncSound();

    var bat = card(ICON.swords, "Battle");
    var paceNote = el("small", "st-desc", PACE[S.pace]);
    var pace = seg([["deliberate", "Deliberate"], ["normal", "Normal"], ["fast", "Fast"]], S.pace, function (v) { S.pace = v; paceNote.textContent = PACE[v]; apply(); }, "Enemy action speed");
    var pr = row("Enemy action speed", null, pace); pr.classList.add("st-stack"); pr.firstChild.appendChild(paceNote); bat.appendChild(pr);
    var lr = row("Regiment labels", "Name and strength beside each regiment on the table.", seg([["on", "Always"], ["off", "Selected only"]], S.labels ? "on" : "off", function (v) { S.labels = v === "on"; apply(); }, "Regiment labels"));
    lr.classList.add("st-stack"); bat.appendChild(lr);

    var dis = card(ICON.eye, "Motion");
    dis.appendChild(row("Animation and effects", "Marching, missiles, spells, falling casualties and screen shake. Off: regiments move at once and effects are skipped.", sw(S.motion, function (v) { S.motion = v; apply(); }, "Animation and effects")));
    if (reducedByDevice) dis.appendChild(el("p", "st-note", "Your device asks for reduced motion, so this started off."));
    box.appendChild(grid);

    var foot = el("div", "st-foot");
    var reset = el("button", "st-reset", "Restore defaults"); reset.type = "button";
    reset.onclick = function () {
      S.sound = true; S.music = true; S.soundLevel = 60; S.musicLevel = 60; S.pace = "normal"; S.labels = true; S.motion = !reducedByDevice;
      apply(); UI.showSettings();
    };
    var done = el("button", "primary", "Done"); done.type = "button"; done.onclick = UI.closeModal;
    foot.appendChild(reset); foot.appendChild(done); box.appendChild(foot);
    UI.modalDismissable = true; UI.modal(box); $("modal-body").classList.add("m-settings");
  };

  // ---------- battle guide ----------
  var TABLE = '<rect x="0" y="0" width="320" height="180" rx="8" fill="url(#gd-grass)"/>';
  var DEFS = '<defs><linearGradient id="gd-grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b5a2c"/><stop offset="1" stop-color="#2d3a1c"/></linearGradient>' +
    '<marker id="gd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#a5c7e5"/></marker>' +
    '<marker id="gd-arrow-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f08c7c"/></marker></defs>';
  function block(x, y, w, h, side, rot, opts) {
    opts = opts || {};
    var fill = side ? "#7c2a24" : "#264f78", edge = side ? "#f09a8e" : "#8fc3f0", dots = "", cols = Math.max(2, Math.round(w / 11)), rows = Math.max(1, Math.round(h / 11));
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) dots += '<circle cx="' + (-w / 2 + (i + 0.5) * w / cols).toFixed(1) + '" cy="' + (-h / 2 + (j + 0.5) * h / rows).toFixed(1) + '" r="2.6" fill="' + (side ? "#d9a79e" : "#bcd6ee") + '" opacity="0.9"/>';
    return '<g transform="translate(' + x + " " + y + ") rotate(" + (rot || 0) + ')" opacity="' + (opts.ghost ? 0.45 : 1) + '"><rect x="' + -w / 2 + '" y="' + -h / 2 + '" width="' + w + '" height="' + h + '" rx="2" fill="' + fill + '" stroke="' + edge + '" stroke-width="1"' + (opts.ghost ? ' stroke-dasharray="3 2"' : "") + "/>" + dots +
      '<line x1="' + -w / 2 + '" y1="' + -h / 2 + '" x2="' + w / 2 + '" y2="' + -h / 2 + '" stroke="' + edge + '" stroke-width="3"/></g>';
  }
  function die(x, y, n, col) {
    var P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
    return '<g transform="translate(' + x + " " + y + ')"><rect x="-11" y="-11" width="22" height="22" rx="4" fill="' + (col || "#d7e3ee") + '" stroke="#16253a" stroke-width="1"/>' + P.map(function (p) { return '<circle cx="' + p[0] * 5.5 + '" cy="' + p[1] * 5.5 + '" r="2.2" fill="#101b2a"/>'; }).join("") + "</g>";
  }
  function spark(x, y, s) { return '<path transform="translate(' + x + " " + y + ") scale(" + (s || 1) + ')" d="M0 -8L2 -2L8 0L2 2L0 8L-2 2L-8 0L-2 -2Z" fill="#c9def1"/>'; }
  function txt(x, y, t, col, anchor) { return '<text x="' + x + '" y="' + y + '" fill="' + (col || "#dee8f1") + '" font-size="10" font-family="Marcellus SC, Barlow Semi Condensed, Georgia, serif" letter-spacing="1" text-anchor="' + (anchor || "middle") + '">' + t + "</text>"; }
  function art(inner) { return '<svg viewBox="0 0 320 180" role="img" aria-hidden="true">' + DEFS + TABLE + inner + "</svg>"; }
  var GUIDE = [
    { t: "Deploy your line", p: "Your army is already placed in the blue zone. Drag regiments to reposition them, or begin immediately.", tip: "Use the − and + buttons in the muster dock to change a regiment's frontage; Q and E turn it.",
      art: function () { return art('<rect x="0" y="126" width="320" height="54" fill="rgba(90,160,255,0.16)"/><line x1="0" y1="126" x2="320" y2="126" stroke="#8fc3f0" stroke-dasharray="5 4"/><rect x="0" y="0" width="320" height="34" fill="rgba(240,120,110,0.12)"/><line x1="0" y1="34" x2="320" y2="34" stroke="#f09a8e" stroke-dasharray="5 4"/>' + txt(312, 174, "YOUR ZONE", "#bcd6ee", "end") + txt(250, 24, "ENEMY ZONE", "#f0b0a6") + block(70, 150, 50, 22, 0) + block(140, 150, 50, 22, 0) + block(240, 104, 50, 22, 0, 0, { ghost: true }) + block(222, 150, 50, 22, 0) + '<path d="M236 108 Q246 128 228 140" fill="none" stroke="#a5c7e5" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#gd-arrow)"/>' + txt(270, 102, "drag", "#a5c7e5", "start")); } },
    { t: "Declare charges", p: "Select a blue regiment, then an enemy in the gold arc. A flank or rear attack reduces the attacks coming back at you. Pass when you have no more charges.", tip: "The charger must see its target and reach it with its move. Hover a target for the odds.",
      art: function () { return art('<path d="M160 128 L70 38 A127 127 0 0 1 250 38 Z" fill="rgba(165, 199, 229,0.16)" stroke="#a5c7e5" stroke-width="1.2" stroke-dasharray="4 3"/>' + block(160, 140, 56, 22, 0) + block(192, 58, 50, 22, 1, 160) + block(52, 92, 40, 20, 1, 90) + '<path d="M165 128 L188 74" stroke="#a5c7e5" stroke-width="2.5" marker-end="url(#gd-arrow)"/>' + txt(262, 30, "FRONT ARC", "#a5c7e5") + txt(52, 118, "out of arc", "#bac6d0")); } },
    { t: "Move and shoot", p: "Select a ready regiment. Point at the ground to preview its route and movement cost, then click to move. Drag the gold handle in front of the regiment to turn it, press Z to take a move back, then Shoot or cast, and end the activation. Your opponent acts next.", tip: "Every 45° turn costs movement: 1\" for infantry, 2\" for cavalry.",
      art: function () { return art(block(80, 146, 50, 22, 0) + '<path d="M86 132 Q110 100 150 92" fill="none" stroke="#a5c7e5" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#gd-arrow)"/>' + block(170, 98, 50, 22, 0, -25, { ghost: true }) + '<circle cx="160" cy="75" r="5" fill="#a5c7e5" stroke="#142236"/>' + txt(126, 60, "6″ · turn 1″", "#a5c7e5") + block(262, 146, 50, 20, 0) + block(262, 36, 50, 22, 1, 180) +
        [248, 262, 276].map(function (x, i) { return '<line x1="' + x + '" y1="132" x2="' + (x + (i - 1) * 3) + '" y2="54" stroke="#d3dee8" stroke-width="1.3" marker-end="url(#gd-arrow)"/>'; }).join("")); } },
    { t: "Fight on the field", p: "Click an engagement and choose Fight this engagement. Roll the attack dice, then the armour saves, then any break tests yourself: click the dice or press Space. Select the next fight when the outcome is shown.", tip: "Gold dice hit, green dice save, red dice are failed saves.",
      art: function () { return art(block(160, 86, 70, 22, 1, 180) + block(160, 110, 70, 26, 0) + spark(138, 98, 1) + spark(160, 97, 1.3) + spark(183, 99, 0.9) + die(104, 152, 6, "#a5c7e5") + die(132, 152, 4, "#a5c7e5") + die(160, 152, 5, "#a5c7e5") + die(188, 152, 2) + die(216, 152, 1) + txt(160, 40, "3 HITS", "#a5c7e5")); } },
    { t: "Answer a charge", p: "When the enemy declares a charge against you, a prompt appears over the field: counter-charge to meet it head on, flee if the regiment is fast enough, or hold and receive it.", tip: "Only a charge into your front can be met with a counter-charge.",
      art: function () { return art(block(160, 30, 56, 22, 1, 180) + '<path d="M160 44 L160 98" stroke="#f08c7c" stroke-width="2.5" marker-end="url(#gd-arrow-r)"/>' + block(160, 116, 56, 22, 0) + '<g font-family="Barlow, sans-serif" font-size="11" fill="#dee8f1">' +
        [["Counter-charge", 64], ["Hold", 160], ["Flee", 256]].map(function (c) { return '<rect x="' + (c[1] - 44) + '" y="146" width="88" height="22" rx="11" fill="#0c141e" stroke="#98b8d4"/><text x="' + c[1] + '" y="161" text-anchor="middle">' + c[0] + "</text>"; }).join("") + "</g>" + txt(236, 74, "CHARGE!", "#f08c7c")); } }
  ];
  UI.showGuide = function (start) {
    var b = UI.battle, prompt = $("reaction-prompt");
    if (typeof start !== "number") start = prompt && !prompt.hidden ? 4 : !b ? 0 : b.phase === "deploy" ? 0 : b.phase === "charge" ? 1 : b.phase === "combat" ? 3 : 2;
    var box = el("div", "gd"), cur = clamp(start, 0, GUIDE.length - 1);
    box.appendChild(el("div", "gd-head", '<div class="st-eyebrow">Field guide</div><h2>Your first battle</h2>'));
    var body = el("div", "gd-body"), nav = el("ol", "gd-nav"), stage = el("div", "gd-stage");
    stage.setAttribute("aria-live", "polite");
    GUIDE.forEach(function (s, i) {
      var li = el("li"), bt = el("button", null, '<span class="gd-n">' + String(i + 1).padStart(2, "0") + "</span><span>" + esc(s.t) + "</span>");
      bt.type = "button"; bt.onclick = function () { show(i); }; li.appendChild(bt); nav.appendChild(li);
      var pane = el("div", "gd-pane");
      // each diagram gets its own ids: a gradient defined inside a hidden step would not paint
      pane.appendChild(el("div", "gd-art", s.art().replace(/gd-(arrow-r|arrow|grass)\b/g, "gd" + i + "-$1")));
      pane.appendChild(el("div", "gd-copy", '<div class="gd-step">Step ' + (i + 1) + " of " + GUIDE.length + "</div><h3>" + esc(s.t) + "</h3><p>" + esc(s.p) + '</p><p class="gd-tip">' + esc(s.tip) + "</p>"));
      stage.appendChild(pane);
    });
    body.appendChild(nav); body.appendChild(stage); box.appendChild(body);
    box.appendChild(el("div", "gd-legend", '<span><i class="lg-blue"></i>Your regiments</span><span><i class="lg-red"></i>Enemy regiments</span><span><i class="lg-count">18</i>Models left</span><span><i class="lg-arc"></i>Charge arc</span><span>Click a card in the bottom strip to find that regiment.</span>'));
    var foot = el("div", "gd-foot"), prev = el("button", "gd-prev", ICON.prev + "<span>Back</span>"), next = el("button", "gd-next", "<span>Next</span>" + ICON.next), done = el("button", "primary", b ? "Return to the field" : "Close");
    var dots = el("div", "gd-dots");
    GUIDE.forEach(function (s, i) { var d = el("i"); d.onclick = function () { show(i); }; dots.appendChild(d); });
    prev.type = next.type = done.type = "button";
    prev.onclick = function () { show(cur - 1); }; next.onclick = function () { show(cur + 1); }; done.onclick = UI.closeModal;
    foot.appendChild(prev); foot.appendChild(dots); foot.appendChild(next); foot.appendChild(done); box.appendChild(foot);
    function show(i) {
      cur = clamp(i, 0, GUIDE.length - 1);
      stage.querySelectorAll(".gd-pane").forEach(function (p, k) { p.classList.toggle("on", k === cur); });
      nav.querySelectorAll("button").forEach(function (x, k) { x.classList.toggle("on", k === cur); x.setAttribute("aria-current", k === cur ? "step" : "false"); });
      dots.querySelectorAll("i").forEach(function (x, k) { x.classList.toggle("on", k === cur); });
      prev.disabled = cur === 0; next.disabled = cur === GUIDE.length - 1;
    }
    show(cur);
    UI.modalDismissable = true; UI.modal(box); $("modal-body").classList.add("m-guide");
    box.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { e.preventDefault(); show(cur + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); show(cur - 1); } });
  };
  var modal = UI.modal;
  UI.modal = function () { var m = $("modal-body"); if (m) m.classList.remove("m-settings", "m-guide"); return modal.apply(UI, arguments); };

  // ---------- field manual ----------
  function key(k) { return "<kbd>" + k + "</kbd>"; }
  var TERRAIN_ICON = {
    forest: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#27391d"/><circle cx="17" cy="21" r="8" fill="#3f6a2b"/><circle cx="29" cy="18" r="9" fill="#4b7a31"/><circle cx="27" cy="30" r="8" fill="#355d25"/><circle cx="16" cy="31" r="6" fill="#446f2c"/></svg>',
    swamp: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#2f3b2a"/><ellipse cx="20" cy="27" rx="12" ry="6" fill="#3d5a4d"/><ellipse cx="31" cy="20" rx="8" ry="4" fill="#46685a"/><path d="M14 18v-6M17 19v-8M33 30v-7M36 30v-5" stroke="#8a9a55" stroke-width="2" stroke-linecap="round"/></svg>',
    cliff: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#3a3630"/><path d="M8 32L17 14L25 22L31 12L40 30Z" fill="#8a8173"/><path d="M17 14L21 30M31 12L29 30" stroke="#5b544a" stroke-width="2"/></svg>',
    lake: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#2b3a2a"/><ellipse cx="24" cy="25" rx="15" ry="10" fill="#2f5a78"/><path d="M16 24h7M26 28h6" stroke="#8fc3f0" stroke-width="1.6" stroke-linecap="round"/></svg>',
    ruin: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#34302a"/><path d="M12 34V18h5v16M21 34V13h6v21M31 34V22h5v12" fill="#9a8f7e"/><path d="M10 35h28" stroke="#6b6254" stroke-width="3"/></svg>'
  };
  var NODES = [["⚔", "Battle"], ["☠", "Elite battle"], ["?", "Event"], ["⚖", "Merchant"], ["⛺", "Camp"], ["✪", "Treasure"], ["♛", "Boss"]];
  UI.showRules = function () {
    var T = SOVL.MAX_TURNS, fids = Object.keys(SOVL.FACTION_DATA);
    var spells = Object.keys(SOVL.SPELLS).map(function (n) { var s = SOVL.SPELLS[n]; return { n: n, s: s }; });
    var KIND = { bolt: "Attack", hex: "Hex", buff: "Blessing", heal: "Healing", summon: "Summoning" };
    var sections = [
      ["game", "The game", '<p class="fm-lead">Fantasy Battle is a rank-and-flank fantasy wargame. Each unit is a block of models with a front, two flanks and a rear.</p>' +
        '<div class="fm-facts"><div><b>' + T + '</b><span>turns at most</span></div><div><b>3</b><span>phases each turn</span></div><div><b>45°</b><span>front arc for a charge</span></div></div>' +
        "<p>Battles last " + T + " turns, or end when one army is destroyed or fleeing; otherwise the winner is decided on points: full cost for destroyed or routed units, half for units below half strength, plus slain commanders.</p>"],
      ["turn", "Turn structure", "<p>Each turn has three phases. Players alternate activations in the first two.</p>" +
        '<div class="fm-phases">' +
        '<div class="fm-phase"><span>01</span><b>Charge Phase</b><p>Declare charges one at a time. A charge needs the target within the charger\'s move distance and inside its 45° front arc, with line of sight. Units already charged can <b>counter-charge</b> a frontal charger, or <b>flee</b> if fast enough.</p></div>' +
        '<div class="fm-phase"><span>02</span><b>Strategic Phase</b><p>Activate one unit at a time: advance and pivot (each 45° pivot costs movement: 1" for infantry, 2" for cavalry), use one ranged attack or ability, and the commander may cast one spell. Fleeing units may only try to rally.</p></div>' +
        '<div class="fm-phase"><span>03</span><b>Combat Phase</b><p>Every engagement is fought simultaneously, then the losers test their nerve.</p></div></div>'],
      ["combat", "Combat", '<ol class="fm-flow">' +
        "<li><b>Attacks</b><span>Models in the front rank attack. The second rank adds one supporting attack each; spears add a third rank when not charging.</span></li>" +
        "<li><b>To hit</b><span>Compare Skill: 3+ if the attacker's is higher, otherwise 4+.</span></li>" +
        "<li><b>Saves</b><span>The defender saves each hit, comparing the attack's Power with its Defense.</span></li>" +
        "<li><b>Combat score</b><span>Wounds dealt, plus +1 for fighting into a flank and +1 into the rear.</span></li>" +
        "<li><b>Break test</b><span>The loser tests Discipline on 2D6 minus the difference, adding +1 per rank of 3 or more models. Failing sends it fleeing.</span></li></ol>"],
      ["shooting", "Ranged attacks", '<div class="fm-mods"><div><b>4+</b><span>to hit</span></div><div><b>±1</b><span>per point of Skill from 3</span></div><div><b>−1</b><span>at long range (over half)</span></div><div><b>−1</b><span>against targets in cover</span></div></div>' +
        "<p>One die per model. Losing a quarter of a unit to shooting forces a Discipline test.</p>"],
      ["magic", "Magic", "<p>A commander who knows spells may cast one each Strategic Phase: roll 2D6 and add the caster's level; the spell works if the total reaches its casting value. A roll of double 1 is a <b>miscast</b> and wounds the caster.</p>" +
        '<div class="fm-spells">' + spells.map(function (x) { return '<div class="fm-spell k-' + x.s.kind + '"><div><b>' + esc(x.n) + "</b><em>" + esc(KIND[x.s.kind] || x.s.kind) + "</em></div><span>" + esc(x.s.desc) + '</span><i title="Casting value">' + x.s.cv + "+</i></div>"; }).join("") + "</div>"],
      ["terrain", "Terrain", '<div class="fm-terrain">' +
        [["forest", "Forest", "Difficult ground: −2\" to enter or start in. Blocks line of sight."], ["swamp", "Swamp", "Difficult ground: −2\" to enter or start in."], ["cliff", "Cliff", "Impassable. Blocks line of sight."], ["ruin", "Ruin", "Impassable. Blocks line of sight."], ["lake", "Lake", "Impassable."]]
          .map(function (t) { return '<div class="fm-tr">' + TERRAIN_ICON[t[0]] + "<div><b>" + t[1] + "</b><span>" + t[2] + "</span></div></div>"; }).join("") + "</div>"],
      ["dice", "Dice", "<p>Nothing is rolled for you. When an attack, save, casting roll, break test or flight move comes up, the dice appear in the panel at the bottom of the battlefield: click them (or press " + key("Space") + ") to roll. Attack dice that meet the target count as hits; the defender then rolls a save for each hit. After every engagement the combat score is shown, and the losing units roll their break tests. Use Auto-resolve if you want the rest of a phase rolled for you.</p>" +
        '<div class="fm-dice"><span><i class="d-hit">6</i>Hit</span><span><i class="d-save">5</i>Saved</span><span><i class="d-fail">2</i>Failed save</span><span><i class="d-miss">1</i>Miss</span></div>'],
      ["controls", "Controls", '<div class="fm-keys">' +
        [["Click a unit", "Select it; in the Strategic Phase, activate it"], ["Click ground", "Pivot toward the point and advance"], [key("Shift") + " + click", "Pivot only"], [key("Q") + " " + key("E"), "Pivot 45° left / right"], ["Drag the gold handle", "Turn the selected unit freely"], [key("Z"), "Undo this activation's moves and pivots"], [key("Enter"), "End activation and bring up your next regiment / pass"], [key("X") + " / " + key("Shift") + " " + key("X"), "Show charge arcs / weapon ranges"], [key("Space"), "Roll the dice"], ["Wheel · right-drag", "Zoom and pan"], [key("Esc"), "Cancel targeting"], [key("?"), "Open the battle guide"]]
          .map(function (k) { return '<div class="fm-key"><span>' + k[0] + "</span><em>" + k[1] + "</em></div>"; }).join("") + "</div>"],
      ["trail", "Trail of Death", "<p>A roguelite campaign in three acts. Choose a path through the map's stops, then defeat each act's boss. Victories earn gold and veterancy; half of a unit's losses return after a won battle. A lost battle, or a dead commander, ends the run.</p>" +
        '<div class="fm-nodes">' + NODES.map(function (n) { return '<span><i>' + n[0] + "</i>" + n[1] + "</span>"; }).join("") + "</div>" +
        "<p>Battles are fought as Pitched Battles, Meeting Engagements (deep zones only 12\" apart) or Scoring Objectives. Three difficulties scale the enemy armies and your starting purse. Your commander learns a trait at each veterancy rank, merchants can re-arm units, and every unit keeps a tally of battles fought and models slain.</p>"],
      ["factions", "Factions", '<div class="fm-factions">' + fids.map(function (f, i) { return '<div class="fm-fac" style="--fc:' + esc(SOVL.FACTION_INFO[f].color) + '"><span class="fm-port" style="background-position:' + i * 25 + '% 18%"></span><div><b>' + esc(SOVL.FACTION_DATA[f].name) + "</b><span>" + esc(SOVL.FACTION_INFO[f].tagline) + "</span></div></div>"; }).join("") + "</div>"]
    ];
    var body = $("rules-body");
    body.innerHTML = "";
    body.className = "panel rules fm";
    var toc = el("nav", "fm-toc"); toc.setAttribute("aria-label", "Chapters");
    var main = el("div", "fm-main");
    sections.forEach(function (s, i) {
      var a = el("a", null, '<span>' + String(i + 1).padStart(2, "0") + "</span>" + esc(s[1])); a.href = "#fm-" + s[0];
      a.onclick = function (e) { e.preventDefault(); var t = $("fm-" + s[0]); if (t) t.scrollIntoView({ behavior: UI.settings && !UI.settings.motion ? "auto" : "smooth", block: "start" }); };
      toc.appendChild(a);
      var sec = el("section", "fm-sec", '<h3><span class="fm-num">' + String(i + 1).padStart(2, "0") + "</span>" + esc(s[1]) + "</h3>" + s[2]);
      sec.id = "fm-" + s[0]; main.appendChild(sec);
    });
    main.appendChild(el("p", "fm-credit", "Core rules follow the public SOVL rules document by Dalen Studios. Spells, magic items and the campaign structure are this game's own design, matching the names used in the source lists."));
    body.appendChild(toc); body.appendChild(main);
    var title = document.querySelector("#screen-rules .topbar h2"); if (title) title.textContent = "Field Manual";
    UI.show("rules");
    // the contents rail follows the reader
    var links = toc.querySelectorAll("a"), secs = main.querySelectorAll(".fm-sec");
    var spy = function () {
      // measured from the top of the scrolling panel (or the window on phones, where the page scrolls)
      var top = Math.max(0, body.getBoundingClientRect().top), best = 0;
      secs.forEach(function (s, i) { if (s.getBoundingClientRect().top - top < 120) best = i; });
      links.forEach(function (l, i) { l.classList.toggle("on", i === best); });
    };
    [main, body, window].forEach(function (t) { t.addEventListener("scroll", spy, { passive: true }); });
    main.scrollTop = 0; body.scrollTop = 0; spy();
  };
})();
