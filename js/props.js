// Small things placed on the map: street lamps, traffic lights, trees, benches, flower beds.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, coneGeo, cylGeo, rand, pick, mergeStatic, flatten, shadows, dist2d } from './util.js';
import { NIGHT, addGlow } from './daynight.js';
import { TILE } from './path.js';
import { LEAVES } from './world.js';
import { makeBusStop } from './bus.js';

export const PROP_TYPES = {
  lamp: { emoji: '💡', block: .4 },
  traffic: { emoji: '🚦', block: .4 },
  tree: { emoji: '🌳', block: .8 },
  bench: { emoji: '🪑', block: 1.2 },
  flowers: { emoji: '🌷', block: 0 },
  busstop: { emoji: '🚏', block: 1.2 },
  gardenlamp: { emoji: '🏮', block: .3 },
};
const LIGHT_COLORS = ['#2ecc40', '#ffcf3f', '#ff3b30'];

// ---------- flowers: a natural patch growing in the grass (no planter box) ----------
// Each patch has its own random numbers (from its id), so it always grows back the same.
const GREEN = '#3f8f3a', LEAF = '#4caf50';
const FLOWERS = {
  // a tulip: a closed cup on a straight stem, two long leaves
  tulip(g, x, z, h, r, col) {
    cyl(.022, .028, h, GREEN, x, h / 2, z, g, 5);
    const cup = mesh(sphere(.11, 10, 8), col, x, h + .06, z, g);
    cup.scale.set(1, 1.35, 1);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const t = mesh(coneGeo(.055, .12, 5), col, x + Math.sin(a) * .06, h + .2, z + Math.cos(a) * .06, g); }
    for (const s of [-1, 1]) { const l = mesh(sphere(.06, 6, 5), LEAF, x + s * .07, h * .35, z, g); l.scale.set(.5, 3.2, 1.1); l.rotation.z = s * .35; }
  },
  // a daisy: white (or pink) petals round a yellow middle, facing up
  daisy(g, x, z, h, r, col) {
    cyl(.016, .02, h, GREEN, x, h / 2, z, g, 5);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2, pt = mesh(sphere(.05, 6, 4), col, x + Math.sin(a) * .09, h + .02, z + Math.cos(a) * .09, g);
      pt.scale.set(.75, .22, 1.9);
      pt.rotation.y = a;
    }
    mesh(sphere(.055, 8, 6), '#ffc300', x, h + .04, z, g).scale.y = .6;
    const l = mesh(sphere(.05, 6, 5), LEAF, x + .05, h * .3, z, g);
    l.scale.set(.6, 2.2, 1.2);
  },
  // a rose: layered round petals in a bud, a thorny stem with leaves
  rose(g, x, z, h, r, col) {
    cyl(.02, .026, h, '#2f6b2a', x, h / 2, z, g, 5);
    mesh(sphere(.11, 10, 8), col, x, h + .05, z, g).scale.set(1, .85, 1);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + r, pt = mesh(sphere(.07, 8, 6), col, x + Math.sin(a) * .08, h + .03, z + Math.cos(a) * .08, g);
      pt.scale.set(1, .7, .5);
      pt.rotation.y = a;
    }
    mesh(sphere(.05, 8, 6), col, x, h + .13, z, g);
    for (const s of [-1, 1]) { const l = mesh(sphere(.05, 6, 5), '#2f7d32', x + s * .08, h * (s > 0 ? .45 : .62), z, g); l.scale.set(1.6, .4, 1); }
  },
  // a sunflower: tall, a big yellow head with a brown middle, turned a little to the side
  sunflower(g, x, z, h, r, col) {
    h *= 1.9;
    cyl(.03, .04, h, GREEN, x, h / 2, z, g, 6);
    const head = new THREE.Group();
    head.position.set(x, h + .05, z);
    head.rotation.set(-1.1, r, 0);
    g.add(head);
    cyl(.13, .13, .05, '#5d3a1a', 0, 0, 0, head, 12);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, pt = mesh(sphere(.06, 6, 4), '#ffc300', Math.sin(a) * .2, 0, Math.cos(a) * .2, head); pt.scale.set(.7, .25, 1.8); pt.rotation.y = a; }
    for (const s of [-1, 1]) { const l = mesh(sphere(.09, 6, 5), LEAF, x + s * .12, h * .45, z, g); l.scale.set(1.8, .35, 1.2); l.rotation.z = s * .3; }
  },
  // lavender: a little bush of purple spikes
  lavender(g, x, z, h, r, col) {
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + r, ox = Math.sin(a) * .07, oz = Math.cos(a) * .07, hh = h * (.8 + (k % 3) * .12);
      const st = cyl(.012, .014, hh, '#6a8f5a', x + ox, hh / 2, z + oz, g, 4);
      st.rotation.set(oz * 2, 0, -ox * 2);
      const sp = mesh(sphere(.045, 6, 5), col, x + ox * 1.8, hh + .08, z + oz * 1.8, g);
      sp.scale.set(1, 3.2, 1);
    }
  },
};
const COLORS = {
  tulip: ['#ff3b5c', '#ffb703', '#ff85a1', '#c77dff', '#ffffff', '#e63946', '#fb8500'],
  daisy: ['#ffffff', '#ffffff', '#ffd6e8', '#fff3b0'],
  rose: ['#c1121f', '#e63946', '#ff8fab', '#ffffff', '#ffb4a2'],
  sunflower: ['#ffc300'],
  lavender: ['#9d4edd', '#7b2cbf', '#b185db'],
};
function flowerPatch(root, seed) {
  const g = new THREE.Group();
  g.scale.setScalar(1.3);   // a little bigger than life, so they show from the street
  root.add(g);
  // its own random numbers
  let st = (Math.imul(seed + 7, 2654435761) >>> 0) || 1;
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const kinds = Object.keys(FLOWERS), pk = a => a[Math.floor(rnd() * a.length)];
  // most patches are one kind in several colours, some are a mix
  const mixed = rnd() < .35, main = pk(kinds), n = 11 + Math.floor(rnd() * 8);
  // tufts of grass blades underneath (no box)
  for (let k = 0; k < 10; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 1.05, cx = Math.cos(a) * d, cz = Math.sin(a) * d * .7;
    for (let m = 0; m < 5; m++) {
      const h = .12 + rnd() * .14, bl = mesh(coneGeo(.025, h, 3), m % 2 ? '#4f9a45' : '#5cae4c', cx + (rnd() - .5) * .14, h / 2, cz + (rnd() - .5) * .14, g);
      bl.rotation.set((rnd() - .5) * .6, rnd() * 3, (rnd() - .5) * .6);
    }
  }
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 1.05;
    const kind = mixed ? pk(kinds) : main;
    const h = .35 + rnd() * .3, x = Math.cos(a) * d, z = Math.sin(a) * d * .7;
    FLOWERS[kind](g, x, z, h, rnd() * 6.28, pk(COLORS[kind]));
  }
}

