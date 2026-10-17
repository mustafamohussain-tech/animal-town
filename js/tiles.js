// The tile map (12x12 units per tile): which tiles are road / building / curved road.
// Road tiles connect to their neighbours automatically (straight, corner, T, crossing) with sidewalks,
// lane lines, zebra crossings and street lamps.
import * as THREE from 'three';
import { TILE } from './path.js';
import { box, cyl, mesh, sphere, mergeStatic, shadows } from './util.js';
import { NIGHT, addGlow } from './daynight.js';

const K = (i, j) => i + ',' + j;
const SW = 1.8, HALF = TILE / 2;
const ASPHALT = '#5d626b', WALK = '#cfc9bc', LINE = '#f2f2f2';
export const tileOf = v => Math.round(v / TILE);

export class TileMap {
  constructor(game) {
    this.game = game;
    this.tiles = new Map();
    this.meshes = new Map();
    this.lampSrc = new Map();
  }
  get(i, j) { return this.tiles.get(K(i, j)); }
  rec(i, j) {
    let r = this.tiles.get(K(i, j));
    if (!r) { r = { road: false, building: null, curve: 0 }; this.tiles.set(K(i, j), r); }
    return r;
  }
  isRoad(i, j) { return !!this.get(i, j)?.road; }
  isRoadish(i, j) { const r = this.get(i, j); return !!r && (r.road || r.curve > 0); }
  freeForBuilding(i, j, ignoreId) {
    if (!this.game.world.inLand(i, j)) return false;
    const r = this.get(i, j);
    return !r || (!r.road && r.curve <= 0 && (r.building == null || r.building === ignoreId));
  }
  claim(i, j, id) { this.rec(i, j).building = id; }
  release(i, j, id) { const r = this.get(i, j); if (r && r.building === id) r.building = null; }
  // is this point on the driving part of a road (not the sidewalk, not grass)?
  onAsphalt(x, z) {
    const a = tileOf(x), b = tileOf(z);
    if (!this.isRoad(a, b)) return !!this.game.curves.nearest(x, z, 3.2);
    const lx = x - a * TILE, lz = z - b * TILE, band = HALF - SW;
    const walk = (!this.isRoad(a, b - 1) && lz < -band) || (!this.isRoad(a, b + 1) && lz > band) ||
      (!this.isRoad(a + 1, b) && lx > band) || (!this.isRoad(a - 1, b) && lx < -band);
    return !walk;
  }
  // a crossing or T-junction (3+ roads meet)
  isJunction(i, j) {
    return this.isRoad(i, j) && (this.isRoad(i, j - 1) + this.isRoad(i, j + 1) + this.isRoad(i + 1, j) + this.isRoad(i - 1, j)) >= 3;
  }
  roadList() { return [...this.tiles.entries()].filter(([, r]) => r.road).map(([k]) => k.split(',').map(Number)); }

  setRoad(i, j, on) {
    if (!this.game.world.inLand(i, j)) return false;
    const r = this.rec(i, j);
    if (on && r.building != null) return false;
    if (r.road === on) return false;
    r.road = on;
    if (on) this.game.props.clearRect(i * TILE - HALF, j * TILE - HALF, i * TILE + HALF, j * TILE + HALF, true);
    for (let a = i - 1; a <= i + 1; a++) for (let c = j - 1; c <= j + 1; c++) this.rebuild(a, c); // diagonals too (wide areas)
    return true;
  }

