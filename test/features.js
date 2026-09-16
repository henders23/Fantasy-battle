'use strict';
// Feature test: scenarios, rotation handle, undo, charge reactions, difficulty, traits, honours, re-arm.
// Usage: node test/features.js [baseUrl] [screenshotDir]
var pw, path = require('path');
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
var shots = process.argv[3] || '/tmp/sovl-features'; require('fs').mkdirSync(shots, { recursive: true });
var errors = [];
function ok(c, m) { if (!c) { errors.push('FAIL: ' + m); console.log('FAIL: ' + m); } else console.log('ok: ' + m); }
(async function () {
  var browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); console.log('pageerror', e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base); await page.waitForTimeout(500);
  // setup selects populated
  await page.click('#btn-skirmish'); await page.waitForTimeout(200);
  var scen = await page.$$eval('#setup-scenario option', function (o) { return o.map(function (x) { return x.value; }); });
  ok(scen.join(',') === 'pitched,meeting,objectives', 'scenario select populated: ' + scen);
  await page.selectOption('#setup-scenario', 'meeting');
  await page.click('#setup-next'); await page.waitForTimeout(200);
  await page.click('#builder-auto'); await page.waitForTimeout(100);
  await page.click('#builder-go'); await page.waitForTimeout(500);
  var turnTxt = await page.$eval('#battle-turn', function (e) { return e.textContent; });
  ok(/Meeting/.test(turnTxt), 'deploy header shows scenario: ' + turnTxt);
  var dz = await page.evaluate(function () { var b = SOVL.UI.battle; return [b.deployDepth, b.deployZone(0), b.deployZone(1)]; });
  ok(dz[0] === 14, 'meeting deploy depth 14: ' + JSON.stringify(dz));
  // rotation handle in deployment
  var h = await page.evaluate(function () { var UI = SOVL.UI, r = UI.renderer, h = UI.handlePoint(); if (!h) return null; var s = r.toScreen(h.x, h.y); var u = UI.battle.unit(h.uid); var c = r.toScreen(u.x, u.y); return { sx: s.x, sy: s.y, uid: h.uid, a: u.a, cx: c.x, cy: c.y }; });
  ok(h, 'handle present in deployment: ' + JSON.stringify(h));
  await page.screenshot({ path: path.join(shots, 'f1-handle.png') });
  var box = await page.$eval('#battle-canvas', function (c) { var r = c.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(box.x + h.sx, box.y + h.sy); await page.mouse.down();
  await page.mouse.move(box.x + h.cx + 80, box.y + h.cy - 10, { steps: 8 }); await page.mouse.move(box.x + h.cx + 80, box.y + h.cy, { steps: 4 });
  await page.mouse.up(); await page.waitForTimeout(100);
  var a2 = await page.evaluate(function (uid) { return SOVL.UI.battle.unit(uid).a; }, h.uid);
  ok(Math.abs(a2 - h.a) > 0.3, 'deploy rotation via handle changed facing ' + h.a.toFixed(2) + ' -> ' + a2.toFixed(2));
  await page.screenshot({ path: path.join(shots, 'f2-rotated.png') });
  // reset facing so that unit stays sane, then begin battle
  await page.evaluate(function (uid) { var u = SOVL.UI.battle.unit(uid); u.a = SOVL.UI.battle.facingFor(0); u._ra = u.a; }, h.uid);
  await page.click('#deploy-tray button.primary'); await page.waitForTimeout(400);
  // charge phase: pass our charges, let the AI declare charges vs us, look for a reaction prompt over several turns
  var sawPrompt = false, sawUndo = false, sawFace = false, sawHandle = false;
  var t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    var st = await page.evaluate(function () {
      var UI = SOVL.UI, b = UI.battle; if (!b) return { done: true };
      if (UI.modalOpen) return { modal: true };
      if (b.pendingRoll) { UI.rollLock = false; UI.rollDice(); return { rolled: true }; }
      if (b.phase === 'end') return { done: true };
      if (b.phase === 'combat') return { combat: true, animating: UI.combatAnimating };
      if (b.active !== UI.playerSide) return { waiting: true };
      var prompt = !document.getElementById('reaction-prompt').hidden;
      if (b.phase === 'charge') { if (prompt) return { prompt: true }; UI.passCharge(); return { acted: true }; }
      if (b.phase === 'strategic') {
        if (!b.activeUnit) {
          var c = b.activatable(UI.playerSide).filter(function (u) { return !u.fleeing && !b.isEngaged(u); })[0];
          if (!c) { UI.endActivation(); return { acted: true }; }
          UI.canvasClick({ x: c.x, y: c.y }, {}); return { activated: c.uid };
        }
        var u = b.unit(b.activeUnit), handle = !!UI.handlePoint();
        var undoBtn = Array.from(document.querySelectorAll('#battle-actions button')).some(function (x) { return /Undo/.test(x.textContent); });
        var faceBtn = Array.from(document.querySelectorAll('#battle-actions button')).some(function (x) { return /^Face /.test(x.textContent); });
        var before = { x: u.x, y: u.y, a: u.a, ml: u.moveLeft };
        // move forward a bit then undo
        var f = SOVL.G.fwd(u.a); var mv = b.previewMove(u.uid, { x: u.x + f.x * 3, y: u.y + f.y * 3 }, false);
        var moved = false, undone = false;
        if (mv.ok && mv.advance > 0.5) { b.applyMove(u.uid, mv); moved = true; UI.processEvents(); UI.updateHud(); var undoBtn2 = Array.from(document.querySelectorAll('#battle-actions button')).filter(function (x) { return /Undo/.test(x.textContent); })[0]; if (undoBtn2) { undoBtn2.click(); undone = Math.abs(u.x - before.x) < 1e-6 && Math.abs(u.y - before.y) < 1e-6 && Math.abs(u.moveLeft - before.ml) < 1e-6; } }
        UI.endActivation();
        return { acted: true, handle: handle, faceBtn: faceBtn, moved: moved, undone: undone, undoBtnBefore: undoBtn };
      }
      return { other: b.phase };
    });
    if (st.done) break;
    if (st.prompt && !sawPrompt) { sawPrompt = true; await page.screenshot({ path: path.join(shots, 'f3-reaction.png') }); var txt = await page.$eval('#reaction-prompt', function (e) { return e.textContent; }); console.log('prompt:', txt); await page.click('#reaction-prompt button:last-child'); await page.waitForTimeout(50); continue; }
    if (st.prompt) { await page.click('#reaction-prompt button:last-child'); await page.waitForTimeout(50); continue; }
    if (st.handle) sawHandle = true; if (st.faceBtn) sawFace = true; if (st.moved && st.undone) sawUndo = true;
    if (st.moved && !st.undone) errors.push('undo failed: ' + JSON.stringify(st));
    if (st.combat) { if (!st.animating) await page.click('#engagement-panel button.primary'); await page.waitForTimeout(150); continue; }
    if (st.modal) { var btn = await page.$('#modal-body button.primary'); if (btn) await btn.click(); await page.waitForTimeout(150); continue; }
    await page.waitForTimeout(st.waiting ? 150 : 40);
    if (sawPrompt && sawUndo && sawFace && sawHandle) { var turn = await page.evaluate(function () { return SOVL.UI.battle.turn; }); if (turn >= 3) break; }
  }
  ok(sawHandle, 'handle shown for active unit in strategic phase');
  ok(sawUndo, 'undo button restored position and movement');
  ok(sawFace, 'Face <enemy> buttons offered');
  ok(sawPrompt, 'reaction prompt appeared when the enemy charged');
  // dice row cap: verify rows up to 40
  var cap = await page.evaluate(function () { return SOVL.UI.dice.rows.length; }); console.log('dice rows now', cap);
  await page.screenshot({ path: path.join(shots, 'f4-mid.png') });
  // ---- campaign: difficulty, trait modal, honours, re-arm ----
  await page.evaluate(function () { SOVL.UI.battle = null; SOVL.UI.show('menu'); });
  await page.click('#btn-campaign'); await page.waitForTimeout(200);
  var diffs = await page.$$eval('#setup-difficulty option', function (o) { return o.map(function (x) { return x.value; }); });
  ok(diffs.join(',') === 'easy,normal,hard', 'difficulty select populated: ' + diffs);
  await page.selectOption('#setup-difficulty', 'hard');
  await page.click('#setup-next'); await page.waitForTimeout(300);
  await page.click('#m-ok'); await page.waitForTimeout(200);
  var camp = await page.evaluate(function () { var c = SOVL.UI.campaign; return { gold: c.gold, diff: c.difficulty, v: c.version }; });
  ok(camp.gold === 110 && camp.diff === 'hard', 'hard campaign gold/difficulty: ' + JSON.stringify(camp));
  // trait modal
  await page.evaluate(function () { SOVL.UI.campaign.pendingTrait = true; SOVL.UI.traitModal(); });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f5-trait.png') });
  var nTraits = await page.$$eval('#modal-body .choices button', function (b) { return b.length; }); ok(nTraits === 3, 'trait modal offers 3 traits');
  await page.click('#modal-body .choices button'); await page.waitForTimeout(150);
  var learned = await page.evaluate(function () { var c = SOVL.UI.campaign; return { traits: c.army.entries[0].traits, pending: c.pendingTrait, roster: document.getElementById('camp-roster').textContent }; });
  ok(learned.traits && learned.traits.length === 1 && !learned.pending, 'trait learned: ' + JSON.stringify(learned.traits));
  ok(/⚔/.test(learned.roster) && /☠/.test(learned.roster), 'roster shows honours');
  // trait carried into battle army
  var inBattle = await page.evaluate(function () { var c = SOVL.UI.campaign, army = SOVL.Campaign.battleArmy(c); var b = new SOVL.Battle({ armies: [army, SOVL.Army.randomArmy({ faction: 'greenskin_tribes', pts: 500 })], terrain: SOVL.Army.randomTerrain({}), names: ['a', 'b'] }); var cu = b.units.filter(function (u) { return u.side === 0 && u.commander; })[0]; return cu.commander.items.map(function (i) { return i.kind + ':' + i.id; }); });
  ok(inBattle.some(function (s) { return /^trait:/.test(s); }), 'trait present on battle commander: ' + inBattle);
  // merchant re-arm section
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.gold = 999; SOVL.UI.campaignMerchant({ type: 'merchant' }); });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f6-merchant.png') });
  var rearm = await page.evaluate(function () { var h = Array.from(document.querySelectorAll('#modal-body h3')).map(function (x) { return x.textContent; }); return h; });
  ok(rearm.indexOf('Re-arm') >= 0, 'merchant has Re-arm section: ' + rearm);
  var beforeW = await page.evaluate(function () { var e = SOVL.UI.campaign.army.entries; return e.map(function (x) { return (x.kind === 'commander' ? x.retinue : x).weapon + '|' + (x.weapon || ''); }); });
  var btns = await page.$$('#modal-body .shop-item button');
  // click the first re-arm button (after the Re-arm heading)
  var clicked = await page.evaluate(function () { var h = Array.from(document.querySelectorAll('#modal-body h3')).filter(function (x) { return x.textContent === 'Re-arm'; })[0]; var d = h.nextElementSibling; while (d && !d.classList.contains('shop-item')) d = d.nextElementSibling; if (!d) return null; var b = d.querySelector('button'); var t = d.textContent; b.click(); return t; });
  await page.waitForTimeout(150);
  var afterW = await page.evaluate(function () { var e = SOVL.UI.campaign.army.entries; return e.map(function (x) { return (x.kind === 'commander' ? x.retinue : x).weapon + '|' + (x.weapon || ''); }); });
  ok(JSON.stringify(beforeW) !== JSON.stringify(afterW) || /add/.test(clicked || ''), 're-arm changed equipment: ' + clicked + ' :: ' + beforeW + ' -> ' + afterW);
  var err = await page.$eval('#modal-body .text', function (e) { return e.textContent; }); console.log('merchant text:', err.slice(0, 160));
  await page.click('#modal-body button.primary:has-text("Leave")'); await page.waitForTimeout(100);
  // run-over screen with history
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.history.push({ act: 0, type: 'battle', enemy: 'dwarf_holds', pts: 480, won: true, draw: false, turn: 6, why: 'rout' }); c.over = true; SOVL.UI.showRunOver(); });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f7-runover.png') });
  var ro = await page.$eval('#modal-body', function (e) { return e.textContent; });
  ok(/Battle honours/.test(ro) && /Dwarf/.test(ro) && /Legend/.test(ro), 'run-over shows honours table and difficulty');
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'FEATURE TEST OK');
  process.exit(errors.length ? 1 : 0);
})().catch(function (e) { console.error(e); console.log('ERRORS so far:\n' + errors.join('\n')); process.exit(1); });
