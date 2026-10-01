// Hot seat (js/hotseat.js) in a real browser: setup, both army builders, both deployments, then a
// whole battle with each player's moves made on their behalf, a reload and resume mid-battle, and
// the result. Checks that control always follows the player to move and the computer never acts.
// Needs a static server on the repo: node test/hotseat-browser.js [url] [screenshot dir]
'use strict';
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var base = process.argv[2] || 'http://127.0.0.1:8123/index.html', out = process.argv[3] || '/tmp/sovl-hotseat';
require('fs').mkdirSync(out, { recursive: true });
function check(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
(async function () {
  var br = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  var p = await ctx.newPage(); var errs = []; p.on('pageerror', function (e) { errs.push(e.message); });
  await p.goto(base); await p.waitForTimeout(400);
  await p.evaluate(function () { localStorage.removeItem('fantasy_battle_battle'); });
  await p.click('#btn-skirmish'); await p.waitForTimeout(300);
  await p.selectOption('#setup-mode', 'hotseat');
  await p.fill('#setup-p1', 'Aldric'); await p.fill('#setup-p2', 'Morwen');
  await p.selectOption('#setup-enemy', { index: 2 });
  var setup = await p.evaluate(function () { return { aggr: getComputedStyle(document.getElementById('setup-aggr').parentNode).display, next: document.getElementById('setup-next').textContent }; });
  check(setup.aggr === 'none' && /Player 1/.test(setup.next), 'setup hides AI aggression and names Player 1 (' + setup.next + ')');
  await p.screenshot({ path: out + '/1-setup.png' });
  await p.click('#setup-next'); await p.waitForTimeout(300);
  var t1 = await p.textContent('#builder-title');
  await p.click('#builder-auto'); await p.click('#builder-go'); await p.waitForTimeout(300);
  var t2 = await p.textContent('#builder-title');
  check(/Player 1 · Aldric/.test(t1) && /Player 2 · Morwen/.test(t2), 'builders are titled per player (' + t1 + ' | ' + t2 + ')');
  await p.screenshot({ path: out + '/2-builder-p2.png' });
  await p.click('#builder-go'); await p.waitForTimeout(800);
  var d0 = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; UI.__aiSteps = 0; var st = UI.ai.step; UI.ai.step = function () { UI.__aiSteps++; return st.apply(this, arguments); }; return { hs: UI.hotseat, side: UI.playerSide, names: b.names, placed1: b.unitsOf(1).filter(function (u) { return u.placed; }).length, title: document.querySelector('#deploy-tray .md-title').textContent, go: document.querySelector('#deploy-tray button.primary').textContent }; });
  check(d0.hs && d0.side === 0 && d0.placed1 === 0, 'player 1 deploys first; the AI placed nothing for player 2');
  check(/Aldric/.test(d0.title) && /hand over to Morwen/.test(d0.go), 'tray: "' + d0.title + '" / "' + d0.go + '"');
  await p.screenshot({ path: out + '/3-deploy-p1.png' });
  await p.click('#deploy-tray button.primary'); await p.waitForTimeout(400);
  var d1 = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; return { phase: b.phase, side: UI.playerSide, banner: (document.querySelector('.hs-banner') || {}).textContent, title: document.querySelector('#deploy-tray .md-title').textContent, go: document.querySelector('#deploy-tray button.primary').textContent, placed1: b.unitsOf(1).filter(function (u) { return u.placed; }).length, n1: b.unitsOf(1).length, sel: UI.deploySel && b.unit(UI.deploySel).side }; });
  check(d1.phase === 'deploy' && d1.side === 1 && /Morwen/.test(d1.banner || ''), 'handover to player 2 for deployment (banner: ' + d1.banner + ')');
  check(d1.placed1 === d1.n1 && d1.sel === 1 && /Morwen/.test(d1.title) && /Begin/.test(d1.go), 'player 2 gets an auto-deployed line to adjust, Begin Battle button');
  await p.screenshot({ path: out + '/4-deploy-p2.png' });
  await p.click('#deploy-tray button.primary'); await p.waitForTimeout(600);
  var shown = await p.evaluate(function () { var r = SOVL.UI.renderer; return { hidden: SOVL.UI.battle.phase === 'deploy' && !SOVL.UI.deployDone }; });
  check(!shown.hidden, 'both armies on show once deployment is done');
  await p.screenshot({ path: out + '/5a-initiative.png' });
  for (var k = 0; k < 20 && await p.evaluate(function () { return !!SOVL.UI.battle.pendingRoll; }); k++) { await p.keyboard.press('Space'); await p.waitForTimeout(400); }
  await p.waitForTimeout(1800);
  var s0 = await p.evaluate(function () { var b = SOVL.UI.battle; return { phase: b.phase, active: b.active, side: SOVL.UI.playerSide, who: document.getElementById('battle-who').textContent }; });
  check(s0.phase !== 'deploy' && s0.side === s0.active, 'battle starts, control with the active player (' + s0.who + ')');
  await p.screenshot({ path: out + '/5-turn1.png' });

  var mismatches = 0, handovers = 0, prompts = 0, lastSide = s0.side, resumed = false, sightShot = false, ended = false;
  for (var i = 0; i < 3000; i++) {
    var st = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; return { phase: b.phase, turn: b.turn, active: b.active, side: UI.playerSide, pending: !!b.pendingRoll, modal: UI.modalOpen, anim: !!UI.combatAnimating, prompt: !document.getElementById('reaction-prompt').hidden }; });
    if (st.phase === 'end') { ended = true; break; }
    if (st.modal) { await p.evaluate(function () { var m = document.querySelector('#modal-body button.primary'); if (m) m.click(); }); continue; }
    if (st.pending) { await p.keyboard.press('Space'); await p.waitForTimeout(30); continue; }
    if (st.phase === 'combat') { await p.keyboard.press('Enter'); await p.waitForTimeout(100); continue; }
    if (st.phase !== 'charge' && st.phase !== 'strategic') { await p.waitForTimeout(80); continue; }
    if (st.side !== st.active) { await p.waitForTimeout(60); st = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; return { active: b.active, side: UI.playerSide, phase: b.phase, pending: !!b.pendingRoll }; }); if (st.side !== st.active && !st.pending && (st.phase === 'charge' || st.phase === 'strategic')) mismatches++; continue; }
    if (st.side !== lastSide) { handovers++; lastSide = st.side; }
    if (st.prompt) prompts++;
    if (!sightShot && st.phase === 'strategic' && st.turn >= 2) {
      // point at an enemy with a regiment selected: the sight line works for either player
      var ok = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle, me = b.activatable(UI.playerSide)[0], t = b.unitsOf(1 - UI.playerSide)[0]; if (!me || !t) return false; UI.sel = me.uid; UI.hover = t.uid; UI.mode = 'move'; return true; });
      if (ok) { await p.waitForTimeout(250); var sp = await p.evaluate(function () { return SOVL.UI.renderer.sight ? SOVL.UI.renderer.sight.verdict : null; }); check(!!sp, 'sight line for player ' + (st.side + 1) + ': ' + sp); await p.screenshot({ path: out + '/6-sight.png' }); await p.evaluate(function () { SOVL.UI.hover = null; SOVL.UI.sel = null; }); sightShot = true; }
    }
    if (!resumed && st.turn >= 3 && st.phase === 'strategic') {
      await p.waitForTimeout(500);
      var before = await p.evaluate(function () { var b = SOVL.UI.battle; return { turn: b.turn, active: b.active, log: b.log.length }; });
      await p.reload(); await p.waitForTimeout(800);
      var card = await p.evaluate(function () { var c = document.getElementById('btn-resume'); return c.style.display !== 'none' ? c.textContent : null; });
      check(/Hot seat · Aldric vs Morwen/.test(card || ''), 'resume card: ' + card);
      await p.screenshot({ path: out + '/7-resume-card.png' });
      await p.click('#btn-resume'); await p.waitForTimeout(600);
      var after = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; UI.__aiSteps = 0; var st = UI.ai.step; UI.ai.step = function () { UI.__aiSteps++; return st.apply(this, arguments); }; return { hs: UI.hotseat, turn: b.turn, active: b.active, side: UI.playerSide, log: b.log.length }; });
      check(after.hs && after.turn === before.turn && after.active === before.active && after.side === after.active && after.log === before.log, 'hot seat resumed at turn ' + after.turn + ' with player ' + (after.side + 1) + ' to move');
      resumed = true; continue;
    }
    // play the active player's move on their behalf
    await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; UI.pas = UI.pas && UI.pas.b === b ? UI.pas : {}; UI.pas.b = b; var ai = UI.pas[b.active] || (UI.pas[b.active] = new SOVL.AI(b, b.active, { aggression: 0.8 })); ai.step(); UI.sel = null; UI.targets = []; UI.afterPlayerAction(); });
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(1800);
  var end = await p.evaluate(function () { var UI = SOVL.UI, b = UI.battle; var t = document.getElementById('modal').textContent || ''; return { ai: UI.__aiSteps, winner: b.result && b.result.winner, side: UI.playerSide, text: t.slice(0, 300), saved: !!localStorage.getItem('fantasy_battle_battle') }; });
  await p.screenshot({ path: out + '/8-result.png' });
  check(ended, 'battle played to the end');
  check(end.ai === 0, 'the computer never moved (' + end.ai + ' AI steps)');
  check(mismatches === 0, 'control always followed the active player (' + mismatches + ' mismatches, ' + handovers + ' handovers, reaction prompt seen ' + prompts + ' times)');
  check(end.winner == null ? end.side === 0 : end.side === end.winner, 'result told from the winner\'s side (winner ' + end.winner + ')');
  check(!end.saved, 'finished battle cleared the save');
  console.log('result text: ' + end.text.replace(/\s+/g, ' ').slice(0, 200));
  await p.evaluate(function () { SOVL.UI.show('menu'); });
  var back = await p.evaluate(function () { return { hs: SOVL.UI.hotseat, side: SOVL.UI.playerSide }; });
  check(!back.hs && back.side === 0, 'back at the menu, hot seat off');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  await br.close();
  console.log(process.exitCode ? 'HOT SEAT TESTS FAILED' : 'HOT SEAT TESTS PASSED');
})();
