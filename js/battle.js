// Battle engine: state machine for a game of SOVL. No DOM access.
'use strict';
(function () {
  var G = SOVL.G, R = SOVL.R;
  var TABLE = SOVL.TABLE;
  var uidCounter = 1;

  function findUnitDef(factionId, unitId) {
    var f = SOVL.FACTION_DATA[factionId];
    for (var i = 0; i < f.sections.length; i++) {
      var s = f.sections[i];
      for (var j = 0; j < s.units.length; j++) if (s.units[j].id === unitId) return s.units[j];
    }
    return null;
  }
  SOVL.findUnitDef = findUnitDef;
  function findSection(factionId, unitId) {
    var f = SOVL.FACTION_DATA[factionId];
    for (var i = 0; i < f.sections.length; i++) {
      var s = f.sections[i];
      for (var j = 0; j < s.units.length; j++) if (s.units[j].id === unitId) return s;
    }
    return null;
  }
  SOVL.findSection = findSection;
  function itemById(id) { for (var i = 0; i < SOVL.MAGIC_ITEMS.length; i++) if (SOVL.MAGIC_ITEMS[i].id === id) return SOVL.MAGIC_ITEMS[i]; return null; }
  function bannerById(id) { for (var i = 0; i < SOVL.BANNERS.length; i++) if (SOVL.BANNERS[i].id === id) return SOVL.BANNERS[i]; return null; }
  SOVL.itemById = itemById; SOVL.bannerById = bannerById;

  function isSingle(type) { var t = SOVL.UNIT_TYPES[type]; return t.maxFiles === 1; }

  // ---------- Unit construction ----------
  // entry: { id, models, weapon, ranged, upgrades:[], banner, files, vet, commander:{...} }
  function makeUnit(side, factionId, entry, opts) {
    opts = opts || {};
    var def = findUnitDef(factionId, entry.id);
    if (!def) throw new Error('Unknown unit ' + entry.id);
    var type = SOVL.UNIT_TYPES[def.type];
    var u = {
      uid: uidCounter++, side: side, faction: factionId, def: def, id: def.id, name: entry.name || def.name,
      type: def.type, typeInfo: type,
      base: { sk: def.stats[0], pw: def.stats[1], df: def.stats[2], at: def.stats[3], wd: def.stats[4], ds: def.stats[5] },
      weapon: entry.weapon || def.weapons[0].name,
      ranged: entry.ranged || (def.ranged.length ? def.ranged[0].name : null),
      props: def.props.slice(),
      upgrades: (entry.upgrades || []).slice(),
      banner: entry.banner ? bannerById(entry.banner) : null,
      vet: entry.vet || 0,
      models: entry.models || def.size[0], maxModels: entry.models || def.size[0],
      files: entry.files || Math.min(type.files, entry.models || def.size[0]),
      woundsOnCurrent: 0, killed: 0,
      commander: null,
      x: -1000, y: -1000, a: -Math.PI / 2, w: 1, d: 1,
      fleeing: false, activated: false, declaredCharge: false, chargedThisTurn: false, chargeTargetOf: null,
      effects: [], usedOnce: {}, usedAbility: false, usedRanged: false, usedSpell: false, spellsCastThisTurn: {},
      moveLeft: 0, inDifficultAtStart: false, combatRounds: 0, cost: entry.cost || 0, discMod: entry.discMod || 0,
      campaignRef: entry.ref || null, isRetinue: !!entry.isRetinue
    };
    if (isSingle(def.type)) { u.files = 1; }
    if (def.type === 'Monstrous Infantry') u.files = Math.min(u.files, u.models);
    // upgrades: weapon-kind upgrades replace; ranged upgrades set ranged; prop upgrades add prop
    for (var i = 0; i < u.upgrades.length; i++) {
      var up = u.upgrades[i];
      if (SOVL.WEAPONS[up]) u.weapon = up;
      else if (SOVL.RANGED[up]) u.ranged = up;
      else if (SOVL.PROPS[up]) u.props.push(up);
    }
    if (entry.extraProps) for (var k = 0; k < entry.extraProps.length; k++) if (u.props.indexOf(entry.extraProps[k]) < 0) u.props.push(entry.extraProps[k]);
    if (entry.commander) {
      var c = entry.commander, cdef = findUnitDef(factionId, c.id);
      u.commander = {
        def: cdef, id: cdef.id, name: c.name || cdef.name, title: cdef.name,
        base: { sk: cdef.stats[0], pw: cdef.stats[1], df: cdef.stats[2], at: cdef.stats[3], wd: cdef.stats[4], ds: cdef.stats[5] },
        weapon: c.weapon || cdef.weapons[0].name,
        ranged: c.ranged || (cdef.ranged.length ? cdef.ranged[0].name : null),
        props: cdef.props.slice(), upgrades: (c.upgrades || []).slice(),
        items: (c.items || []).map(itemById).filter(Boolean),
        spells: (c.spells || []).slice(), caster: cdef.caster || 0,
        wounds: 0, alive: true, vet: c.vet || 0, extraWounds: c.extraWounds || 0, costPts: c.cost || 0, ref: c.ref || null
      };
      for (var j = 0; j < u.commander.upgrades.length; j++) {
        var cu = u.commander.upgrades[j];
        if (SOVL.WEAPONS[cu]) u.commander.weapon = cu;
        else if (SOVL.RANGED[cu]) u.commander.ranged = cu;
        else if (SOVL.PROPS[cu]) u.commander.props.push(cu);
      }
      u.commander.maxWounds = u.commander.base.wd + u.commander.extraWounds;
    }
    refreshFootprint(u, false);
    return u;
  }
  SOVL.makeUnit = makeUnit;

  function unitAlive(u) { return u.models > 0 || (u.commander && u.commander.alive); }
  function commanderOnly(u) { return u.models <= 0 && u.commander && u.commander.alive; }
  function hasProp(u, p) { return u.props.indexOf(p) >= 0; }
  function cmdHasProp(u, p) { return u.commander && u.commander.props.indexOf(p) >= 0; }
  function ranks(u) { return u.models <= 0 ? (commanderOnly(u) ? 1 : 0) : Math.ceil(u.models / u.files); }

  function refreshFootprint(u, keepFront) {
    var front = keepFront ? G.frontCenter(u) : null;
    var base, files, rk;
    if (commanderOnly(u)) {
      var ct = SOVL.UNIT_TYPES[u.commander.def.type] || SOVL.UNIT_TYPES.Infantry;
      base = ct.base; files = 1; rk = 1;
    } else { base = u.typeInfo.base; files = Math.min(u.files, Math.max(1, u.models)); rk = Math.max(1, ranks(u)); }
    u.w = files * base[0] * SOVL.MM; u.d = rk * base[1] * SOVL.MM;
    if (front) { var f = G.fwd(u.a); u.x = front.x - f.x * u.d / 2; u.y = front.y - f.y * u.d / 2; }
  }
  SOVL.refreshFootprint = refreshFootprint;

  // ---------- Effective stats ----------
  function effectSum(u, key) {
    var s = 0;
    for (var i = 0; i < u.effects.length; i++) if (u.effects[i].effect[key]) s += (typeof u.effects[i].effect[key] === 'number' ? u.effects[i].effect[key] : 0);
    return s;
  }
  function hasEffect(u, key) { for (var i = 0; i < u.effects.length; i++) if (u.effects[i].effect[key]) return true; return false; }
  SOVL.hasEffect = hasEffect;
  function vetBonus(vet, key) {
    var b = 0, V = SOVL.CAMPAIGN.veteran;
    for (var i = 0; i < V.length && i < vet; i++) if (V[i][key]) b += V[i][key];
    return b;
  }
  function itemBonus(u, key) {
    if (!u.commander || !u.commander.alive) return 0;
    var b = 0;
    for (var i = 0; i < u.commander.items.length; i++) if (typeof u.commander.items[i].effect[key] === 'number') b += u.commander.items[i].effect[key];
    return b;
  }
  function cmdHasItemFlag(u, key) {
    if (!u.commander || !u.commander.alive) return false;
    for (var i = 0; i < u.commander.items.length; i++) if (u.commander.items[i].effect[key]) return true;
    return false;
  }
  SOVL.cmdHasItemFlag = cmdHasItemFlag;

  // Effective unit (rank-and-file) stats. battle needed for army-wide effects.
  function effStats(u, battle) {
    var w = SOVL.WEAPONS[u.weapon] || SOVL.WEAPONS.Unarmed;
    var s = { sk: u.base.sk, pw: u.base.pw + w.pow, df: u.base.df + w.def, at: u.base.at + w.att, wd: u.base.wd, ds: u.base.ds, saveBonus: 0 };
    for (var i = 0; i < u.props.length; i++) {
      var p = SOVL.PROPS[u.props[i]]; if (!p) continue;
      if (p.def) s.df += p.def;
      if (p.saveBonus) s.saveBonus += p.saveBonus;
    }
    if (u.banner) { var be = u.banner.effect; s.df += be.defense || 0; s.pw += be.power || 0; s.ds += be.discipline || 0; }
    s.ds += vetBonus(u.vet, 'discipline'); s.sk += vetBonus(u.vet, 'skill'); s.pw += vetBonus(u.vet, 'power');
    s.ds += itemBonus(u, 'retinueDiscipline') + (u.discMod || 0);
    s.sk += effectSum(u, 'skill'); s.pw += effectSum(u, 'power'); s.df += effectSum(u, 'defense'); s.at += effectSum(u, 'attacks');
    if (battle) { var ae = battle.armyEffects[u.side]; s.df += ae.defense || 0; s.pw += ae.power || 0; }
    if (commanderOnly(u)) { var c = effCmdStats(u, battle); return c; }
    return s;
  }
  function effCmdStats(u, battle) {
    var c = u.commander, w = SOVL.WEAPONS[c.weapon] || SOVL.WEAPONS.Unarmed;
    var s = { sk: c.base.sk, pw: c.base.pw + w.pow, df: c.base.df + w.def, at: c.base.at + w.att, wd: c.maxWounds, ds: c.base.ds, saveBonus: 0, lethal: false };
    for (var i = 0; i < c.props.length; i++) { var p = SOVL.PROPS[c.props[i]]; if (p && p.def) s.df += p.def; if (p && p.saveBonus) s.saveBonus += p.saveBonus; }
    for (var j = 0; j < c.items.length; j++) {
      var e = c.items[j].effect;
      s.sk += e.skill || 0; s.pw += e.power || 0; s.df += e.defense || 0; s.at += e.attacks || 0; s.ds += e.discipline || 0;
      if (e.lethalMelee) s.lethal = true;
    }
    s.sk += vetBonus(c.vet, 'skill'); s.pw += vetBonus(c.vet, 'power'); s.ds += vetBonus(c.vet, 'discipline');
    s.sk += effectSum(u, 'skill'); s.pw += effectSum(u, 'power'); s.df += effectSum(u, 'defense'); s.at += effectSum(u, 'attacks');
    if (battle) { var ae = battle.armyEffects[u.side]; s.df += ae.defense || 0; s.pw += ae.power || 0; }
    return s;
  }
  SOVL.effStats = effStats; SOVL.effCmdStats = effCmdStats;

  function isFlying(u) { return hasProp(u, 'Flying'); }
  function moveAllowance(u, battle) {
    if (isFlying(u)) return Math.max(0, 20 + effectSum(u, 'move'));
    var m = u.typeInfo.move, sturdy = hasProp(u, 'Sturdy');
    for (var i = 0; i < u.props.length; i++) {
      var p = SOVL.PROPS[u.props[i]]; if (!p || !p.move) continue;
      if (u.props[i] === 'Heavy Armor' && sturdy) continue;
      m += p.move;
    }
    if (u.banner && u.banner.effect.move) m += u.banner.effect.move;
    if (u.commander && u.commander.alive) {
      m += itemBonus(u, 'retinueMove');
      if (cmdHasProp(u, 'Ranger')) m += 2;
    }
    if (commanderOnly(u)) { var ct = SOVL.UNIT_TYPES[u.commander.def.type] || SOVL.UNIT_TYPES.Infantry; m = ct.move; if (cmdHasProp(u, 'Heavy Armor')) m -= 1; if (cmdHasProp(u, 'Sturdy')) m -= 1; m += itemBonus(u, 'retinueMove'); }
    m += effectSum(u, 'move');
    return Math.max(0, m);
  }
  SOVL.moveAllowance = moveAllowance;
  function pivotCost(u) { return commanderOnly(u) ? 1 : u.typeInfo.pivot; }

  function isFearless(u, battle) {
    if (hasProp(u, 'Fearless') || hasEffect(u, 'fearless')) return true;
    if (battle && battle.armyEffects[u.side].goblinsFearless && /Goblin/.test(u.name)) return true;
    return false;
  }
  function isReanimated(u) { return hasProp(u, 'Reanimated') || (commanderOnly(u) && cmdHasProp(u, 'Reanimated')); }

  // ---------- Battle ----------
  function Battle(opts) {
    // opts: { armies: [armyA, armyB], terrain: [...], seed, scenario: 'pitched'|'objectives', maxTurns }
    this.units = []; this.dead = []; this.terrain = opts.terrain || [];
    this.turn = 0; this.phase = 'deploy'; this.active = 0; this.startSide = 0; this.passed = [false, false];
    this.charges = []; this.contacts = []; this.log = []; this.events = [];
    this.armyEffects = [{}, {}]; this.armies = opts.armies; this.maxTurns = opts.maxTurns || SOVL.MAX_TURNS;
    this.scenario = opts.scenario || 'pitched'; this.objectives = []; this.objectiveScore = [0, 0];
    this.activeUnit = null; this.winner = null; this.result = null; this.deployed = [false, false];
    this.names = opts.names || ['Player', 'Enemy']; this.sides = opts.sides || ['bottom', 'top'];
    this.scoreMode = opts.scoreMode || 'points'; // 'points' or 'ratio' (share of enemy army value destroyed)
    if (opts.seed != null) R.setSeed(opts.seed);
    for (var s = 0; s < 2; s++) this.buildArmy(s, opts.armies[s]);
    // disambiguate duplicate unit names within a side
    var seen = {};
    this.units.forEach(function (u) { var k = u.side + ':' + u.name; seen[k] = (seen[k] || 0) + 1; });
    var idx = {};
    this.units.forEach(function (u) { var k = u.side + ':' + u.name; if (seen[k] > 1) { idx[k] = (idx[k] || 0) + 1; u.name = u.name + ' ' + ['I', 'II', 'III', 'IV', 'V', 'VI'][idx[k] - 1]; } });
    if (this.scenario === 'objectives') this.placeObjectives();
  }
  SOVL.Battle = Battle;
  var BP = Battle.prototype;

  BP.buildArmy = function (side, army) {
    for (var i = 0; i < army.entries.length; i++) {
      var e = army.entries[i];
      if (e.kind === 'commander') {
        var ret = e.retinue, cmd = Object.assign({}, e, { cost: SOVL.Army.commanderCost(army.faction, e) });
        var entry = Object.assign({}, ret, { commander: cmd, isRetinue: true, ref: ret.ref || null, cost: SOVL.Army.unitCost(army.faction, ret) });
        entry.name = ret.name || (findUnitDef(army.faction, ret.id).name);
        this.units.push(makeUnit(side, army.faction, entry));
      } else this.units.push(makeUnit(side, army.faction, Object.assign({}, e, { cost: SOVL.Army.unitCost(army.faction, e) })));
    }
  };
  BP.unit = function (uid) { for (var i = 0; i < this.units.length; i++) if (this.units[i].uid === uid) return this.units[i]; return null; };
  BP.unitsOf = function (side) { return this.units.filter(function (u) { return u.side === side; }); };
  BP.enemiesOf = function (side) { return this.units.filter(function (u) { return u.side !== side; }); };
  BP.addLog = function (text, kind, data) {
    var e = { turn: this.turn, phase: this.phase, text: text, kind: kind || 'info', data: data || null };
    this.logSeq = (this.logSeq || 0) + 1;
    this.log.push(e); if (this.log.length > 400) this.log.shift(); return e;
  };
  BP.emit = function (ev) { this.events.push(ev); };

  // ---------- Deployment ----------
  BP.deployZone = function (side) {
    var top = this.sides[side] === 'top';
    return top ? { x: 0, y: 0, w: TABLE.w, h: TABLE.deployDepth } : { x: 0, y: TABLE.h - TABLE.deployDepth, w: TABLE.w, h: TABLE.deployDepth };
  };
  BP.halfZone = function (side) {
    var top = this.sides[side] === 'top';
    return top ? { x: 0, y: 0, w: TABLE.w, h: TABLE.h / 2 } : { x: 0, y: TABLE.h / 2, w: TABLE.w, h: TABLE.h / 2 };
  };
  BP.facingFor = function (side) { return this.sides[side] === 'top' ? Math.PI / 2 : -Math.PI / 2; };
  BP.rectInZone = function (r, z) {
    var c = G.corners(r);
    for (var i = 0; i < 4; i++) if (c[i].x < z.x - 1e-6 || c[i].x > z.x + z.w + 1e-6 || c[i].y < z.y - 1e-6 || c[i].y > z.y + z.h + 1e-6) return false;
    return true;
  };
  BP.placementValid = function (u, rect, ignore) {
    if (!G.rectInsideTable(rect, TABLE.w, TABLE.h, 0)) return false;
    var z = hasProp(u, 'Ambusher') ? this.halfZone(u.side) : this.deployZone(u.side);
    if (!this.rectInZone(rect, z)) return false;
    return !this.collides(u, rect, ignore || [], true);
  };
  // collision with units and impassable terrain
  BP.collides = function (u, rect, ignoreUids, strict) {
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i]; if (o === u || ignoreUids.indexOf(o.uid) >= 0 || o.x < -500) continue;
      if (G.rectsOverlap(rect, o, strict ? -0.02 : -0.05)) return o;
    }
    if (!isFlying(u)) for (var j = 0; j < this.terrain.length; j++) {
      var t = this.terrain[j];
      if (SOVL.TERRAIN_TYPES[t.kind].impassable && G.rectOverlapsAabb(rect, t, -0.05)) return t;
    }
    return null;
  };
  BP.inDifficult = function (rect) {
    for (var j = 0; j < this.terrain.length; j++) { var t = this.terrain[j]; if (SOVL.TERRAIN_TYPES[t.kind].difficult && G.rectOverlapsAabb(rect, t, -0.05)) return true; }
    return false;
  };
  BP.pointInCover = function (p) {
    for (var j = 0; j < this.terrain.length; j++) { var t = this.terrain[j]; if (SOVL.TERRAIN_TYPES[t.kind].blocksLos && G.pointInAabb(p, t)) return true; }
    return false;
  };
  BP.losBlocked = function (p, q) {
    for (var j = 0; j < this.terrain.length; j++) {
      var t = this.terrain[j]; if (!SOVL.TERRAIN_TYPES[t.kind].blocksLos) continue;
      if (G.pointInAabb(p, t) || G.pointInAabb(q, t)) continue; // units inside can see out / be seen
      if (G.segHitsAabb(p, q, t)) return true;
    }
    return false;
  };
  BP.placeUnit = function (uid, x, y, a) {
    var u = this.unit(uid), r = { x: x, y: y, a: a, w: u.w, d: u.d };
    if (!this.placementValid(u, r, [])) return false;
    u.x = x; u.y = y; u.a = a; u.placed = true; return true;
  };
  BP.setFiles = function (uid, files) {
    var u = this.unit(uid); if (isSingle(u.type)) return;
    files = G.clamp(files, u.typeInfo.minFiles, Math.min(u.typeInfo.maxFiles, u.models));
    u.files = files; refreshFootprint(u, false);
  };
  // Auto deployment: battle line in center, cavalry on flanks, shooters behind, machines at rear.
  BP.autoDeploy = function (side) {
    var units = this.unitsOf(side), zone = this.deployZone(side), top = this.sides[side] === 'top', facing = this.facingFor(side);
    var frontY = top ? zone.y + zone.h - 1.5 : zone.y + 1.5, rearY = top ? zone.y + 1.5 : zone.y + zone.h - 1.5;
    var line = [], flank = [], back = [], machines = [], self = this;
    units.forEach(function (u) {
      if (u.type === 'War Machine' || u.ranged && !/Pistol|Rifle|Bows$/.test(u.ranged) && u.type !== 'Cavalry' && isSingle(u.type)) machines.push(u);
      else if (u.ranged && !/Pistol|Rifle/.test(u.ranged) && !/Guard/.test(u.name) && u.type !== 'Cavalry' && u.type !== 'Chariot') back.push(u);
      else if (u.type === 'Cavalry' || u.type === 'Hounds' || u.type === 'Chariot' || isFlying(u)) flank.push(u);
      else line.push(u);
    });
    // order: put the commander's unit in the middle
    line.sort(function (a, b) { return (b.commander ? 1 : 0) - (a.commander ? 1 : 0); });
    var ordered = []; // interleave so the commander is central
    for (var i = 0; i < line.length; i++) { if (i % 2 === 0) ordered.push(line[i]); else ordered.unshift(line[i]); }
    var sumW = units.reduce(function (s, u) { return s + u.w; }, 0);
    var gap = Math.max(0.3, Math.min(1.5, (TABLE.w - 4 - sumW) / Math.max(1, units.length - 1)));
    var totalW = ordered.reduce(function (s, u) { return s + u.w + gap; }, 0);
    var x = TABLE.w / 2 - totalW / 2;
    var placedAny = false;
    function tryPlace(u, cx, cy) {
      var r = { x: cx, y: cy, a: facing, w: u.w, d: u.d };
      for (var dx = 0; dx <= 30; dx += 1.0) for (var sgn = -1; sgn <= 1; sgn += 2) {
        for (var dy = 0; dy <= 6; dy += 1) for (var sy = -1; sy <= 1; sy += 2) {
          r.x = cx + sgn * dx; r.y = cy + sy * dy;
          if (self.placementValid(u, r, [])) { u.x = r.x; u.y = r.y; u.a = facing; u.placed = true; return true; }
        }
      }
      return false;
    }
    ordered.forEach(function (u) { var cx = x + u.w / 2; tryPlace(u, cx, frontY + (top ? -u.d / 2 : u.d / 2)); x += u.w + gap; placedAny = true; });
    var lx = Math.max(2, TABLE.w / 2 - totalW / 2 - 4), rx = Math.min(TABLE.w - 2, TABLE.w / 2 + totalW / 2 + 4);
    flank.forEach(function (u, i) { var left = i % 2 === 0; var cx = left ? lx - u.w / 2 - i * gap : rx + u.w / 2 + i * gap; tryPlace(u, cx, frontY + (top ? -u.d / 2 : u.d / 2)); });
    var bx = TABLE.w / 2 - back.reduce(function (s, u) { return s + u.w + gap; }, 0) / 2;
    back.forEach(function (u) { tryPlace(u, bx + u.w / 2, rearY + (top ? u.d / 2 : -u.d / 2)); bx += u.w + gap; });
    var mx = 6;
    machines.forEach(function (u, i) { tryPlace(u, i % 2 === 0 ? mx + i * 3 : TABLE.w - mx - i * 3, rearY + (top ? u.d / 2 : -u.d / 2)); });
    // anything still unplaced: brute force inside the zone, then (last resort) anywhere on our half
    units.forEach(function (u) {
      if (u.placed) return;
      for (var yy = zone.y + 0.5; yy < zone.y + zone.h && !u.placed; yy += 0.5) for (var xx = 1; xx < TABLE.w - 1 && !u.placed; xx += 0.5) { var rr = { x: xx, y: yy, a: facing, w: u.w, d: u.d }; if (self.placementValid(u, rr, [])) { u.x = xx; u.y = yy; u.a = facing; u.placed = true; } }
      if (u.placed) return;
      var half = self.halfZone(side), ys = [];
      for (var y2 = half.y + 0.5; y2 < half.y + half.h; y2 += 0.5) ys.push(y2);
      if (!top) ys.reverse();
      for (var yi = 0; yi < ys.length && !u.placed; yi++) for (var x2 = 1; x2 < TABLE.w - 1 && !u.placed; x2 += 0.5) { var r2 = { x: x2, y: ys[yi], a: facing, w: u.w, d: u.d }; if (G.rectInsideTable(r2, TABLE.w, TABLE.h, 0) && self.rectInZone(r2, half) && !self.collides(u, r2, [], true)) { u.x = x2; u.y = ys[yi]; u.a = facing; u.placed = true; } }
    });
    this.deployed[side] = true;
    return placedAny;
  };
  BP.allPlaced = function (side) { return this.unitsOf(side).every(function (u) { return u.placed; }); };

  BP.placeObjectives = function () {
    var pts = [];
    for (var tries = 0; tries < 200 && pts.length < 2; tries++) {
      var p = { x: 10 + R.rng() * (TABLE.w - 20), y: 10 + R.rng() * (TABLE.h - 20) }, ok = true;
      for (var i = 0; i < pts.length; i++) if (G.dist(p, pts[i]) < 12) ok = false;
      for (var j = 0; j < this.terrain.length && ok; j++) if (G.pointInAabb(p, this.terrain[j])) ok = false;
      if (ok) pts.push(p);
    }
    this.objectives = pts.map(function (p, i) { return { x: p.x, y: p.y, owner: null, id: i }; });
  };

  // ---------- Start / turn structure ----------
  BP.start = function (firstSide) {
    // Initiative roll-off if not given
    if (firstSide == null) {
      var a, b; do { a = R.d6(); b = R.d6(); } while (a === b);
      firstSide = a > b ? 0 : 1;
      this.addLog(this.names[0] + ' rolls ' + a + ', ' + this.names[1] + ' rolls ' + b + '. ' + this.names[firstSide] + ' has the initiative.', 'dice', { dice: [a, b] });
    }
    this.startSide = firstSide; this.turn = 1;
    this.beginChargePhase();
  };
  BP.beginTurn = function () {
    this.turn++;
    if (this.turn > this.maxTurns) { this.turn = this.maxTurns; this.endGame('turns'); return; }
    this.startSide = 1 - this.startSide;
    this.beginChargePhase();
  };
  BP.beginChargePhase = function () {
    this.phase = 'charge'; this.active = this.startSide; this.passed = [false, false]; this.charges = []; this.activeUnit = null;
    var self = this;
    this.units.forEach(function (u) { u.activated = false; u.declaredCharge = false; u.chargedThisTurn = false; u.chargeTargetOf = null; u.usedAbility = false; u.usedRanged = false; u.usedSpell = false; u.spellsCastThisTurn = {}; u.moveLeft = 0; });
    this.addLog('— Turn ' + this.turn + ': Charge Phase —', 'phase');
    this.emit({ type: 'phase', phase: 'charge', turn: this.turn });
    // Frenzy: must charge the closest valid target (both sides, automatically)
    this.units.filter(function (u) { return hasProp(u, 'Frenzy'); }).forEach(function (u) {
      var best = null, bd = Infinity;
      self.enemiesOf(u.side).forEach(function (e) { var ci = self.chargeInfo(u, e); if (ci.ok && ci.dist < bd) { bd = ci.dist; best = e; } });
      if (best) { self.declareCharge(u.uid, best.uid, true); self.addLog(u.name + ' is Frenzied and must charge ' + best.name + '!', 'charge'); }
    });
    this.checkChargePhaseEnd();
  };
  BP.isEngaged = function (u) { for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].a === u.uid || this.contacts[i].b === u.uid) return true; return false; };
  BP.contactsOf = function (u) {
    var out = [];
    for (var i = 0; i < this.contacts.length; i++) {
      var c = this.contacts[i];
      if (c.a === u.uid) out.push({ side: c.aSide, enemy: this.unit(c.b), enemySide: c.bSide });
      else if (c.b === u.uid) out.push({ side: c.bSide, enemy: this.unit(c.a), enemySide: c.aSide });
    }
    return out;
  };
  BP.sideEngaged = function (u, side) { return this.contactsOf(u).some(function (c) { return c.side === side; }); };
  BP.sideTargeted = function (u, side) { return this.charges.some(function (c) { return !c.flee && c.target === u.uid && c.side === side; }); };
  BP.chargeAgainst = function (u) { return this.charges.filter(function (c) { return !c.flee && c.target === u.uid; }); };
  BP.chargeBy = function (u) { for (var i = 0; i < this.charges.length; i++) if (this.charges[i].charger === u.uid) return this.charges[i]; return null; };

  // ---------- Charges ----------
  BP.chargeRange = function (u) { return moveAllowance(u, this); };
  BP.canDeclareCharge = function (u) {
    if (!unitAlive(u) || u.fleeing || this.isEngaged(u) || u.declaredCharge) return false;
    if (hasProp(u, 'Crewed Weapon') || hasEffect(u, 'rooted')) return false;
    if (this.chargeRange(u) <= 0) return false;
    return true;
  };
  // Charge priority: higher is better. Flank/rear beats front; then shorter distance.
  function chargePriority(side, dist) { return (side === 'front' ? 0 : 100) - dist; }
  BP.chargeInfo = function (charger, target, opts) {
    opts = opts || {};
    var res = { ok: false, reason: '' };
    if (target.side === charger.side || !unitAlive(target)) { res.reason = 'Not an enemy'; return res; }
    if (!this.canDeclareCharge(charger)) { res.reason = 'Cannot charge'; return res; }
    var incoming = this.chargeAgainst(charger);
    if (incoming.length && !opts.counter) { res.reason = 'A charge is already declared against this unit'; return res; }
    var fc = G.frontCenter(charger), side = G.zoneOf(target, fc), sd = G.side(target, side);
    var dist = G.dist(fc, sd.c), range = this.chargeRange(charger);
    res.side = side; res.dist = dist;
    if (dist > range) { res.reason = 'Out of charge range (' + dist.toFixed(1) + ' > ' + range + ')'; return res; }
    var f = G.fwd(charger.a), v = { x: sd.c.x - fc.x, y: sd.c.y - fc.y }, ang = Math.acos(G.clamp((f.x * v.x + f.y * v.y) / (G.len(v.x, v.y) || 1), -1, 1));
    if (ang > Math.PI / 4 + 1e-6) { res.reason = 'Target outside the 45° line of sight arc'; return res; }
    if (!isFlying(charger) && this.losBlocked(fc, sd.c)) { res.reason = 'Line of sight blocked by terrain'; return res; }
    if (!isFlying(charger)) {
      var path = this.chargePathTerrain(charger, sd.c);
      if (path.impassable) { res.reason = 'Impassable terrain in the way'; return res; }
      if (path.difficult && !hasProp(charger, 'Scout')) { range -= 2; if (dist > range) { res.reason = 'Difficult terrain slows the charge (' + dist.toFixed(1) + ' > ' + range + ')'; return res; } res.difficult = true; }
    }
    if (target.fleeing) { res.ok = true; res.runDown = true; res.priority = chargePriority(side, dist); return res; }
    if (this.sideEngaged(target, side)) { res.reason = 'That side is already engaged'; return res; }
    if (this.sideTargeted(target, side)) { res.reason = 'That side already has a charge declared against it'; return res; }
    var tc = this.chargeBy(target);
    if (tc && !tc.flee && !opts.counter) {
      // Charge Intercept: only if higher priority than the target's own charge
      var tinfo = this.chargeInfo(this.unit(target.uid), this.unit(tc.target), { asIs: true, counter: true });
      var theirP = tc.priority != null ? tc.priority : (tinfo.ok ? tinfo.priority : -Infinity);
      if (chargePriority(side, dist) <= theirP) { res.reason = 'Target has declared its own charge with higher priority'; return res; }
      res.intercept = true;
    }
    if (!opts.counter) {
      var pos = this.chargePosition(charger, target, side, []);
      if (!pos) { res.reason = 'No room to reach base contact'; return res; }
      res.pos = pos;
    }
    res.ok = true; res.priority = chargePriority(side, dist);
    return res;
  };
  // Terrain crossed by a straight charge from the charger's front corners to point p
  BP.chargePathTerrain = function (charger, p) {
    var c = G.corners(charger), out = { impassable: false, difficult: false }, self = this;
    var starts = [c[0], c[1], G.frontCenter(charger)];
    this.terrain.forEach(function (t) {
      var T = SOVL.TERRAIN_TYPES[t.kind]; if (!T.impassable && !T.difficult) return;
      var crosses = false;
      for (var i = 0; i < starts.length; i++) { if (G.pointInAabb(starts[i], t)) { if (T.difficult) out.difficult = true; continue; } if (G.segHitsAabb(starts[i], p, t)) crosses = true; }
      if (crosses) { if (T.impassable) out.impassable = true; else out.difficult = true; }
    });
    return out;
  };
  BP.chargePosition = function (charger, target, side, ignore) {
    var sd = G.side(target, side), a = Math.atan2(-sd.n.y, -sd.n.x);
    var maxOff = (sd.len + charger.w) / 2 - Math.min(charger.w, sd.len) * 0.4;
    var offs = [0];
    for (var o = 0.5; o <= maxOff; o += 0.5) { offs.push(o); offs.push(-o); }
    for (var i = 0; i < offs.length; i++) {
      var cx = sd.c.x + sd.n.x * (charger.d / 2 + 0.02) + sd.t.x * offs[i], cy = sd.c.y + sd.n.y * (charger.d / 2 + 0.02) + sd.t.y * offs[i];
      var r = { x: cx, y: cy, a: a, w: charger.w, d: charger.d };
      if (!G.rectInsideTable(r, TABLE.w, TABLE.h, -0.5)) continue;
      if (this.collides(charger, r, [target.uid].concat(ignore || []), false)) continue;
      return r;
    }
    return null;
  };
  BP.validChargeTargets = function (u) {
    var self = this, out = [];
    this.enemiesOf(u.side).forEach(function (e) { var ci = self.chargeInfo(u, e); if (ci.ok) out.push({ unit: e, info: ci }); });
    return out;
  };
  BP.declareCharge = function (uid, targetUid, auto) {
    var u = this.unit(uid), t = this.unit(targetUid);
    if (!u || !t) return { ok: false, reason: 'No such unit' };
    if (!auto && u.side !== this.active) return { ok: false, reason: 'Not your activation' };
    var ci = this.chargeInfo(u, t);
    if (!ci.ok) return ci;
    if (ci.intercept) {
      var old = this.chargeBy(t);
      this.charges = this.charges.filter(function (c) { return c !== old; });
      t.declaredCharge = false;
      var oldTarget = this.unit(old.target); if (oldTarget) oldTarget.chargeTargetOf = null;
      this.addLog(u.name + ' intercepts ' + t.name + ', cancelling its charge!', 'charge');
    }
    this.charges.push({ charger: u.uid, target: t.uid, side: ci.side, dist: ci.dist, priority: ci.priority, counter: false, flee: false, runDown: !!ci.runDown });
    u.declaredCharge = true; t.chargeTargetOf = u.uid;
    this.addLog(u.name + ' declares a charge against the ' + ci.side + ' of ' + t.name + ' (' + ci.dist.toFixed(1) + '").', 'charge');
    this.emit({ type: 'declare', from: u.uid, to: t.uid, side: ci.side });
    if (!auto) this.afterChargeAction();
    return { ok: true };
  };
  BP.canCounterCharge = function (u) {
    var inc = this.chargeAgainst(u);
    if (inc.length !== 1 || inc[0].side !== 'front' || inc[0].counter) return null;
    if (u.fleeing || this.isEngaged(u) || u.declaredCharge || hasProp(u, 'Crewed Weapon') || hasEffect(u, 'rooted')) return null;
    var charger = this.unit(inc[0].charger);
    var ci = this.chargeInfo(u, charger, { counter: true });
    return ci.ok ? { charger: charger, info: ci } : null;
  };
  BP.declareCounterCharge = function (uid) {
    var u = this.unit(uid); if (!u || u.side !== this.active) return { ok: false, reason: 'Not your activation' };
    var cc = this.canCounterCharge(u); if (!cc) return { ok: false, reason: 'No valid counter charge' };
    this.charges.push({ charger: u.uid, target: cc.charger.uid, side: 'front', dist: cc.info.dist, priority: cc.info.priority, counter: true, flee: false });
    u.declaredCharge = true;
    this.addLog(u.name + ' counter-charges ' + cc.charger.name + '!', 'charge');
    this.emit({ type: 'declare', from: u.uid, to: cc.charger.uid, side: 'front', counter: true });
    this.afterChargeAction();
    return { ok: true };
  };
  BP.canFlee = function (u) {
    var inc = this.chargeAgainst(u);
    if (inc.length !== 1 || u.declaredCharge || u.fleeing || this.isEngaged(u)) return null;
    if (isReanimated(u) || hasProp(u, 'Frenzy')) return null;
    var mv = moveAllowance(u, this); if (mv <= 0) return null;
    var charger = this.unit(inc[0].charger);
    if (!(mv > this.chargeRange(charger) - inc[0].dist)) return null;
    return { charger: charger };
  };
  BP.declareFlee = function (uid) {
    var u = this.unit(uid); if (!u || u.side !== this.active) return { ok: false, reason: 'Not your activation' };
    var cf = this.canFlee(u); if (!cf) return { ok: false, reason: 'Cannot flee from this charge' };
    this.charges.push({ charger: u.uid, target: cf.charger.uid, flee: true, counter: false });
    u.declaredCharge = true;
    this.addLog(u.name + ' will flee from ' + cf.charger.name + '\'s charge!', 'charge');
    this.afterChargeAction();
    return { ok: true };
  };
  BP.passCharge = function () {
    this.passed[this.active] = true;
    if (this.passed[0] && this.passed[1]) { this.resolveCharges(); return; }
    this.active = 1 - this.active;
    this.checkChargePhaseEnd();
  };
  BP.afterChargeAction = function () {
    this.passed[this.active] = false;
    this.active = 1 - this.active;
    this.checkChargePhaseEnd();
  };
  BP.hasChargeOptions = function (side) {
    var self = this, any = false;
    this.unitsOf(side).forEach(function (u) {
      if (any) return;
      if (self.canDeclareCharge(u) && self.validChargeTargets(u).length) any = true;
      else if (self.canCounterCharge(u) || self.canFlee(u)) any = true;
    });
    return any;
  };
  BP.checkChargePhaseEnd = function () {
    if (this.phase !== 'charge') return;
    // if the active player has nothing to do, auto-pass; if neither has anything, resolve
    var guard = 0;
    while (guard++ < 3 && this.phase === 'charge' && !this.hasChargeOptions(this.active)) {
      this.passed[this.active] = true;
      if (this.passed[0] && this.passed[1]) { this.resolveCharges(); return; }
      this.active = 1 - this.active;
    }
  };
  BP.resolveCharges = function () {
    var self = this;
    this.addLog('Resolving charges.', 'phase');
    // 1. flee reactions
    this.charges.filter(function (c) { return c.flee; }).forEach(function (c) {
      var u = self.unit(c.charger), ch = self.unit(c.target); if (!u || !ch) return;
      var away = Math.atan2(u.y - ch.y, u.x - ch.x);
      u.fleeing = true;
      var fm = self.flightMove(u, away, 'flees from the charge');
      // the charger's own charge is spent either way
      self.charges = self.charges.filter(function (x) { return !(x.charger === ch.uid && x.target === u.uid); });
      ch.activated = true;
      if (!unitAlive(u) || u.removed) return;
      // charger pursues its full move (once)
      self.pursue(ch, u);
    });
    // 2. counter charges, 3. others by priority
    var normal = this.charges.filter(function (c) { return !c.flee; });
    normal.sort(function (a, b) { return (b.counter ? 1 : 0) - (a.counter ? 1 : 0) || (b.priority - a.priority); });
    normal.forEach(function (c) {
      var u = self.unit(c.charger), t = self.unit(c.target);
      if (!u || !t || !unitAlive(u) || !unitAlive(t) || u.fleeing || self.isEngaged(u)) return;
      if (t.fleeing) { self.pursue(u, t); return; }
      if (c.counter) {
        // partner charge may already have connected via counter
        if (self.isEngaged(t)) return;
        var ok = self.resolveCounter(u, t);
        if (!ok) self.resolveSingleCharge(u, t, G.zoneOf(t, G.frontCenter(u)));
        return;
      }
      var side = c.side;
      if (self.sideEngaged(t, side)) {
        // declared side taken by an earlier charge: only switch sides if the new side is still a legal charge
        var alt = G.SIDES.filter(function (s2) { return !self.sideEngaged(t, s2) && !self.sideTargeted(t, s2); })[0];
        if (!alt) { u.activated = true; return; }
        var fc2 = G.frontCenter(u), sd2 = G.side(t, alt), d2 = G.dist(fc2, sd2.c);
        if (d2 > self.chargeRange(u) || !self.inArc(u, sd2.c)) { self.addLog(u.name + ' cannot reach ' + t.name + ' and stumbles to a halt.', 'charge'); u.activated = true; self.moveToward(u, sd2.c, Math.max(0, self.chargeRange(u) - 1), 1.0); return; }
        side = alt;
      }
      self.resolveSingleCharge(u, t, side);
    });
    this.charges = [];
    this.units.forEach(function (u) { u.chargeTargetOf = null; });
    this.beginStrategicPhase();
  };
  BP.resolveSingleCharge = function (u, t, side) {
    var pos = this.chargePosition(u, t, side, []);
    if (!pos) {
      // failed charge: move toward target, stop short
      this.addLog(u.name + ' cannot reach ' + t.name + ' and stumbles to a halt.', 'charge');
      u.activated = true;
      this.moveToward(u, G.side(t, side).c, Math.max(0, this.chargeRange(u) - 1), 1.0);
      return false;
    }
    var from = { x: u.x, y: u.y, a: u.a };
    u.x = pos.x; u.y = pos.y; u.a = pos.a; u.chargedThisTurn = true; u.activated = true;
    this.contacts.push({ a: u.uid, aSide: 'front', b: t.uid, bSide: side, age: 0 });
    this.addLog(u.name + ' charges into the ' + side + ' of ' + t.name + '!', 'charge');
    this.emit({ type: 'charge', uid: u.uid, from: from, to: { x: u.x, y: u.y, a: u.a }, target: t.uid });
    return true;
  };
  BP.resolveCounter = function (u, t) {
    // both rotate to face each other and meet halfway
    var ang = Math.atan2(t.y - u.y, t.x - u.x);
    var fu = G.frontCenter({ x: u.x, y: u.y, a: ang, w: u.w, d: u.d }), ft = G.frontCenter({ x: t.x, y: t.y, a: ang + Math.PI, w: t.w, d: t.d });
    var mid = { x: (fu.x + ft.x) / 2, y: (fu.y + ft.y) / 2 }, f = G.fwd(ang);
    var ru = { x: mid.x - f.x * (u.d / 2 + 0.01), y: mid.y - f.y * (u.d / 2 + 0.01), a: ang, w: u.w, d: u.d };
    var rt = { x: mid.x + f.x * (t.d / 2 + 0.01), y: mid.y + f.y * (t.d / 2 + 0.01), a: ang + Math.PI, w: t.w, d: t.d };
    if (!G.rectInsideTable(ru, TABLE.w, TABLE.h, -0.5) || !G.rectInsideTable(rt, TABLE.w, TABLE.h, -0.5)) return false;
    if (this.collides(u, ru, [t.uid], false) || this.collides(t, rt, [u.uid], false)) return false;
    var fromU = { x: u.x, y: u.y, a: u.a }, fromT = { x: t.x, y: t.y, a: t.a };
    u.x = ru.x; u.y = ru.y; u.a = ru.a; t.x = rt.x; t.y = rt.y; t.a = rt.a;
    u.chargedThisTurn = true; t.chargedThisTurn = true; u.activated = true; t.activated = true;
    this.contacts.push({ a: u.uid, aSide: 'front', b: t.uid, bSide: 'front', age: 0 });
    this.addLog(u.name + ' and ' + t.name + ' crash into each other head on!', 'charge');
    this.emit({ type: 'charge', uid: u.uid, from: fromU, to: { x: u.x, y: u.y, a: u.a }, target: t.uid });
    this.emit({ type: 'charge', uid: t.uid, from: fromT, to: { x: t.x, y: t.y, a: t.a }, target: u.uid });
    return true;
  };
  // Move u straight toward point p up to maxDist, stopping `stopGap` short of collisions.
  BP.moveToward = function (u, p, maxDist, stopGap) {
    var ang = Math.atan2(p.y - u.y, p.x - u.x), from = { x: u.x, y: u.y, a: u.a };
    u.a = ang;
    var d = Math.min(maxDist, G.dist(u, p)), step = 0.25, moved = 0, f = G.fwd(ang), last = { x: u.x, y: u.y };
    for (var s = step; s <= d + 1e-9; s += step) {
      var r = { x: from.x + f.x * s, y: from.y + f.y * s, a: ang, w: u.w, d: u.d };
      if (!G.rectInsideTable(r, TABLE.w, TABLE.h, 0) || this.collides(u, r, [], false)) break;
      last = { x: r.x, y: r.y }; moved = s;
    }
    u.x = last.x; u.y = last.y;
    this.emit({ type: 'move', uid: u.uid, from: from, to: { x: u.x, y: u.y, a: u.a } });
    return moved;
  };
  // Charger pursues a fleeing unit; if it reaches it, the fleeing unit is run down.
  BP.pursue = function (ch, u) {
    var range = this.chargeRange(ch), fc = G.frontCenter(ch), dist = G.dist(fc, u) - u.d / 2;
    var ang = Math.atan2(u.y - ch.y, u.x - ch.x), from = { x: ch.x, y: ch.y, a: ch.a };
    ch.a = ang; ch.activated = true;
    if (dist <= range && !this.losBlocked(fc, { x: u.x, y: u.y })) {
      // caught: move to the target's position and destroy it
      var pos = { x: u.x, y: u.y };
      this.addLog(ch.name + ' runs down the fleeing ' + u.name + '!', 'kill');
      this.destroyUnit(u, 'run down');
      this.moveToward(ch, pos, range, 0);
      this.emit({ type: 'rundown', uid: ch.uid, target: u.uid });
    } else {
      this.moveToward(ch, { x: u.x, y: u.y }, Math.max(0, range), 0.5);
      this.addLog(ch.name + ' pursues but cannot catch ' + u.name + '.', 'charge');
    }
  };

  // ---------- Strategic phase ----------
  BP.beginStrategicPhase = function () {
    this.phase = 'strategic'; this.active = this.startSide; this.passed = [false, false]; this.activeUnit = null;
    this.addLog('— Turn ' + this.turn + ': Strategic Phase —', 'phase');
    this.emit({ type: 'phase', phase: 'strategic', turn: this.turn });
    this.checkStrategicAutoPass();
  };
  BP.canActivate = function (u) {
    if (!unitAlive(u) || u.activated) return false;
    if (u.fleeing) return true; // rally only
    return true;
  };
  BP.activatable = function (side) { var self = this; return this.unitsOf(side).filter(function (u) { return self.canActivate(u) && self.hasUsefulActivation(u); }); };
  BP.hasUsefulActivation = function (u) {
    if (u.fleeing) return true;
    if (this.isEngaged(u)) {
      // engaged: only spells / commander abilities
      return !!(u.commander && u.commander.alive && (u.commander.spells.length || this.commanderAbilities(u).length));
    }
    return true;
  };
  BP.beginActivation = function (uid) {
    var u = this.unit(uid);
    if (!u || u.side !== this.active || !this.canActivate(u)) return { ok: false, reason: 'Cannot activate that unit now' };
    if (this.activeUnit && this.activeUnit !== u.uid) return { ok: false, reason: 'Another unit is already active' };
    this.activeUnit = u.uid;
    if (u.moveStarted) return { ok: true };
    u.moveStarted = true;
    u.inDifficultAtStart = !isFlying(u) && !hasProp(u, 'Scout') && this.inDifficult(u);
    u.moveLeft = this.isEngaged(u) || u.fleeing ? 0 : Math.max(0, moveAllowance(u, this) - (u.inDifficultAtStart ? 2 : 0));
    if (hasEffect(u, 'rooted')) u.moveLeft = 0;
    this.emit({ type: 'activate', uid: u.uid });
    return { ok: true };
  };
  BP.endActivation = function () {
    var u = this.unit(this.activeUnit);
    if (u) { u.activated = true; u.moveStarted = false; u.moveLeft = 0; }
    this.activeUnit = null;
    this.advanceStrategic(1 - this.active);
  };
  // A side that passes stays passed for the rest of the phase; the other side keeps activating.
  BP.passStrategic = function () {
    if (this.activeUnit) { var u = this.unit(this.activeUnit); if (u) { u.activated = true; u.moveStarted = false; u.moveLeft = 0; } this.activeUnit = null; }
    this.passed[this.active] = true;
    this.advanceStrategic(1 - this.active);
  };
  BP.advanceStrategic = function (prefer) {
    if (this.phase !== 'strategic') return;
    for (var k = 0; k < 2; k++) { var s = (prefer + k) % 2; if (!this.passed[s] && this.activatable(s).length) { this.active = s; return; } }
    this.endStrategicPhase();
  };
  BP.checkStrategicAutoPass = function () { this.advanceStrategic(this.active); };
  // Movement preview: pivot toward point p then advance. pivotOnly: face p without advancing.
  BP.previewMove = function (uid, p, pivotOnly) {
    var u = this.unit(uid);
    var res = { ok: false, x: u.x, y: u.y, a: u.a, cost: 0, advance: 0, pivots: 0, reason: '' };
    if (u.moveLeft <= 0 && pivotCost(u) > 0) { res.reason = 'No movement left'; return res; }
    var want = Math.atan2(p.y - u.y, p.x - u.x), diff = G.angleDiff(u.a, want);
    var pc = pivotCost(u), pivots = Math.ceil((Math.abs(diff) - 1e-6) / (Math.PI / 4)); if (pivots < 0) pivots = 0;
    var budget = u.moveLeft, pivCost = pivots * pc;
    if (pc > 0 && pivCost > budget) { pivots = Math.floor(budget / pc); pivCost = pivots * pc; }
    var maxRot = pivots * Math.PI / 4, rot = G.clamp(diff, -maxRot, maxRot);
    var a = u.a + rot, left = budget - pivCost;
    res.a = a; res.pivots = pivots; res.cost = pivCost;
    var rotRect = { x: u.x, y: u.y, a: a, w: u.w, d: u.d };
    if (pivots > 0 && (!G.rectInsideTable(rotRect, TABLE.w, TABLE.h, 0) || this.collides(u, rotRect, [], false))) { res.ok = false; res.a = u.a; res.reason = 'No room to pivot here'; return res; }
    if (pivotOnly || left <= 0) { res.ok = pivots > 0 || pivotOnly; res.x = u.x; res.y = u.y; if (!res.ok) res.reason = pivots === 0 && pc > 0 ? 'Not enough movement to pivot' : 'Already facing that way'; return res; }
    var f = G.fwd(a), target = G.toLocal({ x: u.x, y: u.y, a: a }, p).y; // forward distance to reach p
    var dist = G.clamp(target, 0, left), step = 0.25, best = 0, inDiff = u.inDifficultAtStart, extra = 0;
    var flying = isFlying(u), scout = hasProp(u, 'Scout');
    for (var s = step; s <= dist + 1e-9; s += step) {
      var r = { x: u.x + f.x * s, y: u.y + f.y * s, a: a, w: u.w, d: u.d };
      if (!G.rectInsideTable(r, TABLE.w, TABLE.h, 0)) break;
      var hit = this.collides(u, r, [], false);
      if (hit) { if (hit.uid != null && hit.side !== u.side) { /* enemy: keep 0.5 gap */ } break; }
      // keep a gap from enemies so contact only happens by charging
      var nearEnemy = false;
      for (var i = 0; i < this.units.length; i++) { var o = this.units[i]; if (o.side !== u.side && G.rectsOverlap(r, o, 0.5)) { nearEnemy = true; break; } }
      if (nearEnemy) break;
      if (!flying && !scout && !inDiff && this.inDifficult(r)) {
        if (left - s < 2) break; // can't afford to enter
        inDiff = true; extra = 2;
      }
      if (s + extra > left + 1e-9) break;
      best = s;
    }
    res.advance = best; res.cost = pivCost + best + (best > 0 ? extra : 0);
    res.x = u.x + f.x * best; res.y = u.y + f.y * best;
    res.ok = best > 0 || pivots > 0;
    if (!res.ok) res.reason = 'Blocked';
    res.enteredDifficult = best > 0 && extra > 0;
    return res;
  };
  BP.applyMove = function (uid, mv) {
    var u = this.unit(uid);
    if (!mv.ok || this.activeUnit !== uid) return false;
    var from = { x: u.x, y: u.y, a: u.a };
    u.x = mv.x; u.y = mv.y; u.a = mv.a; u.moveLeft = Math.max(0, u.moveLeft - mv.cost);
    if (mv.enteredDifficult) u.inDifficultAtStart = true;
    this.emit({ type: 'move', uid: u.uid, from: from, to: { x: u.x, y: u.y, a: u.a } });
    return true;
  };
  // Pivot in place by up to one pivot's worth (45°) in a direction.
  BP.pivot = function (uid, dir) {
    var u = this.unit(uid), pc = pivotCost(u);
    if (this.activeUnit !== uid) return false;
    if (pc > u.moveLeft && pc > 0) return false;
    var a = u.a + dir * Math.PI / 4, r = { x: u.x, y: u.y, a: a, w: u.w, d: u.d };
    if (!G.rectInsideTable(r, TABLE.w, TABLE.h, 0) || this.collides(u, r, [], false)) return false;
    var from = { x: u.x, y: u.y, a: u.a };
    u.a = a; u.moveLeft -= pc;
    this.emit({ type: 'move', uid: u.uid, from: from, to: { x: u.x, y: u.y, a: u.a } });
    return true;
  };

  // ---------- Ranged attacks ----------
  BP.rangedWeaponOf = function (u, commander) {
    var name = commander ? (u.commander && u.commander.ranged) : u.ranged;
    if (!name) return null;
    if (commander && !u.commander.alive) return null;
    var w = SOVL.RANGED[name]; if (!w) return null;
    if (w.once && u.usedOnce[name]) return null;
    return Object.assign({ name: name }, w);
  };
  BP.inArc = function (u, p) {
    var fc = G.frontCenter(u), f = G.fwd(u.a), v = { x: p.x - fc.x, y: p.y - fc.y }, l = G.len(v.x, v.y) || 1;
    return Math.acos(G.clamp((f.x * v.x + f.y * v.y) / l, -1, 1)) <= Math.PI / 4 + 1e-6;
  };
  BP.rangedInfo = function (u, t, commander) {
    var w = this.rangedWeaponOf(u, commander), res = { ok: false, reason: '' };
    if (!w) { res.reason = 'No ranged weapon'; return res; }
    if (u.fleeing) { res.reason = 'Fleeing'; return res; }
    if (this.isEngaged(u)) { res.reason = 'Engaged in combat'; return res; }
    if (commander ? u.usedSpell : (u.usedRanged || u.usedAbility)) { res.reason = 'Already used an ability or ranged attack this activation'; return res; }
    if (t.side === u.side || !unitAlive(t)) { res.reason = 'Not an enemy'; return res; }
    if (this.isEngaged(t)) { res.reason = 'Target is engaged in combat'; return res; }
    if (hasEffect(t, 'shrouded')) { res.reason = 'Target is Shrouded'; return res; }
    var fc = G.frontCenter(u), dist = G.dist(fc, t) - Math.min(t.w, t.d) / 2;
    if (dist > w.range) { res.reason = 'Out of range (' + dist.toFixed(1) + ' > ' + w.range + ')'; return res; }
    if (!this.inArc(u, t)) { res.reason = 'Outside line of sight arc'; return res; }
    if (this.losBlocked(fc, t)) { res.reason = 'Line of sight blocked'; return res; }
    var mods = 0, notes = [];
    if (dist > w.range / 2) { mods += 1; notes.push('long range'); }
    if (this.pointInCover({ x: t.x, y: t.y }) || hasProp(t, 'Crewed Weapon')) { mods += 1; notes.push('cover'); }
    mods -= effectSum(u, 'toHit');
    var skill = commander ? effCmdStats(u, this).sk : effStats(u, this).sk;
    res.ok = true; res.weapon = w; res.dist = dist; res.target = R.rangedHitTarget(skill, mods); res.notes = notes;
    res.shooters = commander ? 1 : (w.perModel ? Math.max(1, u.models) : 1);
    return res;
  };
  BP.shoot = function (uid, targetUid, commander) {
    var u = this.unit(uid), t = this.unit(targetUid);
    if (!u || !t || this.activeUnit !== uid) return { ok: false, reason: 'Not active' };
    var info = this.rangedInfo(u, t, commander); if (!info.ok) return info;
    var w = info.weapon, hits = 0, roll, hitDice = [];
    if (w.once) u.usedOnce[w.name] = true;
    if (w.perModel || commander) {
      var n = info.shooters * (w.shots || 1);
      roll = R.rollAgainst(n, info.target, { rerollMiss: false });
      // Mechanical Expertise: re-roll 1s
      if (hasEffect(u, 'reroll1s')) { for (var i = 0; i < roll.dice.length; i++) if (roll.dice[i] === 1) { var v = R.d6(); roll.dice[i] = v; if (v >= info.target) roll.hits++; } }
      hits = roll.hits; hitDice = roll.dice;
    } else {
      var shots = w.shots || 1;
      roll = R.rollAgainst(shots, info.target, {});
      if (hasEffect(u, 'reroll1s')) { for (var k = 0; k < roll.dice.length; k++) if (roll.dice[k] === 1) { var v2 = R.d6(); roll.dice[k] = v2; if (v2 >= info.target) roll.hits++; } }
      hitDice = roll.dice;
      for (var j = 0; j < roll.hits; j++) hits += R.rollExpr(w.hits || '1').total;
    }
    if (commander) u.usedSpell = true; else u.usedRanged = true;
    var lethal = hasProp(u, 'Lethal Shots') || (commander && cmdHasProp(u, 'Lethal Shots'));
    var dmg = this.applyHits(t, hits, w.pow, { lethal: lethal, source: u, ranged: true });
    var txt = u.name + (commander ? ' (' + u.commander.name + ')' : '') + ' fires ' + w.name + ' at ' + t.name + ': ' + hits + ' hit' + (hits === 1 ? '' : 's') + ' (' + info.target + '+' + (info.notes.length ? ', ' + info.notes.join(', ') : '') + '), ' + dmg.wounds + ' wound' + (dmg.wounds === 1 ? '' : 's') + (dmg.killed ? ', ' + dmg.killed + ' slain' : '') + '.';
    var entry = this.addLog(txt, 'shoot', { hitDice: hitDice, hitTarget: info.target, saveDice: dmg.saveDice, saveTarget: dmg.saveTarget });
    this.emit({ type: 'shoot', from: u.uid, to: t.uid, hits: hits, wounds: dmg.wounds, killed: dmg.killed, log: entry });
    this.afterCasualties(t, dmg, u);
    return { ok: true, hits: hits, wounds: dmg.wounds, killed: dmg.killed, dmg: dmg };
  };
  // Apply N hits at power P to unit t; returns wounds/killed info.
  BP.applyHits = function (t, hits, pow, opts) {
    opts = opts || {};
    var res = { hits: hits, wounds: 0, killed: 0, commanderKilled: false, saveDice: [], saveTarget: null };
    if (hits <= 0 || !unitAlive(t)) return res;
    var ds = effStats(t, this), target = R.saveTarget(pow, ds.df - ((opts.melee && hasProp(t, 'Crewed Weapon')) ? 2 : 0));
    var sv = R.rollSaves(hits, target, { halberd: opts.halberd, poison: opts.poison, rerollFail: hasEffect(t, 'rerollSaves'), saveBonus: ds.saveBonus });
    res.saveDice = sv.dice; res.saveTarget = sv.target;
    var wounds = sv.failed;
    var dmg = this.applyWounds(t, wounds, opts);
    res.wounds = dmg.wounds; res.killed = dmg.killed; res.commanderKilled = dmg.commanderKilled; res.commanderWounds = dmg.commanderWounds;
    return res;
  };
  BP.applyWounds = function (t, wounds, opts) {
    opts = opts || {};
    var res = { wounds: 0, killed: 0, commanderKilled: false, commanderWounds: 0 };
    var W = t.base.wd;
    while (wounds > 0 && t.models > 0) {
      var dealt = (opts.lethal && W > 1) ? Math.min(2, W - t.woundsOnCurrent) : 1;
      t.woundsOnCurrent += dealt; res.wounds += dealt; wounds--;
      if (t.woundsOnCurrent >= W) { t.models--; t.killed++; res.killed++; t.woundsOnCurrent = 0; }
    }
    if (wounds > 0 && t.commander && t.commander.alive) {
      var c = t.commander;
      while (wounds > 0 && c.alive) {
        var d2 = (opts.lethal && c.maxWounds > 1) ? Math.min(2, c.maxWounds - c.wounds) : 1;
        c.wounds += d2; res.wounds += d2; res.commanderWounds += d2; wounds--;
        if (c.wounds >= c.maxWounds) { c.alive = false; res.commanderKilled = true; this.addLog(c.name + ' has been slain!', 'kill'); this.emit({ type: 'commanderDeath', uid: t.uid }); }
      }
    }
    if (t.models <= 0 && t.commander && t.commander.alive && !t.wasRetinueLost) {
      t.wasRetinueLost = true; t.files = 1; refreshFootprint(t, true);
      this.addLog(t.commander.name + ' fights on alone.', 'info');
    } else if (t.models > 0) refreshFootprint(t, true);
    if (!unitAlive(t)) this.destroyUnit(t, 'destroyed');
    return res;
  };
  BP.destroyUnit = function (u, how) {
    if (u.removed) return;
    u.removed = true; u.removedHow = how; u.models = Math.max(0, u.models);
    if (u.commander && how !== 'fled') { u.commander.alive = false; }
    this.units = this.units.filter(function (x) { return x !== u; });
    this.contacts = this.contacts.filter(function (c) { return c.a !== u.uid && c.b !== u.uid; });
    this.charges = this.charges.filter(function (c) { return c.charger !== u.uid && c.target !== u.uid; });
    this.dead.push(u);
    this.addLog(u.name + ' is ' + how + '.', 'kill');
    this.emit({ type: 'destroy', uid: u.uid, how: how });
    if (this.activeUnit === u.uid) this.activeUnit = null;
  };
  // Heavy casualties: 25%+ of current models lost to shooting/magic -> Discipline test or flee
  BP.afterCasualties = function (t, dmg, source) {
    if (!unitAlive(t) || t.removed || t.fleeing || dmg.killed <= 0) return;
    var before = t.models + dmg.killed;
    if (dmg.killed < Math.ceil(before * 0.25) || isReanimated(t)) return;
    if (this.isEngaged(t)) return;
    var test = this.disciplineTest(t, 0, 'heavy casualties');
    if (!test.ok) {
      var away = Math.atan2(t.y - source.y, t.x - source.x);
      t.fleeing = true; this.contacts = this.contacts.filter(function (c) { return c.a !== t.uid && c.b !== t.uid; });
      this.flightMove(t, away, 'panics and flees');
    }
  };
  BP.disciplineTest = function (u, penalty, why) {
    var s = effStats(u, this), rb = commanderOnly(u) ? 0 : R.rankBonus(u.models, u.files), fearless = isFearless(u, this);
    var value = s.ds + rb - (fearless ? 0 : penalty);
    var reroll = (hasProp(u, 'Bodyguard') && u.commander && u.commander.alive) || (u.banner && u.banner.effect.rerollBreak && why === 'break test');
    var test = R.disciplineTest(value, { reroll: reroll });
    test.value = value; test.rankBonus = rb; test.fearless = fearless;
    if (isReanimated(u)) { test.ok = true; test.reanimated = true; }
    var txt = u.name + ' tests Discipline (' + why + '): needs ' + value + ' (Disc ' + s.ds + (rb ? ' + ' + rb + ' ranks' : '') + (penalty && !fearless ? ' − ' + penalty : '') + '), rolls ' + test.total + (test.rerolled ? ' after re-roll' : '') + ' — ' + (test.reanimated ? 'Reanimated never fail' : test.ok ? 'holds' : 'FAILS') + '.';
    var e = this.addLog(txt, test.ok ? 'test' : 'fail', { discDice: test.dice, target: value });
    test.log = e;
    return test;
  };
  // Flight move: d6 per 4" of base movement, in direction `ang`.
  BP.flightMove = function (u, ang, why) {
    var base = isFlying(u) ? 20 : (commanderOnly(u) ? 8 : u.typeInfo.move), n = Math.max(1, Math.floor(base / 4));
    var dice = R.dice(n), dist = R.sum(dice), from = { x: u.x, y: u.y, a: u.a };
    var tried = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05], placed = false, self = this, final = null;
    for (var i = 0; i < tried.length && !placed; i++) {
      var a = ang + tried[i], f = G.fwd(a), last = null, escaped = false;
      for (var s = 0.5; s <= dist + 1e-9; s += 0.5) {
        var r = { x: from.x + f.x * s, y: from.y + f.y * s, a: a, w: u.w, d: u.d };
        if (G.rectTouchesEdge(r, TABLE.w, TABLE.h)) { escaped = true; last = r; break; }
        var hit = null;
        if (!isFlying(u)) for (var j = 0; j < this.terrain.length; j++) { var t = this.terrain[j]; if (SOVL.TERRAIN_TYPES[t.kind].impassable && G.rectOverlapsAabb(r, t, -0.05)) { hit = t; break; } }
        if (hit) break;
        last = r;
      }
      if (last && (escaped || !this.collides(u, last, [], false))) { final = last; final.escaped = escaped; placed = true; }
    }
    if (!placed) {
      // every heading collides at full distance: take the first heading and slide back until clear
      var f0 = G.fwd(ang);
      for (var s0 = dist; s0 >= 0 && !placed; s0 -= 0.5) {
        var r0 = { x: from.x + f0.x * s0, y: from.y + f0.y * s0, a: ang, w: u.w, d: u.d };
        if (G.rectInsideTable(r0, TABLE.w, TABLE.h, 0) && !this.collides(u, r0, [], false)) { final = r0; final.escaped = false; placed = true; }
      }
    }
    if (!final) final = { x: from.x, y: from.y, a: ang, escaped: false };
    u.x = final.x; u.y = final.y; u.a = final.a;
    this.addLog(u.name + ' ' + why + ' ' + dist + '" (' + dice.join('+') + ').', 'flee', { dice: dice });
    this.emit({ type: 'flee', uid: u.uid, from: from, to: { x: u.x, y: u.y, a: u.a }, dice: dice });
    if (final.escaped) { this.destroyUnit(u, 'fled'); return { escaped: true, dist: dist }; }
    return { escaped: false, dist: dist };
  };

  // ---------- Spells & abilities ----------
  BP.spellTargets = function (u, spellName) {
    var sp = SOVL.SPELLS[spellName], self = this, out = [];
    if (!sp) return out;
    var fc = { x: u.x, y: u.y };
    if (sp.self || sp.kind === 'summon') return [u];
    this.units.forEach(function (t) {
      if (!unitAlive(t)) return;
      var friendly = t.side === u.side;
      if ((sp.kind === 'buff' || sp.kind === 'heal') && !friendly) return;
      if ((sp.kind === 'bolt' || sp.kind === 'hex') && friendly) return;
      if (sp.kind === 'heal' && !isReanimated(t)) return;
      if (!friendly && (hasEffect(t, 'shrouded') || cmdHasItemFlag(t, 'ward'))) return;
      if (!friendly && self.isEngaged(t) && sp.kind === 'bolt') return;
      var dist = G.dist(fc, t) - Math.min(t.w, t.d) / 2;
      if (dist > sp.range) return;
      if (!friendly && sp.kind === 'bolt' && self.losBlocked(fc, t)) return;
      out.push(t);
    });
    return out;
  };
  BP.canCast = function (u) {
    return u.commander && u.commander.alive && u.commander.spells.length > 0 && !u.usedSpell && !u.fleeing;
  };
  BP.cast = function (uid, spellName, targetUid) {
    var u = this.unit(uid), t = this.unit(targetUid), sp = SOVL.SPELLS[spellName];
    if (!u || !sp || this.activeUnit !== uid) return { ok: false, reason: 'Not active' };
    if (!this.canCast(u) || u.commander.spells.indexOf(spellName) < 0) return { ok: false, reason: 'Cannot cast' };
    if (u.spellsCastThisTurn[spellName]) return { ok: false, reason: 'Already cast this turn' };
    if (!t || this.spellTargets(u, spellName).indexOf(t) < 0) return { ok: false, reason: 'Invalid target' };
    u.usedSpell = true; u.spellsCastThisTurn[spellName] = true;
    var lvl = u.commander.caster + itemBonus(u, 'casting'), dice = R.dice(2), total = R.sum(dice) + lvl, ok = total >= sp.cv;
    var miscast = dice[0] === 1 && dice[1] === 1;
    var txt = u.commander.name + ' casts ' + spellName + ' (needs ' + sp.cv + '): rolls ' + dice.join('+') + ' + ' + lvl + ' = ' + total + ' — ';
    if (miscast) { txt += 'MISCAST! The caster is wracked by the winds of magic.'; this.addLog(txt, 'fail', { dice: dice }); this.woundCommander(u, 1); this.emit({ type: 'spell', from: u.uid, to: t.uid, spell: spellName, ok: false }); return { ok: true, cast: false, miscast: true }; }
    if (!ok) { txt += 'the spell fizzles.'; this.addLog(txt, 'fail', { dice: dice }); this.emit({ type: 'spell', from: u.uid, to: t.uid, spell: spellName, ok: false }); return { ok: true, cast: false }; }
    txt += 'success!'; this.addLog(txt, 'spell', { dice: dice });
    var result = { ok: true, cast: true };
    if (sp.kind === 'bolt') {
      var hits = R.rollExpr(sp.hits).total, dmg = this.applyHits(t, hits, sp.pow, { lethal: !!sp.lethal, source: u });
      this.addLog(spellName + ' strikes ' + t.name + ' with ' + hits + ' hits (Power ' + sp.pow + '): ' + dmg.wounds + ' wounds' + (dmg.killed ? ', ' + dmg.killed + ' slain' : '') + '.', 'spell', { saveDice: dmg.saveDice, saveTarget: dmg.saveTarget });
      result.dmg = dmg; this.afterCasualties(t, dmg, u);
    } else if (sp.kind === 'hex') {
      if (sp.effect.hits) { var h2 = R.rollExpr(sp.effect.hits).total, d2 = this.applyHits(t, h2, sp.effect.pow, { source: u }); this.addLog(spellName + ' inflicts ' + h2 + ' hits on ' + t.name + ': ' + d2.wounds + ' wounds.', 'spell', { saveDice: d2.saveDice, saveTarget: d2.saveTarget }); result.dmg = d2; this.afterCasualties(t, d2, u); }
      if (unitAlive(t) && !t.removed) t.effects.push({ name: spellName, effect: sp.effect, until: this.turn + (sp.effect.rooted ? 1 : 0), untilPhase: 'end' });
    } else if (sp.kind === 'buff') {
      t.effects.push({ name: spellName, effect: sp.effect, until: this.turn, untilPhase: 'end' });
    } else if (sp.kind === 'heal') {
      var heal = R.rollExpr(sp.heal).total; this.healUnit(t, heal);
      this.addLog(t.name + ' recovers ' + heal + ' wounds.', 'spell');
    } else if (sp.kind === 'summon') {
      var placed = this.summonUnit(u, sp.summon, sp.count);
      this.addLog(placed ? 'A unit of ' + sp.count + ' ' + placed.name + ' claws its way out of the ground!' : 'There is no room for the dead to rise.', 'spell');
    }
    this.emit({ type: 'spell', from: u.uid, to: t.uid, spell: spellName, ok: true });
    return result;
  };
  BP.woundCommander = function (u, n) {
    var c = u.commander; if (!c || !c.alive) return;
    c.wounds += n;
    if (c.wounds >= c.maxWounds) { c.alive = false; this.addLog(c.name + ' has been slain!', 'kill'); this.emit({ type: 'commanderDeath', uid: u.uid }); if (!unitAlive(u)) this.destroyUnit(u, 'destroyed'); }
  };
  BP.healUnit = function (t, wounds) {
    var W = t.base.wd;
    while (wounds > 0) {
      if (t.woundsOnCurrent > 0) { t.woundsOnCurrent--; wounds--; continue; }
      if (t.models < t.maxModels) { t.models++; wounds -= 1; t.woundsOnCurrent = W - 1; if (t.woundsOnCurrent < 0) t.woundsOnCurrent = 0; if (W === 1) t.woundsOnCurrent = 0; continue; }
      break;
    }
    var before = { x: t.x, y: t.y, d: t.d, models: t.models };
    refreshFootprint(t, true);
    if (t.d > before.d + 1e-9 && this.collides(t, t, [], false)) {
      // the deeper block would overlap something: shift it forward by the growth if possible, else keep the old rear
      var f = G.fwd(t.a), grow = t.d - before.d, r2 = { x: t.x + f.x * grow, y: t.y + f.y * grow, a: t.a, w: t.w, d: t.d };
      if (G.rectInsideTable(r2, TABLE.w, TABLE.h, 0) && !this.collides(t, r2, [], false)) { t.x = r2.x; t.y = r2.y; }
    }
  };
  BP.summonUnit = function (caster, unitId, count) {
    var nu = makeUnit(caster.side, caster.faction, { id: unitId, models: count, cost: 0 });
    nu.name = nu.name + ' (raised)';
    var angs = [0, 1, -1, 2, -2, 3, -3, Math.PI];
    for (var d = 3; d <= 8; d += 1) for (var i = 0; i < angs.length; i++) {
      var a = caster.a + angs[i] * 0.6, r = { x: caster.x + Math.cos(a) * d, y: caster.y + Math.sin(a) * d, a: caster.a, w: nu.w, d: nu.d };
      if (G.rectInsideTable(r, TABLE.w, TABLE.h, 0) && !this.collides(nu, r, [], false)) {
        var near = false; for (var k = 0; k < this.units.length; k++) if (this.units[k].side !== caster.side && G.rectsOverlap(r, this.units[k], 0.5)) near = true;
        if (near) continue;
        nu.x = r.x; nu.y = r.y; nu.a = r.a; nu.placed = true; nu.activated = true; this.units.push(nu); this.emit({ type: 'summon', uid: nu.uid }); return nu;
      }
    }
    return null;
  };
  // Activated abilities available to a unit (unit-level and commander-level)
  BP.unitAbilities = function (u) {
    var out = [];
    for (var i = 0; i < u.props.length; i++) { var p = SOVL.PROPS[u.props[i]]; if (p && p.ability && !(p.once && u.usedOnce[p.ability])) out.push({ id: p.ability, name: u.props[i], desc: p.desc, level: 'unit' }); }
    return out;
  };
  BP.commanderAbilities = function (u) {
    var out = []; if (!u.commander || !u.commander.alive) return out;
    for (var i = 0; i < u.commander.props.length; i++) { var p = SOVL.PROPS[u.commander.props[i]]; if (p && p.ability && !(p.once && u.usedOnce[p.ability])) out.push({ id: p.ability, name: u.commander.props[i], desc: p.desc, level: 'commander' }); }
    return out;
  };
  BP.abilityTargets = function (u, id) {
    var self = this, out = [];
    switch (id) {
      case 'web': this.enemiesOf(u.side).forEach(function (t) { if (G.dist(u, t) <= 12 + Math.min(t.w, t.d) / 2) out.push(t); }); return out;
      case 'rallying_cry': this.unitsOf(u.side).forEach(function (t) { if (t.fleeing && G.dist(u, t) <= 12 + t.d / 2) out.push(t); }); return out;
      case 'mech_expertise': this.unitsOf(u.side).forEach(function (t) { if (t.type === 'War Machine' && G.dist(u, t) <= 12 + 1) out.push(t); }); return out;
      default: return [u];
    }
  };
  BP.useAbility = function (uid, id, targetUid) {
    var u = this.unit(uid); if (!u || this.activeUnit !== uid) return { ok: false, reason: 'Not active' };
    var ab = this.unitAbilities(u).concat(this.commanderAbilities(u)).filter(function (a) { return a.id === id; })[0];
    if (!ab) return { ok: false, reason: 'Ability not available' };
    if (ab.level === 'unit' && (u.usedAbility || u.usedRanged)) return { ok: false, reason: 'Unit already used an ability or ranged attack' };
    if (ab.level === 'commander' && u.usedSpell) return { ok: false, reason: 'Commander already acted' };
    var t = targetUid != null ? this.unit(targetUid) : u;
    if (!t || this.abilityTargets(u, id).indexOf(t) < 0) return { ok: false, reason: 'Invalid target' };
    var p = SOVL.PROPS[ab.name];
    if (p.once) u.usedOnce[id] = true;
    if (ab.level === 'unit') u.usedAbility = true; else u.usedSpell = true;
    var ae = this.armyEffects[u.side];
    switch (id) {
      case 'reposition': u.moveLeft += 6; u.effects.push({ name: 'Reposition', effect: { move: 6 }, until: this.turn }); break;
      case 'fullsteam': u.moveLeft += 4; u.effects.push({ name: 'Full Steam', effect: { move: 4 }, until: this.turn }); break;
      case 'web': t.effects.push({ name: 'Web', effect: { move: -4 }, until: this.turn + 1 }); break;
      case 'mountains_will': ae.defense = 1; ae.defenseUntil = this.turn; break;
      case 'inspire_valor': ae.combatScore = 1; ae.combatScoreUntil = this.turn; break;
      case 'furious_charge': u.effects.push({ name: 'Furious Charge', effect: { rerollMiss: true }, until: this.turn }); break;
      case 'warcry': ae.power = 1; ae.powerUntil = this.turn; break;
      case 'power_of_many': ae.goblinsFearless = true; ae.goblinsUntil = this.turn; break;
      case 'rallying_cry': t.fleeing = false; this.addLog(t.name + ' rallies to the cry!', 'test'); break;
      case 'mech_expertise': t.effects.push({ name: 'Mechanical Expertise', effect: { defense: 2, reroll1s: true }, until: 99 }); break;
    }
    this.addLog(u.name + ' uses ' + ab.name + (t !== u ? ' on ' + t.name : '') + '.', 'spell');
    this.emit({ type: 'ability', uid: u.uid, id: id, target: t.uid });
    return { ok: true };
  };
  BP.rally = function (uid) {
    var u = this.unit(uid); if (!u || this.activeUnit !== uid || !u.fleeing) return { ok: false, reason: 'Not fleeing' };
    var test = this.disciplineTest(u, 0, 'rally');
    if (test.ok) { u.fleeing = false; this.addLog(u.name + ' rallies!', 'test'); }
    this.endActivation();
    return { ok: true, rallied: test.ok };
  };
  BP.endStrategicPhase = function () {
    var self = this;
    // fleeing units that did not rally flee toward the nearest table edge
    this.units.slice().forEach(function (u) {
      if (!u.fleeing || u.removed) return;
      var dl = u.x, dr = TABLE.w - u.x, dt = u.y, db = TABLE.h - u.y, m = Math.min(dl, dr, dt, db), ang = m === dl ? Math.PI : m === dr ? 0 : m === dt ? -Math.PI / 2 : Math.PI / 2;
      self.flightMove(u, ang, 'keeps fleeing');
    });
    this.beginCombatPhase();
  };

  // ---------- Combat phase ----------
  BP.beginCombatPhase = function () {
    this.phase = 'combat'; this.activeUnit = null;
    this.addLog('— Turn ' + this.turn + ': Combat Phase —', 'phase');
    this.emit({ type: 'phase', phase: 'combat', turn: this.turn });
    this.combatReports = this.resolveCombat();
    this.endTurn();
  };
  BP.engagements = function () {
    // connected components of contacts
    var groups = [], seen = {}, self = this;
    this.contacts.forEach(function (c) {
      var ga = seen[c.a], gb = seen[c.b];
      if (ga && gb) { if (ga !== gb) { ga.uids = ga.uids.concat(gb.uids); gb.uids.forEach(function (x) { seen[x] = ga; }); groups = groups.filter(function (g) { return g !== gb; }); } }
      else if (ga) { ga.uids.push(c.b); seen[c.b] = ga; }
      else if (gb) { gb.uids.push(c.a); seen[c.a] = gb; }
      else { var g = { uids: [c.a, c.b] }; seen[c.a] = g; seen[c.b] = g; groups.push(g); }
    });
    return groups.map(function (g) { return g.uids.map(function (id) { return self.unit(id); }).filter(Boolean); });
  };
  // Attack allocation for a unit: list of { target, dice, skill, power, lethal, rerollMiss, who }
  BP.meleeAttacks = function (u) {
    var self = this, s = effStats(u, this), cons = this.contactsOf(u), out = [], charged = u.chargedThisTurn;
    var w = SOVL.WEAPONS[u.weapon] || SOVL.WEAPONS.Unarmed;
    var pow = s.pw, att = s.at;
    if (charged) {
      pow += w.chargePow || 0;
      for (var i = 0; i < u.props.length; i++) { var p = SOVL.PROPS[u.props[i]]; if (p && p.chargePow) pow += p.chargePow; if (p && p.chargeAtt) att += p.chargeAtt; }
      if (u.banner && u.banner.effect.chargePow) pow += u.banner.effect.chargePow;
    }
    var rerollMiss = hasProp(u, 'Elven Mastery') || hasEffect(u, 'rerollMiss') || (hasProp(u, 'Frenzy') && u.combatRounds === 0);
    var single = commanderOnly(u) || isSingle(u.type);
    var byPri = { front: 0, left: 1, right: 1, rear: 2 };
    cons.sort(function (a, b) { return byPri[a.side] - byPri[b.side]; });
    if (!cons.length) return out;
    if (single && !commanderOnly(u)) {
      // one model: all attacks against the first contact (front > flank > rear); rear contact = no attacks
      var c0 = cons[0]; if (c0.side !== 'rear') out.push({ target: c0.enemy, dice: att, skill: s.sk, power: pow, halberd: !!w.halberd, poison: hasProp(u, 'Poisoned Attacks'), rerollMiss: rerollMiss, who: u.name });
    } else if (!commanderOnly(u)) {
      var frontModels = Math.min(u.models, u.files), rk = ranks(u), usedFrontCorner = 0;
      cons.forEach(function (c) {
        if (c.side === 'rear') return;
        var n = 0;
        if (c.side === 'front') {
          n = frontModels * att;
          // supporting attacks from the second rank (and third with spears when not charging)
          var second = Math.min(Math.max(0, u.models - u.files), u.files), third = 0;
          if (w.extraRank && !charged) third = Math.min(Math.max(0, u.models - 2 * u.files), u.files);
          n += second + third;
        } else {
          n = Math.max(0, rk - (usedFrontCorner ? 1 : 0)) * att; // one model per rank along the flank
        }
        if (n > 0) out.push({ target: c.enemy, dice: n, skill: s.sk, power: pow, halberd: !!w.halberd, poison: hasProp(u, 'Poisoned Attacks'), rerollMiss: rerollMiss, who: u.name });
        if (c.side === 'front') usedFrontCorner = 1;
      });
    }
    if (u.commander && u.commander.alive) {
      var cs = effCmdStats(u, this), cw = SOVL.WEAPONS[u.commander.weapon] || SOVL.WEAPONS.Unarmed, cpow = cs.pw + (charged ? (cw.chargePow || 0) : 0);
      var c1 = cons.filter(function (c) { return c.side !== 'rear'; })[0];
      if (c1) out.push({ target: c1.enemy, dice: cs.at, skill: cs.sk, power: cpow, halberd: !!cw.halberd, lethal: cs.lethal, rerollMiss: rerollMiss || hasEffect(u, 'rerollMiss'), who: u.commander.name, commander: true });
    }
    return out;
  };
  BP.resolveCombat = function () {
    var self = this, reports = [];
    var groups = this.engagements(), inCombat = {};
    groups.forEach(function (g) { g.forEach(function (u) { inCombat[u.uid] = true; }); });
    this.units.forEach(function (u) { if (!inCombat[u.uid]) u.combatRounds = 0; });
    groups.forEach(function (group) {
      var report = { units: group.map(function (u) { return u.uid; }), rounds: [], score: [0, 0], breakTests: [], names: group.map(function (u) { return u.name; }) };
      self.addLog('Engagement: ' + group.map(function (u) { return u.name; }).join(' vs ') + '.', 'combat');
      // 1. everyone rolls (simultaneous): compute all attacks before applying wounds
      var pending = [];
      group.forEach(function (u) {
        self.meleeAttacks(u).forEach(function (atk) {
          var t = atk.target, ts = effStats(t, self);
          var target = R.meleeHitTarget(atk.skill, ts.sk);
          var roll = R.rollAgainst(atk.dice, target, { rerollMiss: atk.rerollMiss, rerollHit: hasProp(t, 'Putrid Stench') });
          pending.push({ attacker: u, atk: atk, target: t, hitRoll: roll, hitTarget: target });
        });
      });
      // 2. apply wounds
      var woundsBy = {};
      pending.forEach(function (p) {
        if (p.target.removed) { self.addLog(p.atk.who + ' finds no enemy left to fight.', 'combat'); return; }
        var dmg = self.applyHits(p.target, p.hitRoll.hits, p.atk.power, { melee: true, halberd: p.atk.halberd, poison: p.atk.poison, lethal: p.atk.lethal, source: p.attacker });
        woundsBy[p.attacker.side] = (woundsBy[p.attacker.side] || 0) + dmg.wounds;
        var txt = p.atk.who + ' attacks ' + p.target.name + ': ' + p.atk.dice + ' dice, ' + p.hitRoll.hits + ' hits (' + p.hitTarget + '+), ' + dmg.wounds + ' wounds' + (dmg.killed ? ', ' + dmg.killed + ' slain' : '') + '.';
        var e = self.addLog(txt, 'combat', { hitDice: p.hitRoll.dice, hitTarget: p.hitTarget, saveDice: dmg.saveDice, saveTarget: dmg.saveTarget });
        report.rounds.push({ who: p.atk.who, attacker: p.attacker.uid, target: p.target.uid, targetName: p.target.name, dice: p.atk.dice, hits: p.hitRoll.hits, hitTarget: p.hitTarget, hitDice: p.hitRoll.dice, wounds: dmg.wounds, killed: dmg.killed, saveDice: dmg.saveDice, saveTarget: dmg.saveTarget, commanderKilled: dmg.commanderKilled });
      });
      // 3. combat score
      var score = [0, 0];
      score[0] += woundsBy[0] || 0; score[1] += woundsBy[1] || 0;
      group.forEach(function (u) {
        if (u.removed) return;
        self.contactsOf(u).forEach(function (c) { if (c.enemySide === 'left' || c.enemySide === 'right') score[u.side] += 1; else if (c.enemySide === 'rear') score[u.side] += 1; });
        if (u.banner && u.banner.effect.combatScore) score[u.side] += u.banner.effect.combatScore;
      });
      for (var s = 0; s < 2; s++) if (self.armyEffects[s].combatScore) score[s] += self.armyEffects[s].combatScore;
      report.score = score;
      var alive = group.filter(function (u) { return !u.removed; });
      var sides = [alive.some(function (u) { return u.side === 0; }), alive.some(function (u) { return u.side === 1; })];
      self.addLog('Combat score: ' + self.names[0] + ' ' + score[0] + ' — ' + self.names[1] + ' ' + score[1] + '.', 'combat');
      group.forEach(function (u) { if (!u.removed) u.combatRounds++; });
      if (!sides[0] || !sides[1] || score[0] === score[1]) { if (score[0] === score[1] && sides[0] && sides[1]) self.addLog('The combat is a draw; both sides hold.', 'combat'); reports.push(report); return; }
      var loser = score[0] > score[1] ? 1 : 0, diff = Math.abs(score[0] - score[1]);
      // 4. break tests for the losing side
      alive.filter(function (u) { return u.side === loser; }).forEach(function (u) {
        var test = self.disciplineTest(u, diff, 'break test');
        var bt = { uid: u.uid, name: u.name, ok: test.ok, dice: test.dice, value: test.value, reanimated: !!test.reanimated };
        if (test.reanimated) {
          var crumble = Math.max(0, R.d3() - ((u.commander && u.commander.alive && cmdHasProp(u, 'Eternal Reign')) ? 1 : 0));
          if (crumble > 0) { var cd = self.applyWounds(u, crumble, {}); self.addLog(u.name + ' crumbles: ' + cd.wounds + ' wounds lost.', 'fail'); bt.crumble = cd.wounds; }
        } else if (!test.ok) {
          var enemies = self.contactsOf(u).map(function (c) { return c.enemy; });
          var cx = 0, cy = 0; enemies.forEach(function (e) { cx += e.x; cy += e.y; }); cx /= enemies.length || 1; cy /= enemies.length || 1;
          var away = enemies.length ? Math.atan2(u.y - cy, u.x - cx) : u.a + Math.PI;
          u.fleeing = true;
          self.contacts = self.contacts.filter(function (c) { return c.a !== u.uid && c.b !== u.uid; });
          var fm = self.flightMove(u, away, 'breaks and flees');
          bt.fled = true; bt.escaped = fm.escaped;
        }
        report.breakTests.push(bt);
      });
      reports.push(report);
    });
    this.contacts.forEach(function (c) { c.age++; });
    return reports;
  };

  // ---------- End of turn ----------
  BP.endTurn = function () {
    var self = this;
    // regeneration, effects expiry, once-per-turn army effects
    this.units.forEach(function (u) {
      if (hasProp(u, 'Regeneration') || (u.commander && u.commander.alive && cmdHasProp(u, 'Eternal Reign') && commanderOnly(u))) { if (u.woundsOnCurrent > 0) { u.woundsOnCurrent = 0; } }
      if (u.commander && u.commander.alive && (cmdHasItemFlag(u, 'regen') || cmdHasProp(u, 'Eternal Reign'))) u.commander.wounds = 0;
      u.effects = u.effects.filter(function (e) { return e.until > self.turn; });
      u.chargedThisTurn = false;
    });
    for (var s = 0; s < 2; s++) {
      var ae = this.armyEffects[s];
      if (ae.defenseUntil != null && ae.defenseUntil <= this.turn) { delete ae.defense; delete ae.defenseUntil; }
      if (ae.combatScoreUntil != null && ae.combatScoreUntil <= this.turn) { delete ae.combatScore; delete ae.combatScoreUntil; }
      if (ae.powerUntil != null && ae.powerUntil <= this.turn) { delete ae.power; delete ae.powerUntil; }
      if (ae.goblinsUntil != null && ae.goblinsUntil <= this.turn) { delete ae.goblinsFearless; delete ae.goblinsUntil; }
    }
    this.updateObjectives();
    this.emit({ type: 'endTurn', turn: this.turn });
    // victory check: all of one side destroyed or fleeing
    var stand = [false, false];
    this.units.forEach(function (u) { if (!u.fleeing) stand[u.side] = true; });
    if (!stand[0] || !stand[1]) { this.endGame(!stand[0] && !stand[1] ? 'mutual' : (!stand[0] ? 'rout0' : 'rout1')); return; }
    this.beginTurn();
  };
  BP.updateObjectives = function () {
    if (this.scenario !== 'objectives' || this.turn <= 1) return;
    var self = this, control = [0, 0];
    this.objectives.forEach(function (o) {
      var near = [false, false]; o.contested = false;
      self.units.forEach(function (u) { if (u.fleeing || isSingle(u.type) || commanderOnly(u)) return; if (G.dist(u, o) <= 5 + Math.max(u.w, u.d) / 2) near[u.side] = true; });
      if (near[0] && !near[1]) o.owner = 0; else if (near[1] && !near[0]) o.owner = 1; else if (near[0] && near[1]) o.contested = true;
      if (o.owner != null) control[o.owner]++;
    });
    if (control[0] > control[1]) { this.objectiveScore[0] += 50; this.addLog(this.names[0] + ' holds more objectives: +50 points.', 'info'); }
    else if (control[1] > control[0]) { this.objectiveScore[1] += 50; this.addLog(this.names[1] + ' holds more objectives: +50 points.', 'info'); }
  };
  BP.scoreFor = function (side) {
    var pts = 0, self = this, enemy = 1 - side;
    var all = this.units.concat(this.dead).filter(function (u) { return u.side === enemy; });
    all.forEach(function (u) {
      var cost = u.cost || 0;
      if (u.removed || u.fleeing) pts += cost;
      else if (u.models < u.maxModels / 2) pts += Math.floor(cost / 2);
      if (u.commander && !u.commander.alive) pts += u.commander.costPts || 0;
    });
    return pts + this.objectiveScore[side];
  };
  BP.armyValue = function (side) { return this.units.concat(this.dead).filter(function (u) { return u.side === side; }).reduce(function (s, u) { return s + (u.cost || 0) + (u.commander ? (u.commander.costPts || 0) : 0); }, 0); };
  BP.endGame = function (why) {
    this.phase = 'end';
    var s0 = this.scoreFor(0), s1 = this.scoreFor(1), winner = null;
    var v0 = Math.max(1, this.armyValue(0)), v1 = Math.max(1, this.armyValue(1));
    var p0 = Math.round(100 * (s0 - this.objectiveScore[0]) / v1) + this.objectiveScore[0] / 10, p1 = Math.round(100 * (s1 - this.objectiveScore[1]) / v0) + this.objectiveScore[1] / 10;
    if (why === 'rout0') winner = 1; else if (why === 'rout1') winner = 0;
    else if (this.scoreMode === 'ratio') { if (p0 !== p1) winner = p0 > p1 ? 0 : 1; }
    else if (s0 !== s1) winner = s0 > s1 ? 0 : 1;
    this.result = { why: why, score: [s0, s1], pct: [p0, p1], winner: winner, turn: this.turn };
    this.winner = winner;
    this.addLog(why === 'turns' ? 'The battle ends after ' + this.maxTurns + ' turns.' : why === 'mutual' ? 'Both armies have broken.' : (why === 'rout0' ? this.names[0] : this.names[1]) + '\'s army is destroyed or fleeing!', 'phase');
    this.addLog('Final score — ' + this.names[0] + ': ' + s0 + (this.scoreMode === 'ratio' ? ' (' + p0 + '% of the enemy army)' : '') + ', ' + this.names[1] + ': ' + s1 + (this.scoreMode === 'ratio' ? ' (' + p1 + '%)' : '') + '. ' + (winner == null ? 'A draw.' : this.names[winner] + ' wins!'), 'phase');
    this.emit({ type: 'end', result: this.result });
  };
  BP.armyStrength = function (side) { return this.unitsOf(side).reduce(function (s, u) { return s + (u.fleeing ? 0 : u.models * (u.base.wd) + (u.commander && u.commander.alive ? 3 : 0)); }, 0); };

  SOVL.unitAlive = unitAlive; SOVL.commanderOnly = commanderOnly; SOVL.hasProp = hasProp; SOVL.isFlying = isFlying; SOVL.isSingle = isSingle; SOVL.ranks = ranks;
})();
