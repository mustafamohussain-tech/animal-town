// Procedural building generator: floors, walls with windows, door opening, roof, decorations + interiors.
// Every wall side of every floor is its own group, so the camera can "cut away" walls to look inside.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, boxGeo, coneGeo, prism, pick } from './util.js';

const BASALT = '#3b3836', LATTICE = '#8a5a32', BEAM = '#5b3a22';
// Damascus: dark basalt courses in the light stone of the ground floor ("ablaq"), around the door
function ablaqFloor(W, D, openings, back, left, right, front) {
  for (let y = .45; y < FH - .3; y += .85) {
    box(W + .06, .28, .06, BASALT, 0, y, -D / 2 - .01, back);
    box(.06, .28, D, BASALT, -W / 2 - .01, y, 0, left);
    box(.06, .28, D, BASALT, W / 2 + .01, y, 0, right);
    let a = -W / 2;
    for (const op of [...openings].sort((p, q) => p.c - q.c)) {
      if (y > op.h + .1) continue;
      const o0 = op.c - op.w / 2 - .3;
      if (o0 > a) box(o0 - a, .28, .06, BASALT, (a + o0) / 2, y, D / 2 + .01, front);
      a = op.c + op.w / 2 + .3;
    }
    if (a < W / 2) box(W / 2 - a, .28, .06, BASALT, (a + W / 2) / 2, y, D / 2 + .01, front);
  }
}
// a wooden mashrabiya: a closed bay with a carved lattice hanging out over the lane, on brackets
function mashrabiya(front, W, D) {
  const mw = Math.min(W * .45, 4.4), z = D / 2 + .55;
  box(mw + .2, .2, 1.2, BEAM, 0, .62, z, front);
  box(mw + .5, .22, 1.45, BEAM, 0, 3.52, z, front);
  box(mw - .1, 2.6, .05, '#2a1c12', 0, 2.05, z + .5, front);
  for (const s of [-1, 1]) box(.05, 2.6, 1.0, '#2a1c12', s * (mw / 2 - .05), 2.05, z, front);
  for (let x = -mw / 2 + .15; x < mw / 2; x += .24) box(.06, 2.6, .08, LATTICE, x, 2.05, z + .55, front);
  for (let y = .9; y < 3.4; y += .32) box(mw, .05, .08, LATTICE, 0, y, z + .56, front);
  for (const s of [-1, 1]) for (let zz = -.35; zz < .5; zz += .25) box(.08, 2.6, .06, LATTICE, s * mw / 2, 2.05, z + zz, front);
  for (const x of [-mw / 2 + .3, 0, mw / 2 - .3]) box(.16, 1.1, .16, BEAM, x, .2, z - .05, front).rotation.x = .7;
}
// a wooden pergola with a grapevine on the roof
function pergola(roof, W, D) {
  const pw = Math.min(W * .45, 4.5), pd = Math.min(D * .5, 4.5), px = -W / 4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(.08, .08, 2.5, BEAM, px + sx * pw / 2, 1.5, sz * pd / 2, roof, 6);
  for (let k = 0; k < 6; k++) box(pw + .3, .1, .1, BEAM, px, 2.75, -pd / 2 + k * pd / 5, roof);
  for (let k = 0; k < 16; k++) ball(.42, k % 3 ? '#4f9a45' : '#5cae4c', px + (Math.random() - .5) * pw, 2.9, (Math.random() - .5) * pd, roof);
  for (let k = 0; k < 8; k++) ball(.13, '#5b2a6e', px + (Math.random() - .5) * pw * .8, 2.5, (Math.random() - .5) * pd * .8, roof);
}
import { NIGHT, addGlow } from './daynight.js';
import { ROOMS, F } from './interiors.js';

export const FH = 4.2;   // floor height (a character is ~2.6 tall)
export const T = .3;     // wall thickness

