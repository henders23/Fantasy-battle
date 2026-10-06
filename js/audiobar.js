// Sound controls at the top of every screen: a music on/off button and a volume button that
// opens sliders for the music and the battle sounds. They sit in the battle bar and in each
// page's top bar, and in the corner of the title screen. Every copy stays in step, and changes
// are saved with the other settings (Settings shows the same values).
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, $ = function (id) { return document.getElementById(id); };
  var ICON = {
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    musicOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M3 3l18 18"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    volOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
  };
  var SND = { low: 35, medium: 60, high: 90 }, MUS = { low: 32, medium: 60, high: 96 }; // as in Settings
  function S() { var s = UI.settings; if (typeof s.musicLevel !== "number") s.musicLevel = MUS[s.musicVolume] || 60; if (typeof s.soundLevel !== "number") s.soundLevel = SND[s.soundVolume] || 60; return s; }
  function nearest(v, map) { var best = "medium", d = 1e9; Object.keys(map).forEach(function (k) { var dd = Math.abs(map[k] - v); if (dd < d) { d = dd; best = k; } }); return best; }
  function save() { var s = S(); s.soundVolume = nearest(s.soundLevel, SND); s.musicVolume = nearest(s.musicLevel, MUS); UI.applySettings(); sync(); }
  var bars = [];
  function make(cls) {
    var bar = document.createElement("div"); bar.className = "audio-bar" + (cls ? " " + cls : "");
    var mus = document.createElement("button"); mus.type = "button"; mus.className = "ab-btn ab-music";
    mus.onclick = function (e) { e.stopPropagation(); var s = S(); s.music = !s.music; if (s.music && !s.musicLevel) s.musicLevel = 60; save(); };
    var vol = document.createElement("button"); vol.type = "button"; vol.className = "ab-btn ab-vol"; vol.setAttribute("aria-haspopup", "true"); vol.setAttribute("aria-expanded", "false");
    var pop = document.createElement("div"); pop.className = "ab-pop"; pop.hidden = true; pop.setAttribute("role", "group"); pop.setAttribute("aria-label", "Volume");
    pop.onclick = function (e) { e.stopPropagation(); };
    function slider(label, key, onKey) {
      var row = document.createElement("label"); row.className = "ab-row";
      row.innerHTML = '<span class="ab-lbl">' + label + '</span><input type="range" min="0" max="100" step="5"><b class="ab-pct"></b>';
      var input = row.querySelector("input");
      input.oninput = function () { var s = S(); s[key] = +input.value; if (onKey) s[onKey] = +input.value > 0; save(); };
      input.onchange = function () { if (key === "soundLevel" && UI.sfx && S().sound) UI.sfx.play("clash", { vol: 1, max: 1 }); };
      pop.appendChild(row); return row;
    }
    slider("Music", "musicLevel", "music"); slider("Battle sounds", "soundLevel", "sound");
    vol.onclick = function (e) { e.stopPropagation(); var open = pop.hidden; closeAll(); pop.hidden = !open; vol.setAttribute("aria-expanded", open ? "true" : "false"); if (open) { var first = pop.querySelector("input"); if (first) first.focus(); } };
    pop.onkeydown = function (e) { if (e.key === "Escape") { e.stopPropagation(); pop.hidden = true; vol.setAttribute("aria-expanded", "false"); vol.focus(); } };
    bar.appendChild(mus); bar.appendChild(vol); bar.appendChild(pop);
    bars.push(bar); syncBar(bar);
    return bar;
  }
  function closeAll() { bars.forEach(function (b) { var p = b.querySelector(".ab-pop"); if (p && !p.hidden) { p.hidden = true; b.querySelector(".ab-vol").setAttribute("aria-expanded", "false"); } }); }
  function syncBar(bar) {
    var s = S(), mus = bar.querySelector(".ab-music"), vol = bar.querySelector(".ab-vol");
    mus.innerHTML = (s.music ? ICON.music : ICON.musicOff) + "<span>" + (s.music ? "Music on" : "Music off") + "</span>";
    mus.setAttribute("aria-pressed", s.music ? "true" : "false"); mus.title = s.music ? "Turn the music off" : "Turn the music on";
    mus.classList.toggle("off", !s.music);
    var silent = (!s.music || !s.musicLevel) && (!s.sound || !s.soundLevel);
    vol.innerHTML = silent ? ICON.volOff : ICON.vol; vol.title = "Volume"; vol.setAttribute("aria-label", "Volume");
    var rows = bar.querySelectorAll(".ab-row"), vals = [[s.music ? s.musicLevel : 0], [s.sound ? s.soundLevel : 0]];
    rows.forEach(function (r, i) { var inp = r.querySelector("input"); if (document.activeElement !== inp) inp.value = vals[i][0]; r.querySelector(".ab-pct").textContent = vals[i][0] + "%"; });
  }
  function sync() { bars.forEach(syncBar); var t = $("btn-sound"); if (t) t.textContent = s0() ? "Sound on" : "Sound off"; }
  function s0() { var s = UI.settings; return s && (s.sound || s.music); }
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); }, true);

  // where the controls go
  function place() {
    var top = $("battle-top"), help = $("battle-help");
    if (top && help && !top.querySelector(".audio-bar")) top.insertBefore(make("in-battle"), help);
    document.querySelectorAll(".screen .topbar").forEach(function (tb) {
      if (tb.querySelector(".audio-bar")) return;
      var spacer = tb.querySelector(".spacer"); var bar = make("in-page");
      if (spacer && spacer.nextSibling) tb.insertBefore(bar, spacer.nextSibling); else tb.appendChild(bar);
    });
    var menu = $("screen-menu");
    if (menu && !menu.querySelector(".audio-bar")) menu.appendChild(make("in-menu"));
  }
  place();
  // the Settings screen and older buttons change the same values
  var apply = UI.applySettings;
  UI.applySettings = function () { var r = apply.apply(UI, arguments); bars.forEach(syncBar); return r; };
  var show = UI.show;
  UI.show = function () { closeAll(); return show.apply(UI, arguments); };
  UI.audioBar = { sync: sync, bars: bars };
})();
