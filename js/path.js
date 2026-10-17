// Walkable grid + A* path finding so characters walk around walls and furniture.
// 1 cell = 1 unit. The grid is big enough for the largest land the town can expand to.
export const TILE = 12;          // one road / building tile = 12 x 12 units
export const MAX_R = 20;         // land can grow to 41 x 41 tiles
export const GMIN = -(MAX_R * TILE + TILE / 2);
export const GN = -GMIN * 2;

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

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class Grid {
  constructor() {
    const n = GN * GN;
    this.n = GN;
    this.block = new Uint16Array(n);
    this.wet = new Uint8Array(n);   // water (see water.js)
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.done = new Uint32Array(n);
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
  free(i, j) { const k = j * GN + i; return this.ok(i, j) && this.block[k] === 0 && !this.wet[k]; }
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

  nearestFree(i, j, maxR = 15) {
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.free(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }

  lineFree(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .35);
    for (let s = 1; s <= n; s++) {
      if (!this.freeAt(ax + (bx - ax) * s / n, az + (bz - az) * s / n)) return false;
    }
    return true;
  }

  // returns a list of {x,z} waypoints ending exactly at the target
  findPath(sx, sz, tx, tz) {
    const target = { x: tx, z: tz };
    const cl = v => Math.min(this.hi, Math.max(this.lo, v));
    let si = cl(this.cell(sx)), sj = cl(this.cell(sz));
    let ti = cl(this.cell(tx)), tj = cl(this.cell(tz));
    if (!this.free(ti, tj)) { const nf = this.nearestFree(ti, tj); if (!nf) return [target]; [ti, tj] = nf; }
    if (!this.free(si, sj)) { const nf = this.nearestFree(si, sj, 4); if (nf) [si, sj] = nf; }
    if (si === ti && sj === tj) return [target];
    if (this.lineFree(sx, sz, this.center(ti), this.center(tj))) return [{ x: this.center(ti), z: this.center(tj) }, target];

    const S = ++this.stamp;
    const { g, from, seen, done, heap } = this;
    heap.clear();
    const start = sj * GN + si, goal = tj * GN + ti;
    const h = k => {
      const dx = Math.abs(k % GN - ti), dz = Math.abs(((k / GN) | 0) - tj);
      return Math.max(dx, dz) + .414 * Math.min(dx, dz);
    };
    g[start] = 0; seen[start] = S; from[start] = -1;
    heap.push(start, h(start));
    let found = false, iter = 0;
    while (heap.size && iter++ < 60000) {
      const k = heap.pop();
      if (done[k] === S) continue;
      if (k === goal) { found = true; break; }
      done[k] = S;
      const i = k % GN, j = (k / GN) | 0;
      for (const [dx, dz, cost] of DIRS) {
        const ni = i + dx, nj = j + dz;
        if (!this.free(ni, nj)) continue;
        if (dx && dz && (!this.free(i + dx, j) || !this.free(i, j + dz))) continue;
        const nk = nj * GN + ni, ng = g[k] + cost;
        if (seen[nk] !== S || ng < g[nk]) { seen[nk] = S; g[nk] = ng; from[nk] = k; heap.push(nk, ng + h(nk)); }
      }
    }
    if (!found) return [target];

    const cells = [];
    for (let k = goal; k !== start && k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    const pts = [{ x: sx, z: sz }, ...cells.map(k => ({ x: this.center(k % GN), z: this.center((k / GN) | 0) })), target];

    // straighten the zig-zag: skip points while there is a clear line of sight
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      let b = Math.min(pts.length - 1, a + 40);
      while (b > a + 1 && !this.lineFree(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }
}
