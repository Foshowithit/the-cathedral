/* site.js — construction yard, treadwheel cranes, stockpiles, workers,
   town, walls, landscape. Everything keyed to the same year timeline. */
window.SITE = (function () {
  'use strict';
  const U = window.UT;
  let M;

  /* ================= treadwheel crane ================= */
  function treadwheelCrane(o) {
    // o: {x,y,z, ry, wheelR, mastH, jibL, jibRise, scale, t0, t1, speed}
    const g = new THREE.Group();
    g.position.set(o.x, o.y, o.z);
    g.rotation.y = o.ry || 0;
    const s = o.scale || 1;
    const tim = [], irn = [];

    // A-frame legs
    const mastH = o.mastH * s;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const legLen = Math.hypot(mastH * 0.55, 2.4 * s);
      const gg = U.box(0.34 * s, legLen, 0.34 * s, 0, 0, 0, 0, 1);
      const lean = Math.atan2(2.4 * s, mastH * 0.55);
      gg.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(sx * 1.2 * s, mastH * 0.28, sz * 1.0 * s),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * lean)),
        new THREE.Vector3(1, 1, 1)));
      tim.push(gg);
    }
    // mast
    tim.push(U.box(0.55 * s, mastH, 0.55 * s, 0, mastH / 2, 0, 0, 1));
    // horizontal ties
    tim.push(U.box(2.6 * s, 0.22 * s, 2.2 * s, 0, mastH * 0.5, 0, 0, 1));
    // jib: from mast top, angled forward (+x local)
    const tipX = Math.cos(o.jibRise) * o.jibL * s;
    const tipY = mastH + Math.sin(o.jibRise) * o.jibL * s;
    const jib = U.box(o.jibL * s, 0.4 * s, 0.4 * s, 0, 0, 0, 0, 1);
    jib.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(tipX / 2, (mastH + tipY) / 2, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, o.jibRise)),
      new THREE.Vector3(1, 1, 1)));
    tim.push(jib);
    // back stay
    const bs = U.box(o.jibL * 0.75 * s, 0.3 * s, 0.3 * s, 0, 0, 0, 0, 1);
    bs.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(-o.jibL * 0.75 * s * 0.35, mastH + 0.6 * s, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI * 0.9)),
      new THREE.Vector3(1, 1, 1)));
    tim.push(bs);
    // diagonal struts from tie to jib
    for (const f of [0.35, 0.7]) {
      const px = tipX * f, py = mastH + (tipY - mastH) * f;
      const st = U.box(Math.hypot(px, py - mastH * 0.5) * 0.9, 0.2 * s, 0.2 * s, 0, 0, 0, 0, 1);
      st.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(px / 2, (mastH * 0.5 + py) / 2, 0.45 * s),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(py - mastH * 0.5, px))),
        new THREE.Vector3(1, 1, 1)));
      tim.push(st);
    }

    // treadwheel (rotates about z axis), mounted on the mast side
    const wheel = new THREE.Group();
    const R = o.wheelR * s;
    wheel.position.set(0, o.wheelY * s || R + 1.2 * s, 0.95 * s);
    const wt = [], wn = [];
    // two rims
    for (const zz of [-0.45, 0.45]) {
      const ring = new THREE.TorusGeometry(R, 0.11 * s, 6, 22);
      ring.translate(0, 0, zz * s);
      wt.push(ring);
      const inner = new THREE.TorusGeometry(R * 0.55, 0.09 * s, 6, 18);
      inner.translate(0, 0, zz * s);
      wt.push(inner);
    }
    // spokes + paddles
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sp = U.box(0.1 * s, R * 1.05, 0.1 * s, 0, 0, 0, 0, 1);
      sp.applyMatrix4(new THREE.Matrix4().makeRotationZ(a));
      wt.push(sp);
      const pd = U.box(0.5 * s, 0.1 * s, 0.78 * s, 0, 0, 0, 0, 1);
      pd.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a + 0.3) * R * 0.8, Math.sin(a + 0.3) * R * 0.8, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)),
        new THREE.Vector3(1, 1, 1)));
      wt.push(pd);
    }
    wheel.add(new THREE.Mesh(U.mergeGeos(wt), M.timber));
    // axle + rope drum (fixed, rotates visually with wheel)
    const axle = U.cyl(0.14 * s, 0.14 * s, 1.7 * s, 8, 0, 0, 0, 1);
    axle.rotateX(Math.PI / 2);
    axle.translate(0, o.wheelY * s || R + 1.2 * s, 0);
    const drum = U.cyl(0.5 * s, 0.5 * s, 0.6 * s, 10, 0, 0, 0, 1);
    drum.rotateX(Math.PI / 2);
    drum.translate(0, o.wheelY * s || R + 1.2 * s, 0);
    wt.length = 0;

    // tip pulley
    const pul = new THREE.TorusGeometry(0.3 * s, 0.09 * s, 6, 14);
    pul.rotateY(Math.PI / 2);
    pul.translate(tipX, tipY, 0);

    const frameMesh = new THREE.Mesh(U.mergeGeos(tim), M.timber);
    frameMesh.castShadow = true; frameMesh.receiveShadow = true;
    g.add(frameMesh);
    const axleMesh = new THREE.Mesh(U.mergeGeos([axle, drum, pul]), M.iron);
    axleMesh.castShadow = true;
    g.add(axleMesh);
    g.add(wheel);

    // rope (from tip down to load) — scaled each frame
    const ropeBase = 1;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 1, 6), M.rope);
    rope.castShadow = false;
    g.add(rope);
    // load: dressed stone block on a small timber pallet
    const load = new THREE.Group();
    const lb = new THREE.Mesh(U.box(1.5 * s, 0.75 * s, 0.95 * s, 0, 0, 0, 0, 2), M.ashlar);
    lb.castShadow = true;
    load.add(lb);
    const hookM = new THREE.Mesh(U.box(0.08 * s, 0.5 * s, 0.08 * s, 0, 0.6 * s, 0, 0, 1), M.iron);
    load.add(hookM);
    g.add(load);

    const baseY = tipY;
    const obj = {
      group: g,
      tick(year) {
        if (year < (o.t0 - 1) || year > (o.t1 + 1)) return;
        const a = year * (o.speed || 2.6);
        wheel.rotation.z = a;
        const cyc = 0.5 + 0.5 * Math.sin(year * 0.9 + (o.phase || 0));
        const drop = (3.5 + cyc * (o.dropLen || 9)) * s;
        const loadY = baseY - drop;
        load.position.set(tipX, loadY, 0);
        rope.position.set(tipX, baseY - drop / 2, 0);
        rope.scale.y = drop;
        rope.rotation.set(0, 0, 0);
      }
    };
    return obj;
  }

  /* ================= static yard helpers ================= */
  function ashlarStack(P, x, z, ry, t, courses, t1) {
    const pc = U.piece(t, t1);
    const R = U.prand(Math.abs(x * 31 + z * 7) | 0);
    const tim = [];
    for (let c = 0; c < courses; c++) {
      const n = 4 - (c % 2 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const bx = (i - (n - 1) / 2) * 1.32 + (R() - 0.5) * 0.05;
        const g = U.box(1.28, 0.56, 2.1, 0, 0, 0, 0, 3);
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(bx, 0.28 + c * 0.58, (R() - 0.5) * 0.1),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (R() - 0.5) * 0.04, 0)),
          new THREE.Vector3(1, 1, 1)));
        tim.push(g);
      }
    }
    const gg = U.mergeGeos(tim);
    gg.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(1, 1, 1)));
    U.add(pc, gg, M.ashlar);
    P.push(pc);
  }

  function rubblePile(P, x, z, r, t) {
    const pc = U.piece(t);
    const R = U.prand((x * 13 + z * 3) | 0 || 7);
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, rr = R() * r;
      const sz = 0.35 + R() * 0.55;
      U.add(pc, U.box(sz, sz * 0.7, sz * 1.1, x + Math.cos(a) * rr, sz * 0.35 * (1 - rr / r * 0.5), z + Math.sin(a) * rr, R() * 3, 1.2), M.rough);
    }
    P.push(pc);
  }

  function logPile(P, x, z, ry, t) {
    const pc = U.piece(t);
    const R = U.prand(11);
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 4 - r; i++) {
        const g = U.cyl(0.17, 0.19, 5.5 + R(), 7, (i - (3 - r) / 2) * 0.38, 0.18 + r * 0.35, 0, 2);
        g.rotateZ(Math.PI / 2);
        g.rotateY(ry);
        g.translate(x, 0, z);
        U.add(pc, g, M.timber);
      }
    P.push(pc);
  }

  function masonsShelter(P, x, z, ry, t) {
    const pc = U.piece(t);
    const tim = [], dk = [];
    // posts
    for (const px of [-3.4, 0, 3.4]) for (const pz of [-2.2, 2.2]) {
      tim.push(U.cyl(0.13, 0.15, 2.7, 7, px, 1.35, pz, 1));
    }
    // plates + rafters
    tim.push(U.box(7.4, 0.16, 0.16, 0, 2.75, -2.2, 0, 2));
    tim.push(U.box(7.4, 0.16, 0.16, 0, 2.75, 2.2, 0, 2));
    for (let i = 0; i < 5; i++) {
      const px = -3.4 + i * 1.7;
      tim.push(U.box(0.12, 1.5, 5.2, px, 3.4, 0, 0, 2)); // will look like rafters if rotated
    }
    // roof slopes
    for (const s of [-1, 1]) {
      const g = U.box(7.6, 0.14, 2.9, 0, 0, 0, 0, 3);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(0, 3.35, s * 1.25),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-s * 0.5, 0, 0)),
        new THREE.Vector3(1, 1, 1)));
      dk.push(g);
    }
    // work benches with blocks in progress
    tim.push(U.box(5.5, 0.16, 1.1, 0, 1.0, -1.4, 0, 3));
    tim.push(U.box(0.2, 1.0, 0.2, -2.5, 0.5, -1.4, 0, 1));
    tim.push(U.box(0.2, 1.0, 0.2, 2.5, 0.5, -1.4, 0, 1));
    const gg = U.mergeGeos(tim); gg.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); gg.translate(x, 0, z);
    U.add(pc, gg, M.timber);
    const dkG = U.mergeGeos(dk); dkG.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); dkG.translate(x, 0, z);
    U.add(pc, dkG, M.thatch);
    // worked blocks on bench
    for (const ox of [-2, 0.4, 2.3]) {
      const g = U.box(1.0, 0.5, 0.8, 0, 0, 0, 0, 3);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x + Math.cos(ry) * ox, 1.33, z - Math.sin(ry) * ox);
      U.add(pc, g, M.ashlar);
    }
    P.push(pc);
  }

  /* small human figure — proportioned reference, not a character animation */
  function worker(P, x, z, ry, t, t1, col, pose) {
    const pc = U.piece(t, t1);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, metalness: 0 });
    const body = U.cyl(0.19, 0.30, 1.15, 7, 0, 0.78, 0, 1);
    const head = U.sph(0.135, 0, 1.5, 0, 7);
    const hat = U.cyl(0.02, 0.24, 0.14, 8, 0, 1.6, 0, 1);
    const arm = U.cyl(0.07, 0.07, 0.62, 6, 0, 0, 0, 1);
    const all = U.mergeGeos([body, head, hat]);
    all.translate(x, 0, z);
    U.add(pc, all, mat, { recv: true });
    // arms + tool for masons
    if (pose === 'mallet') {
      const a1 = U.cyl(0.07, 0.07, 0.6, 6, 0, 0, 0, 1);
      a1.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x + 0.3, 1.15, 0.16),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 0, -1.1)),
        new THREE.Vector3(1, 1, 1)));
      a1.translate(0, 0, z);
      U.add(pc, a1, mat, { recv: false });
      const mal = U.box(0.1, 0.1, 0.1, 0, 0, 0, 0, 1);
      mal.translate(x + 0.62, 1.42, z + 0.42);
      U.add(pc, mal, M.timber, { cast: true, recv: false });
      const chl = U.cyl(0.02, 0.02, 0.3, 5, x + 0.5, 0.5, z + 0.3, 1);
      U.add(pc, chl, M.iron, { recv: false });
    }
    // apply facing rotation around own axis
    const arr = pc.arr;
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const mov = new THREE.Matrix4().makeTranslation(x, 0, z);
    const back = new THREE.Matrix4().makeTranslation(-x, 0, -z);
    for (const item of arr) {
      if (!item.__rotated) {
        item.g.applyMatrix4(back);
        item.g.applyMatrix4(rot);
        item.g.applyMatrix4(mov);
        item.__rotated = true;
      }
    }
    P.push(pc);
  }

  function house(P, o) {
    // o: {x,z,w,d,h,ry,style(0 half-timber,1 stone),roof:'tile'|'thatch',t,t1,chim}
    const pc = U.piece(o.t, o.t1 || 1e9);
    const R = U.prand((o.x * 17 + o.z * 5) | 0 || 3);
    const wallMat = o.style === 1 ? M.stone : M.halfT;
    // main body
    U.add(pc, U.box(o.w, o.h, o.d, 0, o.h / 2, 0, 0, 4), wallMat);
    // jetty (upper floor overhang) for timber houses
    if (o.style === 0 && o.h > 4.2) U.add(pc, U.box(o.w + 0.5, 1.9, o.d + 0.4, 0, o.h - 1.0, 0, 0, 3), M.halfT);
    // gable roof
    const rH = o.roof === 'thatch' ? 2.6 : 2.2;
    const rMat = o.roof === 'thatch' ? M.thatch : M.tile;
    for (const s of [-1, 1]) {
      const sl = Math.hypot(o.d / 2 + 0.55, rH);
      const g = U.box(o.w + 0.7, 0.22, sl, 0, 0, 0, 0, 4);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(0, o.h + rH / 2, s * (o.d / 4 + 0.14)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(s * Math.atan2(rH, o.d / 2 + 0.55), 0, 0)),
        new THREE.Vector3(1, 1, 1)));
      U.add(pc, g, rMat);
    }
    // gable end triangles
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-o.d / 2 - 0.1, 0); sh.lineTo(o.d / 2 + 0.1, 0); sh.lineTo(0, rH); sh.closePath();
      const gg = U.extrude(sh, 0.16, { bevelEnabled: false });
      U.tf(gg, s * (o.w / 2 - 0.08), o.h, 0, 0, Math.PI / 2, 0);
      U.add(pc, gg, wallMat);
    }
    // door (front face toward local +z)
    U.add(pc, U.box(1.1, 2.1, 0.14, o.w * 0.22, 1.05, o.d / 2 + 0.02, 0, 1), M.timber);
    // windows: recessed dark openings with frames
    const wins = o.style === 1 ? 2 : 3;
    for (let i = 0; i < wins; i++) {
      const wx = (i - (wins - 1) / 2) * (o.w / wins) - o.w * 0.12;
      for (const wy of (o.h > 4.2 ? [o.h - 1.6, 2.6] : [2.4])) {
        if (wy < 2.2 && Math.abs(wx - o.w * 0.22) < 0.8) continue; // not in the door
        U.add(pc, U.box(0.85, 1.0, 0.1, wx, wy, o.d / 2 + 0.05, 0, 1), M.window, { cast: false });
        U.add(pc, U.box(1.0, 0.1, 0.16, wx, wy + 0.55, o.d / 2 + 0.06, 0, 1), M.timber, { cast: false });
        U.add(pc, U.box(1.0, 0.1, 0.16, wx, wy - 0.55, o.d / 2 + 0.06, 0, 1), M.timber, { cast: false });
        U.add(pc, U.box(0.08, 1.1, 0.14, wx, wy, o.d / 2 + 0.06, 0, 1), M.timber, { cast: false });
      }
    }
    if (o.chim) {
      U.add(pc, U.box(0.85, o.h + rH + 1.6, 0.85, o.w * 0.3, (o.h + rH + 1.6) / 2, -o.d * 0.2, 0, 2), M.stone);
    }
    // orient + place
    const rot = new THREE.Matrix4().makeRotationY(o.ry);
    const mov = new THREE.Matrix4().makeTranslation(o.x, 0, o.z);
    for (const it of pc.arr) {
      it.g.applyMatrix4(rot);
      it.g.applyMatrix4(mov);
    }
    P.push(pc);
  }

  function tree(P, x, z, t, s, kind) {
    const pc = U.piece(t);
    const R = U.prand((x * 7 + z * 13) | 0 || 5);
    const h = (kind === 'poplar' ? 7.5 : 5.2) * s;
    U.add(pc, U.cyl(0.18 * s, 0.3 * s, h * 0.55, 7, x, h * 0.28, z, 1), M.timber, { cast: true });
    const blobs = kind === 'poplar' ? 5 : 4;
    for (let i = 0; i < blobs; i++) {
      const fy = kind === 'poplar'
        ? h * (0.4 + 0.62 * (i / blobs)) : h * (0.55 + 0.4 * R());
      const rad = kind === 'poplar'
        ? (1.7 - Math.abs(i / blobs - 0.5) * 1.7) * s : (1.9 + R() * 0.8) * s;
      const ox = (R() - 0.5) * 1.6 * s, oz = (R() - 0.5) * 1.6 * s;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.26 + R() * 0.05, 0.42, 0.24 + R() * 0.08),
        roughness: 0.95, flatShading: true
      });
      U.add(pc, U.tf(new THREE.IcosahedronGeometry(rad, 1), x + ox, fy, z + oz, R(), R(), 0), mat, { cast: true, recv: false });
    }
    P.push(pc);
  }

  function build(mats) {
    M = mats;
    const P = [];
    const anims = [];

    /* ---- yard pads ---- */
    const pads = U.piece(1196);
    // stone-dressing yard (south of nave) + path from the street
    U.add(pads, U.box(26, 0.14, 30, 27, 0.06, 4, 0, 3), M.cobble, { cast: false });
    U.add(pads, U.box(40, 0.1, 7, 20, 0.04, 48, 0, 3), M.mud, { cast: false });   // road to west front
    U.add(pads, U.box(9, 0.1, 60, 33, 0.04, 8, 0, 3), M.mud, { cast: false });    // south street
    P.push(pads);

    /* ---- stone stockpiles (grow over the campaigns) ---- */
    ashlarStack(P, 24, -4, 0.2, 1200, 4);
    ashlarStack(P, 27, 1, -0.3, 1210, 5);
    ashlarStack(P, 24, 6, 0.5, 1240, 3);
    ashlarStack(P, 26, 14, 0.1, 1258, 5);
    ashlarStack(P, 22, 18, -0.4, 1266, 4);
    ashlarStack(P, 30, -8, 0.4, 1300, 3);
    ashlarStack(P, 25, 26, 0.15, 1320, 2);
    rubblePile(P, 20.5, -8, 3.2, 1200);
    rubblePile(P, 30, 20, 3.6, 1250);
    rubblePile(P, 19, 33, 2.6, 1290);
    logPile(P, 30, 8, 0.3, 1199);
    logPile(P, 31, 36, 1.1, 1255);
    masonsShelter(P, 33, -2, -Math.PI / 2, 1202);
    masonsShelter(P, 32, 30, -Math.PI / 2, 1260);

    /* second shelter beside the west front (1270+) */
    masonsShelter(P, -19, 55, Math.PI * 0.8, 1270);
    ashlarStack(P, -16, 51, 0.4, 1272, 4);
    ashlarStack(P, -21, 48, -0.2, 1284, 3);
    rubblePile(P, -14, 44, 2.8, 1266);

    /* ---- timber hoists / cranes ---- */
    // A: on the north choir aisle roof, serving upper choir works 1235–1272
    const cA = treadwheelCrane({
      x: -10.4, y: 17.6, z: -30, ry: 0, wheelR: 2.1, mastH: 7.5, jibL: 9.5,
      jibRise: 0.42, wheelY: 4.4, dropLen: 7, speed: 3.1, t0: 1235, t1: 1272, phase: 0
    });
    cA.group.rotation.y = 0;
    P.push(makeGroupPiece(cA.group, 1235, 1273));
    anims.push(cA);

    // B: ground treadwheel crane, south yard, nave works 1266–1308 — hero lifter
    const cB = treadwheelCrane({
      x: 22.5, y: 0, z: 8, ry: Math.PI, wheelR: 2.4, mastH: 15.5, jibL: 13,
      jibRise: 0.5, wheelY: 5.2, dropLen: 13, speed: 2.4, t0: 1266, t1: 1308, phase: 1.7
    });
    // custom piece handling for animated groups: visibility via wrapper
    P.push(makeGroupPiece(cB.group, 1266, 1309));
    anims.push(cB);

    // C: small hoist on the west front scaffolding 1272–1306
    const cC = treadwheelCrane({
      x: 6.8, y: 24.0, z: 51.6, ry: 0.3, wheelR: 1.15, mastH: 3.2, jibL: 4.2,
      jibRise: 0.3, wheelY: 1.9, dropLen: 16, speed: 4.2, t0: 1272, t1: 1306, phase: 3.1, scale: 1
    });
    P.push(makeGroupPiece(cC.group, 1272, 1307));
    anims.push(cC);

    // Z: early hand treadwheel over the south choir trench, first campaign 1200–1242
    const cZ = treadwheelCrane({
      x: 17.5, y: 0, z: -44, ry: Math.PI, wheelR: 1.8, mastH: 9, jibL: 8,
      jibRise: 0.45, wheelY: 3.6, dropLen: 6, speed: 2.8, t0: 1200, t1: 1242, phase: 4.4
    });
    P.push(makeGroupPiece(cZ.group, 1200, 1243));
    anims.push(cZ);

    /* ---- workers (campaign-keyed) ---- */
    worker(P, 25.5, 2.5, -2.2, 1203, 1349, 0x8c7355, 'mallet');
    worker(P, 27.5, 12.5, -1.4, 1245, 1349, 0x6d5b47, 'mallet');
    worker(P, 31.5, 4.5, -2.6, 1206, 1349, 0x7a4a3a, null);
    worker(P, 30.5, 26.5, 1.2, 1262, 1349, 0x5d6470, 'mallet');
    worker(P, 21.5, 30, 0.4, 1270, 1349, 0x937b52, null);
    worker(P, -17.5, 50.5, 2.4, 1274, 1349, 0x6d5b47, 'mallet');
    worker(P, -20, 46.5, 0.8, 1278, 1349, 0x8c7355, null);
    worker(P, 12, 52, 3.6, 1200, 1349, 0x7a4a3a, null);
    worker(P, -4, 57, 3.1, 1240, 1349, 0x5d6470, null);
    worker(P, 28, -6, 2.9, 1300, 1349, 0x937b52, 'mallet');

    /* ---- cart + barrows ---- */
    const cart = U.piece(1200);
    {
      const x = 34, z = 44, ry = 0.15;
      const body = U.box(1.6, 0.7, 3.0, 0, 1.0, 0, 0, 3);
      const shafts = [U.box(0.12, 0.12, 2.4, -0.6, 0.8, 2.5, 0, 2), U.box(0.12, 0.12, 2.4, 0.6, 0.8, 2.5, 0, 2)];
      const wheels = [];
      for (const s of [-1, 1]) {
        const w = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14);
        w.rotateZ(Math.PI / 2);
        w.translate(s * 0.95, 0.62, -0.3);
        wheels.push(w);
        for (let i = 0; i < 6; i++) {
          const sp = U.box(0.08, 1.1, 0.08, 0, 0, 0, 0, 1);
          sp.applyMatrix4(new THREE.Matrix4().makeRotationX(i * Math.PI / 6));
          sp.translate(s * 0.95, 0.62, -0.3);
          wheels.push(sp);
        }
      }
      const gg = U.mergeGeos([body, ...shafts, ...wheels]);
      gg.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
      gg.translate(x, 0, z);
      U.add(cart, gg, M.timber);
      P.push(cart);
    }

    /* ---- town ---- */
    // west plaza flankers
    house(P, { x: -26, z: 62, w: 9, d: 8, h: 5.5, ry: Math.PI, style: 0, roof: 'tile', t: 1195, chim: true });
    house(P, { x: -33, z: 55, w: 8, d: 7, h: 6.6, ry: Math.PI * 0.6, style: 1, roof: 'tile', t: 1210, chim: true });
    house(P, { x: 24, z: 64, w: 10, d: 8, h: 5.8, ry: Math.PI, style: 0, roof: 'tile', t: 1200, chim: true });
    house(P, { x: 33, z: 58, w: 8, d: 7.5, h: 5.0, ry: Math.PI * 1.3, style: 0, roof: 'thatch', t: 1230 });
    // south street row (faces the site over the wall)
    const row = [
      [24, -34, 9, 7, 5.4, 1198, 'tile', 0],
      [24, -24, 8, 7, 6.2, 1205, 'tile', 1],
      [25, -14, 9, 7, 5.2, 1226, 'thatch', 0],
      [24, -2, 8.5, 7, 5.8, 1196, 'tile', 0],
      [25, 10, 9, 7.5, 6.8, 1240, 'tile', 1],
      [24, 22, 8, 7, 5.0, 1218, 'thatch', 0],
      [25, 34, 9.5, 7, 5.6, 1252, 'tile', 0],
      [24, 44, 8, 7, 6.0, 1268, 'tile', 1]
    ];
    for (const [x, z, w, d, h, t, rf, st] of row)
      house(P, { x, z, w, d, h, ry: -Math.PI / 2 + (U.prand(z)() - 0.5) * 0.06, style: st, roof: rf, t, chim: st === 1 || z % 3 === 0 });
    // outer south row (second line, later)
    const row2 = [
      [37, -30, 9, 8, 5.6, 1255], [38, -18, 9, 8, 5.2, 1264], [37, -6, 10, 8, 6.4, 1272],
      [38, 6, 9, 8, 5.4, 1280], [37, 18, 9, 8, 5.8, 1290], [38, 32, 10, 8, 6.0, 1300],
      [37, 46, 9, 8, 5.4, 1310]
    ];
    for (const [x, z, w, d, h, t] of row2)
      house(P, { x, z, w, d, h, ry: -Math.PI / 2 + 0.04, style: z % 2 ? 1 : 0, roof: z > 20 ? 'tile' : 'thatch', t });
    // north row (beyond the site)
    const rowN = [
      [-30, -46, 9, 7, 5.4, 1204, 'tile', 0], [-18, -48, 8, 7, 6.0, 1216, 'tile', 1],
      [-6, -50, 9, 7, 5.2, 1232, 'thatch', 0], [7, -49, 8, 7, 5.8, 1248, 'tile', 0],
      [19, -47, 9, 7, 5.4, 1262, 'tile', 1], [31, -44, 8, 7, 5.0, 1284, 'thatch', 0],
      [-40, -40, 8, 7, 5.6, 1270, 'tile', 1]
    ];
    for (const [x, z, w, d, h, t, rf, st] of rowN)
      house(P, { x, z, w, d, h, ry: Math.PI + (x > 0 ? -0.05 : 0.05), style: st, roof: rf, t });
    // east houses behind the apse
    house(P, { x: -16, z: -62, w: 9, d: 8, h: 5.4, ry: 0.3, style: 0, roof: 'tile', t: 1225 });
    house(P, { x: -26, z: -58, w: 8, d: 7, h: 6.2, ry: 0.7, style: 1, roof: 'tile', t: 1258, chim: true });
    house(P, { x: 17, z: -63, w: 9, d: 7, h: 5.2, ry: -0.4, style: 0, roof: 'thatch', t: 1244 });
    house(P, { x: 27, z: -57, w: 8.5, d: 7, h: 5.8, ry: -0.9, style: 0, roof: 'tile', t: 1296, chim: true });

    /* parish church (small, stone, to the north-east) */
    {
      const pc = U.piece(1212);
      const x = 44, z = -50;
      U.add(pc, U.box(7, 8, 16, x, 4, z, 0, 4), M.stone);
      U.add(pc, U.box(5, 14, 5, x, 7, z - 9, 0, 3), M.stone);
      for (const s of [-1, 1]) {
        const g = U.box(18, 0.25, 4.4, 0, 0, 0, 0, 4);
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(x, 9.6, z + s * 4),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(s * 0.5, 0, 0)),
          new THREE.Vector3(1, 1, 1)));
        U.add(pc, g, M.tile);
      }
      const sp = U.tf(new THREE.ConeGeometry(3.4, 8, 4), x, 18, z - 9, 0, Math.PI / 4, 0);
      U.add(pc, sp, M.lead);
      P.push(pc);
    }

    /* ---- perimeter wall + gates ---- */
    function wallRun(x0, z0, x1, z1, t) {
      const pc = U.piece(t);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(-(z1 - z0), (x1 - x0));
      const g = U.box(len, 4.2, 1.1, 0, 2.1, 0, 0, 4);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      U.add(pc, g, M.stone);
      const cap = U.box(len, 0.3, 1.4, 0, 4.35, 0, 0, 3);
      cap.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
      cap.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      U.add(pc, cap, M.ashlar);
      P.push(pc);
    }
    // south wall (with a gap for the street), north wall, east wall
    wallRun(35, 52, 35, 24, 1236);
    wallRun(35, 16, 35, -40, 1236);
    wallRun(-44, -42, 44, -42, 1244);
    wallRun(46, -42, 46, 52, 1250);
    wallRun(-46, -42, -46, 56, 1256);
    wallRun(-46, 56, -40, 62, 1256);
    // gatehouse on the south wall
    {
      const pc = U.piece(1240);
      const x = 35, z = 20;
      U.add(pc, U.box(7.5, 6.5, 3.4, x, 3.25, z, 0, 3), M.stone);
      U.add(pc, U.box(8.2, 0.4, 4.0, x, 6.7, z, 0, 2), M.ashlar);
      for (const s of [-1, 1]) U.add(pc, U.box(1.1, 7.4, 1.1, x, 3.7, z + s * 3.4, 0, 2), M.stone);
      const arch = U.extrude(U.archRingShape(2.2, 3.4, 2.4, 0, 0.4), 1.2);
      U.tf(arch, x, 0, z, 0, Math.PI / 2, 0);
      U.add(pc, arch, M.ashlar);
      // dark gate passage
      U.add(pc, U.box(0.2, 3.4, 4.0, x, 1.7, z, 0, 1), M.window, { cast: false });
      P.push(pc);
    }

    /* ---- well ---- */
    {
      const pc = U.piece(1197);
      U.add(pc, U.cyl(1.05, 1.15, 1.1, 12, -24, 0.55, 58, 1), M.stone);
      U.add(pc, U.cyl(1.15, 1.15, 0.2, 12, -24, 1.15, 58, 1), M.ashlar);
      for (const s of [-1, 1]) U.add(pc, U.box(0.14, 2.2, 0.14, -24 + s * 1.1, 2.2, 58, 0, 1), M.timber);
      U.add(pc, U.box(0.14, 0.14, 2.6, -24, 3.3, 58, 0, 2), M.timber);
      U.add(pc, U.cyl(0.12, 0.12, 2.2, 7, -24, 3.1, 58, 2), M.timber);
      P.push(pc);
    }

    /* ---- trees + hedges ---- */
    const spots = [
      [-52, 60, 'poplar'], [-56, 40, 'tree'], [-54, -20, 'poplar'], [-50, -52, 'tree'],
      [52, 62, 'tree'], [56, 30, 'poplar'], [55, -14, 'tree'], [54, -46, 'poplar'],
      [-30, 72, 'tree'], [4, 74, 'poplar'], [40, 70, 'tree'], [-64, 10, 'tree'],
      [66, 8, 'poplar'], [-68, -34, 'tree'], [64, -54, 'tree'], [14, -72, 'poplar'],
      [-24, -70, 'tree'], [-40, 68, 'tree']
    ];
    spots.forEach(([x, z, k], i) => tree(P, x, z, 1196 + (i * 7) % 60, 0.85 + ((i * 37) % 40) / 100, k));

    /* ---- distant hills (landscape depth) ---- */
    {
      const pc = U.piece(1);
      const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1, metalness: 0 });
      for (const [hx, hz, hr] of [[-780, -840, 340], [860, -760, 380], [1080, 220, 360], [-960, 380, 320], [220, 1080, 400]]) {
        const g = new THREE.SphereGeometry(hr, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6);
        g.scale(2.4, 0.55, 1.4);
        U.add(pc, U.tf(g, hx, -hr * 0.43, hz, 0, 0, 0), hillMat, { cast: false, recv: false });
      }
      P.push(pc);
    }

    return { pieces: P, animators: anims };
  }

  /* --- helpers for animated groups --- */
  function makeGroupPiece(grp, t, t1) {
    return { t, tEnd: t1, arr: [], __group: grp };
  }

  return { build: build };
})();
