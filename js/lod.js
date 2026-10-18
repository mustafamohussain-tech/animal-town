// Big towns (10,000 residents and buildings): only what is near the camera gets its full 3D model.
//  - Chunks: the map is cut into squares; roads, street things and buildings in a square are built when
//    the camera comes near it and removed again when it goes away (a few per frame, so it never stutters).
//  - Far away buildings are simple coloured blocks with a roof (all of them drawn in one go),
//    far trees are simple tree shapes, and far roads are painted on the ground (LandMap).
import * as THREE from 'three';
import { TILE } from './path.js';
import { clamp } from './util.js';

export const CHUNK = 48;   // 4 x 4 tiles

export class Chunks {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.queue = [];
    this.timer = 0;
    this.listeners = [];
  }
  key(x, z) { return Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK); }
  chunk(x, z) {
    const k = this.key(x, z);
    let c = this.map.get(k);
    if (!c) {
      const [a, b] = k.split(',').map(Number);
      c = { k, x0: a * CHUNK, z0: b * CHUNK, on: {}, items: new Set(), d: Infinity };
      this.map.set(k, c);
    }
    return c;
  }
  // item = { layer, x, z, build(), drop() }: build() makes its 3D model, drop() removes it
  add(item) {
    const c = item.chunk = this.chunk(item.x, item.z);
    c.items.add(item);
    if (c.on[item.layer]) this.want(item);
  }
  remove(item) {
    item.chunk?.items.delete(item);
    item.chunk = null;
    if (item.built) { item.built = false; item.drop(); }
  }
  // the item changed: rebuild it now if it is near (or later, when the camera gets there)
  refresh(item) {
    if (item.built) { item.built = false; item.drop(); }
    if (item.chunk?.on[item.layer]) this.want(item);
  }
  isOn(x, z, layer) { return !!this.map.get(this.key(x, z))?.on[layer]; }
  want(item) { if (!item.queued) { item.queued = true; this.queue.push(item); this.sorted = false; } }
  onChange(fn) { this.listeners.push(fn); }

  // how far each kind of thing is drawn in full (further when the camera is high up)
  radii() {
    const w = this.game.world, d = w.camera.position.distanceTo(w.controls.target);
    // closer: the full models reach further; very high up everything is simple (too small to see the details)
    const up = (r0, k, r1) => d <= 220 ? clamp(r0 + d * k, r0, r1) : Math.max(0, r1 - (d - 220) * .55);
    return { tile: up(105, .35, 180), prop: up(100, .3, 170), bld: up(85, .25, 135) };
  }
  scan() {
    const t = this.game.world.controls.target, R = this.radii(), changed = new Set();
    for (const c of this.map.values()) {
      const dx = Math.max(c.x0 - t.x, 0, t.x - c.x0 - CHUNK), dz = Math.max(c.z0 - t.z, 0, t.z - c.z0 - CHUNK);
      c.d = Math.hypot(dx, dz);
      for (const L in R) {
        const on = c.d < R[L] + (c.on[L] ? 24 : 0);   // a little extra before removing (no flicker at the edge)
        if (on === !!c.on[L]) continue;
        c.on[L] = on;
        changed.add(L);
        for (const it of c.items) {
          if (it.layer !== L) continue;
          if (on) this.want(it);
          else if (it.built) { it.built = false; it.drop(); }
        }
      }
    }
    if (changed.size) { this.sorted = false; for (const f of this.listeners) f(changed); }
  }
  // build the waiting items, nearest first, a few milliseconds per frame
  work(budget = 6) {
    if (!this.queue.length) return;
    if (!this.sorted) { this.queue.sort((a, b) => (b.chunk?.d ?? 1e9) - (a.chunk?.d ?? 1e9)); this.sorted = true; }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budget) {
      const it = this.queue.pop();
      it.queued = false;
      if (!it.chunk || !it.chunk.on[it.layer] || it.built) continue;
      it.built = true;
      it.build();
    }
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = .25; this.scan(); }
    this.work();
  }
  // after loading a town: build everything near the camera at once
  flush() { this.scan(); this.work(1e9); }
  clear() { this.map.clear(); this.queue = []; }
}

