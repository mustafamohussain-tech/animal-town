// Free curved roads and bridges (a road raised over other roads, with ramps, pillars and railings).
import * as THREE from 'three';
import { TILE } from './path.js';
import { box, cyl, mat, sideMat, mergeStatic, shadows, dist2d } from './util.js';
import { tileOf, BRIDGE_H as DECK_H } from './tiles.js';

const ROAD_W = 6.8, WALK_W = 2.6, BRIDGE_H = 7.5, RAMP = 22;   // road + sidewalk widths match a straight road tile
const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// a flat ribbon following the samples, offset sideways from a..b, at height y(k)
function ribbon(samples, a, b, yOff, color, flipNormals = false) {
  const pos = [], idx = [];
  samples.forEach(s => {
    pos.push(s.x + s.nx * a, s.y + yOff, s.z + s.nz * a, s.x + s.nx * b, s.y + yOff, s.z + s.nz * b);
  });
  for (let k = 0; k < samples.length - 1; k++) {
    const i = k * 2;
    if (flipNormals) idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    else idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, typeof color === 'string' ? mat(color) : color);
  m.userData.ownGeo = true;
  return m;
}
// a vertical strip (railing / bridge side) along an edge
function wall(samples, off, y0, y1, color) {
  const pos = [], idx = [];
  samples.forEach(s => pos.push(s.x + s.nx * off, s.y + y0, s.z + s.nz * off, s.x + s.nx * off, s.y + y1, s.z + s.nz * off));
  for (let k = 0; k < samples.length - 1; k++) { const i = k * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, sideMat(color));
  m.userData.ownGeo = true;
  return m;
}

export function sampleCurve(pts, bridge) {
  if (pts.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
  const L = curve.getLength(), n = Math.max(4, Math.ceil(L / 1.2));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    // bridge: true = the tall bridge over other roads; a function = its own height profile (over water)
    const d = u * L, h = typeof bridge === 'function' ? bridge(d, L) : bridge ? BRIDGE_H * Math.min(smooth(d / RAMP), smooth((L - d) / RAMP)) : 0;
    out.push({ x: p.x, z: p.z, y: h, nx: -tg.z, nz: tg.x, tx: tg.x, tz: tg.z, d });
  }
  return out;
}

export function buildCurveMesh(pts, bridge, preview, opts = {}) {
  const S = sampleCurve(pts, bridge);
  const g = new THREE.Group();
  if (S.length < 2) return g;
  const hw = ROAD_W / 2;
  g.add(ribbon(S, -hw, hw, .062, preview ? '#7d8fb0' : '#5d626b'));
  g.add(ribbon(S, -hw - WALK_W, -hw, .14, '#cfc9bc'));
  g.add(ribbon(S, hw, hw + WALK_W, .14, '#cfc9bc'));
  g.add(wall(S, -hw - WALK_W, .02, .14, '#b8b2a5'));
  g.add(wall(S, hw + WALK_W, .02, .14, '#b8b2a5'));
  g.add(wall(S, -hw, .02, .2, '#a9a294'));   // curbs, like the straight roads
  g.add(wall(S, hw, .02, .2, '#a9a294'));
  // the centre line continues the straight road's dashes (1.6 long every 3)
  for (const s of S) {
    if (Math.round(s.d * 2) % 6 !== 2 || s.d < 1) continue;
    const d = box(.18, .01, 1.6, '#f2f2f2', s.x, s.y + .07, s.z);
    d.rotation.y = Math.atan2(s.tx, s.tz);
    g.add(d);
  }
  if (bridge) {
    const ew = hw + WALK_W;
    g.add(ribbon(S, -ew, ew, -.7, '#a8a39a', true));
    g.add(wall(S, -ew, -.7, .16, '#bdb7ab'));
    g.add(wall(S, ew, -.7, .16, '#bdb7ab'));
    g.add(wall(S, -ew, .16, 1.15, '#d6d0c4'));
    g.add(wall(S, ew, .16, 1.15, '#d6d0c4'));
    let last = -99;
    for (let k = 0; k < S.length; k++) {
      const s = S[k];
      if (s.y < 2.5 || s.d - last < 9) continue;
      // a pillar may not stand on a road built underneath: move it along a little, or leave it out
      let q = s;
      if (opts.skip?.(s.x, s.z)) {
        q = null;
        for (let o = 1; o <= 5 && !q; o++) for (const kk of [k + o, k - o]) { const t = S[kk]; if (t && t.y >= 2.5 && !opts.skip(t.x, t.z)) { q = t; break; } }
        if (!q) continue;
      }
      last = s.d;
      g.add(cyl(.7, .9, q.y - .7, '#bdb7ab', q.x, (q.y - .7) / 2, q.z, null, 12));
    }
  }
  if (preview) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .6; } });
  else { mergeStatic(g); shadows(g); }
  return g;
}

