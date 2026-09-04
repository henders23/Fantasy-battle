// Geometry helpers. Units are oriented rectangles: center (x,y), facing angle a
// (radians; 0 = +x), width w (frontage) and depth d. Screen y grows downward.
'use strict';
(function () {
  var G = {};
  G.TAU = Math.PI * 2;
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.len = function (x, y) { return Math.sqrt(x * x + y * y); };
  G.dist = function (a, b) { return G.len(a.x - b.x, a.y - b.y); };
  G.normAngle = function (a) { a = a % G.TAU; if (a > Math.PI) a -= G.TAU; if (a < -Math.PI) a += G.TAU; return a; };
  G.angleDiff = function (from, to) { return G.normAngle(to - from); };
  G.fwd = function (a) { return { x: Math.cos(a), y: Math.sin(a) }; };
  G.right = function (a) { return { x: -Math.sin(a), y: Math.cos(a) }; };

  // Corners in order: FL, FR, RR, RL (front-left, front-right, rear-right, rear-left)
  G.corners = function (r) {
    var f = G.fwd(r.a), rt = G.right(r.a), hw = r.w / 2, hd = r.d / 2;
    return [
      { x: r.x + f.x * hd - rt.x * hw, y: r.y + f.y * hd - rt.y * hw },
      { x: r.x + f.x * hd + rt.x * hw, y: r.y + f.y * hd + rt.y * hw },
      { x: r.x - f.x * hd + rt.x * hw, y: r.y - f.y * hd + rt.y * hw },
      { x: r.x - f.x * hd - rt.x * hw, y: r.y - f.y * hd - rt.y * hw }
    ];
  };
  // Side descriptors: center, outward normal, tangent, length
  G.side = function (r, which) {
    var f = G.fwd(r.a), rt = G.right(r.a), hw = r.w / 2, hd = r.d / 2;
    switch (which) {
      case 'front': return { c: { x: r.x + f.x * hd, y: r.y + f.y * hd }, n: f, t: rt, len: r.w };
      case 'rear': return { c: { x: r.x - f.x * hd, y: r.y - f.y * hd }, n: { x: -f.x, y: -f.y }, t: { x: -rt.x, y: -rt.y }, len: r.w };
      case 'right': return { c: { x: r.x + rt.x * hw, y: r.y + rt.y * hw }, n: rt, t: { x: -f.x, y: -f.y }, len: r.d };
      case 'left': return { c: { x: r.x - rt.x * hw, y: r.y - rt.y * hw }, n: { x: -rt.x, y: -rt.y }, t: f, len: r.d };
    }
  };
  G.SIDES = ['front', 'right', 'rear', 'left'];
  G.frontCenter = function (r) { return G.side(r, 'front').c; };

  // World point -> local (lx along right, ly along forward)
  G.toLocal = function (r, p) {
    var f = G.fwd(r.a), rt = G.right(r.a), dx = p.x - r.x, dy = p.y - r.y;
    return { x: dx * rt.x + dy * rt.y, y: dx * f.x + dy * f.y };
  };
  G.pointInRect = function (r, p, pad) {
    pad = pad || 0; var l = G.toLocal(r, p);
    return Math.abs(l.x) <= r.w / 2 + pad && Math.abs(l.y) <= r.d / 2 + pad;
  };

  // Which zone of r contains point p: front/rear/left/right
  G.zoneOf = function (r, p) {
    var l = G.toLocal(r, p), ex = Math.abs(l.x) - r.w / 2, ey = Math.abs(l.y) - r.d / 2;
    if (ey >= ex) return l.y >= 0 ? 'front' : 'rear';
    return l.x >= 0 ? 'right' : 'left';
  };

  // Separating axis test for two oriented rectangles; returns true if overlapping
  // (with optional negative pad to allow touching).
  G.rectsOverlap = function (a, b, pad) {
    pad = pad || 0;
    var ca = G.corners(a), cb = G.corners(b);
    var axes = [G.fwd(a.a), G.right(a.a), G.fwd(b.a), G.right(b.a)];
    for (var i = 0; i < 4; i++) {
      var ax = axes[i], pa = G.project(ca, ax), pb = G.project(cb, ax);
      if (pa.max < pb.min - pad || pb.max < pa.min - pad) return false;
    }
    return true;
  };
  G.project = function (pts, ax) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < pts.length; i++) { var v = pts[i].x * ax.x + pts[i].y * ax.y; if (v < mn) mn = v; if (v > mx) mx = v; }
    return { min: mn, max: mx };
  };
  // Minimum separation distance between two rects along the 4 axes (0 if overlapping)
  G.rectGap = function (a, b) {
    var ca = G.corners(a), cb = G.corners(b);
    var axes = [G.fwd(a.a), G.right(a.a), G.fwd(b.a), G.right(b.a)], best = 0;
    for (var i = 0; i < 4; i++) {
      var pa = G.project(ca, axes[i]), pb = G.project(cb, axes[i]);
      var gap = Math.max(pa.min - pb.max, pb.min - pa.max);
      if (gap > best) best = gap;
    }
    return best;
  };
  // Axis-aligned rect helper for terrain: {x,y,w,h} top-left
  G.aabbCorners = function (t) { return [{ x: t.x, y: t.y }, { x: t.x + t.w, y: t.y }, { x: t.x + t.w, y: t.y + t.h }, { x: t.x, y: t.y + t.h }]; };
  G.rectOverlapsAabb = function (r, t, pad) {
    pad = pad || 0;
    var cr = G.corners(r), ct = G.aabbCorners(t);
    var axes = [G.fwd(r.a), G.right(r.a), { x: 1, y: 0 }, { x: 0, y: 1 }];
    for (var i = 0; i < 4; i++) {
      var pa = G.project(cr, axes[i]), pb = G.project(ct, axes[i]);
      if (pa.max < pb.min - pad || pb.max < pa.min - pad) return false;
    }
    return true;
  };
  G.pointInAabb = function (p, t) { return p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h; };
  G.rectInsideTable = function (r, W, H, margin) {
    margin = margin || 0; var c = G.corners(r);
    for (var i = 0; i < 4; i++) if (c[i].x < margin || c[i].y < margin || c[i].x > W - margin || c[i].y > H - margin) return false;
    return true;
  };
  G.rectTouchesEdge = function (r, W, H) {
    var c = G.corners(r);
    for (var i = 0; i < 4; i++) if (c[i].x <= 0 || c[i].y <= 0 || c[i].x >= W || c[i].y >= H) return true;
    return false;
  };
  // Segment/AABB intersection (Liang-Barsky)
  G.segHitsAabb = function (p, q, t) {
    var t0 = 0, t1 = 1, dx = q.x - p.x, dy = q.y - p.y;
    var checks = [[-dx, p.x - t.x], [dx, t.x + t.w - p.x], [-dy, p.y - t.y], [dy, t.y + t.h - p.y]];
    for (var i = 0; i < 4; i++) {
      var pp = checks[i][0], qq = checks[i][1];
      if (pp === 0) { if (qq < 0) return false; }
      else { var r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return true;
  };
  G.segHitsRect = function (p, q, r) {
    // transform to r's local frame, then AABB test
    var lp = G.toLocal(r, p), lq = G.toLocal(r, q);
    return G.segHitsAabb(lp, lq, { x: -r.w / 2, y: -r.d / 2, w: r.w, h: r.d });
  };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.rotPoint = function (p, c, ang) {
    var s = Math.sin(ang), co = Math.cos(ang), dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
  };
  SOVL.G = G;
})();
