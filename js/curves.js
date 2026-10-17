// Free curved roads and bridges (a road raised over other roads, with ramps, pillars and railings).
import * as THREE from 'three';
import { TILE } from './path.js';
import { box, cyl, mat, sideMat, mergeStatic, shadows, dist2d } from './util.js';
import { tileOf } from './tiles.js';

const ROAD_W = 9, WALK_W = 1.5, BRIDGE_H = 7.5, RAMP = 22;
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
    const d = u * L, h = bridge ? BRIDGE_H * Math.min(smooth(d / RAMP), smooth((L - d) / RAMP)) : 0;
    out.push({ x: p.x, z: p.z, y: h, nx: -tg.z, nz: tg.x, tx: tg.x, tz: tg.z, d });
  }
  return out;
}

export function buildCurveMesh(pts, bridge, preview) {
  const S = sampleCurve(pts, bridge);
  const g = new THREE.Group();
  if (S.length < 2) return g;
  const hw = ROAD_W / 2;
  g.add(ribbon(S, -hw, hw, .085, preview ? '#7d8fb0' : '#5d626b'));
  g.add(ribbon(S, -hw - WALK_W, -hw, .16, '#cfc9bc'));
  g.add(ribbon(S, hw, hw + WALK_W, .16, '#cfc9bc'));
  g.add(wall(S, -hw - WALK_W, .02, .16, '#b8b2a5'));
  g.add(wall(S, hw + WALK_W, .02, .16, '#b8b2a5'));
  for (const s of S) {
    if (Math.round(s.d) % 3 !== 0 || s.d < 1) continue;
    const d = box(.18, .01, 1.5, '#f2f2f2', s.x, s.y + .095, s.z);
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
    for (const s of S) {
      if (s.y < 2.5 || s.d - last < 9) continue;
      last = s.d;
      g.add(cyl(.7, .9, s.y - .7, '#bdb7ab', s.x, (s.y - .7) / 2, s.z, null, 12));
    }
  }
  if (preview) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .6; } });
  else { mergeStatic(g); shadows(g); }
  return g;
}

// a curved road that starts or ends on a road tile leaves that tile from its edge, straight out,
// and that side of the tile opens up (no sidewalk) so both roads join cleanly
function attach(game, pts) {
  const T = game.tiles, H = TILE / 2, links = [];
  const fix = (end, next) => {
    const i = tileOf(end.x), j = tileOf(end.z);
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
    links.push({ i, j, side: si > 0 ? 'e' : si < 0 ? 'w' : sj > 0 ? 's' : 'n' });
    const ex = i * TILE + si * H, ez = j * TILE + sj * H;
    return [{ x: ex, z: ez }, { x: ex + si * 3, z: ez + sj * 3 }];
  };
  const a = fix(pts[0], pts[1]);
  const b = fix(pts[pts.length - 1], pts[pts.length - 2]).reverse();
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
    c.group = buildCurveMesh(c.pts, c.bridge);
    this.game.scene.add(c.group);
    // tiles under a ground-level road can't hold buildings
    c.tiles = new Set();
    for (const s of sampleCurve(c.pts, c.bridge)) {
      if (s.y > 1.5) continue;
      for (const off of [-ROAD_W / 2 - 1, 0, ROAD_W / 2 + 1]) c.tiles.add(tileOf(s.x + s.nx * off) + ',' + tileOf(s.z + s.nz * off));
    }
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
      for (const s of (c.S ||= sampleCurve(c.pts, c.bridge))) {
        if (s.y > 1.5) continue;   // high part of a bridge: people walk on it, not under it
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
  remove(c) {
    const i = this.list.indexOf(c);
    if (i < 0) return;
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
