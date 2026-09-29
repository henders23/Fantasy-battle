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
  var dock = await page.evaluate(function () { var t = document.getElementById('deploy-tray'), b = SOVL.UI.battle; return { muster: t.classList.contains('muster-dock'), cards: t.querySelectorAll('.tray-unit').length, mine: b.unitsOf(0).length, scouts: t.querySelectorAll('.md-scout-row').length, theirs: b.unitsOf(1).length, facts: t.querySelector('.md-facts').textContent, go: !!t.querySelector('.md-actions button.primary') }; });
  ok(dock.muster && dock.cards === dock.mine && dock.scouts === dock.theirs && /14" deep/.test(dock.facts) && dock.go, 'muster dock lists regiments, scouts and zone depth: ' + JSON.stringify(dock));
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
    if (st.prompt && !sawPrompt) { sawPrompt = true; await page.screenshot({ path: path.join(shots, 'f3-reaction.png') }); var txt = await page.$eval('#reaction-prompt', function (e) { return e.textContent; }); console.log('prompt:', txt); await page.click('#reaction-prompt button:has-text("Hold")'); await page.waitForTimeout(50); continue; }
    if (st.prompt) { await page.click('#reaction-prompt button:has-text("Hold")'); await page.waitForTimeout(50); continue; }
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
  var sfx = await page.evaluate(function () { return SOVL.UI.sfx && SOVL.UI.sfx.loaded(); });
  ok(sfx && sfx.loaded === 94 && !sfx.missing.length, 'all sound clips decoded: ' + (sfx && sfx.loaded) + ' missing ' + (sfx && sfx.missing.join(',')));
  var diffs = await page.$$eval('#setup-difficulty option', function (o) { return o.map(function (x) { return x.value; }); });
  ok(diffs.join(',') === 'easy,normal,hard', 'difficulty select populated: ' + diffs);
  await page.selectOption('#setup-difficulty', 'hard');
  await page.click('#setup-next'); await page.waitForTimeout(300);
  await page.click('#m-ok'); await page.waitForTimeout(200);
  var camp = await page.evaluate(function () { var c = SOVL.UI.campaign; return { gold: c.gold, diff: c.difficulty, v: c.version }; });
  var map = await page.evaluate(function () { var m = document.getElementById('camp-map'); return { canvas: !!m.querySelector('.trail-map canvas'), stops: m.querySelectorAll('.trail-map .node.avail').length, svg: !!m.querySelector('svg') }; });
  ok(map.canvas && map.stops > 0 && !map.svg, 'campaign map drawn as a chart with reachable stops: ' + JSON.stringify(map));
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
  var shop = await page.evaluate(function () { var m = document.getElementById('modal-body'); return { tabs: m.querySelectorAll('.ms-tabs button').length, gold: +m.querySelector('.ms-gold').textContent, real: SOVL.UI.campaign.gold, msg: m.querySelector('.ms-msg').textContent, leaveVisible: m.querySelector('.ms-foot .primary').getBoundingClientRect().bottom <= window.innerHeight }; });
  ok(shop.tabs === 3 && shop.gold === shop.real && shop.leaveVisible && /re-armed|takes|now fights|with/.test(shop.msg + (clicked || '')), 'merchant tabs, purse and purchase message: ' + JSON.stringify(shop));
  await page.click('#modal-body .ms-tabs button:nth-child(2)'); await page.waitForTimeout(100);
  var reinf = await page.evaluate(function () { var m = document.getElementById('modal-body'), b = m.querySelector('.ms-panel.on .ms-price:not([disabled])'); if (!b) return { none: true }; var g0 = SOVL.UI.campaign.gold; b.click(); var m2 = document.getElementById('modal-body'); return { spent: g0 - SOVL.UI.campaign.gold, tab: m2.querySelector('.ms-tabs button.on').textContent, msg: m2.querySelector('.ms-msg').className }; });
  ok(reinf.none || (reinf.spent > 0 && /Reinforce/.test(reinf.tab) && /good/.test(reinf.msg)), 'reinforce spends gold and stays on its tab: ' + JSON.stringify(reinf));
  await page.click('#modal-body button.primary:has-text("Leave")'); await page.waitForTimeout(100);
  // events: consequence tags, unaffordable choices and the written-up outcome
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.gold = 50; var orig = SOVL.Campaign.randomEvent; SOVL.Campaign.randomEvent = function () { return SOVL.CAMPAIGN.events.filter(function (e) { return e.id === 'relic_seller'; })[0]; }; try { SOVL.UI.campaignEvent({ type: 'event' }); } finally { SOVL.Campaign.randomEvent = orig; } });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f6c-event.png') });
  var evs = await page.evaluate(function () { var m = document.getElementById('modal-body'); return { tale: m.classList.contains('m-tale'), cards: m.querySelectorAll('.tl-choice').length, disabled: Array.from(m.querySelectorAll('.tl-choice')).map(function (b) { return b.disabled; }), tags: m.querySelector('.tl-choice .tl-tags').textContent, short: (m.querySelector('.tl-short') || {}).textContent }; });
  ok(evs.tale && evs.cards === 3 && evs.disabled.join() === 'true,true,false' && /110 gold/.test(evs.tags) && /Magic weapon/.test(evs.tags) && /60 more gold/.test(evs.short || ''), 'event choices show costs and block what you cannot afford: ' + JSON.stringify(evs));
  await page.click('#modal-body .tl-choice:not([disabled])'); await page.waitForTimeout(100);
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.gold = 50; var orig = SOVL.Campaign.randomEvent; SOVL.Campaign.randomEvent = function () { return SOVL.CAMPAIGN.events.filter(function (e) { return e.id === 'drill'; })[0]; }; try { SOVL.UI.campaignEvent({ type: 'event' }); } finally { SOVL.Campaign.randomEvent = orig; } });
  await page.click('#modal-body .tl-choice:nth-child(2)'); await page.waitForTimeout(150);
  var out = await page.evaluate(function () { var m = document.getElementById('modal-body'); return { tale: m.classList.contains('m-tale'), lines: m.querySelectorAll('.tl-lines li').length, text: m.textContent, gold: SOVL.UI.campaign.gold }; });
  ok(out.tale && out.lines === 1 && /\+45 gold/.test(out.text) && out.gold === 95, 'event outcome is written up: ' + JSON.stringify({ lines: out.lines, gold: out.gold }));
  await page.click('#modal.active #m-ok'); await page.waitForTimeout(100);
  // treasure through the real travel path
  var tr = await page.evaluate(function () {
    var UI = SOVL.UI, C = SOVL.Campaign, c = UI.campaign, g0 = c.gold, moveTo = C.moveTo;
    C.moveTo = function () { return { type: 'treasure' }; };
    try { UI.travel(0); } finally { C.moveTo = moveTo; }
    var m = document.getElementById('modal-body');
    return { hoard: m.classList.contains('m-hoard'), gold: c.gold - g0, shown: (m.querySelector('.tr-gold b') || {}).textContent || null, relic: !!m.querySelector('.tr-relic'), ok: !!m.querySelector('#m-ok') };
  });
  ok(tr.hoard && tr.ok && (tr.relic || tr.shown === '+' + tr.gold), 'treasure opens the chest and shows the find: ' + JSON.stringify(tr));
  await page.screenshot({ path: path.join(shots, 'f6d-treasure.png') });
  await page.click('#modal.active #m-ok'); await page.waitForTimeout(100);
  // camp: the rest preview matches what resting does
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.army.entries.forEach(function (e) { var t = e.kind === 'commander' ? e.retinue : e; if (t.models > 4) t.models -= 3; }); SOVL.UI.campaignCamp({ type: 'camp' }); });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f6b-camp.png') });
  var preview = await page.$$eval('#modal-body .cp-card:first-child .cp-delta', function (d) { return d.map(function (x) { return x.textContent.split('→').map(function (n) { return +n; }); }); });
  await page.click('#modal-body .choices button'); await page.waitForTimeout(150);
  var after = await page.evaluate(function () { return { dawn: !!document.querySelector('#modal-body.m-dawn'), deltas: Array.from(document.querySelectorAll('#modal-body .cp-change .cp-delta')).map(function (d) { return +d.textContent; }) }; });
  ok(after.dawn && preview.length === after.deltas.length && preview.every(function (p, i) { return p[1] - p[0] === after.deltas[i]; }), 'camp rest preview matches the result: ' + JSON.stringify({ preview: preview, after: after.deltas }));
  await page.click('#modal.active #m-ok'); await page.waitForTimeout(100);
  await page.evaluate(function () { SOVL.UI.campaignCamp({ type: 'camp' }); }); await page.waitForTimeout(100);
  var drill0 = await page.evaluate(function () { var c = SOVL.UI.campaign, i = c.army.entries.findIndex(function (e) { return ((e.kind === 'commander' ? e.retinue : e).vet || 0) < 3; }); return { i: i, v: (function (e) { return (e.kind === 'commander' ? e.retinue : e).vet || 0; })(c.army.entries[i]), disabled: document.querySelector('#modal-body .cp-drill').disabled }; });
  await page.click('#modal-body .cp-opt:nth-child(' + (drill0.i + 1) + ')'); await page.click('#modal-body .cp-drill'); await page.waitForTimeout(100);
  var drill1 = await page.evaluate(function (i) { var e = SOVL.UI.campaign.army.entries[i]; return (e.kind === 'commander' ? e.retinue : e).vet || 0; }, drill0.i);
  ok(drill0.disabled && drill1 === drill0.v + 1, 'drill needs a choice, then raises that unit a rank: ' + drill0.v + ' -> ' + drill1);
  await page.click('#modal.active #m-ok'); await page.waitForTimeout(100);
  // run-over screen with history
  await page.evaluate(function () { var c = SOVL.UI.campaign; c.history.push({ act: 0, type: 'battle', enemy: 'dwarf_holds', pts: 480, won: true, draw: false, turn: 6, why: 'rout' }); c.over = true; SOVL.UI.showRunOver(); });
  await page.waitForTimeout(150); await page.screenshot({ path: path.join(shots, 'f7-runover.png') });
  var ro = await page.$eval('#modal-body', function (e) { return e.textContent; });
  ok(/Battle honours/.test(ro) && /Dwarf/.test(ro) && /Legend/.test(ro), 'run-over shows honours table and difficulty');
  // battle result screen
  await page.evaluate(function () {
    SOVL.UI.closeModal();
    var A = SOVL.Army, b = new SOVL.Battle({ armies: [A.randomArmy({ faction: 'empires_of_men', pts: 500 }), A.randomArmy({ faction: 'greenskin_tribes', pts: 500 })], terrain: [], scenario: 'pitched', names: ['Us', 'Them'] });
    b.autoDeploy(0); b.autoDeploy(1); var foe = b.unitsOf(1); b.destroyUnit(foe[0], 'destroyed'); if (foe[1]) b.destroyUnit(foe[1], 'fled'); b.endGame('rout1');
    var d = document.createElement('div'); d.textContent = 'Plunder: 40 gold.';
    window.__resDone = false; SOVL.UI.showResult(b, { extra: d, label: 'Onward', onDone: function () { window.__resDone = true; } });
    window.__resUnits = b.units.length + b.dead.length;
  });
  await page.waitForTimeout(600); await page.screenshot({ path: path.join(shots, 'f8-result.png') });
  var rs = await page.evaluate(function () { var m = document.getElementById('modal-body'), btn = m.querySelector('.res-foot button.primary'), r = btn.getBoundingClientRect(); return { cls: m.className, word: m.querySelector('.res-word').textContent, rows: m.querySelectorAll('.res-unit').length, units: window.__resUnits, spoils: (m.querySelector('.res-spoils') || {}).textContent || '', text: m.textContent, btnVisible: r.bottom <= window.innerHeight && r.top >= 0, label: btn.textContent }; });
  ok(/m-result/.test(rs.cls) && rs.word === 'Victory' && rs.rows === rs.units && /Plunder/.test(rs.spoils) && /Battle Over/.test(rs.text) && rs.btnVisible && rs.label === 'Onward', 'result screen: verdict, both rolls, spoils, visible button: ' + JSON.stringify({ cls: rs.cls, word: rs.word, rows: rs.rows, units: rs.units, btn: rs.btnVisible }));
  await page.click('#modal-body .res-foot button.primary'); await page.waitForTimeout(100);
  // settings: switches, sliders and segmented choices change and persist the settings
  await page.evaluate(function () { SOVL.UI.showSettings(); }); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, 'f9-settings.png') });
  var st0 = await page.evaluate(function () { return { n: document.querySelectorAll('#modal-body .st-switch').length, sliders: document.querySelectorAll('#modal-body input[type=range]').length, motion: SOVL.UI.settings.motion }; });
  ok(st0.n === 3 && st0.sliders === 2, 'settings has 3 switches and 2 volume sliders: ' + JSON.stringify(st0));
  await page.click('#modal-body .st-card:last-child .st-switch'); await page.waitForTimeout(50);
  await page.click('#modal-body .st-seg button:has-text("Fast")');
  await page.$eval('#modal-body input[type=range]', function (r) { r.value = 25; r.dispatchEvent(new Event('input')); });
  var st1 = await page.evaluate(function () { var s = SOVL.UI.settings, saved = JSON.parse(localStorage.getItem('sovl-experience-settings')); return { motion: s.motion, reduce: SOVL.UI.renderer ? SOVL.UI.renderer.reduceMotion : null, pace: s.pace, delay: SOVL.UI.aiDelay, lvl: s.soundLevel, savedLvl: saved.soundLevel, savedPace: saved.pace }; });
  ok(st1.motion === !st0.motion && st1.pace === 'fast' && st1.delay === 180 && st1.lvl === 25 && st1.savedLvl === 25 && st1.savedPace === 'fast', 'settings controls apply and persist: ' + JSON.stringify(st1));
  await page.click('#modal-body .st-reset'); await page.waitForTimeout(100);
  var st2 = await page.evaluate(function () { var s = SOVL.UI.settings; return { pace: s.pace, lvl: s.soundLevel, open: SOVL.UI.modalOpen }; });
  ok(st2.pace === 'normal' && st2.lvl === 60 && st2.open, 'restore defaults: ' + JSON.stringify(st2));
  await page.evaluate(function () { SOVL.UI.closeModal(); });
  // guide: five illustrated steps, arrow keys page through them
  await page.evaluate(function () { SOVL.UI.showGuide(0); }); await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  var gd = await page.evaluate(function () { var m = document.getElementById('modal-body'); return { steps: m.querySelectorAll('.gd-pane').length, art: m.querySelectorAll('.gd-pane svg').length, on: m.querySelector('.gd-pane.on h3').textContent, text: m.textContent }; });
  ok(gd.steps === 5 && gd.art === 5 && gd.on === 'Move and shoot' && /Fight on the field/.test(gd.text), 'guide steps and keyboard paging: ' + gd.on);
  await page.screenshot({ path: path.join(shots, 'f10-guide.png') });
  await page.evaluate(function () { SOVL.UI.closeModal(); });
  // field manual: chapters, a contents rail and every spell
  await page.evaluate(function () { SOVL.UI.showRules(); }); await page.waitForTimeout(200);
  var fm = await page.evaluate(function () { return { secs: document.querySelectorAll('#rules-body .fm-sec').length, toc: document.querySelectorAll('#rules-body .fm-toc a').length, spells: document.querySelectorAll('#rules-body .fm-spell').length, all: Object.keys(SOVL.SPELLS).length, facs: document.querySelectorAll('#rules-body .fm-fac').length }; });
  ok(fm.secs === fm.toc && fm.secs >= 10 && fm.spells === fm.all && fm.facs === 5, 'field manual chapters, spells and factions: ' + JSON.stringify(fm));
  await page.screenshot({ path: path.join(shots, 'f11-manual.png') });
  ok(await page.evaluate(function () { return window.__resDone && !SOVL.UI.modalOpen; }), 'result continue closes the screen and runs onDone');
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'FEATURE TEST OK');
  process.exit(errors.length ? 1 : 0);
})().catch(function (e) { console.error(e); console.log('ERRORS so far:\n' + errors.join('\n')); process.exit(1); });
