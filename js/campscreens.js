// The merchant's wagon and the camp. The merchant sorts its business into Wares, Reinforce and
// Re-arm tabs, shows each recruit's profile and each relic's effect, says before you pay why a
// ware cannot be used or what it would replace, keeps your purse and the Leave button in view,
// and reports each purchase where you made it. The camp is a night scene by the fire: resting
// shows exactly which units will recover and by how much; drilling shows the rank and bonus a
// unit will gain; dawn reports what changed. Every purchase and choice calls the campaign's own
// functions, so prices and rules are unchanged.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI || !SOVL.Campaign) return;
  var UI = SOVL.UI, C = SOVL.Campaign, A = SOVL.Army, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function thumb(fid, id, W, H, opts) { try { return SOVL.Thumbs.forDef(fid, id, W, H, opts) || el("span", "thumb"); } catch (e) { return el("span", "thumb"); } }
  function troop(e) { return e.kind === "commander" ? e.retinue : e; }
  function unitThumb(camp, e, W, H) { var t = troop(e); return thumb(camp.faction, t.id, W, H, { weapon: t.weapon, ranged: t.ranged }); }
  function entryName(camp, e) { var def = SOVL.findUnitDef(camp.faction, troop(e).id); return (e.kind === "commander" ? "★ " + e.name + " + " : "") + def.name; }
  function describe(name) { var p = SOVL.PROPS[name] || SOVL.WEAPONS[name] || SOVL.RANGED[name]; return p && p.desc ? p.desc : ""; }
  var COIN = '<svg class="coin" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#e0b85a" stroke="#7a5a1c" stroke-width="2"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#9c7426" stroke-width="1.5"/><path d="M16 11v10M13 14h6" stroke="#9c7426" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var ICON = {
    scales: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 8v32M14 40h20M10 14h28"/><path d="M10 14l-6 13h12zM38 14l-6 13h12z"/><path d="M4 27a6 3 0 0 0 12 0M32 27a6 3 0 0 0 12 0"/><circle cx="24" cy="8" r="2.5" fill="currentColor"/></svg>',
    weapon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 4l4 4-15 15-4-4z"/><path d="M8 18l6 6M6 26l4-4M5 21l6 6"/></svg>',
    item: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5c0 5 12 5 12 0"/><path d="M16 10v3"/><path d="M16 13l6 5-6 9-6-9z"/><circle cx="16" cy="19" r="2" fill="currentColor"/></svg>',
    banner: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v25"/><path d="M8 5h16l-4 6 4 6H8"/></svg>',
    tent: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 27L16 6l13 21z"/><path d="M16 6v21M12 27l4-8 4 8"/></svg>',
    drill: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 25L22 10M22 10l3-6 3 3-6 3"/><path d="M25 25L10 10M10 10L7 4 4 7l6 3"/><circle cx="16" cy="17" r="2.5"/></svg>'
  };
  function rankOf(v) { return v ? SOVL.CAMPAIGN.veteran[v - 1] : null; }
  function bonusOf(r) { return r.discipline ? "+" + r.discipline + " Discipline" : r.skill ? "+" + r.skill + " Skill" : r.power ? "+" + r.power + " Power" : ""; }
  function stats(def) {
    var L = ["SK", "PW", "DF", "AT", "WD", "DS"];
    return '<div class="ms-stats">' + def.stats.map(function (v, i) { return "<span><small>" + L[i] + "</small><b>" + v + "</b></span>"; }).join("") + "</div>";
  }
  function purseHtml(camp) { return COIN + '<b class="ms-gold">' + camp.gold + "</b><span>gold</span>"; }
  // tag the dialog and clear our tags when another dialog opens
  var modal = UI.modal;
  UI.modal = function () { var m = $("modal-body"); if (m) m.classList.remove("m-shop", "m-bivouac", "m-dawn"); return modal.apply(UI, arguments); };

  // ---------- merchant ----------
  UI.campaignMerchant = function (node) {
    var camp = UI.campaign, stock = node.stock || (node.stock = C.merchantStock(camp));
    var view = { tab: "wares", msg: null, bad: false, spent: 0 };
    // why a ware cannot be bought, checked before the gold changes hands (C.buy checks again)
    function whyNot(o) {
      if (o.kind === "unit") {
        var sec = SOVL.findSection(camp.faction, o.entry.id), lim = A.sectionLimits(sec, 1500);
        if (C.unitCapCount(camp, sec.name) >= lim.max + 1) return "Your army fields as many " + sec.name + " units as it can support.";
      } else if (o.kind === "item") {
        var cdef = SOVL.findUnitDef(camp.faction, camp.army.entries[0].id);
        if (!cdef.magic) return "Your commander cannot use magic items.";
        if (o.item.kind === "weapon" && cdef.magic === "item") return "Your commander cannot wield a magic weapon.";
      } else if (o.kind === "banner" && !bearer(o)) return "No unit in your army can carry it.";
      return null;
    }
    function bearer(o) {
      var hit = null;
      camp.army.entries.forEach(function (en) { var t = troop(en), def = SOVL.findUnitDef(camp.faction, t.id); if (!hit && def.banner && def.banner >= o.banner.cost && !t.banner) hit = def.name; });
      return hit;
    }
    function note(o) {
      if (o.kind === "item") {
        var same = (camp.army.entries[0].items || []).map(SOVL.itemById).filter(function (i) { return i && i.kind === o.item.kind; })[0];
        return same ? "Replaces " + same.name + "." : "For " + camp.army.entries[0].name + ".";
      }
      if (o.kind === "banner") { var b = bearer(o); return b ? "Carried by " + b + "." : ""; }
      if (o.kind === "unit") return "Joins the army at once.";
      return "";
    }
    function priceButton(price, blocked, onBuy, label) {
      var b = el("button", "small primary ms-price", COIN + "<span>" + price + "</span>");
      b.type = "button"; b.disabled = !!blocked; b.setAttribute("aria-label", (label || "Buy") + " for " + price + " gold"); b.onclick = onBuy;
      return b;
    }
    function done(err, okText) {
      view.msg = err || okText; view.bad = !!err;
      if (!err) view.spent++;
      C.save(camp); UI.renderCampaign(); render();
    }
    function wareCard(o) {
      var sold = !!o.sold, why = !sold && whyNot(o), poor = !sold && !why && camp.gold < o.price;
      var card = el("div", "shop-item ms-ware k-" + o.kind + (sold ? " sold" : "") + (why ? " blocked" : ""));
      var pic, title, sub, body;
      if (o.kind === "unit") {
        var def = SOVL.findUnitDef(camp.faction, o.entry.id);
        pic = thumb(camp.faction, def.id, 58, 66, { weapon: o.entry.weapon, ranged: o.entry.ranged });
        title = o.entry.models + " " + def.name; sub = o.section;
        body = stats(def) + '<div class="ms-kit">' + esc(o.entry.weapon) + (o.entry.ranged ? " · " + esc(o.entry.ranged) : "") + "</div>";
      } else {
        var thing = o.kind === "item" ? o.item : o.banner;
        pic = el("div", "ms-icon", o.kind === "banner" ? ICON.banner : thing.kind === "weapon" ? ICON.weapon : ICON.item);
        title = thing.name; sub = o.kind === "banner" ? "Magic banner" : "Magic " + thing.kind;
        body = '<p class="ms-desc">' + esc(thing.desc) + "</p>";
      }
      card.appendChild(pic);
      var mid = el("div", "desc ms-mid", '<div class="ms-title"><b>' + esc(title) + '</b><em>' + esc(sub) + "</em></div>" + body +
        (sold ? "" : why ? '<p class="ms-why">' + esc(why) + "</p>" : poor ? '<p class="ms-poor">You need ' + (o.price - camp.gold) + " more gold.</p>" : note(o) ? '<p class="ms-note">' + esc(note(o)) + "</p>" : ""));
      card.appendChild(mid);
      if (sold) card.appendChild(el("span", "ms-sold", "Sold"));
      else card.appendChild(priceButton(o.price, why || poor, function () {
        var err = C.buy(camp, o), what = o.kind === "unit" ? o.entry.models + " " + SOVL.findUnitDef(camp.faction, o.entry.id).name : o.kind === "item" ? o.item.name : o.banner.name;
        if (!err) camp.log.push("Bought " + what + " for " + o.price + " gold.");
        done(err, o.kind === "unit" ? what + " join the army." : what + " is yours.");
      }, "Buy " + title));
      return card;
    }
    function render() {
      var list = $("modal-body") && $("modal-body").querySelector(".ms-panels"), scroll = list ? list.scrollTop : 0;
      var offers = C.equipmentOffers(camp), reinforceable = camp.army.entries.filter(function (e) { return C.reinforceCost(camp, e) != null; });
      var box = el("div", "ms");
      var head = el("div", "ms-head");
      head.appendChild(el("div", "ms-seal", ICON.scales));
      head.appendChild(el("div", "ms-headtext", '<div class="ms-eyebrow">On the trail</div><h2>Merchant</h2><div class="text">A trader\'s wagon, lamps lit against the dusk. Recruits, relics and reinforcements — for a price.</div>'));
      head.appendChild(el("div", "ms-purse" + (view.spent ? " flash" : ""), purseHtml(camp)));
      box.appendChild(head);
      // tabs
      var tabs = el("div", "ms-tabs"); tabs.setAttribute("role", "tablist");
      var left = stock.filter(function (o) { return !o.sold; }).length;
      [["wares", "Wares", left], ["reinforce", "Reinforce", reinforceable.length], ["rearm", "Re-arm", offers.length]].forEach(function (t) {
        var b = el("button", view.tab === t[0] ? "on" : "", esc(t[1]) + "<span>" + t[2] + "</span>"); b.type = "button";
        b.setAttribute("role", "tab"); b.setAttribute("aria-selected", view.tab === t[0] ? "true" : "false");
        b.onclick = function () { view.tab = t[0]; view.msg = null; render(); };
        tabs.appendChild(b);
      });
      box.appendChild(tabs);
      var panels = el("div", "ms-panels");
      // wares: recruits, then relics
      var pw = el("section", "ms-panel" + (view.tab === "wares" ? " on" : ""));
      pw.appendChild(el("h3", null, "Wares"));
      var grid = el("div", "wares ms-grid");
      stock.filter(function (o) { return o.kind === "unit"; }).concat(stock.filter(function (o) { return o.kind !== "unit"; })).forEach(function (o) { grid.appendChild(wareCard(o)); });
      pw.appendChild(grid); panels.appendChild(pw);
      // reinforce
      var pr = el("section", "ms-panel" + (view.tab === "reinforce" ? " on" : ""));
      pr.appendChild(el("h3", null, "Reinforce"));
      pr.appendChild(el("p", "ms-lead", "Fill gaps in the ranks. Each model costs the same, however many you buy."));
      camp.army.entries.forEach(function (e) {
        var t = troop(e), def = SOVL.findUnitDef(camp.faction, t.id), cost = C.reinforceCost(camp, e);
        if (!def.per) return;
        var row = el("div", "ms-row" + (cost == null ? " full" : ""));
        row.appendChild(unitThumb(camp, e, 40, 46));
        var max = def.size[1], rank = rankOf(t.vet);
        row.appendChild(el("div", "ms-mid", '<div class="ms-title"><b>' + esc(entryName(camp, e)) + "</b>" + (rank ? "<em class=\"ms-rank\">" + esc(rank.name) + "</em>" : "") + '</div><div class="ms-bar"><i style="width:' + Math.round(100 * t.models / max) + '%"></i></div><small>' + t.models + " of " + max + " models</small>"));
        var acts = el("div", "ms-acts");
        if (cost == null) acts.appendChild(el("span", "ms-full", "Full strength"));
        else {
          var missing = max - t.models, can = Math.min(missing, Math.floor(camp.gold / cost));
          acts.appendChild(priceButton(cost, camp.gold < cost, function () { var err = C.reinforce(camp, e); done(err, "One more model joins " + def.name + "."); }, "Add one model to " + def.name));
          acts.lastChild.insertAdjacentHTML("afterbegin", "<em>+1</em>");
          if (can > 1) {
            var fill = priceButton(cost * can, false, function () { var n = 0, err = null; while (n < can && !(err = C.reinforce(camp, e))) n++; done(n ? null : err, n + " models join " + def.name + "."); }, "Add " + can + " models to " + def.name);
            fill.classList.add("ms-fill"); fill.insertAdjacentHTML("afterbegin", "<em>+" + can + (can === missing ? " (full)" : "") + "</em>");
            acts.appendChild(fill);
          }
        }
        row.appendChild(acts); pr.appendChild(row);
      });
      panels.appendChild(pr);
      // re-arm, grouped by regiment
      var pa = el("section", "ms-panel" + (view.tab === "rearm" ? " on" : ""));
      pa.appendChild(el("h3", null, "Re-arm"));
      if (!offers.length) pa.appendChild(el("p", "ms-lead", "Nothing here suits your army."));
      var groups = [], byKey = {};
      offers.forEach(function (o) { var k = (o.commander ? "c" : "u") + o.ref; if (!byKey[k]) { byKey[k] = { o: o, list: [] }; groups.push(byKey[k]); } byKey[k].list.push(o); });
      groups.forEach(function (g) {
        var e = g.o.entry, t = g.o.commander ? e : troop(e), gid = g.o.commander ? e.id : troop(e).id;
        var card = el("div", "shop-item ms-arm");
        var head2 = el("div", "ms-armhead");
        head2.appendChild(thumb(camp.faction, gid, 40, 46, { weapon: t.weapon, ranged: t.ranged }));
        head2.appendChild(el("div", null, "<b>" + esc(g.o.unitName) + "</b><small>Carries " + esc(t.weapon) + (t.ranged ? ", " + esc(t.ranged) : "") + ((t.upgrades || []).length ? " · " + esc(t.upgrades.join(", ")) : "") + "</small>"));
        card.appendChild(head2);
        var opts = el("div", "ms-opts");
        g.list.forEach(function (o) {
          var opt = el("div", "ms-opt", '<div><em>' + (o.what === "weapon" ? "Switch to" : "Add") + "</em><b>" + esc(o.name) + "</b><span>" + esc(describe(o.name)) + "</span></div>");
          opt.appendChild(priceButton(o.price, camp.gold < o.price, function () {
            var err = C.buy(camp, o); if (!err) camp.log.push(o.unitName + (o.what === "weapon" ? " re-armed with " : " takes ") + o.name + " for " + o.price + " gold.");
            done(err, o.unitName + (o.what === "weapon" ? " now fights with " : " takes ") + o.name + ".");
          }, (o.what === "weapon" ? "Switch " + o.unitName + " to " : "Give " + o.unitName + " ") + o.name));
          opts.appendChild(opt);
        });
        card.appendChild(opts); pa.appendChild(card);
      });
      panels.appendChild(pa);
      box.appendChild(panels);
      // footer: what just happened, the army, and the way out
      var foot = el("div", "ms-foot");
      foot.appendChild(el("div", "ms-msg" + (view.msg ? (view.bad ? " bad" : " good") : ""), view.msg ? esc(view.msg) : camp.army.entries.length + " units · " + A.armyCost(camp.army) + " points in your army"));
      if (view.msg) foot.lastChild.setAttribute("role", "status");
      var leave = el("button", "primary", "Leave"); leave.type = "button";
      leave.onclick = function () { UI.closeModal(); C.save(camp); UI.renderCampaign(); };
      foot.appendChild(leave); box.appendChild(foot);
      UI.modalDismissable = false; UI.modal(box);
      var m = $("modal-body"); m.classList.add("m-shop");
      var np = m.querySelector(".ms-panels"); if (np) np.scrollTop = scroll;
    }
    render();
  };

  // ---------- camp ----------
  var FIRE = '<svg class="cp-fire" viewBox="0 0 200 120" aria-hidden="true">' +
    '<defs><radialGradient id="cp-glow" cx="50%" cy="80%" r="60%"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="100" cy="100" rx="95" ry="30" fill="url(#cp-glow)"/>' +
    '<path d="M30 104L52 70L74 104Z" fill="#1a1512" stroke="#4a3522" stroke-width="1.5"/><path d="M52 70V104M46 104l6-12 6 12" stroke="#4a3522" stroke-width="1.5" fill="none"/>' +
    '<path d="M140 104L160 76L180 104Z" fill="#1a1512" stroke="#4a3522" stroke-width="1.5"/>' +
    '<g class="cp-flames"><path class="f1" d="M100 100c-14-6-14-20-4-30 0 8 6 10 6 4 0-8 6-12 4-22 10 8 14 20 8 32 4-2 6-6 6-10 6 10 2 22-8 26z" fill="#e2572a"/>' +
    '<path class="f2" d="M100 100c-8-4-9-12-3-19 1 5 4 6 4 2 0-5 4-8 3-14 6 5 8 13 4 20 3-1 4-4 4-6 3 7 0 14-6 17z" fill="#ffb347"/>' +
    '<path class="f3" d="M100 100c-4-2-5-7-1-11 1 3 2 3 2 1 0-3 2-5 2-8 3 3 4 8 2 12 2 0 2-2 2-3 2 4 0 8-4 9z" fill="#fff1c1"/></g>' +
    '<path d="M80 104l40-8M82 96l38 9" stroke="#5a3a1e" stroke-width="6" stroke-linecap="round"/>' +
    '<g class="cp-sparks"><circle cx="104" cy="52" r="1.3" fill="#ffd27a"/><circle cx="96" cy="44" r="1" fill="#ffd27a"/><circle cx="108" cy="36" r="1.1" fill="#ffd27a"/></g></svg>';
  function starfield() { var s = ""; for (var i = 0; i < 40; i++) { var x = (i * 73 + 17) % 100, y = (i * 41 + 7) % 60, r = i % 5 === 0 ? 1.4 : 0.8; s += '<circle cx="' + x + '%" cy="' + y + '%" r="' + r + '" fill="#fff" opacity="' + (0.35 + (i % 4) * 0.15) + '"/>'; } return '<svg class="cp-stars" aria-hidden="true">' + s + "</svg>"; }
  function snapshot(camp) { return camp.army.entries.map(function (e) { var t = troop(e); return { models: t.models, vet: t.vet || 0 }; }); }
  function dawn(camp, headline, rows) {
    var box = el("div", "cp cp-dawn");
    box.appendChild(el("div", "cp-sky dawn", starfield() + '<div class="cp-headtext"><div class="ms-eyebrow">Camp</div><h2>Dawn breaks</h2><div class="text">' + esc(headline) + "</div></div>"));
    var list = el("div", "cp-changes");
    if (!rows.length) list.appendChild(el("p", "ms-lead", "The army breaks camp, rested but unchanged."));
    rows.forEach(function (r) {
      var row = el("div", "cp-change");
      row.appendChild(unitThumb(camp, r.e, 40, 46));
      row.appendChild(el("div", "ms-mid", "<b>" + esc(entryName(camp, r.e)) + "</b><small>" + r.text + "</small>"));
      row.appendChild(el("span", "cp-delta", r.delta));
      list.appendChild(row);
    });
    box.appendChild(list);
    var ch = el("div", "choices cp-foot"), ok = el("button", "primary", "Break camp"); ok.id = "m-ok"; ok.type = "button";
    ok.onclick = function () { UI.closeModal(); UI.renderCampaign(); };
    ch.appendChild(ok); box.appendChild(ch);
    UI.modalDismissable = false; UI.modal(box); $("modal-body").classList.add("m-bivouac", "m-dawn");
  }
  UI.campaignCamp = function (node) {
    var camp=UI.campaign, box=el("div","cp"), before=snapshot(camp), allowance=C.campAllowance(camp);
    if(node.campClaimed){UI.simpleModal("Camp", "The army has already received its supplies here.");return;}
    box.appendChild(el("div","cp-sky",starfield()+FIRE+'<div class="cp-headtext"><div class="ms-eyebrow">Shelter on the trail</div><h2>Rest. Resupply. Return stronger.</h2><div class="text">Every choice restores all surviving regiments to their previous strength and gives you <b>'+allowance+' gold</b>. Choose one extra benefit below.</div></div>'));
    var benefits=el("div","cp-recovery"), recovery=[];
    camp.army.entries.forEach(function(e){var n=C.campRecovery(camp,e,false)-troop(e).models;if(n>0)recovery.push(esc(entryName(camp,e))+" +"+n);});
    benefits.innerHTML='<b>Included free</b><span>'+ (recovery.length ? recovery.join(' · ') : 'Your regiments are already rested.')+' · '+allowance+' gold</span>';
    box.appendChild(benefits);
    var cards=el("div","cp-cards"), done=false;
    function finish(choice,entry){
      if(done)return;var result=C.campVisit(camp,node,choice,entry);if(!result)return;done=true;C.save(camp);
      var rows=[];camp.army.entries.forEach(function(e,i){var t=troop(e),gain=t.models-before[i].models,v=(t.vet||0)-before[i].vet,txt=[];
        if(gain)txt.push(before[i].models+" → "+t.models+" models");if(v)txt.push(esc(rankOf(t.vet).name)+": "+esc(bonusOf(rankOf(t.vet))));
        if(txt.length)rows.push({e:e,text:txt.join(" · "),delta:gain?"+"+gain:"★"});
      });UI.renderCampaign();dawn(camp,result.lines.join(' '),rows);
    }
    var rest=el("section","cp-card");rest.appendChild(el("h3",null,'<span class="cp-ic">'+ICON.tent+'</span>Welcome reinforcements'));
    rest.appendChild(el("p","ms-lead","After recovery, every regiment gains fresh recruits worth up to half its starting size, within its maximum strength."));
    var list=el("div","cp-list"), total=0;
    camp.army.entries.forEach(function(e){var t=troop(e),to=C.campRecovery(camp,e,true),extra=to-C.campRecovery(camp,e,false);if(!extra)return;total+=extra;
      var row=el("div","cp-item");row.appendChild(unitThumb(camp,e,32,36));row.appendChild(el("div","ms-mid","<b>"+esc(entryName(camp,e))+"</b><small>"+t.models+" → "+to+" models after recovery and recruits</small>"));row.appendChild(el("span","cp-delta","+"+extra+" new"));list.appendChild(row);
    });if(!total)list.appendChild(el('p','cp-none','All regiments are at their maximum size. Training or supplies will help more.'));rest.appendChild(list);
    var rb=el("button","primary","Recover & reinforce");rb.type="button";rb.disabled=!total;rb.onclick=function(){finish('reinforce');};rest.appendChild(rb);cards.appendChild(rest);
    var drill=el("section","cp-card");drill.appendChild(el("h3",null,'<span class="cp-ic">'+ICON.drill+'</span>Train a regiment'));
    drill.appendChild(el("p","ms-lead","The whole army recovers while one regiment gains a permanent veterancy rank."));
    var dl=el("div","cp-list cp-pick"),chosen=null,db=el("button","primary cp-drill","Choose a regiment");db.type="button";db.disabled=true;
    dl.setAttribute("role","radiogroup");dl.setAttribute("aria-label","Regiment to train");
    camp.army.entries.forEach(function(e){var t=troop(e),v=t.vet||0,next=v<3?rankOf(v+1):null,row=el("button","cp-item cp-opt"+(next?"":" maxed"));row.type="button";row.disabled=!next;row.setAttribute("role","radio");row.setAttribute("aria-checked","false");
      row.appendChild(unitThumb(camp,e,32,36));row.appendChild(el("div","ms-mid","<b>"+esc(entryName(camp,e))+"</b><small>"+(next?esc(next.name)+" · "+esc(bonusOf(next)):"Legendary — maximum rank")+"</small>"));row.appendChild(el("span","cp-radio"));
      row.onclick=function(){chosen=e;dl.querySelectorAll('.cp-opt').forEach(function(b){b.classList.remove('on');b.setAttribute('aria-checked','false');});row.classList.add('on');row.setAttribute('aria-checked','true');db.disabled=false;db.textContent='Recover & train';};dl.appendChild(row);
    });drill.appendChild(dl);db.onclick=function(){finish('train',chosen);};drill.appendChild(db);cards.appendChild(drill);
    var supply=el("section","cp-card cp-supplies"),extra=75+camp.act*25;
    supply.appendChild(el("h3",null,"Fill the war chest"));supply.appendChild(el("p","ms-lead","Take an extra "+extra+" gold for recruits, equipment and relics at the next merchant."));supply.appendChild(el("div","cp-gold",(allowance+extra)+'<small>total gold · plus full recovery</small>'));
    var sb=el("button","primary","Recover & take supplies");sb.type="button";sb.onclick=function(){finish('supplies');};supply.appendChild(sb);cards.appendChild(supply);box.appendChild(cards);
    UI.modalDismissable=false;UI.modal(box);$("modal-body").classList.add("m-bivouac");
  };
})();
