// Headless test harness: loads the game scripts into a fake window and runs
// rules unit tests plus AI-vs-AI battles across all factions.
// Run: node test/sim.js [games] [seed]
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { window: {}, console: console, Math: Math };
ctx.window.SOVL = undefined;
vm.createContext(ctx);
['data.js', 'data_units.js', 'geom.js', 'rules.js', 'battle.js', 'army.js', 'ai.js', 'campaign.js'].forEach(function (f) {
  var p = path.join(__dirname, '..', 'js', f);
  if (!fs.existsSync(p)) return;
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
});
var SOVL = ctx.window.SOVL, R = SOVL.R, G = SOVL.G, A = SOVL.Army;
var failures = 0;
function assert(c, msg) { if (!c) { failures++; console.error('FAIL: ' + msg); } }

// ---- rules unit tests ----
assert(R.meleeHitTarget(4, 3) === 3 && R.meleeHitTarget(3, 3) === 4 && R.meleeHitTarget(2, 5) === 4, 'melee hit targets');
assert(R.saveTarget(6, 3) === 6 && R.saveTarget(5, 3) === 5 && R.saveTarget(4, 4) === 4 && R.saveTarget(3, 4) === 3 && R.saveTarget(2, 5) === 2 && R.saveTarget(3, 5) === 3, 'save targets');
assert(R.rangedHitTarget(3, 0) === 4 && R.rangedHitTarget(4, 0) === 3 && R.rangedHitTarget(2, 1) === 6, 'ranged targets');
assert(R.rankBonus(20, 5) === 4 && R.rankBonus(13, 5) === 3 && R.rankBonus(12, 5) === 2 && R.rankBonus(1, 1) === 0, 'rank bonus');
R.setSeed(1); var sv = R.rollSaves(10, 3, { halberd: true }); assert(sv.target === 4, 'halberd caps save at 4+');
assert(Math.abs(R.rollExpr('2d3+1').total) >= 3, 'dice expr');

// geometry
var r = { x: 10, y: 10, a: -Math.PI / 2, w: 4, d: 2 };
var fc = G.frontCenter(r); assert(Math.abs(fc.x - 10) < 1e-9 && Math.abs(fc.y - 9) < 1e-9, 'front center faces up');
assert(G.zoneOf(r, { x: 10, y: 0 }) === 'front' && G.zoneOf(r, { x: 10, y: 20 }) === 'rear' && G.zoneOf(r, { x: 20, y: 10 }) === 'right' && G.zoneOf(r, { x: 0, y: 10 }) === 'left', 'zones');
assert(G.rectsOverlap(r, { x: 12, y: 10, a: 0, w: 2, d: 2 }) && !G.rectsOverlap(r, { x: 14, y: 10, a: 0, w: 2, d: 2 }), 'overlap');
assert(G.segHitsAabb({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 4, y: 4, w: 2, h: 2 }) && !G.segHitsAabb({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 4, w: 2, h: 2 }), 'segment aabb');

// army building: every faction's random armies validate at all sizes
Object.keys(SOVL.FACTION_DATA).forEach(function (fid) {
  [500, 1000, 1500].forEach(function (pts) {
    for (var i = 0; i < 5; i++) {
      R.setSeed(pts * 7 + i);
      var army = A.randomArmy({ faction: fid, pts: pts });
      var probs = A.validate(army, pts);
      assert(probs.length === 0, fid + ' ' + pts + ' random army invalid: ' + probs.join('; ') + ' :: ' + JSON.stringify(army.entries.map(function (e) { return A.entryLabel(fid, e); })));
      assert(A.armyCost(army) <= pts && A.armyCost(army) > pts * 0.6, fid + ' cost ' + A.armyCost(army) + '/' + pts);
    }
  });
});

// unit construction sanity
var e = A.defaultEntry('empires_of_men', 'imperial_sword', 20);
var u = SOVL.makeUnit(0, 'empires_of_men', e);
assert(u.models === 20 && u.files === 5 && Math.abs(u.w - 5 * 20 / 25.4) < 1e-9 && Math.abs(u.d - 4 * 20 / 25.4) < 1e-9, 'footprint');
var st = SOVL.effStats(u); assert(st.df === 4 && st.pw === 3, 'shield adds defense');
var cav = SOVL.makeUnit(0, 'empires_of_men', A.defaultEntry('empires_of_men', 'imperial_knights', 5));
assert(SOVL.moveAllowance(cav) === 15, 'heavy armor -1 move for cavalry: ' + SOVL.moveAllowance(cav));
var dw = SOVL.makeUnit(0, 'dwarf_holds', A.defaultEntry('dwarf_holds', 'deep_guard', 10));
assert(SOVL.moveAllowance(dw) === 7, 'sturdy: ' + SOVL.moveAllowance(dw));