const winMat = () => { const r = Math.random(); return r < .6 ? NIGHT.winLit : r < .85 ? NIGHT.winLit2 : NIGHT.winDark; };
const WIN = {
  square: { w: 1.4, h: 1.5, y: 2.2 },
  tall: { w: 1.1, h: 2.4, y: 2.3 },
  wide: { w: 2.4, h: 1.5, y: 2.2 },
  band: { w: 0, h: 1.5, y: 2.3 },
  arch: { w: 1.2, h: 2.2, y: 2.25, arch: true },
};

function windowPane(p, x, y, z, w, h, alongX, frame) {
  const g = winMat();
  if (alongX) { mesh(boxGeo(w, h, T + .08), g, x, y, z, p); box(w + .24, h + .24, T + .04, frame, x, y, z, p); }
  else { mesh(boxGeo(T + .08, h, w), g, x, y, z, p); box(T + .04, h + .24, w + .24, frame, x, y, z, p); }
}

// windows along a wall of length L; skip spots that hit an opening (door / garage)
function windowsAlong(p, L, place, style, frame, openings = []) {
  const s = WIN[style] || WIN.square;
  if (style === 'band') {
    const segs = [];
    let a = -L / 2 + .8;
    const ops = openings.map(o => [o.c - o.w / 2 - .5, o.c + o.w / 2 + .5]).sort((x, y) => x[0] - y[0]);
    for (const [o0, o1] of ops) { if (o0 > a + 1) segs.push([a, o0]); a = Math.max(a, o1); }
    if (L / 2 - .8 > a + 1) segs.push([a, L / 2 - .8]);
    for (const [s0, s1] of segs) {
      place((s0 + s1) / 2, s.y, s1 - s0, s.h);
      for (let m = s0 + 2; m < s1 - .5; m += 2) place(m, s.y, .12, s.h + .1, true);
    }
    return;
  }
  const gap = s.w + 1.6, n = Math.max(1, Math.floor((L - 1.4) / gap));
  for (let i = 0; i < n; i++) {
    const c = -((n - 1) * gap) / 2 + i * gap;
    if (openings.some(o => Math.abs(c - o.c) < o.w / 2 + s.w / 2 + .35)) continue;
    place(c, s.y, s.w, s.h);
    if (s.arch) place(c, s.y + s.h / 2 + .1, s.w * .7, .35);
  }
}