// ---------- the land with the far roads painted on it ----------
const PX = 8;   // pixels per tile
export class LandMap {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.magFilter = THREE.NearestFilter;   // crisp tile edges (no grey halo beside the real roads)
    this.dirty = true;
    this.timer = 0;
  }
  mark() { this.dirty = true; }
  update(dt) {
    this.timer -= dt;
    if (!this.dirty || this.timer > 0) return;
    this.timer = .5;
    this.dirty = false;
    this.draw();
  }
  draw() {
    const g = this.game, R = g.world.landR, n = 2 * R + 1, N = n * PX, T = g.tiles;
    const c = this.canvas;
    if (c.width !== N) { c.width = c.height = N; this.tex.dispose(); }
    const x = c.getContext('2d');
    x.fillStyle = '#8fd67a';
    x.fillRect(0, 0, N, N);
    const sw = Math.max(1, Math.round(PX * 2.6 / TILE));
    for (const [k, r] of T.tiles) {
      if (!r.road && !r.dirt) continue;
      const [i, j] = k.split(',').map(Number);
      if (Math.abs(i) > R || Math.abs(j) > R) continue;
      const px = (i + R) * PX, pz = (j + R) * PX;
      const N_ = T.isDrivable(i, j - 1), S_ = T.isDrivable(i, j + 1), E_ = T.isDrivable(i + 1, j), W_ = T.isDrivable(i - 1, j);
      if (r.road) {
        x.fillStyle = '#cfc9bc';
        x.fillRect(px, pz, PX, PX);
        x.fillStyle = '#5d626b';
        x.fillRect(px + (W_ ? 0 : sw), pz + (N_ ? 0 : sw), PX - (W_ ? 0 : sw) - (E_ ? 0 : sw), PX - (N_ ? 0 : sw) - (S_ ? 0 : sw));
      } else {
        x.fillStyle = '#b08a5c';
        const m = Math.round(PX * .3);
        x.fillRect(px + (W_ ? 0 : m), pz + (N_ ? 0 : m), PX - (W_ ? 0 : m) - (E_ ? 0 : m), PX - (N_ ? 0 : m) - (S_ ? 0 : m));
      }
    }
    // building plots: a little paler, so the far blocks stand on their own ground
    x.fillStyle = 'rgba(236, 230, 210, .55)';
    for (const b of g.town.all) {
      for (const [i, j] of b.tiles) x.fillRect((i + R) * PX + 1, (j + R) * PX + 1, PX - 2, PX - 2);
    }
    this.tex.needsUpdate = true;
  }
}

