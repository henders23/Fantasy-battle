// Browser smoke test: drives the UI through skirmish and campaign flows with Playwright.
// Usage: node test/browser.js [baseUrl] [screenshotDir]
'use strict';
var path = require('path');
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var base = process.argv[2] || 'http://127.0.0.1:8123/index.html', shots = process.argv[3] || '/tmp/sovl-shots';
require('fs').mkdirSync(shots, { recursive: true });
var errors = [];
(async function () {
  var browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, '01-menu.png') });

  // ---- skirmish ----
  await page.click('#btn-skirmish'); await page.waitForTimeout(200);
  await page.click('.faction-card:nth-child(2)');
  await page.selectOption('#setup-size', '1000');
  await page.click('#setup-next'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '02-builder-empty.png') });
  // add a commander and units manually via catalogue buttons, then auto-fill
  await page.click('#builder-auto'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '03-builder.png') });
  await page.click('#builder-go'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '04-deploy.png') });
  // place one unit by clicking, then auto-deploy the rest
  await page.click('.tray-unit');
  var box = await page.$eval('#battle-canvas', function (c) { var r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.9); await page.waitForTimeout(100);
  await page.click('#deploy-tray button:has-text("Auto-deploy")'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '05-deployed.png') });
  await page.click('#deploy-tray button.primary'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '06-battle-start.png') });
  await playBattle(page, 'skirmish');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, '09-result.png') });
  await page.click('#modal-body button.primary'); await page.waitForTimeout(300);

  // ---- campaign ----
  await page.click('#btn-campaign'); await page.waitForTimeout(200);
  await page.click('.faction-card:nth-child(4)');
  await page.click('#setup-next'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, '10-campaign-intro.png') });
  await page.click('#m-ok'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '11-map.png') });
  for (var step = 0; step < 6; step++) {
    var over = await page.evaluate(function () { return !SOVL.UI.campaign || SOVL.UI.campaign.over; });
    if (over) break;
    var avail = await page.$$('.node.avail'); if (!avail.length) break;
    // prefer non-battle nodes to exercise them, but fight the first
    var types = await page.evaluate(function () { var c = SOVL.UI.campaign, a = SOVL.Campaign.availableNodes(c), act = SOVL.Campaign.currentAct(c), l = c.nodeIndex == null ? 0 : c.layer + 1; return a.map(function (i) { return act.layers[l][i].type; }); });
    var pick = 0; for (var i = 0; i < types.length; i++) if (step > 0 && types[i] !== 'battle' && types[i] !== 'elite') pick = i;
    await avail[pick].click(); await page.waitForTimeout(300);
    var type = types[pick];
    await page.screenshot({ path: path.join(shots, '12-node-' + step + '-' + type + '.png') });
    if (type === 'battle' || type === 'elite' || type === 'boss') {
      await page.click('#m-fight'); await page.waitForTimeout(300);
      await page.click('#deploy-tray button:has-text("Auto-deploy")'); await page.waitForTimeout(100);
      await page.click('#deploy-tray button.primary'); await page.waitForTimeout(300);
      await playBattle(page, 'campaign-' + step);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(shots, '13-camp-result-' + step + '.png') });
      await page.click('#modal-body button.primary'); await page.waitForTimeout(400);
      var runOver = await page.evaluate(function () { return SOVL.UI.campaign && SOVL.UI.campaign.over; });
      if (runOver) { await page.screenshot({ path: path.join(shots, '14-runover.png') }); await page.click('#m-menu'); await page.waitForTimeout(300); break; }
      // dismiss any follow-up modal
      var m = await page.$('#modal.active #m-ok'); if (m) await m.click();
    } else if (type === 'event') {
      var btns = await page.$$('#modal-body .choices button:not([disabled])');
      await btns[btns.length - 1].click(); await page.waitForTimeout(300);
      var m2 = await page.$('#modal.active #m-ok'); if (m2) await m2.click();
      var fight = await page.$('#modal.active #m-fight'); if (fight) { await fight.click(); await page.waitForTimeout(300); await page.click('#deploy-tray button:has-text("Auto-deploy")'); await page.click('#deploy-tray button.primary'); await playBattle(page, 'event-' + step); await page.waitForTimeout(800); await page.click('#modal-body button.primary'); await page.waitForTimeout(400); var m3 = await page.$('#modal.active #m-ok'); if (m3) await m3.click(); }
    } else if (type === 'merchant') {
      var buy = await page.$('#modal-body .shop-item button:not([disabled])'); if (buy) await buy.click();
      await page.waitForTimeout(200); await page.screenshot({ path: path.join(shots, '12-merchant.png') });
      await page.click('#modal-body button.primary:has-text("Leave")');
    } else if (type === 'camp') {
      await page.click('#modal-body .choices button'); await page.waitForTimeout(200);
      var m4 = await page.$('#modal.active #m-ok'); if (m4) await m4.click();
    } else if (type === 'treasure') {
      await page.click('#m-ok');
    }
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: path.join(shots, '15-map-after.png') });
  // rules page
  var onCamp = await page.evaluate(function () { return SOVL.UI.screen === 'campaign'; }); if (onCamp) await page.click('#camp-menu');
  await page.click('#btn-rules'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(shots, '16-rules.png') });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('BROWSER TEST OK');
})().catch(function (e) { console.error(e); console.log('ERRORS so far:\n' + errors.join('\n')); process.exit(1); });

// Drive the player's side with an AI through the UI action functions; handle modals.
async function playBattle(page, tag) {
  var t0 = Date.now(), shotTaken = false;
  while (Date.now() - t0 < 120000) {
    var st = await page.evaluate(function () {
      var UI = SOVL.UI, b = UI.battle; if (!b) return { done: true };
      if (UI.modalOpen) return { modal: true, phase: b.phase };
      if (b.phase === 'end') return { done: true, phase: b.phase };
      if (b.active !== UI.playerSide) return { waiting: true, phase: b.phase, turn: b.turn };
      if (!UI.playerAI) UI.playerAI = new SOVL.AI(b, UI.playerSide, { aggression: 0.55 });
      if (UI.playerAI.b !== b) UI.playerAI = new SOVL.AI(b, UI.playerSide, { aggression: 0.55 });
      UI.playerAI.step();
      UI.sel = null; UI.targets = []; UI.preview = null;
      UI.afterPlayerAction();
      return { acted: true, phase: b.phase, turn: b.turn };
    });
    if (st.done) return;
    if (st.modal) { var btn = await page.$('#modal-body button.primary'); if (btn) { if (!shotTaken && st.phase !== 'end') { await page.screenshot({ path: path.join('/tmp/sovl-shots', '07-combat-' + tag + '.png') }); shotTaken = true; } await btn.click(); } await page.waitForTimeout(150); continue; }
    if (st.turn === 3 && st.phase === 'strategic' && !shotTaken) { await page.screenshot({ path: path.join('/tmp/sovl-shots', '08-midbattle-' + tag + '.png') }); shotTaken = true; }
    await page.waitForTimeout(st.waiting ? 200 : 60);
  }
  throw new Error('battle did not finish in time (' + tag + ')');
}
