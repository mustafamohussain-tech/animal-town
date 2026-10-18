// Rivers and lakes. Drawn with points like a curved road: a river follows its points, a lake is a closed shape.
// Moving water, sandy banks, reeds, rocks, lily pads, a wooden pier, a rowing boat, ducks and jumping fish.
// People can't walk on water (roads drawn across become bridges); they fish from the bank and swim in lakes.
import * as THREE from 'three';
import { TILE, NO_WALK } from './path.js';
import { tileOf } from './tiles.js';
import { sampleCurve } from './curves.js';
import { box, cyl, mesh, sphere, mergeStatic, shadows, rand, pick } from './util.js';

export const WATER_Y = .05;
const SAND_Y = .025;
export const RIVER_W = { small: 6, medium: 10, wide: 16 };
const BEACH = 4.2;   // the sandy beach around a lake: wide enough to stroll round it and put benches on
const BANK = 2.6;    // the sandy bank along a river
const WUV = .08;     // water texture scale, in world space: where two waters meet they look like one

// one ripple picture, used by two textures that move differently (lake drift, river flow)
let rippleCanvas = null;
function rippleTexture() {
  if (!rippleCanvas) {
    const c = rippleCanvas = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#46abd9';   // one even colour, so the picture repeats without visible squares
    x.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 260; k++) {
      const px = Math.random() * 256, py = Math.random() * 256, w = 6 + Math.random() * 22;
      x.strokeStyle = `rgba(255,255,255,${.08 + Math.random() * .2})`;
      x.lineWidth = 1 + Math.random() * 1.6;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + w / 2, py - 2 - Math.random() * 3, px + w, py);
      for (const dx of [-256, 256]) { x.moveTo(px + dx, py); x.quadraticCurveTo(px + dx + w / 2, py - 3, px + dx + w, py); }
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(rippleCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// one moving texture for all water (lakes and rivers join without a seam)
const TEX = { lake: rippleTexture() };
TEX.river = TEX.lake;
// layers: land (pushed back most) < sand < water < roads
// solid (not see-through): where two rivers or a river and a lake overlap it looks like one water surface
const waterMat = tex => new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: .12, metalness: .08,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const MAT = {
  lake: waterMat(TEX.lake),
  river: waterMat(TEX.river),
  sand: new THREE.MeshStandardMaterial({ color: '#e3d09c', roughness: 1, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2 }),
};

// ---------- shapes ----------
function lakeOutline(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z)), true, 'centripetal');
  const n = Math.max(40, Math.min(160, Math.ceil(curve.getLength() / 1.6)));
  const poly = curve.getSpacedPoints(n).slice(0, n).map(v => ({ x: v.x, z: v.z }));
  // outward normals (checked at the right-most point)
  const nrm = poly.map((p, k) => {
    const a = poly[(k - 1 + n) % n], b = poly[(k + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: dz / l, z: -dx / l };
  });
  let r = 0;
  poly.forEach((p, k) => { if (p.x > poly[r].x) r = k; });
  if (nrm[r].x < 0) nrm.forEach(v => { v.x = -v.x; v.z = -v.z; });
  const c = poly.reduce((s, p) => ({ x: s.x + p.x / n, z: s.z + p.z / n }), { x: 0, z: 0 });
  return { poly, nrm, c };
}
function flatShape(poly, y, material, uvScale) {
  const sh = new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ShapeGeometry(sh, 2);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * uvScale, uv.getY(k) * uvScale);
  const m = new THREE.Mesh(g, material);
  m.userData.ownGeo = true;
  m.receiveShadow = true;
  return m;
}
// river points with their corners rounded off (the ends stay where they were)
export function roundCorners(pts, it = 3) {
  let p = pts;
  for (let n = 0; n < it && p.length > 2; n++) {
    const out = [p[0]];
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k], b = p[k + 1];
      if (k > 0) out.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 });
      if (k < p.length - 2) out.push({ x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
// a band along the curve from offset a to b (numbers, or functions of the sample index for a band
// that gets wider, like a river mouth); world = texture laid in world space (water)
function strip(S, a, b, y, material, vScale, world = false) {
  const pos = [], uv = [], idx = [];
  const A = typeof a === 'function' ? a : () => a, B = typeof b === 'function' ? b : () => b;
  S.forEach((s, k) => {
    // in a tight bend the inner edge is pulled in so the band never folds over itself
    let ia = A(k), ib = B(k);
    const p0 = S[k - 1] || s, p1 = S[k + 1] || s;
    const dtx = (p1.tx ?? 0) - (p0.tx ?? 0), dtz = (p1.tz ?? 0) - (p0.tz ?? 0), turn = Math.hypot(dtx, dtz);
    if (turn > 1e-4) {
      const R = Math.hypot(p1.x - p0.x, p1.z - p0.z) / turn, toward = dtx * s.nx + dtz * s.nz;
      if (toward > 0) ib = Math.min(ib, R * .85); else ia = Math.max(ia, -R * .85);
    }
    const ax = s.x + s.nx * ia, az = s.z + s.nz * ia, bx = s.x + s.nx * ib, bz = s.z + s.nz * ib;
    pos.push(ax, y, az, bx, y, bz);
    if (world) uv.push(ax * WUV, -az * WUV, bx * WUV, -bz * WUV);
    else uv.push(0, s.d * vScale, 1, s.d * vScale);
  });
  for (let k = 0; k < S.length - 1; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, material);
  m.userData.ownGeo = true;
  m.receiveShadow = true;
  return m;
}
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - a.x - dx * u, pz - a.z - dz * u);
}