// ---------- far buildings: one block + roof each, all drawn together ----------
const OPEN_COL = { farm: '#a4c86a', dock: '#4fb3e8', garage: '#5d626b', park: '#73c25f' };
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
export class BuildingProxies {
  constructor(game) {
    this.game = game;
    this.slots = [];      // slot -> building
    this.free = [];
    this.cap = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.col = new THREE.Color();
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, .5, 0);
    this.geo = { body: box, roof: pyr, slab: box };
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9 }),
      roof: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8 }),
      slab: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8 }),
    };
    this.meshes = {};
    this.grow(1024);
  }
  grow(cap) {
    const old = this.meshes;
    for (const k of ['body', 'roof', 'slab']) {
      const m = new THREE.InstancedMesh(this.geo[k], this.mats[k], cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.frustumCulled = false;
      m.receiveShadow = false;
      m.castShadow = false;
      m.count = this.cap;
      for (let i = 0; i < cap; i++) m.setMatrixAt(i, HIDE);
      if (old[k]) {
        m.instanceMatrix.array.set(old[k].instanceMatrix.array);
        m.instanceColor.array.set(old[k].instanceColor.array);
        this.game.scene.remove(old[k]);
        old[k].dispose();
      }
      m.userData.proxy = true;
      this.game.scene.add(m);
      this.meshes[k] = m;
    }
    this.cap = cap;
  }
  slotOf(b) {
    if (b.slot != null) return b.slot;
    let s = this.free.pop();
    if (s == null) {
      s = this.slots.length;
      if (s >= this.cap) this.grow(this.cap * 2);
    }
    this.slots[s] = b;
    b.slot = s;
    for (const m of Object.values(this.meshes)) m.count = Math.max(m.count, s + 1);
    return s;
  }
  set(k, s, x, y, z, sx, sy, sz, ang, color) {
    const m = this.meshes[k];
    if (!sx) m.setMatrixAt(s, HIDE);
    else {
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
      this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
      m.setMatrixAt(s, this.m);
      m.setColorAt(s, this.col.set(color));
      m.instanceColor.needsUpdate = true;
    }
    m.instanceMatrix.needsUpdate = true;
  }
  // show the simple block (b asleep) or hide it (b has its full model, or is gone)
  show(b, on) {
    if (!on && b.slot == null) return;
    const s = this.slotOf(b), { cx, cz, W, D, angle } = b;
    if (!on) { for (const k of ['body', 'roof', 'slab']) this.set(k, s, 0, 0, 0, 0); return; }
    const sp = b.spec, px = b.def.proxy;
    if (px && b.complete) {
      // a landmark: a block of its main hall, with a dome (pyramid) or a flat roof
      const w = W * px.k, d = D * px.k;
      this.set('body', s, cx, 0, cz, w, px.h, d, angle, px.wall);
      if (px.shape === 'pyr') { this.set('roof', s, cx, px.h, cz, w * .6, w * .45, d * .6, angle, px.roof); this.set('slab', s, 0, 0, 0, 0); }
      else if (px.shape === 'flat') { this.set('slab', s, cx, px.h, cz, w + .4, .5, d + .4, angle, px.roof); this.set('roof', s, 0, 0, 0, 0); }
      else { this.set('roof', s, 0, 0, 0, 0); this.set('slab', s, 0, 0, 0, 0); }
      return;
    }
    if (b.def.open) {
      this.set('body', s, cx, 0, cz, W, .35, D, angle, OPEN_COL[b.type] || '#9ccc65');
      this.set('roof', s, 0, 0, 0, 0); this.set('slab', s, 0, 0, 0, 0);
      return;
    }
    const H = b.wallTop();
    if (!b.complete) {
      // a building site: the part already built, in the colour of the scaffolding
      const h = Math.max(.6, H * b.progress);
      this.set('body', s, cx, 0, cz, W, h, D, angle, '#c89b5a');
      this.set('roof', s, 0, 0, 0, 0); this.set('slab', s, 0, 0, 0, 0);
      return;
    }
    this.set('body', s, cx, 0, cz, W, H, D, angle, sp.wall || '#e8e2d6');
    if (sp.roof === 'flat') {
      this.set('slab', s, cx, H, cz, W + .4, .45, D + .4, angle, sp.roofColor || '#4a4f5a');
      this.set('roof', s, 0, 0, 0, 0);
    } else {
      this.set('roof', s, cx, H, cz, W + .8, Math.min(W, D) * .32, D + .8, angle, sp.roofColor || '#8e5a3a');
      this.set('slab', s, 0, 0, 0, 0);
    }
  }
  release(b) {
    if (b.slot == null) return;
    this.show(b, false);
    this.slots[b.slot] = null;
    this.free.push(b.slot);
    b.slot = null;
  }
  // which far building is under the mouse
  pick(raycaster) {
    let best = null;
    for (const k of ['body', 'roof', 'slab']) {
      this.meshes[k].boundingSphere = null;   // blocks come and go: measure again
      const h = raycaster.intersectObject(this.meshes[k], false)[0];
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best ? { b: this.slots[best.instanceId], distance: best.distance } : null;
  }
  clear() {
    for (const b of this.slots) if (b) b.slot = null;
    this.slots = [];
    this.free = [];
    for (const m of Object.values(this.meshes)) { for (let i = 0; i < m.count; i++) m.setMatrixAt(i, HIDE); m.count = 0; m.instanceMatrix.needsUpdate = true; }
  }
}

// ---------- far trees: a trunk and a crown each, all drawn together ----------
export class TreeProxies {
  constructor(game) {
    this.game = game;
    this.cap = 0;
    this.mats = [
      new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: 1, flatShading: true }),
    ];
    this.geos = [new THREE.CylinderGeometry(.3, .4, 2.4, 5).translate(0, 1.2, 0), new THREE.IcosahedronGeometry(1.9, 0).translate(0, 3.6, 0)];
    this.meshes = [];
    this.dirty = true;
    this.timer = 0;
  }
  mark() { this.dirty = true; }
  update(dt) {
    this.timer -= dt;
    if (!this.dirty || this.timer > 0) return;
    this.timer = .4;
    this.dirty = false;
    const list = this.game.props.list.filter(p => p.type === 'tree' && !p.group);
    if (list.length > this.cap) {
      for (const m of this.meshes) { this.game.scene.remove(m); m.dispose(); }
      this.cap = Math.max(1024, list.length * 1.5 | 0);
      this.meshes = this.geos.map((g, k) => {
        const m = new THREE.InstancedMesh(g, this.mats[k], this.cap);
        m.frustumCulled = false;
        m.castShadow = m.receiveShadow = false;
        this.game.scene.add(m);
        return m;
      });
    }
    const M = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    list.forEach((t, i) => {
      s.setScalar(t.scale);
      p.set(t.x, 0, t.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot);
      M.compose(p, q, s);
      for (const m of this.meshes) m.setMatrixAt(i, M);
    });
    for (const m of this.meshes) { m.count = list.length; m.instanceMatrix.needsUpdate = true; }
  }
}
