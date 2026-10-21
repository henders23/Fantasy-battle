// Headless tests for the Broken March (js/conquest.js): the map, a new campaign, recruiting,
// movement, battles fought out by the AI, the other powers' turns, the story, saving, and whole
// campaigns played by a simple bot to check that they can be won and lost and always finish.
// Run: node test/conquest.js [campaigns] [seed]
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { window: {}, console: console, Math: Math, JSON: JSON };
vm.createContext(ctx);
['data.js', 'data_units.js', 'geom.js', 'rules.js', 'battle.js', 'army.js', 'ai.js', 'biomes.js', 'campaign.js', 'conquest-data.js', 'conquest.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
});
var SOVL = ctx.window.SOVL, R = SOVL.R, K = SOVL.Conquest, D = SOVL.CONQUEST, A = SOVL.Army;
var failures = 0, checks = 0;
function check(c, msg) { checks++; if (!c) { failures++; console.error('FAIL: ' + msg); } }

// ---- the map ----
var g = K.geometry();
check(Object.keys(g.cells).length === D.provinces.length, 'a cell for every province');
K.ids.forEach(function (id) {
  check(g.adj[id].length >= 2, id + ' has at least two neighbours');
  g.adj[id].forEach(function (n) { check(g.adj[n].indexOf(id) >= 0, 'adjacency is mutual: ' + id + '/' + n); });
  check(g.cells[id].path.length > 8, id + ' has a ragged border');
});
// every province can be reached from Harrowgate
var seen = { harrowgate: 1 }, q = ['harrowgate'];
while (q.length) K.adj(q.shift()).forEach(function (n) { if (!seen[n]) { seen[n] = 1; q.push(n); } });
check(Object.keys(seen).length === K.ids.length, 'the whole map is connected');

// ---- a new campaign ----
R.setSeed(7);
var s = K.create();
check(K.owned(s, 'player').join() === 'oxley,harrowsend,harrowgate', 'you start with Harrowgate, Oxley and Harrow\'s End');
check(K.armiesOf(s, 'player').length === 1 && K.armiesOf(s, 'player')[0].hero, 'one army, the Warden\'s');
check(K.armiesOf(s, 'rebels').length === 2 && K.armiesOf(s, 'greenskins').length === 2 && K.armiesOf(s, 'dead').length === 1, 'the lords\' armies are on the map');
['ottokar', 'gorrak', 'vorhal'].forEach(function (l) { check(s.armies.some(function (a) { return a.lord === l && K.leaderName(a) === D.lords[l].name; }), l + ' leads his own army'); });
check(K.income(s).income === 95 && K.income(s).net === 85, 'income 95 less upkeep 10: ' + K.income(s).net);
var hero = K.armiesOf(s, 'player')[0];
check(K.nextScene(s) && K.nextScene(s).id === 'opening', 'the opening scene plays first');
K.choose(s, K.nextScene(s), 0);
check(!K.nextScene(s), 'nothing else waits on turn 1');

