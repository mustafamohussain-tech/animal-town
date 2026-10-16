// Small things placed on the map: street lamps, traffic lights, trees, benches, flower beds.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, rand, pick, mergeStatic, shadows, dist2d } from './util.js';
import { NIGHT, addGlow } from './daynight.js';
import { TILE } from './path.js';
import { LEAVES } from './world.js';

export const PROP_TYPES = {
  lamp: { emoji: '💡', block: .4 },
  traffic: { emoji: '🚦', block: .4 },
  tree: { emoji: '🌳', block: .8 },
  bench: { emoji: '🪑', block: 1.2 },
  flowers: { emoji: '🌷', block: 0 },
};
const LIGHT_COLORS = ['#2ecc40', '#ffcf3f', '#ff3b30'];

export class Props {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }

  add(type, x, z, rot = 0, o = {}) {
    if (!PROP_TYPES[type]) return null;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const p = { id: o.id ?? this.nextId++, type, x, z, rot, natural: !!o.natural, group: g, scale: o.scale || rand(.85, 1.25) };
    this.nextId = Math.max(this.nextId, p.id + 1);
    if (type === 'lamp') {
      cyl(.11, .16, 4.4, '#2f343c', 0, 2.2, 0, g, 8);
      box(.5, .12, .5, '#2f343c', 0, 4.45, 0, g);
      const bulb = mesh(sphere(.28), NIGHT.bulb, 0, 4.75, 0, g);
      bulb.userData.keep = true;
      mesh(new THREE.ConeGeometry(.42, .35, 8), '#2f343c', 0, 5.1, 0, g);
      addGlow(g, 0, 4.75, 0, 2.6, 10);
      p.src = this.game.daynight.addSource({ pos: new THREE.Vector3(x, 4.5, z), power: 6 });
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
    } else if (type === 'flowers') {
      box(2.2, .3, 1.2, '#8b5a2b', 0, .15, 0, g);
      for (let k = 0; k < 10; k++) ball(.16, pick(['#ff7aa2', '#ffd23f', '#ffffff', '#b48cff', '#ff5d5d']), rand(-.9, .9), .38, rand(-.4, .4), g);
    }
    mergeStatic(g);
    shadows(g);
    this.game.scene.add(g);
    const b = PROP_TYPES[type].block * (type === 'tree' ? p.scale : 1);
    if (b) { p.rect = [x - b, z - b, x + b, z + b]; this.game.world.grid.mark(...p.rect, 1); }
    this.list.push(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.game.scene.remove(p.group);
    if (p.rect) this.game.world.grid.mark(...p.rect, -1);
    if (p.src) this.game.daynight.removeSource(p.src);
    p.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
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
