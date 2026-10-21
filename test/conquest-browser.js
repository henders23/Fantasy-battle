// The Broken March (js/conquestui.js) in a real browser: the title entry, a new campaign and the
// opening scene, the painted map, selecting and recruiting, an attack from the map fought out by
// the army's commander, raising a second army, the other powers' turn and the letter scene, an
// enemy attack on one of your armies, a lord's fall, saving and continuing, the ending, and the
// screen at phone and laptop sizes.
// Needs a static server on the repo: node test/conquest-browser.js [url] [screenshot dir]
'use strict';
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var base = process.argv[2] || 'http://127.0.0.1:8123/index.html', out = process.argv[3] || '/tmp/sovl-conquest';
require('fs').mkdirSync(out, { recursive: true });
function check(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
// the screen position of a province's heart on the map
function heart(p, id) {
  return p.evaluate(function (id) { var cv = document.getElementById('cq-map'), r = cv.getBoundingClientRect(), pr = SOVL.Conquest.prov(id), q = SOVL.ConquestMap.toScreen(cv, pr.x, pr.y + 12); return { x: r.left + q.x, y: r.top + q.y }; }, id);
}
async function clickProvince(p, id) { var h = await heart(p, id); await p.mouse.click(h.x, h.y); await p.waitForTimeout(250); }
async function untilModal(p, sel, tries) { for (var i = 0; i < (tries || 40); i++) { if (await p.$('#modal.active ' + sel)) return true; await p.waitForTimeout(300); } return false; }
(async function () {
  var br = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  var p = await ctx.newPage(), errs = []; p.on('pageerror', function (e) { errs.push(e.message); });
  await p.goto(base); await p.evaluate(function () { localStorage.clear(); }); await p.reload(); await p.waitForTimeout(500);
  var entry = await p.textContent('#btn-conquest');
  check(/The Broken March/.test(entry), 'the title screen offers the Broken March');
  await p.click('#btn-conquest'); await p.waitForTimeout(200);
  check(await p.$$eval('#modal.active .cq-diff', function (b) { return b.length; }) === 3, 'three difficulties to choose from');
  await p.click('#cq-begin'); await p.waitForTimeout(600);
  var op = await p.evaluate(function () { return { title: (document.querySelector('#modal.active .sy-title') || {}).textContent, aims: document.querySelectorAll('#modal.active .sy-aim li').length, screen: SOVL.UI.screen }; });
  check(op.screen === 'conquest' && /Margrave is dead/.test(op.title) && op.aims === 4, 'the opening scene: "' + op.title + '", ' + op.aims + ' aims');
  await p.screenshot({ path: out + '/1-opening.png' });
  await p.click('#modal.active .cq-choice'); await p.waitForTimeout(500);
  // the painted map is drawn
  var paint = await p.evaluate(function () {
    var cv = document.getElementById('cq-map'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data, n = 0, sum = 0, sq = 0;
    for (var i = 0; i < d.length; i += 4 * 97) { var v = d[i] + d[i + 1] + d[i + 2]; sum += v; sq += v * v; n++; }
    var mean = sum / n; return { mean: mean, sd: Math.sqrt(sq / n - mean * mean) };
  });
  check(paint.mean > 120 && paint.sd > 40, 'the map shows the painted country (brightness ' + paint.mean.toFixed(0) + ', contrast ' + paint.sd.toFixed(0) + ')');
  await p.screenshot({ path: out + '/2-map.png' });

  // select the Warden's army on the map, recruit in Harrowgate
  await clickProvince(p, 'harrowgate');
  var sel = await p.evaluate(function () { var CQ = SOVL.UI.conquest; return { sel: CQ.sel, reach: CQ.reach, head: document.querySelector('#cq-panel h3').textContent }; });
  check(sel.sel && /Aldric/.test(sel.head) && sel.reach.fenwick && sel.reach.fenwick.kind === 'attack' && sel.reach.oxley.kind === 'move' && sel.reach.elderglade.kind === 'visit', 'clicking Harrowgate selects the Warden; the map offers marches, attacks and a parley');
  var g0 = await p.evaluate(function () { return SOVL.UI.conquest.s.gold; });
  await p.click('#cq-panel .cq-offer button.primary'); await p.waitForTimeout(200);
  var g1 = await p.evaluate(function () { var s = SOVL.UI.conquest.s; return { gold: s.gold, n: s.armies[0].army.entries.length }; });
  check(g1.gold < g0 && g1.n === 5, 'a regiment recruited at Harrowgate (' + g0 + ' → ' + g1.gold + ' gold)');
  // attack Fenwick Mere from the map, and let the Warden fight it
  await p.evaluate(function () { var g = SOVL.UI.conquest.s.provinces.fenwick.garrison; g.entries = g.entries.slice(0, 1); g.entries[0].models = 10; });
  await clickProvince(p, 'fenwick');
  check(await untilModal(p, '#cq-auto', 5) && !!(await p.$('#modal.active #cq-withdraw')), 'attacking opens the battle prompt: lead it, let the commander fight it, or withdraw');
  await p.screenshot({ path: out + '/3-prompt.png' });
  await p.click('#cq-auto');
  check(await untilModal(p, '#cq-ok', 20), 'the battle is fought out and reported');
  var rep = await p.evaluate(function () { return { verdict: document.querySelector('#modal.active .cq-verdict').textContent, rows: document.querySelectorAll('#modal.active .cq-losses tr').length }; });
  check(/Victory|Defeat|Stalemate/.test(rep.verdict) && rep.rows > 1, 'the report: ' + rep.verdict + ', with your regiments before and after');
  await p.click('#cq-ok'); await p.waitForTimeout(400);
  var fen = await p.evaluate(function () { var s = SOVL.UI.conquest.s; return { owner: s.provinces.fenwick.owner, at: s.armies[0].at, moves: s.armies[0].moves }; });
  check(fen.owner === 'player' && fen.at === 'fenwick' && fen.moves === 0, 'Fenwick Mere taken; the army moved in and its march is over');
  // raise a second army in Harrowgate (with a gift for the war chest)
  await p.evaluate(function () { SOVL.UI.conquest.s.gold += 300; });
  await p.keyboard.press('Escape'); await clickProvince(p, 'harrowgate');
  var raise = await p.$('#cq-panel button.primary.cq-wide');
  check(!!raise, 'Harrowgate, now empty, can raise an army');
  if (raise) { await raise.click(); await p.waitForTimeout(200); await p.screenshot({ path: out + '/4-hire.png' }); await p.click('#modal.active [data-hire="captain"]'); await p.waitForTimeout(300); }
  var two = await p.evaluate(function () { var K = SOVL.Conquest, s = SOVL.UI.conquest.s; return K.armiesOf(s, 'player').map(function (a) { return K.leaderName(a) + '@' + a.at; }); });
  check(two.length === 2 && /harrowgate/.test(two[1]), 'a captain raises a company: ' + two.join(', '));
  // end the turn: the other powers move, the turn is reported, then Ottokar's letter
  await p.click('#cq-end');
  check(await untilModal(p, '#cq-ok', 40), 'the other powers move and the turn is reported');
  await p.screenshot({ path: out + '/5-turn.png' });
  await p.click('#cq-ok'); await p.waitForTimeout(400);
  var letter = await p.evaluate(function () { return (document.querySelector('#modal.active .sy-title') || {}).textContent; });
  check(/letter/i.test(letter || '') && !!(await p.$('#modal.active .cq-sport')), 'turn 2: the letter from Count Ottokar, with his portrait');
  await p.screenshot({ path: out + '/6-letter.png' });
  await p.click('#modal.active .cq-choice[data-choice="1"]'); await p.waitForTimeout(300);
  check(await p.evaluate(function () { var s = SOVL.UI.conquest.s; return s.stances.rebels && s.stances.rebels.kind === 'truce'; }), 'stalling the Count buys a truce');

  // an enemy army attacks one of yours: Skarbad's raiders, made strong, next to the company in Oxley
  await p.evaluate(function () {
    var K = SOVL.Conquest, D = SOVL.CONQUEST, s = SOVL.UI.conquest.s, co = K.armiesOf(s, 'player')[1], sk = s.armies.filter(function (a) { return a.name === "Skarbad's Raiders"; })[0];
    co.at = 'oxley'; s.turn = 4; s.fired.push('dunmar_plea');
    ['greywater', 'harrowsend', 'kingsmeadow', 'thornveld'].forEach(function (id) { s.provinces[id].owner = 'greenskins'; s.provinces[id].garrison = { faction: 'greenskin_tribes', name: 'g', entries: [] }; }); // Oxley is the only target
    s.armies.filter(function (a) { return a.name === 'The Greywater Levy'; })[0].at = 'mirrormere';
    sk.at = 'greywater'; for (var i = 0; i < 4; i++) { var e = JSON.parse(JSON.stringify(sk.army.entries[1])); e.ref = 'skx' + i; sk.army.entries.push(e); }
    D.powers.greenskins.aggression = 1; SOVL.UI.conquest.sel = null; SOVL.UI.conquest.prov = null;
  });
  await p.click('#cq-end');
  var defend = await untilModal(p, '#cq-lead', 40);
  check(defend && !(await p.$('#modal.active #cq-withdraw')) && /attacked/i.test(await p.textContent('#modal.active .sy-eyebrow')), 'your army is attacked: lead the defence or let the captain fight it, no withdrawing');
  await p.screenshot({ path: out + '/7-defend.png' });
  if (defend) { await p.click('#cq-auto'); await untilModal(p, '.cq-verdict', 20); await p.click('#cq-ok'); }
  check(await untilModal(p, '.cq-turnrep', 40), 'the turn carries on after the battle and is reported');
  await p.click('#cq-ok'); await p.waitForTimeout(300);
  for (var k = 0; k < 4; k++) { var c = await p.$('#modal.active .cq-choice'); if (!c) break; await c.click(); await p.waitForTimeout(300); }

  // Highmoor falls: an empty keep next to the Warden
  await p.evaluate(function () {
    var s = SOVL.UI.conquest.s, hero = s.armies.filter(function (a) { return a.hero; })[0];
    s.provinces.kingsmeadow.owner = 'player'; s.provinces.highmoor.garrison.entries = [];
    s.armies = s.armies.filter(function (a) { return a.power !== 'rebels'; }); hero.at = 'kingsmeadow'; hero.moves = 2;
    SOVL.UI.conquest.sel = hero.id; document.getElementById('cq-zfit').click();
  });
  await p.keyboard.press('Escape'); await clickProvince(p, 'kingsmeadow'); await clickProvince(p, 'highmoor');
  var fall = await untilModal(p, '.cq-sport', 10);
  check(fall && /usurper/i.test(await p.textContent('#modal.active .sy-title')), 'taking Highmoor Keep brings Count Ottokar before the Warden');
  await p.screenshot({ path: out + '/8-fall.png' });
  var gold = await p.evaluate(function () { return SOVL.UI.conquest.s.gold; });
  await p.click('#modal.active .cq-choice[data-choice="0"]'); await p.waitForTimeout(400);
  var after = await p.evaluate(function () { var s = SOVL.UI.conquest.s; return { fate: s.fates.ottokar, gold: s.gold, mirror: s.provinces.mirrormere.owner, rebels: s.armies.filter(function (a) { return a.power === 'rebels'; }).length, lord: s.lords.ottokar }; });
  check(after.fate === 'hanged' && after.gold === gold + 150 && after.mirror === 'neutral' && after.rebels === 0, 'Ottokar hanged: his treasury taken, his lands in disorder');

  // saved: reload and continue
  await p.reload(); await p.waitForTimeout(600);
  var cont = await p.textContent('#btn-conquest');
  check(/Continue the March/.test(cont) && /Turn 5/.test(cont), 'the title screen offers to continue: "' + cont.replace(/\s+/g, ' ').trim() + '"');
  await p.click('#btn-conquest'); await p.waitForTimeout(600);
  var back = await p.evaluate(function () { var s = SOVL.UI.conquest.s; return { screen: SOVL.UI.screen, turn: s.turn, fate: s.fates.ottokar }; });
  check(back.screen === 'conquest' && back.turn === 5 && back.fate === 'hanged', 'the campaign continues where it stood');

  // the end of the year
  await p.evaluate(function () { SOVL.UI.conquest.s.turn = 24; SOVL.UI.conquest.s.fired.push('snow', 'barrow_lights'); });
  await p.click('#cq-end');
  for (var t = 0; t < 60; t++) {
    if (await p.$('#modal.active #cq-done')) break;
    var b1 = await p.$('#modal.active #cq-auto'); if (b1) { await b1.click(); await p.waitForTimeout(400); continue; }
    var b2 = await p.$('#modal.active #cq-ok'); if (b2) { await b2.click(); await p.waitForTimeout(300); continue; }
    await p.waitForTimeout(300);
  }
  var end = await p.evaluate(function () { return { title: (document.querySelector('#modal.active .sy-title') || {}).textContent, stats: document.querySelectorAll('#modal.active .cq-endstats div').length, result: SOVL.UI.conquest.s.result }; });
  check(!!end.title && end.stats === 4 && /partial|lost/.test(end.result), 'winter ends the campaign: "' + end.title + '" (' + end.result + ')');
  await p.screenshot({ path: out + '/9-end.png' });
  await p.click('#cq-done'); await p.waitForTimeout(300);
  check(await p.evaluate(function () { return SOVL.UI.screen === 'menu' && !localStorage.getItem(SOVL.Conquest.KEY); }), 'back to the title, the finished campaign cleared');

  // phone and laptop
  for (var v of [[390, 844, 'phone'], [1366, 657, 'laptop']]) {
    var c2 = await br.newContext({ viewport: { width: v[0], height: v[1] } }), q = await c2.newPage(); q.on('pageerror', function (e) { errs.push(e.message); });
    await q.goto(base); await q.evaluate(function () { localStorage.clear(); }); await q.reload(); await q.waitForTimeout(400);
    await q.click('#btn-conquest'); await q.click('#cq-begin'); await q.waitForTimeout(500);
    var fit = await q.evaluate(function () { var m = document.getElementById('modal-body').getBoundingClientRect(), b = document.querySelector('#modal.active .cq-choice').getBoundingClientRect(); return { w: m.width, btn: b.bottom <= window.innerHeight || document.getElementById('modal-body').scrollHeight > document.getElementById('modal-body').clientHeight }; });
    check(fit.w <= v[0] && fit.btn, v[2] + ': the opening scene fits');
    await q.click('#modal.active .cq-choice'); await q.waitForTimeout(500);
    var lay = await q.evaluate(function () { var map = document.getElementById('cq-mapwrap').getBoundingClientRect(), end = document.getElementById('cq-end').getBoundingClientRect(), panel = document.getElementById('cq-panel').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, mapH: map.height, mapW: map.width, endVisible: end.bottom <= window.innerHeight && end.right <= window.innerWidth, panelW: panel.width }; });
    check(lay.scroll <= v[0] && lay.mapH >= 260 && lay.endVisible && lay.panelW > 200, v[2] + ': map ' + Math.round(lay.mapW) + '×' + Math.round(lay.mapH) + ', End turn in view, no sideways scroll');
    await q.screenshot({ path: out + '/10-' + v[2] + '.png' });
    await c2.close();
  }
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close();
  console.log(process.exitCode ? 'CONQUEST BROWSER TEST FAILED' : 'CONQUEST BROWSER TEST OK');
})();