// recruiting in Harrowgate
var offers = K.recruitOffers(s, hero.id);
check(offers.length >= 6 && offers.every(function (o) { return o.price > 0; }), 'Harrowgate offers recruits');
check(!offers.some(function (o) { return o.id === 'imperial_knights' || o.id === 'imperial_cannon'; }), 'no knights or cannon before the stud farms and forges are held');
var gold0 = s.gold, err = K.recruit(s, hero.id, 'imperial_halberd');
check(!err && s.gold < gold0 && hero.army.entries.length === 5, 'recruit halberdiers: ' + err);
check(K.hireBlock(s, 'harrowgate') && /already/.test(K.hireBlock(s, 'harrowgate')), 'only one army per town');
// movement: through your own land, one step into anyone else's
var reach = K.reach(s, hero.id);
check(reach.oxley && reach.oxley.kind === 'move' && reach.harrowsend.kind === 'move', 'march through your own provinces');
check(reach.fenwick && reach.fenwick.kind === 'attack', 'attack a neighbouring province');
check(reach.elderglade && reach.elderglade.kind === 'visit', 'the Elder Glade is visited, not attacked');
check(reach.kingsmeadow && reach.kingsmeadow.kind === 'attack' && reach.kingsmeadow.from === 'oxley', 'attack from a province you march through');
check(!reach.highmoor, 'Highmoor is out of reach');
// a battle fought out
var spec = K.attackSpec(s, hero.id, 'fenwick');
check(spec && spec.defender.power === 'neutral' && !spec.defender.army, 'Fenwick is held by its garrison');
var setup = K.battleSetup(s, spec);
check(setup.armies[0].faction === 'empires_of_men' && setup.names[0] === 'Captain Aldric' && setup.biome === 'borderlands', 'you are side 0 on Fenwick\'s field');
var t0 = Date.now(), b = K.autoresolve(s, spec);
check(b.phase === 'end' && b.result, 'the battle is fought to the end (' + (Date.now() - t0) + ' ms)');
var rep = K.resolve(s, spec, b, 'auto');
check(rep.lines.length && (rep.winner === 'attacker' ? s.provinces.fenwick.owner === 'player' && hero.at === 'fenwick' : hero.at === 'harrowgate'), 'the result moves the army and the border: ' + rep.lines[0]);
check(hero.moves === 0, 'fighting ends the army\'s march');
// hire a second army
s.gold += 300;
var hb = K.hireBlock(s, 'harrowgate');
if (hero.at === 'harrowgate') { K.move(s, hero.id, 'oxley'); }
check(!K.hireBlock(s, 'harrowgate') || hero.at === 'harrowgate', 'Harrowgate free to raise an army');
if (!K.hireBlock(s, 'harrowgate')) { err = K.hire(s, 'harrowgate', 'captain'); check(!err && K.armiesOf(s, 'player').length === 2, 'hire a captain: ' + err); }
// the other powers move
K.endTurn(s);
check(s.phase === 'enemy', 'the enemy phase begins');
var guard = 0, step;
do { step = K.stepEnemy(s); if (step.kind === 'battle') { K.resolvePending(s, K.autoresolve(s, step.spec), 'auto'); } } while (step.kind !== 'done' && guard++ < 50);
check(step.kind === 'done' && s.turn === 2 && s.phase === 'player', 'turn 2 begins');
check(K.nextScene(s) && K.nextScene(s).id === 'letter', 'Ottokar\'s letter arrives on turn 2');
K.choose(s, K.nextScene(s), 1);
check(s.stances.rebels && s.stances.rebels.kind === 'truce', 'stalling buys a truce');
// saving round-trips through JSON
var copy = JSON.parse(JSON.stringify(s));
check(copy.turn === s.turn && copy.armies.length === s.armies.length && K.reach(copy, copy.armies[0].id), 'the campaign survives a save');

