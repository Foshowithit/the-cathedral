/* cathedral.js — one persistent Gothic cathedral, built from parametric parts.
   Every part carries a construction year; nothing is ever scaled or faded.
   Plan: 109.5 m long · 5-bay nave · crossing + transept · 3-bay choir · polygonal apse
   with ambulatory · west front with twin 58 m towers · nave vault crown 32 m. */
window.CATHEDRAL = (function () {
  'use strict';
  const U = window.UT;

  /* ================= plan constants (metres, world space) ================= */
  const X_ARCADE = 6.75;      // nave pier line (half width)
  const X_AISLE = 13.5;       // aisle outer wall
  const X_BUTT = 15.6;        // buttress pier axis
  const Z_WEST = 48;          // west front plane
  const NAVE_Z = [48, 37, 26, 15, 4, -7];        // pier lines, west→east
  const Z_CROSS_E = -18;                          // east crossing line
  const CHOIR_Z = [-18, -28, -38, -48];
  const APSE_C = { x: 0, z: -48 };

  const Y_PLINTH = 1.15;      // top of plinth / ground floor start
  const Y_ARC_SPRING = 10.5;  // arcade arch springing
  const Y_ARC_CROWN = 15.6;   // arcade arch crown
  const Y_AISLE_TOP = 13.4;   // aisle wall head
  const Y_AISLE_SPR = 11.6;   // aisle vault springing
  const Y_CLER_SPR = 16.4;    // clerestory wall start (= aisle cornice)
  const Y_VAULT_SPR = 28.4;   // nave vault springing
  const Y_VAULT_CR = 32.0;
  const Y_WALL_TOP = 29.4;    // clerestory parapet
  const Y_RIDGE = 36.4;

  const STONE = () => M.stone, ASHLAR = () => M.ashlar, ROUGH = () => M.rough;
  let M; // materials, bound at build()

  /* ================= scheduling ================= */
  // fraction-of-campaign map for one structural bay
  const F = {
    found: [0.00, 0.12], ground: [0.08, 0.35], arcade: [0.23, 0.58],
    aisleTop: [0.42, 0.62], cler: [0.50, 0.81], glass: 0.82,
    vaultCen: [0.54, 0.81], vault: 0.78,
    butt: [0.30, 0.70], fly: 0.66, pin: 0.78,
    roofT: 0.88, roofC: [0.92, 1.00]
  };
  const at = (t0, dur, f) => t0 + dur * f;
  const win = (t0, dur, fr) => [at(t0, dur, fr[0]), at(t0, dur, fr[1])];

  /* ================= banded masonry wall =================
     Rises as horizontal course-bands; holes emerge as courses pass them.
     o = {uLen,y0,y1,bands,t0,t1,holes[],thick,mat,x,z,ry}  (u runs along wall) */
  function holeSlice(h, ya, yb) {
    const top = h.type === 'circle' ? h.cy + h.r : h.spring + h.apex;
    const bot = h.base;
    if (yb <= bot + 1e-4 || ya >= top - 1e-4) return null;
    const lo = Math.max(ya, bot), hi = Math.min(yb, top);
    if (hi - lo < 1e-4) return null;
    const a = h.type === 'arch' ? U.arch(h.w, h.apex) : null;
    const xf = (y) => {
      if (h.type === 'circle') { const d = h.cy - y; return Math.sqrt(Math.max(0, h.r * h.r - d * d)); }
      if (y <= h.spring) return h.w;
      const yd = y - h.spring;
      return Math.max(0, Math.sqrt(Math.max(0, a.R * a.R - yd * yd)) - a.cx);
    };
    const p = new THREE.Path();
    const N = 10;
    const pts = [];
    for (let i = 0; i <= N; i++) { const y = lo + (hi - lo) * i / N; pts.push([-xf(y), y]); }
    for (let i = N; i >= 0; i--) { const y = lo + (hi - lo) * i / N; pts.push([xf(y), y]); }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }

  function bandedWall(o) {
    const pieces = [];
    const n = o.bands || 10;
    for (let i = 0; i < n; i++) {
      const ya = U.lerp(o.y0, o.y1, i / n), yb = U.lerp(o.y0, o.y1, (i + 1) / n);
      const s = new THREE.Shape();
      s.moveTo(-o.uLen / 2, ya); s.lineTo(o.uLen / 2, ya);
      s.lineTo(o.uLen / 2, yb); s.lineTo(-o.uLen / 2, yb); s.closePath();
      if (o.holes) for (const h of o.holes) {
        const sl = holeSlice(Object.assign({ ox: 0 }, h), ya, yb);
        if (sl) s.holes.push(sl);
      }
      const g = U.extrude(s, o.thick);
      U.tf(g, o.x, 0, o.z, 0, o.ry || 0, 0);
      const pc = U.piece(U.lerp(o.t0, o.t1, (i + 1) / n));
      U.add(pc, g, o.mat);
      pieces.push(pc);
    }
    // cornice / string course at the wall head
    if (o.cornice !== false) {
      const c = U.piece(o.t1);
      const horiz = Math.abs(Math.sin(o.ry || 0)) > 0.5;
      const len = o.uLen + 0.5, th = o.thick + 0.42;
      const g = horiz
        ? U.box(th, 0.42, len, o.x + (o.cOff || 0) * Math.sign(o.x || 1), o.y1 + 0.21, o.z, 0, 2)
        : U.box(len, 0.42, th, o.x, o.y1 + 0.21, o.z + (o.cOff || 0), 0, 2);
      U.add(c, g, o.mat);
      pieces.push(c);
    }
    return pieces;
  }

  /* window dressing (archivolt + tracery + glass) for an arch opening */
  function windowFit(o) {
    // o: {x,z,ry,w,spring,apex,base,oy,uOff,thick,t,deep}
    const pc = U.piece(o.t);
    const ring = U.extrude(U.archRingShape(o.w, o.spring, o.apex, o.base, Math.max(0.2, o.w * 0.12)), o.thick + 0.3);
    U.tf(ring, o.x, 0, o.z, 0, o.ry, 0);
    // push ring outward along wall normal
    const nx = Math.sin(o.ry), nz = Math.cos(o.ry);
    ring.translate(nx * 0.1, 0, nz * 0.1);
    U.add(pc, ring, ASHLAR());

    const glass = U.lancet(o.w - 0.18, o.spring + 0.1, o.apex - 0.25, o.base + 0.05, 0.2).glass;
    U.tf(glass, o.x, 0, o.z, 0, o.ry, 0);
    glass.translate(-nx * (o.thick * 0.32), 0, -nz * (o.thick * 0.32));
    U.add(pc, glass, o.glassMat || M.glass, { cast: false });

    const tr = U.tracery2(o.w, o.spring, o.apex, o.base);
    for (const g of tr) {
      U.tf(g, o.x, 0, o.z, 0, o.ry, 0);
      g.translate(-nx * (o.thick * 0.18), 0, -nz * (o.thick * 0.18));
      U.add(pc, g, ASHLAR(), { cast: false });
    }
    return pc;
  }

  function roseFit(o) {
    const pc = U.piece(o.t);
    const r = U.rose(o.R, o.thick + 0.3);
    U.tf(r.ring, o.x, o.y, o.z, 0, o.ry, 0);
    U.add(pc, r.ring, ASHLAR());
    U.tf(r.glass, o.x, o.y, o.z, 0, o.ry, 0);
    const nx = Math.sin(o.ry), nz = Math.cos(o.ry);
    r.glass.translate(-nx * o.thick * 0.3, 0, -nz * o.thick * 0.3);
    U.add(pc, r.glass, o.glassMat || M.glassBlue, { cast: false });
    for (const g of r.tracery) { U.tf(g, o.x, o.y, o.z, 0, o.ry, 0); U.add(pc, g, ASHLAR(), { cast: false }); }
    return pc;
  }

  /* ================= structural pieces ================= */

  function pierLine(P, x, z, tBase, w, dur) {
    // plinth
    let pc = U.piece(at(tBase, dur, F.ground[0]));
    U.add(pc, U.box(3.0, Y_PLINTH, 3.0, x, Y_PLINTH / 2, z, 0, 2), ROUGH());
    U.add(pc, U.box(2.6, 0.3, 2.6, x, Y_PLINTH + 0.15, z, 0, 2), STONE());
    P.push(pc);
    // shaft, two lifts
    const y0 = Y_PLINTH + 0.3, y1 = Y_ARC_SPRING - 0.9;
    for (let k = 0; k < 2; k++) {
      pc = U.piece(at(tBase, dur, U.lerp(F.ground[1], F.arcade[1], (k + 1) / 2)));
      const ya = U.lerp(y0, y1, k / 2), yb = U.lerp(y0, y1, (k + 1) / 2);
      for (const g of U.clusterPier(x, z, ya, yb, 0.78)) U.add(pc, g, STONE());
      P.push(pc);
    }
    // capital
    pc = U.piece(at(tBase, dur, F.arcade[1]));
    for (const g of U.pierCapital(x, z, Y_ARC_SPRING, 0.78)) U.add(pc, g, ASHLAR());
    P.push(pc);
  }

  function arcadeWalls(P, zA, zB, side, t0, dur) {
    const x = side * X_ARCADE, uLen = Math.abs(zA - zB), zc = (zA + zB) / 2;
    const clearW = (Math.abs(zA - zB) - 2.3) / 2;   // half-span between pier faces
    const hole = { type: 'arch', w: clearW, spring: Y_ARC_SPRING, apex: Y_ARC_CROWN - Y_ARC_SPRING, base: 0.4 };
    const w = win(t0, dur, F.arcade);
    const pcs = bandedWall({
      uLen, y0: Y_PLINTH, y1: Y_ARC_CROWN + 1.1, bands: 9, t0: w[0], t1: w[1],
      holes: [hole], thick: 1.5, mat: STONE(), x, z: zc, ry: -Math.PI / 2
    });
    pcs.forEach(p => P.push(p));
    // spandrel wall above arch up to clerestory start
    const pc = U.piece(w[1]);
    U.add(pc, (() => { const g = U.box(1.5, Y_CLER_SPR - Y_ARC_CROWN - 1.1, uLen, x, (Y_ARC_CROWN + 1.1 + Y_CLER_SPR) / 2, zc, 0, 4); return g; })(), STONE());
    P.push(pc);
  }

  function aisleWall(P, zA, zB, side, t0, dur) {
    const x = side * X_AISLE, uLen = Math.abs(zA - zB), zc = (zA + zB) / 2;
    const holes = [-uLen * 0.24, uLen * 0.24].map(ou => ({
      type: 'arch', w: 1.5, spring: 8.6, apex: 2.4, base: 5.0, ou
    }));
    const w = win(t0, dur, F.ground);
    bandedWall({
      uLen, y0: 0, y1: Y_AISLE_TOP, bands: 11, t0: w[0], t1: w[1],
      holes, thick: 1.0, mat: STONE(), x, z: zc, ry: -Math.PI / 2
    }).forEach(p => P.push(p));
    const gw = at(t0, dur, F.glass);
    for (const ou of [-uLen * 0.24, uLen * 0.24]) {
      const pc = windowFit({ x, z: zc + ou, ry: -Math.PI / 2, w: 1.5, spring: 8.6, apex: 2.4, base: 5.0, thick: 1.0, t: gw });
      P.push(pc);
    }
    // buttress-side wall pilaster strips
    const pc = U.piece(w[1]);
    U.add(pc, U.box(0.36, Y_AISLE_TOP, 0.9, x + side * 0.6, Y_AISLE_TOP / 2, zA, 0, 3), ASHLAR());
    P.push(pc);
  }

  function clerestory(P, zA, zB, side, t0, dur) {
    const x = side * X_ARCADE, uLen = Math.abs(zA - zB), zc = (zA + zB) / 2;
    const holes = [-uLen * 0.24, uLen * 0.24].map(ou => ({
      type: 'arch', w: 1.7, spring: 23.4, apex: 4.3, base: 18.4, ou
    }));
    const w = win(t0, dur, F.cler);
    bandedWall({
      uLen, y0: Y_CLER_SPR, y1: Y_WALL_TOP, bands: 10, t0: w[0], t1: w[1],
      holes, thick: 1.1, mat: STONE(), x, z: zc, ry: -Math.PI / 2, cOff: 0
    }).forEach(p => P.push(p));
    const gw = at(t0, dur, F.glass);
    for (const ou of [-uLen * 0.24, uLen * 0.24]) {
      P.push(windowFit({ x, z: zc + ou, ry: -Math.PI / 2, w: 1.7, spring: 23.4, apex: 4.3, base: 18.4, thick: 1.1, t: gw, glassMat: M.glassBlue }));
    }
  }

  function aisleVault(P, zc, b, side, t0, dur) {
    const t = at(t0, dur, F.aisleTop[1]);
    const pc = U.piece(t);
    const cx = side * (X_ARCADE + X_AISLE) / 2;
    U.add(pc, U.tf(U.vaultCell(X_AISLE - X_ARCADE, b, Y_AISLE_SPR, 1.9, 8), cx, 0, zc, 0, 0, 0), STONE(), { cast: false });
    for (const g of U.vaultRibs(X_AISLE - X_ARCADE, b, Y_AISLE_SPR, 1.9))
      U.add(pc, U.tf(g, cx, 0, zc, 0, 0, 0), ASHLAR(), { cast: false });
    P.push(pc);
    // lean-to aisle roof
    const pr = U.piece(at(t0, dur, F.roofC[1]));
    const slopeLen = Math.hypot(X_AISLE - X_ARCADE + 1.2, 17.4 - Y_AISLE_TOP);
    const ang = Math.atan2(17.4 - Y_AISLE_TOP, X_AISLE - X_ARCADE + 1.2);
    const g = U.box(slopeLen, 0.28, 2 * b + 0.4,
      side * (X_ARCADE + X_AISLE + 1.2) / 2, (Y_AISLE_TOP + 17.4) / 2, zc, 0, 3);
    // rotate about z at centre
    const rot = new THREE.Matrix4().makeRotationZ(-side * ang);
    const m = new THREE.Matrix4().makeTranslation(
      side * (X_ARCADE + X_AISLE + 1.2) / 2, (Y_AISLE_TOP + 17.4) / 2, zc);
    g.applyMatrix4(rot); g.applyMatrix4(m);
    // ^ box already placed; rebuild properly:
    const g2 = U.box(slopeLen, 0.3, 2 * b + 0.4, 0, 0, 0, 0, 3);
    const mm = new THREE.Matrix4().compose(
      new THREE.Vector3(side * (X_ARCADE + X_AISLE + 1.2) / 2, (Y_AISLE_TOP + 17.4) / 2, zc),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * ang)),
      new THREE.Vector3(1, 1, 1));
    g2.applyMatrix4(mm);
    U.add(pr, g2, M.lead);
    P.push(pr);
  }

  function vaultBay(P, zc, b, t0, dur) {
    // timber centering first (temporary), then stone vault
    const cw = win(t0, dur, F.vaultCen);
    const cen = U.piece(cw[0], cw[1]);
    for (const zz of [-b * 0.62, 0, b * 0.62]) {
      for (const g of U.archCentering(X_ARCADE - 0.6, Y_VAULT_SPR, Y_VAULT_CR - Y_VAULT_SPR, 0, 1.6, 0, zz))
        U.add(cen, g, M.timber, { recv: false });
    }
    for (const zz of [-b * 0.62, 0, b * 0.62])
      U.add(cen, U.box(0.24, 0.24, b * 1.3, 0, Y_VAULT_CR - 0.35, zz, 0, 2), M.timber, { recv: false });
    P.push(cen);

    const t = at(t0, dur, F.vault);
    const pc = U.piece(t);
    U.add(pc, U.vaultCell(X_ARCADE, b, Y_VAULT_SPR, Y_VAULT_CR - Y_VAULT_SPR, 12), STONE(), { cast: false });
    for (const g of U.vaultRibs(X_ARCADE, b, Y_VAULT_SPR, Y_VAULT_CR - Y_VAULT_SPR)) U.add(pc, g, ASHLAR(), { cast: false });
    P.push(pc);
  }

  function gableRoof(P, zc, b, t0, dur) {
    const tr = U.piece(at(t0, dur, F.roofT));
    // trusses: tie beam + principal rafters + king post, exposed until covered
    for (const zz of [-b * 0.7, 0, b * 0.7]) {
      U.add(tr, U.box(14.4, 0.34, 0.3, 0, Y_WALL_TOP + 0.4, zc + zz, 0, 3), M.timber);
      const rl = Math.hypot(7.6, Y_RIDGE - Y_WALL_TOP - 0.6);
      const ang = Math.atan2(Y_RIDGE - Y_WALL_TOP - 0.6, 7.6);
      for (const s of [-1, 1]) {
        const g = U.box(rl, 0.3, 0.28, 0, 0, 0, 0, 3);
        const mm = new THREE.Matrix4().compose(
          new THREE.Vector3(s * 3.8, (Y_RIDGE + Y_WALL_TOP + 0.6) / 2 - 0.45, zc + zz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * ang)),
          new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(mm);
        U.add(tr, g, M.timber);
      }
      U.add(tr, U.box(0.28, Y_RIDGE - Y_WALL_TOP - 0.5, 0.26, 0, (Y_RIDGE + Y_WALL_TOP) / 2, zc + zz, 0, 3), M.timber);
    }
    P.push(tr);

    const w = win(t0, dur, F.roofC);
    // two slopes as two bands
    const slopeLen = Math.hypot(7.6, Y_RIDGE - Y_WALL_TOP + 0.6);
    const ang = Math.atan2(Y_RIDGE - Y_WALL_TOP + 0.6, 7.6);
    for (const s of [-1, 1]) {
      const pc = U.piece(s < 0 ? w[0] : w[1]);
      const g = U.box(slopeLen, 0.22, 2 * b + 0.5, 0, 0, 0, 0, 4);
      const mm = new THREE.Matrix4().compose(
        new THREE.Vector3(s * 3.8, (Y_RIDGE + Y_WALL_TOP) / 2 + 0.5, zc),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * ang)),
        new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(mm);
      U.add(pc, g, M.lead);
      P.push(pc);
    }
    const rc = U.piece(w[1]);
    U.add(rc, U.box(0.5, 0.3, 2 * b + 0.6, 0, Y_RIDGE + 0.7, zc, 0, 3), M.lead);
    P.push(rc);
  }

  function buttress(P, z, side, t0, dur) {
    const x = side * X_BUTT;
    const tiers = [
      [0.0, 11.6, 3.6, 2.4],
      [12.4, 16.6, 2.9, 2.2],
      [17.4, 19.8, 2.4, 2.0]
    ];
    tiers.forEach((tr, i) => {
      const pc = U.piece(at(t0, dur, U.lerp(F.butt[0], F.butt[1], (i + 1) / 3)));
      U.add(pc, U.box(tr[2], tr[1] - tr[0], tr[3], x - side * 0.4, (tr[0] + tr[1]) / 2, z, 0, 3), STONE());
      // sloped weathering on tier top
      if (i < 2) {
        const nx = tiers[i + 1];
        const run = (tr[2] - nx[2]);
        const rise = nx[0] - tr[1];
        const sl = Math.hypot(run, rise);
        const g = U.box(sl, 0.4, tr[3] + 0.15, 0, 0, 0, 0, 2);
        const a = Math.atan2(rise, run) * (side > 0 ? -1 : 1);
        const cx = x - side * (0.4 - (tr[2] / 2 - run / 2)) + side * run / 2;
        const mm = new THREE.Matrix4().compose(
          new THREE.Vector3(cx, (tr[1] + nx[0]) / 2, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)),
          new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(mm);
        U.add(g, g.clone ? null : null, null);
        U.add(pc, g, ASHLAR());
      }
      P.push(pc);
    });
    // pinnacle
    const pp = U.piece(at(t0, dur, F.pin));
    U.add(pp, U.cyl(0.62, 0.72, 4.2, 8, x, 21.9, z, 1), ASHLAR());
    U.add(pp, U.tf(new THREE.ConeGeometry(0.72, 2.4, 8), x, 25.2, z, 0, 0, 0), ASHLAR());
    U.add(pp, U.box(1.5, 0.3, 1.5, x, 20.0, z, 0, 2), ASHLAR());
    P.push(pp);
  }

  function flyer(P, z, side, t0, dur) {
    const pc = U.piece(at(t0, dur, F.fly));
    const x0 = side * 15.4, y0 = 19.8, x1 = side * 7.0, y1 = 22.9;
    const cx = side * 11.0, cy = 24.6;
    const N = 9;
    let px = x0, py = y0;
    for (let i = 1; i <= N; i++) {
      const t = i / N, it = 1 - t;
      const qx = it * it * x0 + 2 * it * t * cx + t * t * x1;
      const qy = it * it * y0 + 2 * it * t * cy + t * t * y1;
      const mx = (px + qx) / 2, my = (py + qy) / 2;
      const len = Math.hypot(qx - px, qy - py) * 1.12;
      const ang = Math.atan2(qy - py, qx - px);
      const g = U.box(len, 0.62, 1.0, 0, 0, 0, 0, 2);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(mx, my, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)),
        new THREE.Vector3(1, 1, 1)));
      U.add(pc, g, STONE());
      // coping
      const g2 = U.box(len, 0.22, 1.2, 0, 0, 0, 0, 2);
      g2.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(mx, my + 0.42, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)),
        new THREE.Vector3(1, 1, 1)));
      U.add(pc, g2, ASHLAR());
      px = qx; py = qy;
    }
    // spandrel arch under the flyer
    const a = U.arch(4.0, 3.2);
    for (let i = 0; i < 7; i++) {
      const t0x = -a.w + (2 * a.w * i) / 7, t1x = -a.w + (2 * a.w * (i + 1)) / 7;
      const tm = (t0x + t1x) / 2;
      const y0x = a.f(t0x), y1x = a.f(t1x), ymx = a.f(tm);
      const g = U.box(Math.hypot(t1x - t0x, y1x - y0x) * 1.1, 0.34, 0.5,
        side * 11.6 + tm, 20.6 + ymx, z, 0, 2);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(y1x - y0x, t1x - t0x)));
      // reposition after rotation about origin
      const rot = Math.atan2(y1x - y0x, t1x - t0x);
      const gg = U.box(Math.hypot(t1x - t0x, y1x - y0x) * 1.1, 0.34, 0.5, 0, 0, 0, 0, 2);
      gg.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(side * 11.6 + tm, 20.6 + ymx, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rot)),
        new THREE.Vector3(1, 1, 1)));
      U.add(pc, gg, STONE());
    }
    P.push(pc);
  }

  /* ---------- scaffolding (temporary) ---------- */
  function scaffoldRun(P, side, zA, zB, hMax, t0, t1) {
    const segs = 3;
    const xWall = side * (X_AISLE + 1.0);
    const xOut = side * (X_AISLE + 3.0);
    const R = U.prand(97);
    for (let s = 0; s < segs; s++) {
      const ya = (hMax / segs) * s, yb = (hMax / segs) * (s + 1);
      const pc = U.piece(U.lerp(t0, t1, (s + 1) / segs * 0.7), t1);
      const tim = [], deck = [];
      const zSteps = Math.max(2, Math.round(Math.abs(zB - zA) / 3.4));
      const zs = [];
      for (let i = 0; i <= zSteps; i++) zs.push(U.lerp(zA, zB, i / zSteps));
      for (const z of zs) {
        for (const x of [xWall, xOut]) tim.push(U.cyl(0.09, 0.1, yb - ya + 0.4, 6, x, (ya + yb) / 2, z, 1));
        // ledger + guard rail
        tim.push(U.box(0.14, 0.14, Math.abs(zB - zA), xWall, yb - 0.2, (zA + zB) / 2, 0, 2));
        tim.push(U.box(0.14, 0.14, Math.abs(zB - zA), xOut, yb - 0.2, (zA + zB) / 2, 0, 2));
        tim.push(U.box(0.12, 0.12, Math.abs(zB - zA), xOut, yb + 0.9, (zA + zB) / 2, 0, 2));
        // transoms
        tim.push(U.box(Math.abs(xOut - xWall) + 0.3, 0.13, 0.13, (xWall + xOut) / 2, yb - 0.25, z, 0, 2));
      }
      // lifts (platforms)
      deck.push(U.box(Math.abs(xOut - xWall) + 0.5, 0.1, Math.abs(zB - zA), (xWall + xOut) / 2, yb - 0.42, (zA + zB) / 2, 0, 3));
      // raking braces
      for (let i = 0; i < zs.length - 1; i++) {
        const z0 = zs[i], z1 = zs[i + 1];
        const dz = z1 - z0, dh = (yb - ya);
        const ln = Math.hypot(dz, dh);
        const g = U.box(ln, 0.12, 0.12, 0, 0, 0, 0, 2);
        const ang = Math.atan2(dh, dz) * (i % 2 ? 1 : -1);
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(xOut, (ya + yb) / 2, (z0 + z1) / 2),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(ang * (Math.abs(ang) > 0.01 ? 1 : 1), 0, 0)),
          new THREE.Vector3(1, 1, 1)));
        // braces run in the z-y plane at the outer rank
        const gg = U.box(Math.hypot(dz, dh) * 0.98, 0.12, 0.12, 0, 0, 0, 0, 2);
        gg.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(xOut, (ya + yb) / 2, (z0 + z1) / 2),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((i % 2 ? 1 : -1) * Math.atan2(dh, dz), 0, 0)),
          new THREE.Vector3(1, 1, 1)));
        tim.push(gg);
      }
      U.add(pc, U.mergeGeos(tim), M.timber, { recv: false });
      U.add(pc, U.mergeGeos(deck), M.deck, { recv: false });
      P.push(pc);
    }
  }

  /* ================= straight bay campaign (nave / choir / crossing) ================= */
  function straightBay(P, zA, zB, t0, dur, opts) {
    opts = opts || {};
    const b = Math.abs(zA - zB) / 2, zc = (zA + zB) / 2;
    for (const side of [-1, 1]) {
      pierLine(P, side * X_ARCADE, zA, t0, 0, dur);
      arcadeWalls(P, zA, zB, side, t0, dur);
      aisleWall(P, zA, zB, side, t0, dur);
      clerestory(P, zA, zB, side, t0, dur);
      aisleVault(P, zc, b, side, t0, dur);
      buttress(P, zA, side, t0, dur);
      flyer(P, zA, side, t0, dur);
      if (!opts.noNaveVault) vaultBay(P, zc, b, t0, dur);
      if (!opts.noRoof) gableRoof(P, zc, b, t0, dur);
      // scaffolding follows the whole campaign
      scaffoldRun(P, side, Math.min(zA, zB) + 0.5, Math.max(zA, zB) - 0.5, Y_WALL_TOP + 4,
        t0 + dur * 0.1, t1_for(t0, dur));
    }
  }
  const t1_for = (t0, dur) => t0 + dur + 1.5;

  /* ================= apse ================= */
  const APSE_N = 5;                 // polygonal sides over the eastern half
  function apse(P) {
    const t0 = 1197, dur = 55;
    const R_IN = 7.4, R_OUT = 13.4;
    const step = Math.PI / APSE_N;   // 180° / 5
    const ang = i => -Math.PI / 2 + step * (i + 0.5) - Math.PI / 2 + Math.PI / 2; // placeholder
    const A = i => -Math.PI / 2 + (i - (APSE_N - 1) / 2) * (-(Math.PI / APSE_N)) * 0 + 0; // unused
    // side i spans bearing from 180°..0° measured east: use vector (sin, -cos)
    const bearing = i => Math.PI / 2 - (i + 0.5) * step;  // from +x axis toward -z
    const vertex = (i, R) => {
      const th = Math.PI / 2 - i * step;
      return { x: APSE_C.x + Math.cos(th) * R * -1, z: APSE_C.z + Math.sin(th) * R * -1 };
    };
    // simpler explicit: treat apse as fan of walls around centre, wall i between angles a_i, a_{i+1}
    const aOf = i => Math.PI + i * step;   // pi → 2pi (south half through east)
    const pt = (a, R) => ({ x: APSE_C.x + Math.cos(a) * R, z: APSE_C.z + Math.sin(a) * R });

    for (let i = 0; i < APSE_N; i++) {
      const a0 = aOf(i), a1 = aOf(i + 1), am = (a0 + a1) / 2;
      const p0i = pt(a0, R_IN), p1i = pt(a1, R_IN);
      const len = Math.hypot(p1i.x - p0i.x, p1i.z - p0i.z);
      const mid = { x: (p0i.x + p1i.x) / 2, z: (p0i.z + p1i.z) / 2 };
      // wall runs along its chord → ry such that local x → chord dir
      const dirx = (p1i.x - p0i.x) / len, dirz = (p1i.z - p0i.z) / len;
      const ry = Math.atan2(-dirz, dirx) * 0 + Math.atan2(dirx, dirz) + Math.PI / 2;
      // local x axis after rotation ry about Y: (cos ry, 0, -sin ry) == (dirx, 0, dirz)
      const ryW = Math.atan2(dirx, dirz) * -1;
      const ryCorrect = Math.atan2(dirx, dirz);
      const ryUse = Math.asin(-dirx) !== undefined ? Math.atan2(dirx, dirz) : 0;
      const ryFinal = Math.atan2(dirx, dirz) * (dirx === 0 ? 1 : 1);
      // rotation about Y: x' = x cos + z sin ; want local x → (dirx, dirz): cos=dirx? THREE Y-rot of (1,0,0) = (cos ry, 0, -sin ry)
      const ryAngle = Math.atan2(-dirz, dirx);

      // ambulatory (outer) wall
      const p0o = pt(a0, R_OUT), p1o = pt(a1, R_OUT);
      const midO = { x: (p0o.x + p1o.x) / 2, z: (p0o.z + p1o.z) / 2 };
      const wo = win(t0, dur, [0.05, 0.42]);
      bandedWall({
        uLen: Math.hypot(p1o.x - p0o.x, p1o.z - p0o.z), y0: 0, y1: 12.6, bands: 9,
        t0: wo[0], t1: wo[1],
        holes: [{ type: 'arch', w: 1.4, spring: 8.2, apex: 2.2, base: 4.6, ou: 0 }],
        thick: 1.0, mat: STONE(), x: midO.x, z: midO.z, ry: ryAngle
      }).forEach(p => P.push(p));
      P.push(windowFit({ x: midO.x, z: midO.z, ry: ryAngle, w: 1.4, spring: 8.2, apex: 2.2, base: 4.6, thick: 1.0, t: at(t0, dur, 0.5) }));

      // inner (choir) wall with tall lancet
      const wi = win(t0, dur, [0.18, 0.62]);
      bandedWall({
        uLen: len, y0: Y_CLER_SPR, y1: Y_WALL_TOP, bands: 8, t0: wi[0], t1: wi[1],
        holes: [{ type: 'arch', w: 1.7, spring: 23.4, apex: 4.3, base: 18.4, ou: 0 }],
        thick: 1.1, mat: STONE(), x: mid.x, z: mid.z, ry: ryAngle
      }).forEach(p => P.push(p));
      P.push(windowFit({ x: mid.x, z: mid.z, ry: ryAngle, w: 1.7, spring: 23.4, apex: 4.3, base: 18.4, thick: 1.1, t: at(t0, dur, 0.66), glassMat: M.glassBlue }));

      // zone wall between clerestory base and ambulatory roof (the aisle body around the choir)
      bandedWall({
        uLen: len, y0: 0, y1: Y_CLER_SPR, bands: 8, t0: wi[0] - dur * 0.16, t1: wi[0],
        holes: [{ type: 'arch', w: 1.6, spring: 8.8, apex: 2.6, base: 5.2, ou: 0 }],
        thick: 1.4, mat: STONE(), x: mid.x, z: mid.z, ry: ryAngle
      }).forEach(p => P.push(p));
      P.push(windowFit({ x: mid.x, z: mid.z, ry: ryAngle, w: 1.6, spring: 8.8, apex: 2.6, base: 5.2, thick: 1.4, t: at(t0, dur, 0.5) }));

      // radial buttress + flyer at each vertex
      const va = aOf(i), vp = pt(va, R_OUT);
      const bpc = U.piece(at(t0, dur, 0.42 + i * 0.03));
      const bx = vp.x, bz = vp.z;
      const bry = -va; // radial orientation
      U.add(bpc, U.box(2.6, 15.5, 2.4, bx, 7.75, bz, -va - Math.PI / 2, 3), STONE());
      U.add(bpc, U.cyl(0.6, 0.7, 3.6, 8, bx, 17.3, bz, 1), ASHLAR());
      U.add(bpc, U.tf(new THREE.ConeGeometry(0.7, 2.2, 8), bx, 20.2, bz, 0, 0, 0), ASHLAR());
      P.push(bpc);
      // flying arch from radial pier to inner wall
      const fpc = U.piece(at(t0, dur, 0.55 + i * 0.03));
      const inner = pt(va, R_IN + 0.6);
      const fx0 = bx, fz0 = bz, fx1 = inner.x, fz1 = inner.z;
      const fmx = (fx0 + fx1) / 2, fmz = (fz0 + fz1) / 2;
      const outv = { x: Math.cos(va), z: Math.sin(va) };
      const ctrl = { x: fmx + outv.x * 1.2, z: fmz + outv.z * 1.2 };
      const NN = 8;
      let qx0 = fx0, qz0 = fz0, qy0 = 15.8;
      for (let k = 1; k <= NN; k++) {
        const tt = k / NN, it = 1 - tt;
        const ex = it * it * fx0 + 2 * it * tt * ctrl.x + tt * tt * fx1;
        const ez = it * it * fz0 + 2 * it * tt * ctrl.z + tt * tt * fz1;
        const ey = it * it * 15.8 + 2 * it * tt * 21.6 + tt * tt * 22.6;
        const mx = (qx0 + ex) / 2, mz = (qz0 + ez) / 2, my = (qy0 + ey) / 2;
        const seg = Math.hypot(ex - qx0, ey - qy0, ez - qz0) * 1.1;
        const yaw = Math.atan2(-(ez - qz0), ex - qx0);
        const pitch = Math.atan2(ey - qy0, Math.hypot(ex - qx0, ez - qz0));
        const g = U.box(seg, 0.6, 0.9, 0, 0, 0, 0, 2);
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(mx, my, mz),
          new TQ().setFromEuler(new TEO(pitch, yaw, 0)),
          new TV3(1, 1, 1)));
        U.add(fpc, g, STONE());
        qx0 = ex; qz0 = ez; qy0 = ey;
      }
      P.push(fpc);

      // conch (half-dome) over each apse bay — quarter sphere
      const cp = U.piece(at(t0, dur, 0.74));
      const cellA = aOf(i + 1), midA = (aOf(i) + aOf(i + 1)) / 2;
      const cellMid = pt(midA, R_IN * 0.55);
      const sph = new THREE.SphereGeometry(R_IN * 0.92, 12, 8, 0, Math.PI, 0, Math.PI / 2);
      const gS = U.tf(sph, APSE_C.x, Y_VAULT_SPR - 0.4, APSE_C.z, 0, -midA - Math.PI / 2, 0);
      U.add(cp, gS, STONE(), { cast: false });
      // ambulatory roof ring
      const ringG = new THREE.CylinderGeometry(R_IN + 1.4, R_OUT + 0.7, 3.6, APSE_N * 3, 1, true,
        Math.PI, Math.PI);
      U.add(cp, U.tf(ringG, APSE_C.x, 14.6, APSE_C.z, 0, -Math.PI / 2, 0), M.lead, { cast: false });
      P.push(cp);
    }
    // outer conch roof + ridge
    const rp = U.piece(at(t0, dur, 0.86));
    const cone = new THREE.ConeGeometry(R_IN + 1.1, 7.6, APSE_N * 2, 1, false, Math.PI, Math.PI);
    U.add(rp, U.tf(cone, APSE_C.x, Y_VAULT_CR + 3.4, APSE_C.z, 0, -Math.PI / 2, 0), M.lead);
    P.push(rp);
    // polygonal clerestory zone walls + conch vault
    const vp = U.piece(at(t0, dur, 0.7));
    for (let i = 0; i < APSE_N; i++) {
      const a0 = aOf(i), a1 = aOf(i + 1);
      const p0 = pt(a0, R_IN), p1 = pt(a1, R_IN);
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
      const dirx = (p1.x - p0.x) / len, dirz = (p1.z - p0.z) / len;
      const ryAngle = Math.atan2(-dirz, dirx);
      // zone wall (below clerestory) already banded above; here: arcade zone 0..CLER
      bandedWall({
        uLen: len, y0: 1.2, y1: Y_CLER_SPR - 0.2, bands: 6, t0: at(t0, dur, 0.3), t1: at(t0, dur, 0.5),
        holes: null, thick: 1.2, mat: STONE(), x: mid.x, z: mid.z, ry: ryAngle, cornice: false
      }).forEach(p => P.push(p));
    }
    P.push(vp);
    // scaffolding around the apse during its campaign
    for (const bb of [0.1, 0.5, 0.9]) {
      const a = Math.PI + bb * Math.PI;
      const px = APSE_C.x + Math.cos(a) * (R_OUT + 2.4), pz = APSE_C.z + Math.sin(a) * (R_OUT + 2.4);
      const sc = U.piece(t0 + dur * 0.2, t0 + dur * 0.8);
      const tim = [], dk = [];
      for (let lev = 0; lev < 4; lev++) {
        const y = 4 + lev * 4.4;
        for (let c = 0; c < 4; c++) {
          const ox = (c % 2 - 0.5) * 3.2, oz = (Math.floor(c / 2) - 0.5) * 3.2;
          tim.push(U.cyl(0.1, 0.1, y + 3, 6, px + ox, (y + 3) / 2, pz + oz, 1));
        }
        dk.push(U.box(3.6, 0.12, 3.6, px, y, pz, 0, 3));
        tim.push(U.box(3.6, 0.12, 0.12, px, y + 1, pz - 1.7, 0, 2));
        tim.push(U.box(3.6, 0.12, 0.12, px, y + 1, pz + 1.7, 0, 2));
      }
      U.add(sc, U.mergeGeos(tim), M.timber, { recv: false });
      U.add(sc, U.mergeGeos(dk), M.deck, { recv: false });
      P.push(sc);
    }
  }
  // vector aliases used above (constructor refs so `new TQ()` works)
  const TQ = THREE.Quaternion;
  const TEO = THREE.Euler;
  const TV3 = THREE.Vector3;

  /* ================= transept ================= */
  function transept(P) {
    const t0 = 1270, dur = 30;
    for (const side of [-1, 1]) {           // side = which long wall (+z front / -z back)
      const z = side > 0 ? -7 : -18;
      const u0 = X_AISLE, u1 = 26;
      const w = win(t0, dur, [0.05, 0.6]);
      // long wall from aisle line out to the arm end, with tall windows
      const holes = [17.5, 21.5].map(ou => ({
        type: 'arch', w: 1.8, spring: 21.5, apex: 4.6, base: 14.5, ou: ou - 19.5
      }));
      const pcx = (u0 + u1) / 2;
      bandedWall({
        uLen: u1 - u0, y0: 0, y1: Y_WALL_TOP, bands: 14, t0: w[0], t1: w[1],
        holes, thick: 1.2, mat: STONE(), x: pcx, z, ry: 0
      }).forEach(p => P.push(p));
      for (const ou of [17.5 - 19.5, 21.5 - 19.5]) {
        P.push(windowFit({ x: pcx + ou, z, ry: 0, w: 1.8, spring: 21.5, apex: 4.6, base: 14.5, thick: 1.2, t: at(t0, dur, 0.66), glassMat: M.glassBlue }));
      }
      // gable (triangular) above
      const gp = U.piece(at(t0, dur, 0.8));
      const gs = new THREE.Shape();
      gs.moveTo(-(u1 - u0) / 2, Y_WALL_TOP); gs.lineTo((u1 - u0) / 2, Y_WALL_TOP); gs.lineTo(0, Y_RIDGE + 0.4); gs.closePath();
      const gg = U.extrude(gs, 1.2);
      U.tf(gg, pcx, 0, z, 0, 0, 0);
      U.add(gp, gg, STONE());
      P.push(gp);
      // clerestory-ish windows over the crossing region handled by nave machinery
      const cw = win(t0, dur, [0.3, 0.75]);
      bandedWall({
        uLen: X_AISLE - 0.4, y0: 0, y1: Y_WALL_TOP, bands: 12, t0: cw[0], t1: cw[1],
        holes: [{ type: 'arch', w: 1.6, spring: 20, apex: 4, base: 13, ou: 0 }],
        thick: 1.3, mat: STONE(), x: X_AISLE / 2 + 0.3, z, ry: 0
      }).forEach(p => P.push(p));
    }
    // arm end facades at x = ±26 (rose + portal)
    for (const side of [-1, 1]) {
      const x = side * 26;
      const w = win(t0, dur, [0.1, 0.72]);
      bandedWall({
        uLen: 11, y0: 0, y1: 26, bands: 12, t0: w[0], t1: w[1],
        holes: [
          { type: 'arch', w: 3.0, spring: 7.5, apex: 5.4, base: 0, ou: 0 },
          { type: 'circle', r: 5.0, cy: 19.5, base: 0, ou: 0 }
        ],
        thick: 1.4, mat: STONE(), x, z: -12.5, ry: Math.PI / 2
      }).forEach(p => P.push(p));
      // upper facade with gallery
      bandedWall({
        uLen: 11, y0: 26, y1: Y_WALL_TOP, bands: 5, t0: w[1], t1: at(t0, dur, 0.82),
        holes: null, thick: 1.4, mat: STONE(), x, z: -12.5, ry: Math.PI / 2, cornice: false
      }).forEach(p => P.push(p));
      // rose + portal fittings
      P.push(roseFit({ x, y: 19.5, z: -12.5, ry: Math.PI / 2, R: 4.6, thick: 1.4, t: at(t0, dur, 0.75), glassMat: M.glassBlue }));
      const pp = U.piece(at(t0, dur, 0.62));
      for (let k = 0; k < 3; k++) {
        const ring = U.extrude(U.archRingShape(3.0 + k * 0.5, 7.5 + k * 0.2, 5.4 + k * 0.5, 0, 0.42), 0.5);
        U.tf(ring, x + side * (0.8 + k * 0.42), 0, -12.5, 0, Math.PI / 2, 0);
        U.add(pp, ring, ASHLAR());
      }
      P.push(pp);
      // gable over the arm
      const gp = U.piece(at(t0, dur, 0.88));
      const gs = new THREE.Shape();
      gs.moveTo(-5.5, Y_WALL_TOP); gs.lineTo(5.5, Y_WALL_TOP); gs.lineTo(0, Y_RIDGE + 0.4); gs.closePath();
      const gg = U.extrude(gs, 1.3);
      U.tf(gg, x, 0, -12.5, 0, Math.PI / 2, 0);
      U.add(gp, gg, STONE());
      // transept roof
      const rp = U.piece(at(t0, dur, 0.95));
      const slopeLen = Math.hypot(5.5 + 0.4, Y_RIDGE - 24);
      // roof over arm: ridge along x at z=-12.5
      for (const s of [-1, 1]) {
        const g = U.box(20, 0.24, slopeLen, side * 15.5, 0, 0, 0, 4);
        const ang = Math.atan2(Y_RIDGE - 24, 5.9);
        const e1 = new THREE.Euler(side > 0 ? ang : -ang, 0, 0);
        const mm = new THREE.Matrix4().compose(
          new TV3(side * 15.5, (Y_RIDGE + 24) / 2, -12.5 + s * 2.95),
          new TQ().setFromEuler(new TEO(side > 0 ? -s * ang : s * ang, 0, 0)),
          new TV3(1, 1, 1));
        const g2 = U.box(20, 0.24, slopeLen, 0, 0, 0, 0, 4);
        g2.applyMatrix4(mm);
        U.add(rp, g2, M.lead);
      }
      P.push(rp);
      // scaffold on the arm face during campaign
      const sc = U.piece(t0 + dur * 0.15, t0 + dur * 0.85);
      const tim = [], dk = [];
      for (let lev = 0; lev < 5; lev++) {
        const y = 3 + lev * 5.4;
        for (const oz of [-4, 0, 4]) {
          tim.push(U.cyl(0.1, 0.1, y + 3, 6, x + side * 1.6, (y + 3) / 2, -12.5 + oz, 1));
          tim.push(U.cyl(0.1, 0.1, y + 3, 6, x + side * 3.4, (y + 3) / 2, -12.5 + oz, 1));
        }
        dk.push(U.box(2.2, 0.12, 9.5, x + side * 2.5, y, -12.5, 0, 3));
        tim.push(U.box(2.2, 0.12, 9.5, x + side * 3.4, y + 1, -12.5, 0, 2));
      }
      U.add(sc, U.mergeGeos(tim), M.timber, { recv: false });
      U.add(sc, U.mergeGeos(dk), M.deck, { recv: false });
      P.push(sc);
    }
  }

  /* ================= west front ================= */
  function westFront(P) {
    const t0 = 1258;
    const portals = [
      { ou: 0, w: 4.0, spring: 9.2, apex: 6.6 },
      { ou: -8.6, w: 2.7, spring: 7.6, apex: 4.6 },
      { ou: 8.6, w: 2.7, spring: 7.6, apex: 4.6 }
    ];
    // ---- stage 1: portals & lower wall (1258–1300)
    const w1 = [1258, 1300];
    bandedWall({
      uLen: 27, y0: 0, y1: 17.5, bands: 7, t0: w1[0], t1: w1[1],
      holes: portals.map(p => ({ type: 'arch', w: p.w, spring: p.spring, apex: p.apex, base: 0, ou: p.ou })),
      thick: 2.0, mat: STONE(), x: 0, z: Z_WEST, ry: 0
    }).forEach(p => P.push(p));
    // centering under the great portal while its arch is laid (1272–1301)
    const cen = U.piece(1272, 1301);
    for (const g of U.archCentering(portals[0].w - 0.3, portals[0].spring, portals[0].apex, 0, 1.6, 0, Z_WEST + 1.4))
      U.add(cen, g, M.timber, { recv: false });
    for (const g of U.archCentering(portals[1].w - 0.3, portals[1].spring, portals[1].apex, 0, 1.4, -8.6, Z_WEST + 1.3))
      U.add(cen, g, M.timber, { recv: false });
    for (const g of U.archCentering(portals[2].w - 0.3, portals[2].spring, portals[2].apex, 0, 1.4, 8.6, Z_WEST + 1.3))
      U.add(cen, g, M.timber, { recv: false });
    P.push(cen);

    // archivolts + gables + jamb colonnettes
    const ap = U.piece(1302);
    for (const p of portals) {
      for (let k = 0; k < 3; k++) {
        const ring = U.extrude(
          U.archRingShape(p.w + 0.55 + k * 0.55, p.spring + k * 0.3, p.apex + k * 0.5, 0, 0.5),
          0.55);
        U.tf(ring, p.ou, 0, Z_WEST + 1.0 + k * 0.5, 0, 0, 0);
        U.add(ap, ring, ASHLAR());
      }
      // jamb colonnettes
      for (const s of [-1, 1]) {
        U.add(ap, U.cyl(0.24, 0.26, p.spring - 0.4, 8, p.ou + s * (p.w + 1.65), (p.spring - 0.4) / 2, Z_WEST + 1.6, 1), ASHLAR());
        U.add(ap, U.cyl(0.4, 0.4, 0.3, 8, p.ou + s * (p.w + 1.65), p.spring - 0.2, Z_WEST + 1.6, 1), ASHLAR());
      }
      // sculpted tympanum lintel + gable
      U.add(ap, U.box(p.w * 2, 1.5, 0.9, p.ou, p.spring + 0.6, Z_WEST + 0.6, 0, 2), ASHLAR());
      const gs = new THREE.Shape();
      const gw = p.w * 2.3, gh = p.w * 1.05;
      gs.moveTo(-gw / 2, 0); gs.lineTo(gw / 2, 0); gs.lineTo(0, gh); gs.closePath();
      const ggl = U.extrude(gs, 0.45);
      U.tf(ggl, p.ou, p.spring + p.apex + 1.2, Z_WEST + 1.35, 0, 0, 0);
      U.add(ap, ggl, ASHLAR());
      U.add(ap, U.sph(0.3, p.ou, p.spring + p.apex + gh + 1.5, Z_WEST + 1.35, 8), ASHLAR());
    }
    P.push(ap);

    // ---- stage 2: middle wall + great rose (1300–1318)
    const w2 = [1300, 1318];
    bandedWall({
      uLen: 27, y0: 17.5, y1: 27.5, bands: 6, t0: w2[0], t1: w2[1],
      holes: [{ type: 'circle', r: 4.4, cy: 22.6, base: 0, ou: 0 },
              { type: 'arch', w: 1.5, spring: 21, apex: 3.4, base: 18.2, ou: -8.6 },
              { type: 'arch', w: 1.5, spring: 21, apex: 3.4, base: 18.2, ou: 8.6 }],
      thick: 2.0, mat: STONE(), x: 0, z: Z_WEST, ry: 0
    }).forEach(p => P.push(p));
    P.push(roseFit({ x: 0, y: 22.6, z: Z_WEST, ry: 0, R: 4.1, thick: 2.0, t: 1319 }));
    for (const ou of [-8.6, 8.6])
      P.push(windowFit({ x: ou, z: Z_WEST, ry: 0, w: 1.5, spring: 21, apex: 3.4, base: 18.2, thick: 2.0, t: 1319 }));

    // ---- stage 3: kings' gallery + upper wall (1314–1330)
    const w3 = [1314, 1330];
    const galHoles = [];
    for (let i = 0; i < 9; i++) galHoles.push({ type: 'arch', w: 0.72, spring: 31.6, apex: 1.1, base: 27.9, ou: (i - 4) * 2.7 });
    bandedWall({
      uLen: 27, y0: 27.5, y1: 34.5, bands: 5, t0: w3[0], t1: w3[1],
      holes: galHoles.concat([{ type: 'arch', w: 1.4, spring: 31, apex: 3, base: 28.2, ou: -8.6 },
                               { type: 'arch', w: 1.4, spring: 31, apex: 3, base: 28.2, ou: 8.6 }]),
      thick: 2.0, mat: STONE(), x: 0, z: Z_WEST, ry: 0
    }).forEach(p => P.push(p));
    // gallery statues (small figures in the arcade) + balustrade
    const gpc = U.piece(1331);
    for (let i = 0; i < 9; i++) {
      const ox = (i - 4) * 2.7;
      U.add(gpc, U.box(0.5, 1.7, 0.45, ox, 28.9, Z_WEST + 0.4, 0, 1), ASHLAR());
      U.add(gpc, U.sph(0.26, ox, 30.0, Z_WEST + 0.4, 6), ASHLAR());
    }
    P.push(gpc);

    // ---- towers (1315–1346), rising from stage-3 height to 58 m
    for (const side of [-1, 1]) {
      const xIn = side * 4.9, xOut = side * 13.5;
      const tc = (xIn + xOut) / 2;
      const tw = Math.abs(xOut - xIn);
      const tt0 = 1315, tdur = 31;
      // front & back faces
      for (const zf of [Z_WEST, Z_WEST + 9]) {
        bandedWall({
          uLen: tw, y0: 34.5, y1: 56, bands: 9, t0: tt0, t1: tt0 + tdur * 0.85,
          holes: [
            { type: 'arch', w: 1.7, spring: 48.5, apex: 4.0, base: 44, ou: 0 },
            { type: 'arch', w: 1.1, spring: 39, apex: 2.6, base: 36.5, ou: 0 }
          ],
          thick: 1.4, mat: ASHLAR(), x: tc, z: zf, ry: 0
        }).forEach(p => P.push(p));
      }
      // side faces
      for (const xf of [xIn, xOut]) {
        bandedWall({
          uLen: 9, y0: 34.5, y1: 56, bands: 9, t0: tt0 + 1, t1: tt0 + tdur * 0.87,
          holes: [
            { type: 'arch', w: 1.5, spring: 48.5, apex: 3.6, base: 44, ou: 0 },
            { type: 'arch', w: 1.0, spring: 39, apex: 2.4, base: 36.5, ou: 0 }
          ],
          thick: 1.4, mat: ASHLAR(), x: xf, z: Z_WEST + 4.5, ry: Math.PI / 2
        }).forEach(p => P.push(p));
      }
      // floors (visible through belfry openings)
      const fp = U.piece(tt0 + tdur * 0.7);
      for (const fy of [36, 43.5, 53]) U.add(fp, U.box(tw, 0.5, 9, tc, fy, Z_WEST + 4.5, 0, 3), M.timber);
      P.push(fp);
      // belfry louvres
      const lp = U.piece(tt0 + tdur * 0.9);
      for (const zf of [Z_WEST, Z_WEST + 9])
        for (let i = 0; i < 5; i++)
          U.add(lp, U.box(3.0, 0.28, 0.16, tc, 45 + i * 0.8, zf + (zf === Z_WEST ? -0.45 : 0.45), 0, 1), M.timber, { cast: false });
      P.push(lp);
      // cornice, parapet, corner pinnacles
      const tp = U.piece(tt0 + tdur);
      U.add(tp, U.box(tw + 0.7, 0.5, 9.7, tc, 56.2, Z_WEST + 4.5, 0, 2), ASHLAR());
      for (const zf of [Z_WEST, Z_WEST + 9])
        bandedWall({
          uLen: tw + 0.4, y0: 56.5, y1: 58.6, bands: 2, t0: tt0 + tdur * 0.95, t1: tt0 + tdur,
          holes: null, thick: 0.55, mat: ASHLAR(), x: tc, z: zf, ry: 0, cornice: false
        }).forEach(p => P.push(p));
      for (const xf of [xIn, xOut])
        bandedWall({
          uLen: 9.4, y0: 56.5, y1: 58.6, bands: 2, t0: tt0 + tdur * 0.95, t1: tt0 + tdur,
          holes: null, thick: 0.55, mat: ASHLAR(), x: xf, z: Z_WEST + 4.5, ry: Math.PI / 2, cornice: false
        }).forEach(p => P.push(p));
      for (const cx of [xIn + side * 0.4, xOut - side * 0.4])
        for (const cz of [Z_WEST + 0.4, Z_WEST + 8.6]) {
          U.add(tp, U.cyl(0.5, 0.6, 2.4, 8, cx, 58.4, cz, 1), ASHLAR());
          U.add(tp, U.tf(new THREE.ConeGeometry(0.6, 2.6, 8), cx, 60.9, cz, 0, 0, 0), ASHLAR());
        }
      P.push(tp);
      // tower scaffolding
      const sc = U.piece(tt0, tt0 + tdur + 1);
      const tim = [], dk = [];
      for (let lev = 0; lev < 7; lev++) {
        const y = 30 + lev * 4.4;
        for (const ox of [-1, 1])
          for (const oz of [-1, 1])
            tim.push(U.cyl(0.1, 0.1, y + 3.4 - (y - 4), 6, tc + ox * (tw / 2 + 0.9), (y - 4 + y + 3.4) / 2, Z_WEST + 4.5 + oz * 5.2, 1));
        dk.push(U.box(tw + 2.4, 0.12, 10.6, tc, y, Z_WEST + 4.5, 0, 3));
        tim.push(U.box(tw + 2.4, 0.12, 0.12, tc, y + 1, Z_WEST - 0.7, 0, 2));
        tim.push(U.box(tw + 2.4, 0.12, 0.12, tc, y + 1, Z_WEST + 9.7, 0, 2));
      }
      U.add(sc, U.mergeGeos(tim), M.timber, { recv: false });
      U.add(sc, U.mergeGeos(dk), M.deck, { recv: false });
      P.push(sc);
    }

    // west front scaffolding during stage 1–3
    const wf = U.piece(1260, 1332);
    const tim = [], dk = [];
    for (let lev = 0; lev < 7; lev++) {
      const y = 3 + lev * 5.2;
      for (const ox of [-12, -6, 0, 6, 12]) {
        tim.push(U.cyl(0.11, 0.11, y + 4, 6, ox, (y + 4) / 2, Z_WEST + 2.4, 1));
        tim.push(U.cyl(0.11, 0.11, y + 4, 6, ox, (y + 4) / 2, Z_WEST + 4.6, 1));
      }
      dk.push(U.box(27, 0.12, 2.6, 0, y, Z_WEST + 3.5, 0, 3));
      tim.push(U.box(27, 0.14, 0.14, 0, y + 1.05, Z_WEST + 4.6, 0, 2));
    }
    U.add(wf, U.mergeGeos(tim), M.timber, { recv: false });
    U.add(wf, U.mergeGeos(dk), M.deck, { recv: false });
    P.push(wf);
  }

  /* ================= flèche over the crossing ================= */
  function fleche(P) {
    const t0 = 1305, dur = 13;
    const pc = U.piece(t0 + dur * 0.5);
    U.add(pc, U.cyl(3.4, 3.8, 4.8, 8, 0, Y_RIDGE + 2.1, -12.5, 2), M.lead);
    P.push(pc);
    const pc2 = U.piece(t0 + dur);
    U.add(pc2, U.tf(new THREE.CylinderGeometry(1.1, 3.1, 16, 8), 0, Y_RIDGE + 12.5, -12.5, 0, 0, 0), M.lead);
    U.add(pc2, U.tf(new THREE.ConeGeometry(1.1, 6.5, 8), 0, Y_RIDGE + 23.5, -12.5, 0, 0, 0), M.lead);
    U.add(pc2, U.box(0.16, 2.6, 0.16, 0, Y_RIDGE + 27.8, -12.5, 0, 1), M.iron);
    P.push(pc2);
    // lucarnes (small gabled dormers) at the base
    const lp = U.piece(t0 + dur * 0.85);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      U.add(lp, U.box(1.3, 2.0, 1.1, Math.cos(a) * 3.2, Y_RIDGE + 4.4, -12.5 + Math.sin(a) * 3.2, -a, 1), M.lead);
    }
    P.push(lp);
    // scaffolding on the crossing during the flèche campaign
    const sc = U.piece(t0, t0 + dur + 1);
    const tim = [], dk = [];
    for (let lev = 0; lev < 4; lev++) {
      const y = 26 + lev * 4;
      for (const ox of [-5, 5]) for (const oz of [-5, 5])
        tim.push(U.cyl(0.1, 0.1, y + 3 - 24, 6, ox, (24 + y + 3) / 2, -12.5 + oz, 1));
      dk.push(U.box(11, 0.12, 11, 0, y, -12.5, 0, 3));
    }
    U.add(sc, U.mergeGeos(tim), M.timber, { recv: false });
    U.add(sc, U.mergeGeos(dk), M.deck, { recv: false });
    P.push(sc);
  }

  /* ================= foundations campaign (year 1200 hero state) ================= */
  function foundations(P) {
    // apse footing trench-work + first courses
    const f1 = U.piece(1197, 1216);
    const R = U.prand(5);
    const seg = 26;
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI + (i / seg) * Math.PI;
      const r1 = 13.4, r2 = 17.6;
      const px = APSE_C.x + Math.cos(a) * (r1 + r2) / 2, pz = APSE_C.z + Math.sin(a) * (r1 + r2) / 2;
      const ryA = -a + Math.PI / 2;
      U.add(f1, U.box((r2 - r1) + 0.6, 1.6 + R() * 0.8, Math.PI * ((r1 + r2) / 2) / seg + 0.4, px, 0.9, pz, ryA, 1.5), M.rough);
    }
    // footing wall rings (inner + outer)
    for (const rr of [7.4, 13.4]) {
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI + (i / seg) * Math.PI;
        const px = APSE_C.x + Math.cos(a) * rr, pz = APSE_C.z + Math.sin(a) * rr;
        U.add(f1, U.box(2.2, 1.2, Math.PI * rr / seg + 0.3, px, 0.6, pz, -a + Math.PI / 2, 1.5), M.rough);
      }
    }
    P.push(f1);
    // trench lines for choir & nave (Low footing traces visible in 1200)
    const f2 = U.piece(1199, 1226);
    for (const side of [-1, 1]) {
      for (let z = 46; z >= -46; z -= 3.2) {
        const active = z > -20 ? 1226 : 1214;      // nave footings appear later
        const pc = z > -20 ? null : f2;
        if (z <= -20) U.add(f2, U.box(2.4, 1.0 + R() * 0.5, 3.4, side * X_AISLE, 0.5, z, 0, 1.5), M.rough);
        if (z <= -20) U.add(f2, U.box(2.0, 1.0 + R() * 0.5, 3.4, side * X_ARCADE, 0.5, z, 0, 1.5), M.rough);
      }
    }
    P.push(f2);
    // western footing trench begun 1258 with the west front
    const f3 = U.piece(1256, 1262);
    for (let x = -13; x <= 13; x += 3.1) U.add(f3, U.box(3.2, 1.1, 3.4, x, 0.55, Z_WEST + 4.5, 0, 1.5), M.rough);
    for (const s of [-1, 1]) {
      for (let z = Z_WEST; z <= Z_WEST + 9; z += 3) {
        U.add(f3, U.box(3.2, 1.1, 3.1, s * 9.2, 0.55, z, 0, 1.5), M.rough);
      }
    }
    P.push(f3);
    // crossing + transept footings appear with the transept campaign
    const f4 = U.piece(1268, 1276);
    for (const s of [-1, 1]) for (let x = 14; x <= 26; x += 3.1) {
      U.add(f4, U.box(3.2, 1.0, 3.3, s * x, 0.5, -7, 0, 1.5), M.rough);
      U.add(f4, U.box(3.2, 1.0, 3.3, s * x, 0.5, -18, 0, 1.5), M.rough);
    }
    P.push(f4);
  }

  /* ================= build ================= */
  function build(mats) {
    M = mats;
    const P = [];
    foundations(P);
    apse(P);
    // choir bays east → west
    straightBay(P, CHOIR_Z[2], CHOIR_Z[3], 1216, 24);        // -38 → -48 (to apse)
    straightBay(P, CHOIR_Z[1], CHOIR_Z[2], 1226, 24);        // -28 → -38
    straightBay(P, CHOIR_Z[0], CHOIR_Z[1], 1236, 24);        // -18 → -28
    straightBay(P, Z_CROSS_E, -7 + 11, 1244, 24);            // crossing -18 → -7
    // nave bays east → west
    straightBay(P, -7, 4, 1252, 26);
    straightBay(P, 4, 15, 1259.5, 26);
    straightBay(P, 15, 26, 1267, 26);
    straightBay(P, 26, 37, 1274.5, 26);
    straightBay(P, 37, 48, 1282, 26);
    transept(P);
    westFront(P);
    fleche(P);
    return P;
  }

  return { build: build };
})();
