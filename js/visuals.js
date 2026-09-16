// Presentation only: readable formations, terrain art, targeting and impact effects.
"use strict";
(function () {
  var G = SOVL.G,
    P = SOVL.Renderer.prototype;
  var ground = new Image();
  ground.src = "assets/battlefield-ground.webp";
  P.groundImage = ground;
  var unitsImage = new Image();
  unitsImage.src = "assets/unit-sprites.webp";
  P.unitAtlas = unitsImage;
  var terrainImage = new Image();
  terrainImage.src = "assets/terrain-sprites.webp";
  // Authored source bounds avoid neighbouring models and unused atlas space.
  var infantry = [
    [65, 10, 271, 288],
    [427, 75, 313, 216],
    [849, 10, 274, 299],
    [1251, 19, 270, 265],
    [1656, 9, 276, 309],
  ];
  var cavalry = [
    [101, 325, 219, 452],
    [461, 331, 231, 423],
    [897, 326, 201, 453],
    [1248, 331, 250, 428],
    [1706, 334, 209, 444],
  ];
  var terrainRects = {
    forest: [15, 129, 409, 463],
    cliff: [462, 136, 386, 441],
    building: [896, 123, 364, 468],
    lake: [1304, 117, 418, 487],
    swamp: [1752, 131, 404, 454],
  };
  var factions = Object.keys(SOVL.FACTION_INFO);
  // Keep faction identity in the models; blue/red outlines always identify allegiance.
  SOVL.FACTION_INFO.empires_of_men.color = "#557fab";
  SOVL.FACTION_INFO.dwarf_holds.color = "#b28a57";
  SOVL.FACTION_INFO.elven_conclaves.color = "#76b9b2";
  SOVL.FACTION_INFO.greenskin_tribes.color = "#87a552";
  SOVL.FACTION_INFO.dead_nations.color = "#a68fba";

  P.drawModelSprite = function (ctx, u, bw, bd) {
    if (
      !unitsImage.complete ||
      !unitsImage.naturalWidth ||
      !/^(Infantry|Infantry Large|Cavalry)$/.test(u.type)
    )
      return false;
    var rect = (u.type === "Cavalry" ? cavalry : infantry)[
        SOVL.factionIndex(u.faction)
      ],
      ratio = Math.min((bw * 0.97) / rect[2], (bd * 0.98) / rect[3]),
      w = rect[2] * ratio,
      h = rect[3] * ratio;
    ctx.save();
    ctx.rotate(Math.PI);
    ctx.drawImage(
      unitsImage,
      rect[0],
      rect[1],
      rect[2],
      rect[3],
      -w / 2,
      -h / 2,
      w,
      h,
    );
    ctx.restore();
    return true;
  };
  P.drawTerrainSprite = function (ctx, t) {
    if (
      !terrainImage.complete ||
      !terrainImage.naturalWidth ||
      !terrainRects[t.kind]
    )
      return false;
    var rect = terrainRects[t.kind];
    ctx.save();
    ctx.fillStyle = "rgba(15,25,17,.1)";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.drawImage(
      terrainImage,
      rect[0],
      rect[1],
      rect[2],
      rect[3],
      t.x,
      t.y,
      t.w,
      t.h,
    );
    // The subtle rectangular outline marks the exact rules footprint.
    ctx.setLineDash([0.24, 0.24]);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = "rgba(234,214,160,.55)";
    ctx.strokeRect(t.x, t.y, t.w, t.h);
    ctx.setLineDash([]);
    var name = SOVL.TERRAIN_TYPES[t.kind].name.toUpperCase();
    ctx.font = "600 " + 11 / this.scale + 'px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    var textWidth = ctx.measureText(name).width;
    ctx.fillStyle = "rgba(12,22,24,.82)";
    ctx.fillRect(
      t.x + t.w / 2 - textWidth / 2 - 0.23,
      t.y - 0.9,
      textWidth + 0.46,
      0.78,
    );
    ctx.fillStyle = "#d8d4bb";
    ctx.fillText(name, t.x + t.w / 2, t.y - 0.32);
    ctx.restore();
    return true;
  };

  P.focusUnits = function (units, combat) {
    if (!units.length) return;
    var x = 0,
      y = 0,
      minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    units.forEach(function (u) {
      x += u.x;
      y += u.y;
      minX = Math.min(minX, u.x - u.w);
      maxX = Math.max(maxX, u.x + u.w);
      minY = Math.min(minY, u.y - u.d);
      maxY = Math.max(maxY, u.y + u.d);
    });
    x /= units.length;
    y /= units.length;
    this.resize();
    this.zoom = combat
      ? G.clamp(
          Math.min(
            this.cw / ((maxX - minX + 12) * this.baseScale),
            (this.ch * 0.5) / ((maxY - minY + 9) * this.baseScale),
          ),
          1.2,
          2.1,
        )
      : Math.max(this.zoom, 1);
    var scale = this.baseScale * this.zoom;
    this.panX =
      this.cw / 2 - ((this.cw - SOVL.TABLE.w * scale) / 2 + x * scale);
    this.panY =
      this.ch * (combat ? 0.28 : 0.47) -
      ((this.ch - SOVL.TABLE.h * scale) / 2 + y * scale);
  };
  P.drawTacticalOverlays = function (b, st) {
    var ctx = this.ctx,
      u = b.unit(st.selected),
      self = this;
    if (
      u &&
      b.phase === "strategic" &&
      b.activeUnit === u.uid &&
      st.mode === "move" &&
      !b.isEngaged(u) &&
      !u.fleeing
    ) {
      ctx.save();
      // An upper bound; the ghost shows the actual legal endpoint and pivot cost.
      ctx.beginPath();
      ctx.arc(u.x, u.y, Math.max(0, u.moveLeft), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(133,193,226,.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(170,218,246,.35)";
      ctx.setLineDash([0.32, 0.25]);
      ctx.lineWidth = 0.07;
      ctx.stroke();
      ctx.restore();
    }
    if (b.phase === "combat") {
      (b.pendingCombats || []).forEach(function (group) {
        group.forEach(function (id) {
          var v = b.unit(id);
          if (!v) return;
          var selected =
            SOVL.UI &&
            SOVL.UI.combatChoice &&
            SOVL.UI.combatChoice.indexOf(id) >= 0;
          ctx.save();
          ctx.beginPath();
          ctx.arc(v.x, v.y, Math.max(v.w, v.d) / 2 + 0.8, 0, Math.PI * 2);
          ctx.fillStyle = selected
            ? "rgba(235,186,100,.16)"
            : "rgba(224,151,99,.06)";
          ctx.fill();
          ctx.lineWidth = selected ? 0.13 : 0.07;
          ctx.strokeStyle = selected ? "#eed294" : "#c99b68";
          ctx.setLineDash([0.35, 0.23]);
          ctx.stroke();
          ctx.restore();
        });
      });
    }
    if (u && st.hover && st.targets && st.targets.indexOf(st.hover) >= 0) {
      var t = b.unit(st.hover);
      if (!t) return;
      ctx.save();
      ctx.strokeStyle = "#ffe2a1";
      ctx.lineWidth = 0.18;
      ctx.setLineDash([0.6, 0.3]);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);
      var corner = G.corners(t);
      ctx.strokeStyle = "#ffeeae";
      ctx.lineWidth = 0.18;
      for (var i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(corner[i].x, corner[i].y, 0.24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (st.preview && u && st.preview.ok) {
      var pv = st.preview;
      ctx.save();
      ctx.font = 12 / this.scale + 'px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      var label =
        pv.cost.toFixed(1) +
        " move · " +
        Math.max(0, u.moveLeft - pv.cost).toFixed(1) +
        " left";
      var pos = self.toScreen(pv.x, pv.y); // label drawn after the world canvas below
      this.moveLabel = {
        text: label,
        x: pos.x,
        y: pos.y - (Math.max(u.w, u.d) * this.scale) / 2 - 18,
      };
      ctx.restore();
    } else this.moveLabel = null;
  };

  P.drawRegimentLabels = function (b, st) {
    var ctx = this.ctx,
      self = this;
    this.labelRects = [];
    var list = b.units.filter(function (u) {
      return u.placed && !u.removed && u.side !== st.hideSide;
    });
    list.sort(function (a, c) {
      return (
        (c.uid === st.selected ? 2 : c.uid === st.hover ? 1 : 0) -
        (a.uid === st.selected ? 2 : a.uid === st.hover ? 1 : 0)
      );
    });
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var isNarrow = this.cw < 600;
    list.forEach(function (u) {
      var p = self.toScreen(
          u._rx == null ? u.x : u._rx,
          u._ry == null ? u.y : u._ry,
        ),
        selected = u.uid === st.selected,
        hovered = u.uid === st.hover;
      if (p.x < 0 || p.x > self.cw || p.y < 0 || p.y > self.ch) return;
      if (self.showLabels === false && !selected && !hovered) return;
      var mine = u.side === st.playerSide,
        full = selected || hovered || (!isNarrow && self.scale > 9),
        name = u.name;
      if (full && name.length > 25) name = name.slice(0, 23) + "…";
      var state = u.fleeing
        ? "ROUTING"
        : b.phase === "strategic" && u.activated
          ? "SPENT"
          : b.isEngaged(u)
            ? "ENGAGED"
            : null;
      var text = full
        ? name
        : (u.ranged
            ? "BOW"
            : /Cavalry/.test(u.type)
              ? "CAV"
              : /Monster|Gargantuan/.test(u.type)
                ? "BEAST"
                : "INF") +
          " " +
          (u.commander ? "★ " : "");
      var n = SOVL.commanderOnly(u)
        ? Math.max(0, u.commander.maxWounds - u.commander.wounds) + " W"
        : String(u.models);
      text += "  " + n;
      ctx.font =
        (selected ? "600 " : "500 ") +
        (isNarrow ? 12 : 13) +
        'px "Segoe UI", Arial, sans-serif';
      var w = Math.ceil(ctx.measureText(text).width) + 18,
        h = selected && state ? 39 : 26;
      var x = G.clamp(p.x - w / 2, 3, Math.max(3, self.cw - w - 3)),
        y = p.y + (Math.max(u.w, u.d) * self.scale) / 2 + 5;
      if (y + h > self.ch - 40)
        y = p.y - (Math.max(u.w, u.d) * self.scale) / 2 - h - 5;
      for (var attempt = 0; attempt < 6; attempt++) {
        var overlap = self.labelRects.some(function (r) {
          return (
            x < r.x + r.w + 2 &&
            x + w > r.x - 2 &&
            y < r.y + r.h + 2 &&
            y + h > r.y - 2
          );
        });
        if (!overlap) break;
        y += h + 3;
      }
      if (y + h > self.ch - 12 || y < 0) return;
      ctx.fillStyle = selected ? "#22394bf5" : "#0b1726eb";
      ctx.strokeStyle = selected ? "#f4d89c" : mine ? "#91b9d8" : "#d2938f";
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mine ? "#e2effa" : "#f7dad5";
      ctx.textAlign = "left";
      ctx.fillText(text, x + 9, y + 17);
      if (selected && state) {
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillStyle = u.fleeing ? "#ffb4a4" : "#e1cda6";
        ctx.fillText(state, x + 9, y + 32);
      }
      var fraction = SOVL.commanderOnly(u)
        ? (u.commander.maxWounds - u.commander.wounds) / u.commander.maxWounds
        : u.models / Math.max(1, u.maxModels);
      ctx.fillStyle = mine ? "#8fbfdc" : "#d58b85";
      ctx.fillRect(x + 1, y + h - 2, Math.max(0, (w - 2) * fraction), 2);
      self.labelRects.push({ x: x, y: y, w: w, h: h, uid: u.uid });
    });
    if (this.moveLabel) {
      var l = this.moveLabel;
      ctx.font = '600 13px "Segoe UI", sans-serif';
      var w = ctx.measureText(l.text).width + 18;
      ctx.fillStyle = "#0a1724f2";
      ctx.fillRect(l.x - w / 2, l.y - 17, w, 24);
      ctx.fillStyle = "#deebf4";
      ctx.textAlign = "center";
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  };
  var draw = P.draw;
  P.draw = function (b, st, now) {
    draw.call(this, b, st, now);
    if (!b) return;
    // Labels stay legible at every zoom and double as generous click targets.
    this.drawRegimentLabels(b, st || {});
    this.drawImpacts(now);
  };
  var unitAt = P.unitAt;
  P.unitAt = function (b, p) {
    var direct = unitAt.call(this, b, p);
    if (direct) return direct;
    var s = this.toScreen(p.x, p.y),
      rects = this.labelRects || [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h)
        return b.unit(r.uid);
    }
    return null;
  };
  P.addImpact = function (x, y, color) {
    if (this.reduceMotion) return;
    this.impacts = this.impacts || [];
    for (var i = 0; i < 14; i++) {
      var angle = (i * Math.PI * 2) / 14,
        velocity = 14 + (i % 4) * 10;
      this.impacts.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color: color || "#edc681",
        t0: performance.now(),
        dur: 480 + (i % 3) * 110,
      });
    }
  };
  P.drawImpacts = function (now) {
    var ctx = this.ctx,
      self = this;
    this.impacts = (this.impacts || []).filter(function (p) {
      return now - p.t0 < p.dur;
    });
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.impacts.forEach(function (p) {
      var dt = (now - p.t0) / 1000,
        life = (now - p.t0) / p.dur,
        s = self.toScreen(p.x, p.y);
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x + p.vx * dt, s.y + p.vy * dt + 18 * dt * dt, 2.5, 2.5);
    });
    ctx.restore();
  };
  SOVL.factionIndex = function (fid) {
    return Math.max(0, factions.indexOf(fid));
  };
})();