// ---- the story's branches ----
function fresh(seed) { R.setSeed(seed); var s = K.create(); K.choose(s, K.nextScene(s), 0); return s; }
// Dunmar: the promise kept
s = fresh(11); s.turn = 3;
var plea = K.nextScene(s); check(plea && plea.id === 'dunmar_plea', 'turn 3: the dwarf rider');
K.choose(s, plea, 0); check(s.quests.dunmar && s.quests.dunmar.state === 'open' && s.quests.dunmar.until === 10, 'the promise to clear the canyons is recorded');
s.provinces.vulture.owner = 'player';
var won = K.nextScene(s); check(won && won.id === 'dunmar_won', 'clearing the canyons brings the Thane');
K.choose(s, won, 1); check(s.provinces.dunmar.owner === 'player' && s.flags.dunmar && K.unlocks(s).forge, 'Dunmar joins the March, forges and all');
check(K.recruitPool(s, 'harrowgate').indexOf('imperial_cannon') >= 0, 'war machines can be recruited once the forges are yours');
// Dunmar: the promise broken
s = fresh(12); s.turn = 3; K.choose(s, K.nextScene(s), 0); s.turn = 11;
var lost = K.nextScene(s); check(lost && lost.id === 'dunmar_lost', 'the gate stays shut after turn 10');
K.choose(s, lost, 0); check(s.quests.dunmar.state === 'failed', 'the promise is marked broken');
// parleys
s = fresh(13); var hero = K.armiesOf(s, 'player')[0];
var amb = { kind: 'visit', id: 'visit_ambergate', scene: K.visitScene(s, 'ambergate') };
s.gold = 50; var refused = K.choose(s, amb, 0, { army: hero.id, province: 'ambergate', from: 'harrowsend' });
check(refused.refused && s.provinces.ambergate.owner === 'neutral', 'Ambergate will not join for gold you do not have');
s.gold = 400; K.choose(s, amb, 0, { army: hero.id, province: 'ambergate', from: 'harrowsend' });
check(s.provinces.ambergate.owner === 'player' && s.gold === 200 && K.unlocks(s).market && hero.moves === 0, 'Ambergate joins for 200 gold; the market opens; the parley ends the march');
var glade = { kind: 'visit', id: 'visit_elves', scene: K.visitScene(s, 'elderglade') };
var fell = K.choose(s, glade, 1, { army: hero.id, province: 'elderglade', from: 'harrowgate' });
check(fell.battle && fell.battle.province === 'elderglade' && fell.battle.onWin.flag === 'gladeBurned' && s.flags.hostile_elderglade, 'felling the wood means a battle with the elves');
check(K.reach(s, hero.id).elderglade === undefined || K.reach(s, hero.id).elderglade.kind !== 'visit', 'after that the Glade is attacked, not visited');
// the Unburied King wakes
s = fresh(14); s.turn = 7; s.fired.push('letter', 'dunmar_plea');
var wake = K.nextScene(s); check(wake && wake.id === 'barrow_lights', 'turn 7: the barrow-lights');
K.choose(s, wake, 0);
check(s.flags.deadAwake === 7 && s.lords.vorhal === 'active' && K.armiesOf(s, 'dead').length === 2, 'the dead wake and the Barrow Legion rises');
s = fresh(15); s.flags.gladeBurned = true; s.turn = 5; s.fired.push('letter', 'dunmar_plea');
check(K.nextScene(s) && K.nextScene(s).id === 'barrow_lights', 'burning the Glade wakes them two turns sooner');
// Gorrak: unleashed, or paying tribute
['unleashed', 'tribute', 'slain'].forEach(function (fate, i) {
  var t = fresh(20 + i); t.turn = 9; t.fired.push('letter', 'dunmar_plea', 'barrow_lights'); t.flags.deadAwake = 1;
  t.provinces.redfang.garrison.entries = []; t.armies = t.armies.filter(function (a) { return a.power !== 'greenskins' || !a.lord; });
  var h = K.armiesOf(t, 'player')[0]; h.at = 'vulture'; t.provinces.vulture.owner = 'player'; h.moves = 2;
  var sp = K.attackSpec(t, h.id, 'redfang'); check(sp && K.unopposed(t, sp), fate + ': an empty Redfang Hold');
  K.occupy(t, sp); var sc = K.nextScene(t); check(sc && sc.kind === 'fall' && sc.power === 'greenskins', fate + ': Gorrak brought before the Warden');
  K.choose(t, sc, i === 0 ? 1 : i === 1 ? 2 : 0);
  var orders = K.planEnemy(t).filter(function (o) { var a = K.army(t, o.army); return a && a.power === 'greenskins' && o.kind === 'attack' && t.provinces[o.to].owner === 'player'; });
  if (fate === 'slain') check(K.armiesOf(t, 'greenskins').length === 0 && K.owned(t, 'greenskins').length === 0, 'slain: the tribes scatter');
  else check(orders.length === 0 && K.owned(t, 'greenskins').length > 0, fate + ': the tribes keep their lands and leave you alone');
  if (fate === 'tribute') check(K.income(t).lines.some(function (l) { return /tribute/.test(l.label) && l.gold === 40; }), 'tribute: 40 gold a turn');
});
// a province's levy regrows by regiment, never past a regiment's size
s = fresh(16); var lv = s.provinces.harrowgate.garrison; lv.entries.splice(0, 1); lv.entries[0].models = 5;
K.endTurn(s); var st0; do { st0 = K.stepEnemy(s); if (st0.kind === 'battle') K.resolvePending(s, K.autoresolve(s, st0.spec), 'auto'); } while (st0.kind !== 'done');
var ok = lv.entries.every(function (e) { var d = SOVL.findUnitDef('empires_of_men', e.id); return e.models <= d.size[1]; });
check(ok && lv.entries.length === K.levyBase(s, 'harrowgate').length, 'the levy regrows by regiment within each regiment\'s size');
// the end of the year
s = fresh(17); s.turn = D.maxTurns; s.fired.push('letter', 'dunmar_plea', 'barrow_lights', 'snow'); s.flags.deadAwake = 1;
K.endTurn(s); do { st0 = K.stepEnemy(s); if (st0.kind === 'battle') K.resolvePending(s, K.autoresolve(s, st0.spec), 'auto'); } while (st0.kind !== 'done');
check(s.over && s.timeUp && s.result === 'lost' && /Winter closes/.test(K.epilogue(s)[0]), 'winter ends the year; a poor showing is a loss: ' + K.epilogue(s)[0].slice(0, 40));