  rebuild(i, j) {
    const k = K(i, j);
    const old = this.meshes.get(k);
    if (old) {
      this.game.scene.remove(old);
      old.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
      this.meshes.delete(k);
    }
    const src = this.lampSrc.get(k);
    if (src) { this.game.daynight.removeSource(src); this.lampSrc.delete(k); }
    if (!this.isRoad(i, j)) return;

    const n = this.isRoad(i, j - 1), s = this.isRoad(i, j + 1), e = this.isRoad(i + 1, j), w = this.isRoad(i - 1, j);
    const g = new THREE.Group();
    g.position.set(i * TILE, 0, j * TILE);
    box(TILE, .06, TILE, ASPHALT, 0, .03, 0, g);
    // sidewalks on the sides that don't continue
    const E = HALF - SW / 2;
    if (!n) box(TILE, .14, SW, WALK, 0, .07, -E, g);
    if (!s) box(TILE, .14, SW, WALK, 0, .07, E, g);
    if (!e) box(SW, .14, TILE, WALK, E, .07, 0, g);
    if (!w) box(SW, .14, TILE, WALK, -E, .07, 0, g);
    // corner squares where two roads meet
    // corner squares where two roads meet (not inside a wide paved area)
    if (n && e && !this.isRoad(i + 1, j - 1)) box(SW, .14, SW, WALK, E, .07, -E, g);
    if (n && w && !this.isRoad(i - 1, j - 1)) box(SW, .14, SW, WALK, -E, .07, -E, g);
    if (s && e && !this.isRoad(i + 1, j + 1)) box(SW, .14, SW, WALK, E, .07, E, g);
    if (s && w && !this.isRoad(i - 1, j + 1)) box(SW, .14, SW, WALK, -E, .07, E, g);

    // markings (none on wide areas: roads drawn side by side form a square, not crossings)
    const R = (a, c) => this.isRoad(a, c);
    const wide = (n && e && R(i + 1, j - 1)) || (n && w && R(i - 1, j - 1)) || (s && e && R(i + 1, j + 1)) || (s && w && R(i - 1, j + 1));
    const count = wide ? 0 : n + s + e + w;
    const dashZ = (z0, z1) => { for (let z = z0; z < z1; z += 3) box(.18, .01, 1.6, LINE, 0, .065, z + .8, g); };
    const dashX = (x0, x1) => { for (let x = x0; x < x1; x += 3) box(1.6, .01, .18, LINE, x + .8, .065, 0, g); };
    if (count >= 3) {
      const zebra = (dir) => {
        for (let k2 = -3; k2 <= 3; k2++) {
          const o = k2 * 1.15;
          if (dir === 'n') box(.6, .012, 1.8, LINE, o, .066, -HALF + 1.2, g);
          if (dir === 's') box(.6, .012, 1.8, LINE, o, .066, HALF - 1.2, g);
          if (dir === 'e') box(1.8, .012, .6, LINE, HALF - 1.2, .066, o, g);
          if (dir === 'w') box(1.8, .012, .6, LINE, -HALF + 1.2, .066, o, g);
        }
      };
      if (n) zebra('n'); if (s) zebra('s'); if (e) zebra('e'); if (w) zebra('w');
    } else if (!wide) {
      if (n) dashZ(-HALF, -.3);
      if (s) dashZ(.3, HALF);
      if (e) dashX(.3, HALF);
      if (w) dashX(-HALF, -.3);
    }

    // a street lamp on every other tile, standing on a sidewalk
    if (((i + j) & 1) === 0) {
      const side = !s ? 's' : !n ? 'n' : !e ? 'e' : !w ? 'w' : null;
      if (side) {
        const off = HALF - .6;
        const [lx, lz, ax, az] = { s: [-2, off, 0, -1], n: [2, -off, 0, 1], e: [off, 2, -1, 0], w: [-off, -2, 1, 0] }[side];
        cyl(.1, .14, 4.8, '#3a3f48', lx, 2.4, lz, g, 8);
        const arm = box(.1, .1, 1.6, '#3a3f48', lx + ax * .7, 4.75, lz + az * .7, g);
        if (ax) arm.rotation.y = Math.PI / 2;
        const bx = lx + ax * 1.4, bz = lz + az * 1.4;
        box(.6, .16, .4, '#2f343c', bx, 4.7, bz, g);
        const bulb = mesh(sphere(.18), NIGHT.bulb, bx, 4.55, bz, g);
        bulb.userData.keep = true;
        addGlow(g, bx, 4.5, bz, 2.6, 10);
        this.lampSrc.set(k, this.game.daynight.addSource({ pos: new THREE.Vector3(i * TILE + bx, 4.3, j * TILE + bz), power: 6 }));
      }
    }
    mergeStatic(g);
    shadows(g);
    this.game.scene.add(g);
    this.meshes.set(k, g);
  }

  clear() {
    for (const k of [...this.meshes.keys()]) { const [i, j] = k.split(',').map(Number); this.get(i, j).road = false; this.rebuild(i, j); }
    this.tiles.clear();
  }
}
