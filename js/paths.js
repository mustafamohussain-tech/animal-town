// Footpaths: narrow dirt paths drawn freely with points (through parks, to the lake, between houses).
// People like walking on them (cheap cells in the walk grid); they don't block anything.
import * as THREE from 'three';
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { sampleCurve } from './curves.js';
import { mesh, rand, pick } from './util.js';

const PATH_W = 2.6;
const DIRT = new THREE.MeshStandardMaterial({ color: '#b48a5a', roughness: 1, polygonOffset: true, polygonOffsetFactor: 1.2, polygonOffsetUnits: 2 });
const EDGE = new THREE.MeshStandardMaterial({ color: '#9c7448', roughness: 1, polygonOffset: true, polygonOffsetFactor: 1.4, polygonOffsetUnits: 2.5 });

function ribbon(S, half, y, material) {
  const pos = [], idx = [];
  S.forEach((s, k) => {
    const w = half * (1 + Math.sin(k * 1.7) * .08);   // slightly uneven edges
    pos.push(s.x - s.nx * w, y, s.z - s.nz * w, s.x + s.nx * w, y, s.z + s.nz * w);
  });
  for (let k = 0; k < S.length - 1; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, material);
  m.userData.ownGeo = true;
  m.receiveShadow = true;
  return m;
}

export function buildPathMesh(pts, preview) {
  const g = new THREE.Group();
  if (pts.length < 2) return g;
  const S = sampleCurve(pts, false);
  g.add(ribbon(S, PATH_W / 2 + .25, .028, preview ? new THREE.MeshBasicMaterial({ color: '#9c7448', transparent: true, opacity: .6 }) : EDGE));
  g.add(ribbon(S, PATH_W / 2, .034, preview ? new THREE.MeshBasicMaterial({ color: '#c9a06a', transparent: true, opacity: .6 }) : DIRT));
  if (!preview) {
    // a few pebbles
    for (const s of S) if (Math.random() < .25) {
      const o = rand(-1, 1) * PATH_W * .4;
      mesh(new THREE.DodecahedronGeometry(rand(.08, .16), 0), pick(['#8d8a84', '#a39f97', '#7d6a55']), s.x + s.nx * o, .06, s.z + s.nz * o, g).userData.ownGeo = true;
    }
  }
  return g;
}

export class Paths {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }
  add(pts, o = {}) {
    if (pts.length < 2) return null;
    const p = { id: o.id ?? this.nextId++, pts: pts.map(q => ({ x: +q.x.toFixed(2), z: +q.z.toFixed(2) })) };
    this.nextId = Math.max(this.nextId, p.id + 1);
    p.S = sampleCurve(p.pts, false);
    p.group = buildPathMesh(p.pts);
    this.game.scene.add(p.group);
    p.tiles = new Set(p.S.map(s => tileOf(s.x) + ',' + tileOf(s.z)));
    this.list.push(p);
    this.restamp(p);
    return p;
  }
  remove(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.game.scene.remove(p.group);
    p.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    this.restamp(p);
  }
  restamp(p) { for (const k of p.tiles) { const [i, j] = k.split(',').map(Number); this.game.tiles.stampCost(i, j); } }
  clear() { for (const p of [...this.list]) this.remove(p); }
  toJSON() { return this.list.map(p => ({ id: p.id, pts: p.pts })); }
  nearest(x, z, r = 3) {
    let best = null, bd = r;
    for (const p of this.list) for (const s of p.S) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // walking costs (see tiles.stampCost): the path itself is as good as a sidewalk
  stampCost(i, j) {
    const grid = this.game.world.grid, C = grid.cost, n = grid.n, key = i + ',' + j;
    const x0 = i * TILE - TILE / 2, z0 = j * TILE - TILE / 2;
    for (const p of this.list) {
      if (!p.tiles.has(key)) continue;
      for (const s of p.S) for (let o = -PATH_W / 2; o <= PATH_W / 2; o += .5) {
        const x = s.x + s.nx * o, z = s.z + s.nz * o;
        if (x < x0 || x >= x0 + TILE || z < z0 || z >= z0 + TILE) continue;
        const ci = grid.cell(x), cj = grid.cell(z);
        if (ci >= 0 && cj >= 0 && ci < n && cj < n && C[cj * n + ci] > 1) C[cj * n + ci] = 1;
      }
    }
  }
  // somewhere along a path near p, for a stroll
  walkSpot(p) {
    const near = this.list.filter(q => q.S.some(s => Math.hypot(s.x - p.x, s.z - p.z) < 60));
    if (!near.length) return null;
    const s = pick(pick(near).S);
    return { x: s.x, z: s.z };
  }
}
