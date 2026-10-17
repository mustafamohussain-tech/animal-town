// The tile map (12x12 units per tile): which tiles are road / building / curved road.
// Road tiles connect to their neighbours automatically (straight, corner, T, crossing) with sidewalks,
// lane lines, zebra crossings and street lamps.
import * as THREE from 'three';
import { TILE } from './path.js';
import { box, cyl, mesh, sphere, mergeStatic, shadows } from './util.js';
import { NIGHT, addGlow } from './daynight.js';

const K = (i, j) => i + ',' + j;
const LEAF = ['#4caf50', '#5cc461', '#43a047', '#66bb6a'];
const SW = 2.6, HALF = TILE / 2;   // sidewalk width (wide enough for trees, benches and people)
export const BRIDGE_H = 3.4;   // road bridges over water: boats and ducks pass underneath
const ASPHALT = '#5d626b', WALK = '#cfc9bc', CURB = '#a9a294', JOINT = '#b9b2a4', LINE = '#f2f2f2', DIRT = '#b08a5c', TRACK = '#9a774c';
export const tileOf = v => Math.round(v / TILE);

export class TileMap {
  constructor(game) {
    this.game = game;
    this.tiles = new Map();
    this.meshes = new Map();
    this.lampSrc = new Map();
    this.treeRects = new Map();
  }
  get(i, j) { return this.tiles.get(K(i, j)); }
  rec(i, j) {
    let r = this.tiles.get(K(i, j));
    if (!r) { r = { road: false, building: null, curve: 0 }; this.tiles.set(K(i, j), r); }
    return r;
  }
  isRoad(i, j) { return !!this.get(i, j)?.road; }
  isRoadish(i, j) { const r = this.get(i, j); return !!r && (r.road || r.dirt || r.curve > 0); }
  isDirt(i, j) { return !!this.get(i, j)?.dirt; }
  // cars can drive here: asphalt or dirt road
  isDrivable(i, j) { const r = this.get(i, j); return !!r && (r.road || r.dirt); }
  dirtList() { return [...this.tiles.entries()].filter(([, r]) => r.dirt && !r.road).map(([k]) => k.split(',').map(Number)); }
  freeForBuilding(i, j, ignoreId) {
    if (!this.game.world.inLand(i, j)) return false;
    const r = this.get(i, j);
    if (this.game.water?.tileWet(i, j)) return false;
    if (this.game.parks?.tileIn(i, j)) return false;   // parks stay green
    return !r || (!r.road && !r.dirt && r.curve <= 0 && (r.building == null || r.building === ignoreId));
  }
  claim(i, j, id) { this.rec(i, j).building = id; this.stampCost(i, j); this.refreshAround(i, j); }
  release(i, j, id) { const r = this.get(i, j); if (r && r.building === id) { r.building = null; this.stampCost(i, j); this.refreshAround(i, j); } }
  // street trees / benches / lamps next to a building move away from its front (its sign stays visible)
  refreshAround(i, j) {
    if (this.loading) return;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isRoad(i + a, j + b)) this.rebuild(i + a, j + b);
  }
  hasBuilding(i, j) { return this.get(i, j)?.building != null; }
  // walking costs of the cells of one tile (path.js): people keep to sidewalks, paths and building plots,
  // cross roads at the zebra crossings, and only walk on grass when there is no other way
  stampCost(i, j) {
    const grid = this.game.world.grid, C = grid.cost, n = grid.n;
    const i0 = grid.cell(i * TILE - HALF), j0 = grid.cell(j * TILE - HALF);
    const r = this.get(i, j);
    const road = !!r?.road, plot = r?.building != null, dirt = !!r?.dirt;
    const L = r?.links;
    const N = road && (this.isDrivable(i, j - 1) || L?.n > 0), S = road && (this.isDrivable(i, j + 1) || L?.s > 0), E = road && (this.isDrivable(i + 1, j) || L?.e > 0), W = road && (this.isDrivable(i - 1, j) || L?.w > 0);
    const junction = road && N + S + E + W >= 3, band = HALF - SW - .2;
    for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
      const ci = i0 + a, cj = j0 + b;
      if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue;
      let c = 5;
      if (road) {
        const lx = grid.center(ci) - i * TILE, lz = grid.center(cj) - j * TILE;
        const walk = (!N && lz < -band) || (!S && lz > band) || (!E && lx > band) || (!W && lx < -band) ||
          (Math.abs(lx) > band && Math.abs(lz) > band);
        c = walk ? 1 : junction && (Math.abs(lx) > HALF - 2.6 || Math.abs(lz) > HALF - 2.6) ? 2 : 6;
      } else if (plot || dirt) c = 1;
      C[cj * n + ci] = c;
    }
    // curved roads and footpaths drawn over this tile
    this.game.curves?.stampCost?.(i, j);
    this.game.parks?.stampCost?.(i, j);
    this.game.paths?.stampCost?.(i, j);
  }
  // a spot on a sidewalk near p (where people stroll), or null when there are no roads around
  walkSpot(p, r = 3) {
    const ti = tileOf(p.x), tj = tileOf(p.z), out = [];
    for (let a = ti - r; a <= ti + r; a++) for (let b = tj - r; b <= tj + r; b++) {
      if (!this.isRoad(a, b)) continue;
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!this.isRoad(a + di, b + dj)) out.push([a, b, di, dj]);
    }
    if (!out.length) return null;
    const [a, b, di, dj] = out[Math.floor(Math.random() * out.length)], along = (Math.random() - .5) * (TILE - 3), off = HALF - .9;
    return { x: a * TILE + (di ? di * off : along), z: b * TILE + (dj ? dj * off : along) };
  }
  // is this point on the driving part of a road (not the sidewalk, not grass)?
  onAsphalt(x, z) {
    const a = tileOf(x), b = tileOf(z);
    if (!this.isRoad(a, b)) return !!this.game.curves.nearest(x, z, 3.2);
    const lx = x - a * TILE, lz = z - b * TILE, band = HALF - SW;
    const walk = (!this.isRoad(a, b - 1) && lz < -band) || (!this.isRoad(a, b + 1) && lz > band) ||
      (!this.isRoad(a + 1, b) && lx > band) || (!this.isRoad(a - 1, b) && lx < -band);
    return !walk;
  }
  // ---------- bridges over water ----------
  // a road tile over water is a bridge deck high above it; the road tiles leading to it are ramps
  overWater(i, j) { return this.isRoad(i, j) && !!this.game.water?.tileWet(i, j, 0); }
  bridgeH(i, j) {
    if (!this.isRoad(i, j)) return 0;
    if (this.overWater(i, j)) return BRIDGE_H;
    const x = this.isRoad(i - 1, j) || this.isRoad(i + 1, j), z = this.isRoad(i, j - 1) || this.isRoad(i, j + 1);
    const nextToBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => this.overWater(i + a, j + c));
    if (!nextToBridge.length) return 0;
    // a corner or junction right next to a bridge stays up at bridge height (ramps only on straight roads)
    if (x && z) return BRIDGE_H;
    // squeezed between two bridges: flat on top too
    if (nextToBridge.length >= 2) return BRIDGE_H;
    return 0;
  }
  rampDir(i, j) {
    if (!this.isRoad(i, j) || this.bridgeH(i, j)) return null;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!this.bridgeH(i + a, j + b)) continue;
      if (a ? (this.isRoad(i, j - 1) || this.isRoad(i, j + 1)) : (this.isRoad(i - 1, j) || this.isRoad(i + 1, j))) continue;
      return [a, b];
    }
    return null;
  }
  // height of the ground people and cars stand on (bridges and their ramps)
  groundY(x, z) {
    const i = tileOf(x), j = tileOf(z);
    if (!this.isRoad(i, j)) return this.get(i, j)?.curveAny ? this.game.curves.heightAt(x, z) : 0;
    const b = this.bridgeH(i, j);
    if (b) return b;
    const rd = this.rampDir(i, j);
    if (!rd) return 0;
    const l = rd[0] ? (x - i * TILE) * rd[0] : (z - j * TILE) * rd[1];
    return BRIDGE_H * Math.max(0, Math.min(1, (l + HALF) / TILE));
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
    if (on && r.curve > 0) return false;   // a curved road is already here: no road on top of it
    if (r.road === on) return false;
    r.road = on;
    if (on) this.game.props.clearRect(i * TILE - HALF, j * TILE - HALF, i * TILE + HALF, j * TILE + HALF, true);
    for (let a = i - 2; a <= i + 2; a++) for (let c = j - 2; c <= j + 2; c++) this.rebuild(a, c); // wide roads look at their neighbours' neighbours
    this.game.water?.roadChanged(i, j);   // roads over water are walkable (bridges), no reeds on the road
    this.game.curves?.refreshNear(i, j);  // a bridge's pillars step off the new road
    if (on) this.game.curves?.linkLater(i, j);   // a curved road ending here joins this road
    return true;
  }

  // dirt road tiles (cheaper look, no sidewalks; people walk on them, cars drive on them)
  setDirt(i, j, on) {
    if (!this.game.world.inLand(i, j)) return false;
    const r = this.rec(i, j);
    if (on && (r.building != null || r.road)) return false;
    if (!!r.dirt === on) return false;
    r.dirt = on;
    if (on) this.game.props.clearRect(i * TILE - HALF, j * TILE - HALF, i * TILE + HALF, j * TILE + HALF, true);
    for (let a = i - 1; a <= i + 1; a++) for (let c = j - 1; c <= j + 1; c++) this.rebuild(a, c);
    this.game.water?.roadChanged(i, j);
    return true;
  }
  buildDirt(i, j, g) {
    const D = (a, b) => this.isDrivable(a, b);
    const n = D(i, j - 1), s = D(i, j + 1), e = D(i + 1, j), w = D(i - 1, j);
    // packed earth, a bit narrower than the tile where nothing joins, with two wheel tracks
    const m = 1.4;
    const x0 = w ? -HALF : -HALF + m, x1 = e ? HALF : HALF - m, z0 = n ? -HALF : -HALF + m, z1 = s ? HALF : HALF - m;
    box(x1 - x0, .05, z1 - z0, DIRT, (x0 + x1) / 2, .025, (z0 + z1) / 2, g);
    const along = (n || s) && !(e || w) ? 'z' : (e || w) && !(n || s) ? 'x' : null;
    for (const o of [-2.2, 2.2]) {
      if (along === 'z') box(.9, .01, z1 - z0, TRACK, o, .052, (z0 + z1) / 2, g);
      if (along === 'x') box(x1 - x0, .01, .9, TRACK, (x0 + x1) / 2, .052, o, g);
    }
    for (let k = 0; k < 6; k++) box(.2, .08, .2, '#8d8a84', x0 + Math.random() * (x1 - x0), .06, z0 + Math.random() * (z1 - z0), g);
  }
  rebuild(i, j) {
    this.stampCost(i, j);
    const k = K(i, j);
    const oldT = this.treeRects.get(k);   // the street tree's spot in the walk grid
    if (oldT) { this.game.world.grid.mark(...oldT, -1); this.treeRects.delete(k); }
    const old = this.meshes.get(k);
    if (old) {
      this.game.scene.remove(old);
      old.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
      this.meshes.delete(k);
    }
    const src = this.lampSrc.get(k);
    if (src) { this.game.daynight.removeSource(src); this.lampSrc.delete(k); }
    if (!this.isRoad(i, j)) {
      if (this.isDirt(i, j)) {
        const g = new THREE.Group();
        g.position.set(i * TILE, 0, j * TILE);
        this.buildDirt(i, j, g);
        mergeStatic(g);
        shadows(g);
        this.game.scene.add(g);
        this.meshes.set(k, g);
      }
      return;
    }

    const L = this.get(i, j)?.links;
    // a dirt road joining an asphalt road continues it (no sidewalk across the join)
    const n = this.isDrivable(i, j - 1) || L?.n > 0, s = this.isDrivable(i, j + 1) || L?.s > 0, e = this.isDrivable(i + 1, j) || L?.e > 0, w = this.isDrivable(i - 1, j) || L?.w > 0;
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
    // sidewalk details: a curb along the road and paving joints
    const open = [['n', !n, 0, -1], ['s', !s, 0, 1], ['e', !e, 1, 0], ['w', !w, -1, 0]].filter(q => q[1]);
    // sides where the sidewalk runs along empty land (not in front of a building and its sign)
    const free = open.filter(([, , a, b]) => !this.hasBuilding(i + a, j + b));
    for (const [, , a, b] of open) {
      const cxy = HALF - SW + .12;
      if (a) box(.24, .2, TILE, CURB, a * cxy, .1, 0, g); else box(TILE, .2, .24, CURB, 0, .1, b * cxy, g);
      for (let u = -HALF + 1.5; u < HALF; u += 1.5) {
        if (a) box(SW - .3, .01, .05, JOINT, a * E, .145, u, g); else box(.05, .01, SW - .3, JOINT, u, .145, b * E, g);
      }
    }
    // street trees in little soil squares on every other tile (lamps stand on the others)
    if (((i + j) & 1) === 1 && free.length && !this.overWater(i, j) && !this.rampDir(i, j) && !this.bridgeH(i, j)) {
      const [, , a, b] = free[(i * 7 + j * 3 & 255) % free.length];
      const tx = a ? a * E : 2.5, tz = a ? 2.5 : b * E;
      box(1.3, .03, 1.3, '#6b5a3e', tx, .15, tz, g);
      cyl(.12, .16, 2.2, '#8b5a2b', tx, 1.2, tz, g, 7);
      mesh(new THREE.IcosahedronGeometry(1.25, 0), LEAF[(i * 3 + j) & 3], tx, 3, tz, g).userData.ownGeo = true;
      mesh(new THREE.IcosahedronGeometry(.85, 0), LEAF[(i + j * 5) & 3], tx + .3, 3.9, tz - .2, g).userData.ownGeo = true;
      const wx = i * TILE + tx, wz = j * TILE + tz, rect = [wx - .5, wz - .5, wx + .5, wz + .5];
      this.game.world.grid.mark(...rect, 1);
      this.treeRects.set(k, rect);
    }
    // now and then a bench or a bin on the sidewalk
    if (free.length && (i * 5 + j * 11 & 255) % 7 === 0 && !this.bridgeH(i, j) && !this.rampDir(i, j)) {
      const [, , a, b] = free[0], bx = a ? a * (HALF - .6) : -2.5, bz = a ? -2.5 : b * (HALF - .6);
      const bench = new THREE.Group();
      bench.position.set(bx, .14, bz);
      bench.rotation.y = Math.atan2(-a, -b);
      box(2, .1, .6, '#a0703f', 0, .5, 0, bench);
      box(2, .5, .08, '#a0703f', 0, .85, -.28, bench);
      for (const sx of [-.85, .85]) box(.08, .5, .5, '#555555', sx, .25, 0, bench);
      g.add(bench);
      cyl(.28, .24, .8, '#4a6b4a', a ? a * (HALF - .5) : 1.5, .54, a ? 1.5 : b * (HALF - .5), g, 10);
    }

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
    } else {
      // roads drawn side by side = one wide road with several lanes: which way does it run?
      const run = (dx, dz) => { let k = 1; while (k <= 8 && R(i + dx * k, j + dz * k)) k++; return k - 1; };
      const hr = 1 + run(1, 0) + run(-1, 0), vr = 1 + run(0, 1) + run(0, -1);
      // a wide road is at most 4 tiles across; long in both directions = a crossing
      if (hr >= 3 && vr <= 4 && hr > vr) {
        // runs east-west: a dashed line in the middle of every lane pair, a solid line between the tiles
        dashX(-HALF, HALF - .5);
        if (n) box(TILE, .012, .16, LINE, 0, .066, -HALF, g);
      } else if (vr >= 3 && hr <= 4 && vr > hr) {
        dashZ(-HALF, HALF - .5);
        if (w) box(.16, .012, TILE, LINE, -HALF, .066, 0, g);
      }
      // (where two wide roads cross, the middle stays plain asphalt)
    }

    // over water the road becomes a bridge: railings on the open sides
    if (this.game.water?.tileWet(i, j, 0)) {
      const R = HALF - .2;
      const rail = (alongX, off) => {
        if (alongX) { box(TILE, .14, .14, '#d6d0c4', 0, 1.05, off, g); for (let x = -HALF + .4; x <= HALF; x += 2) box(.16, 1.05, .16, '#bdb7ab', x, .52, off, g); }
        else { box(.14, .14, TILE, '#d6d0c4', off, 1.05, 0, g); for (let z = -HALF + .4; z <= HALF; z += 2) box(.16, 1.05, .16, '#bdb7ab', off, .52, z, g); }
      };
      if (!n) rail(true, -R);
      if (!s) rail(true, R);
      if (!e) rail(false, R);
      if (!w) rail(false, -R);
    }
    const bh = this.bridgeH(i, j), rd = !bh && this.rampDir(i, j);
    // a street lamp on every other tile, standing on a sidewalk (not on a sloping ramp)
    if (((i + j) & 1) === 0 && !rd) {
      const nb = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
      const side = ['s', 'n', 'e', 'w'].find(q => !{ n, s, e, w }[q] && !this.hasBuilding(i + nb[q][0], j + nb[q][1])) || null;
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
        this.lampSrc.set(k, this.game.daynight.addSource({ pos: new THREE.Vector3(i * TILE + bx, 4.3 + bh, j * TILE + bz), power: 6 }));
      }
    }
    mergeStatic(g);
    shadows(g);
    let root = g;
    if (bh || rd) {
      // the tile is lifted (bridge) or tilted (ramp); supports are drawn in the tile's own frame
      root = new THREE.Group();
      root.position.copy(g.position);
      g.position.set(0, 0, 0);
      root.add(g);
      const sup = new THREE.Group();
      if (bh) {
        g.position.y = bh;
        // the deck spans the water on two deep girders: no pillars stand in the water
        box(TILE, .6, TILE, '#b8b2a5', 0, bh - .32, 0, sup);
        const along = n || s;   // girders run the way the road runs
        for (const sd of [-1, 1]) {
          if (along) box(1, 1.1, TILE, '#a8a39a', sd * (HALF - 1.2), bh - 1.1, 0, sup);
          else box(TILE, 1.1, 1, '#a8a39a', 0, bh - 1.1, sd * (HALF - 1.2), sup);
        }
      } else {
        const [dx, dz] = rd, ang = Math.atan2(BRIDGE_H, TILE);
        g.position.y = BRIDGE_H / 2;
        if (dz) { g.rotation.x = -dz * ang; g.scale.z = 1 / Math.cos(ang); }
        else { g.rotation.z = dx * ang; g.scale.x = 1 / Math.cos(ang); }
        // an earth wedge under the ramp
        const sh = new THREE.Shape([new THREE.Vector2(-HALF, 0), new THREE.Vector2(HALF, 0), new THREE.Vector2(HALF, BRIDGE_H - .05)]);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: TILE - .2, bevelEnabled: false });
        geo.translate(0, 0, -(TILE - .2) / 2);
        geo.rotateY(dx > 0 ? 0 : dx < 0 ? Math.PI : dz > 0 ? -Math.PI / 2 : Math.PI / 2);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b8b2a5', roughness: 1 }));
        m.userData.ownGeo = true;
        sup.add(m);
      }
      shadows(sup);
      root.add(sup);
    }
    this.game.scene.add(root);
    this.meshes.set(k, root);
  }

  clear() {
    for (const k of [...this.meshes.keys()]) { const [i, j] = k.split(',').map(Number); const r = this.get(i, j); r.road = false; r.dirt = false; this.rebuild(i, j); }
    this.tiles.clear();
  }
}
