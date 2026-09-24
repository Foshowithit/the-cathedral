/* main.js — renderer, lighting, camera, timeline engine, UI, screenshot instruments.
   Timeline state is a pure function of the selected year: setYear(y) rebuilds
   visibility from stored piece windows; nothing accumulates. */
(function () {
  'use strict';
  const U = window.UT;

  try {
    /* ================= renderer ================= */
    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;

    const scene = new THREE.Scene();

    /* gradient sky dome + matched haze */
    const skyC = document.createElement('canvas');
    skyC.width = 4; skyC.height = 512;
    {
      const g = skyC.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0.0, '#6f9ccf');
      gr.addColorStop(0.42, '#9dbcd8');
      gr.addColorStop(0.72, '#cdd8dd');
      gr.addColorStop(1.0, '#e2e3da');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    }
    const skyT = new THREE.CanvasTexture(skyC);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(760, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    scene.add(sky);
    scene.fog = new THREE.FogExp2(0xd2d8d6, 0.00085);

    /* ================= lights ================= */
    const sun = new THREE.DirectionalLight(0xffe6c2, 1.7);
    sun.position.set(118, 128, 96);
    sun.target.position.set(0, 8, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 30; sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun); scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0xbcd4e8, 0x8a7d66, 0.55);
    scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xdfe6ee, 0.22);   // soft sky bounce from NW
    fill.position.set(-90, 70, -60);
    scene.add(fill);

    /* ================= materials ================= */
    const M = TEX.init();
    if (M.grass && M.grass.map) {
      M.grass.map.wrapS = M.grass.map.wrapT = THREE.RepeatWrapping;
      M.grass.map.repeat.set(400, 400);
      M.grass.map.needsUpdate = true;
    }

    /* ================= camera + custom orbit ================= */
    const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.5, 2200);
    const HERO = { pos: new THREE.Vector3(117, 35.5, -88.5), tgt: new THREE.Vector3(0, 16, -18), fov: 44 };
    const MASONRY = { pos: new THREE.Vector3(19.5, 3.4, 16.5), tgt: new THREE.Vector3(14.5, 5.7, 6), fov: 38 };

    const ctrl = {
      tgt: HERO.tgt.clone(),
      theta: 0, phi: 1.2, rad: 90,          // current (damped)
      dTheta: 0, dPhi: 1.2, dRad: 90,       // desired
      tween: null,
      update(dt) {
        if (this.tween) {
          const t = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          this.dTheta = U.lerp(this.tween.a.theta, this.tween.b.theta, e);
          this.dPhi = U.lerp(this.tween.a.phi, this.tween.b.phi, e);
          this.dRad = U.lerp(this.tween.a.rad, this.tween.b.rad, e);
          this.tgt.lerpVectors(this.tween.aTgt, this.tween.bTgt, e);
          if (this.tween.bFov !== undefined) {
            camera.fov = U.lerp(this.tween.aFov, this.tween.bFov, e);
            camera.updateProjectionMatrix();
          }
          if (t >= 1) this.tween = null;
        }
        const k = 1 - Math.pow(0.0015, dt);
        this.theta += (this.dTheta - this.theta) * k;
        this.phi += (this.dPhi - this.phi) * k;
        this.rad += (this.dRad - this.rad) * k;
        const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
        camera.position.set(
          this.tgt.x + this.rad * sp * Math.sin(this.theta),
          this.tgt.y + this.rad * cp,
          this.tgt.z + this.rad * sp * Math.cos(this.theta)
        );
        if (camera.position.y < 1.4) camera.position.y = 1.4;
        camera.lookAt(this.tgt);
      },
      syncFromCamera() {
        const d = camera.position.clone().sub(this.tgt);
        this.rad = this.dRad = d.length();
        this.phi = this.dPhi = Math.acos(THREE.MathUtils.clamp(d.y / this.rad, -1, 1));
        this.theta = this.dTheta = Math.atan2(d.x, d.z);
      },
      goto(preset, dur) {
        const from = { theta: this.dTheta, phi: this.dPhi, rad: this.dRad };
        const aTgt = this.tgt.clone();
        // derive desired spherical for preset pos
        const d = preset.pos.clone().sub(preset.tgt);
        const to = {
          rad: d.length(),
          phi: Math.acos(THREE.MathUtils.clamp(d.y / d.length(), -1, 1)),
          theta: Math.atan2(d.x, d.z)
        };
        // keep rotation direction short
        let dt = to.theta - from.theta;
        while (dt > Math.PI) { to.theta -= 2 * Math.PI; dt = to.theta - from.theta; }
        while (dt < -Math.PI) { to.theta += 2 * Math.PI; dt = to.theta - from.theta; }
        this.tween = { t0: performance.now(), dur: dur || 1400, a: from, b: to, aTgt, bTgt: preset.tgt.clone(),
          aFov: camera.fov, bFov: preset.fov ?? camera.fov };
      }
    };

    /* pointer controls */
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
      ctrl.tween = null;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.b === 2 || drag.b === 1 || drag.shift) {
        // pan target, clamped to a sane region
        const fwd = new THREE.Vector3().subVectors(ctrl.tgt, camera.position).setY(0).normalize();
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const sc = ctrl.rad * 0.0016;
        ctrl.tgt.addScaledVector(right, -dx * sc);
        ctrl.tgt.addScaledVector(fwd, -dy * sc * 0.7);
        ctrl.tgt.x = THREE.MathUtils.clamp(ctrl.tgt.x, -90, 90);
        ctrl.tgt.z = THREE.MathUtils.clamp(ctrl.tgt.z, -120, 110);
        ctrl.tgt.y = THREE.MathUtils.clamp(ctrl.tgt.y, 2, 45);
        ctrl.dTheta = ctrl.theta; ctrl.dPhi = ctrl.phi; ctrl.dRad = ctrl.rad;
        ctrl.tgt.copy(ctrl.tgt);
        ctrl.gotoTarget = ctrl.tgt;
        ctrl.tween = null;
        ctrl._tgtFix = ctrl.tgt.clone();
      } else {
        ctrl.dTheta -= dx * 0.005;
        ctrl.dPhi = THREE.MathUtils.clamp(ctrl.dPhi - dy * 0.004, 0.12, 1.52);
      }
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      ctrl.tween = null;
      ctrl.dRad = THREE.MathUtils.clamp(ctrl.dRad * Math.exp(e.deltaY * 0.0011), 10, 430);
    }, { passive: false });
    // pinch
    let pinch = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        ctrl.dRad = THREE.MathUtils.clamp(ctrl.dRad * (pinch / d), 10, 430);
        pinch = d;
        ctrl.tween = null;
      }
    }, { passive: true });
    ctrl.syncFromCamera();

    /* ================= ground + landscape statics ================= */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), M.grass || M.mud);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // disturbed earth under the cathedral footprint (always on: site is pre-cleared)
    const disturb = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 132), M.mud);
    disturb.position.set(0, 0.045, -6);
    disturb.receiveShadow = true;
    scene.add(disturb);

    /* clouds */
    {
      const R = U.prand(77);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xeef1f3, roughness: 1, metalness: 0, emissive: 0x667788, emissiveIntensity: 0.12, flatShading: true
      });
      for (let c = 0; c < 8; c++) {
        const grp = [];
        const cx = (R() - 0.5) * 900, cz = (R() - 0.5) * 900, cy = 300 + R() * 140;
        const n = 4 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) {
          const r = 26 + R() * 44;
          grp.push(U.tf(new THREE.IcosahedronGeometry(r, 1),
            (i - n / 2) * 40 + R() * 20, (R() - 0.5) * 14, (R() - 0.5) * 40, R(), R(), 0));
        }
        const cloud = new THREE.Mesh(U.mergeGeos(grp), cloudMat);
        cloud.scale.y = 0.42;
        cloud.position.set(cx, cy, cz);
        scene.add(cloud);
      }
    }

    /* ================= build the world ================= */
    const states = [];      // {mesh, t, tEnd}
    const groups = [];      // {obj, t, tEnd} animated groups
    const animators = [];
    const stats = { meshes: 0, tris: 0, pieces: 0 };

    function buildWorld() {
      const pieces = CATHEDRAL.build(M);
      const site = SITE.build(M);
      pieces.push(...site.pieces);
      animators.push(...site.animators);
      stats.pieces = pieces.length;

      // bucket: key = mat.uuid|cast|recv|t|tEnd
      const buckets = new Map();
      for (const p of pieces) {
        if (p.__group) {
          groups.push({ obj: p.__group, t: p.t, tEnd: p.tEnd });
          scene.add(p.__group);
          continue;
        }
        for (const it of p.arr) {
          const cast = it.cast === false ? 0 : 1;
          const recv = it.recv === false ? 0 : 1;
          const k = it.m.uuid + '|' + cast + '|' + recv + '|' + p.t + '|' + p.tEnd;
          let b = buckets.get(k);
          if (!b) { b = { m: it.m, cast, recv, t: p.t, tEnd: p.tEnd, geos: [] }; buckets.set(k, b); }
          b.geos.push(it.g);
        }
      }
      for (const b of buckets.values()) {
        const merged = U.mergeGeos(b.geos);
        const mesh = new THREE.Mesh(merged, b.m);
        mesh.castShadow = !!b.cast;
        mesh.receiveShadow = !!b.recv;
        scene.add(mesh);
        states.push({ mesh, t: b.t, tEnd: b.tEnd });
        stats.meshes++;
        const pos = merged.getAttribute('position');
        stats.tris += (merged.index ? merged.index.count : pos.count) / 3;
      }
      stats.tris = Math.round(stats.tris);
    }
    buildWorld();

    /* year-dependent extra pieces (plaza paving, debris) — simple direct meshes */
    const latePieces = [];
    function lateBox(w, h, d, x, y, z, mat, t, t1) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
      latePieces.push({ mesh: m, t, tEnd: t1 });
      return m;
    }
    // debris scatter during active work, cleared by 1344
    {
      const geos = [];
      const R = U.prand(1234);
      for (let i = 0; i < 90; i++) {
        const x = 17 + R() * 18, z = -14 + R() * 50;
        const s = 0.16 + R() * 0.34;
        const g = U.box(s, s * 0.5, s * 1.2, x, s * 0.25, z, R() * 3, 1);
        geos.push(g);
      }
      for (let i = 0; i < 60; i++) {
        const x = -24 + R() * 16, z = 40 + R() * 22;
        const s = 0.15 + R() * 0.3;
        geos.push(U.box(s, s * 0.5, s, x, s * 0.25, z, R() * 3, 1));
      }
      const mesh = new THREE.Mesh(U.mergeGeos(geos), M.rough);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      latePieces.push({ mesh, t: 1210, tEnd: 1344 });
    }
    // paved forecourt appears as the city takes over (final years)
    lateBox(52, 0.1, 24, 0, 0.11, 64, M.cobble, 1344, 1e9);
    lateBox(46, 0.1, 60, 36, 0.11, 8, M.cobble, 1346, 1e9);

    /* ================= timeline ================= */
    let year = 1275;
    const el = {
      year: document.getElementById('year'), phase: document.getElementById('phase'),
      campaign: document.getElementById('campaign'), tl: document.getElementById('tl'),
      play: document.getElementById('play'), icoPlay: document.getElementById('icoPlay'),
      icoPause: document.getElementById('icoPause'), sub: document.querySelector('#title span')
    };

    const PHASES = [
      [1200, 'Groundbreaking', 'Trenches are cut to bedrock; workshops, stockpiles and the first treadwheel crane arrive.'],
      [1216, 'The Choir Rises', 'Ambulatory and choir walls climb bay by bay behind timber scaffolding.'],
      [1244, 'Vaults over the Choir', 'Rib vaults close and the eastern end is roofed; masons dress stone for the nave.'],
      [1252, 'The Nave Advances', 'Piers march westward while the crossing and west-front footings are opened.'],
      [1270, 'Transept & West Front', 'The cross-arm walls climb and the great portals take shape under centering.'],
      [1300, 'The Western Façade', 'Nave roofed; the façade soars upward and the towers begin their long rise.'],
      [1315, 'Towers, Tracery & Flèche', 'Belfries, window tracery and the crossing spire complete the silhouette.'],
      [1346, 'The Cathedral Complete', 'Scaffolds are struck; a finished cathedral stands in an established town.']
    ];
    let phaseIdx = -1;
    function phaseFor(y) {
      let i = 0;
      for (let k = 0; k < PHASES.length; k++) if (y >= PHASES[k][0]) i = k;
      return i;
    }

    function applyYear(y) {
      let vis = 0;
      for (const s of states) {
        const v = y >= s.t && y < s.tEnd;
        if (s.mesh.visible !== v) s.mesh.visible = v;
        if (v) vis++;
      }
      for (const g of groups) {
        const v = y >= g.t && y < g.tEnd;
        if (g.obj.visible !== v) g.obj.visible = v;
      }
      for (const lp of latePieces) {
        const v = y >= lp.t && y < lp.tEnd;
        if (lp.mesh.visible !== v) lp.mesh.visible = v;
      }
      for (const a of animators) if (a.group.visible) a.tick(y);
      return vis;
    }

    function setYear(y) {
      year = THREE.MathUtils.clamp(y, 1200, 1350);
      applyYear(year);
      el.year.textContent = Math.floor(year + 0.0001);
      const pi = phaseFor(year);
      if (pi !== phaseIdx) {
        phaseIdx = pi;
        el.phase.textContent = PHASES[pi][1];
        el.campaign.textContent = PHASES[pi][2];
      }
      if (el.sub) el.sub.textContent = 'Anno Domini · ' + roman(Math.floor(year + 0.0001));
      el.tl.value = year;
      const pct = ((year - 1200) / 150) * 100;
      el.tl.style.setProperty('--fill', pct.toFixed(1) + '%');
    }

    function roman(n) {
      const tbl = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
                   [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      let out = '';
      for (const [v, s] of tbl) while (n >= v) { out += s; n -= v; }
      return out;
    }

    /* playback */
    let playing = false, speed = 4;   // years per second
    function setPlaying(p) {
      playing = p;
      el.icoPlay.style.display = p ? 'none' : 'block';
      el.icoPause.style.display = p ? 'block' : 'none';
    }
    el.tl.addEventListener('input', () => { setPlaying(false); setYear(parseFloat(el.tl.value)); });
    el.play.addEventListener('click', () => { if (year >= 1349.99) setYear(1200); setPlaying(!playing); });
    document.querySelectorAll('.sbtn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.sbtn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        speed = parseFloat(b.dataset.sp);
      });
    });
    document.getElementById('btnHero').addEventListener('click', () => ctrl.goto(HERO));
    document.getElementById('btnGround').addEventListener('click', () => ctrl.goto(MASONRY));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'r' || e.key === 'R') ctrl.goto(HERO);
      else if (e.key === 'm' || e.key === 'M') ctrl.goto(MASONRY);
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ================= loop ================= */
    let last = performance.now(), firstFrame = true, frames = 0, fpsT = 0, fps = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) {
        let y = year + speed * dt;
        if (y >= 1350) { y = 1350; setPlaying(false); }
        setYear(y);
      }
      for (const a of animators) if (a.group.visible) a.tick(year);
      ctrl.update(dt);
      renderer.render(scene, camera);
      frames++; fpsT += dt;
      if (fpsT >= 1) { fps = frames; frames = 0; fpsT = 0; }
      if (firstFrame) {
        firstFrame = false;
        window.__ready = true;
      }
    }

    setYear(1275);
    ctrl.goto(HERO, 1);       // pin exact hero framing on load (near-instant)
    requestAnimationFrame(loop);

    /* ================= screenshot / inspection instruments ================= */
    window.__state = {
      get ready() { return window.__ready === true; },
      get year() { return year; },
      get fps() { return fps; },
      stats,
      setYear(y) { setPlaying(false); setYear(y); },
      view(name) { ctrl.goto(name === 'masonry' ? MASONRY : HERO, 1); ctrl.update(16); },
      orbit(theta, phi, rad, tx, ty, tz) {
        ctrl.tween = null;
        ctrl.dTheta = ctrl.theta = theta;
        ctrl.dPhi = ctrl.phi = phi;
        ctrl.dRad = ctrl.rad = rad;
        ctrl.tgt.set(tx, ty, tz);
        ctrl.update(0.016);
      },
      cam(x, y, z, tx, ty, tz) {
        ctrl.tween = null;
        ctrl.tgt.set(tx, ty, tz);
        camera.position.set(x, y, z);
        ctrl.syncFromCamera();
        camera.lookAt(ctrl.tgt);
      },
      camera() { return { p: camera.position.toArray(), t: ctrl.tgt.toArray(), fov: camera.fov }; },
      builtPts() {
        /* sampled world-space points of BUILT visible meshes for current year */
        const BUILT = new Set(['stone', 'ashlar', 'rough', 'timber', 'deck', 'tile', 'lead',
          'glass', 'glassBlue', 'plaster', 'frame', 'halfT', 'window', 'thatch', 'rope', 'iron', 'cobble', 'mud']);
        const keyOf = (m) => { let k = m.name || ''; if (!k) for (const kk of Object.keys(M)) if (M[kk] === m) { k = kk; break; } return k; };
        const pts = [];
        const v = new THREE.Vector3();
        for (const m of scene.children) {
          if (!m.isMesh || !m.visible) continue;
          if (!BUILT.has(keyOf(m.material))) continue;
          const pos = m.geometry.getAttribute('position');
          const step = Math.max(1, Math.floor(pos.count / 800));
          for (let i = 0; i < pos.count; i += step) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            pts.push(v.x, v.y, v.z);
          }
        }
        return Array.from(pts);
      },
      crop() {
        /* NDC extremes of BUILT visible vertices in front of camera within 300m */
        const BUILT = new Set(['stone', 'ashlar', 'rough', 'timber', 'deck', 'tile', 'lead',
          'glass', 'glassBlue', 'plaster', 'frame', 'halfT', 'window', 'thatch', 'rope', 'iron', 'cobble', 'mud']);
        const keyOf = (m) => { let k = m.name || ''; if (!k) for (const kk of Object.keys(M)) if (M[kk] === m) { k = kk; break; } return k; };
        let maxY = -2, minY = 2, maxX = -2, minX = 2, nOut = 0, n = 0;
        const v = new THREE.Vector3(), w = new THREE.Vector3();
        const inv = camera.matrixWorldInverse;
        let top = null, left = null, right = null;
        for (const m of scene.children) {
          if (!m.isMesh || !m.visible) continue;
          const k = keyOf(m.material);
          if (!BUILT.has(k)) continue;
          const pos = m.geometry.getAttribute('position');
          const step = Math.max(1, Math.floor(pos.count / 4000));
          for (let i = 0; i < pos.count; i += step) {
            v.fromBufferAttribute(pos, i);
            v.applyMatrix4(inv);
            if (v.z > -0.5 || v.z < -300) continue;
            v.applyMatrix4(camera.projectionMatrix);
            n++;
            if (v.y > maxY) { maxY = v.y; w.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); top = [k, ...w.toArray().map(q => +q.toFixed(1))]; }
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) { maxX = v.x; w.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); right = [k, ...w.toArray().map(q => +q.toFixed(1))]; }
            if (v.x < minX) { minX = v.x; w.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); left = [k, ...w.toArray().map(q => +q.toFixed(1))]; }
            if (Math.abs(v.y) > 1 || Math.abs(v.x) > 1) nOut++;
          }
        }
        return {
          n, maxY: +maxY.toFixed(3), minY: +minY.toFixed(3), maxX: +maxX.toFixed(3), minX: +minX.toFixed(3), nOut,
          top, left, right
        };
      },
      pickGrid(x0, x1, y0, y1, nx, ny) {
        /* dense identity grid: first hit per cell (recursive, ancestor-visibility) */
        const rc = new THREE.Raycaster();
        const vis = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
        const keyOf = (m) => { let k = (m && m.name) || ''; if (!k && m) for (const kk of Object.keys(M)) if (M[kk] === m) { k = kk; break; } return k; };
        const out = [];
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const px = x0 + (x1 - x0) * (i + 0.5) / nx, py = y0 + (y1 - y0) * (j + 0.5) / ny;
          rc.setFromCamera(new THREE.Vector2(px, py), camera);
          const hits = rc.intersectObjects(scene.children, true).filter(h => vis(h.object));
          if (!hits.length) { out.push([+px.toFixed(2), +py.toFixed(2), 'MISS']); continue; }
          const h = hits[0], st = states.find(s => s.mesh === h.object);
          let grp = null;
          for (const g of groups) { let o = h.object; while (o) { if (o === g.obj) { grp = g; break; } o = o.parent; } if (grp) break; }
          out.push([+px.toFixed(2), +py.toFixed(2), keyOf(h.object.material) || h.object.type,
            st ? +st.t.toFixed(0) : (grp ? +grp.t.toFixed(0) : null),
            st ? +st.tEnd.toFixed(0) : (grp ? +grp.tEnd.toFixed(0) : null),
            +h.distance.toFixed(1)]);
        }
        return out;
      },
      groups() {
        /* every group's construction window + world position — catches permanent cranes */
        return groups.map(g => {
          const c = new THREE.Vector3(); g.obj.getWorldPosition(c);
          return { t: +g.t.toFixed(1), tEnd: +g.tEnd.toFixed(1), name: g.obj.name || '?', c: c.toArray().map(v => +v.toFixed(1)), vis: g.obj.visible };
        });
      },
      audit(y) {
        /* temporaries (finite tEnd) visible at year y — scaffold/crane leftovers */
        const out = [];
        for (const s of states) {
          if (!(y >= s.t && y < s.tEnd)) continue;
          if (!(s.tEnd < 1e8)) continue;
          const m = s.mesh.material;
          let key = m.name || '';
          if (!key) for (const k of Object.keys(M)) if (M[k] === m) { key = k; break; }
          s.mesh.geometry.computeBoundingBox();
          const c = new THREE.Vector3(), sz = new THREE.Vector3();
          s.mesh.geometry.boundingBox.getCenter(c); s.mesh.geometry.boundingBox.getSize(sz);
          out.push({ t: +s.t.toFixed(1), tEnd: +s.tEnd.toFixed(1), mat: key, c: c.toArray().map(v => +v.toFixed(1)), sz: sz.toArray().map(v => +v.toFixed(1)) });
        }
        for (const g of groups) {
          if (!(y >= g.t && y < g.tEnd && g.tEnd < 1e8)) continue;
          const c = new THREE.Vector3(); g.obj.getWorldPosition(c);
          out.push({ t: +g.t.toFixed(1), tEnd: +g.tEnd.toFixed(1), mat: 'GROUP:' + (g.obj.name || '?'), c: c.toArray().map(v => +v.toFixed(1)) });
        }
        return out;
      },
      pick(nx, ny) {
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
        const vis = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
        const hits = rc.intersectObjects(scene.children, true).filter(h => vis(h.object));
        if (!hits.length) return null;
        const h = hits[0], st = states.find(s => s.mesh === h.object);
        let grp = null;
        for (const g of groups) { let o = h.object; while (o) { if (o === g.obj) { grp = g; break; } o = o.parent; } if (grp) break; }
        const m = h.object.material;
        let key = m && m.name || '';
        if (!key && m) for (const k of Object.keys(M)) if (M[k] === m) { key = k; break; }
        return {
          p: h.point.toArray().map(v => +v.toFixed(2)),
          d: +h.distance.toFixed(2),
          t: st ? st.t : (grp ? grp.t : null),
          tEnd: st ? st.tEnd : (grp ? grp.tEnd : null),
          mat: key || (h.object.isMesh ? 'MESH?' : h.object.type),
          grp: grp ? (grp.obj.name || 'unnamed') : null
        };
      },
      counts() { return { states: states.length, groups: groups.length, animators: animators.length, meshes: stats.meshes, tris: stats.tris, pieces: stats.pieces }; }
    };
    window.__setYear = (y) => window.__state.setYear(y);
    window.__shot = (name) => window.__state.view(name);

  } catch (err) {
    if (window.__err) window.__err((err && err.stack) ? err.stack : String(err));
    else console.error(err);
  }
})();
