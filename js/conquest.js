// The Broken March: rules for the territorial campaign (data in js/conquest-data.js).
// Provinces, armies and garrisons, income and upkeep, recruitment, movement, battles (fought by the
// player, or fought out by the AI on both sides when a commander is left to it), the other powers'
// turns, and the story. No DOM: the same rules run in the browser and in the tests.
'use strict';
(function () {
  var R = SOVL.R, A = SOVL.Army, D = SOVL.CONQUEST, K = {};
  var KEY = 'fantasy_battle_conquest', FID = D.faction;
  var PROV = {}; D.provinces.forEach(function (p) { PROV[p.id] = p; });
  K.prov = function (id) { return PROV[id]; };
  K.ids = D.provinces.map(function (p) { return p.id; });
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function has(p, f) { return PROV[p].features.indexOf(f) >= 0; }
  K.has = has;
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- geometry: provinces are the Voronoi cells of their hearts, with ragged borders ----------
  var geo = null;
  K.geometry = function () {
    if (geo) return geo;
    var W = D.map.w, H = D.map.h, sites = D.provinces, cells = {}, adj = {}, lens = {};
    sites.forEach(function (s, i) {
      var poly = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], labels = [-1, -1, -1, -1];
      sites.forEach(function (t, j) {
        if (i === j) return;
        var mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y;
        var f = function (p) { return (p.x - mx) * dx + (p.y - my) * dy; }, out = [], outL = [], n = poly.length;
        for (var k = 0; k < n; k++) {
          var P = poly[k], Q = poly[(k + 1) % n], L = labels[k], fp = f(P), fq = f(Q), I;
          if (fp <= 0) {
            out.push(P); outL.push(L);
            if (fq > 0) { I = { x: P.x + (Q.x - P.x) * fp / (fp - fq), y: P.y + (Q.y - P.y) * fp / (fp - fq) }; out.push(I); outL.push(j); }
          } else if (fq <= 0) { I = { x: P.x + (Q.x - P.x) * fp / (fp - fq), y: P.y + (Q.y - P.y) * fp / (fp - fq) }; out.push(I); outL.push(L); }
        }
        poly = out; labels = outL;
      });
      cells[s.id] = { pts: poly, labels: labels };
      adj[s.id] = [];
      poly.forEach(function (p, k) {
        var L = labels[k]; if (L < 0) return;
        var q = poly[(k + 1) % poly.length], len = Math.hypot(q.x - p.x, q.y - p.y), key = s.id + '|' + sites[L].id;
        lens[key] = (lens[key] || 0) + len;
      });
    });
    sites.forEach(function (s) { sites.forEach(function (t) { if (s !== t && (lens[s.id + '|' + t.id] || 0) > 40) adj[s.id].push(t.id); }); });
    // ragged borders: each shared edge is broken up the same way from both sides
    var edges = {};
    function ragged(a, b, seed) {
      var rnd = R.makeRng(seed), pts = [a, b];
      for (var lvl = 0; lvl < 4; lvl++) {
        var next = [pts[0]];
        for (var k = 0; k < pts.length - 1; k++) {
          var p = pts[k], q = pts[k + 1], len = Math.hypot(q.x - p.x, q.y - p.y), amp = len * (lvl === 0 ? 0.12 : 0.18) * (rnd() - 0.5);
          next.push({ x: (p.x + q.x) / 2 + (-(q.y - p.y) / (len || 1)) * amp, y: (p.y + q.y) / 2 + ((q.x - p.x) / (len || 1)) * amp }, q);
        }
        pts = next;
      }
      return pts;
    }
    sites.forEach(function (s, i) {
      var c = cells[s.id], path = [];
      c.pts.forEach(function (p, k) {
        var L = c.labels[k], q = c.pts[(k + 1) % c.pts.length];
        if (L < 0) { path.push(p); return; }
        var lo = Math.min(i, L), hi = Math.max(i, L), key = lo + '|' + hi;
        if (!edges[key]) edges[key] = i === lo ? ragged(p, q, hash(key)) : ragged(q, p, hash(key));
        var e = i === lo ? edges[key] : edges[key].slice().reverse();
        for (var m = 0; m < e.length - 1; m++) path.push(e[m]);
      });
      c.path = path;
    });
    geo = { cells: cells, adj: adj, w: W, h: H };
    return geo;
  };
  K.adj = function (id) { return K.geometry().adj[id]; };

  // ---------- armies ----------
  function nextRef(s) { s.refs++; return 'r' + s.refs; }
  function entry(s, faction, spec) { var e = A.defaultEntry(faction, spec[0], spec[1]); e.ref = nextRef(s); e.maxSeen = e.models; return e; }
  function commander(s, faction, cmdId, ret, name, items) {
    var rdef = SOVL.findUnitDef(faction, ret[0]), c = A.defaultCommander(faction, cmdId, ret[0], rdef.per ? ret[1] : 1, name);
    c.ref = nextRef(s); c.retinue.ref = nextRef(s); c.retinue.maxSeen = c.retinue.models;
    if (items) c.items = items.slice();
    return c;
  }
  function buildArmy(s, power, spec, extra) {
    var faction = D.powers[power].faction, cdef = SOVL.findUnitDef(faction, spec.cmd[0]);
    var name = extra && extra.lord ? D.lords[extra.lord].name : (spec.commander ? cdef.name + ' ' + spec.commander : null);
    if (spec.commander && /^(Sir|The|Skarbad)/.test(spec.commander)) name = spec.commander;
    var cmd = commander(s, faction, spec.cmd[0], [spec.cmd[1], spec.cmd[2]], name, spec.items);
    var army = { faction: faction, name: spec.name, entries: [cmd] };
    (spec.units || []).forEach(function (u) { army.entries.push(entry(s, faction, u)); });
    var a = { id: 'a' + (s.nextId++), power: power, name: spec.name, at: spec.at, moves: power === 'player' ? D.moves : 1, army: army, lord: (extra && extra.lord) || null, hero: !!(extra && extra.hero), rested: true };
    s.armies.push(a);
    return a;
  }
  K.army = function (s, id) { for (var i = 0; i < s.armies.length; i++) if (s.armies[i].id === id) return s.armies[i]; return null; };
  K.armiesOf = function (s, power) { return s.armies.filter(function (a) { return a.power === power; }); };
  K.armyAt = function (s, prov, power) { for (var i = 0; i < s.armies.length; i++) { var a = s.armies[i]; if (a.at === prov && (!power || a.power === power)) return a; } return null; };
  K.pts = function (army) { return army && army.entries.length ? A.armyCost(army) : 0; };
  K.commanderOf = function (a) { return a.army.entries[0] && a.army.entries[0].kind === 'commander' ? a.army.entries[0] : null; };
  K.leaderName = function (a) { var c = K.commanderOf(a); return a.lord ? D.lords[a.lord].name : c ? c.name : a.name; };
  K.unitDef = function (faction, e) { return SOVL.findUnitDef(faction, e.kind === 'commander' ? e.retinue.id : e.id); };

  // a levy: regiments without a commander, from the battle line and missile troops
  function levyUnits(s, faction, pts) {
    var f = SOVL.FACTION_DATA[faction], secs = f.sections.filter(function (x) { return x.name !== 'Commanders' && x.name !== 'Mounts'; });
    var bl = f.sections.filter(function (x) { return x.name === 'Battle Line'; })[0], out = [], budget = pts, guard = 0;
    function minCost(u) { return u.per ? u.cost * u.size[0] : u.cost; }
    while (budget >= 40 && guard++ < 20 && out.length < 5) {
      var sec = out.length === 0 || (out.length === 2 && R.rng() < 0.5) ? bl : R.pick(secs);
      var pool = sec.units.filter(function (u) { return minCost(u) <= budget && (pts >= 450 || !/Large Monster|Chariot|War Wagon/.test(u.type)) && !(u.per && u.size[0] === 1 && u.cost >= 90); });
      if (!pool.length) { if (sec === bl) break; continue; }
      var d = R.pick(pool), models = 1;
      if (d.per && d.size[1] > 1) models = Math.max(d.size[0], Math.min(d.size[1], Math.floor(budget * (out.length ? 0.7 : 0.55) / (d.cost + A.optionCost(d, d.weapons[0].name)))));
      var e = entry(s, faction, [d.id, models]), c = A.unitCost(faction, e);
      while (c > budget && e.models > d.size[0]) { e.models--; c = A.unitCost(faction, e); }
      if (c > budget) { if (sec === bl) break; continue; }
      e.maxSeen = e.models; out.push(e); budget -= c;
    }
    return out;
  }
  function garrison(s, prov, faction, pts, name) { return { faction: faction, name: name || PROV[prov].holder || 'The garrison of ' + PROV[prov].name, entries: levyUnits(s, faction, pts) }; }
  K.levyBase = function (s, prov) {
    var p = s.provinces[prov], base = [];
    if (has(prov, 'capital')) base = base.concat(D.levies.capital); else if (has(prov, 'town')) base = base.concat(D.levies.town); else base = base.concat(D.levies.village);
    if (has(prov, 'fortress')) base = base.concat(D.levies.fortress);
    for (var i = 0; i < (p.fortified || 0); i++) base.push(D.fortifyUnits[i % D.fortifyUnits.length]);
    return base;
  };
  function playerLevy(s, prov, full) {
    var g = { faction: FID, name: 'The levy of ' + PROV[prov].name, entries: [] };
    K.levyBase(s, prov).forEach(function (u, i) { if (full || i < 2) { var e = entry(s, FID, u); if (!full) e.models = Math.max(SOVL.findUnitDef(FID, u[0]).size[0], Math.ceil(u[1] * 0.6)); g.entries.push(e); } });
    return g;
  }

  function scaleArmy(army, f) {
    if (f === 1) return;
    army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(army.faction, t.id); if (d && d.per && d.size[1] > 1) { t.models = Math.max(d.size[0], Math.min(d.size[1], Math.round(t.models * f))); t.maxSeen = t.models; } });
  }
  // ---------- a new campaign ----------
  K.difficulty = function (s) { return D.difficulties.filter(function (d) { return d.id === s.difficulty; })[0] || D.difficulties[1]; };
  K.create = function (opts) {
    opts = opts || {};
    var diff = D.difficulties.filter(function (d) { return d.id === opts.difficulty; })[0] || D.difficulties[1];
    var s = { version: 1, difficulty: diff.id, turn: 1, gold: diff.gold, phase: 'player', provinces: {}, armies: [], nextId: 1, refs: 100, battleNo: 1, log: [], flags: {}, stances: {}, quests: {}, fired: [], fates: {}, fallen: [], fallQueue: [],
      lords: { ottokar: 'active', gorrak: 'active', vorhal: 'dormant' }, treasury: { rebels: 0, greenskins: 0, dead: 0 }, unlocks: {}, queue: [], reports: [], pending: null, visit: null, pendingTraits: [], over: false, result: null,
      stats: { battles: 0, won: 0, lost: 0, led: 0, taken: 0, lostProv: 0, kills: 0 }, seed: Math.floor(R.rng() * 1e9) };
    D.provinces.forEach(function (p) {
      var st = s.provinces[p.id] = { owner: p.owner, fortified: 0, garrison: null };
      if (p.owner === 'player') st.garrison = playerLevy(s, p.id, true);
      else if (p.garrison) st.garrison = garrison(s, p.id, p.garrison[0], Math.round(p.garrison[1] * (p.owner === 'neutral' ? 1 : diff.strength)));
    });
    var h = D.hero, hero = buildArmy(s, 'player', { name: h.army, at: 'harrowgate', cmd: [h.commander, h.retinue[0], h.retinue[1]], commander: h.name, units: h.units }, { hero: true });
    hero.army.entries[0].name = 'Captain ' + h.name;
    Object.keys(D.lords).forEach(function (id) { var L = D.lords[id]; buildArmy(s, L.power, L.army, { lord: id }); });
    D.armies.forEach(function (spec) { buildArmy(s, spec.power, spec); });
    // the other powers' armies, stronger or weaker with the difficulty
    s.armies.forEach(function (a) { if (a.power !== 'player') scaleArmy(a.army, diff.strength); });
    s.log.push('The Margrave\'s seal reaches Harrowgate. ' + h.name + ' of the Border Guard is Warden of the March.');
    return s;
  };

  // ---------- what you hold ----------
  K.owned = function (s, power) { return K.ids.filter(function (id) { return s.provinces[id].owner === power; }); };
  K.regionsHeld = function (s, power) {
    return Object.keys(D.regions).filter(function (r) { return D.provinces.every(function (p) { return p.region !== r || s.provinces[p.id].owner === power; }); });
  };
  K.holds = function (s, feature) { return K.owned(s, 'player').some(function (id) { return has(id, feature); }); };
  K.unlocks = function (s) {
    return { horse: K.holds(s, 'horse'), forge: K.holds(s, 'forge') || !!s.unlocks.forge, armoury: K.holds(s, 'armoury'), shrine: K.holds(s, 'shrine'), market: K.holds(s, 'market') };
  };
  K.upkeep = function (a) { return Math.round(K.pts(a.army) / 40); };
  K.income = function (s) {
    var lines = [], total = 0;
    K.owned(s, 'player').forEach(function (id) { total += PROV[id].income; });
    total = Math.round(total * (K.difficulty(s).income || 1));
    lines.push({ label: K.owned(s, 'player').length + ' provinces', gold: total });
    K.regionsHeld(s, 'player').forEach(function (r) { lines.push({ label: D.regions[r].name + ' held', gold: D.regions[r].gold }); total += D.regions[r].gold; });
    if (s.stances.greenskins && s.stances.greenskins.kind === 'tribute' && s.lords.gorrak !== 'gone') { lines.push({ label: 'Gorrak\'s tribute', gold: 40 }); total += 40; }
    var up = 0; K.armiesOf(s, 'player').forEach(function (a) { up += K.upkeep(a); });
    lines.push({ label: 'Upkeep of ' + K.armiesOf(s, 'player').length + ' arm' + (K.armiesOf(s, 'player').length === 1 ? 'y' : 'ies'), gold: -up });
    return { lines: lines, income: total, upkeep: up, net: total - up };
  };
  K.season = function (s) { var t = Math.min(D.maxTurns, s.turn); return D.seasons[Math.min(3, Math.floor((t - 1) / 6))]; };

  // ---------- recruiting ----------
  var BASE = ['imperial_sword', 'imperial_halberd', 'imperial_spear', 'imperial_archers', 'imperial_crossbowmen'];
  K.canRecruit = function (s, prov) { return s.provinces[prov].owner === 'player' && (has(prov, 'town') || has(prov, 'capital')); };
  K.recruitPool = function (s, prov) {
    if (!K.canRecruit(s, prov)) return [];
    var ids = BASE.slice(), u = K.unlocks(s);
    if (has(prov, 'capital')) ids.push('imperial_handguns', 'imperial_light_cavalry');
    if (u.horse) ids.push('imperial_light_cavalry', 'imperial_knights');
    if (u.armoury) ids.push('foot_knights', 'imperial_knights');
    if (u.forge) ids.push('imperial_cannon', 'imperial_mortar', 'imperial_dreadnought');
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  };
  function discount(s) { return K.regionsHeld(s, 'player').indexOf('march') >= 0 ? D.regions.march.recruit : 1; }
  K.recruitOffers = function (s, armyId) {
    var a = K.army(s, armyId); if (!a) return [];
    return K.recruitPool(s, a.at).map(function (id) {
      var def = SOVL.findUnitDef(FID, id), size = !def.per || def.size[1] === 1 ? 1 : /Cavalry/.test(def.type) ? def.size[0] : Math.round((def.size[0] + def.size[1]) / 2);
      var e = A.defaultEntry(FID, id, size), sec = SOVL.findSection(FID, id);
      return { id: id, entry: e, section: sec.name, price: Math.round((A.unitCost(FID, e) * 1.1 + 10) * discount(s)), why: K.recruitBlock(s, a, id) };
    });
  };
  K.recruitBlock = function (s, a, id) {
    if (a.army.entries.length >= D.armyCap) return 'An army can field at most ' + D.armyCap + ' units.';
    var sec = SOVL.findSection(FID, id), lim = A.sectionLimits(sec, 1500).max + 1;
    var n = a.army.entries.filter(function (e) { var x = SOVL.findSection(FID, e.id); return x && x.name === sec.name; }).length;
    if (n >= lim) return 'This army already has as many ' + sec.name + ' units as it can support.';
    return null;
  };
  K.recruit = function (s, armyId, unitId) {
    var a = K.army(s, armyId), offer = K.recruitOffers(s, armyId).filter(function (o) { return o.id === unitId; })[0];
    if (!a || !offer) return 'Not available here.';
    if (offer.why) return offer.why;
    if (s.gold < offer.price) return 'Not enough gold.';
    var e = clone(offer.entry); e.ref = nextRef(s); e.maxSeen = e.models; a.army.entries.push(e); s.gold -= offer.price;
    s.log.push(K.leaderName(a) + ' recruits ' + (e.models > 1 ? e.models + ' ' : 'a ') + SOVL.findUnitDef(FID, unitId).name + ' at ' + PROV[a.at].name + '.');
    return null;
  };
  // refilling a regiment's ranks, a few men at a time, in a town you hold
  K.refillCost = function (s, a, e) {
    var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(FID, t.id);
    if (!def.per || def.size[1] === 1 || t.models >= def.size[1] || !K.canRecruit(s, a.at)) return null;
    var n = Math.min(def.size[1] - t.models, Math.max(2, Math.ceil(def.size[0] / 2)));
    return { n: n, price: Math.max(5, Math.round(n * (def.cost + A.optionCost(def, t.weapon)) * 1.25 * discount(s))) };
  };
  K.refill = function (s, armyId, ref) {
    var a = K.army(s, armyId); if (!a) return 'No army.';
    var e = a.army.entries.filter(function (x) { return x.ref === ref || (x.retinue && x.retinue.ref === ref); })[0]; if (!e) return 'No such unit.';
    var c = K.refillCost(s, a, e); if (!c) return 'Cannot reinforce it here.';
    if (s.gold < c.price) return 'Not enough gold.';
    var t = e.kind === 'commander' ? e.retinue : e; t.models += c.n; t.maxSeen = Math.max(t.maxSeen || 0, t.models); s.gold -= c.price;
    return null;
  };
  K.dismiss = function (s, armyId, ref) {
    var a = K.army(s, armyId); if (!a) return 'No army.';
    var i = -1; a.army.entries.forEach(function (x, k) { if (x.ref === ref && x.kind !== 'commander') i = k; });
    if (i < 0) return 'Cannot dismiss that unit.';
    a.army.entries.splice(i, 1); return null;
  };
  // relics and banners from the market at Ambergate, sold in any of your towns
  K.marketOffers = function (s, armyId) {
    var a = K.army(s, armyId); if (!a || !K.unlocks(s).market || !K.canRecruit(s, a.at)) return [];
    var cmd = K.commanderOf(a), cdef = SOVL.findUnitDef(FID, cmd.id), out = [];
    SOVL.MAGIC_ITEMS.forEach(function (it) { if (cdef.magic && (it.kind !== 'weapon' || cdef.magic === 'weapon_item') && (it.id !== 'staff_of_power' || cdef.caster) && cmd.items.indexOf(it.id) < 0) out.push({ kind: 'item', id: it.id, name: it.name, desc: it.desc, price: it.cost * 2 + 20 }); });
    SOVL.BANNERS.forEach(function (bn) { if (a.army.entries.some(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(FID, t.id); return d.banner && d.banner >= bn.cost && !t.banner; })) out.push({ kind: 'banner', id: bn.id, name: bn.name, desc: bn.desc, price: bn.cost * 2 + 10 }); });
    return out;
  };
  K.buyMarket = function (s, armyId, kind, id) {
    var a = K.army(s, armyId), o = K.marketOffers(s, armyId).filter(function (x) { return x.kind === kind && x.id === id; })[0];
    if (!o) return 'Not for sale here.';
    if (s.gold < o.price) return 'Not enough gold.';
    var cmd = K.commanderOf(a);
    if (kind === 'item') { var it = SOVL.itemById(id); cmd.items = cmd.items.filter(function (x) { var y = SOVL.itemById(x); return !y || y.kind !== it.kind; }); cmd.items.push(id); }
    else { var bn = SOVL.bannerById(id), done = false; a.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(FID, t.id); if (!done && d.banner && d.banner >= bn.cost && !t.banner) { t.banner = id; done = true; } }); }
    s.gold -= o.price; return null;
  };
  // a new army, led by a commander hired in a town you hold
  K.armyLimit = function (s) { return D.maxArmies + (s.fates.ottokar === 'pardoned' ? 1 : 0); };
  K.hireBlock = function (s, prov) {
    if (!K.canRecruit(s, prov)) return 'Armies are raised in towns you hold.';
    if (K.armyAt(s, prov, 'player')) return 'An army is already quartered here.';
    if (K.armiesOf(s, 'player').length >= K.armyLimit(s)) return 'The March can pay for at most ' + K.armyLimit(s) + ' armies.';
    return null;
  };
  K.hireNames = function (s) {
    var used = s.armies.map(function (a) { return K.leaderName(a); }).join(' ');
    return SOVL.COMMANDER_NAMES[FID].filter(function (n) { return n !== D.hero.name && n !== 'Ottokar' && used.indexOf(n) < 0; });
  };
  K.hire = function (s, prov, hireId, name) {
    var h = D.hires.filter(function (x) { return x.id === hireId; })[0], why = K.hireBlock(s, prov);
    if (!h) return 'No such commander.'; if (why) return why;
    if (s.gold < h.price) return 'Not enough gold.';
    name = name || K.hireNames(s)[0] || 'Konrad';
    var cdef = SOVL.findUnitDef(FID, h.id), a = buildArmy(s, 'player', { name: name + '\'s Company', at: prov, cmd: [h.id, h.retinue[0], h.retinue[1]], commander: name });
    a.army.entries[0].name = cdef.name + ' ' + name; a.moves = 0;
    s.gold -= h.price; s.log.push(cdef.name + ' ' + name + ' raises a company at ' + PROV[prov].name + '.');
    return null;
  };
  // strengthen the levy of a province you hold
  K.fortifyBlock = function (s, prov) {
    var p = s.provinces[prov]; if (p.owner !== 'player') return 'Not yours.';
    if ((p.fortified || 0) >= 2) return 'The levy here is as strong as the province can support.';
    if (s.gold < D.fortifyPrice) return 'Not enough gold.';
    return null;
  };
  K.fortify = function (s, prov) {
    var why = K.fortifyBlock(s, prov); if (why) return why;
    var p = s.provinces[prov], u = D.fortifyUnits[(p.fortified || 0) % D.fortifyUnits.length];
    p.fortified = (p.fortified || 0) + 1; s.gold -= D.fortifyPrice;
    if (!p.garrison) p.garrison = { faction: FID, name: 'The levy of ' + PROV[prov].name, entries: [] };
    p.garrison.entries.push(entry(s, FID, u));
    s.log.push('The levy of ' + PROV[prov].name + ' is strengthened.');
    return null;
  };

  // ---------- movement ----------
  function hostile(s, power, other) {
    if (power === other) return false;
    if (power === 'player') return true;
    var st = s.stances[power];
    if (other === 'player' && st && (st.kind === 'truce' || st.kind === 'unleashed' || st.kind === 'tribute')) return false;
    if (other === 'player' && s.turn < D.grace) return false;
    if (other === 'dead' && !s.flags.deadAwake) return false; // nothing living goes into the Waste while its king sleeps
    return D.powers[power].targets.indexOf(other) >= 0;
  }
  // where an army can go this turn: through your own provinces (1 move each), and one step into
  // anyone else's (an attack, or a visit to a power you can talk to)
  K.reach = function (s, armyId) {
    var a = K.army(s, armyId), out = {}; if (!a || s.phase !== 'player') return out;
    var dist = {}; dist[a.at] = 0; var queue = [a.at];
    while (queue.length) {
      var cur = queue.shift();
      K.adj(cur).forEach(function (n) {
        var owner = s.provinces[n].owner;
        if (owner === 'player') {
          if (dist[n] == null && dist[cur] + 1 <= a.moves) { dist[n] = dist[cur] + 1; queue.push(n); var other = K.armyAt(s, n, 'player'); if (!other) out[n] = { kind: 'move', cost: dist[n], from: cur }; }
        } else if (dist[cur] < a.moves && !out[n]) {
          var stagingFree = cur === a.at || !K.armyAt(s, cur, 'player');
          if (stagingFree) out[n] = { kind: PROV[n].special && !s.flags['hostile_' + n] ? 'visit' : 'attack', cost: dist[cur] + 1, from: cur };
        }
      });
    }
    return out;
  };
  K.move = function (s, armyId, to) {
    var a = K.army(s, armyId), r = K.reach(s, armyId)[to];
    if (!a || !r || r.kind !== 'move') return 'Cannot march there.';
    a.at = to; a.moves -= r.cost; a.rested = false;
    return null;
  };
  // the battle an army would fight by marching into a province (nothing changes until it is fought)
  K.attackSpec = function (s, armyId, to) {
    var a = K.army(s, armyId), r = K.reach(s, armyId)[to];
    if (!a || !r || r.kind === 'move') return null;
    return K.spec(s, a, to, r.from);
  };
  K.spec = function (s, a, to, from) {
    var owner = s.provinces[to].owner, def = owner === a.power ? null : K.armyAt(s, to, owner);
    var fort = has(to, 'fortress'), scenario = fort ? 'objectives' : def && R.rng() < 0.3 ? 'meeting' : 'pitched';
    return { no: s.battleNo++, province: to, from: from, attacker: { power: a.power, army: a.id }, defender: { power: s.provinces[to].owner, army: def ? def.id : null }, scenario: scenario, seed: Math.floor(R.rng() * 1e9) };
  };
  // the two forces in a battle
  // a defending army fights beside the province's garrison (up to ten units in all)
  K.force = function (s, spec, side) {
    var who = spec[side], g = side === 'defender' ? s.provinces[spec.province].garrison : null;
    if (who.army) {
      var a = K.army(s, who.army); if (!a) return null;
      var f = { army: a.army, name: K.leaderName(a), power: a.power, lord: a.lord, armyId: a.id };
      var extra = g && g.faction === a.army.faction ? g.entries.slice(0, Math.max(0, 10 - a.army.entries.length)) : [];
      if (extra.length) { f.army = { faction: a.army.faction, name: a.army.name, entries: a.army.entries.concat(extra) }; f.parts = { army: a.army, garrison: g, mine: a.army.entries.slice(), extra: extra }; f.withLevy = g.name; }
      return f;
    }
    return g && g.entries.length ? { army: g, name: g.name, power: who.power, garrison: spec.province } : null;
  };
  // after the battle, each regiment goes back to the army or the garrison it came from
  function splitBack(f) {
    if (!f || !f.parts) return;
    var kept = f.army.entries, P = f.parts;
    P.army.entries = kept.filter(function (e) { return P.mine.indexOf(e) >= 0; });
    P.garrison.entries = kept.filter(function (e) { return P.extra.indexOf(e) >= 0; }).concat(P.garrison.entries.filter(function (e) { return P.extra.indexOf(e) < 0; }));
  }
  K.involvesPlayer = function (spec) { return spec.attacker.power === 'player' || spec.defender.power === 'player'; };
  // the armies, names and battlefield for SOVL.Battle; the player (if any) is side 0
  K.battleSetup = function (s, spec) {
    var att = K.force(s, spec, 'attacker'), def = K.force(s, spec, 'defender');
    var flip = spec.defender.power === 'player', sides = flip ? [def, att] : [att, def], roles = flip ? ['defender', 'attacker'] : ['attacker', 'defender'];
    var p = PROV[spec.province], field = { id: p.biome, seed: spec.seed };
    var aggr = sides.map(function (f) { return f.lord ? D.lords[f.lord].battleAggression : f.power === 'greenskins' ? 0.7 : 0.5; });
    return { armies: sides.map(function (f) { var c = clone(f.army); c.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.maxSeen = Math.max(t.maxSeen || 0, t.models); }); return c; }),
      names: sides.map(function (f) { return f.name; }), roles: roles, terrain: SOVL.Biomes.terrain(field, spec.scenario), biome: p.biome, fieldName: p.name, scenario: spec.scenario, aggression: aggr };
  };
  // fight a battle out with the AI commanding both sides
  K.autoresolve = function (s, spec) {
    var st = K.battleSetup(s, spec);
    var b = new SOVL.Battle({ armies: st.armies, terrain: st.terrain, scenario: st.scenario, names: st.names, scoreMode: 'ratio' });
    b.biome = st.biome; b.fieldName = st.fieldName;
    b.autoDeploy(0); b.autoDeploy(1);
    var ais = [new SOVL.AI(b, 0, { aggression: st.aggression[0] }), new SOVL.AI(b, 1, { aggression: st.aggression[1] })], steps = 0;
    b.start();
    while (b.phase !== 'end' && steps++ < 6000) { if (!ais[b.active].step()) break; }
    if (b.phase !== 'end' || !b.result) b.result = { why: 'turns', winner: null, turn: b.turn, score: [0, 0], pct: [0, 0] };
    return b;
  };

  // ---------- after a battle ----------
  var VET = SOVL.CAMPAIGN.veteran;
  function applyLosses(s, force, battle, side, won, lines) {
    var refs = {}, faction = force.army.faction, isPlayer = force.power === 'player', fallen = false;
    battle.units.concat(battle.dead).forEach(function (u) { if (u.side === side && u.campaignRef) refs[u.campaignRef] = u; });
    var keep = [];
    force.army.entries.forEach(function (e) {
      var isCmd = e.kind === 'commander', t = isCmd ? e.retinue : e, u = refs[t.ref], def = SOVL.findUnitDef(faction, t.id);
      if (!u) { keep.push(e); return; }
      if (isCmd && u.commander && !u.commander.alive) fallen = true;
      var lost = u.maxModels - Math.max(0, u.models), back = Math.floor(lost * (won ? 0.5 : 0.3)), surv = Math.max(0, u.models) + back;
      if (u.removed && u.removedHow !== 'fled') surv = isCmd ? Math.max(1, back) : 0;
      if (u.removed && u.removedHow === 'fled') surv = Math.max(surv, Math.floor(u.maxModels / 2));
      t.kills = (t.kills || 0) + (u.kills || 0);
      if (def.per && def.size[1] > 1) {
        if (!isCmd && surv < Math.max(1, Math.floor(def.size[0] / 2))) { if (isPlayer) lines.push(def.name + ' of ' + force.name + ' are wiped out.'); return; }
        t.models = Math.max(1, Math.min(def.size[1], surv));
      } else if (u.removed && !isCmd) { if (isPlayer) lines.push(def.name + ' of ' + force.name + ' is destroyed.'); return; }
      t.battles = (t.battles || 0) + 1;
      var nv = 0; VET.forEach(function (v, i) { if (t.battles >= v.at) nv = i + 1; });
      if (nv > (t.vet || 0)) { t.vet = nv; if (isPlayer) lines.push(def.name + ' of ' + force.name + ' are now ' + VET[nv - 1].name + '.'); }
      if (isCmd) {
        e.battles = (e.battles || 0) + 1; var cv = 0; VET.forEach(function (v, i) { if (e.battles >= v.at) cv = i + 1; });
        if (cv > (e.vet || 0)) { e.vet = cv; if (isPlayer && force.armyId) { s.pendingTraits.push(force.armyId); lines.push(e.name + ' is now ' + VET[cv - 1].name + ' and may learn a trait.'); } }
      }
      keep.push(e);
    });
    force.army.entries = keep;
    return fallen;
  }
  function retreatFrom(s, a, prov) {
    var opts = K.adj(prov).filter(function (n) { return s.provinces[n].owner === a.power && !K.armyAt(s, n, a.power); });
    if (opts.length) { a.at = opts.sort(function (x, y) { return PROV[y].income - PROV[x].income; })[0]; return true; }
    return false;
  }
  function removeArmy(s, a) { s.armies = s.armies.filter(function (x) { return x !== a; }); }
  // an army with nowhere left to go: the hero and the lords always get away
  function scatter(s, a, lines) {
    var cmd = K.commanderOf(a);
    if (a.hero) {
      var home = ['harrowgate'].concat(K.owned(s, 'player')).filter(function (id) { return s.provinces[id].owner === 'player' && !K.armyAt(s, id, 'player'); })[0] || 'harrowgate';
      a.army.entries = cmd ? [cmd] : a.army.entries.slice(0, 1); a.at = home; a.moves = 0;
      lines.push(D.hero.name + ' escapes to ' + PROV[home].name + ' with the remnants of his guard.');
      return;
    }
    if (a.lord) {
      var L = D.lords[a.lord], seat = D.powers[a.power].seat;
      if (s.provinces[seat].owner === a.power) {
        var there = K.armyAt(s, seat, a.power);
        if (there && there !== a) { if (cmd) there.army.entries.unshift(cmd); there.lord = a.lord; there.name = L.army.name; removeArmy(s, a); }
        else { a.army.entries = cmd ? [cmd] : []; a.at = seat; }
        lines.push(L.escape);
        return;
      }
    }
    lines.push(a.name + ' is scattered.');
    removeArmy(s, a);
  }
  function capture(s, prov, power, lines) {
    var p = s.provinces[prov], was = p.owner;
    p.owner = power; p.fortified = 0;
    if (power === 'player') { p.garrison = playerLevy(s, prov, false); s.stats.taken++; }
    else { p.garrison = garrison(s, prov, D.powers[power].faction, 120, null); p.garrison.name = 'The garrison of ' + PROV[prov].name; if (was === 'player') s.stats.lostProv++; }
    // a lord's seat falls with its lord: taken by you, you decide the lord's fate; taken by
    // another power, the lord dies and his lands fall into disorder
    if (PROV[prov].features.indexOf('seat') >= 0 && was !== power && D.powers[was] && D.powers[was].seat === prov && s.fallen.indexOf(was) < 0) {
      var lordId = D.powers[was].lord;
      s.fallen.push(was); s.lords[lordId] = 'fallen';
      K.armiesOf(s, was).forEach(function (a) { a.lord = null; });
      if (power === 'player') s.fallQueue.push(was);
      else { s.fates[lordId] = 'overthrown'; lines.push(D.lords[lordId].name + ' dies in the ruins of ' + PROV[prov].name + '.'); releasePower(s, was, lines); }
    }
    if (prov === 'harrowgate' && power !== 'player') { s.over = true; s.result = 'lost'; }
  }
  function releasePower(s, pw, lines) {
    K.armiesOf(s, pw).forEach(function (a) { removeArmy(s, a); });
    K.owned(s, pw).forEach(function (id) {
      var p = s.provinces[id]; p.owner = 'neutral';
      if (p.garrison) { p.garrison.name = 'Leaderless ' + (pw === 'dead' ? 'dead' : pw === 'greenskins' ? 'greenskins' : 'rebels'); p.garrison.entries = p.garrison.entries.filter(function (e, i) { return i % 2 === 0; }); }
    });
    s.lords[D.powers[pw].lord] = 'gone';
    lines.push(D.powers[pw].name + ' are broken. Their lands fall into disorder.');
  }
  // apply a finished battle to the campaign; returns a report for the screen
  K.resolve = function (s, spec, battle, how) {
    var att = K.force(s, spec, 'attacker'), def = K.force(s, spec, 'defender'), lines = [];
    var flip = spec.defender.power === 'player', attSide = flip ? 1 : 0, defSide = flip ? 0 : 1;
    var w = battle.result ? battle.result.winner : null, winner = w == null ? null : w === attSide ? 'attacker' : 'defender';
    var report = { spec: spec, winner: winner, how: how || 'auto', province: spec.province, att: att && { name: att.name, power: att.power }, def: def && { name: def.name, power: def.power }, lines: lines, turn: battle.result && battle.result.turn, pct: battle.result && battle.result.pct };
    var before = [att, def].map(function (f) { return f ? f.army.entries.map(function (e) { var t = e.kind === 'commander' ? e.retinue : e; return { ref: t.ref, models: t.models }; }) : []; });
    var attFell = att ? applyLosses(s, att, battle, attSide, winner === 'attacker', lines) : false;
    var defFell = def ? applyLosses(s, def, battle, defSide, winner === 'defender', lines) : false;
    splitBack(att); splitBack(def);
    report.losses = [att, def].map(function (f, i) {
      if (!f) return [];
      return before[i].map(function (b) { var now = null; f.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; if (t.ref === b.ref) now = t.models; }); return { ref: b.ref, before: b.models, after: now }; });
    });
    s.stats.battles++;
    if (K.involvesPlayer(spec)) {
      var playerWon = (winner === 'attacker' && spec.attacker.power === 'player') || (winner === 'defender' && spec.defender.power === 'player');
      if (playerWon) s.stats.won++; else if (winner) s.stats.lost++;
      if (how === 'led') s.stats.led++;
      report.playerWon = playerWon; report.draw = !winner;
      var ps = spec.attacker.power === 'player' ? attSide : defSide;
      battle.units.concat(battle.dead).forEach(function (u) { if (u.side !== ps && u.killed) s.stats.kills += u.killed; });
    }
    [[att, attFell], [def, defFell]].forEach(function (pair) { var f = pair[0]; if (f && pair[1] && f.lord) lines.push(D.lords[f.lord].name + ' is struck down in the fighting.'); });
    var attArmy = spec.attacker.army && K.army(s, spec.attacker.army), defArmy = spec.defender.army && K.army(s, spec.defender.army);
    var where = PROV[spec.province].name;
    if (winner === 'attacker') {
      capture(s, spec.province, spec.attacker.power, lines);
      if (defArmy) { if (!retreatFrom(s, defArmy, spec.province)) scatter(s, defArmy, lines); else lines.push(defArmy.name + ' falls back to ' + PROV[defArmy.at].name + '.'); }
      if (attArmy && attArmy.army.entries.length) { attArmy.at = spec.province; attArmy.moves = 0; }
      lines.unshift(report.att.name + ' takes ' + where + '.');
      if (spec.onWin) K.applyEffect(s, spec.onWin, lines);
    } else {
      lines.unshift(winner === 'defender' ? report.att.name + ' is thrown back from ' + where + '.' : 'Neither side gives way at ' + where + '. ' + report.att.name + ' falls back.');
      if (attArmy) { attArmy.at = spec.from || attArmy.at; attArmy.moves = 0; }
    }
    // armies with nothing left
    [attArmy, defArmy].forEach(function (a) { if (a && K.army(s, a.id) && !a.army.entries.length) scatter(s, a, lines); });
    if (def && def.garrison && !def.army.entries.length && winner !== 'attacker') { /* the garrison held, at a cost */ }
    if (attArmy) attArmy.fought = true; if (defArmy) defArmy.fought = true;
    s.log.push(lines[0]);
    K.checkEnd(s);
    return report;
  };
  // a march into an empty province is not a battle
  K.unopposed = function (s, spec) { return !K.force(s, spec, 'defender'); };
  K.occupy = function (s, spec) {
    var a = K.army(s, spec.attacker.army), lines = [];
    if (a) { a.at = spec.province; a.moves = 0; a.rested = false; }
    capture(s, spec.province, spec.attacker.power, lines);
    var msg = (a ? K.leaderName(a) : D.powers[spec.attacker.power].name) + ' marches into ' + PROV[spec.province].name + ' unopposed.';
    s.log.push(msg); K.checkEnd(s);
    return { spec: spec, winner: 'attacker', unopposed: true, lines: [msg].concat(lines), att: { name: a ? K.leaderName(a) : '', power: spec.attacker.power }, def: null, playerWon: spec.attacker.power === 'player' };
  };

  // ---------- the end ----------
  K.checkEnd = function (s) {
    if (s.over) return s.result;
    if (s.provinces.harrowgate.owner !== 'player') { s.over = true; s.result = 'lost'; }
    else if (['rebels', 'greenskins', 'dead'].every(function (p) { return s.fallen.indexOf(p) >= 0; })) { s.over = true; s.result = 'victory'; }
    else if (s.turn > D.maxTurns) { s.over = true; s.result = s.fallen.length >= 2 || K.owned(s, 'player').length >= 14 ? 'partial' : 'lost'; s.timeUp = true; }
    return s.over ? s.result : null;
  };

  // ---------- the other powers ----------
  function active(s, power) {
    if (power === 'player' || power === 'neutral') return false;
    if (s.fallen.indexOf(power) >= 0 && !(s.stances[power] && (s.stances[power].kind === 'unleashed' || s.stances[power].kind === 'tribute'))) return false;
    if (power === 'dead' && !s.flags.deadAwake) return false;
    return true;
  }
  function stance(s, power) { var st = s.stances[power]; return st && st.until >= s.turn ? st.kind : null; }
  K.defenderPts = function (s, prov, vsPower) {
    var owner = s.provinces[prov].owner, a = K.armyAt(s, prov, owner), pts = (a ? K.pts(a.army) : 0) + (s.provinces[prov].garrison ? K.pts(s.provinces[prov].garrison) : 0);
    return pts * (has(prov, 'fortress') ? 1.3 : 1);
  };
  // each power's orders for the turn, decided at its start
  K.planEnemy = function (s) {
    var orders = [];
    ['dead', 'greenskins', 'rebels'].forEach(function (power) {
      if (!active(s, power)) return;
      var pw = D.powers[power], st = stance(s, power), aggr = st === 'enraged' ? 0.95 : Math.min(1, pw.aggression * (K.difficulty(s).aggression || 1)), maxAtk = pw.attacks + (st === 'enraged' ? 1 : 0) + (power === 'dead' && s.turn >= 12 ? 1 : 0), n = 0;
      var claimed = {};
      // a lord's own army keeps to his home region until the story lets it loose
      var roams = st === 'enraged' || st === 'unleashed' || (pw.roamFrom && s.turn >= pw.roamFrom) || (pw.roamAfterWaking && s.flags.deadAwake && s.turn >= s.flags.deadAwake + pw.roamAfterWaking);
      K.armiesOf(s, power).sort(function (x, y) { return K.pts(y.army) - K.pts(x.army); }).forEach(function (a) {
        var my = K.pts(a.army), best = null, leashed = a.lord && !roams;
        if (my < 120) return; // too weak to do anything but recover
        // a lord goes home to defend his seat
        var seat = pw.seat;
        if (a.lord && a.at !== seat && s.provinces[seat].owner === power && !K.armyAt(s, seat, power) && K.adj(seat).some(function (n2) { return K.armyAt(s, n2, 'player'); })) {
          var path = stepToward(s, a, seat); if (path) { orders.push({ army: a.id, to: path, kind: 'move' }); return; }
        }
        if (n < maxAtk) K.adj(a.at).forEach(function (id) {
          var owner = s.provinces[id].owner;
          if (claimed[id] || PROV[id].special || has(id, 'seat') || owner === power || !hostile(s, power, owner)) return; // only the Warden takes a lord's seat
          if (leashed && PROV[id].region !== pw.home) return;
          if (st === 'truce' && owner === 'player') return;
          var dp = Math.max(40, K.defenderPts(s, id, power)), ratio = my / dp, playerArmy = K.armyAt(s, id, 'player');
          if (ratio < (playerArmy ? 1.15 : id === 'harrowgate' ? 1.5 : 1.25)) return;
          var score = Math.min(ratio, 3) + PROV[id].income / 20 + (owner === 'player' ? 0.6 + (st === 'enraged' ? 2 : 0) + (id === 'harrowgate' ? 1 : 0) : 0) + (st === 'unleashed' && owner === 'dead' ? 3 : 0);
          if (!best || score > best.score) best = { id: id, score: score };
        });
        // the rebel lord keeps to his walls unless provoked
        if (best && a.lord === 'ottokar' && st !== 'enraged' && s.provinces[best.id].owner !== 'player' && R.rng() < 0.6) best = null;
        if (best && R.rng() < aggr) { orders.push({ army: a.id, to: best.id, kind: 'attack' }); claimed[best.id] = true; n++; return; }
        // otherwise march towards the nearest enemy, through its own lands
        if (!leashed && (!a.lord || power !== 'rebels')) {
          var frontier = K.adj(a.at).some(function (id) { return hostile(s, power, s.provinces[id].owner) && !PROV[id].special; });
          if (!frontier) { var step = stepToFrontier(s, a); if (step) orders.push({ army: a.id, to: step, kind: 'move' }); }
        }
      });
    });
    return orders;
  };
  function stepToward(s, a, goal) {
    var prev = {}, q = [a.at]; prev[a.at] = null;
    while (q.length) { var c = q.shift(); if (c === goal) break; K.adj(c).forEach(function (n) { if (prev[n] === undefined && s.provinces[n].owner === a.power) { prev[n] = c; q.push(n); } }); }
    if (prev[goal] === undefined) return null;
    var cur = goal; while (prev[cur] && prev[cur] !== a.at) cur = prev[cur];
    return K.armyAt(s, cur, a.power) ? null : cur;
  }
  function stepToFrontier(s, a) {
    var prev = {}, q = [a.at], goal = null; prev[a.at] = null;
    while (q.length && !goal) {
      var c = q.shift();
      K.adj(c).forEach(function (n) {
        if (prev[n] !== undefined || goal) return;
        if (s.provinces[n].owner === a.power) { prev[n] = c; q.push(n); if (K.adj(n).some(function (m) { return hostile(s, a.power, s.provinces[m].owner) && !PROV[m].special; }) && !K.armyAt(s, n, a.power)) goal = n; }
      });
    }
    if (!goal) return null;
    var cur = goal; while (prev[cur] && prev[cur] !== a.at) cur = prev[cur];
    return K.armyAt(s, cur, a.power) ? null : cur;
  }
  // the end of your turn: the other powers' orders are queued and carried out one by one
  K.endTurn = function (s) {
    if (s.phase !== 'player' || s.over) return;
    s.phase = 'enemy'; s.queue = K.planEnemy(s); s.reports = [];
  };
  // the next order: { kind: 'move' | 'auto' (fought out) | 'battle' (your army is attacked: you
  // choose how to fight it) | 'done' }
  K.stepEnemy = function (s) {
    if (s.phase !== 'enemy') return { kind: 'done' };
    while (s.queue.length) {
      var o = s.queue.shift(), a = K.army(s, o.army);
      if (!a || a.fought) continue;
      if (o.kind === 'move') {
        if (s.provinces[o.to].owner !== a.power || K.armyAt(s, o.to, a.power)) continue;
        var from = a.at; a.at = o.to; return { kind: 'move', army: a.id, from: from, to: o.to };
      }
      var owner = s.provinces[o.to].owner;
      if (owner === a.power || !K.adj(a.at).some(function (n) { return n === o.to; }) || !hostile(s, a.power, owner)) continue;
      var spec = K.spec(s, a, o.to, a.at);
      if (K.unopposed(s, spec)) { var rep = K.occupy(s, spec); s.reports.push(rep); return { kind: 'auto', spec: spec, report: rep }; }
      if (spec.defender.power === 'player' && spec.defender.army) { s.pending = spec; return { kind: 'battle', spec: spec }; }
      var b = K.autoresolve(s, spec), report = K.resolve(s, spec, b, 'auto');
      s.reports.push(report);
      return { kind: 'auto', spec: spec, report: report };
    }
    var end = K.finishTurn(s);
    return { kind: 'done', report: end };
  };
  // a battle the enemy started against your army, once fought
  K.resolvePending = function (s, battle, how) {
    var spec = s.pending; if (!spec) return null;
    var report = K.resolve(s, spec, battle, how); s.pending = null; s.reports.push(report);
    return report;
  };

  // muster: each power spends its income on its armies, then its garrisons
  function grow(s, army, budget, cap, faction) {
    var spent = 0, f = SOVL.FACTION_DATA[faction];
    army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(faction, t.id); if (!d || !d.per || d.size[1] === 1) return;
      var want = Math.min(d.size[1], Math.max(t.maxSeen || 0, d.size[0])) - t.models;
      while (want > 0 && budget - spent >= d.cost) { t.models++; spent += d.cost; want--; }
    });
    var guard = 0;
    while (K.pts(army) < cap && army.entries.length < 9 && guard++ < 6) {
      var secs = f.sections.filter(function (x) { return x.name !== 'Commanders' && x.name !== 'Mounts'; }), sec = R.pick(secs);
      var pool = sec.units.filter(function (u) { var c = u.per ? u.cost * u.size[0] : u.cost; return c <= budget - spent && c <= cap - K.pts(army) + 30; });
      if (!pool.length) continue;
      var d2 = R.pick(pool), e2 = entry(s, faction, [d2.id, d2.per ? d2.size[0] : 1]); army.entries.push(e2); spent += A.unitCost(faction, e2);
    }
    return spent;
  }
  K.armyCap = function (s, power) { var pw = D.powers[power]; return Math.round((pw.cap + pw.capTurn * (s.turn - 1)) * K.difficulty(s).cap); };
  function garrisonTarget(s, prov) { return (has(prov, 'seat') ? 380 : has(prov, 'fortress') ? 300 : has(prov, 'town') ? 240 : 180) + 5 * s.turn; }
  K.muster = function (s, power) {
    var pw = D.powers[power], faction = pw.faction, income = 0;
    K.owned(s, power).forEach(function (id) { income += PROV[id].income; });
    var budget = (s.treasury[power] || 0) + Math.round((pw.muster + income * 0.4) * K.difficulty(s).muster), cap = K.armyCap(s, power);
    if (power === 'dead' && !s.flags.deadAwake) budget = Math.round(budget * 0.4);
    K.armiesOf(s, power).forEach(function (a) { budget -= grow(s, a.army, budget, cap, faction); });
    K.owned(s, power).forEach(function (id) {
      var g = s.provinces[id].garrison; if (!g) g = s.provinces[id].garrison = { faction: faction, name: 'The garrison of ' + PROV[id].name, entries: [] };
      budget -= grow(s, g, Math.min(budget, 90), garrisonTarget(s, id), g.faction || faction);
    });
    // a new warband when the coffers allow
    if (active(s, power) && K.armiesOf(s, power).length < pw.maxArmies && budget >= 320 && s.fallen.indexOf(power) < 0) {
      var home = [pw.seat].concat(K.owned(s, power)).filter(function (id) { return s.provinces[id].owner === power && !K.armyAt(s, id, power); })[0];
      if (home) {
        var cmds = SOVL.FACTION_DATA[faction].sections[0].units, cdef = R.pick(cmds), ret = cdef.retinue.filter(function (r) { var d = SOVL.findUnitDef(faction, r); return d.per && d.size[1] > 1; })[0] || cdef.retinue[0];
        var rd = SOVL.findUnitDef(faction, ret), name = R.pick(['Warband', 'Host', 'Company', 'Column']);
        var a = buildArmy(s, power, { name: D.powers[power].name.replace(/'s.*/, '') + '\'s ' + name, at: home, cmd: [cdef.id, ret, rd.size[0]], commander: null });
        a.army.entries[0].name = cdef.name; a.name = (power === 'dead' ? 'A risen ' : power === 'greenskins' ? 'A greenskin ' : 'A rebel ') + name.toLowerCase();
        budget -= 120; budget -= grow(s, a.army, budget, Math.round(cap * 0.6), faction);
      }
    }
    s.treasury[power] = Math.max(0, Math.min(500, budget));
  };
  // the turn ends: gold, upkeep, recovery, musters, the levies, and the next turn begins
  K.finishTurn = function (s) {
    var lines = [], inc = K.income(s);
    s.gold += inc.net;
    lines.push('Income ' + inc.income + ' gold, upkeep ' + inc.upkeep + '.');
    if (s.gold < 0) {
      s.gold = 0; lines.push('The pay chests are empty: men desert from every army.');
      K.armiesOf(s, 'player').forEach(function (a) { a.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(FID, t.id); if (d.per && d.size[1] > 1) t.models = Math.max(d.size[0], t.models - Math.ceil(t.models * 0.1)); }); });
    }
    var shrine = K.unlocks(s).shrine;
    K.armiesOf(s, 'player').forEach(function (a) {
      if (a.rested && !a.fought && s.provinces[a.at].owner === 'player') {
        var any = false;
        a.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(FID, t.id); if (!d.per || d.size[1] === 1) return; var top = Math.min(d.size[1], t.maxSeen || t.models), miss = top - t.models; if (miss > 0) { t.models += Math.max(1, Math.ceil(miss * (shrine ? 0.5 : 0.25))); any = true; } });
        if (any) lines.push(a.name + ' rests: the wounded return to the ranks.');
      }
      a.moves = D.moves; a.rested = true; a.fought = false;
    });
    // the levies of your provinces gather strength: each regiment of the province's levy regrows
    // by a quarter, and one that was lost is raised again at half strength
    K.owned(s, 'player').forEach(function (id) {
      var p = s.provinces[id];
      if (!p.garrison || p.garrison.faction !== FID) p.garrison = { faction: FID, name: 'The levy of ' + PROV[id].name, entries: [] };
      var used = [], raised = false;
      K.levyBase(s, id).forEach(function (u) {
        var d = SOVL.findUnitDef(FID, u[0]), e = p.garrison.entries.filter(function (x) { return x.id === u[0] && used.indexOf(x) < 0; })[0];
        if (!e) { if (!raised) { var ne = entry(s, FID, u); ne.models = d.per && d.size[1] > 1 ? Math.max(d.size[0], Math.ceil(u[1] / 2)) : 1; p.garrison.entries.push(ne); used.push(ne); raised = true; } return; }
        used.push(e);
        if (d.per && d.size[1] > 1 && e.models < u[1]) e.models = Math.min(u[1], d.size[1], e.models + Math.ceil(u[1] / 4));
      });
    });
    ['dead', 'greenskins', 'rebels'].forEach(function (power) {
      if (s.fallen.indexOf(power) >= 0 && !active(s, power)) return;
      K.muster(s, power);
      if (D.powers[power].mend && active(s, power)) K.armiesOf(s, power).forEach(function (a) { a.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(a.army.faction, t.id); if (d && d.per && d.size[1] > 1) { var miss = (t.maxSeen || t.models) - t.models; if (miss > 0) t.models += Math.ceil(miss * D.powers[power].mend); } }); });
      K.armiesOf(s, power).forEach(function (a) { a.fought = false; });
    });
    K.armiesOf(s, 'neutral').forEach(function (a) { a.fought = false; });
    Object.keys(s.stances).forEach(function (p) { if (s.stances[p].until < s.turn + 1) delete s.stances[p]; });
    s.turn++; s.phase = 'player'; s.queue = [];
    K.checkEnd(s);
    s.log.push('Turn ' + s.turn + ' begins. Treasury: ' + s.gold + ' gold.');
    return { lines: lines, income: inc };
  };

  // ---------- the story ----------
  K.playerNear = function (s, region) { return K.owned(s, 'player').some(function (id) { return PROV[id].region === region || K.adj(id).some(function (n) { return PROV[n].region === region; }); }); };
  // the next scene to play, if any: a fallen lord, a province visit, or a story beat
  K.nextScene = function (s) {
    if (s.fallQueue.length) { var p = s.fallQueue[0]; return { kind: 'fall', id: 'fall_' + p, power: p, scene: D.falls[p] }; }
    if (s.phase !== 'player' || s.over) return null;
    for (var i = 0; i < D.story.length; i++) { var sc = D.story[i]; if (s.fired.indexOf(sc.id) < 0 && sc.when(s)) return { kind: 'story', id: sc.id, scene: sc }; }
    return null;
  };
  K.visitScene = function (s, prov) { var p = PROV[prov]; return p.special ? D.visits[p.power] : null; };
  // apply a choice; returns { lines, battle: spec } (a choice that starts a fight returns its battle)
  K.choose = function (s, scene, idx, ctx) {
    var c = scene.scene.choices[idx] || {}, lines = [], out = { lines: lines };
    var eff = c.effect || {};
    if (c.gold && s.gold < c.gold) { lines.push('Not enough gold.'); out.refused = true; return out; }
    if (scene.kind === 'fall') s.fallQueue.shift(); else if (scene.kind === 'story') s.fired.push(scene.id);
    if (scene.kind === 'visit' && ctx && ctx.army && K.army(s, ctx.army)) K.army(s, ctx.army).moves = 0; // a parley takes the rest of the day
    if (eff.attack && ctx && ctx.army) {
      var a = K.army(s, ctx.army), spec = K.spec(s, a, ctx.province, ctx.from);
      s.flags['hostile_' + ctx.province] = true;
      var win = {}; if (eff.flag) win.flag = eff.flag; if (eff.goldAfter) win.gold = eff.goldAfter;
      spec.onWin = win; out.battle = spec;
      return out;
    }
    K.applyEffect(s, eff, lines);
    if (lines.length) s.log = s.log.concat(lines);
    return out;
  };
  K.applyEffect = function (s, eff, lines) {
    if (eff.gold) { s.gold = Math.max(0, s.gold + eff.gold); lines.push((eff.gold > 0 ? '+' : '') + eff.gold + ' gold.'); }
    if (eff.stance) { s.stances[eff.stance[0]] = { kind: eff.stance[1], until: s.turn + eff.stance[2] - 1 }; }
    if (eff.waver) { var g = s.provinces[eff.waver].garrison; if (g) { g.entries = g.entries.filter(function (e, i) { return i % 2 === 0; }); g.entries.forEach(function (e) { var d = SOVL.findUnitDef(g.faction, e.id); if (d && d.per && d.size[1] > 1) e.models = Math.max(d.size[0], Math.ceil(e.models / 2)); }); } lines.push('Half the garrison of ' + PROV[eff.waver].name + ' slips away in the night.'); }
    if (eff.quest) { s.quests[eff.quest[0]] = { state: 'open', until: eff.quest[1] }; }
    if (eff.questDone) { s.quests[eff.questDone].state = 'done'; s.flags[eff.questDone] = true; }
    if (eff.questFail) { s.quests[eff.questFail].state = 'failed'; }
    if (eff.province) { var pr = eff.province[0]; if (s.provinces[pr].owner !== eff.province[1]) { capture(s, pr, eff.province[1], lines); lines.push(PROV[pr].name + ' joins the March.'); } }
    if (eff.item) { var hero = s.armies.filter(function (a) { return a.hero; })[0], cmd = hero && K.commanderOf(hero), it = SOVL.itemById(eff.item); if (cmd && it) { cmd.items = cmd.items.filter(function (x) { var y = SOVL.itemById(x); return !y || y.kind !== it.kind; }); cmd.items.push(it.id); lines.push(D.hero.name + ' takes up ' + it.name + '.'); } }
    if (eff.unlock) { s.unlocks[eff.unlock] = true; lines.push('Dunmar\'s forges will build war machines for you.'); }
    if (eff.flag) s.flags[eff.flag] = true;
    if (eff.wake && !s.flags.deadAwake) {
      s.flags.deadAwake = s.turn; s.lords.vorhal = 'active';
      var risen = buildArmy(s, 'dead', D.risen);
      if (s.provinces[D.risen.at].owner !== 'dead' || K.armyAt(s, D.risen.at, 'dead') !== risen) { var home = K.owned(s, 'dead').filter(function (id) { return !K.armyAt(s, id, 'dead') || K.armyAt(s, id, 'dead') === risen; })[0]; if (home) risen.at = home; }
      lines.push('The dead are marching.');
    }
    if (eff.fate) s.fates[eff.fate[0]] = eff.fate[1];
    if (eff.release) releasePower(s, eff.release, lines);
    if (eff.annex) {
      var pw2 = eff.annex;
      K.armiesOf(s, pw2).forEach(function (a) { removeArmy(s, a); });
      K.owned(s, pw2).forEach(function (id) { capture(s, id, 'player', lines); });
      s.lords[D.powers[pw2].lord] = 'gone';
      lines.push('The rebel lands swear to the Warden.');
    }
    if (eff.hireLord === 'ottokar') {
      var at = ['highmoor'].concat(K.owned(s, 'player')).filter(function (id) { return s.provinces[id].owner === 'player' && !K.armyAt(s, id, 'player'); })[0];
      if (at) { var oa = buildArmy(s, 'player', { name: 'The Penitent Host', at: at, cmd: ['knight_commander', 'imperial_knights', 6], commander: 'Ottokar', items: ['sword_of_might'], units: [['foot_knights', 12]] }); oa.army.entries[0].name = 'Count Ottokar Vehl'; oa.moves = 0; lines.push('Count Ottokar takes command of the Penitent Host.'); }
    }
    return lines;
  };
  // the closing words, chosen by what happened
  K.epilogue = function (s) {
    var E = D.epilogue, lost = s.result === 'lost', out = [lost && s.provinces.harrowgate.owner === 'player' ? E.lostTime : E[s.result] || E.partial];
    if (lost) return out;
    Object.keys(s.fates).forEach(function (l) { var t = E.fates[l] && E.fates[l][s.fates[l]]; if (t) out.push(t); });
    ['oath', 'gladeBurned', 'dunmar'].forEach(function (f) { if (s.flags[f] && E.flags[f] && (f !== 'oath' || s.result === 'victory')) out.push(E.flags[f]); });
    return out;
  };

  // ---------- commander traits ----------
  K.traitChoices = function (s, armyId) {
    var a = K.army(s, armyId), cmd = a && K.commanderOf(a); if (!cmd) return [];
    var cdef = SOVL.findUnitDef(FID, cmd.id), owned = cmd.traits || [];
    return R.shuffle(Object.keys(SOVL.TRAITS).filter(function (id) { return owned.indexOf(id) < 0 && (!SOVL.TRAITS[id].caster || cdef.caster); })).slice(0, 3);
  };
  K.learnTrait = function (s, armyId, id) {
    var a = K.army(s, armyId), cmd = a && K.commanderOf(a);
    s.pendingTraits = s.pendingTraits.filter(function (x) { return x !== armyId; });
    if (!cmd || !SOVL.TRAITS[id]) return 'No trait.';
    cmd.traits = (cmd.traits || []).concat([id]); s.log.push(cmd.name + ' learns ' + SOVL.TRAITS[id].name + '.');
    return null;
  };

  // ---------- saving ----------
  K.save = function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage may be blocked */ } };
  K.load = function () { try { var t = localStorage.getItem(KEY); var s = t ? JSON.parse(t) : null; return s && s.version === 1 ? s : null; } catch (e) { return null; } };
  K.clear = function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  K.KEY = KEY;

  SOVL.Conquest = K;
})();