// a curved road that starts or ends on a road tile leaves that tile from its edge, straight out,
// and that side of the tile opens up (no sidewalk) so both roads join cleanly
// only = 0 / 1: just that end; tile: the road tile to join when the end lies on the grass next to it
function attach(game, pts, only = null, tile = null) {
  const T = game.tiles, H = TILE / 2, links = [];
  const fix = (end, next, e) => {
    if (only !== null && e !== only) return [end];
    let i = tileOf(end.x), j = tileOf(end.z);
    if (!T.isDrivable(i, j) && tile) { i = tile.i; j = tile.j; }
    if (!T.isDrivable(i, j)) return [end];
    // leave through a side that has no road yet, the one facing where the curve goes
    const dx = next.x - i * TILE, dz = next.z - j * TILE, l = Math.hypot(dx, dz) || 1;
    let si = 0, sj = 0, bestDot = -2;
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (T.isDrivable(i + a, j + c)) continue;
      const dot = (a * dx + c * dz) / l;
      if (dot > bestDot) { bestDot = dot; si = a; sj = c; }
    }
    if (!si && !sj) return [end];   // a crossing: no free side
    links.push({ i, j, side: si > 0 ? 'e' : si < 0 ? 'w' : sj > 0 ? 's' : 'n', end: e });
    const ex = i * TILE + si * H, ez = j * TILE + sj * H;
    return [{ x: ex, z: ez }, { x: ex + si * 3, z: ez + sj * 3 }];
  };
  const a = fix(pts[0], pts[1], 0);
  const b = fix(pts[pts.length - 1], pts[pts.length - 2], 1).reverse();
  return { pts: [...a, ...pts.slice(1, -1), ...b], links };
}

