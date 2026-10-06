// Background music: a calm theme for the menus and the trail, a battle theme on the field.
// Tracks crossfade when the screen changes. Browsers only allow audio after the player has
// interacted with the page, so music starts on the first click or key press.
"use strict";
(function () {
  if (typeof document === "undefined" || typeof Audio === "undefined") return;
  var UI = SOVL.UI;
  var TRACKS = { trail: "assets/music/trail-theme.mp3", battle: "assets/music/battle-the-frame.mp3" };
  var LEVEL = { low: 0.16, medium: 0.3, high: 0.48 };
  var players = {}, current = null, unlocked = false, timer = null;

  function player(id) {
    if (!players[id]) {
      var a = new Audio(TRACKS[id]);
      a.preload = "auto"; a.volume = 0; a.mix = 0;
      // The themes have composed endings, so rather than a hard loop each pass fades out
      // over its last seconds and the next one fades in from the top.
      a.addEventListener("ended", function () { if (current === id) { a.volume = 0; a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () {}); } });
      players[id] = a;
    }
    return players[id];
  }
  function level() { var s = UI.settings; if (!s || !s.music) return 0; return typeof s.musicLevel === "number" ? 0.5 * s.musicLevel / 100 : LEVEL[s.musicVolume] || LEVEL.medium; }
  function wanted() {
    if (!unlocked || document.hidden || !UI.settings || !UI.settings.music) return null;
    return UI.screen === "battle" ? "battle" : "trail";
  }
  // Crossfade: each player's mix eases toward 1 (current) or 0; the loop envelope shapes the
  // start and end of every pass. Silent players pause so they cost nothing.
  function tick() {
    var live = false, top = level();
    Object.keys(players).forEach(function (id) {
      var a = players[id], goal = id === current ? 1 : 0;
      a.mix = goal > a.mix ? Math.min(goal, a.mix + 0.035) : Math.max(goal, a.mix - 0.035);
      var d = a.duration, t = a.currentTime, env = 1;
      if (d && isFinite(d)) env = Math.min(1, Math.max(0, (d - t) / 3.5), t / 1.5);
      a.volume = Math.max(0, Math.min(1, a.mix * top * env));
      if (goal === 0 && a.mix === 0 && !a.paused) a.pause();
      if (!a.paused || a.mix !== goal) live = true;
    });
    timer = live ? setTimeout(tick, 60) : null;
  }
  function update() {
    var want = wanted();
    if (want !== current) {
      current = want;
      if (want) {
        var a = player(want);
        if (a.paused) {
          if (a.mix === 0 && want === "battle") a.currentTime = 0; // each battle opens with its theme
          var p = a.play(); if (p && p.catch) p.catch(function () {});
        }
      }
    }
    if (!timer) tick();
  }
  UI.music = { update: update, players: players, current: function () { return current; } };

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    update();
  }
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", update);
  var show = UI.show;
  UI.show = function (id) { var r = show.apply(UI, arguments); update(); return r; };
  var apply = UI.applySettings;
  UI.applySettings = function () { var r = apply.apply(UI, arguments); update(); return r; };
})();
