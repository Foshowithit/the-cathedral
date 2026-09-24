/* textures.js — procedural canvas textures + PBR material library.
   Everything is generated locally; no external assets required. */
window.TEX = (function () {
  'use strict';
  const T = THREE;
  let M = {};

  function cnv(s) { const c = document.createElement('canvas'); c.width = c.height = s; return [c, c.getContext('2d')]; }
  function rnd(seed) { let s = seed || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function speckle(ctx, S, n, alpha, dark, R) {
    for (let i = 0; i < n; i++) {
      const x = R() * S, y = R() * S, r = R() * 1.6 + 0.3;
      ctx.fillStyle = dark
        ? `rgba(60,52,40,${alpha * R()})`
        : `rgba(255,250,235,${alpha * R()})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  /* -------- limestone masonry: returns {map, bump, rough} -------- */
  function stoneTex(opts) {
    const S = 1024, R = rnd(opts.seed || 7);
    const [c, x] = cnv(S), [cb, xb] = cnv(S), [cr, xr] = cnv(S);
    const courses = opts.courses, cols = opts.cols;
    const ch = S / courses, cw = S / cols;
    const mort = opts.mortar || [148, 138, 118];
    x.fillStyle = `rgb(${mort[0]},${mort[1]},${mort[2]})`; x.fillRect(0, 0, S, S);
    xr.fillStyle = 'rgb(60,60,60)'; xr.fillRect(0, 0, S, S);
    xb.fillStyle = 'rgb(30,30,30)'; xb.fillRect(0, 0, S, S);
    const mw = opts.mw || 5;
    const base = opts.base || [214, 203, 178];
    for (let r = 0; r < courses; r++) {
      const off = (r % 2) * cw * 0.5;
      for (let c = -1; c < cols + 1; c++) {
        const bx = c * cw + off, by = r * ch;
        const j = (R() - 0.5) * 2 * opts.jitter;          // ± jitter in tone
        const hj = (R() - 0.5) * 10;                      // hue-ish shift
        const l = base[2] + j + (R() - 0.5) * 8;
        const rr = Math.max(0, Math.min(255, base[0] + j + hj));
        const g2 = Math.max(0, Math.min(255, base[1] + j + hj * 0.4));
        const b2 = Math.max(0, Math.min(255, l));
        x.fillStyle = `rgb(${rr | 0},${g2 | 0},${b2 | 0})`;
        x.fillRect(bx + mw / 2, by + mw / 2, cw - mw, ch - mw);
        // top-light / bottom-shade inside each block
        let gr = x.createLinearGradient(0, by, 0, by + ch);
        gr.addColorStop(0, 'rgba(255,252,240,0.16)');
        gr.addColorStop(0.35, 'rgba(255,252,240,0.02)');
        gr.addColorStop(1, 'rgba(40,34,24,0.14)');
        x.fillStyle = gr; x.fillRect(bx + mw / 2, by + mw / 2, cw - mw, ch - mw);
        // chisel speckle inside block
        for (let k = 0; k < 42; k++) {
          const px = bx + mw + R() * (cw - mw * 2), py = by + mw + R() * (ch - mw * 2);
          const a = R() * 0.12;
          x.fillStyle = R() > 0.5 ? `rgba(255,250,238,${a})` : `rgba(70,60,44,${a})`;
          x.fillRect(px, py, R() * 3 + 1, R() * 2 + 1);
        }
        // occasional weather stain
        if (R() > 0.86) {
          x.fillStyle = `rgba(120,110,86,${0.06 + R() * 0.1})`;
          x.beginPath();
          x.ellipse(bx + cw / 2, by + ch * (0.3 + R() * 0.5), cw * 0.4, ch * 0.3, 0, 0, 7);
          x.fill();
        }
        // bump + roughness per block
        const bv = 150 + j * 1.6 + (R() - 0.5) * 30;
        xb.fillStyle = `rgb(${bv | 0},${bv | 0},${bv | 0})`;
        xb.fillRect(bx + mw / 2, by + mw / 2, cw - mw, ch - mw);
        const rv = 205 + (R() - 0.5) * 55;
        xr.fillStyle = `rgb(${rv | 0},${rv | 0},${rv | 0})`;
        xr.fillRect(bx + mw / 2, by + mw / 2, cw - mw, ch - mw);
      }
    }
    // large-scale grime over everything
    for (let i = 0; i < 26; i++) {
      const gx = R() * S, gy = R() * S, gr = 60 + R() * 220;
      const g3 = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g3.addColorStop(0, `rgba(88,80,62,${0.05 + R() * 0.07})`);
      g3.addColorStop(1, 'rgba(88,80,62,0)');
      x.fillStyle = g3; x.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    speckle(x, S, 5200, 0.1, true, R);
    speckle(x, S, 3800, 0.1, false, R);
    return { map: c, bump: cb, rough: cr };
  }

  /* -------- timber -------- */
  function timberTex(seed, plankGap) {
    const S = 512, R = rnd(seed || 11);
    const [c, x] = cnv(S);
    x.fillStyle = '#7a5c3b'; x.fillRect(0, 0, S, S);
    const planks = plankGap ? 6 : 0;
    for (let i = 0; i < 260; i++) {
      const y = R() * S, len = 80 + R() * 420, x0 = R() * S;
      x.strokeStyle = R() > 0.5 ? `rgba(58,40,22,${0.1 + R() * 0.22})` : `rgba(196,164,116,${0.06 + R() * 0.16})`;
      x.lineWidth = 0.6 + R() * 1.7;
      x.beginPath();
      x.moveTo(x0, y);
      x.bezierCurveTo(x0 + len * 0.3, y + (R() - 0.5) * 7, x0 + len * 0.7, y + (R() - 0.5) * 7, x0 + len, y + (R() - 0.5) * 3);
      x.stroke();
    }
    // knots
    for (let i = 0; i < 7; i++) {
      const kx = R() * S, ky = R() * S, kr = 4 + R() * 9;
      const g = x.createRadialGradient(kx, ky, 1, kx, ky, kr);
      g.addColorStop(0, 'rgba(48,30,16,0.95)');
      g.addColorStop(0.5, 'rgba(90,62,34,0.6)');
      g.addColorStop(1, 'rgba(90,62,34,0)');
      x.fillStyle = g; x.beginPath(); x.arc(kx, ky, kr, 0, 7); x.fill();
    }
    if (plankGap) {
      for (let p = 1; p < planks; p++) {
        const y = (p / planks) * S;
        x.fillStyle = 'rgba(30,20,10,0.85)'; x.fillRect(0, y - 2, S, 4);
        x.fillStyle = 'rgba(220,196,150,0.25)'; x.fillRect(0, y + 2, S, 1.5);
      }
    }
    speckle(x, S, 1600, 0.09, true, R);
    return c;
  }

  /* -------- thatch: bundled straw roof -------- */
  function thatchTex() {
    const S = 512, R = rnd(211);
    const [c, x] = cnv(S);
    x.fillStyle = '#8d7a44'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) {
      const px = R() * S, py = R() * S, len = 8 + R() * 30;
      const dark = R() < 0.45;
      x.strokeStyle = dark
        ? 'rgba(88,72,36,' + (0.2 + R() * 0.35).toFixed(2) + ')'
        : 'rgba(' + (196 + R() * 46 | 0) + ',' + (176 + R() * 40 | 0) + ',' + (106 + R() * 36 | 0) + ',' + (0.16 + R() * 0.34).toFixed(2) + ')';
      x.lineWidth = 1 + R() * 1.8;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (R() - 0.5) * 7, py + len);
      x.stroke();
    }
    /* layered courses: shadow line with lit highlight above each course */
    for (let b = 0; b < 10; b++) {
      const y = (b + R() * 0.5) * S / 10;
      x.fillStyle = 'rgba(56,44,22,0.30)';
      x.fillRect(0, y, S, 4 + R() * 4);
      x.fillStyle = 'rgba(214,194,134,0.22)';
      x.fillRect(0, y - 2 - R() * 2, S, 2);
    }
    return c;
  }

  /* -------- ground: construction yard -------- */
  function yardTex() {
    const S = 1024, R = rnd(23);
    const [c, x] = cnv(S);
    x.fillStyle = '#6b5f4a'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
      const px = R() * S, py = R() * S, pr = 30 + R() * 160;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      const t = R();
      const col = t > 0.5 ? '104,92,70' : '84,76,58';
      g.addColorStop(0, `rgba(${col},${0.16 + R() * 0.2})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    // cart ruts running west→east (texture v runs along one axis)
    x.strokeStyle = 'rgba(66,58,44,0.5)';
    for (const rut of [0.46, 0.52]) {
      x.lineWidth = 7;
      x.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const px = t * S;
        const py = (rut + Math.sin(t * 7.2) * 0.03) * S;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
      x.strokeStyle = 'rgba(150,138,110,0.28)';
      x.lineWidth = 2; x.stroke();
      x.strokeStyle = 'rgba(66,58,44,0.5)';
    }
    // scattered chips, straw
    for (let i = 0; i < 3200; i++) {
      const px = R() * S, py = R() * S;
      x.fillStyle = R() > 0.62 ? `rgba(196,186,160,${0.12 + R() * 0.3})` : `rgba(52,46,34,${0.1 + R() * 0.25})`;
      x.fillRect(px, py, R() * 3.4 + 0.8, R() * 2.6 + 0.8);
    }
    for (let i = 0; i < 400; i++) {
      const px = R() * S, py = R() * S;
      x.strokeStyle = `rgba(178,156,96,${0.2 + R() * 0.3})`;
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 16, py + (R() - 0.5) * 6); x.stroke();
    }
    return c;
  }

  function grassTex() {
    const S = 1024, R = rnd(41);
    const [c, x] = cnv(S);
    x.fillStyle = '#66703f'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      const px = R() * S, py = R() * S, pr = 40 + R() * 170;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      const col = R() > 0.5 ? '112,120,70' : (R() > 0.4 ? '134,128,78' : '86,96,58');
      g.addColorStop(0, `rgba(${col},${0.2 + R() * 0.25})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    for (let i = 0; i < 6000; i++) {
      const px = R() * S, py = R() * S;
      x.fillStyle = R() > 0.5 ? `rgba(148,158,96,${0.1 + R() * 0.25})` : `rgba(64,70,42,${0.1 + R() * 0.3})`;
      x.fillRect(px, py, 2.4, 2.4);
    }
    return c;
  }

  function cobbleTex() {
    const S = 1024, R = rnd(77);
    const [c, x] = cnv(S);
    x.fillStyle = '#4a453c'; x.fillRect(0, 0, S, S);
    const n = 26, cell = S / n;
    for (let r = 0; r < n; r++) {
      for (let c2 = 0; c2 < n; c2++) {
        const cx = (c2 + 0.5 + (r % 2) * 0.5) * cell, cy = (r + 0.5) * cell;
        const rad = cell * (0.34 + R() * 0.12);
        const v = 118 + (R() - 0.5) * 52;
        x.fillStyle = `rgb(${v | 0},${(v - 6) | 0},${(v - 18) | 0})`;
        x.beginPath();
        x.ellipse(cx + (R() - 0.5) * 4, cy + (R() - 0.5) * 4, rad, rad * (0.8 + R() * 0.2), R() * 3, 0, 7);
        x.fill();
        x.fillStyle = 'rgba(255,250,236,0.12)';
        x.beginPath(); x.ellipse(cx - rad * 0.25, cy - rad * 0.3, rad * 0.5, rad * 0.36, 0, 0, 7); x.fill();
      }
    }
    speckle(x, S, 2600, 0.14, true, R);
    return c;
  }

  function tileTex() {
    const S = 512, R = rnd(91);
    const [c, x] = cnv(S);
    x.fillStyle = '#8a4f33'; x.fillRect(0, 0, S, S);
    const rows = 14, rh = S / rows, cols = 16, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * cw * 0.5;
      for (let c2 = -1; c2 < cols + 1; c2++) {
        const tx = c2 * cw + off, ty = r * rh;
        const v = (R() - 0.5) * 46;
        x.fillStyle = `rgb(${(150 + v) | 0},${(86 + v * 0.6) | 0},${(56 + v * 0.4) | 0})`;
        x.beginPath();
        x.moveTo(tx, ty);
        x.lineTo(tx + cw, ty);
        x.lineTo(tx + cw * 0.92, ty + rh);
        x.quadraticCurveTo(tx + cw * 0.5, ty + rh * 1.28, tx + cw * 0.08, ty + rh);
        x.closePath(); x.fill();
        x.fillStyle = 'rgba(30,18,10,0.4)';
        x.fillRect(tx, ty, cw, 2.4);
      }
    }
    speckle(x, S, 1500, 0.12, true, R);
    return c;
  }

  function leadTex() {
    const S = 512, R = rnd(55);
    const [c, x] = cnv(S);
    x.fillStyle = '#969da6'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const px = R() * S;
      x.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '70,76,84'},${0.05 + R() * 0.09})`;
      x.fillRect(px, 0, 3 + R() * 10, S);
    }
    const seams = 8;
    for (let i = 0; i < seams; i++) {
      const sx = (i / seams) * S;
      x.fillStyle = 'rgba(58,64,72,0.85)'; x.fillRect(sx - 2, 0, 4, S);
      x.fillStyle = 'rgba(240,244,250,0.5)'; x.fillRect(sx + 2, 0, 2, S);
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(70,80,74,${0.05 + R() * 0.1})`;
      x.fillRect(R() * S, R() * S, 20 + R() * 120, 8 + R() * 30);
    }
    return c;
  }

  function plasterTex(halfTimber) {
    const S = 512, R = rnd(halfTimber ? 131 : 101);
    const [c, x] = cnv(S);
    x.fillStyle = '#cfc3a8'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 200; i++) {
      const px = R() * S, py = R() * S, pr = 20 + R() * 90;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(${R() > 0.5 ? '228,220,198' : '176,164,138'},${0.14 + R() * 0.2})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    speckle(x, S, 2400, 0.1, true, R);
    if (halfTimber) {
      x.fillStyle = '#54402c';
      const bw = 26;
      // frame grid
      for (const px of [0, S * 0.5 - bw / 2, S - bw]) x.fillRect(px, 0, bw, S);
      for (const py of [0, S * 0.48, S * 0.96 - bw]) x.fillRect(0, py, S, bw);
      // diagonal braces
      x.save();
      x.translate(S * 0.25, S * 0.24); x.rotate(0.7); x.fillRect(-90, -13, 180, 26); x.restore();
      x.save();
      x.translate(S * 0.75, S * 0.72); x.rotate(-0.7); x.fillRect(-90, -13, 180, 26); x.restore();
      // plank infill lines
      x.strokeStyle = 'rgba(90,74,52,0.5)'; x.lineWidth = 2;
      for (let i = 0; i < 24; i++) { const py = R() * S; x.beginPath(); x.moveTo(0, py); x.lineTo(S, py); x.stroke(); }
    }
    return c;
  }

  function makeMat(c, opts) {
    opts = opts || {};
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 8;
    if (opts.srgb !== false) t.encoding = T.sRGBEncoding;
    const m = new T.MeshStandardMaterial(Object.assign({ map: t, roughness: 0.9, metalness: 0.0 }, opts.mat || {}));
    return m;
  }

  function init() {
    const s1 = stoneTex({ seed: 7, courses: 8, cols: 6, jitter: 16, base: [204, 193, 166] });
    const s2 = stoneTex({ seed: 19, courses: 14, cols: 9, jitter: 10, base: [210, 199, 173] });
    const s3 = stoneTex({ seed: 31, courses: 6, cols: 4, jitter: 22, base: [186, 174, 148], mortar: [118, 108, 92] });

    const bumpOpts = (c, sc) => {
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    };
    M.stone = new T.MeshStandardMaterial({
      map: new ObjectassignTex(s1.map), bumpMap: bumpOpts(s1.bump), bumpScale: 0.5,
      roughnessMap: bumpOpts(s1.rough), roughness: 1.0, metalness: 0.0
    });
    M.ashlar = new T.MeshStandardMaterial({
      map: new ObjectassignTex(s2.map), bumpMap: bumpOpts(s2.bump), bumpScale: 0.4,
      roughnessMap: bumpOpts(s2.rough), roughness: 0.95, metalness: 0.0
    });
    M.rough = new T.MeshStandardMaterial({
      map: new ObjectassignTex(s3.map), bumpMap: bumpOpts(s3.bump), bumpScale: 0.7,
      roughnessMap: bumpOpts(s3.rough), roughness: 1.0, metalness: 0.0
    });

    M.timber = makeMat(timberTex(11, false), { mat: { roughness: 0.82 } });
    M.deck = makeMat(timberTex(23, true), { mat: { roughness: 0.85 } });
    M.rope = new T.MeshStandardMaterial({ color: 0x9a8a66, roughness: 1 });
    M.iron = new T.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.55, metalness: 0.75 });
    M.lead = makeMat(leadTex(), { mat: { roughness: 0.6, metalness: 0.35 } });
    M.tile = makeMat(tileTex(), { mat: { roughness: 0.85 } });
    M.glass = new T.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.28, metalness: 0.15 });
    M.glassBlue = new T.MeshStandardMaterial({ color: 0x24365c, roughness: 0.25, metalness: 0.2 });
    M.yard = makeMat(yardTex(), { mat: { roughness: 1 } });
    M.grass = makeMat(grassTex(), { mat: { roughness: 1 } });
    M.cobble = makeMat(cobbleTex(), { mat: { roughness: 0.92 } });
    M.plaster = makeMat(plasterTex(false), { mat: { roughness: 0.95 } });
    M.frame = makeMat(plasterTex(true), { mat: { roughness: 0.95 } });
    M.mud = makeMat(yardTex(), { mat: { roughness: 1, color: 0xd9c9aa } });   // packed dirt roads / disturbed earth
    M.halfT = M.frame;                                                        // half-timbered town walls
    M.window = M.glass;                                                       // dark town-house glazing / gate passages
    M.thatch = makeMat(thatchTex(), { mat: { roughness: 1 } });
    M.foliage = new T.MeshStandardMaterial({ color: 0x51663a, roughness: 1 });
    M.foliage2 = new T.MeshStandardMaterial({ color: 0x62733f, roughness: 1 });
    M.bark = new T.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    M.earth = new T.MeshStandardMaterial({ color: 0x6a5f49, roughness: 1 });
    M.clothA = new T.MeshStandardMaterial({ color: 0x8c5f3a, roughness: 1 });
    M.clothB = new T.MeshStandardMaterial({ color: 0x51565e, roughness: 1 });
    M.clothC = new T.MeshStandardMaterial({ color: 0x7d7448, roughness: 1 });
    M.skin = new T.MeshStandardMaterial({ color: 0xb98a66, roughness: 0.9 });
    M.snowless = null;
    return M;
  }

  /* tiny wrapper: CanvasTexture with sRGB */
  function ObjectassignTex(c) {
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  return { init: init, get M() { return M; } };
})();