export class Curves {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }
  add(pts, bridge, o = {}) {
    if (pts.length < 2) return null;
    let links = o.links;
    if (!links) ({ pts, links } = attach(this.game, pts));
    const c = { id: o.id ?? this.nextId++, pts: pts.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })), bridge: !!bridge, links };
    this.nextId = Math.max(this.nextId, c.id + 1);
    // over water a curved road lifts itself onto a deck (boats pass underneath)
    c.lift = c.bridge ? null : this.liftFor(c.pts);
    const prof = c.bridge || c.lift || false;
    c.S = sampleCurve(c.pts, prof);
    // pillars never stand on a road or in water
    c.group = buildCurveMesh(c.pts, prof, false, { skip: (x, z) => this.game.tiles.isDrivable(tileOf(x), tileOf(z)) || !!this.game.water?.wetAt(x, z, 1.5) });
    this.game.scene.add(c.group);
    // tiles under a ground-level road can't hold buildings
    c.tiles = new Set();
    c.allTiles = new Set();
    for (const s of c.S) {
      c.allTiles.add(tileOf(s.x) + ',' + tileOf(s.z));
      if (s.y > 1.5) continue;
      for (const off of [-ROAD_W / 2 - 1, 0, ROAD_W / 2 + 1]) c.tiles.add(tileOf(s.x + s.nx * off) + ',' + tileOf(s.z + s.nz * off));
    }
    for (const k of c.allTiles) { const [i, j] = k.split(',').map(Number); this.game.tiles.rec(i, j).curveAny = (this.game.tiles.rec(i, j).curveAny || 0) + 1; }
    for (const k of c.tiles) { const [i, j] = k.split(',').map(Number); this.game.tiles.rec(i, j).curve++; }
    for (const k of c.tiles) { const [i, j] = k.split(',').map(Number); this.game.tiles.stampCost(i, j); }
    for (const l of c.links) { const r = this.game.tiles.rec(l.i, l.j); (r.links ||= { n: 0, s: 0, e: 0, w: 0 })[l.side]++; this.game.tiles.rebuild(l.i, l.j); }
    for (const s of sampleCurve(c.pts, false)) this.game.props.clearRect(s.x - 5, s.z - 5, s.x + 5, s.z + 5);
    this.list.push(c);
    return c;
  }
  // walking costs on a tile from the curved roads crossing it (see tiles.stampCost)
  stampCost(i, j) {
    const grid = this.game.world.grid, C = grid.cost, n = grid.n, key = i + ',' + j;
    const hw = ROAD_W / 2, x0 = i * TILE - TILE / 2, z0 = j * TILE - TILE / 2;
    for (const c of this.list) {
      if (!c.tiles.has(key)) continue;
      for (const s of c.S) {
        for (let o = -hw - WALK_W; o <= hw + WALK_W; o += .5) {
          const x = s.x + s.nx * o, z = s.z + s.nz * o;
          if (x < x0 || x >= x0 + TILE || z < z0 || z >= z0 + TILE) continue;
          const ci = grid.cell(x), cj = grid.cell(z);
          if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue;
          C[cj * n + ci] = Math.abs(o) > hw ? 1 : 6;
        }
      }
    }
  }
  // height profile over water: a deck at bridge height above the water, 10 m ramps either side
  liftFor(pts) {
    const water = this.game.water;
    if (!water?.list.length) return null;
    const wet = sampleCurve(pts, false).filter(s => water.wetAt(s.x, s.z, 1.5)).map(s => s.d);
    if (!wet.length) return null;
    // ...and always back down to the road at both ends (no step where it joins a street)
    return (d, L) => { let m = Infinity; for (const w of wet) m = Math.min(m, Math.abs(d - w)); return DECK_H * smooth(1 - (m - 1) / 10) * Math.min(smooth(d / 7), smooth((L - d) / 7)); };
  }
  // the height people walk at on a lifted curved road (0 = not on one)
  heightAt(x, z) {
    let y = 0;
    for (const c of this.list) {
      if (!c.lift) continue;
      for (const s of c.S) if (s.y > y && Math.hypot(s.x - x, s.z - z) < ROAD_W / 2 + WALK_W) y = s.y;
    }
    return y;
  }
  covers(x, z) { return this.list.some(c => c.S.some(s => Math.hypot(s.x - x, s.z - z) < ROAD_W / 2 + WALK_W)); }
  // a road was built where a curved road ends (or right next to that end): join them now
  linkLater(i, j) {
    const cx = i * TILE, cz = j * TILE;
    for (const c of [...this.list]) {
      for (const e of [0, 1]) {
        const p = e ? c.pts[c.pts.length - 1] : c.pts[0];
        if (Math.hypot(p.x - cx, p.z - cz) > 10) continue;
        const linked = c.links.some(l => (l.end ?? (Math.hypot(l.i * TILE - p.x, l.j * TILE - p.z) < 9 ? e : -1)) === e);
        if (linked) continue;
        const r = attach(this.game, c.pts, e, { i, j });
        if (!r.links.length) continue;
        const d = { pts: r.pts, bridge: c.bridge, id: c.id, links: [...c.links, ...r.links] };
        this.remove(c);
        this.add(d.pts, d.bridge, { id: d.id, links: d.links });
        break;
      }
    }
  }
  // the free end of a curved road near p (to start / end a new one exactly there)
  endNear(x, z, r = 5) {
    let best = null, bd = r;
    for (const c of this.list) for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = { x: p.x, z: p.z }; }
    }
    return best;
  }
  // rebuild a curved road (water or roads changed underneath)
  refresh(c) {
    const d = { pts: c.pts, bridge: c.bridge, id: c.id, links: c.links };
    this.remove(c);
    return this.add(d.pts, d.bridge, { id: d.id, links: d.links });
  }
  refreshNear(i, j) {
    for (const c of [...this.list]) if ((c.bridge || c.lift) && c.allTiles.has(i + ',' + j)) this.refresh(c);
  }
  refreshIn(b) {
    for (const c of [...this.list]) if (c.S.some(s => s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1)) this.refresh(c);
  }
  remove(c) {
    const i = this.list.indexOf(c);
    if (i < 0) return;
    for (const k of c.allTiles || []) { const [a, b] = k.split(',').map(Number); const r = this.game.tiles.get(a, b); if (r) r.curveAny = Math.max(0, (r.curveAny || 0) - 1); }
    this.list.splice(i, 1);
    this.game.scene.remove(c.group);
    c.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    for (const k of c.tiles) { const [a, b] = k.split(',').map(Number); const r = this.game.tiles.get(a, b); if (r) r.curve = Math.max(0, r.curve - 1); this.game.tiles.stampCost(a, b); }
    for (const l of c.links || []) { const r = this.game.tiles.get(l.i, l.j); if (r?.links) r.links[l.side] = Math.max(0, r.links[l.side] - 1); this.game.tiles.rebuild(l.i, l.j); }
  }
  nearest(x, z, r = 6) {
    let best = null, bd = r;
    for (const c of this.list) for (const s of sampleCurve(c.pts, false)) { const d = dist2d(s, { x, z }); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  toJSON() { return this.list.map(c => ({ id: c.id, pts: c.pts, bridge: c.bridge, links: c.links })); }
  clear() { for (const c of [...this.list]) this.remove(c); }
}
