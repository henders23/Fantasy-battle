// Sound effects. Recorded clips come from open libraries (see assets/sfx/CREDITS.md): battle
// sounds from 0 A.D. (CC BY-SA 3.0) and interface sounds from uisfx (CC0). Dice are modelled
// here as small wooden cubes bouncing on a table. Every game event is mapped to a sound with
// the unit's weapon and mount in mind; clips vary in pitch and level, overlapping copies are
// limited, and everything passes through a light outdoor reverb and a gentle compressor.
"use strict";
(function () {
  if (typeof window === "undefined") return;
  var UI = SOVL.UI;
  var COUNT = {"alarm_horn":1,"amb_field":1,"amb_wind":1,"arrow":4,"arrow_hit":5,"arrow_miss":4,"ballista":2,"bow":4,"catapult":1,"clash":6,"coin":1,"death":6,"defeat":1,"fire":2,"flesh":6,"gallop":6,"gun":3,"hero_dead":1,"horn":3,"horse_death":2,"level_up":1,"march":3,"neigh":3,"reward":1,"run":1,"shield":6,"spell":3,"swing":4,"thrust":4,"travel":1,"turn":1,"ui_back":1,"ui_close":1,"ui_drop":1,"ui_error":1,"ui_open":1,"ui_press":1,"ui_select":1,"ui_tick":2,"ui_toggle":1,"victory":1};
  // measured mean loudness of each clip group (dB); gains bring them to a common level
  var MEAN = {alarm_horn:-14,arrow:-16.4,arrow_hit:-22.6,arrow_miss:-22.2,ballista:-24.3,bow:-28.5,catapult:-20.2,clash:-27.6,coin:-12,death:-19.8,defeat:-19.4,fire:-22.5,flesh:-12.9,gallop:-27.6,gun:-17.4,hero_dead:-18.6,horn:-12.2,horse_death:-17.9,level_up:-11.6,march:-22.8,neigh:-16.8,reward:-11.9,run:-22.4,shield:-23.8,spell:-13.3,swing:-20.8,thrust:-16,travel:-14.1,turn:-17.6,victory:-19,amb_wind:-22.6,amb_field:-26};
  // mix: how prominent each group sits against the rest (1 = reference)
  var MIX = {clash:0.9,swing:0.6,thrust:0.7,shield:0.7,flesh:0.45,death:0.35,horse_death:0.4,bow:0.8,arrow:0.55,arrow_miss:0.6,arrow_hit:0.7,gun:0.8,ballista:0.8,catapult:0.8,march:0.5,run:0.5,gallop:0.6,neigh:0.45,horn:0.75,alarm_horn:0.6,turn:0.6,victory:0.9,defeat:0.9,hero_dead:0.8,spell:0.6,fire:0.6,coin:0.7,reward:0.7,level_up:0.7,travel:0.5,amb_field:0.5,amb_wind:0.35};
  var UI_LEVEL = 0.32;
  var LEVEL = { low: 0.35, medium: 0.6, high: 0.9 };

  var ctx = null, master = null, dry = null, wet = null, buffers = {}, pending = {}, useElements = false;
  var last = {}, recent = {}, voices = 0, ambience = { name: null, node: null, gain: null };

  function gainOf(name) {
    if (/^ui_/.test(name)) return UI_LEVEL;
    var m = MEAN[name] == null ? -18 : MEAN[name];
    return Math.min(4, Math.pow(10, (-20 - m) / 20)) * (MIX[name] == null ? 0.7 : MIX[name]);
  }
  function enabled() { return UI.settings && UI.settings.sound && !document.hidden; }
  function level() { return LEVEL[UI.settings && UI.settings.soundVolume] || LEVEL.medium; }

  // ---------- audio graph ----------
  function impulse(ac, seconds, decay) {
    var len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1);
    }
    return buf;
  }
  function graph() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = level();
    master.connect(comp); comp.connect(ctx.destination);
    dry = ctx.createGain(); dry.connect(master);
    var verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 1.4, 3.2);
    wet = ctx.createGain(); wet.gain.value = 0.16; wet.connect(verb); verb.connect(master);
    buildDice();
    return ctx;
  }
  function url(name, i) { return "assets/sfx/" + name + "_" + i + ".mp3"; }
  function load(name) {
    if (buffers[name] || pending[name] || useElements || !COUNT[name]) return;
    pending[name] = true; buffers[name] = [];
    for (var i = 1; i <= COUNT[name]; i++) (function (i) {
      fetch(url(name, i)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (a) { return new Promise(function (ok, bad) { ctx.decodeAudioData(a, ok, bad); }); })
        .then(function (buf) { buffers[name][i - 1] = buf; })
        .catch(function () { useElements = true; }); // file:// pages cannot fetch: fall back to <audio>
    })(i);
  }
  function preload() { if (!graph()) return; Object.keys(COUNT).forEach(load); }
  function pickVariant(name) {
    var n = COUNT[name] || 1, v = Math.floor(Math.random() * n);
    if (n > 1 && v === last[name]) v = (v + 1) % n;
    last[name] = v;
    return v;
  }

  // play(name, {vol, rate, delay, wet, pan}) — delay in seconds
  function play(name, o) {
    o = o || {};
    if (!enabled() || !COUNT[name]) return;
    var now = performance.now(), key = name;
    recent[key] = (recent[key] || []).filter(function (t) { return now - t < 120; });
    if (recent[key].length >= (o.max || 3)) return;
    recent[key].push(now);
    var vol = gainOf(name) * (o.vol == null ? 1 : o.vol) * (0.85 + Math.random() * 0.3);
    var rate = (o.rate || 1) * (o.fixed ? 1 : 0.94 + Math.random() * 0.12), v = pickVariant(name);
    if (!graph()) return;
    if (ctx.state === "suspended") ctx.resume().catch(function () {});
    load(name);
    var buf = buffers[name] && buffers[name][v] || buffers[name] && buffers[name].filter(Boolean)[0];
    if (!buf) {
      if (useElements) return playElement(name, v, vol, rate, o.delay || 0);
      // first use: wait for the clip to decode, then play it once if still relevant
      if (!o.retried) setTimeout(function () { o.retried = true; o.delay = 0; play(name, o); }, 250);
      return;
    }
    if (voices > 28) return;
    if (window.__sfxTrace) window.__sfxTrace.push(name);
    var src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime + (o.delay || 0);
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = vol;
    src.connect(g);
    var out = g;
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    out.connect(dry);
    if (o.wet !== 0) { var s = ctx.createGain(); s.gain.value = o.wet == null ? 1 : o.wet; out.connect(s); s.connect(wet); }
    voices++; src.onended = function () { voices--; };
    src.start(t);
  }
  function playElement(name, v, vol, rate, delay) {
    setTimeout(function () {
      try {
        var a = new Audio(url(name, v + 1));
        a.volume = Math.max(0, Math.min(1, vol * level())); a.preservesPitch = false; a.playbackRate = rate;
        var p = a.play(); if (p && p.catch) p.catch(function () {});
      } catch (e) { /* audio is optional */ }
    }, delay * 1000);
  }

  // ---------- dice: wooden cubes bouncing on a table (modal synthesis) ----------
  var diceBufs = [];
  function buildDice() {
    var sr = ctx.sampleRate;
    for (var v = 0; v < 6; v++) {
      var len = Math.floor(sr * 0.75), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      var modes = [1900 + Math.random() * 500, 3300 + Math.random() * 600, 5200 + Math.random() * 900], t = Math.random() * 0.03, amp = 1, gap = 0.075 + Math.random() * 0.03;
      for (var k = 0; k < 7 && t < 0.6; k++) {
        var start = Math.floor(t * sr);
        for (var m = 0; m < modes.length; m++) {
          var f = modes[m] * (0.97 + Math.random() * 0.06), tau = 0.01 + 0.016 / (m + 1), a = amp * [0.5, 0.32, 0.18][m];
          for (var i = 0; i < sr * 0.08 && start + i < len; i++) d[start + i] += a * Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (sr * tau));
        }
        for (var n = 0; n < sr * 0.003 && start + n < len; n++) d[start + n] += amp * 0.6 * (Math.random() * 2 - 1) * (1 - n / (sr * 0.003));
        for (var q = 0; q < sr * 0.03 && start + q < len; q++) d[start + q] += amp * 0.35 * Math.sin(2 * Math.PI * 170 * q / sr) * Math.exp(-q / (sr * 0.012));
        t += gap; gap *= 0.62 + Math.random() * 0.1; amp *= 0.55 + Math.random() * 0.1;
      }
      // a short roll across the felt as the die settles
      var rs = Math.floor(t * sr);
      for (var z = 0; z < sr * 0.09 && rs + z < len; z++) d[rs + z] += 0.05 * (Math.random() * 2 - 1) * (1 - z / (sr * 0.09));
      var peak = 0; for (var p = 0; p < len; p++) peak = Math.max(peak, Math.abs(d[p]));
      for (var p2 = 0; p2 < len; p2++) d[p2] *= 0.8 / peak;
      diceBufs.push(buf);
    }
  }
  function dice(n) {
    if (!enabled() || !graph() || !diceBufs.length) return;
    if (ctx.state === "suspended") ctx.resume().catch(function () {});
    var count = Math.max(1, Math.min(5, n || 2));
    if (window.__sfxTrace) window.__sfxTrace.push("dice" + count);
    for (var i = 0; i < count; i++) {
      var src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.buffer = diceBufs[Math.floor(Math.random() * diceBufs.length)]; src.playbackRate.value = 0.9 + Math.random() * 0.25;
      g.gain.value = 0.34 / Math.sqrt(count);
      src.connect(g);
      if (p) { p.pan.value = (Math.random() - 0.5) * 0.6; g.connect(p); p.connect(dry); } else g.connect(dry);
      src.start(ctx.currentTime + i * 0.035 + Math.random() * 0.03);
    }
  }

  // ---------- ambience ----------
  function setAmbience(name) {
    if (!ctx && !name) return;
    if (name && !enabled()) name = null;
    if (ambience.name === name) return;
    if (ambience.node) { var old = ambience; old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(function () { try { old.node.stop(); } catch (e) {} }, 3000); }
    ambience = { name: null, node: null, gain: null };
    if (!name || !graph() || useElements) return;
    load(name);
    var tries = 0;
    (function start() {
      var buf = buffers[name] && buffers[name][0];
      if (!buf) { if (tries++ < 40) setTimeout(start, 250); return; }
      if (ambience.name !== null) return;
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = true; src.loopStart = 1.5; src.loopEnd = buf.duration - 1.5;
      g.gain.value = 0; g.gain.setTargetAtTime(gainOf(name) * 0.5, ctx.currentTime, 1.2);
      src.connect(g); g.connect(master); src.start();
      ambience = { name: name, node: src, gain: g };
    })();
  }
  function updateAmbience() { setAmbience(!enabled() ? null : UI.screen === "battle" ? "amb_field" : UI.screen === "campaign" ? "amb_wind" : null); }

  // ---------- game events ----------
  function unitOf(b, uid) { return b && (b.unit(uid) || b.dead.find(function (u) { return u.uid === uid; })); }
  function mounted(u) { return u && /Cavalry|Chariot|Hounds/.test(u.type); }
  function panOf(u) { return u && UI.renderer && UI.renderer.cw ? Math.max(-0.8, Math.min(0.8, (UI.renderer.toScreen(u.x, u.y).x / UI.renderer.cw - 0.5) * 1.6)) : 0; }
  function release(u, commander) {
    var w = commander && u.commander ? u.commander.ranged || "" : u.ranged || "", id = u.id || "", pan = panOf(u);
    if (/cannon|mortar/.test(id)) { play("gun", { rate: 0.55, vol: 1.4, pan: pan }); return 0.25; }
    if (/bolt/.test(id)) { play("ballista", { pan: pan }); return 0.35; }
    if (/stone|catapult|lobber/.test(id)) { play("catapult", { pan: pan }); return 0.6; }
    if (/Handgun|Pistol|Gun/i.test(w)) { play("gun", { pan: pan, vol: 0.9 }); if (u.models > 6) play("gun", { delay: 0.12, vol: 0.7, pan: pan }); return 0.15; }
    if (/Crossbow/.test(w)) { play("bow", { rate: 1.25, pan: pan }); play("arrow", { delay: 0.12, pan: pan }); return 0.4; }
    play("bow", { pan: pan }); play("arrow", { delay: 0.18, pan: pan, vol: 0.8 }); return 0.55;
  }
  function meleeHits(att, hits) {
    var w = att ? att.weapon || "" : "", pan = panOf(att), n = Math.min(4, hits);
    if (!n) { play("swing", { pan: pan, vol: 0.8 }); return; }
    for (var i = 0; i < n; i++) {
      var d = i * 0.09 + Math.random() * 0.04;
      if (/Spear|Halberd|Lance/.test(w) && i % 2 === 0) play("thrust", { delay: d, pan: pan, max: 4 });
      else if (/Fangs|Claws/.test(w)) play("flesh", { delay: d, pan: pan, max: 4 });
      else play("clash", { delay: d, pan: pan, max: 4 });
    }
  }
  function onEvent(b, ev) {
    var u, t;
    switch (ev.type) {
      case "roll": {
        var sp = ev.spec || {}, res = ev.res || {};
        dice(sp.n || (sp.kind === "discipline" || sp.kind === "rally" || sp.kind === "flight" || sp.kind === "initiative" ? 2 : 1));
        u = unitOf(b, sp.uid);
        if (sp.kind === "hits" && sp.ranged && u) release(u, /commander|fires/.test(sp.label || "") && !u.ranged);
        else if (sp.kind === "hits" && u) meleeHits(u, res.hits || 0);
        else if (sp.kind === "saves") {
          var failed = res.failed || 0, saved = Math.max(0, (sp.n || 0) - failed), pan = panOf(u);
          for (var s = 0; s < Math.min(3, saved); s++) play("shield", { delay: 0.1 + s * 0.08, pan: pan, max: 3 });
          for (var f = 0; f < Math.min(3, failed); f++) play("flesh", { delay: 0.15 + f * 0.09, pan: pan, max: 3, vol: 0.8 });
        } else if (sp.kind === "casting" && res.ok !== false) play("spell", { vol: 0.8 });
        break;
      }
      case "shoot":
        // the bow, gun or engine sounded when the hit dice were rolled; now the missiles land
        if (!SOVL.FX) impacts(unitOf(b, ev.to), ev, 0.2); // with js/fx.js the missiles sound as they land
        break;
      case "move":
        u = unitOf(b, ev.uid);
        if (!u || ev.undo) break;
        if (mounted(u)) play("gallop", { vol: 0.7, pan: panOf(u), max: 1 });
        else if (!SOVL.isSingle(u.type) || SOVL.commanderOnly(u)) play("march", { vol: 0.8, pan: panOf(u), max: 1 });
        break;
      case "declare":
        u = unitOf(b, ev.from); t = unitOf(b, ev.to);
        if (u && u.side === UI.playerSide) play("horn", { max: 1 });
        else if (t && t.side === UI.playerSide) play("alarm_horn", { max: 1, vol: 0.8 });
        if (mounted(u)) play("neigh", { delay: 0.5, pan: panOf(u), max: 1 });
        break;
      case "charge":
        u = unitOf(b, ev.uid);
        if (!u) break;
        play(mounted(u) ? "gallop" : "run", { pan: panOf(u), max: 2 });
        play("clash", { delay: 0.45, pan: panOf(u), max: 3 }); play("shield", { delay: 0.5, pan: panOf(u), max: 3 });
        break;
      case "flee":
        u = unitOf(b, ev.uid);
        if (u) play(mounted(u) ? "gallop" : "run", { pan: panOf(u), rate: 1.1, max: 1 });
        break;
      case "wounds":
        u = unitOf(b, ev.uid);
        if (ev.killed && u && Math.random() < 0.5) play(mounted(u) ? "horse_death" : "death", { delay: 0.25, pan: panOf(u), max: 1, vol: 0.8 });
        break;
      case "destroy":
        u = unitOf(b, ev.uid);
        if (u && ev.how !== "fled") play(mounted(u) ? "horse_death" : "death", { pan: panOf(u), max: 1 });
        break;
      case "commanderDeath": play("hero_dead", { max: 1 }); break;
      case "spell": if (ev.ok) { var S = SOVL.SPELLS[ev.spell] || {}; play(S.kind === "bolt" ? "fire" : "spell", { pan: panOf(unitOf(b, ev.to)) }); } break;
      case "summon": play("spell", { rate: 0.8 }); break;
      case "ability": play("horn", { rate: 1.1, vol: 0.6, max: 1 }); break;
      case "phase":
        if (ev.phase === "charge" && ev.turn > 1) play("turn", { max: 1, vol: 0.8 });
        else if (ev.phase === "combat") play("clash", { vol: 0.6, max: 1 });
        break;
      case "end":
        var r = ev.result || b.result || {};
        play(r.winner === UI.playerSide ? "victory" : "defeat", { max: 1, fixed: true });
        break;
    }
  }
  function impacts(t, ev, delay) {
    if (!t) return;
    var pan = panOf(t);
    if (ev.hits) { play("arrow_hit", { delay: delay + 0.35, pan: pan, max: 3 }); if (ev.hits > 2) play("arrow_hit", { delay: delay + 0.45, pan: pan, max: 3, vol: 0.7 }); }
    else play("arrow_miss", { delay: delay + 0.35, pan: pan, max: 3 });
  }

  // Replace the old synthesised cues. Named cues map to clips; battle events are read
  // straight from the engine's event queue before the interface consumes it.
  UI.sound = function (kind) {
    switch (kind) {
      case "select": play("ui_select", { wet: 0 }); break;
      case "move": play("march", { vol: 0.6, max: 1 }); break;
      case "combat": play("clash", { max: 2 }); play("shield", { delay: 0.08 }); break;
      case "horn": play("horn", { max: 1 }); break;
      case "dice": dice(2); break;
      default: if (COUNT[kind]) play(kind);
    }
  };
  UI.sfx = { play: play, dice: dice, preload: preload, ambience: updateAmbience, loaded: function () { var n = 0, missing = []; Object.keys(COUNT).forEach(function (k) { for (var i = 0; i < COUNT[k]; i++) { if (buffers[k] && buffers[k][i]) n++; else missing.push(k + "_" + (i + 1)); } }); return { loaded: n, missing: missing, fallback: useElements, ambience: ambience.name }; } };
  var processEvents = UI.processEvents;
  UI.processEvents = function () {
    var b = UI.battle;
    if (b && b.events.length && enabled()) { var evs = b.events.slice(); try { evs.forEach(function (ev) { onEvent(b, ev); }); } catch (e) { /* sound never blocks play */ } }
    return processEvents.apply(UI, arguments);
  };

  // interface: buttons, modals, deployment, errors
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button, .faction-card, .unit-card, .node.avail");
    if (!btn || btn.disabled) return;
    if (btn.closest("#dice-panel")) return; // the dice speak for themselves
    play(/Back|Menu|Leave|Cancel|←/.test(btn.textContent || "") ? "ui_back" : "ui_press", { wet: 0 });
  }, true);
  var modal = UI.modal, closeModal = UI.closeModal;
  UI.modal = function () { play("ui_open", { wet: 0, max: 1 }); return modal.apply(UI, arguments); };
  UI.closeModal = function () { if (UI.modalOpen) play("ui_close", { wet: 0, max: 1, vol: 0.7 }); return closeModal.apply(UI, arguments); };
  var hint = UI.hint;
  UI.hint = function (text) { if (/^(Cannot|No |Not |That position|Finish the current)/.test(text || "")) play("ui_error", { wet: 0, max: 1, vol: 0.8 }); return hint.apply(UI, arguments); };
  var place = SOVL.Battle.prototype.placeUnit;
  SOVL.Battle.prototype.placeUnit = function () { var ok = place.apply(this, arguments); if (ok && this === UI.battle && this.phase === "deploy") play("ui_drop", { wet: 0, max: 1 }); return ok; };

  // campaign: the road, the merchant, treasure and promotions
  if (SOVL.Campaign) {
    var C = SOVL.Campaign;
    var moveTo = C.moveTo; C.moveTo = function () { var n = moveTo.apply(C, arguments); if (n) { play("travel", { max: 1 }); play("march", { delay: 0.1, vol: 0.5, max: 1 }); } return n; };
    var buy = C.buy; C.buy = function () { var err = buy.apply(C, arguments); play(err ? "ui_error" : "coin", { wet: 0, max: 1 }); return err; };
    var reinforce = C.reinforce; C.reinforce = function () { var err = reinforce.apply(C, arguments); play(err ? "ui_error" : "coin", { wet: 0, max: 1 }); return err; };
    var treasure = C.treasure; C.treasure = function () { play("reward", { max: 1 }); return treasure.apply(C, arguments); };
    var learn = C.learnTrait; C.learnTrait = function () { play("level_up", { max: 1 }); return learn.apply(C, arguments); };
    var camp = C.camp; C.camp = function () { play("fire", { vol: 0.5, max: 1 }); return camp.apply(C, arguments); };
  }

  // Audio may only start after a gesture: warm up the graph and clips on the first one.
  function unlock() { if (!enabled()) return; if (graph() && ctx.state === "suspended") ctx.resume().catch(function () {}); preload(); updateAmbience(); }
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", function () { if (!ctx) return; if (document.hidden) ctx.suspend().catch(function () {}); else ctx.resume().catch(function () {}); updateAmbience(); });
  var show = UI.show;
  UI.show = function () { var r = show.apply(UI, arguments); if (ctx) updateAmbience(); return r; };
  var apply = UI.applySettings;
  UI.applySettings = function () { var r = apply.apply(UI, arguments); if (master) master.gain.value = level(); if (ctx) updateAmbience(); return r; };
})();
