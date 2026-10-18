// Walkable grid + A* path finding so characters walk around walls and furniture.
// 1 cell = 1 unit. The grid is big enough for the largest land the town can expand to.
export const TILE = 12;          // one road / building tile = 12 x 12 units
export const MAX_R = 75;         // land can grow to 151 x 151 tiles (room for 10,000+ buildings)
export const GMIN = -(MAX_R * TILE + TILE / 2);
export const GN = -GMIN * 2;
// walking cost of a cell where people never walk (grass, the driving part of roads): see tiles.stampCost
export const NO_WALK = 255;

class Heap {
  constructor() { this.k = []; this.f = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.f.length = 0; }
  push(k, f) {
    let i = this.k.length;
    this.k.push(k); this.f.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= f) break;
      this.k[i] = this.k[p]; this.f[i] = this.f[p]; i = p;
    }
    this.k[i] = k; this.f[i] = f;
  }
  pop() {
    const top = this.k[0], lk = this.k.pop(), lf = this.f.pop(), n = this.k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mf = lf;
        if (l < n && this.f[l] < mf) { m = l; mf = this.f[l]; }
        if (r < n && this.f[r] < mf) { m = r; mf = this.f[r]; }
        if (m === i) break;
        this.k[i] = this.k[m]; this.f[i] = this.f[m]; i = m;
      }
      this.k[i] = lk; this.f[i] = lf;
    }
    return top;
  }
}

