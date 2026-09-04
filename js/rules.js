// Dice and the core SOVL resolution tables (pure functions, no state).
'use strict';
(function () {
  var R = {};
  // Seedable RNG (mulberry32) so battles can be replayed in tests.
  R.makeRng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s += 0x6D2B79F5; var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  R.rng = Math.random;
  R.setSeed = function (seed) { R.rng = seed == null ? Math.random : R.makeRng(seed); };
  R.d6 = function () { return 1 + Math.floor(R.rng() * 6); };
  R.d3 = function () { return 1 + Math.floor(R.rng() * 3); };
  R.dice = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(R.d6()); return a; };
  R.sum = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; };
  // Parse "2d3+1", "1d6", "3" etc.
  R.rollExpr = function (expr) {
    if (typeof expr === 'number') return { total: expr, dice: [] };
    var m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(String(expr).trim());
    if (!m) return { total: parseInt(expr, 10) || 0, dice: [] };
    var n = parseInt(m[1] || '1', 10), sides = parseInt(m[2], 10), mod = parseInt(m[3] || '0', 10), dice = [], total = mod;
    for (var i = 0; i < n; i++) { var v = 1 + Math.floor(R.rng() * sides); dice.push(v); total += v; }
    return { total: Math.max(0, total), dice: dice };
  };
  R.pick = function (arr) { return arr[Math.floor(R.rng() * arr.length)]; };
  R.shuffle = function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(R.rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };

  // Melee to-hit target: higher Skill hits on 3+, otherwise 4+.
  R.meleeHitTarget = function (attSkill, defSkill) { return attSkill > defSkill ? 3 : 4; };
  // Damage Save target for the defender given attacker Power and defender Defense.
  R.saveTarget = function (power, defense) {
    var diff = power - defense;
    if (diff > 2) return 6;
    if (diff > 0) return 5;
    if (diff === 0) return 4;
    if (diff >= -2) return 3;
    return 2;
  };
  // Ranged to-hit target: 4+, modified by skill relative to 3, long range, cover, etc.
  R.rangedHitTarget = function (skill, mods) {
    var t = 4 - (skill - 3) + (mods || 0);
    return Math.max(2, Math.min(7, t)); // 7 = impossible
  };
  R.pHit = function (target) { return target >= 7 ? 0 : (7 - target) / 6; };
  // Roll n dice against target with optional re-roll rules. Returns detail.
  // opts: rerollMiss (bool), rerollHit (bool - opponent forces re-roll of successes)
  R.rollAgainst = function (n, target, opts) {
    opts = opts || {};
    var dice = [], rerolled = [], hits = 0;
    for (var i = 0; i < n; i++) {
      var v = R.d6(), ok = target < 7 && v >= target;
      if (!ok && opts.rerollMiss) { var v2 = R.d6(); rerolled.push([v, v2]); v = v2; ok = target < 7 && v >= target; }
      else if (ok && opts.rerollHit) { var v3 = R.d6(); rerolled.push([v, v3]); v = v3; ok = target < 7 && v >= target; }
      dice.push(v);
      if (ok) hits++;
    }
    return { dice: dice, hits: hits, target: target, rerolled: rerolled };
  };
  // Damage saves: n saves at target; poison forces re-roll of 6s; rerollFail lets defender re-roll failures; halberd caps at 4+.
  R.rollSaves = function (n, target, opts) {
    opts = opts || {};
    if (opts.saveBonus) target = Math.max(2, target - opts.saveBonus);
    if (opts.halberd && target < 4) target = 4;
    var dice = [], saved = 0;
    for (var i = 0; i < n; i++) {
      var v = R.d6(), ok = v >= target;
      if (ok && opts.poison && v === 6) { v = R.d6(); ok = v >= target; }
      if (!ok && opts.rerollFail) { v = R.d6(); ok = v >= target; }
      dice.push(v);
      if (ok) saved++;
    }
    return { dice: dice, saved: saved, failed: n - saved, target: target };
  };
  // Discipline test: 2d6 <= value. Returns detail.
  R.disciplineTest = function (value, opts) {
    opts = opts || {};
    var d = R.dice(2), total = R.sum(d), ok = total <= value, rerolled = null;
    if (!ok && opts.reroll) { rerolled = d; d = R.dice(2); total = R.sum(d); ok = total <= value; }
    return { dice: d, total: total, target: value, ok: ok, rerolled: rerolled };
  };
  // Rank bonus: +1 per rank with at least 3 models, including the first.
  R.rankBonus = function (models, files) {
    if (files < 3) return 0;
    var full = Math.floor(models / files), rem = models % files;
    return full + (rem >= 3 ? 1 : 0);
  };
  SOVL.R = R;
})();