// b = Building (gives piece(), spot storage, blocks, lights); spec = design; o = {ox, oz} offset inside the lot
export function buildShell(b, spec, W, D, o = {}) {
  const ox = o.ox || 0, oz = o.oz || 0;
  const floors = Math.max(1, spec.floors | 0);
  const wallC = spec.wall, wall = wallC, trim = spec.trim || '#ffffff';
  const role = spec.role || 'office';
  const stairs = floors > 1;

  const base = b.base();
  box(W + .6, .14, D + .6, '#c8c0b2', ox, .07, oz, base);

  // openings in the ground-floor front wall
  const openings = spec.garage
    ? [{ c: -W / 4, w: Math.min(W / 2 - 1.2, 8), h: 3.7 }, { c: W / 4, w: 2.6, h: 3.3 }]
    : [{ c: 0, w: 2.6, h: 3.3 }];
  b.doorX = spec.garage ? W / 4 : 0;

  b.floorGroups = [];
  for (let k = 0; k < floors; k++) {
    const yb = k * FH;
    const fg = { walls: {}, all: [] };
    const piece = (name) => { const g = b.piece(ox, oz, yb); fg.all.push(g); if (name) fg.walls[name] = g; return g; };

    const slab = piece();
    if (k === 0) box(W, .12, D, '#d9cbb5', 0, .06, 0, slab);
    else box(W - .1, .24, D - .1, '#cbbfae', 0, -.12, 0, slab);

    // walls (each side separately)
    const back = piece('back'), left = piece('left'), right = piece('right'), front = piece('front');
    const wall = k === 0 && spec.stone ? spec.stone : wallC;   // a stone ground floor under plaster (Damascus)
    box(W, FH, T, wall, 0, FH / 2, -D / 2 + T / 2, back);
    box(T, FH, D - 2 * T, wall, -W / 2 + T / 2, FH / 2, 0, left);
    box(T, FH, D - 2 * T, wall, W / 2 - T / 2, FH / 2, 0, right);
    const fz = D / 2 - T / 2;
    if (k === 0) {
      let a = -W / 2;
      for (const op of [...openings].sort((x, y) => x.c - y.c)) {
        const o0 = op.c - op.w / 2, o1 = op.c + op.w / 2;
        if (o0 > a) box(o0 - a, FH, T, wall, (a + o0) / 2, FH / 2, fz, front);
        box(op.w, FH - op.h, T, wall, op.c, op.h + (FH - op.h) / 2, fz, front);
        for (const s of [-1, 1]) box(.22, op.h, T + .12, trim, op.c + s * (op.w / 2 + .05), op.h / 2, fz, front);
        box(op.w + .5, .22, T + .12, trim, op.c, op.h + .05, fz, front);
        a = o1;
      }
      if (a < W / 2) box(W / 2 - a, FH, T, wall, (a + W / 2) / 2, FH / 2, fz, front);
      b.wallRects.push(...wallRects(W, D, openings, ox, oz));
    } else box(W, FH, T, wall, 0, FH / 2, fz, front);
    if (spec.ablaq && k === 0) ablaqFloor(W, D, openings, back, left, right, front);
    if (spec.mashrabiya && k > 0) mashrabiya(front, W, D);

    // windows
    const frame = spec.winFrame || trim;
    windowsAlong(front, W, (x, y, w, h) => windowPane(front, x, y, fz, w, h, true, frame), spec.window, frame, k === 0 ? openings : []);
    windowsAlong(back, W, (x, y, w, h) => windowPane(back, x, y, -D / 2 + T / 2, w, h, true, frame), spec.window, frame, stairs ? [{ c: -W / 2 + 1.3, w: 1.6 }] : []);
    windowsAlong(left, D - 1, (z, y, w, h) => windowPane(left, -W / 2 + T / 2, y, -z, w, h, false, frame), spec.window, frame);
    windowsAlong(right, D - 1, (z, y, w, h) => windowPane(right, W / 2 - T / 2, y, z, w, h, false, frame), spec.window, frame);

    // stripe between floors
    if (spec.band) {
      box(W + .08, .3, .12, spec.band, 0, FH - .15, D / 2 + .02, front);
      box(W + .08, .3, .12, spec.band, 0, FH - .15, -D / 2 - .02, back);
      box(.12, .3, D, spec.band, -W / 2 - .02, FH - .15, 0, left);
      box(.12, .3, D, spec.band, W / 2 + .02, FH - .15, 0, right);
    }
    // balconies on upper floors
    if (spec.balcony && k > 0) {
      const xs = W > 14 ? [-W / 4, W / 4] : (role === 'apartment' ? [-W / 4, W / 4] : [0]);
      for (const x of xs) {
        const bw = Math.min(W * .4, 4.2);
        box(bw, .2, 1.4, trim, x, .1, D / 2 + .7, front);
        box(bw, .9, .08, trim, x, .65, D / 2 + 1.36, front);
        for (const s of [-1, 1]) box(.08, .9, 1.4, trim, x + s * bw / 2, .65, D / 2 + .7, front);
      }
    }
    // ground-floor extras
    if (k === 0) {
      if (spec.columns) {
        for (const s of [-1, 1]) cyl(.28, .32, FH - .2, trim, b.doorX + s * 2.1, (FH - .2) / 2, D / 2 + 1.4, front, 12);
        box(5.2, .3, 2, trim, b.doorX, FH - .1, D / 2 + .95, front);
      }
      if (spec.awning) {
        const n = 8, aw = Math.min(W * .85, 9) / n;
        // under the sign (never over it), still above people's heads
        for (let i = 0; i < n; i++) box(aw, .06, 1.6, i % 2 ? '#ffffff' : spec.awning, -aw * n / 2 + aw * (i + .5), 3.0, D / 2 + .75, front).rotation.x = .38;
      }
      if (spec.sign !== false) {
        const sw = Math.min(W * .55, 6), sx = b.doorX;
        box(sw + .2, 1.0, .12, '#ffffff', sx, 3.8, D / 2 + .1, front);
        b.sign(front, sx, 3.8, D / 2 + .17, sw, .85);
      }
      for (const op of openings) addGlow(front, op.c, 3.5, D / 2 + .6, 1.6, 6);
      for (const x of [-W / 2 + .6, W / 2 - .6]) {
        if (Math.abs(x - b.doorX) < 2) continue;
        F.plant(front, x, D / 2 + .7);
      }
    }
    if (spec.cross && k === Math.min(1, floors - 1)) {
      const cy = k === 0 ? 3.0 : FH / 2 + .2, cx = k === 0 ? -W / 4 : 0;
      box(1.4, .45, .1, '#e74c3c', cx, cy, D / 2 + .08, front);
      box(.45, 1.4, .1, '#e74c3c', cx, cy, D / 2 + .08, front);
    }
    if (spec.clock && k === floors - 1 && floors > 1) {
      cyl(.7, .7, .1, '#ffffff', 0, FH / 2, D / 2 + .08, front, 24).rotation.x = Math.PI / 2;
      box(.06, .5, .04, '#222222', 0, FH / 2 + .2, D / 2 + .16, front);
      box(.38, .06, .04, '#222222', .16, FH / 2, D / 2 + .16, front);
    }

    // interior
    const inner = piece();
    inner.userData.interior = true;
    const x0 = -W / 2 + T + .15, x1 = W / 2 - T - .15, z0 = -D / 2 + T + .15, z1 = D / 2 - T - .15;
    const hasStairs = stairs && k < floors - 1;
    const R = {
      g: inner, W, D, k, floors, FH, x0, x1, z0, z1,
      xs: stairs ? x0 + 2.0 : x0, zs: stairs ? z0 + 5 : z0,
      spot: (kind, x, z, face, pose = 'stand', dy = 0) => (b.spots[kind] ||= []).push([x + ox, z + oz, face, pose, yb + dy, k]),
      block: (a, c, d, e) => { if (k === 0) b.blocks.push([a + ox, c + oz, d + ox, e + oz]); },
      blockBox(x, z, w, d, rot = 0) { if (Math.abs(Math.sin(rot)) > .5) [w, d] = [d, w]; R.block(x - w / 2, z - d / 2, x + w / 2, z + d / 2); },
      light: (x, z) => { F.ceiling(inner, x, FH - .15, z); b.lightSpots.push([x + ox, yb + FH - .6, z + oz]); },
    };
    if (hasStairs) {
      F.stairs(inner, x0 + .85, z0 + 2.2, 1.5, 4.2, FH);
      if (k === 0) { R.block(x0 - .3, z0 - .3, x0 + 1.75, z0 + 4.5); b.stairSpot = [x0 + .85 + ox, z0 + 5 + oz]; }
    }
    (ROOMS[role] || ROOMS.office)(R, spec.variant);
    if (!b.lightSpots.some(l => Math.abs(l[1] - (yb + FH - .6)) < .1)) R.light(0, (z0 + z1) / 2);

    b.floorGroups.push(fg);
  }

  // roof
  const top = floors * FH;
  const roof = b.piece(ox, oz, top);
  b.roofGroups.push(roof);
  const rc = spec.roofColor || '#4a4f5a';
  const rh = Math.min(W, D) * .32;
  if (spec.roof === 'gable') {
    box(W + .2, .2, D + .2, rc, 0, .1, 0, roof);
    mesh(prism(W + .8, rh, D + .8), rc, 0, .1, 0, roof);
  } else if (spec.roof === 'hip') {
    box(W + .2, .2, D + .2, rc, 0, .1, 0, roof);
    const hip = mesh(coneGeo(.7072, 1, 4), rc, 0, .1 + rh / 2, 0, roof);
    hip.rotation.y = Math.PI / 4;
    hip.scale.set((W + .8), rh, (D + .8));
  } else {
    box(W + .3, .3, D + .3, rc, 0, .15, 0, roof);
    for (const [w, d, x, z] of [[W + .3, .2, 0, D / 2 + .05], [W + .3, .2, 0, -D / 2 - .05], [.2, D + .3, W / 2 + .05, 0], [.2, D + .3, -W / 2 - .05, 0]]) box(w, .7, d, spec.parapet || trim, x, .55, z, roof);
    if (spec.pergola) pergola(roof, W, D);
    if (spec.roof === 'dome') ball(Math.min(W, D) * .3, spec.domeColor || '#d4a017', 0, .3, 0, roof).scale.y = .8;
    if (role === 'apartment' || role === 'office') { box(1.6, 1.2, 1.6, '#9aa3ad', W / 4, .9, -D / 4, roof); cyl(.6, .6, 1.2, '#b0b8c1', -W / 4, .9, -D / 4, roof, 12); }
    if (spec.cross) { box(3, .05, .9, '#e74c3c', 0, .33, 0, roof); box(.9, .05, 3, '#e74c3c', 0, .33, 0, roof); }
  }
  if (spec.chimney) box(.8, rh + .6, .8, '#a35d3d', W * .25, (rh + .6) / 2, -D * .18, roof);
  if (spec.bell) {
    const by = spec.roof === 'gable' ? rh * .8 : .3;
    box(1.4, 1.4, 1.4, wall, 0, by + .7, 0, roof);
    mesh(coneGeo(1.2, 1, 4), rc, 0, by + 1.9, 0, roof).rotation.y = Math.PI / 4;
    ball(.32, '#d4a017', 0, by + .7, .65, roof);
  }
  if (spec.sirens) {
    box(1.8, .2, .5, '#222222', 0, .4, D / 4, roof);
    b.lights = ['#ff2a2a', '#2a6bff'].map((c, k) => {
      const m = new THREE.Mesh(sphere(.28), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .2 }));
      m.position.set(k ? .55 : -.55, .7, D / 4);
      m.userData.keep = true;
      roof.add(m);
      return m;
    });
  }
  if (spec.tower) {
    const tw = b.piece(ox + W / 2 - 1.6, oz - D / 2 + 1.6, 0);
    b.roofGroups.push(tw);
    box(2.6, top + 5, 2.6, wall, 0, (top + 5) / 2, 0, tw);
    box(3, .3, 3, rc, 0, top + 5.1, 0, tw);
    windowPane(tw, 0, top + 3.5, 1.3, 1, 1.4, true, trim);
  }
  b.roofTop = top + (spec.roof === 'gable' || spec.roof === 'hip' ? rh : .8);
}

// wall rectangles of the ground floor for path finding (door/garage openings stay open)
function wallRects(W, D, openings, ox, oz) {
  const e = .25, r = [];
  r.push([-W / 2 - e, -D / 2 - e, W / 2 + e, -D / 2 + T + e]);
  r.push([-W / 2 - e, -D / 2 - e, -W / 2 + T + e, D / 2 + e]);
  r.push([W / 2 - T - e, -D / 2 - e, W / 2 + e, D / 2 + e]);
  let a = -W / 2;
  for (const op of [...openings].sort((x, y) => x.c - y.c)) {
    const o0 = op.c - op.w / 2;
    if (o0 > a) r.push([a - e, D / 2 - T - e, o0 + e, D / 2 + e]);
    a = op.c + op.w / 2;
  }
  if (a < W / 2) r.push([a - e, D / 2 - T - e, W / 2 + e, D / 2 + e]);
  return r.map(([x0, z0, x1, z1]) => [x0 + ox, z0 + oz, x1 + ox, z1 + oz]);
}