// ---- whole campaigns played by a bot ----
// the province within this turn's reach that is closest (through your lands) to one meeting goal
function towards(s, a, goal, reach) {
  if (goal(a.at)) return a.at;
  var dist = {}, q = [], best = null;
  K.owned(s, 'player').forEach(function (id) { if (goal(id)) { dist[id] = 0; q.push(id); } });
  while (q.length) { var c = q.shift(); K.adj(c).forEach(function (n) { if (dist[n] == null && s.provinces[n].owner === 'player') { dist[n] = dist[c] + 1; q.push(n); } }); }
  Object.keys(reach).forEach(function (id) { if (reach[id].kind === 'move' && dist[id] != null && (dist[a.at] == null || dist[id] < dist[a.at]) && (!best || dist[id] < dist[best])) best = id; });
  return best;
}
function botTurn(s, opts) {
  var lines = 0;
  for (var sc = K.nextScene(s), n = 0; sc && n < 10; sc = K.nextScene(s), n++) {
    var pick = sc.kind === 'fall' ? (opts.mercy ? 1 : 0) : sc.scene.choices.length > 1 && opts.choices ? Math.floor(R.rng() * sc.scene.choices.length) : sc.id === 'letter' ? 1 : 0;
    K.choose(s, sc, pick);
  }
  if (s.over) return;
  s.pendingTraits.slice().forEach(function (id) { var c = K.traitChoices(s, id); K.learnTrait(s, id, c[0]); });
  K.armiesOf(s, 'player').forEach(function (a) {
    // recruit and refill where possible
    if (K.canRecruit(s, a.at)) {
      a.army.entries.forEach(function (e) { var c = K.refillCost(s, a, e); if (c && s.gold > 120 + c.price) K.refill(s, a.id, e.kind === 'commander' ? e.retinue.ref : e.ref); });
      for (var k = 0; k < 3; k++) {
        var offers = K.recruitOffers(s, a.id).filter(function (o) { return !o.why && o.price < s.gold - 40; }).sort(function (x, y) { return y.price - x.price; });
        if (!offers.length || a.army.entries.length >= D.armyCap) break;
        K.recruit(s, a.id, offers[Math.floor(R.rng() * Math.min(3, offers.length))].id);
      }
    }
  });
  // raise another army
  K.owned(s, 'player').forEach(function (id) { if (!K.hireBlock(s, id) && s.gold > (K.armiesOf(s, 'player').length < 2 ? 220 : 380) && s.turn >= 3) K.hire(s, id, R.pick(['captain', 'imperial_wizard'])); });
  if (s.gold > 200) K.owned(s, 'player').forEach(function (id) { if (opts.fortify && (id === 'harrowgate' || K.adj(id).some(function (n) { var o = s.provinces[n].owner; return o === 'greenskins' || o === 'rebels' || o === 'dead'; })) && !K.fortifyBlock(s, id) && s.gold > 200) K.fortify(s, id); });
  K.armiesOf(s, 'player').forEach(function (a) {
    if (!K.army(s, a.id) || s.over) return;
    var reach = K.reach(s, a.id), my = K.pts(a.army), best = null;
    Object.keys(reach).forEach(function (id) {
      var r = reach[id];
      if (r.kind === 'visit') {
        var vs = K.visitScene(s, id);
        if (vs && (id === 'elderglade' || (id === 'ambergate' && s.gold >= 200) || (id === 'dunmar' && s.gold >= 150 && !K.unlocks(s).forge))) best = best || { id: id, visit: true, score: 5 };
        return;
      }
      if (r.kind !== 'attack') return;
      var dp = Math.max(40, K.defenderPts(s, id)), ratio = my / dp;
      if (ratio < opts.nerve) return;
      var score = ratio + K.prov(id).income / 20 + (K.has(id, 'seat') ? 3 : 0);
      if (!best || score > best.score) best = { id: id, score: score };
    });
    // the first army raised after the Warden's guards the capital and the provinces around it
    var armies = K.armiesOf(s, 'player'), guardian = opts.guard && armies.length >= 2 && armies[1] === a;
    if (guardian) {
      var nearHome = function (id) { return id === 'harrowgate' || K.adj('harrowgate').indexOf(id) >= 0; };
      var homeTargets = Object.keys(reach).filter(function (id) { return reach[id].kind === 'attack' && nearHome(id) && K.pts(a.army) >= K.defenderPts(s, id) * opts.nerve; });
      if (homeTargets.length) { var sp = K.attackSpec(s, a.id, homeTargets[0]); if (K.unopposed(s, sp)) K.occupy(s, sp); else K.resolve(s, sp, K.autoresolve(s, sp), 'auto'); return; }
      if (a.at !== 'harrowgate' && reach.harrowgate) K.move(s, a.id, 'harrowgate');
      return;
    }
    // defend a province of yours that an enemy army is about to take
    function threat(id) { return K.adj(id).some(function (n) { var e = K.armyAt(s, n); return e && e.power !== 'player' && e.power !== 'neutral' && K.pts(e.army) > K.defenderPts(s, id) * 0.9; }); }
    if (threat(a.at) && a.at === 'harrowgate' && !best) return;
    var guard = Object.keys(reach).filter(function (id) { return reach[id].kind === 'move' && threat(id) && id === 'harrowgate'; })[0];
    if (guard && opts.defend) { K.move(s, a.id, guard); return; }
    // hurt: go and rest in a town
    var str = 0, full = 0; a.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; str += t.models; full += Math.max(t.models, t.maxSeen || 0); });
    if (opts.rest && str < full * 0.7) { var town = Object.keys(reach).filter(function (id) { return reach[id].kind === 'move' && K.canRecruit(s, id); })[0]; if (town) K.move(s, a.id, town); return; }
    if (!best) {
      // nothing worth attacking: go and recruit if the army is small or hurt, else close on the weakest enemy province
      var small = a.army.entries.length < 7 && s.gold > 150, goal = null;
      if (small || (opts.rest && str < full * 0.85)) goal = function (id) { return K.canRecruit(s, id); };
      else goal = function (id) { return K.adj(id).some(function (n) { var o = s.provinces[n].owner; return o !== 'player' && !K.prov(n).special && K.defenderPts(s, n) * opts.nerve < my * 1.3; }); };
      var step = towards(s, a, goal, reach);
      if (step && step !== a.at) K.move(s, a.id, step);
      return;
    }
    if (best.visit) {
      var sc = { kind: 'visit', id: 'visit_' + best.id, scene: K.visitScene(s, best.id) }, idx = 0;
      var out = K.choose(s, sc, idx, { army: a.id, province: best.id, from: reach[best.id].from });
      a.moves = 0;
      return;
    }
    var spec = K.attackSpec(s, a.id, best.id);
    if (K.unopposed(s, spec)) { K.occupy(s, spec); return; }
    K.resolve(s, spec, K.autoresolve(s, spec), 'auto');
  });
  if (s.over) return;
  K.endTurn(s);
  var guard = 0, step;
  do { step = K.stepEnemy(s); if (step.kind === 'battle') K.resolvePending(s, K.autoresolve(s, step.spec), 'auto'); } while (step.kind !== 'done' && guard++ < 80);
  if (step.kind !== 'done') { check(false, 'enemy phase did not finish'); }
}
function playCampaign(seed, opts) {
  R.setSeed(seed);
  var s = K.create({ difficulty: opts.difficulty }), t0 = Date.now(), turns = 0, fallTurn = {};
  while (!s.over && turns++ < 40) {
    var before = s.fallen.slice();
    botTurn(s, opts);
    s.fallen.forEach(function (p) { if (before.indexOf(p) < 0) fallTurn[p] = s.turn; });
    // invariants
    s.armies.forEach(function (a) {
      check(a.army.entries.length > 0 || false, 'army with no units left on the map: ' + a.name);
      check(s.provinces[a.at] && (s.provinces[a.at].owner === a.power), 'army ' + a.name + ' stands in its own province (' + a.at + ' is ' + (s.provinces[a.at] && s.provinces[a.at].owner) + ')');
    });
    check(s.gold >= 0, 'gold never negative');
  }
  check(s.over, 'the campaign ends (seed ' + seed + ')');
  return { result: s.result, turn: s.turn, fallTurn: fallTurn, stats: s.stats, provinces: K.owned(s, 'player').length, armies: K.armiesOf(s, 'player').length, gold: s.gold, ms: Date.now() - t0, fates: s.fates, awake: !!s.flags.deadAwake };
}
var runs = parseInt(process.argv[2] || '6', 10), seed0 = parseInt(process.argv[3] || '1', 10), tally = {}, rows = [];
for (var i = 0; i < runs; i++) {
  var r = playCampaign(seed0 + i, { nerve: 1.2, choices: i % 2 === 1, mercy: i % 3 === 1, fortify: i % 2 === 0, defend: true, rest: true, guard: true, difficulty: process.argv[4] || 'normal' });
  tally[r.result] = (tally[r.result] || 0) + 1; rows.push(r);
  console.log('campaign ' + (seed0 + i) + ': ' + r.result + ' on turn ' + r.turn + ' · lords fallen ' + JSON.stringify(r.fallTurn) + ' · ' + r.stats.battles + ' battles (' + r.stats.won + ' won, ' + r.stats.lost + ' lost) · ' + r.provinces + ' provinces · ' + r.armies + ' armies · ' + r.gold + ' gold · ' + (r.ms / 1000).toFixed(1) + ' s');
}
console.log('results', JSON.stringify(tally));
console.log(checks + ' checks, ' + failures + ' failures');
if (failures) { console.log('CONQUEST TEST FAILED'); process.exit(1); }
console.log('CONQUEST TEST OK');
