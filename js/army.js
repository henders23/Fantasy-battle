// Army lists: cost calculation, validation, random army generation, terrain generation.
'use strict';
(function () {
  var R = SOVL.R;
  var A = {};

  // Section limits scale with army size (the source lists give the 1000pt values).
  A.sectionLimits = function (section, pts) {
    var min = section.min, max = section.max;
    if (section.name === 'Commanders') return { min: 1, max: pts >= 1500 ? 2 : 1 };
    if (pts <= 500) return { min: Math.min(min, 1), max: Math.max(1, Math.ceil(max / 2)) };
    if (pts >= 1500) return { min: min, max: max + 1 };
    return { min: min, max: max };
  };

  A.optionCost = function (def, name) {
    var i;
    for (i = 0; i < def.weapons.length; i++) if (def.weapons[i].name === name) return def.weapons[i].cost;
    for (i = 0; i < def.ranged.length; i++) if (def.ranged[i].name === name) return def.ranged[i].cost;
    if (def.upgrades) for (i = 0; i < def.upgrades.length; i++) if (def.upgrades[i].name === name) return def.upgrades[i].cost;
    return 0;
  };
  // Cost of a unit entry { id, models, weapon, ranged, upgrades, banner }
  A.unitCost = function (factionId, e) {
    var def = SOVL.findUnitDef(factionId, e.id), per = def.per;
    var models = e.models || def.size[0];
    var cost = per ? def.cost * models : def.cost;
    var perModel = per && models > 1;
    var w = A.optionCost(def, e.weapon); cost += perModel ? w * models : w;
    if (e.ranged) { var r = A.optionCost(def, e.ranged); cost += perModel ? r * models : r; }
    (e.upgrades || []).forEach(function (u) { var c = A.optionCost(def, u); cost += (perModel && SOVL.WEAPONS[u]) ? c * models : (perModel && SOVL.RANGED[u]) ? c * models : c; });
    if (e.banner) { var b = SOVL.bannerById(e.banner); if (b) cost += b.cost; }
    return cost;
  };
  A.commanderCost = function (factionId, c) {
    var def = SOVL.findUnitDef(factionId, c.id), cost = def.cost;
    cost += A.optionCost(def, c.weapon);
    (c.upgrades || []).forEach(function (u) { cost += A.optionCost(def, u); });
    (c.items || []).forEach(function (id) { var it = SOVL.itemById(id); if (it) cost += it.cost; });
    return cost;
  };
  A.entryCost = function (factionId, e) {
    if (e.kind === 'commander') return A.commanderCost(factionId, e) + A.unitCost(factionId, e.retinue);
    return A.unitCost(factionId, e);
  };
  A.armyCost = function (army) { return army.entries.reduce(function (s, e) { return s + A.entryCost(army.faction, e); }, 0); };

  // Validate an army against size and section limits. Returns list of problems.
  A.validate = function (army, pts) {
    var probs = [], f = SOVL.FACTION_DATA[army.faction], counts = {};
    if (!f) return ['Unknown faction'];
    army.entries.forEach(function (e) {
      var sec = SOVL.findSection(army.faction, e.id); if (sec) counts[sec.name] = (counts[sec.name] || 0) + 1;
      var def = SOVL.findUnitDef(army.faction, e.kind === 'commander' ? e.retinue.id : e.id);
      var target = e.kind === 'commander' ? e.retinue : e;
      if (def.per && (target.models < def.size[0] || target.models > def.size[1])) probs.push(def.name + ': unit size must be ' + def.size[0] + '–' + def.size[1]);
      if (e.kind === 'commander') {
        var cdef = SOVL.findUnitDef(army.faction, e.id);
        if (cdef.retinue.indexOf(e.retinue.id) < 0) probs.push(cdef.name + ' cannot lead ' + def.name);
        if (cdef.caster && (e.spells || []).length > cdef.caster) probs.push(cdef.name + ' may know at most ' + cdef.caster + ' spells');
        var items = e.items || [];
        if (items.length > (cdef.magic === 'weapon_item' ? 2 : cdef.magic === 'item' ? 1 : 0)) probs.push(cdef.name + ' has too many magic items');
        var kinds = items.map(function (id) { var it = SOVL.itemById(id); return it && it.kind; });
        if (kinds.filter(function (k) { return k === 'weapon'; }).length > 1 || kinds.filter(function (k) { return k === 'item'; }).length > 1) probs.push(cdef.name + ': one magic weapon and one magic item at most');
        if (cdef.magic === 'item' && kinds.indexOf('weapon') >= 0) probs.push(cdef.name + ' cannot take a magic weapon');
      }
      if (target.banner) { var b = SOVL.bannerById(target.banner); if (!def.banner) probs.push(def.name + ' cannot carry a magic banner'); else if (b && b.cost > def.banner) probs.push(def.name + ': banner too expensive (max ' + def.banner + ')'); }
    });
    f.sections.forEach(function (s) {
      if (s.name === 'Mounts') return;
      var lim = A.sectionLimits(s, pts), n = counts[s.name] || 0;
      if (n < lim.min) probs.push(s.name + ': at least ' + lim.min + ' required');
      if (n > lim.max) probs.push(s.name + ': at most ' + lim.max + ' allowed');
    });
    var total = A.armyCost(army);
    if (total > pts) probs.push('Army costs ' + total + ' of ' + pts + ' points');
    return probs;
  };

  A.defaultEntry = function (factionId, unitId, models) {
    var def = SOVL.findUnitDef(factionId, unitId);
    return { kind: 'unit', id: unitId, name: def.name, models: models || def.size[0], weapon: def.weapons[0].name, ranged: def.ranged.length ? def.ranged[0].name : null, upgrades: [], banner: null, vet: 0 };
  };
  A.defaultCommander = function (factionId, cmdId, retinueId, models, name) {
    var cdef = SOVL.findUnitDef(factionId, cmdId);
    var ret = A.defaultEntry(factionId, retinueId || cdef.retinue[0], models);
    return { kind: 'commander', id: cmdId, name: name || (cdef.name + ' ' + R.pick(SOVL.COMMANDER_NAMES[factionId])), weapon: cdef.weapons[0].name, ranged: cdef.ranged.length ? cdef.ranged[0].name : null, upgrades: [], items: [], spells: (cdef.spells || []).slice(0, cdef.caster || 0), retinue: ret, vet: 0 };
  };

  // Random army within a points budget. opts: { faction, pts, seedName, elite, boss }
  A.randomArmy = function (opts) {
    var fid = opts.faction || R.pick(Object.keys(SOVL.FACTION_DATA)), f = SOVL.FACTION_DATA[fid], pts = opts.pts;
    var army = { faction: fid, name: opts.name || f.name, entries: [] };
    var cmds = f.sections[0].units, cdef = opts.boss ? cmds[0] : R.pick(cmds);
    var retChoices = cdef.retinue.filter(function (rid) { var d = SOVL.findUnitDef(fid, rid); return d && (d.type !== 'Large Monster' && d.type !== 'Monstrous Infantry' || pts >= 900); });
    var retId = R.pick(retChoices.length ? retChoices : cdef.retinue), rdef = SOVL.findUnitDef(fid, retId);
    var retModels = rdef.per ? Math.min(rdef.size[1], Math.max(rdef.size[0], Math.round(rdef.size[0] + (rdef.size[1] - rdef.size[0]) * (pts >= 900 ? 0.6 : 0.2)))) : 1;
    var cmd = A.defaultCommander(fid, cdef.id, retId, retModels, opts.commanderName);
    if (cdef.caster) cmd.spells = R.shuffle(cdef.spells.slice()).slice(0, cdef.caster);
    if (cdef.magic && pts >= 700) { var w = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === (cdef.magic === 'item' ? 'item' : 'weapon'); })); cmd.items.push(w.id); }
    if (opts.boss) { var it = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === 'item'; })); if (cmd.items.indexOf(it.id) < 0 && cdef.magic) cmd.items.push(it.id); }
    army.entries.push(cmd);
    var counts = {}; counts['Commanders'] = 1;
    var budget = pts - A.armyCost(army), guard = 0;
    // pick units until the budget is nearly spent
    while (budget > 40 && guard++ < 40 && army.entries.length < (opts.maxEntries || 10)) {
      var secs = f.sections.filter(function (s) { return s.name !== 'Commanders' && s.name !== 'Mounts'; });
      var sec = R.pick(secs), lim = A.sectionLimits(sec, pts);
      if ((counts[sec.name] || 0) >= lim.max) continue;
      // battle line first if required
      var bl = f.sections.filter(function (s) { return s.name === 'Battle Line'; })[0];
      if ((counts['Battle Line'] || 0) < 1) sec = bl;
      var pool = sec.units.filter(function (u) { var minCost = u.per ? u.cost * u.size[0] : u.cost; return minCost <= budget; });
      if (!pool.length) { if (sec === bl) break; continue; }
      var def = R.pick(pool);
      var models = def.size[0];
      if (def.per) { var maxAff = Math.floor(budget / (def.cost + 1)); models = Math.min(def.size[1], Math.max(def.size[0], Math.min(maxAff, def.size[0] + Math.floor(R.rng() * (def.size[1] - def.size[0] + 1))))); }
      var e = A.defaultEntry(fid, def.id, models);
      if (def.weapons.length > 1 && R.rng() < 0.5) e.weapon = R.pick(def.weapons).name;
      var c = A.unitCost(fid, e);
      if (c > budget) continue;
      army.entries.push(e); counts[sec.name] = (counts[sec.name] || 0) + 1; budget -= c;
    }
    // spend leftovers on extra models
    army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(fid, t.id);
      if (!def.per) return;
      while (t.models < def.size[1] && budget >= def.cost + A.optionCost(def, t.weapon)) { t.models++; budget -= def.cost + A.optionCost(def, t.weapon); }
    });
    if (opts.boss) army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.vet = 2; if (e.kind === 'commander') e.vet = 2; });
    return army;
  };

  // Terrain generation: 4-8 pieces, none in deployment zones' front edge
  A.randomTerrain = function (opts) {
    opts = opts || {};
    var T = SOVL.TABLE, pieces = [], n = opts.count || (4 + Math.floor(R.rng() * 4)), kinds = ['forest', 'forest', 'forest', 'cliff', 'building', 'swamp', 'lake'];
    if (opts.kinds) kinds = opts.kinds;
    for (var tries = 0; tries < 200 && pieces.length < n; tries++) {
      var kind = R.pick(kinds), w = 5 + R.rng() * 7, h = 4 + R.rng() * 5;
      if (kind === 'building') { w = 3 + R.rng() * 3; h = 3 + R.rng() * 3; }
      if (kind === 'lake') { w = 6 + R.rng() * 6; h = 4 + R.rng() * 4; }
      var x = 2 + R.rng() * (T.w - w - 4), y = T.deployDepth - 1 + R.rng() * (T.h - 2 * T.deployDepth + 2 - h);
      var p = { kind: kind, x: x, y: y, w: w, h: h, seed: Math.floor(R.rng() * 1e6) }, ok = true;
      for (var i = 0; i < pieces.length; i++) { var q = pieces[i]; if (!(p.x + p.w + 2 < q.x || q.x + q.w + 2 < p.x || p.y + p.h + 2 < q.y || q.y + q.h + 2 < p.y)) ok = false; }
      // keep the centre lane mostly open
      if (kind !== 'forest' && kind !== 'swamp' && Math.abs(p.x + p.w / 2 - T.w / 2) < 8 && Math.abs(p.y + p.h / 2 - T.h / 2) < 6) ok = false;
      if (ok) pieces.push(p);
    }
    return pieces;
  };

  // Human-readable summary line for an entry
  A.entryLabel = function (factionId, e) {
    var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(factionId, t.id);
    var s = (def.per ? t.models + ' ' : '') + def.name;
    if (e.kind === 'commander') s = e.name + ' with ' + s;
    return s;
  };
  SOVL.Army = A;
})();
