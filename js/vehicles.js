// Personal cars: a citizen can own cars, which are parked on the street in front of their home.
import * as THREE from 'three';
import { box, cyl, mesh, sphere, mergeStatic, shadows, pick, rand } from './util.js';
import { NIGHT } from './daynight.js';

export const CAR_TYPES = ['car', 'pickup', 'sports', 'van'];
const COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#ecf0f1', '#34495e', '#ff7aa2', '#e67e22'];
const GLASS = '#8fd3f5';

// car model, front = +z (a citizen is ~2.6 tall, so a car is ~4.4 long)
export function makeCar(type, color) {
  const g = new THREE.Group();
  const wheels = (zs, r = .4) => { for (const x of [-1, 1]) for (const z of zs) cyl(r, r, .32, '#1e1e1e', x * 1.02, r, z, g, 14).rotation.z = Math.PI / 2; };
  const lights = (zf, zb, y) => {
    for (const x of [-.65, .65]) {
      mesh(sphere(.13), NIGHT.bulb, x, y, zf, g).userData.keep = true;
      box(.3, .14, .05, '#c0392b', x, y, zb, g);
    }
  };
  if (type === 'pickup') {
    box(2.05, .75, 4.8, color, 0, .75, 0, g);
    box(1.95, .8, 1.8, color, 0, 1.5, .9, g);
    box(1.85, .55, .05, GLASS, 0, 1.55, 1.81, g);
    for (const x of [-.98, .98]) box(.08, .45, 2.3, color, x, 1.35, -1.2, g);
    box(2.05, .45, .08, color, 0, 1.35, -2.36, g);
    wheels([-1.6, 1.5], .45);
    lights(2.4, -2.41, .85);
  } else if (type === 'sports') {
    box(2.05, .55, 4.5, color, 0, .55, 0, g);
    box(1.6, .5, 1.8, GLASS, 0, 1.05, -.2, g);
    box(1.62, .06, 1.4, color, 0, 1.32, -.3, g);
    box(1.9, .08, .5, '#222222', 0, 1.15, -2.1, g);
    for (const x of [-.7, .7]) box(.08, .35, .08, '#222222', x, .95, -2.1, g);
    wheels([-1.4, 1.4], .38);
    lights(2.25, -2.26, .6);
  } else if (type === 'van') {
    box(2.1, 2.1, 4.8, color, 0, 1.35, 0, g);
    box(1.95, .6, .05, GLASS, 0, 1.85, 2.41, g);
    for (const x of [-1.06, 1.06]) box(.05, .5, 2.6, GLASS, x, 1.85, -.3, g);
    wheels([-1.6, 1.5], .42);
    lights(2.41, -2.41, .8);
  } else {
    box(2.05, .7, 4.4, color, 0, .65, 0, g);
    box(1.8, .65, 2.3, GLASS, 0, 1.3, -.2, g);
    box(1.82, .08, 2.0, color, 0, 1.66, -.25, g);
    wheels([-1.35, 1.35], .4);
    lights(2.2, -2.21, .72);
  }
  mergeStatic(g);
  shadows(g);
  return g;
}

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
    this.timer = 0;
  }
  add(ownerId, o = {}) {
    const v = {
      id: o.id ?? this.nextId++, ownerId,
      type: CAR_TYPES.includes(o.type) ? o.type : pick(CAR_TYPES),
      color: o.color || pick(COLORS),
      x: o.x, z: o.z, rot: o.rot || 0,
    };
    this.nextId = Math.max(this.nextId, v.id + 1);
    v.group = makeCar(v.type, v.color);
    this.game.scene.add(v.group);
    this.list.push(v);
    this.park(v, o.x == null);
    return v;
  }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i < 0) return;
    this.unblock(v);
    this.list.splice(i, 1);
    this.game.scene.remove(v.group);
  }
  ofOwner(id) { return this.list.filter(v => v.ownerId === id); }

  // where a car sleeps: the carport / driveway of the owner's house, else a free bay in the nearest car park,
  // else at the curb of the nearest street. Never on the grass.
  park(v, newSpot) {
    const g = this.game, c = g.getChar(v.ownerId);
    const home = c && g.town.get(c.homeId);
    const k = this.ofOwner(v.ownerId).indexOf(v);
    v.bay = null; v.out = [];
    let s = null;
    if (home?.complete && home.parkSpots && k < home.parkSpots.length) {
      const [lx, lz] = home.parkSpots[k], w = home.toWorld(lx, lz), f = home.toWorld(lx, home.D / 2 + 3.4);
      s = { x: w.x, z: w.z, rot: home.angle, out: [f] };
    }
    if (!s) s = this.garageSpot(v, home ? home.center : c ? c.root.position : { x: 0, z: 0 });
    v.home = home?.complete ? home.id : null;
    v.away = false;
    // no carport and no free bay: the car is kept out of sight until there is a place (never on the street)
    v.stored = !s;
    v.group.visible = !!s;
    if (s) { v.x = s.x; v.z = s.z; v.rot = s.rot; v.bay = s.bay || null; v.out = s.out || []; }
    v.group.position.set(v.x ?? 0, this.game.tiles.groundY(v.x ?? 0, v.z ?? 0), v.z ?? 0);
    v.group.rotation.y = v.rot ?? 0;
    if (s) this.block(v); else this.unblock(v);
  }
  // a parked car is in the way: people walk around it
  block(v) {
    this.unblock(v);
    const along = Math.abs(Math.sin(v.rot)) > .7;
    const hw = along ? 2.3 : 1.1, hd = along ? 1.1 : 2.3;
    v.rect = [v.x - hw, v.z - hd, v.x + hw, v.z + hd];
    this.game.world.grid.mark(...v.rect, 1);
  }
  unblock(v) {
    if (!v.rect) return;
    this.game.world.grid.mark(...v.rect, -1);
    v.rect = null;
  }
  garageSpot(v, near) {
    let best = null, bd = 90;
    for (const b of this.game.town.of('garage')) {
      const d = Math.hypot(b.center.x - near.x, b.center.z - near.z);
      if (d >= bd) continue;
      const free = b.parkSpots.findIndex((_, i) => !this.list.some(o => o !== v && o.bay === b.id + ':' + i));
      if (free < 0) continue;
      const [lx, lz, r] = b.parkSpots[free], w = b.toWorld(lx, lz);
      bd = d;
      best = { x: w.x, z: w.z, rot: b.angle + r, bay: b.id + ':' + free, out: [b.toWorld(lx, 0), b.toWorld(0, b.D / 2 + 2)] };
    }
    return best;
  }
  curbSpot(near) {
    const T = this.game.tiles, tr = this.game.traffic;
    const t = tr?.nearestRoad(near.x, near.z, 4);
    if (!t) return null;
    for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (T.isDrivable(t.i + a, t.j + b)) continue;
      const off = 2.4, x = t.i * 12 + a * off + (a ? 0 : -2), z = t.j * 12 + b * off + (b ? 0 : -2);
      return { x, z, rot: a ? 0 : Math.PI / 2 };
    }
    return { x: t.i * 12 + 2.4, z: t.j * 12, rot: 0 };
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 2;
    for (const v of [...this.list]) {
      if (v.busy) continue;   // out driving
      const c = this.game.getChar(v.ownerId);
      if (!c) { this.remove(v); continue; }
      const home = this.game.town.get(c.homeId);
      const want = home?.complete ? home.id : null;
      // a new home, or a car park was built for a car waiting at the curb
      // a new home, or a place for a car that had none
      if (want !== (v.home ?? null) || (v.stored && (this.game.town.of('garage').length || home?.parkSpots))) this.park(v, true);
    }
  }

  toJSON() { return this.list.map(v => ({ id: v.id, ownerId: v.ownerId, type: v.type, color: v.color, x: +v.x.toFixed(2), z: +v.z.toFixed(2), rot: +v.rot.toFixed(3) })); }
}