// a circle of water in world-space texture (the round end of a river where it joins other water)
function waterDisc(x, y, z, r) {
  const geo = new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2).translate(x, y, z);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) * WUV, -p.getZ(k) * WUV);
  const m = new THREE.Mesh(geo, MAT.river);
  m.userData.ownGeo = true;
  return m;
}
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function edgeDist(poly, x, z) {
  let d = Infinity;
  for (let k = 0; k < poly.length; k++) d = Math.min(d, segDist(x, z, poly[k], poly[(k + 1) % poly.length]));
  return d;
}
// a loop of points part way (u) from the shore to the middle, always in the water and away from the
// shore and the pier, so ducks, boats and swimmers each have their own lane and never go on land
function ring(poly, c, u, avoid = null, minEdge = 2) {
  const ok = (x, z) => inPoly(poly, x, z) && edgeDist(poly, x, z) > minEdge && !(avoid && segDist(x, z, avoid[0], avoid[1]) < 3);
  let out = [];
  for (let k = 0; k < poly.length; k += 2) {
    for (let uu = u; uu <= .9; uu += .06) {
      const x = poly[k].x + (c.x - poly[k].x) * uu, z = poly[k].z + (c.z - poly[k].z) * uu;
      if (ok(x, z)) { out.push({ x, z }); break; }
    }
  }
  // drop points whose way to the next one would cross land
  for (let pass = 0; pass < 3; pass++) {
    out = out.filter((p, i) => {
      const q = out[(i + 1) % out.length];
      for (let s = .25; s < 1; s += .25) if (!inPoly(poly, p.x + (q.x - p.x) * s, p.z + (q.z - p.z) * s)) return false;
      return true;
    });
  }
  return out.length >= 3 ? out : [{ x: c.x, z: c.z }, { x: c.x + .5, z: c.z }, { x: c.x, z: c.z + .5 }];
}

