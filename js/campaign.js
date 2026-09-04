// Trail of Death: a procedural roguelite campaign.
'use strict';
(function () {
  var R = SOVL.R, A = SOVL.Army, C = {};
  var NODE_TYPES = ['battle', 'battle', 'battle', 'elite', 'event', 'event', 'merchant', 'camp', 'treasure'];

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
    picks.forEach(function (d, i) { var e = A.defaultEntry(fid, d.id, d.size[0]); e.ref = 'u' + (i + 2); army.entries.push(e); });
    var camp = {
      version: 1, faction: fid, commanderName: name, army: army, gold: SOVL.CAMPAIGN.startGold, act: 0, layer: 0, nodeIndex: null,
      map: C.generateMap(), battles: 0, wins: 0, kills: 0, refCounter: 10, log: [], reputation: 0, items: [], over: false, victory: false, seed: Math.floor(R.rng() * 1e9)
    };
    camp.log.push('The trail begins. ' + name + ' leads a ragtag warband of ' + army.entries.length + ' units.');
    return camp;
  };
  C.nextRef = function (camp) { camp.refCounter++; return 'u' + camp.refCounter; };

  // Map: for each act, a list of layers; each layer a list of nodes {type, next:[indices in next layer]}
  C.generateMap = function () {
    var acts = SOVL.CAMPAIGN.acts.map(function (actDef, ai) {
      var layers = [];
      for (var l = 0; l < actDef.layers; l++) {
        var n = l === 0 ? 2 : (l === actDef.layers - 1 ? 1 : 2 + Math.floor(R.rng() * 2)), layer = [];
        for (var i = 0; i < n; i++) {
          var type;
          if (l === actDef.layers - 1) type = 'boss';
          else if (l === 0) type = 'battle';
          else if (l === actDef.layers - 2) type = R.pick(['camp', 'merchant', 'camp']);
          else type = R.pick(NODE_TYPES);
          layer.push({ type: type, next: [], id: ai + '-' + l + '-' + i, visited: false });
        }
        // make sure a layer isn't all events/shops
        if (l > 0 && l < actDef.layers - 2 && layer.every(function (nd) { return nd.type !== 'battle' && nd.type !== 'elite'; })) layer[0].type = 'battle';
        layers.push(layer);
      }
      // connections: each node connects to 1-2 nodes in the next layer; ensure every next node reachable
      for (var l2 = 0; l2 < layers.length - 1; l2++) {
        var cur = layers[l2], nxt = layers[l2 + 1];
        cur.forEach(function (nd, i) {
          var a = Math.floor(i * nxt.length / cur.length), b = Math.min(nxt.length - 1, Math.floor((i + 1) * nxt.length / cur.length));
          nd.next.push(a); if (b !== a && R.rng() < 0.7) nd.next.push(b);
          if (R.rng() < 0.35) { var c = Math.floor(R.rng() * nxt.length); if (nd.next.indexOf(c) < 0 && Math.abs(c - a) <= 1) nd.next.push(c); }
          nd.next.sort();
        });
        nxt.forEach(function (n2, j) { if (!cur.some(function (nd) { return nd.next.indexOf(j) >= 0; })) cur[Math.min(cur.length - 1, j)].next.push(j); });
        cur.forEach(function (nd) { nd.next = nd.next.filter(function (v, k, arr) { return arr.indexOf(v) === k; }).sort(); });
      }
      return { name: actDef.name, layers: layers, boss: actDef.boss };
    });
    return { acts: acts };
  };

  C.currentAct = function (camp) { return camp.map.acts[camp.act]; };
  C.availableNodes = function (camp) {
    var act = C.currentAct(camp);
    if (camp.nodeIndex == null) return act.layers[0].map(function (n, i) { return i; });
    if (camp.layer >= act.layers.length - 1) return [];
    return act.layers[camp.layer][camp.nodeIndex].next;
  };
  C.nodeAt = function (camp, layer, idx) { return C.currentAct(camp).layers[layer][idx]; };

  // Enemy army for a node
  C.enemyArmyFor = function (camp, node, kind) {
    var actDef = SOVL.CAMPAIGN.acts[camp.act], t = camp.layer / Math.max(1, actDef.layers - 1);
    var pts = Math.round(actDef.pts[0] + (actDef.pts[1] - actDef.pts[0]) * t);
    // scale a little with the player's own strength so the run stays fair
    var own = A.armyCost(camp.army);
    pts = Math.round(pts * 0.7 + Math.min(own * 0.8, pts * 1.5) * 0.3);
    var type = kind || node.type, fids = Object.keys(SOVL.FACTION_DATA), fid;
    if (type === 'small') { pts = Math.round(pts * 0.6); }
    if (type === 'undead') { fid = 'dead_nations'; pts = Math.round(pts * 0.9); }
    if (type === 'elite') pts = Math.round(pts * actDef.elitePts);
    if (type === 'boss') { pts = Math.round(Math.min(actDef.boss.pts, Math.max(actDef.boss.pts * 0.6, own * 1.25))); fid = camp.act === 2 ? 'dead_nations' : null; }
    else pts = Math.min(pts, Math.round(own * 1.4 + 50)); // never wildly larger than the player's own army
    if (!fid) { var others = fids.filter(function (f) { return f !== camp.faction; }); fid = R.rng() < 0.85 ? R.pick(others) : camp.faction; }
    var army = A.randomArmy({ faction: fid, pts: Math.max(150, pts), boss: type === 'boss', name: type === 'boss' ? actDef.boss.name : undefined });
    army.pts = pts; army.kind = type;
    return army;
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
    var lines = [];
    if ((!won && !draw) || !cmdAlive) {
      camp.over = true;
      lines.push(cmdAlive ? 'The battle is lost. The trail ends here.' : camp.commanderName + ' has fallen. The trail ends here.');
      camp.log = camp.log.concat(lines);
      return { won: false, lines: lines };
    }
    if (won) camp.wins++; else lines.push('A bloody stalemate. Both armies withdraw; there is no plunder, but the trail goes on.');
    // casualties: half of lost models return (wounded); destroyed units are gone; routed units return at half
    var newEntries = [];
    camp.army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, u = refs[t.ref], def = SOVL.findUnitDef(camp.faction, t.id);
      if (!u) { newEntries.push(e); return; }
      var lost = u.maxModels - Math.max(0, u.models), back = Math.floor(lost / 2);
      var survivors = Math.max(0, u.models) + back;
      if (u.removed && u.removedHow !== 'fled') { survivors = e.kind === 'commander' ? Math.max(0, back) : 0; }
      if (u.removed && u.removedHow === 'fled') survivors = Math.max(survivors, Math.floor(u.maxModels / 2));
      camp.kills += 0;
      if (def.per) {
        if (survivors < Math.max(1, Math.floor(def.size[0] / 2)) && e.kind !== 'commander') { lines.push(def.name + ' has been wiped out.'); return; }
        t.models = Math.max(e.kind === 'commander' ? 1 : 1, Math.min(def.size[1], survivors));
        if (lost) lines.push(def.name + ': lost ' + lost + ', ' + back + ' wounded return. Now ' + t.models + ' strong.');
      } else if (u.removed && e.kind !== 'commander') { lines.push(def.name + ' has been destroyed.'); return; }
      // veterancy
      t.battles = (t.battles || 0) + 1;
      var vt = SOVL.CAMPAIGN.veteran, newVet = 0; for (var i = 0; i < vt.length; i++) if (t.battles >= vt[i].at) newVet = i + 1;
      if (newVet > (t.vet || 0)) { t.vet = newVet; lines.push(def.name + ' is now ' + vt[newVet - 1].name + '!'); }
      if (e.kind === 'commander') { e.battles = (e.battles || 0) + 1; var cv = 0; for (var j = 0; j < vt.length; j++) if (e.battles >= vt[j].at) cv = j + 1; if (cv > (e.vet || 0)) { e.vet = cv; lines.push(e.name + ' is now ' + vt[cv - 1].name + '!'); } }
      newEntries.push(e);
    });
    camp.army.entries = newEntries;
    var gold = won ? C.goldReward(camp, enemyArmy, node) : 0;
    if (gold) { camp.gold += gold; lines.push('Plunder: +' + gold + ' gold.'); }
    battle.dead.filter(function (u) { return u.side === 1; }).forEach(function (u) { camp.kills += u.killed; });
    if (!won && node && node.type === 'boss') { camp.over = true; lines.push('A stalemate is not enough against ' + (SOVL.CAMPAIGN.acts[camp.act].boss.name) + '. The trail ends here.'); camp.log = camp.log.concat(lines); return { won: false, lines: lines }; }
    camp.log = camp.log.concat(lines);
    return { won: true, draw: draw, lines: lines, gold: gold };
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

  // ---- Merchant ----
  C.merchantStock = function (camp) {
    var f = SOVL.FACTION_DATA[camp.faction], stock = [], sections = f.sections.filter(function (s) { return s.name !== 'Commanders' && s.name !== 'Mounts'; });
    var pool = []; sections.forEach(function (s) { s.units.forEach(function (u) { pool.push({ def: u, section: s }); }); });
    R.shuffle(pool).slice(0, 4).forEach(function (p) {
      var models = p.def.per ? p.def.size[0] : 1, e = A.defaultEntry(camp.faction, p.def.id, models);
      stock.push({ kind: 'unit', entry: e, section: p.section.name, price: Math.round(A.unitCost(camp.faction, e) * 1.2) + 10 });
    });
    R.shuffle(SOVL.MAGIC_ITEMS.slice()).slice(0, 2).forEach(function (it) { stock.push({ kind: 'item', item: it, price: it.cost * 2 + 20 }); });
    R.shuffle(SOVL.BANNERS.slice()).slice(0, 2).forEach(function (bn) { stock.push({ kind: 'banner', banner: bn, price: bn.cost * 2 + 10 }); });
    return stock;
  };
  C.reinforceCost = function (camp, entry) {
    var t = entry.kind === 'commander' ? entry.retinue : entry, def = SOVL.findUnitDef(camp.faction, t.id);
    if (!def.per || t.models >= def.size[1]) return null;
    return Math.round((def.cost + A.optionCost(def, t.weapon)) * 1.5) + 2;
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
    } else if (offer.kind === 'banner') {
      var target = null;
      camp.army.entries.forEach(function (en) { var t = en.kind === 'commander' ? en.retinue : en, def = SOVL.findUnitDef(camp.faction, t.id); if (!target && def.banner && def.banner >= offer.banner.cost && !t.banner) target = t; });
      if (!target) return 'No unit can carry that banner.';
      target.banner = offer.banner.id;
    }
    camp.gold -= offer.price; offer.sold = true;
    return null;
  };
  C.reinforce = function (camp, entry) {
    var cost = C.reinforceCost(camp, entry); if (cost == null) return 'Unit is at full strength.';
    if (camp.gold < cost) return 'Not enough gold.';
    var t = entry.kind === 'commander' ? entry.retinue : entry; t.models++; camp.gold -= cost; return null;
  };
  // ---- Camp ----
  C.camp = function (camp, choice, entry) {
    if (choice === 'rest') {
      camp.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id); if (def.per) { var full = Math.max(t.models, t.maxSeen || def.size[0]); t.models = Math.min(def.size[1], Math.max(t.models, Math.min(full, t.models + Math.ceil(def.size[0] / 2)))); } });
      return 'The army rests. Wounded return to the ranks.';
    }
    if (choice === 'train' && entry) { var t = entry.kind === 'commander' ? entry.retinue : entry; t.vet = Math.min(3, (t.vet || 0) + 1); return SOVL.findUnitDef(camp.faction, t.id).name + ' drills hard and gains a veterancy rank.'; }
    return null;
  };
  // ---- Events ----
  C.randomEvent = function (camp) {
    var pool = SOVL.CAMPAIGN.events.filter(function (e) { return (camp.seenEvents || []).indexOf(e.id) < 0; });
    if (!pool.length) pool = SOVL.CAMPAIGN.events;
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
    if (effect.randomItem) { var it = R.pick(SOVL.MAGIC_ITEMS); C.buy(camp, { kind: 'item', item: it, price: 0 }); lines.push('Your commander receives ' + it.name + '.'); }
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
  C.save = function (camp) { try { localStorage.setItem('sovl_campaign', JSON.stringify(camp)); } catch (e) {} };
  C.load = function () { try { var s = localStorage.getItem('sovl_campaign'); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  C.clear = function () { try { localStorage.removeItem('sovl_campaign'); } catch (e) {} };
  SOVL.Campaign = C;
})();
