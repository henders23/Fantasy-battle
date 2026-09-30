// Procedural relief terrain. Every piece gets its own heightmap and colour map, lit from the
// upper left with cast shadows and ambient occlusion, then cached as an image that fills the
// piece's rules footprint. Presentation only: the rules still use the rectangle in the state.
"use strict";
(function () {
  if (typeof document === "undefined" || !SOVL.Renderer) return;
  var P = SOVL.Renderer.prototype,
    fallbackDraw = P.drawTerrainSprite;

  // Everything that paints a piece lives in this self-contained function, so it can run in a
  // background worker (built from its source text) or, where workers are unavailable, here.
  function terrainCore() {
  var PPI = 44, // texture pixels per inch
    M = 2.8; // margin around the footprint for overhanging art and cast shadows
  var LX = -0.55, LY = -0.65, LZ = 0.72, ln = Math.hypot(LX, LY, LZ);
  LX /= ln; LY /= ln; LZ /= ln;
  var LXY = Math.hypot(LX, LY), SLOPE = LZ / LXY;
  var HX = LX, HY = LY, HZ = LZ + 1, hn = Math.hypot(HX, HY, HZ);
  HX /= hn; HY /= hn; HZ /= hn;
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s += 0x6d2b79f5; var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function hash(a, b) { var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }

  function makeNoise(seed) {
    var r = makeRng((seed >>> 0) || 1), perm = new Uint16Array(512), vals = new Float32Array(256), i;
    for (i = 0; i < 256; i++) { perm[i] = i; vals[i] = r() * 2 - 1; }
    for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function n(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      xi &= 255; yi &= 255;
      var a = vals[perm[xi + perm[yi]]], b = vals[perm[xi + 1 + perm[yi]]],
        c = vals[perm[xi + perm[yi + 1]]], d = vals[perm[xi + 1 + perm[yi + 1]]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    // fractal sum, rotated each octave to hide the lattice; roughly in [-0.6, 0.6]
    function fbm(x, y, oct) {
      var s = 0, amp = 0.5, norm = 0;
      for (var o = 0; o < oct; o++) {
        s += amp * n(x, y); norm += amp; amp *= 0.5;
        var nx = x * 1.6 - y * 1.2 + 17.3, ny = x * 1.2 + y * 1.6 - 9.1; x = nx; y = ny;
      }
      return (s / norm) * 0.8;
    }
    return { n: n, fbm: fbm };
  }

  function Field(t) {
    this.t = t;
    this.w = Math.ceil((t.w + 2 * M) * PPI);
    this.h = Math.ceil((t.h + 2 * M) * PPI);
    var n = this.w * this.h;
    this.H = new Float32Array(n); this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
    this.A = new Float32Array(n); this.W = new Float32Array(n); this.Moss = new Float32Array(n);
  }
  // visit every texel with piece-local inch coordinates (0..w, 0..h is the footprint)
  function each(F, fn) {
    for (var y = 0, i = 0; y < F.h; y++) {
      var ly = y / PPI - M;
      for (var x = 0; x < F.w; x++, i++) fn(i, x / PPI - M, ly);
    }
  }
  // signed distance (inches) to an organic rounded shape filling the footprint
  function sdShape(lx, ly, t, nz, rough, round) {
    var px = lx - t.w / 2, py = ly - t.h / 2, rr = Math.min(t.w, t.h) * (round == null ? 0.32 : round);
    var qx = Math.abs(px) - t.w / 2 + rr, qy = Math.abs(py) - t.h / 2 + rr;
    var sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    return sd + rough * (nz.fbm(lx * 0.3, ly * 0.3, 3) * 1.1 + nz.fbm(lx * 1.1 + 7, ly * 1.1, 3) * 0.35);
  }
  // raise a dome, cone or flat-topped disc; texels are only replaced where the new surface is higher
  function disc(F, nz, cx, cy, r, h, col, opt) {
    opt = opt || {};
    var x0 = Math.max(0, Math.floor((cx - r + M) * PPI)), x1 = Math.min(F.w - 1, Math.ceil((cx + r + M) * PPI));
    var y0 = Math.max(0, Math.floor((cy - r + M) * PPI)), y1 = Math.min(F.h - 1, Math.ceil((cy + r + M) * PPI));
    var base = opt.base || 0, tex = opt.tex == null ? 0.25 : opt.tex, ts = opt.texScale || 5;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var px = x / PPI - M, py = y / PPI - M, dx = px - cx, dy = py - cy, q = Math.hypot(dx, dy) / r;
      if (q >= 1) continue;
      if (opt.notch != null) { var da = Math.abs(((Math.atan2(dy, dx) - opt.notch + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (da < 0.3) continue; }
      var hh = opt.flat ? h * (q < 0.75 ? 1 : Math.sqrt(1 - Math.pow((q - 0.75) / 0.25, 2))) : opt.cone ? h * (1 - q) : h * Math.sqrt(1 - q * q);
      hh += base;
      var i = y * F.w + x;
      if (hh <= F.H[i]) continue;
      var k = 1 + tex * nz.fbm(px * ts, py * ts, 2) * 2;
      F.H[i] = hh; F.R[i] = col[0] * k; F.G[i] = col[1] * k; F.B[i] = col[2] * k; F.A[i] = 1; F.W[i] = 0; F.Moss[i] = opt.moss || 0;
    }
  }
  // a blade of grass or reed, stamped as a tapering line that falls from h0 to h1
  function blade(F, x0, y0, ang, len, h0, h1, wid, c0, c1) {
    var steps = Math.max(2, Math.ceil(len * PPI * 1.5)), ca = Math.cos(ang), sa = Math.sin(ang);
    for (var s = 0; s <= steps; s++) {
      var t = s / steps, x = (x0 + ca * len * t + M) * PPI, y = (y0 + sa * len * t + M) * PPI;
      var hh = mix(h0, h1, t), rad = Math.max(0.55, wid * PPI * (1 - t * 0.7));
      var xa = Math.max(0, Math.floor(x - rad)), xb = Math.min(F.w - 1, Math.ceil(x + rad));
      var ya = Math.max(0, Math.floor(y - rad)), yb = Math.min(F.h - 1, Math.ceil(y + rad));
      for (var py = ya; py <= yb; py++) for (var px = xa; px <= xb; px++) {
        if ((px - x) * (px - x) + (py - y) * (py - y) > rad * rad) continue;
        var i = py * F.w + px;
        if (hh <= F.H[i]) continue;
        F.H[i] = hh; F.R[i] = mix(c0[0], c1[0], t); F.G[i] = mix(c0[1], c1[1], t); F.B[i] = mix(c0[2], c1[2], t); F.A[i] = 1; F.W[i] = 0; F.Moss[i] = 0;
      }
    }
  }
  // a low clump of grass: short strokes leaning with the wind, never radial
  var WIND = 0.9;
  function tuft(F, rnd, cx, cy, size, c0, c1, h) {
    var n = 8 + Math.floor(rnd() * 10);
    for (var k = 0; k < n; k++) {
      var ox = (rnd() - 0.5) * size, oy = (rnd() - 0.5) * size * 0.8;
      blade(F, cx + ox, cy + oy, WIND + (rnd() - 0.5) * 0.9, size * (0.35 + rnd() * 0.4), h, h * 0.6, 0.02, c0, c1);
    }
  }
  var GRASS = [[0.34, 0.35, 0.18], [0.4, 0.39, 0.21], [0.36, 0.37, 0.19]], GRASS_TIP = [0.47, 0.45, 0.27];
  // tufts of grass across the edge so a piece settles into the painted ground
  function edgeTufts(F, t, nz, rnd, rough, round, density, inside) {
    var per = 2 * (t.w + t.h), n = Math.floor(per * density);
    for (var k = 0, tries = 0; k < n && tries < n * 20; tries++) {
      var x = -0.6 + rnd() * (t.w + 1.2), y = -0.6 + rnd() * (t.h + 1.2), sd = sdShape(x, y, t, nz, rough, round);
      if (sd < (inside || -0.35) || sd > 0.45) continue;
      k++;
      tuft(F, rnd, x, y, 0.22 + rnd() * 0.2, GRASS[k % 3], GRASS_TIP, 0.07 + rnd() * 0.05);
    }
  }
  // scatter points inside a region, keeping them apart relative to their radii
  function scatter(rnd, t, count, rMin, rMax, spacing, ok) {
    var pts = [];
    for (var tries = 0; tries < count * 40 && pts.length < count; tries++) {
      var r = rMin + rnd() * (rMax - rMin), x = rnd() * t.w, y = rnd() * t.h;
      if (!ok(x, y, r)) continue;
      var clear = true;
      for (var j = 0; j < pts.length; j++) { var q = pts[j]; if (Math.hypot(q.x - x, q.y - y) < (q.r + r) * spacing) { clear = false; break; } }
      if (clear) pts.push({ x: x, y: y, r: r });
    }
    return pts;
  }

  // an irregular, flat-topped stone with faceted sides
  function rock(F, nz, rnd, cx, cy, r, h, col, moss) {
    var ph = rnd() * 100, sq = 0.65 + rnd() * 0.35, rot = rnd() * Math.PI;
    var x0 = Math.max(0, Math.floor((cx - r * 1.3 + M) * PPI)), x1 = Math.min(F.w - 1, Math.ceil((cx + r * 1.3 + M) * PPI));
    var y0 = Math.max(0, Math.floor((cy - r * 1.3 + M) * PPI)), y1 = Math.min(F.h - 1, Math.ceil((cy + r * 1.3 + M) * PPI));
    var cr = Math.cos(rot), sr = Math.sin(rot);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var px = x / PPI - M, py = y / PPI - M, dx = px - cx, dy = py - cy, ux = dx * cr + dy * sr, uy = (-dx * sr + dy * cr) / sq;
      var ang = Math.atan2(uy, ux), rr = r * (1 + 0.28 * nz.n(Math.cos(ang) * 1.3 + ph, Math.sin(ang) * 1.3 + ph)), q = Math.hypot(ux, uy) / rr;
      if (q >= 1) continue;
      var facet = nz.n(px * 9 / Math.max(0.3, r * 3) + ph, py * 9 / Math.max(0.3, r * 3));
      var hh = h * (1 - Math.pow(q, 2.6)) * (0.85 + 0.25 * facet);
      var i = y * F.w + x;
      if (hh <= F.H[i]) continue;
      var k = 0.85 + 0.3 * (nz.fbm(px * 10, py * 10, 2) + 0.5);
      F.H[i] = hh; F.R[i] = col[0] * k; F.G[i] = col[1] * k; F.B[i] = col[2] * k; F.A[i] = 1; F.W[i] = 0; F.Moss[i] = moss || 0;
    }
  }

  // a rush tussock: a soft mound with streaks running with the wind
  function tussock(F, nz, rnd, cx, cy, r, h, col) {
    var ph = rnd() * 50, cw = Math.cos(WIND), sw = Math.sin(WIND);
    var x0 = Math.max(0, Math.floor((cx - r * 1.3 + M) * PPI)), x1 = Math.min(F.w - 1, Math.ceil((cx + r * 1.3 + M) * PPI));
    var y0 = Math.max(0, Math.floor((cy - r * 1.3 + M) * PPI)), y1 = Math.min(F.h - 1, Math.ceil((cy + r * 1.3 + M) * PPI));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var px = x / PPI - M, py = y / PPI - M, dx = px - cx, dy = py - cy, ang = Math.atan2(dy, dx);
      var rr = r * (1 + 0.38 * nz.n(Math.cos(ang) * 2.2 + ph, Math.sin(ang) * 2.2 + ph)), q = Math.hypot(dx, dy) / rr;
      if (q >= 1) continue;
      var along = dx * cw + dy * sw, across = -dx * sw + dy * cw, streak = nz.n(along * 4 + ph, across * 45) * 0.5 + 0.5, fine = nz.n(px * 30, py * 30) * 0.5 + 0.5;
      var hh = h * Math.pow(1 - q * q, 0.8) * (0.85 + 0.2 * streak), i = y * F.w + x;
      if (hh <= F.H[i]) continue;
      var k = (0.8 + 0.22 * streak + 0.14 * fine) * (0.92 + 0.12 * (1 - q));
      F.H[i] = hh; F.R[i] = col[0] * k; F.G[i] = col[1] * k; F.B[i] = col[2] * k; F.A[i] = 1; F.W[i] = 0; F.Moss[i] = 0;
    }
  }

  var GEN = {};
  GEN.forest = function (F, t, nz, rnd) {
    each(F, function (i, lx, ly) {
      var sd = sdShape(lx, ly, t, nz, 1);
      var a = 1 - smooth(-0.3, 0.3, sd);
      if (a <= 0) return;
      var n1 = nz.fbm(lx * 0.8, ly * 0.8, 4), n2 = nz.fbm(lx * 3.1 + 11, ly * 3.1, 3), m = smooth(-0.25, 0.25, n1), k = 0.82 + (n2 + 0.5) * 0.36;
      F.R[i] = mix(0.24, 0.18, m) * k; F.G[i] = mix(0.21, 0.23, m) * k; F.B[i] = mix(0.13, 0.12, m) * k;
      F.A[i] = a; F.H[i] = (0.03 + 0.06 * (n2 + 0.5)) * a;
    });
    var PAL = [[0.2, 0.3, 0.12], [0.24, 0.33, 0.13], [0.28, 0.35, 0.14], [0.19, 0.27, 0.13], [0.3, 0.34, 0.14], [0.22, 0.31, 0.15]],
      CON = [[0.12, 0.21, 0.14], [0.14, 0.23, 0.15], [0.15, 0.24, 0.13]], AUT = [[0.35, 0.33, 0.14], [0.33, 0.3, 0.13]];
    var trees = scatter(rnd, t, Math.ceil(t.w * t.h / 0.8), 0.42, 1.05, 0.62, function (x, y) { return sdShape(x, y, t, nz, 1) < -0.3; });
    trees.sort(function (a, b) { return a.r - b.r; });
    trees.forEach(function (tr, idx) {
      var conifer = rnd() < 0.25, col = conifer ? CON[idx % 3] : rnd() < 0.06 ? AUT[idx % 2] : PAL[Math.floor(rnd() * PAL.length)];
      var ht = (conifer ? 1.9 : 1.3) + rnd() * 0.6, ph = rnd() * 6.28, r = tr.r * (conifer ? 0.8 : 1), spikes = 7 + Math.floor(rnd() * 3);
      // a deciduous crown is a cluster of overlapping leaf masses
      var lobes = [{ x: 0, y: 0, r: r * 0.62, h: ht }];
      if (!conifer) for (var l = 0, nl = 5 + Math.floor(rnd() * 4); l < nl; l++) {
        var la = ph + (l / nl) * 6.28 + (rnd() - 0.5) * 0.6, ld = r * (0.3 + rnd() * 0.22), lr = r * (0.38 + rnd() * 0.2);
        lobes.push({ x: Math.cos(la) * ld, y: Math.sin(la) * ld, r: lr, h: ht * (0.78 + rnd() * 0.15) });
      }
      var x0 = Math.max(0, Math.floor((tr.x - r * 1.2 + M) * PPI)), x1 = Math.min(F.w - 1, Math.ceil((tr.x + r * 1.2 + M) * PPI));
      var y0 = Math.max(0, Math.floor((tr.y - r * 1.2 + M) * PPI)), y1 = Math.min(F.h - 1, Math.ceil((tr.y + r * 1.2 + M) * PPI));
      var ts = conifer ? 9 : 5.5, tint = 0.92 + rnd() * 0.16;
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var px = x / PPI - M, py = y / PPI - M, dx = px - tr.x, dy = py - tr.y, hh = -1, q = 1;
        var bump = nz.fbm(px * ts, py * ts, 2);
        if (conifer) {
          var ang = Math.atan2(dy, dx), rr = r * (0.8 + 0.2 * Math.pow(Math.abs(Math.cos(ang * spikes / 2 + ph)), 0.5)), d = Math.hypot(dx, dy);
          if (d < rr) { q = d / rr; hh = ht * (1 - q) + 0.08 * bump; }
        } else {
          for (var l2 = 0; l2 < lobes.length; l2++) {
            var L2 = lobes[l2], ex = dx - L2.x, ey = dy - L2.y, rrr = L2.r * (1 + 0.12 * bump), qq = Math.hypot(ex, ey) / rrr;
            if (qq < 1) { var v = L2.h * Math.sqrt(1 - qq * qq); if (v > hh) { hh = v; q = qq; } }
          }
          if (hh > 0) hh += 0.2 * bump;
        }
        if (hh <= 0) continue;
        var i = y * F.w + x;
        if (hh <= F.H[i]) continue;
        var k = (0.72 + 0.55 * (bump + 0.5)) * (0.9 + 0.14 * (1 - q)) * tint;
        F.H[i] = hh; F.R[i] = col[0] * k; F.G[i] = col[1] * k; F.B[i] = col[2] * k; F.A[i] = 1; F.W[i] = 0;
      }
    });
    // undergrowth along the edge
    scatter(rnd, t, Math.ceil((t.w + t.h) * 1.4), 0.2, 0.42, 0.9, function (x, y) { var sd = sdShape(x, y, t, nz, 1); return sd > -0.9 && sd < 0.05; })
      .forEach(function (b, k) { disc(F, nz, b.x, b.y, b.r, 0.35 + b.r * 0.5, PAL[k % PAL.length].map(function (c) { return c * 1.1; }), { tex: 0.35, texScale: 9 }); });
    edgeTufts(F, t, nz, rnd, 1, null, 1);
  };

  GEN.swamp = function (F, t, nz, rnd) {
    function waterAt(lx, ly, sd) { return nz.fbm(lx * 0.5, ly * 0.5, 4) + Math.min(1.5, -sd) * 0.12 + 0.02; }
    each(F, function (i, lx, ly) {
      var sd = sdShape(lx, ly, t, nz, 1);
      var a = 1 - smooth(-0.35, 0.3, sd);
      if (a <= 0) return;
      var wv = waterAt(lx, ly, sd), water = smooth(0.0, 0.05, wv) * smooth(-0.05, 0.25, -sd);
      var n2 = nz.fbm(lx * 2.3 + 5, ly * 2.3, 3), n3 = nz.fbm(lx * 7, ly * 7, 2), m = smooth(-0.2, 0.25, n2), k = 0.85 + (n3 + 0.5) * 0.3;
      var gr = mix(0.31, 0.26, m) * k, gg = mix(0.27, 0.32, m) * k, gb = mix(0.16, 0.14, m) * k;
      var depth = smooth(0.02, 0.3, wv);
      var wr = mix(0.19, 0.08, depth), wg = mix(0.21, 0.12, depth), wb = mix(0.13, 0.1, depth);
      var scum = smooth(0.12, 0.32, nz.fbm(lx * 2.4 + 30, ly * 2.4, 3)) * water * 0.85;
      wr = mix(wr, 0.29, scum); wg = mix(wg, 0.37, scum); wb = mix(wb, 0.14, scum);
      F.R[i] = mix(gr, wr, water); F.G[i] = mix(gg, wg, water); F.B[i] = mix(gb, wb, water);
      F.H[i] = (0.06 + 0.16 * (n2 + 0.5)) * (1 - water) * a + water * 0.015 * nz.n(lx * 5, ly * 9);
      F.A[i] = a; F.W[i] = water * (1 - scum);
    });
    var REED = [[0.42, 0.43, 0.2], [0.36, 0.41, 0.18], [0.47, 0.45, 0.23]], CATTAIL = [0.3, 0.19, 0.1];
    // lily pads on open water
    for (var p = 0, tries = 0; p < t.w * t.h * 0.45 && tries < 800; tries++) {
      var lx = rnd() * t.w, ly = rnd() * t.h, sd = sdShape(lx, ly, t, nz, 1);
      if (sd > -0.3 || waterAt(lx, ly, sd) < 0.09) continue;
      p++;
      var pr = 0.07 + rnd() * 0.08;
      disc(F, nz, lx, ly, pr, 0.02, [0.2 + rnd() * 0.05, 0.29 + rnd() * 0.05, 0.12], { flat: true, tex: 0.15, notch: rnd() * 6.28 });
      if (rnd() < 0.15) disc(F, nz, lx + pr * 0.2, ly - pr * 0.2, 0.05, 0.05, [0.86, 0.8, 0.74], { tex: 0 });
    }
    // reed beds, mostly on the water's edge
    var clumps = scatter(rnd, t, Math.ceil(t.w * t.h / 2.4), 0.25, 0.55, 1.0, function (x, y) {
      var sd = sdShape(x, y, t, nz, 1); if (sd > -0.15) return false; var wv = waterAt(x, y, sd); return wv > -0.08 && wv < 0.08;
    });
    clumps.forEach(function (c, k) {
      for (var j2 = 0, m = 3 + Math.floor(rnd() * 3); j2 < m; j2++) tussock(F, nz, rnd, c.x + (rnd() - 0.5) * c.r, c.y + (rnd() - 0.5) * c.r, c.r * (0.35 + rnd() * 0.3), 0.22 + rnd() * 0.1, REED[(k + j2) % 3]);
      for (var j = 0, n = Math.floor(rnd() * 4); j < n; j++) disc(F, nz, c.x + (rnd() - 0.5) * c.r, c.y + (rnd() - 0.5) * c.r, 0.035, 0.62, CATTAIL, { tex: 0.1 });
    });
    // a fallen, rotting log
    if (rnd() < 0.7) {
      var lx0 = t.w * (0.25 + rnd() * 0.5), ly0 = t.h * (0.25 + rnd() * 0.5), la = rnd() * Math.PI, ll = 1.3 + rnd() * 1.2, lr = 0.13;
      var ca = Math.cos(la), sa = Math.sin(la);
      for (var y = 0; y < F.h; y++) for (var x = 0; x < F.w; x++) {
        var px = x / PPI - M - lx0, py = y / PPI - M - ly0, al = px * ca + py * sa, ac = -px * sa + py * ca;
        if (Math.abs(al) > ll / 2 || Math.abs(ac) >= lr) continue;
        var i = y * F.w + x, hh = 0.04 + lr * 1.4 * Math.sqrt(1 - (ac / lr) * (ac / lr));
        if (hh <= F.H[i]) continue;
        var bark = 0.78 + 0.45 * (nz.n(al * 5, ac * 30) * 0.5 + 0.5);
        F.H[i] = hh; F.R[i] = 0.3 * bark; F.G[i] = 0.24 * bark; F.B[i] = 0.17 * bark; F.A[i] = 1; F.W[i] = 0; F.Moss[i] = 0.5;
      }
    }
    edgeTufts(F, t, nz, rnd, 1, null, 1);
  };

  GEN.lake = function (F, t, nz, rnd) {
    function inland(lx, ly) { return -sdShape(lx, ly, t, nz, 0.8, 0.45) + 0.45 * nz.fbm(lx * 0.9, ly * 0.9, 3); }
    each(F, function (i, lx, ly) {
      var sd = sdShape(lx, ly, t, nz, 0.8, 0.45), a = 1 - smooth(-0.25, 0.25, sd);
      if (a <= 0) return;
      var dd = -sd + 0.45 * nz.fbm(lx * 0.9, ly * 0.9, 3);
      var water = smooth(0.5, 0.68, dd), depth = smooth(0.65, 3.2, dd), wet = smooth(0.15, 0.55, dd);
      var n3 = nz.fbm(lx * 7, ly * 7, 2), k = 0.86 + (n3 + 0.5) * 0.3;
      var br = mix(0.45, 0.28, wet) * k, bg = mix(0.4, 0.25, wet) * k, bb = mix(0.28, 0.17, wet) * k;
      var wr = mix(0.21, 0.07, depth), wg = mix(0.33, 0.17, depth), wb = mix(0.3, 0.24, depth);
      F.R[i] = mix(br, wr, water); F.G[i] = mix(bg, wg, water); F.B[i] = mix(bb, wb, water);
      var bank = 0.13 * Math.sin(Math.PI * clamp(dd / 0.6, 0, 1)) + 0.03 * (n3 + 0.5);
      F.H[i] = mix(bank * a, 0.012 * nz.n(lx * 3, ly * 5.5) + 0.004 * nz.n(lx * 9, ly * 5), water);
      F.A[i] = a; F.W[i] = water;
    });
    var ROCK = [[0.48, 0.46, 0.42], [0.4, 0.38, 0.34], [0.53, 0.5, 0.44]];
    scatter(rnd, t, Math.ceil((t.w + t.h) * 0.9), 0.1, 0.32, 1.05, function (x, y) { var d = inland(x, y); return d > 0.05 && d < 0.65; })
      .forEach(function (s, k) { rock(F, nz, rnd, s.x, s.y, s.r, s.r * 0.7, ROCK[k % 3], 0.6); });
    var REED = [[0.42, 0.43, 0.2], [0.36, 0.41, 0.18]];
    scatter(rnd, t, Math.ceil((t.w + t.h) * 0.8), 0.22, 0.42, 1.0, function (x, y) { var d = inland(x, y); return d > 0.4 && d < 0.85 && nz.fbm(x * 0.35 + 50, y * 0.35, 2) > 0; })
      .forEach(function (c, k) { for (var j = 0, m = 2 + Math.floor(rnd() * 3); j < m; j++) tussock(F, nz, rnd, c.x + (rnd() - 0.5) * c.r, c.y + (rnd() - 0.5) * c.r, c.r * (0.4 + rnd() * 0.3), 0.22 + rnd() * 0.08, REED[(k + j) % 2]); });
  };

  GEN.cliff = function (F, t, nz, rnd) {
    var top = 1.9 + rnd() * 0.5, step = 0.5;
    each(F, function (i, lx, ly) {
      var sd = sdShape(lx, ly, t, nz, 1.2, 0.42), a = 1 - smooth(-0.12, 0.2, sd);
      if (a <= 0) return;
      var base = smooth(-0.05, 1.4, -sd);
      var raw = base * top * (0.72 + 0.4 * (nz.fbm(lx * 0.35 + 3, ly * 0.35, 3) + 0.5)), s = raw / step, fl = Math.floor(s);
      var h = (fl + smooth(0.5, 0.85, s - fl)) * step;
      var ridge = 1 - Math.abs(nz.fbm(lx * 1.6, ly * 1.6, 4) * 2);
      h += 0.2 * ridge * base + 0.05 * nz.fbm(lx * 6, ly * 6, 2);
      var tone = nz.fbm(lx * 0.9 + 20, ly * 0.9, 3) + 0.5, strata = fl % 2 ? 0.92 : 1.04;
      var crack = 1 - smooth(0.0, 0.035, Math.abs(nz.fbm(lx * 2.2 + 40, ly * 2.2, 3)));
      var k = strata * (1 - 0.45 * crack) * (0.88 + 0.24 * (nz.fbm(lx * 8, ly * 8, 2) + 0.5));
      var r0 = mix(0.42, 0.53, tone), g0 = mix(0.4, 0.49, tone), b0 = mix(0.36, 0.43, tone), foot = 1 - smooth(0.05, 0.25, base);
      F.R[i] = mix(r0, 0.35, foot) * k; F.G[i] = mix(g0, 0.31, foot) * k; F.B[i] = mix(b0, 0.23, foot) * k;
      F.H[i] = h * a; F.A[i] = a; F.Moss[i] = base > 0.3 ? 0.75 : 0;
    });
    var ROCK = [[0.47, 0.45, 0.41], [0.4, 0.38, 0.35], [0.52, 0.49, 0.44]];
    scatter(rnd, t, Math.ceil((t.w + t.h) * 3), 0.06, 0.2, 1.0, function (x, y) { var sd = sdShape(x, y, t, nz, 1.2, 0.42); return sd > -0.3 && sd < 0.6; })
      .forEach(function (s, k) { rock(F, nz, rnd, s.x, s.y, s.r, s.r * 0.75, ROCK[k % 3], 0); });
    scatter(rnd, t, Math.ceil((t.w + t.h) * 0.4), 0.28, 0.5, 1.1, function (x, y) { var sd = sdShape(x, y, t, nz, 1.2, 0.42); return sd > -0.2 && sd < 0.35; })
      .forEach(function (s, k) { rock(F, nz, rnd, s.x, s.y, s.r, s.r * 0.85, ROCK[k % 3], 0.7); });
  };

  GEN.building = function (F, t, nz, rnd) {
    var x0 = 0.28, x1 = t.w - 0.28, y0 = 0.28, y1 = t.h - 0.28, T = 0.42, TW = 0.3, SZ = 0.55;
    var ix = t.w * (0.42 + rnd() * 0.18), door = t.h * (0.35 + rnd() * 0.3), wallTop = 1.35 + rnd() * 0.35, per = 2 * (x1 - x0 + y1 - y0);
    function wallHeight(s, salt) {
      if (nz.fbm(s * 0.3 + salt, 2.2, 2) < -0.2) return 0; // breach
      return wallTop * (0.28 + 0.72 * smooth(-0.15, 0.25, nz.fbm(s * 0.34 + salt, 0.5, 3))) + 0.14 * nz.n(s * 3.1, 9.5 + salt);
    }
    var STONE = [0.56, 0.53, 0.47];
    each(F, function (i, lx, ly) {
      var px = lx - t.w / 2, py = ly - t.h / 2, qx = Math.abs(px) - t.w / 2 + 0.2, qy = Math.abs(py) - t.h / 2 + 0.2;
      var sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.2 + 0.3 * nz.fbm(lx * 0.8, ly * 0.8, 3);
      var a = 1 - smooth(-0.15, 0.15, sd);
      if (a <= 0) return;
      // flagstones, some lost to earth and grass
      var row = Math.floor(ly / SZ), off = (row & 1) * 0.5, col = Math.floor(lx / SZ + off), fx = lx / SZ + off - col, fy = ly / SZ - row;
      var grout = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.06, hv = hash(col, row), lost = hv < 0.16 || nz.fbm(lx * 0.6 + 9, ly * 0.6, 3) > 0.22;
      var n3 = nz.fbm(lx * 6, ly * 6, 2), k = 0.86 + (n3 + 0.5) * 0.28, r, g, b, h;
      if (lost) { var gm = smooth(-0.1, 0.2, nz.fbm(lx * 1.7, ly * 1.7, 2)); r = mix(0.34, 0.36, gm) * k; g = mix(0.29, 0.39, gm) * k; b = mix(0.2, 0.19, gm) * k; h = 0.01; }
      else if (grout) { r = 0.27; g = 0.25; b = 0.21; h = 0.0; }
      else { var tone = 0.84 + hv * 0.3; r = 0.5 * tone * k; g = 0.47 * tone * k; b = 0.41 * tone * k; h = 0.05; }
      // walls: the outer circuit and one partition with a doorway
      var dl = lx - x0, dr = x1 - lx, dt = ly - y0, db = y1 - ly, dmin = Math.min(dl, dr, dt, db), wh = 0, s = 0, across = 0;
      if (dmin >= 0 && dmin < T) {
        if (dmin === dt) s = lx - x0; else if (dmin === dr) s = x1 - x0 + ly - y0; else if (dmin === db) s = x1 - x0 + y1 - y0 + x1 - lx; else s = per - (ly - y0);
        wh = wallHeight(s, 0); across = dmin / T;
      }
      if (Math.abs(lx - ix) < TW / 2 && ly > y0 && ly < y1 && Math.abs(ly - door) > 0.5) { var w2 = wallHeight(ly * 1.3 + 40, 40) * 0.85; if (w2 > wh) { wh = w2; s = ly + 40; across = (lx - ix) / TW + 0.5; } }
      if (wh > 0) {
        var block = Math.floor(s / 0.38 + (across > 0.5 ? 0.5 : 0)), bt = 0.85 + hash(block, 7) * 0.28, joint = Math.abs(s / 0.38 + (across > 0.5 ? 0.5 : 0) - block - 0.5) > 0.44 || Math.abs(across - 0.5) < 0.04;
        var edge = Math.min(across, 1 - across);
        wh *= 0.82 + 0.18 * smooth(0, 0.15, edge);
        if (wh > h) { h = wh; r = STONE[0] * bt * k * (joint ? 0.72 : 1); g = STONE[1] * bt * k * (joint ? 0.72 : 1); b = STONE[2] * bt * k * (joint ? 0.72 : 1); F.Moss[i] = 0.6; }
      }
      F.R[i] = r; F.G[i] = g; F.B[i] = b; F.H[i] = h * a; F.A[i] = a;
    });
    // rubble heaped beside the walls, thickest at the breaches
    var RUB = [[0.55, 0.52, 0.46], [0.46, 0.44, 0.4], [0.6, 0.56, 0.49]];
    for (var k = 0, tries = 0; k < (t.w + t.h) * 9 && tries < 3000; tries++) {
      var s = rnd() * per, side, x, y;
      if (s < x1 - x0) { x = x0 + s; y = y0; } else if (s < x1 - x0 + y1 - y0) { x = x1; y = y0 + s - (x1 - x0); } else if (s < 2 * (x1 - x0) + y1 - y0) { x = x1 - (s - (x1 - x0) - (y1 - y0)); y = y1; } else { x = x0; y = y1 - (s - 2 * (x1 - x0) - (y1 - y0)); }
      var breach = wallHeight(s, 0) < 0.5;
      if (!breach && rnd() > 0.35) continue;
      k++;
      var spread = breach ? 0.9 : 0.5, rr = 0.05 + rnd() * (breach ? 0.16 : 0.1);
      rock(F, nz, rnd, x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread, rr, rr * 0.8, RUB[k % 3], 0.3);
    }
    // a broken column or two
    for (var c = 0, nc = 1 + Math.floor(rnd() * 2); c < nc; c++) disc(F, nz, x0 + T + 0.4 + rnd() * (x1 - x0 - 2 * T - 0.8), y0 + T + 0.4 + rnd() * (y1 - y0 - 2 * T - 0.8), 0.2, 0.5 + rnd() * 0.8, [0.6, 0.57, 0.5], { flat: true, tex: 0.2, moss: 0.4 });
  };

  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, s, n = 2 * r + 1;
    for (y = 0; y < h; y++) {
      var row = y * w; s = 0;
      for (x = -r; x <= r; x++) s += src[row + clamp(x, 0, w - 1)];
      for (x = 0; x < w; x++) { tmp[row + x] = s / n; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
    }
    for (x = 0; x < w; x++) {
      s = 0;
      for (y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
    return out;
  }

  // Light the field: diffuse and ambient light with warm sun and cool sky, soft cast shadows
  // marched toward the sun, ambient occlusion from a blurred heightmap, sky reflections and
  // glints on water, moss on flat stone. Shadows falling outside the piece darken the ground.
  function shade(F, nz) {
    var w = F.w, h = F.h, H = F.H, AO = boxBlur(H, w, h, Math.round(0.4 * PPI)), maxH = 0, i;
    for (i = 0; i < H.length; i++) if (H[i] > maxH) maxH = H[i];
    var d = new Uint8ClampedArray(w * h * 4);
    var st = 1.5, sx0 = (LX / LXY) * st, sy0 = (LY / LXY) * st, sh0 = (SLOPE * st) / PPI;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        i = y * w + x;
        var h0 = H[i], a = F.A[i], occ = Math.max(0, AO[i] - h0);
        var sh = 0;
        if (maxH > h0 + 0.03) {
          var sx = x + 0.5, sy = y + 0.5, hr = h0;
          for (var k = 0; k < 400; k++) {
            sx += sx0; sy += sy0; hr += sh0;
            if (hr > maxH || sx < 0 || sy < 0 || sx >= w || sy >= h) break;
            var hs = H[(sy | 0) * w + (sx | 0)];
            if (hs > hr) { var o = (hs - hr) * 5; if (o > sh) { sh = o > 1 ? 1 : o; if (sh === 1) break; } }
          }
        }
        var o4 = (y * w + x) * 4;
        if (a <= 0.003) {
          var ga = Math.min(0.5, sh * 0.42 + Math.min(0.22, AO[i] * 0.35));
          d[o4] = 8; d[o4 + 1] = 12; d[o4 + 2] = 6; d[o4 + 3] = ga * 255;
          continue;
        }
        var hl = H[x > 0 ? i - 1 : i], hrr = H[x < w - 1 ? i + 1 : i], hu = H[y > 0 ? i - w : i], hd = H[y < h - 1 ? i + w : i];
        var nx = -(hrr - hl) * PPI * 0.5, ny = -(hd - hu) * PPI * 0.5, nl = Math.sqrt(nx * nx + ny * ny + 1);
        nx /= nl; ny /= nl; var nzv = 1 / nl;
        var diff = Math.max(0, nx * LX + ny * LY + nzv * LZ), ao = 1 - Math.min(0.5, occ * 0.85);
        var r = F.R[i], gg = F.G[i], b = F.B[i];
        var moss = F.Moss[i] * smooth(0.82, 0.97, nzv) * smooth(-0.05, 0.25, nz.fbm((x / PPI) * 1.3, (y / PPI) * 1.3, 3));
        if (moss > 0) { r = mix(r, 0.33, moss); gg = mix(gg, 0.4, moss); b = mix(b, 0.18, moss); }
        var sun = diff * (1 - 0.8 * sh), amb = 0.4 * ao;
        r *= amb * 0.92 + sun * 0.8 * 1.06; gg *= amb * 0.97 + sun * 0.8 * 1.0; b *= amb * 1.06 + sun * 0.8 * 0.9;
        var wf = F.W[i];
        if (wf > 0) {
          var cloud = 0.75 + 0.5 * (nz.fbm((x / PPI) * 0.25 + 70, (y / PPI) * 0.25, 2) + 0.5), refl = 0.2 * wf * cloud * (1 - 0.5 * sh);
          r = mix(r, 0.56, refl); gg = mix(gg, 0.66, refl); b = mix(b, 0.72, refl);
          var spec = Math.pow(Math.max(0, nx * HX + ny * HY + nzv * HZ), 40) * 0.55 * wf * (1 - sh);
          r += spec; gg += spec; b += spec * 0.95;
        }
        var ga2 = (1 - a) * Math.min(0.5, sh * 0.42 + Math.min(0.22, AO[i] * 0.35)), oa = a + ga2;
        d[o4] = clamp((r * a) / oa, 0, 1) * 255; d[o4 + 1] = clamp((gg * a) / oa, 0, 1) * 255; d[o4 + 2] = clamp((b * a) / oa, 0, 1) * 255; d[o4 + 3] = oa * 255;
      }
    }
    return { w: w, h: h, data: d };
  }

  // Distinct traversable obstacles for the dry country, sharing the heightmap lighting.
  GEN.dunes = function (F, t, nz, rnd) {
    each(F, function(i,x,y) {
      var edge=1-smooth(-0.35,0.25,sdShape(x,y,t,nz,0.45)); if(edge<=0)return;
      var ridge=Math.sin(y*2.1+Math.sin(x*.65)*1.6+nz.n(x*.5,y*.5)), n=nz.fbm(x*7,y*7,2);
      F.H[i]=(0.12+(ridge+1)*.16)*edge; F.A[i]=edge;F.R[i]=.72+n*.1;F.G[i]=.55+n*.08;F.B[i]=.32+n*.05;
    });
  };
  GEN.scree = function(F,t,nz,rnd) {
    each(F,function(i,x,y){var a=1-smooth(-.2,.25,sdShape(x,y,t,nz,.6));if(a<=0)return;var n=nz.fbm(x*8,y*8,2);F.H[i]=.04;F.A[i]=a;F.R[i]=.39+n*.12;F.G[i]=.37+n*.12;F.B[i]=.35+n*.12;});
    for(var j=0;j<t.w*t.h*3;j++){var x=rnd()*t.w,y=rnd()*t.h;if(sdShape(x,y,t,nz,.6)>.1)continue;rock(F,nz,rnd,x,y,.08+rnd()*.18,.08+rnd()*.17,[.48,.46,.43],0);}
  };
  GEN.scrub = function(F,t,nz,rnd) {
    each(F,function(i,x,y){var a=1-smooth(-.25,.3,sdShape(x,y,t,nz,.7));if(a<=0)return;var n=nz.fbm(x*4,y*4,2);F.H[i]=.035;F.A[i]=a;F.R[i]=.44+n*.14;F.G[i]=.42+n*.1;F.B[i]=.25+n*.08;});
    for(var j=0;j<t.w*t.h*4;j++){var x=rnd()*t.w,y=rnd()*t.h;if(sdShape(x,y,t,nz,.7)>.15)continue;tussock(F,nz,rnd,x,y,.12+rnd()*.25,.1+rnd()*.18,[.42,.43,.23]);}
  };
  var KIND_SALT = { forest: 1, swamp: 2, lake: 3, cliff: 4, building: 5 };
  function bake(t) {
    var seed = ((t.seed || 1) * 31 + (KIND_SALT[t.kind] || 0) * 7919) >>> 0;
    var F = new Field(t), nz = makeNoise(seed), rnd = makeRng(seed ^ 0x5bd1e995);
    GEN[t.kind](F, t, nz, rnd);
    if (t.biome && t.biome !== 'borderlands' && /cliff|building|lake/.test(t.kind)) {
      for (var i=0;i<F.R.length;i++) { if(F.W[i]>.2) continue; var v=F.R[i]*.4+F.G[i]*.4+F.B[i]*.2; if(t.biome==='ashlands'){F.R[i]=v*.87;F.G[i]=v*.88;F.B[i]=v*.94;}else{F.R[i]=v*1.19;F.G[i]=v*.94;F.B[i]=v*.63;} }
    }
    return shade(F, nz);
  }
  return { bake: bake, kinds: GEN, PPI: PPI, M: M };
  }

  var core = terrainCore(), PPI = core.PPI, M = core.M, GEN = core.kinds;
  var cache = {}, queue = [], working = false, inflight = {}, worker = null;
  function keyOf(t) { return [t.kind, t.biome || "borderlands", t.seed, t.w.toFixed(3), t.h.toFixed(3)].join("|"); }
  function toCanvas(r) {
    var cv = document.createElement("canvas"); cv.width = r.w; cv.height = r.h;
    var g = cv.getContext("2d"), img = g.createImageData(r.w, r.h);
    img.data.set(r.data); g.putImageData(img, 0, 0);
    return cv;
  }
  function build(t) { return toCanvas(core.bake(t)); }
  // main-thread fallback: one piece per tick
  function pump() {
    if (working) return;
    working = true;
    setTimeout(function () {
      var t = queue.shift();
      if (t) {
        var key = keyOf(t);
        try { cache[key] = build(t); } catch (e) { cache[key] = "failed"; }
      }
      working = false;
      if (queue.length) pump();
    }, 0);
  }
  function useMainThread() {
    worker = null;
    Object.keys(inflight).forEach(function (k) { queue.push(inflight[k]); delete inflight[k]; });
    pump();
  }
  try {
    var src = "var core = (" + terrainCore.toString() + ")();\n" +
      "self.onmessage = function (e) { try { var r = core.bake(e.data.t); self.postMessage({ key: e.data.key, w: r.w, h: r.h, data: r.data }, [r.data.buffer]); } catch (err) { self.postMessage({ key: e.data.key, failed: true }); } };";
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = function (e) {
      var m = e.data;
      if (!inflight[m.key]) return;
      delete inflight[m.key];
      try { cache[m.key] = m.failed ? "failed" : toCanvas(m); } catch (err) { cache[m.key] = "failed"; }
    };
    worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); useMainThread(); };
  } catch (e) { worker = null; }
  function request(t) {
    var key = keyOf(t);
    if (inflight[key] || queue.indexOf(t) >= 0) return;
    if (worker) {
      inflight[key] = t;
      try { worker.postMessage({ key: key, t: { kind: t.kind, x: t.x, y: t.y, w: t.w, h: t.h, seed: t.seed, biome: t.biome } }); return; } catch (e) { useMainThread(); return; }
    }
    queue.push(t); pump();
  }
  SOVL.TerrainArt = { build: build, cache: cache, margin: M, ppi: PPI, usingWorker: function () { return !!worker; } };

  P.drawTerrainSprite = function (ctx, t) {
    if (!GEN[t.kind]) return fallbackDraw ? fallbackDraw.call(this, ctx, t) : false;
    var key = keyOf(t), art = cache[key];
    if (art === "failed") return fallbackDraw ? fallbackDraw.call(this, ctx, t) : false;
    if (!art) {
      request(t);
      // a soft stand-in for the moment the piece is being painted
      ctx.save(); ctx.fillStyle = "rgba(20,28,16,0.25)"; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(t.x, t.y, t.w, t.h, Math.min(t.w, t.h) * 0.3); else ctx.rect(t.x, t.y, t.w, t.h);
      ctx.fill(); ctx.restore();
      return true;
    }
    ctx.drawImage(art, t.x - M, t.y - M, art.width / PPI, art.height / PPI);
    return true;
  };
  // Footprint and name only when the pointer rests on a piece, so the field stays clean.
  P.drawTerrainHover = function (ctx, battle) {
    var p = this.pointer;
    if (!p || !battle) return;
    var t = null;
    for (var i = 0; i < battle.terrain.length; i++) { var q = battle.terrain[i]; if (p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h) t = q; }
    if (!t || (SOVL.UI && SOVL.UI.hover != null)) return;
    var info = SOVL.TERRAIN_TYPES[t.kind];
    ctx.save();
    ctx.setLineDash([0.3, 0.22]); ctx.lineWidth = 0.08; ctx.strokeStyle = "rgba(246,228,176,0.85)";
    ctx.strokeRect(t.x, t.y, t.w, t.h); ctx.setLineDash([]);
    var name = info.name.toUpperCase();
    ctx.font = "600 " + 11 / this.scale + 'px "Marcellus SC", "Barlow Semi Condensed", Georgia, serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var tw = ctx.measureText(name).width + 0.6, cx = t.x + t.w / 2, cy = t.y - 0.55;
    ctx.fillStyle = "rgba(10,14,20,0.82)"; ctx.fillRect(cx - tw / 2, cy - 0.4, tw, 0.8);
    ctx.fillStyle = "#efe2b8"; ctx.fillText(name, cx, cy + 0.02);
    ctx.restore();
  };
  SOVL.terrainRulesText = function (t) {
    var info = SOVL.TERRAIN_TYPES[t.kind], rules = [];
    if (info.impassable) rules.push("impassable"); if (info.difficult) rules.push("difficult: −2 movement to enter or start in");
    rules.push(info.blocksLos ? "blocks line of sight" : "open to line of sight");
    return "<b>" + info.name + "</b><br>" + rules.join(" · ");
  };
})();
