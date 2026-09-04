// AI opponent. Drives one side of a Battle by calling the engine's public actions.
'use strict';
(function () {
  var G = SOVL.G, R = SOVL.R;
  function AI(battle, side, opts) { this.b = battle; this.side = side; this.opts = opts || {}; this.aggression = this.opts.aggression != null ? this.opts.aggression : 0.5; }
  SOVL.AI = AI;
  var P = AI.prototype;

  // ---- evaluation helpers ----
  function pHit(t) { return t >= 7 ? 0 : (7 - t) / 6; }
  function pFailSave(t) { return (t - 1) / 6; }
  P.unitValue = function (u) {
    var s = SOVL.effStats(u, this.b), v = (u.models * u.base.wd) * (1 + (s.pw + s.at) / 6) + (u.commander && u.commander.alive ? 10 : 0);
    if (u.ranged) v *= 1.2; if (u.type === 'War Machine') v *= 1.3;
    return v;
  };
  // Expected wounds dealt by attacker to defender in one melee round (approx).
  P.expectedMelee = function (att, def, charging, side) {
    var b = this.b, as = SOVL.effStats(att, b), ds = SOVL.effStats(def, b);
    var w = SOVL.WEAPONS[att.weapon] || SOVL.WEAPONS.Unarmed, pow = as.pw + (charging ? (w.chargePow || 0) : 0), at = as.at;
    if (charging) for (var i = 0; i < att.props.length; i++) { var p = SOVL.PROPS[att.props[i]]; if (p && p.chargePow) pow += p.chargePow; if (p && p.chargeAtt) at += p.chargeAtt; }
    var dice;
    if (SOVL.commanderOnly(att)) dice = 0;
    else if (SOVL.isSingle(att.type)) dice = at;
    else if (side === 'left' || side === 'right') dice = Math.ceil(att.models / att.files) * at; // (attacker's own front rank against target flank)
    else dice = Math.min(att.models, att.files) * at + Math.min(Math.max(0, att.models - att.files), att.files);
    if (side === 'left' || side === 'right') dice = Math.min(att.models, att.files) * at + Math.min(Math.max(0, att.models - att.files), att.files);
    var ph = pHit(R.meleeHitTarget(as.sk, ds.sk)), pf = pFailSave(R.saveTarget(pow, ds.df));
    var exp = dice * ph * pf;
    if (att.commander && att.commander.alive) { var cs = SOVL.effCmdStats(att, b); exp += cs.at * pHit(R.meleeHitTarget(cs.sk, ds.sk)) * pFailSave(R.saveTarget(cs.pw + (charging ? 1 : 0), ds.df)); }
    return exp;
  };
  P.expectedRetaliation = function (att, def, side) {
    // defender's attacks back: front engaged => full; flank => ranks only; rear => none
    var b = this.b, as = SOVL.effStats(att, b), ds = SOVL.effStats(def, b), dw = SOVL.WEAPONS[def.weapon] || SOVL.WEAPONS.Unarmed;
    var dice;
    if (side === 'rear') dice = 0;
    else if (SOVL.isSingle(def.type) || SOVL.commanderOnly(def)) dice = ds.at;
    else if (side === 'front') dice = Math.min(def.models, def.files) * ds.at + Math.min(Math.max(0, def.models - def.files), def.files);
    else dice = Math.ceil(def.models / def.files) * ds.at;
    var exp = dice * pHit(R.meleeHitTarget(ds.sk, as.sk)) * pFailSave(R.saveTarget(ds.pw, as.df));
    if (def.commander && def.commander.alive && side !== 'rear') { var cs = SOVL.effCmdStats(def, b); exp += cs.at * pHit(R.meleeHitTarget(cs.sk, as.sk)) * pFailSave(R.saveTarget(cs.pw, as.df)); }
    return exp;
  };
  P.chargeScore = function (u, t, info) {
    var dealt = this.expectedMelee(u, t, true, info.side), taken = this.expectedRetaliation(u, t, info.side);
    var score = dealt - taken * 0.8;
    if (info.side !== 'front') score += 1.5 + (info.side === 'rear' ? 1 : 0);
    if (t.ranged || t.type === 'War Machine') score += 1.0;
    if (t.fleeing) score += 3;
    if (this.b.isEngaged(t)) score += 1.0; // pile in
    var us = SOVL.effStats(u, this.b), ts = SOVL.effStats(t, this.b);
    // discipline risk: losing the combat when we are the fragile side
    var rb = R.rankBonus(u.models, u.files);
    score += (us.ds + rb - 9) * 0.15;
    if (u.commander && u.commander.alive && dealt < taken) score -= 1.5;
    score += (this.aggression - 0.5) * 2;
    // time pressure: an army that never engages cannot win on points
    if (this.b.turn >= 5) score += 1.0;
    if (this.b.armyStrength(u.side) >= this.b.armyStrength(t.side) * 1.2) score += 0.8;
    return score;
  };

  // ---- deployment ----
  P.deploy = function () { this.b.autoDeploy(this.side); };

  // ---- charge phase ----
  P.chargeAction = function () {
    var b = this.b, self = this, best = null, bestScore = -Infinity;
    // reactions first: flee or counter against incoming charges
    var mine = b.unitsOf(this.side);
    for (var i = 0; i < mine.length; i++) {
      var u = mine[i], inc = b.chargeAgainst(u);
      if (!inc.length || u.declaredCharge) continue;
      var charger = b.unit(inc[0].charger);
      var cc = b.canCounterCharge(u), cf = b.canFlee(u);
      var dealt = this.expectedMelee(u, charger, true, 'front'), taken = this.expectedRetaliation(u, charger, 'front');
      if (cc && dealt >= taken * 0.9) { return b.declareCounterCharge(u.uid); }
      var dealtStanding = this.expectedMelee(u, charger, false, 'front');
      var incoming = this.expectedMelee(charger, u, true, inc[0].side);
      if (cf && (u.ranged || u.type === 'War Machine' || incoming > dealtStanding * 2 + 2) && incoming > u.models * 0.25) {
        // fleeing is only worth it with room to run and a real chance to outpace the pursuit
        var edge = Math.min(u.x, u.y, SOVL.TABLE.w - u.x, SOVL.TABLE.h - u.y), nDice = Math.max(1, Math.floor(u.typeInfo.move / 4));
        var expFlight = nDice * 3.5, pursuit = b.chargeRange(charger) - inc[0].dist;
        if (edge > nDice * 6 + 1 && expFlight > pursuit + 2) return b.declareFlee(u.uid);
      }
    }
    for (var j = 0; j < mine.length; j++) {
      var c = mine[j]; if (!b.canDeclareCharge(c)) continue;
      var targets = b.validChargeTargets(c);
      for (var k = 0; k < targets.length; k++) {
        var s = this.chargeScore(c, targets[k].unit, targets[k].info);
        if (s > bestScore) { bestScore = s; best = { u: c, t: targets[k].unit }; }
      }
    }
    if (best && bestScore > 0.2) return b.declareCharge(best.u.uid, best.t.uid);
    return b.passCharge();
  };

  // ---- strategic phase ----
  P.nearestEnemy = function (u) {
    var best = null, bd = Infinity, en = this.b.enemiesOf(this.side);
    for (var i = 0; i < en.length; i++) { var d = G.dist(u, en[i]); if (d < bd) { bd = d; best = en[i]; } }
    return best;
  };
  P.threatAt = function (rect, u) {
    // sum of enemy charge capability on this rect next turn
    var b = this.b, en = b.enemiesOf(this.side), th = 0;
    for (var i = 0; i < en.length; i++) {
      var e = en[i]; if (e.fleeing || b.isEngaged(e) || SOVL.hasProp(e, 'Crewed Weapon')) continue;
      var range = b.chargeRange(e) + 1, d = G.dist(G.frontCenter(e), rect) - Math.max(rect.w, rect.d) / 2;
      if (d <= range) th += this.expectedMelee(e, u, true, 'front');
    }
    return th;
  };
  P.pickUnit = function () {
    var b = this.b, cands = b.activatable(this.side);
    if (!cands.length) return null;
    // priority: fleeing (rally), shooters with targets, spellcasters, then melee
    var self = this;
    cands.sort(function (x, y) { return self.activationPriority(y) - self.activationPriority(x); });
    return cands[0];
  };
  P.activationPriority = function (u) {
    var b = this.b, p = 0;
    if (u.fleeing) return 10;
    if (b.isEngaged(u)) return 9; // just spells
    if (u.type === 'War Machine' && this.bestShot(u)) return 8;
    if (u.ranged && this.bestShot(u)) return 7;
    if (b.canCast(u)) p += 2;
    return p + (SOVL.hasProp(u, 'Flying') ? 1 : 0);
  };
  P.bestShot = function (u, commander) {
    var b = this.b, best = null, bs = 0, en = b.enemiesOf(this.side);
    for (var i = 0; i < en.length; i++) {
      var t = en[i], info = b.rangedInfo(u, t, commander); if (!info.ok) continue;
      var w = info.weapon, ts = SOVL.effStats(t, b);
      var expHits = (w.perModel || commander) ? info.shooters * (w.shots || 1) * pHit(info.target) : (w.shots || 1) * pHit(info.target) * avgExpr(w.hits || '1');
      var exp = expHits * pFailSave(R.saveTarget(w.pow, ts.df)) * ((SOVL.hasProp(u, 'Lethal Shots') && t.base.wd > 1) ? 2 : 1);
      var val = exp * (1 + (this.unitValue(t) / Math.max(1, t.models * t.base.wd)) * 0.3) + (t.commander && t.commander.alive ? 0.2 : 0);
      if (val > bs) { bs = val; best = { t: t, info: info, exp: exp }; }
    }
    return best;
  };
  function avgExpr(expr) { var m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(String(expr)); if (!m) return parseFloat(expr) || 0; var n = parseInt(m[1] || '1', 10), s = parseInt(m[2], 10), mod = parseInt(m[3] || '0', 10); return n * (s + 1) / 2 + mod; }

  P.strategicAction = function () {
    var b = this.b, u = this.pickUnit();
    if (!u) return b.passStrategic();
    var r = b.beginActivation(u.uid);
    if (!r.ok) return b.passStrategic();
    if (u.fleeing) return b.rally(u.uid);
    this.castSpells(u);
    this.useAbilities(u);
    if (b.isEngaged(u)) return b.endActivation();
    var shot = null;
    if (u.ranged) {
      shot = this.bestShot(u);
      // shooters: shoot first if a target exists, otherwise reposition
      if (shot) b.shoot(u.uid, shot.t.uid);
    }
    if (u.commander && u.commander.alive && u.commander.ranged && !u.usedSpell) { var cs = this.bestShot(u, true); if (cs) b.shoot(u.uid, cs.t.uid, true); }
    if (b.activeUnit !== u.uid || u.removed) return; // destroyed or something odd
    this.moveUnit(u, !!shot);
    if (u.ranged && !shot && !u.usedRanged && b.activeUnit === u.uid) { var s2 = this.bestShot(u); if (s2) b.shoot(u.uid, s2.t.uid); }
    if (b.activeUnit === u.uid) b.endActivation();
  };
  P.castSpells = function (u) {
    var b = this.b; if (!b.canCast(u)) return;
    var spells = u.commander.spells, best = null, bs = 0;
    for (var i = 0; i < spells.length; i++) {
      var name = spells[i], sp = SOVL.SPELLS[name]; if (u.spellsCastThisTurn[name]) continue;
      var targets = b.spellTargets(u, name);
      for (var j = 0; j < targets.length; j++) {
        var t = targets[j], v = 0;
        if (sp.kind === 'bolt') v = avgExpr(sp.hits) * pFailSave(R.saveTarget(sp.pow, SOVL.effStats(t, b).df)) * (sp.lethal && t.base.wd > 1 ? 2 : 1) + (t.commander ? 0.5 : 0);
        else if (sp.kind === 'hex') v = (b.isEngaged(t) || G.dist(u, t) < 14 ? 1.5 : 0.6) + (sp.effect.hits ? avgExpr(sp.effect.hits) * pFailSave(R.saveTarget(sp.effect.pow, SOVL.effStats(t, b).df)) : 0);
        else if (sp.kind === 'buff') v = b.isEngaged(t) ? 2.0 : (this.threatAt(t, t) > 0 ? 1.2 : (sp.effect.shrouded ? 0.3 : 0.4));
        else if (sp.kind === 'heal') v = (t.maxModels - t.models) * 0.6;
        else if (sp.kind === 'summon') v = 2.2;
        v *= pTwoD6AtLeast(sp.cv - u.commander.caster);
        if (v > bs) { bs = v; best = { name: name, t: t }; }
      }
    }
    if (best && bs > 0.6) b.cast(u.uid, best.name, best.t.uid);
  };
  function pTwoD6AtLeast(n) { if (n <= 2) return 1; if (n > 12) return 0; var c = 0; for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) if (a + b >= n) c++; return c / 36; }
  P.useAbilities = function (u) {
    var b = this.b, abs = b.unitAbilities(u).concat(b.commanderAbilities(u)), self = this;
    abs.forEach(function (ab) {
      var en = b.enemiesOf(self.side), near = en.some(function (e) { return G.dist(u, e) < 16; });
      switch (ab.id) {
        case 'reposition': if (!self.bestShot(u) && near) b.useAbility(u.uid, ab.id); break;
        case 'fullsteam': if (near) b.useAbility(u.uid, ab.id); break;
        case 'web': { var ts = b.abilityTargets(u, 'web'); if (ts.length) { ts.sort(function (x, y) { return self.unitValue(y) - self.unitValue(x); }); b.useAbility(u.uid, ab.id, ts[0].uid); } break; }
        case 'mountains_will': if (b.contacts.length >= 2 || (b.turn >= 3 && near)) b.useAbility(u.uid, ab.id); break;
        case 'inspire_valor': if (b.contacts.length >= 2) b.useAbility(u.uid, ab.id); break;
        case 'warcry': if (b.contacts.length >= 2) b.useAbility(u.uid, ab.id); break;
        case 'power_of_many': if (b.contacts.length >= 2) b.useAbility(u.uid, ab.id); break;
        case 'furious_charge': if (b.isEngaged(u)) b.useAbility(u.uid, ab.id); break;
        case 'rallying_cry': { var fl = b.abilityTargets(u, 'rallying_cry'); if (fl.length) b.useAbility(u.uid, ab.id, fl[0].uid); break; }
        case 'mech_expertise': { var wm = b.abilityTargets(u, 'mech_expertise').filter(function (w) { return !SOVL.hasEffect(w, 'reroll1s'); }); if (wm.length) b.useAbility(u.uid, ab.id, wm[0].uid); break; }
      }
    });
  };
  P.moveUnit = function (u, hasShot) {
    var b = this.b; if (u.moveLeft <= 0 && b.moveAllowanceZero) return;
    var enemy = this.nearestEnemy(u); if (!enemy) return;
    var isShooter = !!u.ranged && !/Pistol/.test(u.ranged), isMachine = u.type === 'War Machine';
    if (isMachine) { if (!hasShot) { this.faceToward(u, enemy); } return; }
    if (isShooter) {
      if (hasShot) { return; }
      // move to get a shot: toward the nearest enemy but keep distance
      var w = SOVL.RANGED[u.ranged], d = G.dist(u, enemy);
      if (d > w.range * 0.8) this.advanceToward(u, enemy, Math.max(0, d - w.range * 0.7));
      else if (d < b.chargeRange(enemy) + 2 && u.moveLeft > 2) this.retreatFrom(u, enemy);
      else this.faceToward(u, enemy);
      return;
    }
    // melee: approach, preferring to stop outside enemy charge range unless we can charge next turn
    var dist = G.dist(G.frontCenter(u), enemy), ourRange = b.chargeRange(u), theirRange = b.chargeRange(enemy);
    var strength = b.armyStrength(this.side), theirs = b.armyStrength(1 - this.side);
    var pressing = strength >= theirs * 0.9 || b.turn >= 3 || this.aggression > 0.7;
    var moveMax = u.moveLeft;
    var stopAt = null;
    // only hang back while clearly weaker, early in the battle, against a faster enemy
    if (!pressing && theirRange >= ourRange && dist - moveMax < theirRange + 1 && dist > theirRange + 1) stopAt = theirRange + 1.5;
    // flank seeking: if enemy is engaged with a friend, try to aim at its flank
    var target = { x: enemy.x, y: enemy.y };
    if (b.isEngaged(enemy)) {
      var sides = ['left', 'right', 'rear'].filter(function (s) { return !b.sideEngaged(enemy, s); });
      if (sides.length) { var sd = G.side(enemy, sides[0]); target = { x: sd.c.x + sd.n.x * (u.d / 2 + ourRange * 0.5), y: sd.c.y + sd.n.y * (u.d / 2 + ourRange * 0.5) }; }
    }
    var toMove = stopAt != null ? Math.max(0, dist - stopAt) : moveMax;
    if (toMove <= 0.3) { this.faceToward(u, enemy); return; }
    this.advanceToward(u, target, toMove);
  };
  P.faceToward = function (u, p) {
    var b = this.b, mv = b.previewMove(u.uid, p, true);
    if (mv.ok && mv.pivots > 0) b.applyMove(u.uid, mv);
  };
  P.advanceToward = function (u, p, maxDist) {
    var b = this.b, guard = 0, self = this;
    while (guard++ < 4 && u.moveLeft > 0.3 && maxDist > 0.3) {
      var ang = Math.atan2(p.y - u.y, p.x - u.x), dist = Math.min(maxDist, G.dist(u, p));
      var tgt = { x: u.x + Math.cos(ang) * dist, y: u.y + Math.sin(ang) * dist };
      var mv = b.previewMove(u.uid, tgt, false);
      // steer around obstacles (terrain, friends) when the direct line is blocked
      if (!mv.ok || mv.advance < Math.min(1.5, u.moveLeft * 0.5)) {
        var alt = this.steer(u, p, ang, dist);
        if (alt && (!mv.ok || alt.advance > mv.advance + 0.5)) mv = alt;
      }
      if (!mv.ok || (mv.advance < 0.3 && mv.pivots === 0)) break;
      b.applyMove(u.uid, mv); maxDist -= mv.advance;
      if (mv.advance < 0.3) break;
    }
  };
  // Try alternative headings; pick the one that ends closest to p while actually moving.
  P.steer = function (u, p, ang, dist) {
    var b = this.b, best = null, bestScore = Infinity, offs = [0.5, -0.5, 0.9, -0.9, 1.3, -1.3, 1.6, -1.6];
    for (var i = 0; i < offs.length; i++) {
      var a = ang + offs[i], tgt = { x: u.x + Math.cos(a) * dist, y: u.y + Math.sin(a) * dist };
      var mv = b.previewMove(u.uid, tgt, false);
      if (!mv.ok || mv.advance < 1) continue;
      var end = G.dist({ x: mv.x, y: mv.y }, p) + Math.abs(offs[i]) * 0.8;
      if (end < bestScore) { bestScore = end; best = mv; }
    }
    return best;
  };
  P.retreatFrom = function (u, enemy) {
    var b = this.b, ang = Math.atan2(u.y - enemy.y, u.x - enemy.x), d = Math.max(2, u.moveLeft - 2 * u.typeInfo.pivot * 2);
    var tgt = { x: u.x + Math.cos(ang) * d, y: u.y + Math.sin(ang) * d };
    var mv = b.previewMove(u.uid, tgt, false);
    if (mv.ok) b.applyMove(u.uid, mv);
    // then face the enemy again if we can afford it
    this.faceToward(u, enemy);
  };

  // Take one action in whatever phase we are in; returns false when it's not our turn.
  P.step = function () {
    var b = this.b;
    if (b.phase === 'end' || b.active !== this.side) return false;
    if (b.phase === 'charge') { this.chargeAction(); return true; }
    if (b.phase === 'strategic') { this.strategicAction(); return true; }
    return false;
  };
})();
