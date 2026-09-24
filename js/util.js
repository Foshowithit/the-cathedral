/* util.js — pointed-arch math, parametric Gothic parts, world-space geometry helpers.
   Convention: every helper returns geometry already transformed into WORLD space.
   Piece schema: { t, tEnd, arr:[{g, m, cast, recv}] }  — visible while t <= year < tEnd. */
(function () {
  'use strict';
  const U = window.UT = {};
  const T = THREE;

  /* ---------- piece helpers ---------- */
  U.piece = function (t, tEnd) { return { t: t, tEnd: (tEnd === undefined ? 1e9 : tEnd), arr: [] }; };
  U.add = function (p, g, m, opt) {
    if (!g) return;
    if (Array.isArray(g)) { g.forEach(function (x) { U.add(p, x, m, opt); }); return; }
    opt = opt || {};
    p.arr.push({ g: g, m: m, cast: opt.cast !== false, recv: opt.recv !== false });
  };

  /* ---------- basic transforms ---------- */
  U.tf = function (g, x, y, z, rx, ry, rz) {
    const e = new T.Euler(rx || 0, ry || 0, rz || 0);
    const m = new T.Matrix4().compose(
      new T.Vector3(x || 0, y || 0, z || 0),
      new T.Quaternion().setFromEuler(e),
      new T.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    return g;
  };

  /* ---------- UV: bake so ~1 tile per `tile` world metres ---------- */
  function scaleUV(g, sx, sy) {
    const uv = g.attributes.uv;
    if (!uv) return g;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    uv.needsUpdate = true;
    return g;
  }
  U.uvTile = function (g, tile) { return scaleUV(g, 1 / tile, 1 / tile); };

  U.box = function (w, h, d, x, y, z, ry, tile) {
    const g = new T.BoxGeometry(w, h, d);
    const s = Math.max(w, h, d) / (tile || 4);
    scaleUV(g, s, s);
    return U.tf(g, x, y, z, 0, ry || 0, 0);
  };
  U.cyl = function (rt, rb, h, seg, x, y, z, tile) {
    const g = new T.CylinderGeometry(rt, rb, h, seg || 10);
    const r = Math.max(rt, rb);
    scaleUV(g, (2 * Math.PI * r) / (tile || 4), h / (tile || 4));
    return U.tf(g, x, y, z, 0, 0, 0);
  };
  U.sph = function (r, x, y, z, seg) {
    return U.tf(new T.SphereGeometry(r, seg || 12, seg ? Math.max(6, seg >> 1) : 8), x, y, z, 0, 0, 0);
  };
  U.plane = function (w, h, x, y, z, rx, ry, tile) {
    const g = new T.PlaneGeometry(w, h);
    scaleUV(g, w / (tile || 4), h / (tile || 4));
    return U.tf(g, x, y, z, rx || 0, ry || 0, 0);
  };

  U.extrude = function (shape, depth, curveSeg) {
    const g = new T.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035,
      bevelOffset: 0, bevelSegments: 1, curveSegments: curveSeg || 8
    });
    g.translate(0, 0, -depth / 2);
    U.uvTile(g, 4);           // extrude UVs come out in shape units (metres)
    return g;
  };

  /* ---------- pointed arch math ----------
     half-span w, apex height h above springing line.
     Arc centres sit on the springing line at cx = (h²-w²)/2w, radius R = w+cx. */
  U.arch = function (w, h) {
    const cx = (h * h - w * w) / (2 * w);
    const R = w + cx;
    return { w: w, h: h, cx: cx, R: R,
      // height above springing at horizontal offset t (|t|<=w)
      f: function (t) { const d = R * R - (Math.abs(t) + cx) * (Math.abs(t) + cx);
        return Math.sqrt(Math.max(0, d)); } };
  };
  /* outline path of a full pointed opening (jambs from baseY up to springing) */
  U.archPath = function (path, w, springY, apexH, baseY) {
    const a = U.arch(w, apexH);
    const angL = Math.atan2(apexH, -a.cx);           // apex angle from left centre
    const angR = Math.atan2(apexH, a.cx);            // apex angle from right centre
    path.moveTo(-w, baseY);
    path.lineTo(-w, springY);
    path.absarc(a.cx, springY, a.R, Math.PI, angL, true);
    path.absarc(-a.cx, springY, a.R, angR, 0, true);
    path.lineTo(w, baseY);
    path.closePath();
    return path;
  };
  U.archShape = function (w, springY, apexH, baseY) {
    const s = new T.Shape();
    U.archPath(s, w, springY, apexH, baseY);
    return s;
  };
  /* concentric archivolt ring (outer arch minus inner arch) */
  U.archRingShape = function (w, springY, apexH, baseY, band) {
    const s = U.archShape(w, springY, apexH, baseY);
    const hole = new T.Path();
    U.archPath(hole, w - band, springY + band * 0.55, apexH - band * 1.15, baseY - 1);
    s.holes.push(hole);
    return s;
  };
  /* rectangular wall shape with a pointed opening punched out */
  U.wallWithHole = function (w, h, open) {
    // open = {w, springY, apexH, baseY, ox}  (coords local, wall spans x -w/2..w/2, y 0..h)
    const s = new T.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
    if (open) {
      const hole = new T.Path();
      U.archPath(hole, open.w, open.springY, open.apexH, open.baseY);
      if (open.ox) hole.curves.forEach(function (c) { /* shift via matrix */ });
      if (open.ox) {
        const m = new T.Matrix4().makeTranslation(open.ox, 0, 0);
        hole.applyMatrix(m);
      }
      s.holes.push(hole);
    }
    return s;
  };

  /* ---------- lancet window assembly (recessed, with tracery) ----------
     Returns {ring, glass, tracery[]} geometries in wall-plane local coords
     (extrusion along +z/−z), caller rotates/places. */
  U.lancet = function (w, springY, apexH, sillY, depth) {
    const out = {};
    out.ring = U.extrude(U.archRingShape(w, springY, apexH, sillY, Math.max(0.22, w * 0.13)), depth);
    const glassShape = U.archShape(w - 0.24, springY + 0.13, apexH - 0.3, sillY + 0.1);
    out.glass = new T.ShapeGeometry(glassShape, 10);
    out.glass.translate(0, 0, -depth * 0.42);
    return out;
  };
  /* two-light tracery with a quatrefoil over — geometry inside the opening */
  U.tracery2 = function (w, springY, apexH, sillY) {
    const parts = [];
    const half = w * 0.5 - 0.22;               // each light half-span
    const midY = sillY + (springY - sillY) * 0.62;
    // mullion
    parts.push(U.box(0.26, springY - sillY, 0.3, 0, (springY + sillY) / 2, 0, 0, 1));
    // sub-arches over each light
    [-w * 0.25, w * 0.25].forEach(function (ox) {
      const a = U.arch(half * 0.92, (springY - midY) * 1.35);
      const seg = 7;
      for (let i = 0; i < seg; i++) {
        const t0 = -a.w + (2 * a.w * i) / seg, t1 = -a.w + (2 * a.w * (i + 1)) / seg;
        const tm = (t0 + t1) / 2;
        const y0 = a.f(t0), y1 = a.f(t1), ym = a.f(tm);
        const len = Math.hypot(t1 - t0, y1 - y0) * 1.06;
        const ang = Math.atan2(y1 - y0, t1 - t0);
        parts.push(U.box(len, 0.22, 0.26, ox + tm, midY + ym, 0, ang, 1));
      }
    });
    // quatrefoil above the mullion
    const qr = w * 0.24, qy = (springY + apexH) * 0.5 + 0.15;
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2 + Math.PI / 4;
      parts.push(U.torus(qr * 0.52, 0.11, 6, 12,
        Math.cos(ang) * qr * 0.55, qy + Math.sin(ang) * qr * 0.55, 0));
    }
    // enclosing arc over the quatrefoil
    const a2 = U.arch(w * 0.44, apexH - springY * 0.02 - 0.4);
    for (let i = 0; i < 8; i++) {
      const t0 = -a2.w + (2 * a2.w * i) / 8, t1 = -a2.w + (2 * a2.w * (i + 1)) / 8;
      const tm = (t0 + t1) / 2;
      const y0 = a2.f(t0), y1 = a2.f(t1), ym = a2.f(tm);
      parts.push(U.box(Math.hypot(t1 - t0, y1 - y0) * 1.05, 0.2, 0.24, tm, springY - 0.3 + ym, 0,
        Math.atan2(y1 - y0, t1 - t0), 1));
    }
    return parts;
  };
  U.torus = function (r, tube, rs, ts, x, y, z) {
    const g = new T.TorusGeometry(r, tube, rs, ts);
    return U.tf(g, x || 0, y || 0, z || 0, 0, 0, 0);
  };

  /* ---------- rose window ---------- */
  U.rose = function (R, depth) {
    const out = { ring: null, tracery: [], glass: null };
    const s = new T.Shape();
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
    const hole = new T.Path(); hole.absarc(0, 0, R - R * 0.13, 0, Math.PI * 2, true);
    s.holes.push(hole);
    out.ring = U.extrude(s, depth);
    const g = new T.CircleGeometry(R - R * 0.13, 40);
    g.translate(0, 0, -depth * 0.42);
    out.glass = g;
    // oculus + petals + spokes
    out.tracery.push(U.torus(R * 0.3, R * 0.045, 6, 20, 0, 0, 0));
    out.tracery.push(U.torus(R * 0.62, R * 0.04, 6, 24, 0, 0, 0));
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r0 = R * 0.3, r1 = R * 0.87;
      const mx = Math.cos(a) * (r0 + r1) / 2, my = Math.sin(a) * (r0 + r1) / 2;
      out.tracery.push(U.box(r1 - r0, R * 0.05, R * 0.055, mx, my, 0, a, 1));
      // small petal circles between spokes
      const pr = R * 0.14, prr = R * 0.46;
      const pa = a + Math.PI / n;
      out.tracery.push(U.torus(pr, R * 0.032, 5, 12, Math.cos(pa) * prr, Math.sin(pa) * prr, 0));
    }
    out.tracery.push(U.cyl(R * 0.1, R * 0.1, depth * 0.7, 12, 0, 0, 0, 0.4));
    return out;
  };

  /* ---------- cluster pier ---------- */
  U.clusterPier = function (x, z, y0, y1, r) {
    const geos = [];
    r = r || 0.78;
    geos.push(U.cyl(r, r * 1.04, y1 - y0, 12, x, (y0 + y1) / 2, z));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      geos.push(U.cyl(r * 0.34, r * 0.36, y1 - y0 - 0.1, 8,
        x + Math.cos(a) * r * 1.02, (y0 + y1) / 2, z + Math.sin(a) * r * 1.02));
    }
    return geos;
  };
  U.pierBase = function (x, z, y0, r) {
    const pts = [];
    pts.push(new T.Vector2(0.01, 0));
    pts.push(new T.Vector2(r * 1.55, 0));
    pts.push(new T.Vector2(r * 1.55, 0.22));
    pts.push(new T.Vector2(r * 1.3, 0.42));
    pts.push(new T.Vector2(r * 1.22, 0.68));
    pts.push(new T.Vector2(r * 1.05, 0.86));
    pts.push(new T.Vector2(r * 1.0, 1.05));
    const g = new T.LatheGeometry(pts, 14);
    return U.tf(g, x, y0, z, 0, 0, 0);
  };
  U.pierCapital = function (x, z, yTop, r) {
    const geos = [];
    const pts = [];
    pts.push(new T.Vector2(r * 1.0, 0));
    pts.push(new T.Vector2(r * 1.08, 0.12));
    pts.push(new T.Vector2(r * 1.34, 0.5));
    pts.push(new T.Vector2(r * 1.46, 0.72));
    pts.push(new T.Vector2(r * 1.46, 0.82));
    geos.push(U.tf(new T.LatheGeometry(pts, 14), x, yTop - 0.82, z, 0, 0, 0));
    geos.push(U.box(r * 3.1, 0.3, r * 3.1, x, yTop + 0.15, z, 0, 2));
    return geos;
  };

  /* ---------- arch centering (timber form under an unfinished arch) ----------
     w/half-span, springY, apexH, baseY (floor), depth along z */
  U.archCentering = function (w, springY, apexH, baseY, depth, x0, z0) {
    const geos = [];
    const a = U.arch(w, apexH);
    const segs = 16;
    x0 = x0 || 0; z0 = z0 || 0;
    // curved lagging: two ribs front & back
    for (const zz of [-depth / 2, depth / 2]) {
      for (let i = 0; i < segs; i++) {
        const t0 = -w + (2 * w * i) / segs, t1 = -w + (2 * w * (i + 1)) / segs;
        const tm = (t0 + t1) / 2;
        const y0 = a.f(t0), y1 = a.f(t1), ym = a.f(tm);
        geos.push(U.box(Math.hypot(t1 - t0, y1 - y0) * 1.08, 0.16, 0.2,
          x0 + tm, springY + ym - 0.1, z0 + zz, Math.atan2(y1 - y0, t1 - t0), 1));
      }
    }
    // transverse ties across the form
    for (let i = 1; i < segs; i += 3) {
      const t = -w + (2 * w * i) / segs;
      geos.push(U.box(0.14, 0.14, depth, x0 + t, springY + a.f(t) - 0.1, z0, 0, 1));
    }
    // raking props down to the floor at the haunches
    const props = [-w * 0.92, -w * 0.5, 0, w * 0.5, w * 0.92];
    for (const px of props) {
      const hy = springY + a.f(px) - 0.2;
      if (hy - baseY < 1.2) continue;
      const lean = px * 0.16;
      geos.push(U.box(0.2, hy - baseY, 0.2, x0 + px + lean / 2, (hy + baseY) / 2, z0, 0, 1));
    }
    return geos;
  };

  /* ---------- vault cell surface: quadripartite profile ----------
     Boundary: arch across x at z=±b, straight springing at x=±a, crown at centre.
     y = springY + H * A(x) * (1 - B(z)(1 - A(x)))                       */
  U.vaultCell = function (a, b, springY, H, seg) {
    const ax = U.arch(a, H), az = U.arch(b, H);
    seg = seg || 12;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      const z = -b + (2 * b * j) / seg;
      const B = az.f(z) / H;
      for (let i = 0; i <= seg; i++) {
        const x = -a + (2 * a * i) / seg;
        const A = ax.f(x) / H;
        const y = springY + H * A * (1 - B * (1 - A));
        pos.push(x, y - 0.06, z);
        uv.push(x, z);
      }
    }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const k = j * (seg + 1) + i;
        idx.push(k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    U.uvTile(g, 4);
    return g;
  };
  /* vault ribs for the cell above */
  U.vaultRibs = function (a, b, springY, H) {
    const ax = U.arch(a, H), az = U.arch(b, H);
    const geos = [];
    const Y = function (x, z) {
      const A = ax.f(x) / H, B = az.f(z) / H;
      return springY + H * A * (1 - B * (1 - A)) - 0.16;
    };
    // transverse ribs at z = ±b (arch across x)
    for (const zb of [-b, b]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const x = -a + (2 * a * i) / 12;
        pts.push(new T.Vector3(x, springY + ax.f(x) - 0.16, zb));
      }
      geos.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 14, 0.24, 6, false));
    }
    // diagonal ribs corner -> centre
    const corners = [[a, b], [-a, b], [a, b], [-b, a]];
    const cs = [[a, b], [-a, b], [a, -b], [-a, -b]];
    for (const c of cs) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = c[0] * (1 - t), z = c[1] * (1 - t);
        pts.push(new T.Vector3(x, Y(x, z), z));
      }
      geos.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, 0.2, 6, false));
    }
    // wall-arch band along x = ±a (springing moulding)
    for (const xb of [-a, a]) geos.push(U.box(0.3, 0.42, 2 * b, xb, springY - 0.1, 0, 0, 3));
    // boss
    geos.push(U.cyl(0.5, 0.55, 0.4, 10, 0, springY + H - 0.3, 0, 1));
    geos.push(U.sph(0.34, 0, springY + H - 0.5, 0, 8));
    return geos;
  };

  /* ---------- merging ---------- */
  function flatten(geos) {
    let total = 0;
    const list = geos.map(function (g) {
      const ni = g.index ? g.toNonIndexed() : g;
      total += ni.attributes.position.count;
      return ni;
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += n;
      if (g !== geos[list.indexOf(g)]) g.dispose && 0;
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  U.mergeGeos = flatten;

  /* ---------- misc ---------- */
  U.prand = function (seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
})();
