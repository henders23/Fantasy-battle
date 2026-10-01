// Mid-battle saving (js/battlesave.js): a battle snapshotted and restored after every single
// AI step must play out exactly like the same seeded battle left alone. Also checks that a
// snapshot survives a JSON round trip unchanged and that summoned units get fresh uids.
// Run: node test/save.js [games] [seed]
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { window: {}, console: console, Math: Math, JSON: JSON };
vm.createContext(ctx);
['data.js', 'data_units.js', 'geom.js', 'rules.js', 'battle.js', 'army.js', 'ai.js', 'campaign.js', 'battlesave.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
});
var SOVL = ctx.window.SOVL, R = SOVL.R, A = SOVL.Army, S = SOVL.BattleSave;
var failures = 0, checks = 0;
function assert(c, msg) { checks++; if (!c) { failures++; console.error('FAIL: ' + msg); } }
var games = +process.argv[2] || 12, seed0 = +process.argv[3] || 101;
var factions = Object.keys(SOVL.FACTION_DATA);

function setup(seed, fa, fb, scenario) {
  R.setSeed(seed);
  var armies = [A.randomArmy({ faction: fa, pts: 1000 }), A.randomArmy({ faction: fb, pts: 1000 })];
  var terrain = A.randomTerrain({});
  var b = new SOVL.Battle({ armies: armies, terrain: terrain, scenario: scenario, names: ['A', 'B'] });
  b.autoDeploy(0); b.autoDeploy(1);
  return b;
}
function play(b, roundTrip) {
  var steps = 0, restores = 0;
  b.start();
  while (b.phase !== 'end' && steps++ < 5000) {
    if (roundTrip && S.atRest(b)) {
      var snap = S.snapshot(b), text = JSON.stringify(snap);
      var nb = S.restore(JSON.parse(text));
      var again = JSON.stringify(S.snapshot(nb));
      if (again !== text) { assert(false, 'snapshot changed after a round trip at step ' + steps); return null; }
      b = nb; restores++;
    }
    if (!new SOVL.AI(b, b.active, { aggression: b.active ? 0.6 : 0.5 }).step()) break;
    b.events = [];
  }
  return { b: b, restores: restores };
}
var totalRestores = 0;
for (var g = 0; g < games; g++) {
  var seed = seed0 + g * 17, fa = factions[g % factions.length], fb = factions[(g * 3 + 1) % factions.length];
  var scenario = ['pitched', 'meeting', 'objectives'][g % 3];
  var plain = play(setup(seed, fa, fb, scenario), false);
  var saved = play(setup(seed, fa, fb, scenario), true);
  if (!saved) continue;
  totalRestores += saved.restores;
  var lp = plain.b.log.map(function (l) { return l.text; }), ls = saved.b.log.map(function (l) { return l.text; });
  var same = JSON.stringify(lp) === JSON.stringify(ls) && JSON.stringify(plain.b.result) === JSON.stringify(saved.b.result);
  if (!same) {
    var i = 0; while (i < lp.length && lp[i] === ls[i]) i++;
    assert(false, 'game ' + g + ' (' + fa + ' v ' + fb + ', ' + scenario + ', seed ' + seed + ') diverged at log line ' + i + ':\n  plain: ' + lp[i] + '\n  saved: ' + ls[i]);
  } else assert(true, '');
  assert(saved.b.phase === 'end', 'game ' + g + ' finished after ' + saved.restores + ' restores');
}
// summoned units after a restore never reuse a restored uid
R.setSeed(5);
var dn = { faction: 'dead_nations', name: 'x', entries: [] };
var nec = SOVL.FACTION_DATA.dead_nations.sections[0].units.filter(function (u) { return (u.spells || []).indexOf('Raise Dead') >= 0 || u.caster; })[0];
var b2 = setup(9, 'dead_nations', 'empires_of_men', 'pitched'); b2.start();
var maxUid = Math.max.apply(null, b2.units.map(function (u) { return u.uid; }));
var r2 = S.restore(JSON.parse(JSON.stringify(S.snapshot(b2))));
var fresh = SOVL.makeUnit(0, 'dead_nations', { id: SOVL.FACTION_DATA.dead_nations.sections[1].units[0].id });
assert(fresh.uid > maxUid, 'a unit made after a restore gets a fresh uid (' + fresh.uid + ' > ' + maxUid + ')');
assert(r2.units[0].def === SOVL.findUnitDef(r2.units[0].faction, r2.units[0].id) && r2.units[0].typeInfo === SOVL.UNIT_TYPES[r2.units[0].type], 'restored units re-link their definitions');
console.log(failures ? failures + ' FAILURES' : 'SAVE TESTS PASSED: ' + games + ' battles replayed with ' + totalRestores + ' save/restore round trips, ' + checks + ' checks.');
process.exit(failures ? 1 : 0);
