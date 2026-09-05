// Interaction test: drives a skirmish with real mouse clicks and keys through the canvas UI.
// Usage: node test/interact.js [baseUrl]
'use strict';
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var base = process.argv[2] || 'http://127.0.0.1:8123/index.html', errors = [], checks = 0;
function expect(c, msg) { checks++; if (!c) { errors.push('CHECK FAILED: ' + msg); console.log('CHECK FAILED: ' + msg); } }
(async function () {
  var browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base); await page.waitForTimeout(500);
  await page.click('#btn-skirmish'); await page.click('.faction-card:nth-child(1)'); await page.selectOption('#setup-size', '1000'); await page.selectOption('#setup-enemy', 'dead_nations'); await page.click('#setup-next'); await page.waitForTimeout(100);
  // builder: add a commander and units by hand
  await page.click('#builder-clear');
  var adds = await page.$$('#builder-catalog button.small');
  await adds[0].click(); await page.waitForTimeout(50); // commander
  adds = await page.$$('#builder-catalog button.small');
  await adds[3].click(); await page.waitForTimeout(50); // battle line
  adds = await page.$$('#builder-catalog button.small');
  await adds[3].click(); await page.waitForTimeout(50); // battle line again
  var n = await page.evaluate(function () { return SOVL.UI.builder.army.entries.length; });
  expect(n === 3, 'builder has 3 entries, got ' + n);
  // change retinue via select and models via slider
  await page.selectOption('#builder-list .entry:nth-child(1) select', 'imperial_halberd');
  var ret = await page.evaluate(function () { return SOVL.UI.builder.army.entries[0].retinue.id; });
  expect(ret === 'imperial_halberd', 'retinue changed: ' + ret);
  await page.click('#builder-auto'); await page.waitForTimeout(100);
  await page.click('#builder-go'); await page.waitForTimeout(300);
  // deployment with drag
  await page.click('#deploy-tray button:has-text("Auto-deploy")'); await page.waitForTimeout(100);
  var box = await page.$eval('#battle-canvas', function (c) { var r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  var u0 = await page.evaluate(function () { var b = SOVL.UI.battle, u = b.unitsOf(0)[0], r = SOVL.UI.renderer, p = r.toScreen(u.x, u.y); return { uid: u.uid, sx: p.x, sy: p.y, x: u.x, y: u.y, a: u.a }; });
  await page.mouse.move(box.x + u0.sx, box.y + u0.sy); await page.mouse.down(); await page.mouse.move(box.x + u0.sx + 40, box.y + u0.sy, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100);
  var after = await page.evaluate(function (uid) { var u = SOVL.UI.battle.unit(uid); return { x: u.x, y: u.y, a: u.a, placed: u.placed }; }, u0.uid);
  expect(Math.abs(after.x - u0.x) > 1, 'drag moved unit: ' + u0.x.toFixed(1) + ' -> ' + after.x.toFixed(1));
  await page.evaluate(function () { SOVL.UI.aiDelay = 40; });
  await page.keyboard.press('e'); await page.waitForTimeout(50);
  var rot = await page.evaluate(function (uid) { return { a: SOVL.UI.battle.unit(uid).a, hint: document.getElementById('battle-hint').textContent }; }, u0.uid);
  expect(Math.abs(rot.a - after.a) > 0.5 || /No room to rotate/.test(rot.hint), 'E rotates selected unit or explains why not');
  await page.keyboard.press('q');
  await page.click('#deploy-tray button.primary'); await page.waitForTimeout(400);
  // play a few turns with mouse
  var t0 = Date.now(), didMove = false, didCharge = false, didShoot = false, didEnd = false;
  while (Date.now() - t0 < 400000) {
    var st = await page.evaluate(function () { var UI = SOVL.UI, b = UI.battle; return { phase: b.phase, active: b.active, turn: b.turn, modal: UI.modalOpen, activeUnit: b.activeUnit, animating: UI.combatAnimating }; });
    if (st.phase === 'end') break;
    if (st.modal) { var btn = await page.$('#modal-body button.primary'); if (btn) await btn.click(); await page.waitForTimeout(100); continue; }
    if (st.phase === 'combat') { if (!st.animating) await page.click('#engagement-panel button.primary'); await page.waitForTimeout(180); continue; }
    if (st.active !== 0) { await page.waitForTimeout(150); continue; }
    box = await page.$eval('#battle-canvas', function (c) { var r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    if (st.phase === 'charge') {
      // find a unit with valid targets; click it then the target
      var pair = await page.evaluate(function () { var UI = SOVL.UI, b = UI.battle, r = UI.renderer; var us = b.unitsOf(0); for (var i = 0; i < us.length; i++) { if (!b.canDeclareCharge(us[i])) continue; var ts = b.validChargeTargets(us[i]); if (ts.length) { var p = r.toScreen(us[i].x, us[i].y), q = r.toScreen(ts[0].unit.x, ts[0].unit.y); return { ux: p.x, uy: p.y, tx: q.x, ty: q.y, uid: us[i].uid, tid: ts[0].unit.uid }; } } return null; });
      if (pair) {
        await page.mouse.click(box.x + pair.ux, box.y + pair.uy); await page.waitForTimeout(80);
        var sel = await page.evaluate(function () { return { sel: SOVL.UI.sel, targets: SOVL.UI.targets.length }; });
        expect(sel.sel === pair.uid && sel.targets > 0, 'charge phase: unit selected with targets');
        await page.mouse.click(box.x + pair.tx, box.y + pair.ty); await page.waitForTimeout(80);
        var declared = await page.evaluate(function (uid) { var b = SOVL.UI.battle; return b.charges.some(function (c) { return c.charger === uid; }) || b.phase !== 'charge'; }, pair.uid);
        expect(declared, 'charge declared by clicking target'); didCharge = didCharge || declared;
      } else { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
      continue;
    }
    if (st.phase === 'strategic') {
      if (!st.activeUnit) {
        var pick = await page.evaluate(function () { var UI = SOVL.UI, b = UI.battle, r = UI.renderer; var us = b.activatable(0).filter(function (u) { return !b.isEngaged(u) && !u.fleeing; }); if (!us.length) return null; var u = us[0], p = r.toScreen(u.x, u.y); return { sx: p.x, sy: p.y, uid: u.uid, x: u.x, y: u.y, a: u.a, ranged: !!u.ranged }; });
        if (!pick) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); continue; }
        await page.mouse.click(box.x + pick.sx, box.y + pick.sy); await page.waitForTimeout(80);
        var act = await page.evaluate(function () { return SOVL.UI.battle.activeUnit; });
        expect(act === pick.uid, 'clicking own unit activates it');
        // move preview + click ground 5" ahead-left
        var ground = await page.evaluate(function (uid) { var UI = SOVL.UI, b = UI.battle, u = b.unit(uid), r = UI.renderer; var f = SOVL.G.fwd(u.a); var w = { x: u.x + f.x * 4 + 1, y: u.y + f.y * 4 }; var p = r.toScreen(w.x, w.y); return { sx: p.x, sy: p.y, onUnit: !!r.unitAt(b, w), canMove: u.moveLeft > 0 && w.x > 1 && w.y > 1 && w.x < SOVL.TABLE.w - 1 && w.y < SOVL.TABLE.h - 1 }; }, pick.uid);
        await page.mouse.move(box.x + ground.sx, box.y + ground.sy); await page.waitForTimeout(60);
        var pv = await page.evaluate(function () { return SOVL.UI.preview ? SOVL.UI.preview.ok : null; });
        if (!ground.onUnit && ground.canMove) expect(pv !== null, 'move preview shown on hover');
        await page.mouse.click(box.x + ground.sx, box.y + ground.sy); await page.waitForTimeout(80);
        var moved = await page.evaluate(function (uid) { var u = SOVL.UI.battle.unit(uid); return u ? { x: u.x, y: u.y, left: u.moveLeft } : null; }, pick.uid);
        if (moved && pv) { if (Math.abs(moved.x - pick.x) > 0.3 || Math.abs(moved.y - pick.y) > 0.3) didMove = true; }
        // shoot if a target exists
        var shootBtn = await page.$('#battle-actions button:has-text("Shoot")');
        if (shootBtn) {
          await shootBtn.click(); await page.waitForTimeout(60);
          var tgt = await page.evaluate(function () { var UI = SOVL.UI, b = UI.battle, r = UI.renderer; if (UI.mode !== 'shoot' || !UI.targets.length) return null; var t = b.unit(UI.targets[0]), p = r.toScreen(t.x, t.y); return { sx: p.x, sy: p.y }; });
          if (tgt) { await page.mouse.click(box.x + tgt.sx, box.y + tgt.sy); await page.waitForTimeout(80); var used = await page.evaluate(function (uid) { var u = SOVL.UI.battle.unit(uid); return u && u.usedRanged; }, pick.uid); expect(used, 'shooting via click marks usedRanged'); didShoot = true; }
          else await page.keyboard.press('Escape');
        }
        await page.keyboard.press('Enter'); await page.waitForTimeout(80);
        var ended = await page.evaluate(function (uid) { var b = SOVL.UI.battle; var u = b.unit(uid); return !u || u.activated || b.activeUnit !== uid; }, pick.uid);
        expect(ended, 'Enter ends the activation'); didEnd = true;
      } else { await page.keyboard.press('Enter'); await page.waitForTimeout(80); }
      continue;
    }
    await page.waitForTimeout(100);
  }
  var end = await page.evaluate(function () { return SOVL.UI.battle.phase; });
  expect(end === 'end', 'battle finished: ' + end);
  expect(didMove, 'at least one mouse-driven move happened');
  expect(didEnd, 'activations ended by keyboard');
  console.log('charged:', didCharge, 'shot:', didShoot, 'moved:', didMove);
  await page.waitForTimeout(800);
  var modal = await page.$('#modal.active'); expect(!!modal, 'result modal shown');
  await page.screenshot({ path: '/tmp/sovl-shots/interact-end.png' });
  await browser.close();
  console.log(checks + ' checks, ' + errors.length + ' problems');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('INTERACTION TEST OK');
})().catch(function (e) { console.error(e); process.exit(1); });
