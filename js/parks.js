// Parks drawn freely like a lake: a closed shape of lush grass with a flower edge. A new park plants itself:
// a winding dirt path through it, trees, benches and garden lamps. Those are ordinary objects, so the
// player can erase, move or add any of them. Residents stroll on the paths and sit on the benches.
import * as THREE from 'three';
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { mesh, sphere, rand, pick, mergeStatic, shadows } from './util.js';

const GRASS = new THREE.MeshStandardMaterial({ color: '#6cc25a', roughness: 1, polygonOffset: true, polygonOffsetFactor: 1.6, polygonOffsetUnits: 3 });
const FLOWER = ['#ff7aa2', '#ffd23f', '#ffffff', '#b48cff', '#ff5d5d', '#ff9f43'];

export function parkOutline(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z)), true, 'centripetal');
  const n = Math.max(30, Math.min(140, Math.ceil(curve.getLength() / 2)));
  const poly = curve.getSpacedPoints(n).slice(0, n).map(v => ({ x: v.x, z: v.z }));
  const c = poly.reduce((s, p) => ({ x: s.x + p.x / n, z: s.z + p.z / n }), { x: 0, z: 0 });
  return { poly, c };
}
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function lawn(poly, y, material) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, -p.z))), 2);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const m = new THREE.Mesh(g, material);
  m.userData.ownGeo = true;
  m.receiveShadow = true;
  return m;
}

export class Parks {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }
  // o.plant = true for a park the player just drew (it plants itself); loading a save doesn't re-plant
  add(pts, o = {}) {
    if (pts.length < 3) return null;
    const p = { id: o.id ?? this.nextId++, pts: pts.map(q => ({ x: +q.x.toFixed(2), z: +q.z.toFixed(2) })), made: o.made || { props: [], paths: [] } };
    this.nextId = Math.max(this.nextId, p.id + 1);
    Object.assign(p, parkOutline(p.pts));
    p.group = new THREE.Group();
    p.group.add(lawn(p.poly, .018, GRASS));
    // a flower edge all around
    const fl = new THREE.Group();
    p.poly.forEach((q, k) => { if (k % 2 === 0) mesh(sphere(.16), FLOWER[k % FLOWER.length], q.x + rand(-.3, .3), .2, q.z + rand(-.3, .3), fl); });
    mergeStatic(fl);
    p.group.add(fl);
    shadows(p.group);
    this.game.scene.add(p.group);
    p.tiles = new Set();
    const xs = p.poly.map(q => q.x), zs = p.poly.map(q => q.z);
    for (let i = tileOf(Math.min(...xs)); i <= tileOf(Math.max(...xs)); i++) for (let j = tileOf(Math.min(...zs)); j <= tileOf(Math.max(...zs)); j++) p.tiles.add(i + ',' + j);
    this.list.push(p);
    if (o.plant) this.plant(p);
    this.restamp(p);
    return p;
  }
  remove(p, alsoPlanted = false) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.game.scene.remove(p.group);
    p.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    if (alsoPlanted) {
      for (const id of p.made.props) { const q = this.game.props.list.find(x => x.id === id); if (q) this.game.props.remove(q); }
      for (const id of p.made.paths) { const q = this.game.paths.list.find(x => x.id === id); if (q) this.game.paths.remove(q); }
    }
    this.restamp(p);
  }
  clear() { for (const p of [...this.list]) this.remove(p); }
  toJSON() { return this.list.map(p => ({ id: p.id, pts: p.pts, made: p.made })); }
  restamp(p) { for (const k of p.tiles) { const [i, j] = k.split(',').map(Number); this.game.tiles.stampCost(i, j); } }
  at(x, z) { return this.list.find(p => inPoly(p.poly, x, z)) || null; }
  // a building tile inside a park? (parks are kept free of buildings)
  tileIn(i, j) {
    for (const p of this.list) {
      if (!p.tiles.has(i + ',' + j)) continue;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inPoly(p.poly, i * TILE + a * 4, j * TILE + b * 4)) return true;
    }
    return false;
  }
  // a park's lawn is the one grass people may walk on (its paths are a little nicer: paths.js)
  stampCost(i, j) {
    const T = this.game.tiles, r = T.get(i, j);
    if (r?.road || r?.curveAny) return;   // never the driving part of a road through the park
    const grid = this.game.world.grid, C = grid.cost, n = grid.n, key = i + ',' + j;
    for (const p of this.list) {
      if (!p.tiles.has(key)) continue;
      const i0 = grid.cell(i * TILE - TILE / 2), j0 = grid.cell(j * TILE - TILE / 2);
      for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
        const ci = i0 + a, cj = j0 + b, k = cj * n + ci;
        if (C[k] > 2 && inPoly(p.poly, grid.center(ci), grid.center(cj))) C[k] = 2;
      }
    }
  }

  // a new park plants itself
  plant(p) {
    const g = this.game, { poly, c } = p, made = p.made;
    const inside = (x, z, m = 1.5) => inPoly(poly, x, z) && poly.every((q, k) => { const r = poly[(k + 1) % poly.length]; return segDist(x, z, q, r) > m; });
    // a winding path loop through the middle
    const loop = [];
    for (let k = 0; k < poly.length; k += Math.max(2, Math.floor(poly.length / 9))) {
      const u = rand(.42, .58), x = poly[k].x + (c.x - poly[k].x) * u, z = poly[k].z + (c.z - poly[k].z) * u;
      if (inside(x, z, 2.5)) loop.push({ x, z });
    }
    let path = null;
    if (loop.length >= 3) {
      path = g.paths.add([...loop, loop[0]]);
      if (path) made.paths.push(path.id);
    }
    const nearPath = (x, z, r) => path && path.S.some(s => Math.hypot(s.x - x, s.z - z) < r);
    // benches and garden lamps beside the path
    if (path) {
      let last = -99;
      path.S.forEach((s, k) => {
        if (s.d - last < 11) return;
        last = s.d;
        const side = k % 2 ? 1 : -1, x = s.x + s.nx * side * 2.1, z = s.z + s.nz * side * 2.1;
        if (!inside(x, z, 1)) return;
        const type = (k / 2 | 0) % 2 ? 'gardenlamp' : 'bench';
        const q = g.props.add(type, x, z, Math.atan2(-s.nx * side, -s.nz * side));
        if (q) made.props.push(q.id);
      });
    }
    // trees and flower beds on the grass
    let area = 0;
    for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; area += a.x * b.z - b.x * a.z; }
    area = Math.abs(area) / 2;
    const xs = poly.map(q => q.x), zs = poly.map(q => q.z);
    const want = Math.min(40, Math.round(area / 55));
    for (let t = 0, n = 0; t < want * 8 && n < want; t++) {
      const x = rand(Math.min(...xs), Math.max(...xs)), z = rand(Math.min(...zs), Math.max(...zs));
      if (!inside(x, z, 1.5) || nearPath(x, z, 3) || g.props.nearest(x, z, 3)) continue;
      const q = g.props.add(Math.random() < .82 ? 'tree' : 'flowers', x, z, rand(0, 6));
      if (q) { made.props.push(q.id); n++; }
    }
  }
}
function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - a.x - dx * u, pz - a.z - dz * u);
}
// a see-through preview of the park while drawing it
export function previewPark(pts) {
  const g = new THREE.Group();
  if (pts.length < 3) return g;
  g.add(lawn(parkOutline(pts).poly, .05, new THREE.MeshBasicMaterial({ color: '#6cc25a', transparent: true, opacity: .55, depthWrite: false })));
  return g;
}