// ---------- little things around the water ----------
function reeds(g, x, z) {
  for (let k = 0; k < 5; k++) {
    const h = rand(.9, 1.9);
    const r = cyl(.04, .06, h, pick(['#5f8f3a', '#6e9e45', '#7c8f3a']), x + rand(-.5, .5), h / 2, z + rand(-.5, .5), g, 5);
    r.rotation.set(rand(-.2, .2), 0, rand(-.2, .2));
    if (Math.random() < .5) cyl(.09, .09, .35, '#7a4a2a', r.position.x, h - .1, r.position.z, g, 6);
  }
}
function rock(g, x, z, s = 1) {
  const m = mesh(new THREE.DodecahedronGeometry(rand(.3, .65) * s, 0), pick(['#9aa0a6', '#8a8f96', '#a9a39a']), x, .15, z, g);
  m.rotation.set(rand(0, 3), rand(0, 3), 0);
  m.scale.y = .6;
}
function lily(g, x, z) {
  const r = rand(.35, .7);
  cyl(r, r, .03, '#4f9a3c', x, WATER_Y + .02, z, g, 10);
  if (Math.random() < .3) mesh(sphere(.14), pick(['#ff9ec7', '#ffffff', '#ffd1e3']), x + r * .3, WATER_Y + .12, z, g);
}
function makeDuck() {
  const d = new THREE.Group();
  const white = Math.random() < .5;
  mesh(sphere(.32), white ? '#f4f4f0' : '#8a6a4a', 0, .18, 0, d).scale.set(1, .8, 1.35);
  mesh(sphere(.2), white ? '#f4f4f0' : '#2f6b3a', 0, .48, .3, d);
  box(.12, .06, .2, '#f2a22c', 0, .45, .52, d);
  for (const s of [-1, 1]) mesh(sphere(.035), '#111111', s * .1, .53, .44, d);
  mergeStatic(d);
  return d;
}
function makeBoat() {
  const b = new THREE.Group();
  box(1.3, .45, 3, '#8a5a32', 0, .2, 0, b);
  box(1.05, .1, 2.6, '#6e4526', 0, .44, 0, b);
  box(1.3, .12, .3, '#a8743f', 0, .5, .2, b);
  for (const s of [-1, 1]) { const o = box(.07, .07, 2.2, '#c9a27a', s * .8, .5, .2, b); o.rotation.z = s * .5; }
  mergeStatic(b);
  shadows(b);
  return b;
}
// a rowing boat with two oars, for a resident to ride
export function makeRideBoat() {
  const b = makeBoat();
  b.userData.oars = [-1, 1].map(s => {
    const pivot = new THREE.Group();
    pivot.position.set(s * .7, .55, .1);
    const o = box(.07, .07, 2, '#c9a27a', s * .55, 0, 0, pivot);
    o.rotation.z = s * .45;
    box(.05, .3, .5, '#a8743f', s * 1.25, -.35, 0, pivot);
    b.add(pivot);
    return pivot;
  });
  return b;
}
function makePier(g, from, dir, len) {
  const ang = Math.atan2(dir.x, dir.z);
  const p = new THREE.Group();
  p.position.set(from.x, 0, from.z);
  p.rotation.y = ang;
  for (let k = 0; k < len; k += .55) box(2.2, .1, .45, k % 1.1 < .5 ? '#a8743f' : '#9a6838', 0, .42, k, p);
  for (let k = 1; k < len; k += 2.2) for (const s of [-1, 1]) cyl(.1, .1, 1.2, '#6e4526', s * 1, .1, k, p, 6);
  p.userData.pier = true;
  g.add(p);
}