export class Props {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }

  add(type, x, z, rot = 0, o = {}) {
    if (!PROP_TYPES[type]) return null;
    const p = { id: o.id ?? this.nextId++, type, x, z, rot, natural: !!o.natural, group: null, scale: o.scale || rand(.85, 1.25) };
    this.nextId = Math.max(this.nextId, p.id + 1);
    if (type === 'lamp') p.src = this.game.daynight.addSource({ pos: new THREE.Vector3(x, 4.5, z), power: 6 });
    if (type === 'gardenlamp') p.src = this.game.daynight.addSource({ pos: new THREE.Vector3(x, 2.8, z), power: 4 });
    const b = PROP_TYPES[type].block * (type === 'tree' ? p.scale : 1);
    if (b) { p.rect = [x - b, z - b, x + b, z + b]; this.game.world.grid.mark(...p.rect, 1); }
    this.list.push(p);
    // the 3D model is made when the camera comes near (lod.js)
    p.item = { layer: 'prop', x, z, build: () => this.build(p), drop: () => this.drop(p) };
    this.game.chunks.add(p.item);
    if (type === 'tree') this.game.treeProxies.mark();
    return p;
  }
  build(p) {
    const { type, x, z, rot } = p;
    const g = p.group = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    if (type === 'lamp') {
      cyl(.11, .16, 4.4, '#2f343c', 0, 2.2, 0, g, 8);
      box(.5, .12, .5, '#2f343c', 0, 4.45, 0, g);
      const bulb = mesh(sphere(.28), NIGHT.bulb, 0, 4.75, 0, g);
      bulb.userData.keep = true;
      mesh(new THREE.ConeGeometry(.42, .35, 8), '#2f343c', 0, 5.1, 0, g);
      addGlow(g, 0, 4.75, 0, 2.6, 10);
    } else if (type === 'traffic') {
      cyl(.12, .14, 4.2, '#3a3f48', 0, 2.1, 0, g, 8);
      box(.55, 1.5, .45, '#222222', 0, 3.95, .1, g);
      p.lamps = LIGHT_COLORS.map((c, k) => {
        const m = new THREE.Mesh(sphere(.17), new THREE.MeshStandardMaterial({ color: '#333333', emissive: c, emissiveIntensity: 0 }));
        m.position.set(0, 4.45 - k * .5, .34);
        m.userData.keep = true;
        g.add(m);
        return m;
      });
      p.offset = (Math.round(rot / (Math.PI / 2)) & 1) ? 7 : 0;
    } else if (type === 'tree') {
      cyl(.3, .4, 2.4, '#8b5a2b', 0, 1.2, 0, g, 7);
      mesh(new THREE.IcosahedronGeometry(1.8, 0), pick(LEAVES), 0, 3.4, 0, g);
      mesh(new THREE.IcosahedronGeometry(1.2, 0), pick(LEAVES), .6, 4.6, .2, g);
      g.scale.setScalar(p.scale);
    } else if (type === 'bench') {
      box(2.4, .12, .8, '#a0703f', 0, .6, 0, g);
      box(2.4, .7, .1, '#a0703f', 0, 1.05, -.38, g);
      for (const s of [-1, 1]) box(.1, .6, .7, '#555555', s * 1.05, .3, 0, g);
    } else if (type === 'gardenlamp') {
      // a short park lamp with a round globe (for parks, paths and open areas)
      cyl(.07, .1, 2.6, '#2f3a33', 0, 1.3, 0, g, 8);
      cyl(.18, .22, .2, '#2f3a33', 0, .1, 0, g, 8);
      cyl(.12, .12, .12, '#2f3a33', 0, 2.65, 0, g, 8);
      const globe = mesh(sphere(.32), NIGHT.bulb, 0, 2.95, 0, g);
      globe.userData.keep = true;
      addGlow(g, 0, 2.95, 0, 2, 8);
    } else if (type === 'busstop') {
      makeBusStop(this.game, g);
    } else if (type === 'flowers') {
      flowerPatch(g, p.id);
      g.updateMatrixWorld(true);
      flatten(g);   // (the sunflower heads too) -> few draw calls
    }
    mergeStatic(g);
    shadows(g);
    this.game.scene.add(g);
    if (type === 'tree') this.game.treeProxies.mark();
  }
  drop(p) {
    if (!p.group) return;
    this.game.scene.remove(p.group);
    p.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    p.group = null;
    p.lamps = null;
    if (p.type === 'tree') this.game.treeProxies.mark();
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.game.chunks.remove(p.item);
    this.drop(p);
    if (p.rect) this.game.world.grid.mark(...p.rect, -1);
    if (p.src) this.game.daynight.removeSource(p.src);
    if (p.type === 'tree') this.game.treeProxies.mark();
  }

  // remove props inside a rectangle (e.g. when a building or road is placed there)
  clearRect(x0, z0, x1, z1) {
    for (const p of [...this.list]) if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) this.remove(p);
  }
  nearest(x, z, r = 2.5) {
    let best = null, bd = r;
    for (const p of this.list) { const d = dist2d(p, { x, z }); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // wild trees on empty land (ring of tiles from radius r0 to r1)
  sprinkle(r0, r1) {
    const tiles = this.game.tiles;
    for (let i = -r1; i <= r1; i++) for (let j = -r1; j <= r1; j++) {
      const ring = Math.max(Math.abs(i), Math.abs(j));
      if (ring < r0 || ring > r1 || ring <= 1) continue;
      if (!tiles.freeForBuilding(i, j)) continue;
      if (Math.random() > .4) continue;
      const n = Math.random() < .3 ? 2 : 1;
      for (let k = 0; k < n; k++) this.add('tree', i * TILE + rand(-4, 4), j * TILE + rand(-4, 4), rand(0, 6), { natural: true });
    }
  }

  update(dt, tm) {
    for (const p of this.list) {
      if (!p.lamps) continue;
      const ph = (tm + p.offset) % 14;
      const on = ph < 6 ? 0 : ph < 8 ? 1 : 2;
      p.lamps.forEach((m, k) => { m.material.emissiveIntensity = k === on ? 2.4 : 0; });
    }
  }

  toJSON() { return this.list.map(p => ({ id: p.id, type: p.type, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: +p.rot.toFixed(3), natural: p.natural, scale: +p.scale.toFixed(2) })); }
  clear() { for (const p of [...this.list]) this.remove(p); }
}
