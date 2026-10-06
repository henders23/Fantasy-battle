// Trail of Death: a procedural roguelite campaign.
'use strict';
(function () {
  var R = SOVL.R, A = SOVL.Army, C = {};
  // how often each kind of stop is drawn for the middle of an act, and for its first and last
  // steps (the step before the boss is a place to rest and re-arm)
  var STOPS = { battle: 4.4, elite: 1.6, event: 2.4, merchant: 1.3, camp: 1, treasure: 1.1 };
  var FIRST = { event: 1.2, treasure: 1, merchant: 0.7 };
  var REST = { camp: 2, merchant: 2, treasure: 0.8, event: 0.6 };
  var FIGHT = { battle: true, elite: true, boss: true };
  function weighted(w) {
    var keys = Object.keys(w).filter(function (k) { return w[k] > 0; }), total = keys.reduce(function (a, k) { return a + w[k]; }, 0);
    if (!keys.length) return null;
    var x = R.rng() * total;
    for (var i = 0; i < keys.length; i++) { x -= w[keys[i]]; if (x < 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  C.create = function (opts) {
    var fid = opts.faction, cdef = SOVL.findUnitDef(fid, opts.commander);
    var name = opts.name || R.pick(SOVL.COMMANDER_NAMES[fid]);
    var retId = opts.retinue || cdef.retinue.filter(function (r) { var d = SOVL.findUnitDef(fid, r); return d.per; })[0] || cdef.retinue[0];
    var rdef = SOVL.findUnitDef(fid, retId);
    var cmd = A.defaultCommander(fid, cdef.id, retId, rdef.per ? rdef.size[0] : 1, cdef.name + ' ' + name);
    cmd.ref = 'c1';
    cmd.retinue.ref = 'u1';
    if (cdef.caster) cmd.spells = (opts.spells && opts.spells.length ? opts.spells : cdef.spells.slice(0, cdef.caster)).slice(0, cdef.caster);
    var army = { faction: fid, name: name + '\'s Warband', entries: [cmd] };
    // two small supporting units from the battle line / cheap sections
    var f = SOVL.FACTION_DATA[fid], bl = f.sections.filter(function (s) { return s.name === 'Battle Line'; })[0];
    var picks = R.shuffle(bl.units.slice()).slice(0, 2);
    picks.forEach(function (d, i) { var e = A.defaultEntry(fid, d.id, Math.round((d.size[0] + d.size[1]) / 2)); e.ref = 'u' + (i + 2); army.entries.push(e); });
    var diff = SOVL.DIFFICULTIES.filter(function (d) { return d.id === opts.difficulty; })[0] || SOVL.DIFFICULTIES[1];
    var camp = {
      version: 2, faction: fid, commanderName: name, army: army, gold: diff.gold, difficulty: diff.id, act: 0, layer: 0, nodeIndex: null,
      map: C.generateMap(), battles: 0, wins: 0, kills: 0, refCounter: 10, log: [], reputation: 0, items: [], over: false, victory: false, seed: Math.floor(R.rng() * 1e9),
      history: [], pendingTrait: false
    };
    camp.log.push('The trail begins. ' + name + ' leads a ragtag warband of ' + army.entries.length + ' units.');
    return camp;
  };
  C.nextRef = function (camp) { camp.refCounter++; return 'u' + camp.refCounter; };

  // Map: for each act, a list of layers; each layer a list of nodes {type, next:[indices in next layer]}
  C.generateMap = function () {
    var acts = SOVL.CAMPAIGN.acts.map(function (actDef, ai) {
      var layers = [];
      // three ways to begin, 2-4 stops at each step after (2-3 before the boss), the boss alone at the end
      for (var l = 0; l < actDef.layers; l++) {
        var last = actDef.layers - 1, n = l === 0 ? 3 : l === last ? 1 : 2 + Math.floor(R.rng() * (l === last - 1 ? 2 : 3)), layer = [];
        for (var i = 0; i < n; i++) layer.push({ type: null, next: [], id: ai + '-' + l + '-' + i, visited: false });
        layers.push(layer);
      }
      // roads: each stop leads on to 1-3 stops in the next step, mostly ahead but sometimes across,
      // so routes split, cross and merge; every stop can be reached
      for (var l2 = 0; l2 < layers.length - 1; l2++) {
        var cur = layers[l2], nxt = layers[l2 + 1];
        cur.forEach(function (nd, i) {
          var a = Math.floor(i * nxt.length / cur.length), b = Math.min(nxt.length - 1, Math.floor((i + 1) * nxt.length / cur.length));
          nd.next.push(a); if (b !== a && R.rng() < 0.75) nd.next.push(b);
          for (var x = 0; x < 2; x++) {
            if (nd.next.length >= 3 || R.rng() >= (x ? 0.2 : 0.5)) continue;
            var c = Math.floor(R.rng() * nxt.length);
            if (nd.next.indexOf(c) < 0 && Math.abs(c - a) <= 2) nd.next.push(c);
          }
          nd.next.sort(function (p, q) { return p - q; });
        });
        // a stop nothing leads to gets a road from the nearest stop that has room for another
        nxt.forEach(function (n2, j) {
          if (cur.some(function (nd) { return nd.next.indexOf(j) >= 0; })) return;
          var at = j * (cur.length - 1) / Math.max(1, nxt.length - 1), full = function (p) { return p.next.length >= 3 ? 1 : 0; };
          var from = cur.slice().sort(function (p, q) { return full(p) - full(q) || Math.abs(cur.indexOf(p) - at) - Math.abs(cur.indexOf(q) - at); })[0];
          from.next.push(j);
        });
        cur.forEach(function (nd) { nd.next = nd.next.filter(function (v, k, arr) { return arr.indexOf(v) === k; }).sort(function (p, q) { return p - q; }); });
      }
      // rarely the roads leave a stop no kind that keeps every rule; then draw the act's stops again
      for (var tries = 0; tries < 40; tries++) {
        layers.forEach(function (layer) { layer.forEach(function (nd) { nd.type = null; }); });
        assignStops(layers);
        if (stopsVaried(layers)) break;
      }
      return { name: actDef.name, layers: layers, boss: actDef.boss };
    });
    return { acts: acts };
  };

  // Kinds of stop, chosen once the roads are known so that the choices vary: the stops on offer
  // at any one step are all different, a shop, camp, treasure or event never sits next to another
  // of its kind along a road, battles rarely follow battles, every middle step offers a fight, and
  // the step before the boss offers a camp or a merchant. That step is settled first, so the step
  // leading into it can avoid what lies on either side.
  function assignStops(layers) {
    var last = layers.length - 1, order = [];
    for (var l0 = 0; l0 < last - 2; l0++) order.push(l0);
    order.push(last - 1); if (last - 2 > 0) order.push(last - 2); order.push(last);
    order.forEach(function (l) {
      var layer = layers[l];
      if (l === last) { layer.forEach(function (nd) { nd.type = 'boss'; }); return; }
      var used = {};
      R.shuffle(layer.map(function (nd, i) { return i; })).forEach(function (i, k) {
        var nd = layer[i], w;
        if (l === 0) w = k === 0 ? { battle: 1 } : Object.assign({}, FIRST);
        else w = Object.assign({}, l === last - 1 ? REST : STOPS);
        // the stops either side of this one along a road (those already settled)
        var near = (l ? layers[l - 1].filter(function (p) { return p.next.indexOf(i) >= 0; }) : [])
          .concat(nd.next.map(function (j) { return layers[l + 1][j]; })).filter(function (x) { return x.type; });
        near.forEach(function (p) {
          if (!FIGHT[p.type]) w[p.type] = 0; // no shop next to a shop, camp next to a camp...
          else if (w[p.type]) w[p.type] *= 0.45; // ...and fewer battles next to battles
        });
        Object.keys(used).forEach(function (t) { w[t] = 0; });
        if (l === last - 1 && k === 0) { var rest = { camp: w.camp ? 1 : 0, merchant: w.merchant ? 1 : 0 }; if (rest.camp || rest.merchant) w = rest; }
        // if nothing fits, any kind not yet on offer here, keeping clear of its neighbours if possible
        var spare = Object.assign({}, STOPS); Object.keys(used).forEach(function (t) { spare[t] = 0; });
        var clear = Object.assign({}, spare); near.forEach(function (p) { if (!FIGHT[p.type]) clear[p.type] = 0; });
        var type = weighted(w) || weighted(clear) || weighted(spare) || 'battle';
        nd.type = type; used[type] = true;
      });
      // a middle step always offers a fight, put where it breaks up the fewest fights in a row
      if (l > 0 && l < last - 1 && !layer.some(function (nd) { return FIGHT[nd.type]; })) {
        var calm = layer.filter(function (nd, i) { return !layers[l - 1].some(function (p) { return p.next.indexOf(i) >= 0 && FIGHT[p.type]; }); });
        (calm[0] || layer[0]).type = 'battle';
      }
    });
  }

  function stopsVaried(layers) {
    var last = layers.length - 1;
    return layers.every(function (layer, l) {
      var ts = layer.map(function (nd) { return nd.type; });
      if (ts.some(function (t, k) { return ts.indexOf(t) !== k; })) return false;
      if (l > 0 && l < last - 1 && !ts.some(function (t) { return FIGHT[t]; })) return false;
      if (l === last - 1 && ts.indexOf('camp') < 0 && ts.indexOf('merchant') < 0) return false;
      return l === last || layer.every(function (nd) { return nd.next.every(function (j) { var t = layers[l + 1][j].type; return t !== nd.type || FIGHT[t]; }); });
    });
  }
  C.stopsVaried = stopsVaried;

  C.currentAct = function (camp) { var act = camp.map.acts[camp.act]; if (act && SOVL.CAMPAIGN.acts[camp.act]) act.name = SOVL.CAMPAIGN.acts[camp.act].name; return act; };
  C.availableNodes = function (camp) {
    var act = C.currentAct(camp);
    if (camp.nodeIndex == null) return act.layers[0].map(function (n, i) { return i; });
    if (camp.layer >= act.layers.length - 1) return [];
    return act.layers[camp.layer][camp.nodeIndex].next;
  };
  C.nodeAt = function (camp, layer, idx) { return C.currentAct(camp).layers[layer][idx]; };

  // Enemy army for a node
  C.enemyArmyFor = function (camp, node, kind) {
    var actDef = SOVL.CAMPAIGN.acts[camp.act], steps = (C.currentAct(camp) || { layers: [] }).layers.length || actDef.layers, t = camp.layer / Math.max(1, steps - 1); // the act being played: a run saved before the maps grew keeps its own
    var pts = Math.round(actDef.pts[0] + (actDef.pts[1] - actDef.pts[0]) * t);
    // scale a little with the player's own strength so the run stays fair
    var own = A.armyCost(camp.army), diff = C.difficulty(camp);
    pts = Math.round((pts * 0.7 + Math.min(own * 0.8, pts * 1.5) * 0.3) * diff.pts);
    var type = kind || node.type, fids = Object.keys(SOVL.FACTION_DATA), fid;
    if (type === 'small') { pts = Math.round(pts * 0.6); }
    if (type === 'undead') { fid = 'dead_nations'; pts = Math.round(pts * 0.9); }
    if (type === 'elite') pts = Math.round(pts * actDef.elitePts);
    // a boss matches the army that reaches it (within the act's limits) rather than outnumbering it
    if (type === 'boss') { pts = Math.round(Math.min(actDef.boss.pts, Math.max(actDef.boss.pts * 0.5, own * 0.8)) * diff.pts); fid = camp.act === 2 ? 'dead_nations' : null; }
    else pts = Math.min(pts, Math.round((own * 1.4 + 50) * diff.pts)); // never wildly larger than the player's own army
    if (!fid) { var others = fids.filter(function (f) { return f !== camp.faction; }); fid = R.rng() < 0.85 ? R.pick(others) : camp.faction; }
    var army = A.randomArmy({ faction: fid, pts: Math.max(150, pts), boss: type === 'boss', name: type === 'boss' ? actDef.boss.name : undefined });
    army.pts = pts; army.kind = type;
    return army;
  };
  C.difficulty = function (camp) { return SOVL.DIFFICULTIES.filter(function (d) { return d.id === camp.difficulty; })[0] || SOVL.DIFFICULTIES[1]; };
  // Scenario for a campaign battle: mostly pitched, sometimes a meeting engagement or objectives.
  C.scenarioFor = function (camp, node, kind) {
    if (kind || (node && node.type === 'boss')) return 'pitched';
    var r = R.rng();
    return r < 0.55 ? 'pitched' : r < 0.8 ? 'meeting' : 'objectives';
  };
  C.goldReward = function (camp, enemyArmy, node) {
    var base = Math.round(enemyArmy.pts * 0.22);
    if (node && node.type === 'elite') base = Math.round(base * 1.5);
    if (node && node.type === 'boss') base = Math.round(base * 2);
    return base + 20;
  };

  // Apply a battle result to the campaign army. battle: finished Battle; playerSide: 0
  C.applyBattleResult = function (camp, battle, node, enemyArmy) {
    var won = battle.result.winner === 0, draw = battle.result.winner == null && battle.result.why !== 'mutual', refs = {}, cmdAlive = true;
    battle.units.concat(battle.dead).filter(function (u) { return u.side === 0; }).forEach(function (u) {
      if (u.campaignRef) refs[u.campaignRef] = u;
      if (u.commander && !u.commander.alive) cmdAlive = false;
    });
    camp.battles++;
    var lines = [], diff = C.difficulty(camp), boss = node && node.type === 'boss', lost = !won && !draw;
    // a lost battle ends the run against a boss, or on Legend; so does a fallen commander on Legend
    if ((lost && (boss || diff.lossEndsRun)) || (!cmdAlive && diff.commanderDeathEndsRun)) {
      camp.over = true;
      camp.history.push({ act: camp.act, type: node ? node.type : 'battle', enemy: enemyArmy.faction, pts: enemyArmy.pts, won: false, draw: false, turn: battle.result.turn, why: battle.result.why, fatal: true });
      lines.push(cmdAlive ? 'The battle is lost. The trail ends here.' : camp.commanderName + ' has fallen. The trail ends here.');
      camp.log = camp.log.concat(lines);
      return { won: false, lines: lines };
    }
    if (won) camp.wins++;
    else if (lost) lines.push('The army falls back in disorder. There is no plunder, and the abandoned baggage costs ' + Math.round(camp.gold * 0.2) + ' gold, but the trail goes on.');
    else lines.push('A bloody stalemate. Both armies withdraw; there is no plunder, but the trail goes on.');
    if (lost) camp.gold -= Math.round(camp.gold * 0.2);
    if (!cmdAlive) { var fee = Math.min(camp.gold, 30); camp.gold -= fee; lines.push(camp.commanderName + ' is carried from the field, badly wounded, and will lead again' + (fee ? ' (the surgeon\'s fee: ' + fee + ' gold)' : '') + '.'); }
    // casualties: half of lost models return (wounded); destroyed units are gone; routed units return at half
    var newEntries = [];
    camp.army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, u = refs[t.ref], def = SOVL.findUnitDef(camp.faction, t.id);
      if (!u) { newEntries.push(e); return; }
      var lost = u.maxModels - Math.max(0, u.models), back = Math.floor(lost / 2);
      var survivors = Math.max(0, u.models) + back;
      if (u.removed && u.removedHow !== 'fled') { survivors = e.kind === 'commander' ? Math.max(0, back) : 0; }
      if (u.removed && u.removedHow === 'fled') survivors = Math.max(survivors, Math.floor(u.maxModels / 2));
      t.kills = (t.kills || 0) + (u.kills || 0);
      if (u.commander && e.kind === 'commander') e.commanderKills = (e.commanderKills || 0) + (u.commanderKills || 0);
      if (def.per) {
        if (survivors < Math.max(1, Math.floor(def.size[0] / 2)) && e.kind !== 'commander') { lines.push(def.name + ' has been wiped out.'); return; }
        t.models = Math.max(e.kind === 'commander' ? 1 : 1, Math.min(def.size[1], survivors));
        if (lost) lines.push(def.name + ': lost ' + lost + ', ' + back + ' wounded return. Now ' + t.models + ' strong.');
      } else if (u.removed && e.kind !== 'commander') { lines.push(def.name + ' has been destroyed.'); return; }
      // veterancy
      t.battles = (t.battles || 0) + 1;
      var vt = SOVL.CAMPAIGN.veteran, newVet = 0; for (var i = 0; i < vt.length; i++) if (t.battles >= vt[i].at) newVet = i + 1;
      if (newVet > (t.vet || 0)) { t.vet = newVet; lines.push(def.name + ' is now ' + vt[newVet - 1].name + '!'); }
      if (e.kind === 'commander') { e.battles = (e.battles || 0) + 1; var cv = 0; for (var j = 0; j < vt.length; j++) if (e.battles >= vt[j].at) cv = j + 1; if (cv > (e.vet || 0)) { e.vet = cv; camp.pendingTrait = true; lines.push(e.name + ' is now ' + vt[cv - 1].name + ' and may learn a trait!'); } }
      newEntries.push(e);
    });
    camp.army.entries = newEntries;
    var gold = won ? C.goldReward(camp, enemyArmy, node) : 0;
    if (gold) { camp.gold += gold; lines.push('Plunder: +' + gold + ' gold.'); }
    battle.dead.filter(function (u) { return u.side === 1; }).forEach(function (u) { camp.kills += u.killed; });
    battle.units.filter(function (u) { return u.side === 1; }).forEach(function (u) { camp.kills += u.killed; });
    camp.history.push({ act: camp.act, type: node ? node.type : 'battle', enemy: enemyArmy.faction, pts: enemyArmy.pts, won: won, draw: draw, turn: battle.result.turn, why: battle.result.why });
    if (!won && node && node.type === 'boss') { camp.over = true; lines.push('A stalemate is not enough against ' + (SOVL.CAMPAIGN.acts[camp.act].boss.name) + '. The trail ends here.'); camp.log = camp.log.concat(lines); return { won: false, lines: lines }; }
    camp.log = camp.log.concat(lines);
    return { won: !lost, draw: draw, retreat: lost, lines: lines, gold: gold };
  };

  C.moveTo = function (camp, idx) {
    var avail = C.availableNodes(camp);
    if (avail.indexOf(idx) < 0) return null;
    if (camp.nodeIndex == null) camp.layer = 0; else camp.layer++;
    camp.nodeIndex = idx;
    var node = C.nodeAt(camp, camp.layer, idx); node.visited = true;
    return node;
  };
  C.advanceAct = function (camp) {
    camp.act++; camp.layer = 0; camp.nodeIndex = null;
    if (camp.act >= camp.map.acts.length) { camp.victory = true; camp.over = true; }
  };

  // ---- Commander traits ----
  C.traitChoices = function (camp) {
    var cmd = camp.army.entries[0], cdef = SOVL.findUnitDef(camp.faction, cmd.id), owned = cmd.traits || [];
    var pool = Object.keys(SOVL.TRAITS).filter(function (id) { var t = SOVL.TRAITS[id]; return owned.indexOf(id) < 0 && (!t.caster || cdef.caster); });
    return R.shuffle(pool).slice(0, 3);
  };
  C.learnTrait = function (camp, id) {
    if (!SOVL.TRAITS[id]) return 'Unknown trait.';
    var cmd = camp.army.entries[0]; cmd.traits = cmd.traits || [];
    if (cmd.traits.indexOf(id) >= 0) return 'Already known.';
    cmd.traits.push(id); camp.pendingTrait = false;
    camp.log.push(cmd.name + ' learns ' + SOVL.TRAITS[id].name + '.');
    return null;
  };

  // ---- Merchant ----
  // Each merchant on the trail is one of several kinds of trader, never the same kind twice in a
  // row, each with its own mix: how many recruits, relics and banners, and its own speciality.
  C.MERCHANTS = {
    general:     { name: 'Merchant', units: 4, items: 2, banners: 2, text: 'A trader\'s wagon, lamps lit against the dusk. Recruits, relics and reinforcements — for a price.' },
    recruiter:   { name: 'Recruiting Sergeant', units: 6, items: 0, banners: 1, seasoned: 1, text: 'A sergeant with a drum and a ledger. Fighting men for hire, some of them already blooded.' },
    relics:      { name: 'Relic Dealer', units: 1, items: 4, banners: 3, text: 'A cart of curios under oilcloth: blades that hum, banners that will not burn.' },
    armourer:    { name: 'Travelling Armourer', units: 2, items: 2, banners: 1, rearm: 0.6, text: 'A forge on wheels. Re-arming costs far less here, and the smith has a few blades to sell.' },
    sutler:      { name: 'Camp Sutler', units: 3, items: 1, banners: 1, reinforce: 0.7, text: 'Bread, ale and boots for the ranks. Recruits to fill the gaps come cheap here.' }
  };
  C.merchantKind = function (node) { return C.MERCHANTS[(node && node.merchant) || 'general'] || C.MERCHANTS.general; };
  C.merchantStock = function (camp, node) {
    var f = SOVL.FACTION_DATA[camp.faction], stock = [], kinds = Object.keys(C.MERCHANTS);
    var kindId = R.pick(kinds.filter(function (k) { return k !== camp.lastMerchant; })), kind = C.MERCHANTS[kindId];
    if (node) node.merchant = kindId;
    camp.lastMerchant = kindId;
    var seen = camp.lastWares || [], offered = [];
    var sections = f.sections.filter(function (s) { return s.name !== 'Commanders' && s.name !== 'Mounts'; });
    // what the army lacks: ranged troops, war machines, monsters or heavy units are offered first
    var has = function (test) { return camp.army.entries.some(function (e) { var t = e.kind === 'commander' ? e.retinue : e; return test(SOVL.findUnitDef(camp.faction, t.id), t); }); };
    var lacksRanged = !has(function (d, t) { return !!t.ranged; });
    var pool = []; sections.forEach(function (s) { s.units.forEach(function (u) { pool.push({ def: u, section: s }); }); });
    pool.forEach(function (p) {
      var w = seen.indexOf(p.def.id) >= 0 ? 0.25 : 1; // fresh faces over last time's
      if (lacksRanged && p.def.ranged && p.def.ranged.length) w *= 2.5;
      if (!has(function (d) { return d.type === p.def.type; })) w *= 1.6; // a kind of troop the army has none of
      p.w = w;
    });
    // draw recruits by weight, spread across sections
    var units = [], secCount = {};
    while (units.length < kind.units && pool.length) {
      var total = pool.reduce(function (a, p) { return a + p.w / (1 + (secCount[p.section.name] || 0)); }, 0), x = R.rng() * total, pick = pool[pool.length - 1];
      for (var i = 0; i < pool.length; i++) { x -= pool[i].w / (1 + (secCount[pool[i].section.name] || 0)); if (x < 0) { pick = pool[i]; break; } }
      units.push(pick); secCount[pick.section.name] = (secCount[pick.section.name] || 0) + 1;
      pool.splice(pool.indexOf(pick), 1);
    }
    units.forEach(function (p, k) {
      // companies come at different strengths: a small band, a full company, or between
      var def = p.def, size = !def.per ? 1 : R.pick([def.size[0], def.size[0], Math.round((def.size[0] + def.size[1]) / 2), def.size[1]]);
      var e = A.defaultEntry(camp.faction, def.id, size), o = { kind: 'unit', entry: e, section: p.section.name };
      if (kind.seasoned && k < kind.seasoned) { e.vet = 1; e.battles = SOVL.CAMPAIGN.veteran[0].at; o.tag = 'Seasoned'; }
      else if (def.per && def.size[1] > def.size[0] && size === def.size[1]) o.tag = 'Full company';
      o.price = Math.round(A.unitCost(camp.faction, e) * (o.tag === 'Seasoned' ? 1.45 : 1.2)) + 10;
      stock.push(o); offered.push(def.id);
    });
    // relics the commander can use, banners some regiment can carry
    var cdef = SOVL.findUnitDef(camp.faction, camp.army.entries[0].id), usable = SOVL.MAGIC_ITEMS.filter(function (it) { return cdef.magic && (it.kind !== 'weapon' || cdef.magic === 'weapon_item') && (it.id !== 'staff_of_power' || cdef.caster); });
    if (!usable.length) usable = SOVL.MAGIC_ITEMS.slice();
    var maxBanner = 0; camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, d = SOVL.findUnitDef(camp.faction, t.id); if (d.banner) maxBanner = Math.max(maxBanner, d.banner); });
    var carriable = SOVL.BANNERS.filter(function (bn) { return bn.cost <= maxBanner; }); if (!carriable.length) carriable = SOVL.BANNERS.slice();
    var fresh = function (list) { return R.shuffle(list.slice()).sort(function (a, b) { return (seen.indexOf(a.id) >= 0) - (seen.indexOf(b.id) >= 0); }); };
    fresh(usable).slice(0, kind.items).forEach(function (it) { stock.push({ kind: 'item', item: it, price: it.cost * 2 + 20 }); offered.push(it.id); });
    fresh(carriable).slice(0, kind.banners).forEach(function (bn) { stock.push({ kind: 'banner', banner: bn, price: bn.cost * 2 + 10 }); offered.push(bn.id); });
    // one ware is going cheap
    var deal = stock[Math.floor(R.rng() * stock.length)];
    if (deal && R.rng() < 0.7) { deal.was = deal.price; deal.price = Math.round(deal.price * 0.75); deal.bargain = true; }
    camp.lastWares = offered;
    return stock;
  };
  // Equipment a unit could be re-armed with: alternative weapon sets and optional upgrades from its source entry.
  C.equipmentOffers = function (camp, node) {
    var offers = [], cut = C.merchantKind(node).rearm || 1;
    camp.army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id), models = def.per ? t.models : 1;
      def.weapons.forEach(function (w) { if (w.name !== t.weapon) offers.push({ kind: 'equip', ref: t.ref, entry: e, unitName: def.name, name: w.name, what: 'weapon', price: Math.round((8 + w.cost * models) * 1.5) }); });
      (def.upgrades || []).forEach(function (up) { if ((t.upgrades || []).indexOf(up.name) < 0) offers.push({ kind: 'equip', ref: t.ref, entry: e, unitName: def.name, name: up.name, what: 'upgrade', price: Math.round((10 + up.cost * (def.per && (SOVL.WEAPONS[up.name] || SOVL.RANGED[up.name]) ? models : 1)) * 1.5) }); });
      if (e.kind === 'commander') {
        var cdef = SOVL.findUnitDef(camp.faction, e.id);
        cdef.weapons.forEach(function (w) { if (w.name !== e.weapon) offers.push({ kind: 'equip', ref: e.ref, entry: e, commander: true, unitName: e.name, name: w.name, what: 'weapon', price: Math.round((10 + w.cost) * 1.5) }); });
        (cdef.upgrades || []).forEach(function (up) { if ((e.upgrades || []).indexOf(up.name) < 0) offers.push({ kind: 'equip', ref: e.ref, entry: e, commander: true, unitName: e.name, name: up.name, what: 'upgrade', price: Math.round((10 + up.cost) * 1.5) }); });
      }
    });
    if (cut !== 1) offers.forEach(function (o) { o.price = Math.max(5, Math.round(o.price * cut)); });
    return offers;
  };
  C.reinforceCost = function (camp, entry, node) {
    var t = entry.kind === 'commander' ? entry.retinue : entry, def = SOVL.findUnitDef(camp.faction, t.id);
    if (!def.per || t.models >= def.size[1]) return null;
    return Math.max(1, Math.round((Math.round((def.cost + A.optionCost(def, t.weapon)) * 1.5) + 2) * (C.merchantKind(node).reinforce || 1)));
  };
  C.unitCapCount = function (camp, sectionName) {
    return camp.army.entries.filter(function (e) { var s = SOVL.findSection(camp.faction, e.kind === 'commander' ? e.id : e.id); return s && s.name === sectionName; }).length;
  };
  C.buy = function (camp, offer) {
    if (camp.gold < offer.price) return 'Not enough gold.';
    if (offer.kind === 'unit') {
      var sec = SOVL.findSection(camp.faction, offer.entry.id), lim = A.sectionLimits(sec, 1500);
      if (C.unitCapCount(camp, sec.name) >= lim.max + 1) return 'You already field as many ' + sec.name + ' units as the army can support.';
      var e = JSON.parse(JSON.stringify(offer.entry)); e.ref = C.nextRef(camp); camp.army.entries.push(e);
    } else if (offer.kind === 'item') {
      var cmd = camp.army.entries[0], cdef = SOVL.findUnitDef(camp.faction, cmd.id);
      if (!cdef.magic) return 'Your commander cannot use magic items.';
      if (offer.item.kind === 'weapon' && cdef.magic === 'item') return 'Your commander cannot wield a magic weapon.';
      var same = cmd.items.map(SOVL.itemById).filter(function (i) { return i && i.kind === offer.item.kind; });
      if (same.length) cmd.items = cmd.items.filter(function (id) { return SOVL.itemById(id).kind !== offer.item.kind; });
      cmd.items.push(offer.item.id);
    } else if (offer.kind === 'equip') {
      var target = offer.commander ? offer.entry : (offer.entry.kind === 'commander' ? offer.entry.retinue : offer.entry);
      if (offer.what === 'weapon') target.weapon = offer.name;
      else { target.upgrades = target.upgrades || []; if (target.upgrades.indexOf(offer.name) < 0) target.upgrades.push(offer.name); }
    } else if (offer.kind === 'banner') {
      var target = null;
      camp.army.entries.forEach(function (en) { var t = en.kind === 'commander' ? en.retinue : en, def = SOVL.findUnitDef(camp.faction, t.id); if (!target && def.banner && def.banner >= offer.banner.cost && !t.banner) target = t; });
      if (!target) return 'No unit can carry that banner.';
      target.banner = offer.banner.id;
    }
    camp.gold -= offer.price; offer.sold = true;
    return null;
  };
  C.reinforce = function (camp, entry, node) {
    var cost = C.reinforceCost(camp, entry, node); if (cost == null) return 'Unit is at full strength.';
    if (camp.gold < cost) return 'Not enough gold.';
    var t = entry.kind === 'commander' ? entry.retinue : entry; t.models++; camp.gold -= cost; return null;
  };
  // ---- Camp ----
  C.campAllowance = function (camp) { return 50 + camp.act * 25; };
  C.campRecovery = function (camp, e, reinforce) {
    var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id);
    if (!def.per) return t.models;
    var recovered = Math.min(def.size[1], Math.max(t.models, t.maxSeen || 0, def.size[0]));
    return Math.min(def.size[1], recovered + (reinforce ? Math.ceil(def.size[0] / 2) : 0));
  };
  // Used by events as well as camp visits; it never awards camp gold.
  C.camp = function (camp, choice, entry) {
    if (choice === 'rest') {
      camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.models = C.campRecovery(camp, e, false); });
      return 'All surviving regiments recover to their previous strength, or their starting strength if greater.';
    }
    if (choice === 'train' && entry && camp.army.entries.indexOf(entry) >= 0) {
      var t = entry.kind === 'commander' ? entry.retinue : entry;
      if ((t.vet || 0) >= 3) return null;
      t.vet = (t.vet || 0) + 1;
      // Training counts towards the next promotion, rather than being overwritten by it.
      t.battles = Math.max(t.battles || 0, SOVL.CAMPAIGN.veteran[t.vet - 1].at);
      return SOVL.findUnitDef(camp.faction, t.id).name + ' gains a veterancy rank.';
    }
    return null;
  };
  C.campVisit = function (camp, node, choice, entry) {
    var current = camp.nodeIndex == null ? null : C.nodeAt(camp, camp.layer, camp.nodeIndex);
    if (!node || node !== current || node.type !== 'camp' || !node.visited || node.campClaimed) return null;
    if (['reinforce', 'train', 'supplies'].indexOf(choice) < 0) return null;
    var t = entry && (entry.kind === 'commander' ? entry.retinue : entry);
    if (choice === 'train' && (!entry || camp.army.entries.indexOf(entry) < 0 || (t.vet || 0) >= 3)) return null;
    C.camp(camp, 'rest');
    var gold = C.campAllowance(camp), lines = ['The wounded return: every surviving regiment is restored.'];
    if (choice === 'reinforce') {
      camp.army.entries.forEach(function (e) { var u = e.kind === 'commander' ? e.retinue : e; u.models = C.campRecovery(camp, e, true); u.maxSeen = Math.max(u.maxSeen || 0, u.models); });
      lines.push('Fresh recruits join every regiment: up to half its starting size, within its unit limit.');
    } else if (choice === 'train') lines.push(C.camp(camp, 'train', entry));
    else gold += 75 + camp.act * 25;
    camp.gold += gold;
    lines.push('The quartermaster provides ' + gold + ' gold.');
    node.campClaimed = true;
    camp.log = camp.log.concat(lines);
    return { lines: lines, gold: gold };
  };
  // ---- Events ----
  C.randomEvent = function (camp) {
    var eligible = SOVL.CAMPAIGN.events.filter(function (e) { return (!e.faction || e.faction === camp.faction) && (e.minAct == null || camp.act >= e.minAct); });
    var pool = eligible.filter(function (e) { return (camp.seenEvents || []).indexOf(e.id) < 0; });
    if (!pool.length) pool = eligible;
    var ev = R.pick(pool); camp.seenEvents = (camp.seenEvents || []).concat([ev.id]);
    return ev;
  };
  C.applyEffect = function (camp, effect) {
    var lines = [];
    if (effect.gold) { camp.gold = Math.max(0, camp.gold + effect.gold); lines.push((effect.gold > 0 ? '+' : '') + effect.gold + ' gold.'); }
    if (effect.recruitRandom) {
      var f = SOVL.FACTION_DATA[camp.faction], pool = [];
      f.sections.forEach(function (s) { if (s.name === 'Commanders' || s.name === 'Mounts') return; s.units.forEach(function (u) { if (u.per && (!effect.big ? u.cost <= 10 : true)) pool.push(u); }); });
      var d = R.pick(pool), e = A.defaultEntry(camp.faction, d.id, effect.big ? Math.round((d.size[0] + d.size[1]) / 2) : d.size[0]); e.ref = C.nextRef(camp); camp.army.entries.push(e);
      lines.push(e.models + ' ' + d.name + ' join the warband.');
    }
    if (effect.disciplineAll) { camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.discMod = (t.discMod || 0) + effect.disciplineAll; }); lines.push('All units: ' + (effect.disciplineAll > 0 ? '+' : '') + effect.disciplineAll + ' Discipline.'); }
    if (effect.commanderWounds) { camp.army.entries[0].extraWounds = (camp.army.entries[0].extraWounds || 0) + effect.commanderWounds; lines.push('Your commander feels blessed: +' + effect.commanderWounds + ' Wound.'); }
    if (effect.loseModelsPct) { camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id); if (def.per) t.models = Math.max(1, t.models - Math.ceil(t.models * effect.loseModelsPct)); }); lines.push('Every unit loses some of its number.'); }
    if (effect.grantProp) { var cands = camp.army.entries.filter(function (e) { var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id); return def.props.indexOf(effect.grantProp) < 0 && (t.extraProps || []).indexOf(effect.grantProp) < 0 && def.type.indexOf('Infantry') === 0; }); if (cands.length) { var pick = R.pick(cands), tt = pick.kind === 'commander' ? pick.retinue : pick; tt.extraProps = (tt.extraProps || []).concat([effect.grantProp]); lines.push(SOVL.findUnitDef(camp.faction, tt.id).name + ' now has ' + effect.grantProp + '.'); } else lines.push('No unit could use the armour.'); }
    if (effect.randomItem) { var it = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === 'item'; })); var err0 = C.buy(camp, { kind: 'item', item: it, price: 0 }); lines.push(err0 ? 'The item is useless to your commander.' : 'Your commander receives ' + it.name + '.'); }
    if (effect.randomWeapon) { var wp = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === 'weapon'; })); var err1 = C.buy(camp, { kind: 'item', item: wp, price: 0 }); lines.push(err1 ? 'Your commander cannot wield it; it is sold for 60 gold.' : 'Your commander takes up ' + wp.name + '.'); if (err1) camp.gold += 60; }
    if (effect.recruitMachine) { var f2 = SOVL.FACTION_DATA[camp.faction], machines = []; f2.sections.forEach(function (s) { s.units.forEach(function (u) { if (u.type === 'War Machine') machines.push(u); }); }); if (machines.length) { var md = R.pick(machines), me = A.defaultEntry(camp.faction, md.id, 1); me.ref = C.nextRef(camp); camp.army.entries.push(me); lines.push('A ' + md.name + ' joins the column.'); } else lines.push('Your people have no use for such a machine.'); }
    if (effect.traitOffer) { camp.pendingTrait = true; lines.push('Your commander may learn a new trait.'); }
    if (effect.trainOne) { var best = camp.army.entries[0]; C.camp(camp, 'train', best); lines.push(SOVL.findUnitDef(camp.faction, best.retinue.id).name + ' gains a veterancy rank.'); }
    if (effect.healAll) { camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id); if (def.per) t.models = Math.min(def.size[1], Math.max(t.models, t.maxSeen || def.size[0])); }); lines.push('All units are back to strength.'); }
    if (effect.reputation) camp.reputation += effect.reputation;
    return lines;
  };
  C.treasure = function (camp) {
    var roll = R.rng();
    if (roll < 0.6) { var g = 40 + Math.floor(R.rng() * 60) + camp.act * 30; camp.gold += g; return 'A buried strongbox: +' + g + ' gold.'; }
    var it = R.pick(SOVL.MAGIC_ITEMS); var err = C.buy(camp, { kind: 'item', item: it, price: 0 });
    if (err) { camp.gold += 60; return 'An old relic nobody can use. Sold for 60 gold.'; }
    return 'You find ' + it.name + ' (' + it.desc + ').';
  };

  // Build the player's battle army from the campaign (applies campaign-only modifiers)
  C.battleArmy = function (camp) {
    var army = JSON.parse(JSON.stringify(camp.army));
    army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.maxSeen = Math.max(t.maxSeen || 0, t.models); });
    camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; t.maxSeen = Math.max(t.maxSeen || 0, t.models); });
    return army;
  };
  C.save = function (camp) { try { localStorage.setItem('fantasy_battle_campaign', JSON.stringify(camp)); } catch (e) {} };
  C.load = function () { try { var s = localStorage.getItem('fantasy_battle_campaign'); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  C.clear = function () { try { localStorage.removeItem('fantasy_battle_campaign'); } catch (e) {} };
  SOVL.Campaign = C;
})();