export class Water {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
    this.dirty = false;
    this.wetCache = new Map();
    this.splashT = 0;
  }

  add(d, o = {}) {
    if (!d.pts || d.pts.length < (d.kind === 'lake' ? 3 : 2)) return null;
    const w = { id: o.id ?? this.nextId++, kind: d.kind, pts: d.pts.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })), width: d.width || RIVER_W.medium };
    this.nextId = Math.max(this.nextId, w.id + 1);
    this.build(w);
    this.game.scene.add(w.group);
    this.list.push(w);
    this.changed(w);
    this.touching(w).forEach(o => (this.rebuildSet ||= new Set()).add(o));   // their reeds at the joint go away; a river mouth opens up
    // trees and street objects that ended up in the water go away
    for (const p of [...this.game.props.list]) if (p.type !== 'busstop' && this.wetIn(w, p.x, p.z, 1)) this.game.props.remove(p);
    // a new lake gets benches around its beach (a lake from a saved town already has them)
    if (w.kind === 'lake' && o.id == null && !this.game.loading) this.plantBenches(w);
    return w;
  }
  // benches on the beach, facing the water, all the way round
  plantBenches(w) {
    const g = this.game, P = g.props, T = g.tiles, n = w.poly.length;
    let last = -1e9, run = 0;
    for (let k = 0; k < n; k++) {
      const a = w.poly[k], b = w.poly[(k + 1) % n];
      run += Math.hypot(b.x - a.x, b.z - a.z);
      if (run - last < 15) continue;
      const q = w.nrm[k], x = a.x + q.x * 3, z = a.z + q.z * 3;
      if (T.isRoadish(tileOf(x), tileOf(z)) || T.hasBuilding(tileOf(x), tileOf(z))) continue;
      if (this.list.some(o => o !== w && this.wetIn(o, x, z, 2.5)) || this.wetIn(w, x, z, 1.5)) continue;
      if (P.nearest(x, z, 3)) continue;
      if (P.add('bench', x, z, Math.atan2(-q.x, -q.z))) last = run;
    }
  }
  // older lakes without benches get them (once)
  ensureBenches() {
    for (const w of this.list) {
      if (w.kind !== 'lake') continue;
      const has = this.game.props.list.some(p => p.type === 'bench' && !this.wetIn(w, p.x, p.z) && this.wetIn(w, p.x, p.z, BEACH + 1));
      if (!has) this.plantBenches(w);
    }
  }
  // the beach / bank: people walk here (and on the pier)
  onBeach(w, x, z) {
    if (w.pierSeg && segDist(x, z, w.pierSeg[0], w.pierSeg[1]) < 1.1) return true;
    if (w.kind === 'lake') return !inPoly(w.poly, x, z) && edgeDist(w.poly, x, z) < BEACH;
    const hw = w.width / 2;
    let d = Infinity;
    for (let k = 0; k < w.S.length - 1; k++) d = Math.min(d, segDist(x, z, w.S[k], w.S[k + 1]));
    return d >= hw - .2 && d < hw + BANK;
  }
  // walking costs of a tile (tiles.stampCost calls this last): the beach is like a sidewalk
  stampCost(i, j) {
    if (!this.list.length) return;
    const grid = this.game.world.grid, C = grid.cost, n = grid.n;
    const x0 = i * TILE - TILE / 2, z0 = j * TILE - TILE / 2;
    const near = this.list.filter(w => { if (!w.poly && !w.S) return false; const b = this.bounds(w); return !(b.x1 < x0 || b.x0 > x0 + TILE || b.z1 < z0 || b.z0 > z0 + TILE); });
    if (!near.length) return;
    const i0 = grid.cell(x0), j0 = grid.cell(z0);
    for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
      const ci = i0 + a, cj = j0 + b;
      if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue;
      const k = cj * n + ci;
      if (C[k] !== NO_WALK) continue;
      const x = grid.center(ci), z = grid.center(cj);
      if (near.some(w => this.onBeach(w, x, z))) C[k] = 1;
    }
  }
  // a spot on the beach near p (for a stroll round the lake)
  beachSpot(p) {
    const lakes = this.list.filter(w => w.kind === 'lake');
    if (!lakes.length) return null;
    const w = this.nearest(p, 'lake'), k = Math.floor(Math.random() * w.poly.length), q = w.poly[k], m = w.nrm[k];
    return { x: q.x + m.x * 1.4, z: q.z + m.z * 1.4 };
  }
  // other water bodies this one overlaps (a river flowing into another river or a lake)
  touching(w) {
    const a = this.bounds(w);
    return this.list.filter(o => {
      if (o === w) return false;
      const b = this.bounds(o);
      if (a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0) return false;
      const pts = w.poly || w.S;
      return pts.some(p => this.wetIn(o, p.x, p.z, 2));
    });
  }
  remove(w) {
    const i = this.list.indexOf(w);
    if (i < 0) return;
    this.touching(w).forEach(o => (this.rebuildSet ||= new Set()).add(o));
    this.list.splice(i, 1);
    this.game.scene.remove(w.group);
    w.group.traverse(m => { if (m.isMesh && m.userData.ownGeo) m.geometry.dispose(); });
    this.changed(w);
  }
  clear() { for (const w of [...this.list]) this.remove(w); }
  toJSON() { return this.list.map(w => ({ id: w.id, kind: w.kind, pts: w.pts, width: w.width })); }

  // the walk grid, building tiles and road bridges depend on where the water is
  changed(w) {
    this.wetCache.clear();
    this.dirty = true;
    const b = this.bounds(w), T = this.game.tiles;
    this.game.curves?.refreshIn(b);   // curved roads over this water lift up (or come down)
    // roads around rebuild (bridges); every tile's walking costs too (the beach)
    for (let i = tileOf(b.x0) - 2; i <= tileOf(b.x1) + 2; i++) for (let j = tileOf(b.z0) - 2; j <= tileOf(b.z1) + 2; j++) {
      if (T.isRoad(i, j)) T.rebuild(i, j); else T.stampCost(i, j);
    }
  }
  bounds(w) {
    const m = w.kind === 'river' ? w.width / 2 + BANK + 1 : BEACH + 1;
    const xs = (w.poly || w.pts).map(p => p.x), zs = (w.poly || w.pts).map(p => p.z);
    return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, z0: Math.min(...zs) - m, z1: Math.max(...zs) + m };
  }

  // a road was drawn or removed: rebuild the water bodies there (no reeds or rocks on the road)
  roadChanged(i, j) {
    const x = i * TILE, z = j * TILE;
    for (const w of this.list) {
      const b = this.bounds(w);
      if (x < b.x0 - TILE || x > b.x1 + TILE || z < b.z0 - TILE || z > b.z1 + TILE) continue;
      (this.rebuildSet ||= new Set()).add(w);
    }
    this.dirty = true;
  }
  build(w) {
    const g = w.group = new THREE.Group(), all = new THREE.Group();
    const T = this.game.tiles, dry = (x, z) => !T.isRoadish(tileOf(x), tileOf(z));
    // decorations only where there is no road
    const deco = { add: o => all.add(o), children: all.children };
    // no reeds or rocks on roads, or in / at the edge of other water (where two rivers join)
    const others = x => this.list.some(o => o !== w && this.wetIn(o, x.x, x.z, 2.5));
    const keep = () => { for (const o of [...all.children]) if ((!dry(o.position.x, o.position.z) || others(o.position)) && !o.userData.pier) all.remove(o); };
    w.ducks = [];
    if (w.kind === 'lake') {
      const { poly, nrm, c } = lakeOutline(w.pts);
      Object.assign(w, { poly, nrm, c });
      g.add(flatShape(poly.map((p, k) => ({ x: p.x + nrm[k].x * BEACH, z: p.z + nrm[k].z * BEACH })), SAND_Y, MAT.sand, 1));
      // all water at the same height with the same world-space ripples: where a river runs in, it is one surface
      g.add(flatShape(poly, WATER_Y, MAT.lake, WUV));
      const n = poly.length;
      for (let k = 0; k < n; k += Math.max(3, Math.floor(n / 12))) {
        const p = poly[k], q = nrm[k];
        if (Math.random() < .6) reeds(deco, p.x + q.x * .9, p.z + q.z * .9);
        else rock(deco, p.x + q.x * 1.1, p.z + q.z * 1.1);
      }
      // a wooden pier for fishing, from the shore point closest to the town centre
      let k0 = 0;
      poly.forEach((p, k) => { if (Math.hypot(p.x, p.z) < Math.hypot(poly[k0].x, poly[k0].z)) k0 = k; });
      const sp = poly[k0], sn = nrm[k0], into = { x: -sn.x, z: -sn.z };
      const len = Math.min(7, Math.max(3, Math.hypot(c.x - sp.x, c.z - sp.z) * .4));
      makePier(deco, { x: sp.x + sn.x * 1.6, z: sp.z + sn.z * 1.6 }, into, len + 1.6);
      w.pierSeg = [{ x: sp.x + sn.x * 1.6, z: sp.z + sn.z * 1.6 }, { x: sp.x + into.x * len, z: sp.z + into.z * len }];
      w.pier = { x: sp.x + into.x * len, z: sp.z + into.z * len, face: Math.atan2(into.x, into.z), bob: { x: sp.x + into.x * (len + 3), y: WATER_Y, z: sp.z + into.z * (len + 3) } };
      // lily pads near the shore (only on the water, not on the pier)
      for (let k = 0; k < Math.min(16, n / 3); k++) {
        const p = pick(poly), u = rand(.04, .14);
        const x = p.x + (c.x - p.x) * u, z = p.z + (c.z - p.z) * u, e = inPoly(poly, x, z) && edgeDist(poly, x, z);
        if (e > .9 && e < 4.5 && segDist(x, z, w.pierSeg[0], w.pierSeg[1]) > 2.5) lily(deco, x, z);
      }
      // separate lanes on the water: swimmers near the shore, ride boats, the old boat, ducks in the middle
      w.swimLoop = ring(poly, c, .22, w.pierSeg, 2.2);
      w.rideLoop = ring(poly, c, .34, w.pierSeg, 2.6);
      w.loop = ring(poly, c, .46, null, 3);
      w.duckLoop = ring(poly, c, .62, null, 3);
      w.boat = makeBoat();
      w.boatU = Math.random();
      g.add(w.boat);
      for (let k = 0; k < 3; k++) { const d = makeDuck(); d.userData.u = Math.random(); d.userData.sp = rand(.006, .012); g.add(d); w.ducks.push(d); }
    } else {
      const S = w.S = sampleCurve(roundCorners(w.pts), false), hw = w.width / 2, len = S[S.length - 1].d;
      // where a river flows into a lake its mouth opens wider (like a real river mouth), so the banks
      // curve smoothly into the lake's beach
      const lakeAt = s => this.list.find(o => o !== w && o.kind === 'lake' && this.wetIn(o, s.x, s.z, 1));
      const mouth0 = lakeAt(S[0]), mouth1 = lakeAt(S[S.length - 1]);
      const wf = S.map(s => 1 + .9 * Math.max(mouth0 ? smooth(1 - s.d / 16) : 0, mouth1 ? smooth(1 - (len - s.d) / 16) : 0));
      w.mouths = [];   // (the wider water counts as water: nobody walks there)
      S.forEach((s, k) => { if (wf[k] > 1.05 && k % 2 === 0) w.mouths.push({ x: s.x, z: s.z, r: hw * wf[k] }); });
      g.add(strip(S, k => -hw * wf[k] - BANK, k => hw * wf[k] + BANK, SAND_Y, MAT.sand, .1));
      g.add(strip(S, k => -hw * wf[k], k => hw * wf[k], WATER_Y, MAT.river, .08, true));
      // an end that flows into other water gets a round end, so the joint is smooth
      for (const [s, f] of [[S[0], wf[0]], [S[S.length - 1], wf[wf.length - 1]]]) {
        if (!this.list.some(o => o !== w && this.wetIn(o, s.x, s.z, 1))) continue;
        g.add(waterDisc(s.x, WATER_Y, s.z, hw * f + .4));
      }
      S.forEach((s, k) => {
        if (k % 6 !== 3) return;
        const side = Math.random() < .5 ? -1 : 1;
        if (Math.random() < .5) rock(deco, s.x + s.nx * side * (hw + .9), s.z + s.nz * side * (hw + .9));
        else reeds(deco, s.x + s.nx * side * (hw + .7), s.z + s.nz * side * (hw + .7));
      });
    }
    keep();
    mergeStatic(all);
    shadows(all);
    g.add(all);
  }

  // ---------- where is water ----------
  wetIn(w, x, z, margin = 0) {
    if (w.kind === 'lake') {
      if (inPoly(w.poly, x, z)) return true;
      if (!margin) return false;
      for (let k = 0; k < w.poly.length; k++) if (segDist(x, z, w.poly[k], w.poly[(k + 1) % w.poly.length]) < margin) return true;
      return false;
    }
    const S = w.S, r = w.width / 2 + margin;
    for (let k = 0; k < S.length - 1; k++) if (segDist(x, z, S[k], S[k + 1]) < r) return true;
    // the wider mouth where it runs into a lake
    for (const m of w.mouths || []) if (Math.hypot(x - m.x, z - m.z) < m.r + margin) return true;
    return false;
  }
  wetAt(x, z, margin = 0) { return this.list.some(w => this.wetIn(w, x, z, margin)); }
  // a building tile touched by water can't be built on
  // margin 1 = also too close to the water (for buildings); 0 = really over the water (bridges)
  tileWet(i, j, margin = 1) {
    const k = i + ',' + j + ',' + margin;
    if (this.wetCache.has(k)) return this.wetCache.get(k);
    let wet = false;
    if (this.list.length) for (let a = -2; a <= 2 && !wet; a++) for (let b = -2; b <= 2 && !wet; b++) wet = this.wetAt(i * TILE + a * 2.6, j * TILE + b * 2.6, margin);
    this.wetCache.set(k, wet);
    return wet;
  }
  // walk grid: water cells are blocked, except under roads (bridges)
  restamp() {
    this.dirty = false;
    const grid = this.game.world.grid, T = this.game.tiles;
    if (!grid.wet) return;
    grid.wet.fill(0);
    for (const w of this.list) {
      const b = this.bounds(w);
      for (let j = grid.cell(b.z0); j <= grid.cell(b.z1); j++) for (let i = grid.cell(b.x0); i <= grid.cell(b.x1); i++) {
        if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) continue;
        const x = grid.center(i), z = grid.center(j);
        const ti = tileOf(x), tj = tileOf(z);
        if (T.isRoad(ti, tj) || T.isDirt(ti, tj)) continue;
        if (T.get(ti, tj)?.curveAny && this.game.curves.covers(x, z)) continue;   // on a curved road over the water
        if (w.pierSeg && segDist(x, z, w.pierSeg[0], w.pierSeg[1]) < 1.1) continue;   // you can walk on the pier
        if (this.wetIn(w, x, z)) grid.wet[j * grid.n + i] = 1;
      }
    }
  }

  ripple(x, z) {
    this.ripples ||= [];
    let r = this.ripples.find(q => !q.visible);
    if (!r) {
      if (this.ripples.length > 40) return;
      r = new THREE.Mesh(new THREE.RingGeometry(.75, .9, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
      this.game.scene.add(r);
      this.ripples.push(r);
    }
    r.visible = true;
    r.userData.t = 0;
    r.position.set(x, WATER_Y + .03, z);
  }

  // drawing a new river: a point near other water snaps onto it (so they join into one)
  snapPoint(x, z, r = 7) {
    let best = null, bd = r;
    for (const w of this.list) {
      if (w.kind === 'lake') {
        w.poly.forEach(p => {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < bd) { bd = d; best = { x: p.x + (w.c.x - p.x) * .12, z: p.z + (w.c.z - p.z) * .12, join: w }; }
        });
      } else for (const s of w.S) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = { x: s.x, z: s.z, join: w }; }
      }
    }
    return best;
  }

  // ---------- spots for people ----------
  nearest(pos, kind) {
    let best = null, bd = Infinity;
    for (const w of this.list) {
      if (kind && w.kind !== kind) continue;
      const pts = w.poly || w.S;
      for (let k = 0; k < pts.length; k += 2) { const d = Math.hypot(pts[k].x - pos.x, pts[k].z - pos.z); if (d < bd) { bd = d; best = w; } }
    }
    return best;
  }
  // a dry place on the bank, facing the water; bob = where the fishing line lands
  shoreSpot(pos, w = this.nearest(pos)) {
    if (!w) return null;
    const grid = this.game.world.grid;
    const cands = [];
    if (w.kind === 'lake') w.poly.forEach((p, k) => cands.push({ x: p.x + w.nrm[k].x * 1.3, z: p.z + w.nrm[k].z * 1.3, bx: p.x - w.nrm[k].x * 2.4, bz: p.z - w.nrm[k].z * 2.4 }));
    else {
      const hw = w.width / 2;
      w.S.forEach((s, k) => { if (k % 2) return; for (const side of [-1, 1]) cands.push({ x: s.x + s.nx * side * (hw + 1.3), z: s.z + s.nz * side * (hw + 1.3), bx: s.x + s.nx * side * (hw - 2.4), bz: s.z + s.nz * side * (hw - 2.4) }); });
    }
    const ok = cands.filter(q => grid.freeAt(q.x, q.z));
    const list = ok.length ? ok : cands;
    list.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    const q = list[Math.floor(Math.random() * Math.min(4, list.length))];
    return { x: q.x, z: q.z, face: Math.atan2(q.bx - q.x, q.bz - q.z), bob: { x: q.bx, y: WATER_Y, z: q.bz } };
  }

  // ---------- life on the water ----------
  update(dt) {
    if (this.rebuildSet?.size) {
      for (const w of this.rebuildSet) {
        if (!this.list.includes(w)) continue;
        this.game.scene.remove(w.group);
        w.group.traverse(m => { if (m.isMesh && m.userData.ownGeo) m.geometry.dispose(); });
        this.build(w);
        this.game.scene.add(w.group);
      }
      this.rebuildSet.clear();
    }
    if (this.dirty) this.restamp();
    if (!this.list.length) return;
    TEX.lake.offset.x += dt * .012;
    TEX.lake.offset.y += dt * .007;
    const t = this.game.time;
    for (const w of this.list) {
      if (w.kind !== 'lake') continue;
      const along = L => u => { const n = L.length, f = ((u % 1) + 1) % 1 * n, k = Math.floor(f), r = f - k, a = L[k], b = L[(k + 1) % n]; return { x: a.x + (b.x - a.x) * r, z: a.z + (b.z - a.z) * r }; };
      const at = along(w.loop), atD = along(w.duckLoop);
      w.boatU += dt * .004;
      const p = at(w.boatU), q = at(w.boatU + .01);
      w.boat.position.set(p.x, WATER_Y + Math.sin(t * 1.6) * .05, p.z);
      w.boat.rotation.set(Math.sin(t * 1.3) * .04, Math.atan2(q.x - p.x, q.z - p.z), Math.sin(t * 1.1) * .05);
      for (const d of w.ducks) {
        d.userData.u += dt * d.userData.sp;
        const a = atD(d.userData.u + .3), b = atD(d.userData.u + .305);
        d.position.set(a.x, WATER_Y - .05 + Math.sin(t * 3 + d.userData.u * 40) * .03, a.z);
        d.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      }
    }
    // rings on the water around swimmers
    this.rippleT = (this.rippleT || 0) - dt;
    if (this.rippleT <= 0) {
      this.rippleT = .35;
      for (const ch of this.game.awake) if (ch.swimming) this.ripple(ch.root.position.x, ch.root.position.z);
    }
    for (const r of this.ripples || []) {
      if (!r.visible) continue;
      r.userData.t += dt;
      const k = r.userData.t / 1.4;
      if (k >= 1) { r.visible = false; continue; }
      r.scale.setScalar(.6 + k * 2.2);
      r.material.opacity = .5 * (1 - k);
    }
    this.jumpFish(dt);
  }
}