// ---- full battles ----
function runBattle(seed, fa, fb, pts, scenario) {
  R.setSeed(seed);
  var armyA = A.randomArmy({ faction: fa, pts: pts }), armyB = A.randomArmy({ faction: fb, pts: pts });
  var terrain = A.randomTerrain({});
  var b = new SOVL.Battle({ armies: [armyA, armyB], terrain: terrain, scenario: scenario || 'pitched', names: ['A', 'B'] });
  b.autoDeploy(0); b.autoDeploy(1);
  b.units.forEach(function (u) { assert(u.placed, 'unit not placed: ' + u.name); });
  // no overlaps after deployment
  for (var i = 0; i < b.units.length; i++) for (var j = i + 1; j < b.units.length; j++) assert(!G.rectsOverlap(b.units[i], b.units[j], -0.05), 'deploy overlap ' + b.units[i].name + '/' + b.units[j].name + ' seed ' + seed);
  var ais = [new SOVL.AI(b, 0, { aggression: 0.5 }), new SOVL.AI(b, 1, { aggression: 0.6 })];
  b.start();
  var steps = 0;
  while (b.phase !== 'end' && steps++ < 5000) {
    var ai = ais[b.active];
    var before = b.log.length;
    if (!ai.step()) break;
    if (b.phase !== 'end') {
      // invariants
      b.units.forEach(function (x) {
        assert(x.models >= 0, 'negative models');
        assert(!isNaN(x.x) && !isNaN(x.y) && !isNaN(x.a), 'NaN position ' + x.name);
        assert(x.x > -1 && x.x < SOVL.TABLE.w + 1 && x.y > -1 && x.y < SOVL.TABLE.h + 1, 'unit off table: ' + x.name + ' ' + x.x.toFixed(1) + ',' + x.y.toFixed(1) + ' seed ' + seed);
      });
      b.contacts.forEach(function (c) { assert(b.unit(c.a) && b.unit(c.b), 'dangling contact seed ' + seed); });
    }
  }
  assert(b.phase === 'end', 'battle did not end (seed ' + seed + ', phase ' + b.phase + ', turn ' + b.turn + ', steps ' + steps + ')');
  return b;
}
var games = parseInt(process.argv[2] || '40', 10), seed0 = parseInt(process.argv[3] || '100', 10);
var fids = Object.keys(SOVL.FACTION_DATA), stats = { wins: [0, 0, 0], turns: 0, charges: 0, shots: 0, spells: 0, flees: 0, byFaction: {} };
var t0 = Date.now();
for (var g = 0; g < games; g++) {
  var fa = fids[g % fids.length], fb = fids[(g * 3 + 1) % fids.length], pts = [500, 1000, 1500][g % 3];
  var b = runBattle(seed0 + g, fa, fb, pts, g % 4 === 3 ? 'objectives' : 'pitched');
  var w = b.result.winner; stats.wins[w == null ? 2 : w]++; stats.turns += b.result.turn;
  b.log.forEach(function (l) { if (l.kind === 'charge' && /charges into/.test(l.text)) stats.charges++; if (l.kind === 'shoot') stats.shots++; if (l.kind === 'spell' && /casts/.test(l.text)) stats.spells++; if (l.kind === 'flee') stats.flees++; });
  stats.byFaction[fa] = stats.byFaction[fa] || { g: 0, w: 0 }; stats.byFaction[fb] = stats.byFaction[fb] || { g: 0, w: 0 };
  stats.byFaction[fa].g++; stats.byFaction[fb].g++; if (w === 0) stats.byFaction[fa].w++; if (w === 1) stats.byFaction[fb].w++;
}
console.log('games', games, 'time', Date.now() - t0, 'ms');
console.log('wins A/B/draw', stats.wins, 'avg turns', (stats.turns / games).toFixed(1), 'charges', stats.charges, 'shots', stats.shots, 'spells', stats.spells, 'flees', stats.flees);
console.log('by faction', stats.byFaction);
if (process.argv[4] === 'log') { var bb = runBattle(seed0, fids[0], fids[4], 1000); bb.log.forEach(function (l) { console.log('[T' + l.turn + ' ' + l.phase + '] ' + l.text); }); }
if (SOVL.Campaign) {
  for (var c = 0; c < 20; c++) {
    R.setSeed(500 + c);
    var camp = SOVL.Campaign.create({ faction: fids[c % 5], commander: SOVL.FACTION_DATA[fids[c % 5]].sections[0].units[c % 3].id });
    assert(camp.map.acts.length === 3, 'campaign acts');
    camp.map.acts.forEach(function (act) { assert(act.layers.length >= 3, 'layers'); act.layers.forEach(function (layer, li) { layer.forEach(function (n) { if (li < act.layers.length - 1) assert(n.next.length > 0, 'node without exits'); }); }); });
    var probs = A.validate(camp.army, 99999); assert(probs.filter(function (p) { return !/at least|unit size/.test(p); }).length === 0, 'campaign army invalid: ' + probs.join('; '));
    // simulate: fight the first battle node
    var node = camp.map.acts[0].layers[0][0];
    var enemy = SOVL.Campaign.enemyArmyFor(camp, node);
    assert(enemy.entries.length > 0, 'enemy army');
  }
}
console.log(failures ? failures + ' FAILURES' : 'ALL TESTS PASSED');
process.exit(failures ? 1 : 0);
