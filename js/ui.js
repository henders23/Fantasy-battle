// UI controller: screens, input, AI pacing, campaign flow.
'use strict';
(function () {
  var G = SOVL.G, R = SOVL.R, A = SOVL.Army, C = SOVL.Campaign;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var STAT_NAMES = [['sk', 'Skill'], ['pw', 'Power'], ['df', 'Def'], ['at', 'Att'], ['wd', 'Wnd'], ['ds', 'Disc']];

  var UI = {
    playerSide: 0, aiSide: 1, screen: 'menu', battle: null, ai: null, renderer: null, sel: null, inspect: null, hover: null,
    mode: 'move', spell: null, ability: null, targets: [], preview: null, aiTimer: null, busy: false, campaign: null, setup: {}, deploySel: null, dragging: null, aiDelay: 420
  };
  SOVL.UI = UI;

  // ---------- screens ----------
  UI.show = function (id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + id).classList.add('active'); UI.screen = id;
    if (id === 'menu') $('btn-continue').style.display = C.load() && !C.load().over ? '' : 'none';
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var body = $('modal-body'); body.innerHTML = ''; if (typeof html === 'string') body.innerHTML = html; else body.appendChild(html);
    $('modal').classList.add('active'); UI.modalOpen = true;
    return body;
  };
  UI.closeModal = function () { $('modal').classList.remove('active'); UI.modalOpen = false; if (UI.screen === 'battle' && UI.battle && UI.battle.phase !== 'end') setTimeout(UI.pumpAI, 50); };
  function statsRow(s, cls) {
    var d = el('div', cls || 'statline');
    STAT_NAMES.forEach(function (p) { d.appendChild(el('div', 'stat', '<span>' + p[1] + '</span><b>' + s[p[0]] + '</b>')); });
    return d;
  }
  function propSpan(name) {
    var p = SOVL.PROPS[name] || SOVL.WEAPONS[name] || SOVL.RANGED[name] || SOVL.SPELLS[name];
    var desc = p ? p.desc : '';
    return '<span class="p" data-tip="' + esc(desc) + '">' + esc(name) + '</span>';
  }
  // tooltips for [data-tip]
  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]'), tip = $('tip');
    if (t && t.getAttribute('data-tip')) { tip.innerHTML = t.getAttribute('data-tip'); tip.style.display = 'block'; positionTip(e.clientX, e.clientY); }
    else if (!UI.canvasTip) tip.style.display = 'none';
  });
  function positionTip(x, y) { var tip = $('tip'); var w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px'; tip.style.top = Math.min(window.innerHeight - h - 8, y + 14) + 'px'; }

  // ---------- menu ----------
  UI.initMenu = function () {
    $('btn-campaign').onclick = function () { UI.showSetup('campaign'); };
    $('btn-continue').onclick = function () { var c = C.load(); if (c) { UI.campaign = c; UI.showCampaign(); } };
    $('btn-skirmish').onclick = function () { UI.showSetup('skirmish'); };
    $('btn-rules').onclick = function () { UI.showRules(); };
    $('setup-back').onclick = function () { UI.show('menu'); };
    $('builder-back').onclick = function () { UI.show('setup'); };
    $('rules-back').onclick = function () { UI.show('menu'); };
    $('battle-menu').onclick = function () { UI.confirmLeaveBattle(); };
    $('camp-menu').onclick = function () { C.save(UI.campaign); UI.show('menu'); };
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal') && UI.modalDismissable) UI.closeModal(); });
    UI.show('menu');
  };

  // ---------- setup ----------
  UI.showSetup = function (kind) {
    UI.setup = { kind: kind, faction: 'empires_of_men', commander: null };
    $('setup-title').textContent = kind === 'campaign' ? 'Trail of Death — New Campaign' : 'Skirmish';
    $('setup-skirmish-opts').style.display = kind === 'skirmish' ? '' : 'none';
    $('setup-campaign-opts').style.display = kind === 'campaign' ? '' : 'none';
    var fl = $('setup-factions'); fl.innerHTML = '';
    Object.keys(SOVL.FACTION_DATA).forEach(function (fid) {
      var f = SOVL.FACTION_DATA[fid], info = SOVL.FACTION_INFO[fid];
      var card = el('div', 'faction-card' + (fid === UI.setup.faction ? ' on' : ''), '<div class="sym" style="color:' + info.color + '">' + info.symbol + '</div><div class="name">' + esc(f.name) + '</div><div class="tag">' + esc(info.tagline) + '</div>');
      card.onclick = function () { UI.setup.faction = fid; fl.querySelectorAll('.faction-card').forEach(function (c) { c.classList.remove('on'); }); card.classList.add('on'); renderCommanders(); };
      fl.appendChild(card);
    });
    var sz = $('setup-size'); sz.innerHTML = ''; SOVL.ARMY_SIZES.forEach(function (s) { sz.appendChild(new Option(s.name + ' (' + s.pts + ' pts)', s.pts)); }); sz.value = 1000;
    var en = $('setup-enemy'); en.innerHTML = ''; en.appendChild(new Option('Random faction', 'random')); Object.keys(SOVL.FACTION_DATA).forEach(function (fid) { en.appendChild(new Option(SOVL.FACTION_DATA[fid].name, fid)); });
    function renderCommanders() {
      var box = $('setup-commanders'); box.innerHTML = '';
      var f = SOVL.FACTION_DATA[UI.setup.faction], cmds = f.sections[0].units;
      if (!UI.setup.commander || !cmds.some(function (c) { return c.id === UI.setup.commander; })) UI.setup.commander = cmds[0].id;
      cmds.forEach(function (c) {
        var card = el('div', 'unit-card' + (c.id === UI.setup.commander ? ' on' : ''), '<div class="head"><b>' + esc(c.name) + '</b><span class="muted">' + esc(c.type) + '</span></div>');
        card.style.cursor = 'pointer'; card.style.width = '300px';
        if (c.id === UI.setup.commander) card.style.borderColor = 'var(--accent)';
        card.appendChild(statsRow({ sk: c.stats[0], pw: c.stats[1], df: c.stats[2], at: c.stats[3], wd: c.stats[4], ds: c.stats[5] }, 'stats'));
        card.appendChild(el('div', 'props', c.props.map(propSpan).join(', ') + (c.caster ? ', Spellcaster(' + c.caster + ')' : '') + '<br><span class="muted">Retinue: ' + c.retinue.map(function (r) { return SOVL.findUnitDef(UI.setup.faction, r).name; }).join(', ') + '</span>'));
        card.onclick = function () { UI.setup.commander = c.id; renderCommanders(); };
        box.appendChild(card);
      });
      if (!$('setup-name').value || UI.setup.nameFaction !== UI.setup.faction) { $('setup-name').value = R.pick(SOVL.COMMANDER_NAMES[UI.setup.faction]); UI.setup.nameFaction = UI.setup.faction; }
    }
    renderCommanders();
    $('setup-next').onclick = function () {
      if (kind === 'skirmish') {
        var pts = parseInt(sz.value, 10);
        var army = UI.skirmishArmy && UI.skirmishArmy.faction === UI.setup.faction ? UI.skirmishArmy : { faction: UI.setup.faction, name: 'Your Army', entries: [] };
        UI.showBuilder(army, pts, function (finalArmy) {
          UI.skirmishArmy = finalArmy;
          var ef = en.value === 'random' ? R.pick(Object.keys(SOVL.FACTION_DATA)) : en.value;
          var enemy = A.randomArmy({ faction: ef, pts: pts });
          UI.startBattle({ armies: [finalArmy, enemy], terrain: A.randomTerrain({}), scenario: $('setup-scenario').value, names: ['You', SOVL.FACTION_DATA[ef].name], aggression: parseFloat($('setup-aggr').value), onEnd: function (b) { UI.showResult(b, { onDone: function () { UI.show('menu'); } }); } });
        });
      } else {
        R.setSeed(null);
        var camp = C.create({ faction: UI.setup.faction, commander: UI.setup.commander, name: $('setup-name').value.trim() || undefined });
        UI.campaign = camp; C.save(camp);
        UI.showCampaign();
        UI.modal('<h2>' + esc(SOVL.CAMPAIGN.acts[0].name) + '</h2><div class="text">' + esc(camp.commanderName) + ' rides out with a ragtag warband: ' + camp.army.entries.map(function (e) { return esc(A.entryLabel(camp.faction, e)); }).join(', ') + '.<br><br>Pick a node on the map to travel. Battles earn gold and veterancy; merchants and camps let you grow the army. Reach the end of Act III and defeat the Deathless Host.</div><div class="choices"><button class="primary" id="m-ok">Begin</button></div>');
        $('m-ok').onclick = UI.closeModal;
      }
    };
    UI.show('setup');
  };

  // ---------- army builder ----------
  UI.showBuilder = function (army, pts, onDone) {
    UI.builder = { army: army, pts: pts, onDone: onDone };
    $('builder-title').textContent = 'Army Builder — ' + SOVL.FACTION_DATA[army.faction].name;
    $('builder-auto').onclick = function () { UI.builder.army = A.randomArmy({ faction: army.faction, pts: pts }); UI.builder.army.name = 'Your Army'; renderBuilder(); };
    $('builder-clear').onclick = function () { UI.builder.army.entries = []; renderBuilder(); };
    $('builder-go').onclick = function () { var probs = A.validate(UI.builder.army, pts); if (probs.length) { UI.modal('<h2>Army not ready</h2><div class="text problems">' + probs.map(esc).join('<br>') + '</div><div class="choices"><button id="m-ok">OK</button></div>'); $('m-ok').onclick = UI.closeModal; return; } onDone(UI.builder.army); };
    renderBuilder();
    UI.show('builder');
  };
  function unitCardHtml(fid, def, withAdd) {
    var card = el('div', 'unit-card');
    var sizeTxt = def.per ? def.cost + ' pts/model · ' + def.size[0] + '–' + def.size[1] + ' models' : def.cost + ' pts';
    card.innerHTML = '<div class="head"><b>' + esc(def.name) + '</b><span class="muted">' + esc(def.type) + '</span><span class="spacer"></span><span class="accent">' + sizeTxt + '</span></div>';
    card.appendChild(statsRow({ sk: def.stats[0], pw: def.stats[1], df: def.stats[2], at: def.stats[3], wd: def.stats[4], ds: def.stats[5] }, 'stats'));
    var parts = [];
    if (def.weapons.length) parts.push(def.weapons.map(function (w) { return propSpan(w.name) + (w.cost ? ' (' + w.cost + ')' : ''); }).join(' / '));
    if (def.ranged.length) parts.push(def.ranged.map(function (w) { return propSpan(w.name); }).join(' / '));
    def.props.forEach(function (p) { parts.push(propSpan(p)); });
    (def.upgrades || []).forEach(function (u) { parts.push(propSpan(u.name) + ' (+' + u.cost + ')'); });
    if (def.caster) parts.push('Spellcaster(' + def.caster + ')');
    if (def.magic) parts.push(def.magic === 'weapon_item' ? 'Magic Weapon/Item' : 'Magic Item');
    if (def.banner) parts.push('Magic Banner (≤' + def.banner + ')');
    card.appendChild(el('div', 'props', parts.join(', ')));
    if (def.retinue) card.appendChild(el('div', 'props', '<span class="muted">Retinue: ' + def.retinue.map(function (r) { return esc(SOVL.findUnitDef(fid, r).name); }).join(', ') + '</span>'));
    return card;
  }
  function renderBuilder() {
    var b = UI.builder, army = b.army, fid = army.faction, f = SOVL.FACTION_DATA[fid];
    var cat = $('builder-catalog'); cat.innerHTML = '';
    f.sections.forEach(function (sec) {
      if (sec.name === 'Mounts') return;
      var lim = A.sectionLimits(sec, b.pts), n = army.entries.filter(function (e) { var s = SOVL.findSection(fid, e.id); return s && s.name === sec.name; }).length;
      cat.appendChild(el('h3', null, esc(sec.name) + ' <span class="muted" style="font-family:var(--font);font-size:11px">' + n + ' / ' + lim.max + (lim.min ? ' (min ' + lim.min + ')' : '') + '</span>'));
      sec.units.forEach(function (def) {
        var card = unitCardHtml(fid, def, true);
        var btn = el('button', 'small', '+ Add'); btn.style.marginTop = '4px';
        btn.disabled = n >= lim.max;
        btn.onclick = function () {
          if (sec.name === 'Commanders') army.entries.unshift(A.defaultCommander(fid, def.id, null, null));
          else army.entries.push(A.defaultEntry(fid, def.id));
          renderBuilder();
        };
        card.appendChild(btn); cat.appendChild(card);
      });
    });
    var list = $('builder-list'); list.innerHTML = '';
    var total = A.armyCost(army);
    $('builder-points').textContent = total + ' / ' + b.pts + ' pts';
    $('builder-points').className = total > b.pts ? 'danger' : 'accent';
    if (!army.entries.length) list.appendChild(el('p', 'muted', 'Add a commander and units from the catalogue. Every army needs one commander with a retinue and at least one Battle Line unit.'));
    army.entries.forEach(function (e, idx) {
      list.appendChild(entryEditor(fid, e, idx, function () { renderBuilder(); }, function () { army.entries.splice(idx, 1); renderBuilder(); }));
    });
    var probs = A.validate(army, b.pts);
    if (probs.length) list.appendChild(el('div', 'problems', probs.map(esc).join('<br>')));
  }
  function entryEditor(fid, e, idx, onChange, onRemove) {
    var isCmd = e.kind === 'commander', t = isCmd ? e.retinue : e, def = SOVL.findUnitDef(fid, t.id), cdef = isCmd ? SOVL.findUnitDef(fid, e.id) : null;
    var box = el('div', 'entry');
    var head = el('div', 'head', '<b>' + (isCmd ? esc(e.name) + ' <span class="muted">(' + esc(cdef.name) + ')</span>' : esc(def.name)) + '</b><span class="spacer"></span><span class="accent">' + A.entryCost(fid, e) + ' pts</span>');
    var rm = el('button', 'small danger', '✕'); rm.onclick = onRemove; head.appendChild(rm); box.appendChild(head);
    var opts = el('div', 'opts');
    function sel(labelTxt, options, value, cb) { var l = el('label', null, labelTxt + ' '); var s = el('select'); options.forEach(function (o) { s.appendChild(new Option(o.label, o.value)); }); s.value = value; s.onchange = function () { cb(s.value); onChange(); }; l.appendChild(s); return l; }
    if (isCmd) {
      opts.appendChild((function () { var l = el('label', null, 'Name '); var i = el('input'); i.type = 'text'; i.value = e.name; i.maxLength = 28; i.onchange = function () { e.name = i.value || cdef.name; onChange(); }; l.appendChild(i); return l; })());
      opts.appendChild(sel('Retinue', cdef.retinue.map(function (r) { return { label: SOVL.findUnitDef(fid, r).name, value: r }; }), t.id, function (v) { e.retinue = A.defaultEntry(fid, v); }));
      if (cdef.weapons.length > 1) opts.appendChild(sel('Weapon', cdef.weapons.map(function (w) { return { label: w.name + (w.cost ? ' (+' + w.cost + ')' : ''), value: w.name }; }), e.weapon, function (v) { e.weapon = v; }));
      (cdef.upgrades || []).forEach(function (u) { var l = el('label'); var c = el('input'); c.type = 'checkbox'; c.checked = (e.upgrades || []).indexOf(u.name) >= 0; c.onchange = function () { e.upgrades = (e.upgrades || []).filter(function (x) { return x !== u.name; }); if (c.checked) e.upgrades.push(u.name); onChange(); }; l.appendChild(c); l.appendChild(document.createTextNode(u.name + ' (+' + u.cost + ')')); opts.appendChild(l); });
      if (cdef.magic) {
        var items = e.items || [];
        var wOpts = [{ label: 'No magic weapon', value: '' }].concat(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === 'weapon'; }).map(function (i) { return { label: i.name + ' (+' + i.cost + ') — ' + i.desc, value: i.id }; }));
        var iOpts = [{ label: 'No magic item', value: '' }].concat(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === 'item'; }).map(function (i) { return { label: i.name + ' (+' + i.cost + ') — ' + i.desc, value: i.id }; }));
        var curW = items.filter(function (id) { return SOVL.itemById(id).kind === 'weapon'; })[0] || '', curI = items.filter(function (id) { return SOVL.itemById(id).kind === 'item'; })[0] || '';
        if (cdef.magic === 'weapon_item') opts.appendChild(sel('Magic weapon', wOpts, curW, function (v) { e.items = (e.items || []).filter(function (id) { return SOVL.itemById(id).kind !== 'weapon'; }); if (v) e.items.push(v); }));
        opts.appendChild(sel('Magic item', iOpts, curI, function (v) { e.items = (e.items || []).filter(function (id) { return SOVL.itemById(id).kind !== 'item'; }); if (v) e.items.push(v); }));
      }
      if (cdef.caster) {
        var sp = el('div', null, '<span class="muted">Spells (' + cdef.caster + '):</span> '); sp.style.gridColumn = '1 / -1';
        cdef.spells.forEach(function (name) {
          var l = el('label', 'pill' + ((e.spells || []).indexOf(name) >= 0 ? ' on' : '')); l.setAttribute('data-tip', '<b>' + esc(name) + '</b><br>' + esc(SOVL.SPELLS[name].desc) + '<br>Casting value ' + SOVL.SPELLS[name].cv);
          l.style.cursor = 'pointer'; l.textContent = name;
          l.onclick = function () { e.spells = e.spells || []; var i = e.spells.indexOf(name); if (i >= 0) e.spells.splice(i, 1); else if (e.spells.length < cdef.caster) e.spells.push(name); onChange(); };
          sp.appendChild(l);
        });
        opts.appendChild(sp);
      }
      var rh = el('div', null, '<b class="muted">Retinue: ' + esc(def.name) + '</b>'); rh.style.gridColumn = '1 / -1'; rh.style.marginTop = '4px'; opts.appendChild(rh);
    }
    if (def.per) opts.appendChild((function () { var l = el('label', null, 'Models <b id="m' + idx + '">' + t.models + '</b> '); var r = el('input'); r.type = 'range'; r.min = def.size[0]; r.max = def.size[1]; r.value = t.models; r.oninput = function () { t.models = parseInt(r.value, 10); l.querySelector('b').textContent = t.models; }; r.onchange = onChange; l.appendChild(r); return l; })());
    if (def.weapons.length > 1) opts.appendChild(sel('Weapon', def.weapons.map(function (w) { return { label: w.name + (w.cost ? ' (+' + w.cost + (def.per ? '/model' : '') + ')' : ''), value: w.name }; }), t.weapon, function (v) { t.weapon = v; }));
    if (def.ranged.length > 1) opts.appendChild(sel('Ranged', def.ranged.map(function (w) { return { label: w.name + (w.cost ? ' (+' + w.cost + ')' : ''), value: w.name }; }), t.ranged, function (v) { t.ranged = v; }));
    (def.upgrades || []).forEach(function (u) { var l = el('label'); var c = el('input'); c.type = 'checkbox'; c.checked = (t.upgrades || []).indexOf(u.name) >= 0; c.onchange = function () { t.upgrades = (t.upgrades || []).filter(function (x) { return x !== u.name; }); if (c.checked) t.upgrades.push(u.name); onChange(); }; l.appendChild(c); l.appendChild(document.createTextNode(u.name + ' (+' + u.cost + (def.per && (SOVL.WEAPONS[u.name] || SOVL.RANGED[u.name]) ? '/model' : '') + ')')); opts.appendChild(l); });
    if (def.banner) opts.appendChild(sel('Banner', [{ label: 'No banner', value: '' }].concat(SOVL.BANNERS.filter(function (b) { return b.cost <= def.banner; }).map(function (b) { return { label: b.name + ' (+' + b.cost + ') — ' + b.desc, value: b.id }; })), t.banner || '', function (v) { t.banner = v || null; }));
    if (!SOVL.isSingle(def.type)) opts.appendChild(sel('Frontage', [3, 4, 5, 6, 7, 8, 10].filter(function (n) { return n >= SOVL.UNIT_TYPES[def.type].minFiles && n <= SOVL.UNIT_TYPES[def.type].maxFiles; }).map(function (n) { return { label: n + ' wide', value: n }; }), t.files || SOVL.UNIT_TYPES[def.type].files, function (v) { t.files = parseInt(v, 10); }));
    box.appendChild(opts);
    return box;
  }

  // ---------- battle ----------
  UI.startBattle = function (opts) {
    if (UI.aiTimer) { clearTimeout(UI.aiTimer); UI.aiTimer = null; }
    R.setSeed(null);
    var b = new SOVL.Battle({ armies: opts.armies, terrain: opts.terrain, scenario: opts.scenario, names: opts.names, sides: ['bottom', 'top'], scoreMode: opts.campaign ? 'ratio' : 'points', interactiveCombat: true });
    UI.battle = b; UI.battleOpts = opts; UI.ai = new SOVL.AI(b, UI.aiSide, { aggression: opts.aggression || 0.5 });
    UI.sel = null; UI.inspect = null; UI.hover = null; UI.mode = 'move'; UI.targets = []; UI.preview = null; UI.busy = false; UI.deploySel = null;
    UI.ai.deploy(); // simultaneous deployment: hidden until the player is done
    if (!UI.renderer) { UI.renderer = new SOVL.Renderer($('battle-canvas')); UI.bindCanvas(); }
    UI.renderer.zoom = 1; UI.renderer.panX = 0; UI.renderer.panY = 0;
    b.units.forEach(function (u) { u._rx = u.x; u._ry = u.y; u._ra = u.a; });
    $('battle-log').innerHTML = ''; UI.logCount = 0;
    UI.show('battle');
    UI.renderDeployTray();
    UI.updateHud();
    if (!UI.rafOn) { UI.rafOn = true; requestAnimationFrame(UI.frame); }
    UI.processEvents();
  };
  UI.frame = function (now) {
    if (UI.screen === 'battle' && UI.battle) {
      var st = { playerSide: UI.playerSide, selected: UI.sel || UI.inspect || UI.deploySel, hover: UI.hover, targets: UI.targets, preview: UI.preview, mode: UI.mode, spell: UI.spell, hideSide: UI.battle.phase === 'deploy' ? UI.aiSide : null };
      var b = UI.battle;
      if (st.hideSide != null) { var saved = b.units; b.units = b.units.filter(function (u) { return u.side !== st.hideSide; }); try { UI.renderer.draw(b, st, now); } finally { b.units = saved; } }
      else UI.renderer.draw(b, st, now);
    }
    requestAnimationFrame(UI.frame);
  };
  UI.bindCanvas = function () {
    var cv = $('battle-canvas'), r = UI.renderer;
    cv.addEventListener('mousemove', function (e) {
      var p = r.toWorld(e.offsetX, e.offsetY), b = UI.battle; if (!b) return;
      if (UI.panning) { r.panX += e.movementX; r.panY += e.movementY; return; }
      var u = r.unitAt(b, p); if (u && b.phase === 'deploy' && u.side === UI.aiSide) u = null;
      UI.hover = u ? u.uid : null;
      var tip = $('tip');
      if (u) { tip.innerHTML = UI.unitTip(u); tip.style.display = 'block'; UI.canvasTip = true; positionTip(e.clientX, e.clientY); }
      else if (UI.canvasTip) { tip.style.display = 'none'; UI.canvasTip = false; }
      if (b.phase === 'deploy' && UI.dragging) { var d = UI.dragging; var rect = { x: p.x - d.dx, y: p.y - d.dy, a: d.u.a, w: d.u.w, d: d.u.d }; if (b.placementValid(d.u, rect, [])) { d.u.x = rect.x; d.u.y = rect.y; d.u.placed = true; } return; }
      if (b.phase === 'strategic' && UI.sel && b.activeUnit === UI.sel && UI.mode === 'move' && !u) {
        var su = b.unit(UI.sel); UI.preview = su && (su.moveLeft > 0 || su.typeInfo.pivot === 0) ? b.previewMove(UI.sel, p, e.shiftKey || su.moveLeft <= 0) : null;
      } else UI.preview = null;
    });
    cv.addEventListener('mouseleave', function () { UI.hover = null; UI.preview = null; $('tip').style.display = 'none'; UI.canvasTip = false; });
    cv.addEventListener('mousedown', function (e) {
      if (e.button === 1 || e.button === 2) { UI.panning = true; e.preventDefault(); return; }
      var b = UI.battle; if (!b || b.phase !== 'deploy') return;
      var p = r.toWorld(e.offsetX, e.offsetY), u = r.unitAt(b, p);
      if (u && u.side === UI.playerSide) { UI.dragging = { u: u, dx: p.x - u.x, dy: p.y - u.y }; UI.deploySel = u.uid; UI.renderDeployTray(); }
    });
    window.addEventListener('mouseup', function (e) { UI.panning = false; if (UI.dragging) { UI.dragging = null; UI.renderDeployTray(); } });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var z = r.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12); r.zoom = G.clamp(z, 0.8, 3); }, { passive: false });
    cv.addEventListener('click', function (e) { if (UI.dragging) return; var p = r.toWorld(e.offsetX, e.offsetY); UI.canvasClick(p, e); });
    window.addEventListener('keydown', function (e) {
      if (UI.screen !== 'battle' || UI.modalOpen) return;
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
      var b = UI.battle; if (!b) return;
      if (e.key === 'x' || e.key === 'X') { if (e.shiftKey) r.showRanges = !r.showRanges; else r.showArcs = !r.showArcs; UI.updateToggles(); }
      if (e.key === 'Escape') { UI.mode = 'move'; UI.targets = []; if (b.phase === 'charge') UI.sel = null; UI.preview = null; UI.updateHud(); }
      if (b.phase === 'deploy' && UI.deploySel) { var du = b.unit(UI.deploySel); if (du && (e.key === 'q' || e.key === 'Q')) UI.rotateDeploy(du, -1); if (du && (e.key === 'e' || e.key === 'E')) UI.rotateDeploy(du, 1); }
      if (b.phase === 'strategic' && UI.sel && b.activeUnit === UI.sel) { if (e.key === 'q' || e.key === 'Q') { if (!b.pivot(UI.sel, -1)) UI.hint('Cannot pivot: no movement left or no room.'); UI.updateHud(); } if (e.key === 'e' || e.key === 'E') { if (!b.pivot(UI.sel, 1)) UI.hint('Cannot pivot: no movement left or no room.'); UI.updateHud(); } }
      if (b.phase === 'strategic' && b.active === UI.playerSide && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); UI.endActivation(); }
      if (b.phase === 'charge' && (e.key === 'Enter' || e.key === ' ') && b.active === UI.playerSide) UI.passCharge();
    });
    $('tog-arcs').onclick = function () { r.showArcs = !r.showArcs; UI.updateToggles(); };
    $('tog-ranges').onclick = function () { r.showRanges = !r.showRanges; UI.updateToggles(); };
    $('tog-zoom').onclick = function () { r.zoom = r.zoom > 1.01 ? 1 : 1.6; r.panX = 0; r.panY = 0; };
  };
  UI.updateToggles = function () { $('tog-arcs').className = 'small' + (UI.renderer.showArcs ? ' primary' : ''); $('tog-ranges').className = 'small' + (UI.renderer.showRanges ? ' primary' : ''); };
  UI.rotateDeploy = function (u, dir) { var b = UI.battle, a = u.a + dir * Math.PI / 4, rect = { x: u.x, y: u.y, a: a, w: u.w, d: u.d }; if (b.placementValid(u, rect, [])) u.a = a; else UI.hint('No room to rotate ' + u.name + ' here. Move it first.'); };
  UI.unitTip = function (u) {
    var b = UI.battle, s = SOVL.effStats(u, b), mv = SOVL.moveAllowance(u, b);
    var lines = ['<b>' + esc(u.name) + '</b> <span class="muted">' + esc(u.type) + (u.side === UI.playerSide ? '' : ' · enemy') + '</span>'];
    if (!SOVL.commanderOnly(u)) lines.push(u.models + '/' + u.maxModels + ' models · ' + u.files + ' wide · Move ' + mv);
    lines.push('Sk ' + s.sk + ' · Pw ' + s.pw + ' · Df ' + s.df + ' · At ' + s.at + ' · Wd ' + s.wd + ' · Ds ' + s.ds + (SOVL.commanderOnly(u) ? '' : ' (+' + R.rankBonus(u.models, u.files) + ' ranks)'));
    lines.push(esc(u.weapon) + (u.ranged ? ' · ' + esc(u.ranged) : ''));
    if (u.commander) lines.push((u.commander.alive ? '★ ' : '✝ ') + esc(u.commander.name) + (u.commander.alive ? ' (' + (u.commander.maxWounds - u.commander.wounds) + '/' + u.commander.maxWounds + ' W)' : ' — slain'));
    var status = []; if (u.fleeing) status.push('FLEEING'); if (b.isEngaged(u)) status.push('engaged'); if (u.activated && b.phase === 'strategic') status.push('activated'); if (u.declaredCharge) status.push('charging');
    if (status.length) lines.push('<span class="accent">' + status.join(' · ') + '</span>');
    if (u.effects.length) lines.push('<span class="muted">' + u.effects.map(function (e) { return esc(e.name); }).join(', ') + '</span>');
    return lines.join('<br>');
  };

  // Deployment tray
  UI.renderDeployTray = function () {
    var b = UI.battle, tray = $('deploy-tray');
    if (b.phase !== 'deploy') { tray.style.display = 'none'; $('battle-log').style.display = ''; return; }
    tray.style.display = ''; $('battle-log').style.display = 'none'; tray.innerHTML = '';
    tray.appendChild(el('h3', null, 'Deploy your army'));
    tray.appendChild(el('p', 'muted', 'Click a unit, then click inside your deployment zone (the blue band). Drag to reposition, <kbd>Q</kbd>/<kbd>E</kbd> to rotate. Ambushers may deploy anywhere on your half.'));
    b.unitsOf(UI.playerSide).forEach(function (u) {
      var d = el('div', 'tray-unit' + (UI.deploySel === u.uid ? ' on' : '') + (u.placed ? ' placed' : ''), '<b>' + esc(u.name) + '</b> <span class="muted">' + (SOVL.isSingle(u.type) ? '' : u.models + ' models, ' + u.files + ' wide') + (u.placed ? ' ✓' : '') + '</span>');
      d.onclick = function () { UI.deploySel = u.uid; UI.renderDeployTray(); };
      if (UI.deploySel === u.uid && !SOVL.isSingle(u.type)) {
        var row = el('div', 'row'); row.style.marginTop = '4px';
        var narrow = el('button', 'small', '− narrower'), widen = el('button', 'small', '+ wider'), rotL = el('button', 'small', '↺ Q'), rotR = el('button', 'small', '↻ E');
        narrow.onclick = function (e) { e.stopPropagation(); b.setFiles(u.uid, u.files - 1); if (u.placed && !b.placementValid(u, u, [])) u.placed = false; UI.renderDeployTray(); };
        widen.onclick = function (e) { e.stopPropagation(); b.setFiles(u.uid, u.files + 1); if (u.placed && !b.placementValid(u, u, [])) u.placed = false; UI.renderDeployTray(); };
        rotL.onclick = function (e) { e.stopPropagation(); UI.rotateDeploy(u, -1); }; rotR.onclick = function (e) { e.stopPropagation(); UI.rotateDeploy(u, 1); };
        row.appendChild(narrow); row.appendChild(widen); row.appendChild(rotL); row.appendChild(rotR); d.appendChild(row);
      }
      tray.appendChild(d);
    });
    var row2 = el('div', 'row'); row2.style.marginTop = '10px';
    var auto = el('button', null, 'Auto-deploy'); auto.onclick = function () { b.unitsOf(UI.playerSide).forEach(function (u) { u.placed = false; u.x = -1000; u.y = -1000; }); b.autoDeploy(UI.playerSide); b.units.forEach(function (u) { if (u.side === UI.playerSide) { u._rx = u.x; u._ry = u.y; u._ra = u.a; } }); UI.renderDeployTray(); };
    var go = el('button', 'primary', 'Begin Battle'); go.disabled = !b.allPlaced(UI.playerSide);
    go.onclick = function () { UI.beginBattle(); };
    row2.appendChild(auto); row2.appendChild(go); tray.appendChild(row2);
    UI.updateHud();
  };
  UI.beginBattle = function () {
    var b = UI.battle; b.deployed[UI.playerSide] = true;
    UI.deploySel = null;
    b.start();
    UI.renderDeployTray();
    UI.processEvents(); UI.updateHud(); UI.pumpAI();
  };

  // Canvas click routing
  UI.canvasClick = function (p, e) {
    var b = UI.battle, r = UI.renderer; if (!b || UI.modalOpen) return;
    e = e || {};
    var u = r.unitAt(b, p); if (u && b.phase === 'deploy' && u.side === UI.aiSide) u = null;
    if (b.phase === 'combat') { if (u && UI.selectEngagement) UI.selectEngagement(u.uid); return; }
    if (b.phase === 'deploy') {
      if (u && u.side === UI.playerSide) { UI.deploySel = u.uid; UI.renderDeployTray(); return; }
      if (UI.deploySel) { var du = b.unit(UI.deploySel); var a = du.placed ? du.a : b.facingFor(UI.playerSide); if (b.placeUnit(du.uid, p.x, p.y, a)) { du._rx = du.x; du._ry = du.y; du._ra = du.a; UI.renderDeployTray(); } else UI.hint('That position is outside your deployment zone or overlaps something.'); }
      return;
    }
    if (b.phase === 'end') return;
    if (b.active !== UI.playerSide) { if (u) { UI.inspect = u.uid; UI.updateHud(); } return; }
    if (b.phase === 'charge') {
      if (u && u.side === UI.playerSide) { UI.sel = u.uid; UI.inspect = null; UI.targets = b.canDeclareCharge(u) ? b.validChargeTargets(u).map(function (t) { return t.unit.uid; }) : []; UI.updateHud(); return; }
      if (u && UI.sel && UI.targets.indexOf(u.uid) >= 0) { var res = b.declareCharge(UI.sel, u.uid); if (!res.ok) UI.hint(res.reason); else { UI.sel = null; UI.targets = []; UI.afterPlayerAction(); } return; }
      if (u) { UI.inspect = u.uid; if (UI.sel) { var ci = b.chargeInfo(b.unit(UI.sel), u); if (!ci.ok) UI.hint('Cannot charge ' + u.name + ': ' + ci.reason); } UI.updateHud(); }
      return;
    }
    if (b.phase === 'strategic') {
      if (UI.mode === 'shoot' || UI.mode === 'spell' || UI.mode === 'ability') {
        if (u && UI.targets.indexOf(u.uid) >= 0) { UI.doTargeted(u); return; }
        if (u) { UI.hint('Not a valid target.'); return; }
        UI.mode = 'move'; UI.targets = []; UI.updateHud(); return;
      }
      if (u && u.side === UI.playerSide) {
        if (b.activeUnit && b.activeUnit !== u.uid) { UI.inspect = u.uid; UI.hint('Finish the current activation first (End Activation).'); UI.updateHud(); return; }
        if (!b.canActivate(u)) { UI.inspect = u.uid; UI.hint(u.name + ' has already been activated this turn.'); UI.updateHud(); return; }
        var ra = b.beginActivation(u.uid); if (!ra.ok) { UI.hint(ra.reason); return; }
        UI.sel = u.uid; UI.inspect = null; UI.mode = 'move'; UI.targets = []; UI.processEvents(); UI.updateHud(); return;
      }
      if (u) { UI.inspect = u.uid; UI.updateHud(); return; }
      // ground click: move
      if (UI.sel && b.activeUnit === UI.sel) {
        var su = b.unit(UI.sel); if (su.moveLeft <= 0 && su.typeInfo.pivot > 0) { UI.hint('No movement left.'); return; }
        var mv = b.previewMove(UI.sel, p, e.shiftKey || su.moveLeft <= 0);
        if (mv.ok) { b.applyMove(UI.sel, mv); UI.preview = null; UI.processEvents(); UI.updateHud(); } else UI.hint(mv.reason || 'Cannot move there.');
      }
    }
  };
  UI.doTargeted = function (t) {
    var b = UI.battle, res;
    if (UI.mode === 'shoot') res = b.shoot(UI.sel, t.uid, UI.shootCommander);
    else if (UI.mode === 'spell') res = b.cast(UI.sel, UI.spell, t.uid);
    else if (UI.mode === 'ability') res = b.useAbility(UI.sel, UI.ability, t.uid);
    if (res && !res.ok) UI.hint(res.reason);
    UI.mode = 'move'; UI.targets = []; UI.processEvents(); UI.updateHud();
    if (b.phase === 'end') UI.onEnd();
  };
  UI.hint = function (txt) { $('battle-hint').textContent = txt; };
  UI.afterPlayerAction = function () { UI.processEvents(); UI.updateHud(); if (UI.battle.phase === 'end') { UI.onEnd(); return; } UI.pumpAI(); };
  UI.passCharge = function () { var b = UI.battle; if (b.phase !== 'charge' || b.active !== UI.playerSide) return; UI.sel = null; UI.targets = []; b.passCharge(); UI.afterPlayerAction(); };
  UI.endActivation = function () { var b = UI.battle; if (b.phase !== 'strategic' || b.active !== UI.playerSide) return; if (b.activeUnit) b.endActivation(); else b.passStrategic(); UI.sel = null; UI.mode = 'move'; UI.targets = []; UI.preview = null; UI.afterPlayerAction(); };

  // AI pacing: one action per tick so the player can follow along
  UI.pumpAI = function () {
    var b = UI.battle; if (!b || b.phase === 'end') { if (b && b.phase === 'end') UI.onEnd(); return; }
    if (b.phase === 'combat' || UI.combatAnimating) return;
    if (UI.aiTimer) return;
    if (b.active !== UI.aiSide) return;
    UI.aiTimer = setTimeout(function () {
      UI.aiTimer = null;
      if (UI.battle !== b || UI.screen !== 'battle') return;
      if (UI.modalOpen) return; // closing a modal resumes the pump
      if (b.phase === 'combat') return;
      var phaseBefore = b.phase, logBefore = b.log.length;
      if (b.active === UI.aiSide && b.phase !== 'end') UI.ai.step();
      UI.processEvents(); UI.updateHud();
      if (b.phase === 'end') { UI.onEnd(); return; }
      if (b.active === UI.aiSide) UI.pumpAI();
    }, UI.aiDelay);
  };

  // Animation and log events from the engine
  UI.processEvents = function () {
    var b = UI.battle, r = UI.renderer, evs = b.events; b.events = [];
    var showCombat = false;
    evs.forEach(function (ev) {
      var u = b.unit(ev.uid || ev.from) || findDead(ev.uid || ev.from);
      switch (ev.type) {
        case 'shoot': { var f = b.unit(ev.from), t = b.unit(ev.to) || findDead(ev.to); if (f && t) { for (var i = 0; i < Math.min(6, Math.max(1, ev.hits)); i++) r.addProjectile({ x: f.x + (Math.random() - 0.5) * f.w, y: f.y + (Math.random() - 0.5) * f.d }, { x: t.x + (Math.random() - 0.5) * t.w, y: t.y + (Math.random() - 0.5) * t.d }, f.side === UI.playerSide ? '#cfe6ff' : '#ffd0d0', 380 + i * 60); r.addFloater(t.x, t.y - 1, ev.wounds ? '-' + ev.wounds : 'miss', ev.wounds ? '#ff8080' : '#ccc'); } break; }
        case 'spell': { var c = b.unit(ev.from), tt = b.unit(ev.to) || findDead(ev.to); if (tt) { r.addFlash(tt.x, tt.y, 2, ev.ok ? '#c090ff' : '#666'); r.addFloater(tt.x, tt.y - 1, ev.ok ? ev.spell : 'fizzle', ev.ok ? '#d8b0ff' : '#999'); } break; }
        case 'charge': { var cu = b.unit(ev.uid); if (cu) r.addFloater(cu.x, cu.y - 1, 'CHARGE!', '#ffd24a'); break; }
        case 'flee': { var fu = b.unit(ev.uid) || findDead(ev.uid); if (fu) r.addFloater(ev.from.x, ev.from.y - 1, 'flees ' + (ev.dice ? ev.dice.reduce(function (s, d) { return s + d; }, 0) + '"' : ''), '#f7f7a0'); break; }
        case 'destroy': { var du = findDead(ev.uid); if (du) { r.addFlash(du.x, du.y, 2.5, '#ff6b3b'); r.addFloater(du.x, du.y - 1, ev.how === 'fled' ? 'FLED THE FIELD' : ev.how === 'run down' ? 'RUN DOWN' : 'DESTROYED', '#ff9a6b'); } break; }
        case 'commanderDeath': { var cd = b.unit(ev.uid) || findDead(ev.uid); if (cd) r.addFloater(cd.x, cd.y - 2, 'COMMANDER SLAIN', '#ff6b6b'); break; }
        case 'rundown': break;
        case 'summon': { var su = b.unit(ev.uid); if (su) { su._rx = su.x; su._ry = su.y; su._ra = su.a; r.addFlash(su.x, su.y, 3, '#9060ff'); } break; }
        case 'endTurn': if (!b.interactiveCombat && b.combatReports && b.combatReports.length) showCombat = true; break;
        case 'phase': if (ev.phase === 'charge') UI.hint('Turn ' + ev.turn + ' — Charge Phase. Select a unit and click an enemy within its arc to declare a charge, or Pass.'); if (ev.phase === 'strategic') UI.hint('Strategic Phase. Click one of your units to activate it, click the ground to move, or use the action buttons.'); break;
      }
    });
    UI.renderLog();
    if (showCombat) UI.showCombatReports(b.combatReports);
    function findDead(uid) { for (var i = 0; i < b.dead.length; i++) if (b.dead[i].uid === uid) return b.dead[i]; return null; }
  };
  function diceHtml(dice, target, kind) {
    if (!dice || !dice.length) return '';
    var cls = kind === 'save' ? ['save', 'fail'] : ['hit', 'miss'];
    return '<div class="dice">' + dice.slice(0, 40).map(function (d) { return '<span class="die ' + (d >= target ? cls[0] : cls[1]) + '">' + d + '</span>'; }).join('') + (dice.length > 40 ? '<span class="muted"> +' + (dice.length - 40) + '</span>' : '') + '</div>';
  }
  UI.renderLog = function () {
    var b = UI.battle, box = $('battle-log');
    if (UI.logBattle !== b) { box.innerHTML = ''; UI.logCount = 0; UI.logBattle = b; }
    var atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    var total = b.logSeq || 0, start = Math.max(0, b.log.length - (total - UI.logCount));
    for (var i = start; i < b.log.length; i++) {
      var l = b.log[i], d = el('div', 'l ' + l.kind, esc(l.text));
      if (l.data) {
        if (l.data.hitDice) d.innerHTML += diceHtml(l.data.hitDice, l.data.hitTarget, 'hit');
        if (l.data.saveDice && l.data.saveDice.length) d.innerHTML += '<span class="muted" style="font-size:10px">saves (' + l.data.saveTarget + '+)</span>' + diceHtml(l.data.saveDice, l.data.saveTarget, 'save');
        if (l.data.discDice) d.innerHTML += '<div class="dice">' + l.data.discDice.map(function (x) { return '<span class="die big">' + x + '</span>'; }).join('') + '</div>';
        if (l.data.dice && !l.data.discDice && !l.data.hitDice) d.innerHTML += '<div class="dice">' + l.data.dice.map(function (x) { return '<span class="die">' + x + '</span>'; }).join('') + '</div>';
      }
      box.appendChild(d);
    }
    UI.logCount = total;
    while (box.children.length > 600) box.removeChild(box.firstChild);
    if (atBottom) box.scrollTop = box.scrollHeight;
  };
  UI.showCombatReports = function (reports) {
    var b = UI.battle, box = el('div');
    box.appendChild(el('h2', null, 'Combat Phase — Turn ' + (reports[0] && reports[0].turn != null ? reports[0].turn : b.turn - (b.phase === 'charge' ? 1 : 0))));
    reports.forEach(function (rep) {
      var d = el('div', 'combat-report');
      d.appendChild(el('div', 'vs', esc(rep.names.join('  vs  '))));
      rep.rounds.forEach(function (rd) {
        var a = el('div', 'atk');
        a.innerHTML = '<span class="who"><b>' + esc(rd.who) + '</b> → ' + esc(rd.targetName) + '</span><span>' + rd.dice + ' dice, ' + rd.hits + ' hits (' + rd.hitTarget + '+)</span><span class="' + (rd.wounds ? 'danger' : 'muted') + '">' + rd.wounds + ' wounds' + (rd.killed ? ', ' + rd.killed + ' slain' : '') + (rd.commanderKilled ? ' — COMMANDER SLAIN' : '') + '</span>';
        a.innerHTML += '<div style="flex-basis:100%">' + diceHtml(rd.hitDice, rd.hitTarget, 'hit') + (rd.saveDice.length ? '<span class="muted" style="font-size:10px"> saves ' + rd.saveTarget + '+ </span>' + diceHtml(rd.saveDice, rd.saveTarget, 'save') : '') + '</div>';
        d.appendChild(a);
      });
      d.appendChild(el('div', 'score', 'Combat score: <span class="accent">' + esc(b.names[0]) + ' ' + rep.score[0] + '</span> — <span class="danger">' + esc(b.names[1]) + ' ' + rep.score[1] + '</span>' + (rep.score[0] === rep.score[1] ? ' · draw' : '')));
      rep.breakTests.forEach(function (bt) {
        d.appendChild(el('div', null, esc(bt.name) + ': break test needs ' + bt.value + ', rolled ' + bt.dice.join('+') + ' — ' + (bt.reanimated ? 'Reanimated, crumbles ' + (bt.crumble || 0) : bt.ok ? '<span class="ok">holds</span>' : '<span class="danger">BREAKS' + (bt.escaped ? ' and flees the field' : '') + '</span>')));
      });
      box.appendChild(d);
    });
    var ok = el('button', 'primary', 'Continue'); ok.onclick = function () { UI.closeModal(); if (b.phase === 'end' || UI.pendingEnd) UI.onEnd(); else UI.pumpAI(); };
    box.appendChild(ok);
    UI.modalDismissable = false; UI.modal(box);
  };

  // HUD: phase bar, unit info and actions
  UI.updateHud = function () {
    var b = UI.battle; if (!b) return;
    var phaseName = { deploy: 'DEPLOYMENT', charge: 'CHARGE PHASE', strategic: 'STRATEGIC PHASE', combat: 'COMBAT PHASE', end: 'BATTLE OVER' }[b.phase];
    $('battle-phase').textContent = phaseName;
    $('battle-turn').textContent = b.phase === 'deploy' ? (b.scenario === 'objectives' ? 'Scoring Objectives' : 'Pitched Battle') : 'Turn ' + b.turn + ' / ' + b.maxTurns;
    var who = $('battle-who'); who.textContent = b.phase === 'deploy' || b.phase === 'end' ? '' : (b.active === UI.playerSide ? 'Your activation' : b.names[UI.aiSide] + ' is acting…'); who.className = 'who' + (b.active === UI.aiSide ? ' enemy' : '');
    $('battle-score').textContent = b.phase === 'deploy' ? '' : 'Score ' + b.scoreFor(0) + ' — ' + b.scoreFor(1) + (b.scenario === 'objectives' ? ' · objectives' : '') + (b.scoreMode === 'ratio' ? ' (share of army value)' : '');
    var info = $('battle-unitinfo'), act = $('battle-actions'); info.innerHTML = ''; act.innerHTML = '';
    var uid = UI.sel || UI.inspect || UI.deploySel, u = uid ? b.unit(uid) : null;
    if (!u) { info.appendChild(el('p', 'muted', b.phase === 'deploy' ? 'Deploy your units, then Begin Battle.' : 'Click a unit to see its profile. Your units have a blue front edge; enemies red.')); }
    else info.appendChild(UI.unitInfoPanel(u));
    // actions
    if (b.phase === 'charge' && b.active === UI.playerSide) {
      if (u && u.side === UI.playerSide) {
        var cc = b.canCounterCharge(u), cf = b.canFlee(u);
        if (b.canDeclareCharge(u)) act.appendChild(el('div', 'muted', UI.targets.length ? 'Click a highlighted enemy to charge it.' : 'No valid charge targets for this unit.'));
        if (cc) { var bc = el('button', 'primary', 'Counter-charge ' + cc.charger.name); bc.onclick = function () { var r = b.declareCounterCharge(u.uid); if (!r.ok) UI.hint(r.reason); UI.sel = null; UI.targets = []; UI.afterPlayerAction(); }; act.appendChild(bc); }
        if (cf) { var bf = el('button', null, 'Flee from ' + cf.charger.name); bf.onclick = function () { var r = b.declareFlee(u.uid); if (!r.ok) UI.hint(r.reason); UI.sel = null; UI.targets = []; UI.afterPlayerAction(); }; act.appendChild(bf); }
        var inc = b.chargeAgainst(u); if (inc.length && !cc && !cf && !u.declaredCharge) act.appendChild(el('div', 'muted', 'A charge is coming in against this unit; it must hold.'));
      } else act.appendChild(el('div', 'muted', 'Select one of your units to declare a charge.'));
      var pass = el('button', null, 'Pass (no more charges)'); pass.onclick = UI.passCharge; act.appendChild(pass);
    } else if (b.phase === 'strategic' && b.active === UI.playerSide) {
      if (u && u.side === UI.playerSide && b.activeUnit === u.uid) {
        if (u.fleeing) { var br = el('button', 'primary', 'Rally (Discipline test)'); br.onclick = function () { var r = b.rally(u.uid); UI.sel = null; UI.afterPlayerAction(); }; act.appendChild(br); }
        else {
          act.appendChild(el('div', 'muted', 'Movement left: <b>' + u.moveLeft.toFixed(1) + '"</b>' + (b.isEngaged(u) ? ' (engaged)' : '') + '. Click the ground to move; <kbd>Shift</kbd>-click to only pivot; <kbd>Q</kbd>/<kbd>E</kbd> pivot 45°.'));
          if (b.rangedWeaponOf(u, false) && !u.usedRanged && !u.usedAbility && !b.isEngaged(u)) { var bs = el('button', UI.mode === 'shoot' && !UI.shootCommander ? 'primary' : '', 'Shoot: ' + u.ranged); bs.onclick = function () { UI.enterTargetMode('shoot', null, false); }; act.appendChild(bs); }
          if (b.rangedWeaponOf(u, true) && !u.usedSpell && !b.isEngaged(u)) { var bcs = el('button', '', u.commander.name + ' shoots: ' + u.commander.ranged); bcs.onclick = function () { UI.enterTargetMode('shoot', null, true); }; act.appendChild(bcs); }
          if (b.canCast(u)) u.commander.spells.forEach(function (sp) { if (u.spellsCastThisTurn[sp]) return; var n = b.spellTargets(u, sp).length; var bsp = el('button', UI.mode === 'spell' && UI.spell === sp ? 'primary' : '', 'Cast ' + sp + (n ? '' : ' (no target)')); bsp.setAttribute('data-tip', esc(SOVL.SPELLS[sp].desc) + ' Casting value ' + SOVL.SPELLS[sp].cv + '.'); bsp.disabled = !n; bsp.onclick = function () { var ts = b.spellTargets(u, sp); if (ts.length === 1 && ts[0] === u) { var r = b.cast(u.uid, sp, u.uid); if (!r.ok) UI.hint(r.reason); UI.processEvents(); UI.updateHud(); if (b.phase === 'end') UI.onEnd(); } else UI.enterTargetMode('spell', sp); }; act.appendChild(bsp); });
          b.unitAbilities(u).concat(b.commanderAbilities(u)).forEach(function (ab) {
            var used = ab.level === 'unit' ? (u.usedAbility || u.usedRanged) : u.usedSpell; if (used) return;
            var n = b.abilityTargets(u, ab.id).length; var bab = el('button', UI.mode === 'ability' && UI.ability === ab.id ? 'primary' : '', ab.name); bab.setAttribute('data-tip', esc(ab.desc)); bab.disabled = !n;
            bab.onclick = function () { var ts = b.abilityTargets(u, ab.id); if (ts.length === 1 && ts[0] === u) { var r = b.useAbility(u.uid, ab.id, u.uid); if (!r.ok) UI.hint(r.reason); UI.processEvents(); UI.updateHud(); } else UI.enterTargetMode('ability', ab.id); };
            act.appendChild(bab);
          });
        }
        var end = el('button', 'primary', 'End Activation (Enter)'); end.onclick = UI.endActivation; act.appendChild(end);
      } else {
        var left = b.activatable(UI.playerSide).length;
        act.appendChild(el('div', 'muted', left ? left + ' unit' + (left === 1 ? '' : 's') + ' can still be activated. Click one of them.' : 'All units activated.'));
        var passS = el('button', null, 'Pass (end my activations)'); passS.onclick = function () { b.passStrategic(); UI.afterPlayerAction(); }; act.appendChild(passS);
      }
    } else if (b.phase === 'end') {
      var res = el('button', 'primary', 'Show result'); res.onclick = UI.onEnd; act.appendChild(res);
    }
  };
  UI.enterTargetMode = function (mode, arg, commander) {
    var b = UI.battle, u = b.unit(UI.sel), ts = [];
    if (mode === 'shoot') { UI.shootCommander = !!commander; b.enemiesOf(u.side).forEach(function (t) { if (b.rangedInfo(u, t, commander).ok) ts.push(t.uid); }); }
    if (mode === 'spell') { UI.spell = arg; ts = b.spellTargets(u, arg).map(function (t) { return t.uid; }); }
    if (mode === 'ability') { UI.ability = arg; ts = b.abilityTargets(u, arg).map(function (t) { return t.uid; }); }
    if (!ts.length) { UI.hint('No valid targets in range and line of sight.'); return; }
    UI.mode = mode; UI.targets = ts; UI.preview = null; UI.updateHud();
    UI.hint('Click a highlighted target. Press Esc to cancel.');
  };
  UI.unitInfoPanel = function (u) {
    var b = UI.battle, box = el('div'), s = SOVL.effStats(u, b), mine = u.side === UI.playerSide, info = SOVL.FACTION_INFO[u.faction];
    box.appendChild(el('div', null, '<b style="font-family:var(--head);font-size:14px;color:' + (mine ? '#cfe6ff' : '#ffd0d0') + '">' + esc(u.name) + '</b><br><span class="muted">' + esc(SOVL.FACTION_DATA[u.faction].name) + ' · ' + esc(u.type) + '</span>'));
    if (!SOVL.commanderOnly(u)) box.appendChild(el('div', null, '<b>' + u.models + '</b>/' + u.maxModels + ' models · ' + u.files + ' wide · ' + SOVL.ranks(u) + ' rank' + (SOVL.ranks(u) === 1 ? '' : 's') + ' (+' + R.rankBonus(u.models, u.files) + ' Disc) · Move ' + SOVL.moveAllowance(u, b) + '"'));
    box.appendChild(statsRow(s));
    var parts = [propSpan(u.weapon)]; if (u.ranged) parts.push(propSpan(u.ranged)); u.props.forEach(function (p) { parts.push(propSpan(p)); }); if (u.banner) parts.push('<span class="p" data-tip="' + esc(u.banner.desc) + '">' + esc(u.banner.name) + '</span>');
    if (u.vet) parts.push('<span class="accent">' + SOVL.CAMPAIGN.veteran[u.vet - 1].name + '</span>');
    box.appendChild(el('div', 'props', parts.join(', ')));
    if (u.commander) {
      var c = u.commander, cs = SOVL.effCmdStats(u, b);
      var cb = el('div', null, '<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:6px"><b class="accent">★ ' + esc(c.name) + '</b> <span class="muted">' + esc(c.title) + '</span>' + (c.alive ? ' · ' + (c.maxWounds - c.wounds) + '/' + c.maxWounds + ' W' : ' · <span class="danger">slain</span>') + '</div>');
      if (c.alive) { cb.appendChild(statsRow(cs)); var cp = [propSpan(c.weapon)]; if (c.ranged) cp.push(propSpan(c.ranged)); c.props.forEach(function (p) { cp.push(propSpan(p)); }); c.items.forEach(function (it) { cp.push('<span class="p accent" data-tip="' + esc(it.desc) + '">' + esc(it.name) + '</span>'); }); if (c.spells.length) cp.push('Spells: ' + c.spells.map(propSpan).join(', ')); cb.appendChild(el('div', 'props', cp.join(', '))); }
      box.appendChild(cb);
    }
    var status = []; if (u.fleeing) status.push('<span class="danger">FLEEING</span>'); if (b.isEngaged(u)) status.push('engaged: ' + b.contactsOf(u).map(function (c) { return c.side + ' vs ' + esc(c.enemy.name); }).join(', ')); if (u.chargedThisTurn) status.push('charged this turn'); if (u.declaredCharge) status.push('charge declared');
    if (status.length) box.appendChild(el('div', null, status.join(' · ')));
    if (u.effects.length) box.appendChild(el('div', 'effects', u.effects.map(function (e) { return '<span class="pill" data-tip="' + esc(JSON.stringify(e.effect)) + '">' + esc(e.name) + '</span>'; }).join('')));
    if (mine && b.phase === 'charge' && UI.sel === u.uid && b.canDeclareCharge(u)) {
      var vt = b.validChargeTargets(u); if (vt.length) box.appendChild(el('div', 'muted', 'Targets: ' + vt.map(function (t) { return esc(t.unit.name) + ' (' + t.info.side + ', ' + t.info.dist.toFixed(1) + '")'; }).join('; ')));
    }
    return box;
  };
  UI.onEnd = function () {
    var b = UI.battle; if (!b || UI.endShown === b) return;
    if (UI.aiTimer) { clearTimeout(UI.aiTimer); UI.aiTimer = null; }
    UI.processEvents(); UI.updateHud();
    if (UI.modalOpen) { UI.pendingEnd = true; return; } // let the player read the final combat report first
    UI.endShown = b; UI.pendingEnd = false;
    setTimeout(function () { if (UI.battleOpts.onEnd) UI.battleOpts.onEnd(b); }, 600);
  };
  UI.confirmLeaveBattle = function () {
    UI.modalDismissable = true;
    UI.modal('<h2>Leave battle?</h2><div class="text">The battle will be abandoned' + (UI.campaign && UI.battleOpts && UI.battleOpts.campaign ? ' and counts as a defeat for the campaign' : '') + '.</div><div class="choices"><button id="m-stay">Keep fighting</button><button class="danger" id="m-leave">Abandon battle</button></div>');
    $('m-stay').onclick = UI.closeModal;
    $('m-leave').onclick = function () { UI.closeModal(); if (UI.aiTimer) { clearTimeout(UI.aiTimer); UI.aiTimer = null; } if (UI.battleOpts && UI.battleOpts.campaign) { UI.campaign.over = true; UI.campaign.pendingBattle = null; UI.campaign.log.push('The army abandoned the field. The trail ends here.'); C.save(UI.campaign); UI.battle = null; UI.showCampaign(); } else { UI.show('menu'); UI.battle = null; } };
  };
  UI.showResult = function (b, opts) {
    var res = b.result, won = res.winner === UI.playerSide, box = el('div');
    box.appendChild(el('h2', null, 'Battle Over'));
    box.appendChild(el('div', 'result-big', res.winner == null ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'));
    box.appendChild(el('div', 'text', (res.why === 'turns' ? 'The battle ended after ' + b.maxTurns + ' turns and was decided on points.' : res.why === 'mutual' ? 'Both armies broke.' : (res.winner === 0 ? b.names[1] : b.names[0]) + '\'s army was destroyed or driven from the field.') + '<br>Score: <b>' + esc(b.names[0]) + ' ' + res.score[0] + (b.scoreMode === 'ratio' ? ' (' + res.pct[0] + '% of the enemy army)' : '') + '</b> — <b>' + esc(b.names[1]) + ' ' + res.score[1] + (b.scoreMode === 'ratio' ? ' (' + res.pct[1] + '%)' : '') + '</b>' + (b.scoreMode === 'ratio' ? '<br><span class="muted">Campaign battles are scored by the share of each army\'s value destroyed or routed.</span>' : '')));
    var tbl = el('table', 'result-table', '<tr><th>Unit</th><th>Side</th><th>Result</th></tr>');
    b.units.concat(b.dead).sort(function (x, y) { return x.side - y.side; }).forEach(function (u) {
      var state = u.removed ? (u.removedHow === 'fled' ? 'fled the field' : u.removedHow) : u.fleeing ? 'fleeing' : SOVL.isSingle(u.type) ? 'alive' : u.models + '/' + u.maxModels + ' models';
      if (u.commander && !u.commander.alive) state += ' · commander slain';
      tbl.innerHTML += '<tr><td>' + esc(u.name) + '</td><td class="' + (u.side === 0 ? 'accent' : 'danger') + '">' + esc(b.names[u.side]) + '</td><td>' + state + '</td></tr>';
    });
    box.appendChild(tbl);
    if (opts.extra) box.appendChild(opts.extra);
    var ok = el('button', 'primary', opts.label || 'Continue'); ok.onclick = function () { UI.closeModal(); opts.onDone(); }; box.appendChild(ok);
    UI.modalDismissable = false; UI.modal(box);
  };

  // ---------- campaign ----------
  var NODE_ICON = { battle: '⚔', elite: '☠', event: '?', merchant: '⚖', camp: '⛺', treasure: '✪', boss: '♛' };
  var NODE_NAME = { battle: 'Battle', elite: 'Elite battle', event: 'Event', merchant: 'Merchant', camp: 'Camp', treasure: 'Treasure', boss: 'Boss' };
  UI.showCampaign = function () {
    var camp = UI.campaign; if (!camp) return;
    UI.show('campaign');
    if (camp.over) { UI.showRunOver(); return; }
    UI.renderCampaign();
    if (camp.pendingBattle && camp.nodeIndex != null) {
      // a battle was started but never resolved (page reloaded mid-fight): it must be fought
      var node = C.nodeAt(camp, camp.layer, camp.nodeIndex);
      if (node) UI.campaignBattle(node, camp.pendingBattle.kind || undefined);
    }
  };
  UI.renderCampaign = function () {
    var camp = UI.campaign, act = C.currentAct(camp);
    $('camp-act').textContent = act.name; $('camp-gold').textContent = camp.gold;
    $('camp-title').textContent = 'Trail of Death — ' + camp.commanderName;
    // map SVG
    var map = $('camp-map'); map.innerHTML = '';
    var W = Math.max(600, map.clientWidth - 20), layerH = 92, H = act.layers.length * layerH + 60;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H);
    var pos = [], avail = C.availableNodes(camp);
    act.layers.forEach(function (layer, li) { pos.push(layer.map(function (n, i) { return { x: W / 2 + (i - (layer.length - 1) / 2) * Math.min(220, W / (layer.length + 1)), y: H - 40 - li * layerH }; })); });
    act.layers.forEach(function (layer, li) {
      if (li >= act.layers.length - 1) return;
      layer.forEach(function (n, i) { n.next.forEach(function (j) { var a = pos[li][i], b2 = pos[li + 1][j]; var line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b2.x); line.setAttribute('y2', b2.y); var onPath = (camp.nodeIndex === i && camp.layer === li) || (camp.nodeIndex == null && li === 0 && false); line.setAttribute('stroke', onPath && avail.indexOf(j) >= 0 ? '#e8c15a' : '#3a3f33'); line.setAttribute('stroke-width', onPath && avail.indexOf(j) >= 0 ? 2.5 : 1.5); line.setAttribute('stroke-dasharray', '4 4'); svg.appendChild(line); }); });
    });
    act.layers.forEach(function (layer, li) {
      layer.forEach(function (n, i) {
        var p = pos[li][i], g = document.createElementNS('http://www.w3.org/2000/svg', 'g'), isAvail = (camp.nodeIndex == null ? li === 0 : li === camp.layer + 1) && avail.indexOf(i) >= 0, isCur = camp.nodeIndex === i && camp.layer === li && camp.nodeIndex != null;
        g.setAttribute('class', 'node' + (isAvail ? ' avail' : '')); g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
        var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', n.type === 'boss' ? 26 : 20);
        c.setAttribute('fill', isCur ? '#5a4a18' : n.visited ? '#1b1e18' : n.type === 'boss' ? '#3a1a1a' : n.type === 'elite' ? '#3a2a2a' : '#23271f');
        c.setAttribute('stroke', isAvail ? '#e8c15a' : isCur ? '#fff' : n.visited ? '#3a3f33' : '#6a705d'); c.setAttribute('stroke-width', isAvail ? 3 : 1.5);
        g.appendChild(c);
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dy', '6'); t.setAttribute('fill', n.visited && !isCur ? '#555' : '#eee'); t.textContent = NODE_ICON[n.type]; g.appendChild(t);
        var l = document.createElementNS('http://www.w3.org/2000/svg', 'text'); l.setAttribute('class', 'lbl'); l.setAttribute('text-anchor', 'middle'); l.setAttribute('dy', n.type === 'boss' ? 42 : 34); l.textContent = n.type === 'boss' ? act.boss.name : NODE_NAME[n.type]; g.appendChild(l);
        if (isAvail) g.onclick = function () { UI.travel(i); };
        svg.appendChild(g);
      });
    });
    map.appendChild(svg); map.scrollTop = map.scrollHeight;
    // roster
    var ro = $('camp-roster'); ro.innerHTML = '';
    ro.appendChild(el('h3', null, 'Your army <span class="muted" style="font-family:var(--font);font-size:11px">' + A.armyCost(camp.army) + ' pts · ' + camp.wins + ' victories</span>'));
    ro.appendChild(UI.rosterList(camp, null));
    var lg = $('camp-log'); lg.innerHTML = camp.log.slice(-12).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join(''); lg.scrollTop = lg.scrollHeight;
  };
  UI.rosterList = function (camp, actionFn) {
    var box = el('div', 'roster');
    camp.army.entries.forEach(function (e) {
      var t = e.kind === 'commander' ? e.retinue : e, def = SOVL.findUnitDef(camp.faction, t.id);
      var d = el('div', 'entry');
      var vet = t.vet ? ' <span class="accent">' + SOVL.CAMPAIGN.veteran[t.vet - 1].name + '</span>' : '';
      d.innerHTML = '<div class="head"><b>' + (e.kind === 'commander' ? '★ ' + esc(e.name) + ' + ' : '') + esc(def.name) + '</b>' + vet + '<span class="spacer"></span><span class="muted">' + (def.per ? t.models + '/' + def.size[1] : '1') + '</span></div>' +
        '<div class="props">' + esc(t.weapon) + (t.ranged ? ', ' + esc(t.ranged) : '') + (t.banner ? ', ' + esc(SOVL.bannerById(t.banner).name) : '') + (e.kind === 'commander' && e.items && e.items.length ? ', ' + e.items.map(function (id) { return esc(SOVL.itemById(id).name); }).join(', ') : '') + (t.extraProps ? ', ' + t.extraProps.join(', ') : '') + '</div>';
      if (actionFn) { var btn = actionFn(e); if (btn) d.appendChild(btn); }
      box.appendChild(d);
    });
    return box;
  };
  UI.travel = function (idx) {
    var camp = UI.campaign, node = C.moveTo(camp, idx); if (!node) return;
    C.save(camp); UI.renderCampaign();
    switch (node.type) {
      case 'battle': case 'elite': case 'boss': UI.campaignBattle(node); break;
      case 'event': UI.campaignEvent(node); break;
      case 'merchant': UI.campaignMerchant(node); break;
      case 'camp': UI.campaignCamp(node); break;
      case 'treasure': { var txt = C.treasure(camp); camp.log.push(txt); C.save(camp); UI.renderCampaign(); UI.simpleModal('Treasure', txt); break; }
    }
  };
  UI.simpleModal = function (title, text, onOk) {
    UI.modalDismissable = false;
    UI.modal('<h2>' + esc(title) + '</h2><div class="text">' + text + '</div><div class="choices"><button class="primary" id="m-ok">Continue</button></div>');
    $('m-ok').onclick = function () { UI.closeModal(); if (onOk) onOk(); };
  };
  UI.campaignBattle = function (node, kind, after) {
    var camp = UI.campaign, enemy = C.enemyArmyFor(camp, node, kind), act = SOVL.CAMPAIGN.acts[camp.act];
    var ef = SOVL.FACTION_DATA[enemy.faction];
    var intro = kind === 'small' ? 'A small warband bars the way.' : kind === 'undead' ? 'The dead stir in the barrow.' : node.type === 'boss' ? (camp.act === 2 ? 'At the end of the trail waits the Deathless Host. This is the final battle.' : act.boss.name + ' holds the pass with a full army. Win, and the road to the next act is open.') : node.type === 'elite' ? 'A veteran force blocks the trail. Expect a hard fight and better plunder.' : 'An enemy army stands in your way.';
    var body = '<h2>' + esc(node.type === 'boss' ? act.boss.name : NODE_NAME[node.type] || 'Battle') + '</h2><div class="text">' + esc(intro) + '<br><br><b>' + esc(ef.name) + '</b> — ' + enemy.entries.length + ' units, about ' + enemy.pts + ' points:<br>' + enemy.entries.map(function (e) { return esc(A.entryLabel(enemy.faction, e)); }).join('<br>') + '<br><br>Your army: ' + A.armyCost(camp.army) + ' points, ' + camp.army.entries.length + ' units.</div><div class="choices"><button class="primary" id="m-fight">To battle</button></div>';
    UI.modalDismissable = false; UI.modal(body);
    $('m-fight').onclick = function () {
      UI.closeModal();
      camp.pendingBattle = { layer: camp.layer, idx: camp.nodeIndex, kind: kind || null }; C.save(camp);
      var terrain = A.randomTerrain({}), army = C.battleArmy(camp);
      UI.startBattle({ armies: [army, enemy], terrain: terrain, scenario: 'pitched', names: [camp.commanderName, node.type === 'boss' ? act.boss.name : ef.name], aggression: node.type === 'boss' ? 0.7 : 0.5, campaign: true, onEnd: function (b) {
        var r = C.applyBattleResult(camp, b, node, enemy);
        var extra = el('div', 'text', r.lines.map(esc).join('<br>'));
        camp.pendingBattle = null; C.save(camp);
        UI.showResult(b, { extra: extra, label: r.won ? (r.draw ? 'Withdraw' : 'Continue the trail') : 'The trail ends', onDone: function () {
          UI.show('campaign');
          if (!r.won) { UI.showRunOver(); return; }
          if (after) after();
          if (node.type === 'boss' && !r.draw) {
            C.advanceAct(camp); C.save(camp);
            if (camp.victory) { UI.showRunOver(); return; }
            UI.renderCampaign();
            UI.simpleModal(SOVL.CAMPAIGN.acts[camp.act].name, 'The pass is won. The trail leads on into harder country. Enemies here field ' + SOVL.CAMPAIGN.acts[camp.act].pts[0] + '–' + SOVL.CAMPAIGN.acts[camp.act].pts[1] + ' point armies.');
          } else UI.renderCampaign();
        } });
      } });
    };
  };
  UI.showRunOver = function () {
    var camp = UI.campaign, won = camp.victory;
    var body = '<h2>' + (won ? 'The Trail\'s End' : 'The Trail Ends Here') + '</h2><div class="result-big">' + (won ? 'VICTORY' : 'RUN OVER') + '</div><div class="text">' + (won ? esc(camp.commanderName) + ' has broken the Deathless Host and walked the whole Trail of Death.' : esc(camp.commanderName) + '\'s campaign is over.') + '<br><br>Battles fought: ' + camp.battles + ' · Won: ' + camp.wins + ' · Enemy models slain: ' + camp.kills + ' · Acts completed: ' + (won ? 3 : camp.act) + '</div><div class="choices"><button class="primary" id="m-menu">Back to menu</button></div>';
    UI.modalDismissable = false; UI.modal(body);
    $('m-menu').onclick = function () { UI.closeModal(); C.clear(); UI.campaign = null; UI.show('menu'); };
  };
  UI.campaignEvent = function (node) {
    var camp = UI.campaign, ev = C.randomEvent(camp), box = el('div');
    box.appendChild(el('h2', null, esc(ev.title))); box.appendChild(el('div', 'text', esc(ev.text)));
    var ch = el('div', 'choices');
    ev.choices.forEach(function (c) {
      var btn = el('button', null, esc(c.text));
      if (c.effect.gold && c.effect.gold < 0 && camp.gold < -c.effect.gold) btn.disabled = true;
      btn.onclick = function () {
        UI.closeModal();
        var eff = Object.assign({}, c.effect), battleKind = eff.battle; delete eff.battle;
        var goldAfter = eff.goldAfter, itemAfter = eff.itemAfter; delete eff.goldAfter; delete eff.itemAfter;
        var lines = C.applyEffect(camp, eff);
        camp.log.push(ev.title + ': ' + (lines.join(' ') || 'nothing much happens.')); C.save(camp); UI.renderCampaign();
        if (battleKind) {
          UI.campaignBattle(node, battleKind, function () {
            var more = [];
            if (goldAfter) { camp.gold += goldAfter; more.push('+' + goldAfter + ' gold.'); }
            if (itemAfter) { var it = R.pick(SOVL.MAGIC_ITEMS.filter(function (i) { return i.kind === itemAfter; })); var err = C.buy(camp, { kind: 'item', item: it, price: 0 }); more.push(err ? 'The relic is useless to you.' : 'You claim ' + it.name + '.'); }
            if (more.length) { camp.log.push(more.join(' ')); C.save(camp); UI.simpleModal('Aftermath', more.map(esc).join('<br>')); }
          });
        } else if (lines.length) UI.simpleModal(ev.title, lines.map(esc).join('<br>'));
      };
      ch.appendChild(btn);
    });
    box.appendChild(ch); UI.modalDismissable = false; UI.modal(box);
  };
  UI.campaignMerchant = function (node) {
    var camp = UI.campaign, stock = node.stock || (node.stock = C.merchantStock(camp));
    function render(err) {
      var box = el('div');
      box.appendChild(el('h2', null, 'Merchant'));
      box.appendChild(el('div', 'text', 'A trader\'s camp. Recruits, relics and reinforcements — for a price. Gold: <span class="gold">' + camp.gold + '</span>' + (err ? '<br><span class="danger">' + esc(err) + '</span>' : '')));
      stock.forEach(function (o) {
        var d = el('div', 'shop-item' + (o.sold ? ' sold' : '')), desc;
        if (o.kind === 'unit') { var def = SOVL.findUnitDef(camp.faction, o.entry.id); desc = '<b>' + o.entry.models + ' ' + esc(def.name) + '</b> <span class="muted">' + esc(o.section) + '</span><br><span class="muted">Sk ' + def.stats[0] + ' Pw ' + def.stats[1] + ' Df ' + def.stats[2] + ' At ' + def.stats[3] + ' Wd ' + def.stats[4] + ' Ds ' + def.stats[5] + ' · ' + esc(o.entry.weapon) + (o.entry.ranged ? ', ' + esc(o.entry.ranged) : '') + '</span>'; }
        else if (o.kind === 'item') desc = '<b>' + esc(o.item.name) + '</b> <span class="muted">magic ' + o.item.kind + '</span><br><span class="muted">' + esc(o.item.desc) + '</span>';
        else desc = '<b>' + esc(o.banner.name) + '</b> <span class="muted">magic banner</span><br><span class="muted">' + esc(o.banner.desc) + '</span>';
        d.innerHTML = '<div class="desc">' + desc + '</div>';
        var btn = el('button', 'small primary', o.price + ' g'); btn.disabled = o.sold || camp.gold < o.price;
        btn.onclick = function () { var err = C.buy(camp, o); if (!err) camp.log.push('Bought ' + (o.kind === 'unit' ? o.entry.models + ' ' + SOVL.findUnitDef(camp.faction, o.entry.id).name : o.kind === 'item' ? o.item.name : o.banner.name) + ' for ' + o.price + ' gold.'); C.save(camp); UI.renderCampaign(); render(err); };
        d.appendChild(btn); box.appendChild(d);
      });
      box.appendChild(el('h3', null, 'Reinforce'));
      box.appendChild(UI.rosterList(camp, function (e) {
        var cost = C.reinforceCost(camp, e); if (cost == null) return null;
        var b = el('button', 'small', '+1 model — ' + cost + ' g'); b.disabled = camp.gold < cost; b.style.marginTop = '4px';
        b.onclick = function () { var err = C.reinforce(camp, e); C.save(camp); UI.renderCampaign(); render(err); };
        return b;
      }));
      var leave = el('button', 'primary', 'Leave'); leave.style.marginTop = '10px'; leave.onclick = function () { UI.closeModal(); C.save(camp); UI.renderCampaign(); };
      box.appendChild(leave);
      UI.modalDismissable = false; UI.modal(box);
    }
    render();
  };
  UI.campaignCamp = function (node) {
    var camp = UI.campaign, box = el('div');
    box.appendChild(el('h2', null, 'Camp')); box.appendChild(el('div', 'text', 'A quiet night. Rest to bring wounded stragglers back to the ranks, or drill one unit to raise its veterancy.'));
    var ch = el('div', 'choices');
    var rest = el('button', 'primary', 'Rest — every unit recovers up to half its base size in lost models'); rest.onclick = function () { var t = C.camp(camp, 'rest'); camp.log.push(t); C.save(camp); UI.closeModal(); UI.renderCampaign(); UI.simpleModal('Camp', esc(t)); };
    ch.appendChild(rest);
    box.appendChild(ch);
    box.appendChild(el('h3', null, 'Or train one unit'));
    box.appendChild(UI.rosterList(camp, function (e) { var t = e.kind === 'commander' ? e.retinue : e; if ((t.vet || 0) >= 3) return null; var b = el('button', 'small', 'Train'); b.style.marginTop = '4px'; b.onclick = function () { var txt = C.camp(camp, 'train', e); camp.log.push(txt); C.save(camp); UI.closeModal(); UI.renderCampaign(); UI.simpleModal('Camp', esc(txt)); }; return b; }));
    UI.modalDismissable = false; UI.modal(box);
  };

  // ---------- rules ----------
  UI.showRules = function () {
    $('rules-body').innerHTML = [
      '<h3>The game</h3><p>SOVL is a rank-and-flank fantasy wargame. Each unit is a block of models with a front, two flanks and a rear. Battles last ' + SOVL.MAX_TURNS + ' turns, or end when one army is destroyed or fleeing; otherwise the winner is decided on points (full cost for destroyed or routed units, half for units below half strength, plus slain commanders).</p>',
      '<h3>Turn structure</h3><p>Each turn has three phases. Players alternate activations in the first two.</p><ul><li><b>Charge Phase</b> — declare charges one at a time. A charge needs the target within the charger\'s move distance and inside its 45° front arc, with line of sight. Units already charged can <b>counter-charge</b> a frontal charger, or <b>flee</b> if fast enough.</li><li><b>Strategic Phase</b> — activate one unit at a time: advance and pivot (each 45° pivot costs movement: 1 for infantry, 2 for cavalry), use one ranged attack or ability, and the commander may cast one spell. Fleeing units may only try to rally.</li><li><b>Combat Phase</b> — every engagement is fought simultaneously: models in the front rank attack (second rank adds one supporting attack each; spears add a third rank when not charging). Compare Skill to hit (3+ if higher, else 4+), then the defender saves against Power versus Defense. Wounds plus flank (+1) and rear (+1) bonuses give the combat score; the loser tests Discipline on 2d6 minus the difference, adding +1 per rank of 3+ models.</li></ul>',
      '<h3>Ranged attacks</h3><p>One die per model, 4+ to hit modified by Skill (±1 per point from 3), −1 at long range (over half range) and −1 against targets in cover. Losing a quarter of a unit to shooting forces a Discipline test.</p>',
      '<h3>Terrain</h3><p>Forests and swamps are difficult terrain (−2 movement to enter or start in). Cliffs, ruins and lakes are impassable. Forests, cliffs and ruins block line of sight.</p>',
      '<h3>Controls</h3><table><tr><td>Click a unit</td><td>select / activate (Strategic Phase)</td></tr><tr><td>Click ground</td><td>pivot toward the point and advance</td></tr><tr><td><kbd>Shift</kbd> + click</td><td>pivot only</td></tr><tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>pivot 45° left / right</td></tr><tr><td><kbd>Enter</kbd></td><td>end activation / pass</td></tr><tr><td><kbd>X</kbd> / <kbd>Shift</kbd>+<kbd>X</kbd></td><td>show charge arcs / weapon ranges</td></tr><tr><td>Mouse wheel, right-drag</td><td>zoom and pan</td></tr><tr><td><kbd>Esc</kbd></td><td>cancel targeting</td></tr></table>',
      '<h3>Trail of Death</h3><p>A roguelite campaign in three acts. Choose a path through battles (⚔), elite battles (☠), events (?), merchants (⚖), camps (⛺) and treasure (✪), then defeat each act\'s boss (♛). Victories earn gold and veterancy; half of a unit\'s losses return after a won battle. A lost battle, or a dead commander, ends the run.</p>',
      '<h3>Factions</h3><ul>' + Object.keys(SOVL.FACTION_DATA).map(function (f) { return '<li><b>' + esc(SOVL.FACTION_DATA[f].name) + '</b> — ' + esc(SOVL.FACTION_INFO[f].tagline) + '</li>'; }).join('') + '</ul>',
      '<p class="muted">Core rules follow the public SOVL rules document. Spells, magic items and the campaign structure are this replica\'s own design, matching the names used in the source lists.</p>'
    ].join('');
    UI.show('rules');
  };

  window.addEventListener('load', UI.initMenu);
})();