// ---------- fish that jump out of the water now and then (somewhere random, at random times) ----------
function makeFish() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = pick(['#9fb3c4', '#c0ccd6', '#d8a86a', '#8fa3a8']);
  const b = mesh(sphere(.22, 12, 8), col, 0, 0, 0, body);
  b.scale.set(.75, .8, 1.9);
  mesh(sphere(.12, 10, 6), '#f2f2f2', 0, -.07, .05, body).scale.set(.6, .5, 1.6);
  const tail = mesh(new THREE.ConeGeometry(.2, .35, 4), col, 0, 0, -.5, body);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(.25, 1, 1.2);
  mesh(new THREE.ConeGeometry(.08, .2, 4), col, 0, .2, 0, body);
  for (const s of [-1, 1]) mesh(sphere(.035, 6, 4), '#111111', s * .12, .05, .3, body);
  mergeStatic(body);
  g.userData.body = body;
  return g;
}
Water.prototype.jumpFish = function (dt) {
  this.fish ||= [];
  this.fishT = (this.fishT ?? rand(1, 3)) - dt;
  const cam = this.game.world.controls.target;
  if (this.fishT <= 0) {
    this.fishT = rand(.8, 3.5);   // irregular, like real fish
    // only where someone can see it
    const near = this.list.filter(w => { const b = this.bounds(w); return cam.x > b.x0 - 150 && cam.x < b.x1 + 150 && cam.z > b.z0 - 150 && cam.z < b.z1 + 150; });
    const w = near.length && pick(near);
    let p = null;
    if (w?.kind === 'lake') {
      for (let t = 0; t < 8 && !p; t++) { const q = pick(w.poly), u = rand(.15, .8), x = q.x + (w.c.x - q.x) * u, z = q.z + (w.c.z - q.z) * u; if (inPoly(w.poly, x, z) && edgeDist(w.poly, x, z) > 2.5) p = { x, z }; }
    } else if (w) {
      const s = pick(w.S), o = rand(-1, 1) * Math.max(0, w.width / 2 - 1.6);
      p = { x: s.x + s.nx * o, z: s.z + s.nz * o };
    }
    if (p) {
      let f = this.fish.find(q => !q.visible);
      if (!f) { if (this.fish.length >= 6) f = null; else { f = makeFish(); this.game.scene.add(f); this.fish.push(f); } }
      if (f) {
        const a = rand(0, Math.PI * 2), len = rand(1.6, 3.2);
        f.userData.jump = { x: p.x, z: p.z, dx: Math.sin(a), dz: Math.cos(a), len, h: rand(.7, 1.6), t: 0, dur: rand(.7, 1.1) };
        f.rotation.y = a;
        f.visible = true;
        f.scale.setScalar(rand(.8, 1.4));
        this.game.effects.emit('splash', { x: p.x, y: WATER_Y + .1, z: p.z }, 6);
        this.ripple(p.x, p.z);
      }
    }
  }
  for (const f of this.fish) {
    if (!f.visible) continue;
    const j = f.userData.jump;
    j.t += dt;
    const u = Math.min(1, j.t / j.dur), y = WATER_Y - .2 + Math.sin(u * Math.PI) * j.h;
    f.position.set(j.x + j.dx * j.len * u, y, j.z + j.dz * j.len * u);
    f.userData.body.rotation.x = -Math.cos(u * Math.PI) * .9;   // nose up going out, nose down going in
    f.userData.body.rotation.z = Math.sin(j.t * 25) * .15;        // a wiggle
    if (u >= 1) {
      f.visible = false;
      const ex = j.x + j.dx * j.len, ez = j.z + j.dz * j.len;
      this.game.effects.emit('splash', { x: ex, y: WATER_Y + .1, z: ez }, 9);
      this.ripple(ex, ez);
    }
  }
};

// a preview mesh while drawing (semi-transparent)
export function previewWater(kind, pts, width) {
  const g = new THREE.Group();
  if (pts.length < 2) return g;
  if (kind === 'lake' && pts.length >= 3) {
    const { poly } = lakeOutline(pts);
    const m = flatShape(poly, WATER_Y + .02, new THREE.MeshBasicMaterial({ color: '#4fb3df', transparent: true, opacity: .55, depthWrite: false }), 1);
    g.add(m);
  } else {
    const S = sampleCurve(roundCorners(pts), false);
    const hw = kind === 'river' ? width / 2 : .6;
    g.add(strip(S, -hw, hw, WATER_Y + .02, new THREE.MeshBasicMaterial({ color: '#4fb3df', transparent: true, opacity: .55, depthWrite: false }), .1));
  }
  return g;
}