const WIN = 420;   // the largest search window (cells per side); longer walks are found in parts
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class Grid {
  constructor() {
    const n = GN * GN;
    this.n = GN;
    this.block = new Uint16Array(n);
    this.wet = new Uint8Array(n);   // water (see water.js)
    // where people walk: 1 sidewalk / dirt road / path / beach / building plot, 2 zebra crossing,
    // NO_WALK grass and the driving part of roads (see tiles.stampCost)
    this.cost = new Uint8Array(n).fill(NO_WALK);
    this.soft = false;   // true for a moment when there is no walkable way at all (then grass is allowed)
    // search memory only for a window around each walk (not the whole map): a big town stays light
    const W = WIN * WIN;
    this.g = new Float32Array(W);
    this.from = new Int32Array(W);
    this.seen = new Uint32Array(W);
    this.done = new Uint32Array(W);
    this.stamp = 0;
    this.heap = new Heap();
    this.setLand(5);
  }
  // only cells inside the current land are walkable
  setLand(r) {
    const half = r * TILE + TILE / 2;
    this.lo = this.cell(-half);
    this.hi = this.cell(half) - 1;
  }
  cell(v) { return Math.floor(v - GMIN); }
  center(i) { return GMIN + i + .5; }
  ok(i, j) { return i >= this.lo && j >= this.lo && i <= this.hi && j <= this.hi; }
  free(i, j) { const k = j * GN + i; return this.ok(i, j) && this.block[k] === 0 && !this.wet[k] && (this.soft || this.cost[k] !== NO_WALK); }
  freeAt(x, z) { return this.free(this.cell(x), this.cell(z)); }

  // block (+1) or unblock (-1) every cell whose centre lies inside the rectangle
  mark(x0, z0, x1, z1, d) {
    const i0 = Math.max(0, this.cell(x0)), i1 = Math.min(GN - 1, this.cell(x1));
    const j0 = Math.max(0, this.cell(z0)), j1 = Math.min(GN - 1, this.cell(z1));
    for (let j = j0; j <= j1; j++) {
      const cz = this.center(j);
      if (cz <= z0 || cz >= z1) continue;
      for (let i = i0; i <= i1; i++) {
        const cx = this.center(i);
        if (cx <= x0 || cx >= x1) continue;
        const k = j * GN + i;
        this.block[k] = Math.max(0, this.block[k] + d);
      }
    }
  }

  // the closest free cell, ring by ring (only the ring's edge is checked: fast for big rings)
  nearestFree(i, j, maxR = 15) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      for (let d = -r; d <= r; d++) {
        if (this.free(i + d, j - r)) return [i + d, j - r];
        if (this.free(i + d, j + r)) return [i + d, j + r];
        if (this.free(i - r, j + d)) return [i - r, j + d];
        if (this.free(i + r, j + d)) return [i + r, j + d];
      }
    }
    return null;
  }

  // straight line that stays free and never crosses cells people like less than both ends (no shortcuts over grass)
  lineCheap(ax, az, bx, bz) {
    const ca = this.costAt(ax, az), cb = this.costAt(bx, bz), lim = Math.max(ca, cb);
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .35);
    for (let s = 1; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
      if (!this.freeAt(x, z) || this.costAt(x, z) > lim) return false;
    }
    return true;
  }
  costAt(x, z) { const i = this.cell(x), j = this.cell(z), c = (i < 0 || j < 0 || i >= GN || j >= GN) ? NO_WALK : this.cost[j * GN + i]; return c === NO_WALK && this.soft ? 8 : c; }
  lineFree(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .35);
    for (let s = 1; s <= n; s++) {
      if (!this.freeAt(ax + (bx - ax) * s / n, az + (bz - az) * s / n)) return false;
    }
    return true;
  }

  // returns a list of {x,z} waypoints ending exactly at the target
  findPath(sx, sz, tx, tz) {
    // people walk only on sidewalks, crossings, dirt roads, paths and beaches; someone standing on the grass
    // first steps to the nearest of those. Only when there is none at all, grass is allowed.
    this.soft = false;
    const ci = this.cell(sx), cj = this.cell(sz), ki = this.cell(tx), kj = this.cell(tz);
    const reach = (i, j) => this.free(i, j) || !!this.nearestFree(i, j, 60);
    if (!reach(ci, cj) || !reach(ki, kj)) this.soft = true;
    try { return this.search(sx, sz, tx, tz); } finally { this.soft = false; }
  }
  search(sx, sz, tx, tz) {
    const target = { x: tx, z: tz };
    this.lastCut = false;
    const cl = v => Math.min(this.hi, Math.max(this.lo, v));
    let si = cl(this.cell(sx)), sj = cl(this.cell(sz));
    let ti = cl(this.cell(tx)), tj = cl(this.cell(tz));
    // a target inside a wall: stop at the nearest free spot instead of walking into it
    let end = target;
    if (!this.free(ti, tj)) { const nf = this.nearestFree(ti, tj, 60); if (!nf) return [{ x: sx, z: sz }]; [ti, tj] = nf; end = { x: this.center(ti), z: this.center(tj) }; }
    if (!this.free(si, sj)) { const nf = this.nearestFree(si, sj, 60); if (nf) [si, sj] = nf; }
    // a very long walk goes part of the way (it continues from there later)
    const LIM = (WIN - 2 * 40) / 2;
    if (Math.abs(ti - si) > LIM || Math.abs(tj - sj) > LIM) {
      this.lastCut = true;
      const f = LIM / Math.max(Math.abs(ti - si), Math.abs(tj - sj));
      ti = Math.round(si + (ti - si) * f); tj = Math.round(sj + (tj - sj) * f);
      const nf = this.free(ti, tj) ? [ti, tj] : this.nearestFree(ti, tj);
      if (!nf) return [{ x: sx, z: sz }];
      [ti, tj] = nf;
      end = { x: this.center(ti), z: this.center(tj) };
    }
    if (si === ti && sj === tj) return [end];
    if (this.lineCheap(sx, sz, this.center(ti), this.center(tj))) return [{ x: this.center(ti), z: this.center(tj) }, end];

    const S = ++this.stamp;
    const { g, from, seen, done, heap } = this;
    heap.clear();
    // the search window: the box around start and goal with a margin for detours
    const x0 = Math.max(this.lo, Math.min(si, ti) - 40), x1 = Math.min(this.hi, Math.max(si, ti) + 40);
    const z0 = Math.max(this.lo, Math.min(sj, tj) - 40), z1 = Math.min(this.hi, Math.max(sj, tj) + 40);
    const WW = x1 - x0 + 1;
    const L = k => ((k / GN | 0) - z0) * WW + (k % GN - x0);   // window index of a map cell
    const start = sj * GN + si, goal = tj * GN + ti;
    // slightly greedy (x1.6) so long walks stay fast with the walking costs
    const h = k => {
      const dx = Math.abs(k % GN - ti), dz = Math.abs(((k / GN) | 0) - tj);
      return (Math.max(dx, dz) + .414 * Math.min(dx, dz)) * 1.6;
    };
    const C = this.cost;
    let best = start, bestH = Infinity;
    const ls = L(start);
    g[ls] = 0; seen[ls] = S; from[ls] = -1;
    heap.push(start, h(start));
    let found = false, iter = 0;
    while (heap.size && iter++ < 90000) {
      const k = heap.pop(), lk = L(k);
      if (done[lk] === S) continue;
      if (k === goal) { found = true; break; }
      done[lk] = S;
      const hk = h(k);
      if (hk < bestH) { bestH = hk; best = k; }
      const i = k % GN, j = (k / GN) | 0;
      for (const [dx, dz, cost] of DIRS) {
        const ni = i + dx, nj = j + dz;
        if (ni < x0 || ni > x1 || nj < z0 || nj > z1 || !this.free(ni, nj)) continue;
        if (dx && dz && (!this.free(i + dx, j) || !this.free(i, j + dz))) continue;
        const nk = nj * GN + ni, ln = L(nk), ng = g[lk] + cost * (C[nk] === NO_WALK ? 8 : C[nk]);
        if (seen[ln] !== S || ng < g[ln]) { seen[ln] = S; g[ln] = ng; from[ln] = k; heap.push(nk, ng + h(nk)); }
      }
    }
    // can't get there: walk as close as possible (never straight through walls)
    const last = found ? goal : best;
    if (!found) end = { x: this.center(last % GN), z: this.center((last / GN) | 0) };

    const cells = [];
    for (let k = last; k !== start && k !== -1; k = from[L(k)]) cells.push(k);
    cells.reverse();
    const pts = [{ x: sx, z: sz }, ...cells.map(k => ({ x: this.center(k % GN), z: this.center((k / GN) | 0) })), end];

    // straighten the zig-zag: skip points while there is a clear line of sight
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      let b = Math.min(pts.length - 1, a + 40);
      while (b > a + 1 && !this.lineCheap(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }
}
