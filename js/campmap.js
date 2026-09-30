// The Trail of Death crosses three illustrated landscapes with winding routes, glowing
// reachable stops and a blue trail marking the army's progress. The landscape is cached
// per act and size; real buttons over the markers provide keyboard and screen-reader access.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.UI) return;
  var UI = SOVL.UI, C = SOVL.Campaign;
  var INK = "rgba(215,224,232,";
  var TYPE = {
    battle: { name: "Battle", seal: [148, 38, 30], note: "An enemy army bars the road. Victory brings gold and veterancy." },
    elite: { name: "Elite battle", seal: [86, 22, 26], note: "A veteran force. A harder fight for better plunder." },
    boss: { name: "Boss", seal: [40, 14, 16], note: "The master of this land, with a full army. Win to open the next act." },
    event: { name: "Event", seal: [48, 66, 118], note: "Something waits on the road: a choice, a stranger, or trouble." },
    merchant: { name: "Merchant", seal: [176, 132, 44], note: "Recruits, relics, re-arming and reinforcements, for gold." },
    camp: { name: "Camp", seal: [58, 96, 54], note: "Free recovery and gold, plus reinforcements, training or extra supplies." },
    treasure: { name: "Treasure", seal: [188, 124, 36], note: "Unguarded spoils: gold or a magic item." }
  };
  var landscapes = ['borderlands','sunlands','ashlands'].map(function(id) {
    var img=new Image();img.onload=function(){sheet=null; if(UI.screen==='campaign' && UI.campaign) { var map=document.getElementById('camp-map'), scroll=map.scrollTop;UI.renderCampaign();map.scrollTop=scroll; }};img.src='assets/campaign/'+id+'.webp';return img;
  });
  var sheet = null, state = null, raf = null, hoverIdx = null;

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s += 0x6d2b79f5; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // ---------- layout ----------
  function layout(camp, W) {
    var act = C.currentAct(camp), r = rng(camp.seed * 7 + camp.act * 131 + 3), phone = W < 520;
    var layerH = phone ? 110 : 130, top = 180, H = act.layers.length * layerH + top + 60, pos = [];
    act.layers.forEach(function (layer, li) {
      pos.push(layer.map(function (n, i) {
        var spread = Math.min(phone ? 110 : 230, (W - 60) / (layer.length + 0.2));
        var jx = n.type === "boss" ? 0 : (r() - 0.5) * spread * 0.28, jy = n.type === "boss" ? 0 : (r() - 0.5) * layerH * 0.22;
        return { x: W / 2 + (i - (layer.length - 1) / 2) * spread + jx, y: H - 70 - li * layerH + jy };
      }));
    });
    // each road bends a little, the same way every time
    var roads = [];
    act.layers.forEach(function (layer, li) {
      if (li >= act.layers.length - 1) return;
      layer.forEach(function (n, i) {
        n.next.forEach(function (j) {
          var a = pos[li][i], b = pos[li + 1][j], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          var bend = (r() - 0.5) * 34;
          roads.push({ li: li, i: i, j: j, a: a, b: b, c: { x: mx - dy / len * bend, y: my + dx / len * bend } });
        });
      });
    });
    return { act: act, W: W, H: H, pos: pos, roads: roads, phone: phone };
  }
  // The original landscape is cached once; routes and markers remain live and accessible.
  function paintSheet(camp,L,dpr) {
    var W=L.W,H=L.H,cv=document.createElement('canvas');cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var g=cv.getContext('2d');g.scale(dpr,dpr);var img=landscapes[Math.min(2,camp.act)];
    g.fillStyle=['#273a30','#685339','#30333c'][camp.act]||'#273a30';g.fillRect(0,0,W,H);
    if(img.complete&&img.naturalWidth){var iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.max(W/iw,H/ih);g.drawImage(img,(W-iw*scale)/2,(H-ih*scale)/2,iw*scale,ih*scale);}
    var shade=g.createLinearGradient(0,0,0,H);shade.addColorStop(0,'rgba(5,12,20,.78)');shade.addColorStop(.22,'rgba(5,12,20,.12)');shade.addColorStop(.7,'rgba(5,12,20,.18)');shade.addColorStop(1,'rgba(5,12,20,.65)');g.fillStyle=shade;g.fillRect(0,0,W,H);
    var side=g.createLinearGradient(0,0,W,0);side.addColorStop(0,'rgba(5,10,15,.45)');side.addColorStop(.25,'transparent');side.addColorStop(.75,'transparent');side.addColorStop(1,'rgba(5,10,15,.45)');g.fillStyle=side;g.fillRect(0,0,W,H);
    L.roads.forEach(function(rd){g.beginPath();g.moveTo(rd.a.x,rd.a.y);g.quadraticCurveTo(rd.c.x,rd.c.y,rd.b.x,rd.b.y);g.setLineDash([]);g.strokeStyle='rgba(0,0,0,.48)';g.lineWidth=6;g.stroke();g.setLineDash([3,6]);g.strokeStyle='rgba(231,223,194,.65)';g.lineWidth=1.5;g.stroke();});g.setLineDash([]);
    g.textAlign='center';g.fillStyle='#d6bd82';g.font="600 12px 'Barlow',sans-serif";g.fillText('TRAIL OF DEATH  /  ACT '+['I','II','III'][camp.act],W/2,37);
    g.fillStyle='#f2ede2';g.font=(L.phone?23:34)+"px 'Marcellus SC',serif";g.fillText(L.act.name.replace(/^Act [IV]+ — /,''),W/2,78);
    g.fillStyle='#d1d8dd';g.font="14px 'Barlow',sans-serif";g.fillText(['Beyond the forests, the road opens.','Across the plains. Into the burning sands.','The last road leads to the Deathless Host.'][camp.act],W/2,104);
    g.strokeStyle='rgba(224,199,144,.55)';g.lineWidth=1;g.strokeRect(8,8,W-16,H-16);
    return cv;
  }
  function seal(g, x, y, R, col, t, alpha, seed) {
    var r = rng(seed);
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = "rgba(40,20,10,0.35)"; g.beginPath(); g.ellipse(x + 2, y + 3, R * 1.02, R * 0.96, 0, 0, 6.28); g.fill();
    g.beginPath();
    for (var k = 0; k <= 18; k++) { var a = k / 18 * 6.28, rr = R * (1 + (r() - 0.5) * 0.12); if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath();
    var gr = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R * 1.1);
    gr.addColorStop(0, "rgb(" + col.map(function (c) { return Math.min(255, c * 1.5 + 30); }).join(",") + ")");
    gr.addColorStop(0.55, "rgb(" + col.join(",") + ")"); gr.addColorStop(1, "rgb(" + col.map(function (c) { return c * 0.55; }).join(",") + ")");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(255,240,210,0.28)"; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, R * 0.74, 0, 6.28); g.stroke();
    g.restore();
  }
  function icon(g, type, x, y, R, alpha) {
    g.save(); g.globalAlpha = alpha; g.translate(x, y);
    var s = R * 0.55; g.strokeStyle = "rgba(250,236,204,0.95)"; g.fillStyle = "rgba(250,236,204,0.95)"; g.lineWidth = Math.max(1.4, R * 0.1); g.lineCap = "round"; g.lineJoin = "round";
    if (type === "battle") { [-1, 1].forEach(function (d) { g.beginPath(); g.moveTo(-s * d, s); g.lineTo(s * 0.9 * d, -s * 0.9); g.stroke(); g.beginPath(); g.moveTo(-s * d * 0.55 - s * 0.25, s * 0.35 * 1.2); g.lineTo(-s * d * 0.55 + s * 0.25, s * 0.75); g.stroke(); }); }
    else if (type === "elite") { g.beginPath(); g.arc(0, -s * 0.15, s * 0.7, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(s * 0.4, s * 0.8); g.lineTo(-s * 0.4, s * 0.8); g.closePath(); g.fill(); g.fillStyle = "rgba(60,15,15,1)"; g.beginPath(); g.arc(-s * 0.28, -s * 0.1, s * 0.18, 0, 6.28); g.arc(s * 0.28, -s * 0.1, s * 0.18, 0, 6.28); g.fill(); }
    else if (type === "boss") { g.beginPath(); g.moveTo(-s, s * 0.6); g.lineTo(-s, -s * 0.4); g.lineTo(-s * 0.5, s * 0.05); g.lineTo(0, -s * 0.8); g.lineTo(s * 0.5, s * 0.05); g.lineTo(s, -s * 0.4); g.lineTo(s, s * 0.6); g.closePath(); g.fillStyle = "rgba(232,190,90,0.95)"; g.fill(); }
    else if (type === "merchant") { g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.8); g.moveTo(-s * 0.5, s * 0.8); g.lineTo(s * 0.5, s * 0.8); g.moveTo(-s, -s * 0.55); g.lineTo(s, -s * 0.55); g.stroke(); [-1, 1].forEach(function (d) { g.beginPath(); g.arc(d * s * 0.8, -s * 0.05, s * 0.35, 0, Math.PI); g.stroke(); }); }
    else if (type === "camp") { g.beginPath(); g.moveTo(-s, s * 0.75); g.lineTo(0, -s * 0.85); g.lineTo(s, s * 0.75); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(0, -s * 0.85); g.lineTo(-s * 0.2, s * 0.75); g.lineTo(s * 0.25, s * 0.75); g.closePath(); g.fill(); }
    else if (type === "treasure") { g.strokeRect(-s * 0.9, -s * 0.2, s * 1.8, s); g.beginPath(); g.moveTo(-s * 0.9, -s * 0.2); g.quadraticCurveTo(0, -s * 1.1, s * 0.9, -s * 0.2); g.stroke(); g.fillRect(-s * 0.15, -s * 0.05, s * 0.3, s * 0.35); }
    else { g.font = "700 " + Math.round(R * 1.1) + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, s * 0.1); }
    g.restore();
  }
  function banner(g, x, y, color, t) {
    var wave = Math.sin(t / 380) * 2.5;
    g.save(); g.translate(x, y);
    g.strokeStyle = INK + "0.95)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -42); g.stroke();
    g.fillStyle = color; g.strokeStyle = INK + "0.8)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(1, -41); g.quadraticCurveTo(12, -44 + wave, 24, -40 + wave * 0.5); g.lineTo(18, -33 + wave * 0.3); g.lineTo(24, -26 + wave * 0.5); g.quadraticCurveTo(12, -29 + wave, 1, -26); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(232,190,90,1)"; g.beginPath(); g.arc(0, -43, 2.5, 0, 6.28); g.fill();
    g.restore();
  }
  function label(g, text, x, y, size, bold) {
    g.font = (bold ? "700 " : "600 ") + size + "px 'Marcellus SC', 'Barlow Semi Condensed', serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.lineJoin = "round"; g.lineWidth = 5; g.strokeStyle = "rgba(5,10,17,0.92)"; g.strokeText(text, x, y);
    g.fillStyle = "#f7f0dc"; g.fillText(text, x, y);
  }

  // ---------- drawing and interaction ----------
  function draw(now) {
    var s = state; if (!s) return;
    var g = s.cv.getContext("2d"), L = s.L, camp = UI.campaign, act = L.act;
    g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    g.drawImage(sheet.cv, 0, 0, L.W, L.H);
    var cur = camp.nodeIndex == null ? null : { li: camp.layer, i: camp.nodeIndex }, nextLayer = camp.nodeIndex == null ? 0 : camp.layer + 1;
    // The travelled route stays blue; the available next roads glow gold.
    L.roads.forEach(function (rd) {
      var a = act.layers[rd.li][rd.i], b = act.layers[rd.li + 1][rd.j];
      var walked = a.visited && b.visited && !(cur && rd.li + 1 > cur.li);
      var open = cur && rd.li === cur.li && rd.i === cur.i && s.avail.indexOf(rd.j) >= 0;
      if (walked) { g.strokeStyle = "rgba(139,200,225,0.95)"; g.lineWidth = 3.2; g.setLineDash([]); g.beginPath(); g.moveTo(rd.a.x, rd.a.y); g.quadraticCurveTo(rd.c.x, rd.c.y, rd.b.x, rd.b.y); g.stroke(); }
      else if (open) {
        g.strokeStyle = "rgba(214,160,40," + (0.65 + 0.3 * Math.sin(now / 300)) + ")"; g.lineWidth = 3; g.setLineDash([7, 6]); g.lineDashOffset = -now / 60;
        g.beginPath(); g.moveTo(rd.a.x, rd.a.y); g.quadraticCurveTo(rd.c.x, rd.c.y, rd.b.x, rd.b.y); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
      }
    });
    act.layers.forEach(function (layer, li) {
      layer.forEach(function (n, i) {
        var p = L.pos[li][i], T = TYPE[n.type] || TYPE.battle, R = n.type === "boss" ? 25 : L.phone ? 16 : 18;
        var avail = li === nextLayer && s.avail.indexOf(i) >= 0, here = cur && cur.li === li && cur.i === i;
        var alpha = n.visited && !here ? 0.5 : li < nextLayer && !here ? 0.35 : 1;
        if (avail) {
          var pulse = 0.5 + 0.5 * Math.sin(now / 260 + i);
          g.save(); g.fillStyle = "rgba(240,200,90," + (0.25 + 0.25 * pulse) + ")"; g.beginPath(); g.arc(p.x, p.y, R + 7 + pulse * 3, 0, 6.28); g.fill();
          g.strokeStyle = "rgba(200,140,30,0.9)"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, R + 5 + pulse * 2, 0, 6.28); g.stroke(); g.restore();
        }
        if (hoverIdx === i && avail) { g.save(); g.strokeStyle = "rgba(255,241,194,0.95)"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, R + 11, 0, 6.28); g.stroke(); g.restore(); }
        seal(g, p.x, p.y, R, T.seal, now, alpha, camp.seed + li * 31 + i * 7);
        icon(g, n.type, p.x, p.y, R, alpha);
        if (n.visited && !here) { g.save(); g.strokeStyle = "rgba(226,223,201,0.8)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(p.x - R * 0.7, p.y - R * 0.7); g.lineTo(p.x + R * 0.7, p.y + R * 0.7); g.moveTo(p.x + R * 0.7, p.y - R * 0.7); g.lineTo(p.x - R * 0.7, p.y + R * 0.7); g.stroke(); g.restore(); }
        g.save(); g.globalAlpha = Math.max(alpha, 0.6);
        if (n.type === "boss") label(g, act.boss.name, p.x, p.y + R + 20, L.phone ? 12 : 14, true);
        else label(g, T.name, p.x, p.y + R + 16, L.phone ? 12 : 14, false);
        if(avail && /battle|elite|boss/.test(n.type)){var biome=SOVL.Biomes.forNode(camp,n);label(g,biome.name.replace(/^The /,''),p.x,p.y+R+32,L.phone?10:11,false);}
        g.restore();
      });
    });
    var bp = cur ? L.pos[cur.li][cur.i] : { x: L.W / 2, y: L.H - 22 };
    banner(g, bp.x + (cur ? 12 : 0), bp.y - (cur ? 10 : 0), (SOVL.FACTION_INFO[camp.faction] || {}).color || "#557fab", now);
  }
  function loop(now) {
    raf = null;
    if (!state || UI.screen !== "campaign" || !document.body.contains(state.cv)) { state = null; return; }
    draw(UI.settings && UI.settings.motion === false ? 0 : (now || performance.now()));
    raf = requestAnimationFrame(loop);
  }
  function hitNode(x, y) {
    var s = state; if (!s) return null;
    var nextLayer = UI.campaign.nodeIndex == null ? 0 : UI.campaign.layer + 1, row = s.L.pos[nextLayer];
    if (!row) return null;
    for (var i = 0; i < row.length; i++) if (s.avail.indexOf(i) >= 0 && Math.hypot(row[i].x - x, row[i].y - y) < 28) return i;
    return null;
  }

  UI.renderCampaign = (function (prev) {
    return function () {
      prev.apply(UI, arguments);
      var camp = UI.campaign, map = document.getElementById("camp-map");
      if (!camp || !map) return;
      var old = map.querySelector("svg"); if (old) old.remove();
      var W = Math.max(300, Math.min(map.clientWidth - 24, 1100)), L = layout(camp, W), dpr = Math.min(2, window.devicePixelRatio || 1);
      var key = [camp.seed, camp.act, W, dpr, landscapes[camp.act].complete && landscapes[camp.act].naturalWidth, JSON.stringify(camp.map.acts[camp.act].layers)].join("|");
      if (!sheet || sheet.key !== key) sheet = { key: key, cv: paintSheet(camp, L, dpr) };
      var wrap = document.createElement("div"); wrap.className = "trail-map"; wrap.style.width = W + "px"; wrap.style.height = L.H + "px";
      var cv = document.createElement("canvas"); cv.width = Math.round(W * dpr); cv.height = Math.round(L.H * dpr); cv.style.width = W + "px"; cv.style.height = L.H + "px";
      cv.setAttribute("aria-hidden", "true");
      wrap.appendChild(cv);
      var avail = C.availableNodes(camp), nextLayer = camp.nodeIndex == null ? 0 : camp.layer + 1;
      avail.forEach(function (i) {
        var n = L.act.layers[nextLayer][i], p = L.pos[nextLayer][i], T = TYPE[n.type] || TYPE.battle;
        var b = document.createElement("button"); b.className = "node avail"; b.type = "button";
        b.style.left = (p.x - 24) + "px"; b.style.top = (p.y - 24) + "px";
        b.setAttribute("aria-label", "Travel to " + (n.type === "boss" ? L.act.boss.name : T.name));
        if (/battle|elite|boss/.test(n.type)) b.setAttribute("aria-label",b.getAttribute("aria-label")+" in "+SOVL.Biomes.forNode(camp,n).name);
        b.title = (n.type === "boss" ? L.act.boss.name + ". " : T.name + ". ") + T.note;
        b.onclick = function () { UI.travel(i); };
        b.onmouseenter = function () { hoverIdx = i; }; b.onmouseleave = function () { hoverIdx = null; };
        b.onfocus = b.onmouseenter; b.onblur = b.onmouseleave;
        wrap.appendChild(b);
      });
      var heading = map.querySelector(".campaign-heading");
      map.innerHTML = ""; if (heading) map.appendChild(heading);
      map.appendChild(wrap);
      var pending=camp.nodeIndex==null?null:C.nodeAt(camp,camp.layer,camp.nodeIndex);
      if(pending && pending.type==='camp' && !pending.campClaimed && !UI.modalOpen) {
        setTimeout(function(){if(UI.screen==='campaign'&&!UI.modalOpen&&!pending.campClaimed)UI.campaignCamp(pending);},0);
      }
      state = { cv: cv, L: L, dpr: dpr, avail: avail };
      draw(performance.now());
      if (!raf) raf = requestAnimationFrame(loop);
      // bring the army's position into view
      var focusY = (camp.nodeIndex == null ? L.H - 80 : L.pos[camp.layer][camp.nodeIndex].y) - map.clientHeight * 0.55;
      map.scrollTop = Math.max(0, Math.min(focusY + (heading ? heading.offsetHeight : 0), map.scrollHeight));
    };
  })(UI.renderCampaign);
  window.addEventListener("resize", function () { if (UI.screen === "campaign" && UI.campaign && !UI.campaign.over) UI.renderCampaign(); });
  SOVL.TrailMap = { layout: layout, hit: hitNode };
})();
