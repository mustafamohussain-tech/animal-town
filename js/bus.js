// Arrivals: new residents come to town on a bus. It drives to the bus stop, they step off and wave, the bus leaves.
import * as THREE from 'three';
import { box, cyl, mesh, sphere, mergeStatic, shadows, signTexture, clamp } from './util.js';
import { NIGHT } from './daynight.js';
import { TILE } from './path.js';
import { t } from './i18n.js';

const HALF = TILE / 2;

// the bus stop shelter (front = +z, faces the road)
export function makeBusStop(g, parent) {
  box(4.2, .15, 1.8, '#9aa3ad', 0, .08, 0, parent);
  box(4.2, 2.6, .1, '#8fd3f5', 0, 1.45, -.8, parent).material = new THREE.MeshStandardMaterial({ color: '#bfe6fa', transparent: true, opacity: .55, roughness: .1 });
  for (const x of [-2, 2]) box(.12, 2.8, .12, '#3a3f48', x, 1.4, -.75, parent);
  for (const x of [-2, 2]) box(.12, 2.8, .12, '#3a3f48', x, 1.4, .7, parent);
  box(4.6, .15, 2.1, '#d62d20', 0, 2.85, 0, parent);
  box(3.2, .1, .5, '#a0703f', 0, .6, -.45, parent);
  for (const x of [-1.4, 1.4]) box(.1, .55, .4, '#555555', x, .3, -.45, parent);
  cyl(.07, .07, 3.6, '#3a3f48', 2.6, 1.8, .9, parent, 6);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .5), new THREE.MeshBasicMaterial({ map: signTexture('🚌', t('busStop'), '#d62d20'), transparent: true, side: THREE.DoubleSide }));
  sign.position.set(2.6, 3.4, .95);
  sign.userData.keep = true;
  parent.add(sign);
}

function makeBus() {
  const g = new THREE.Group();
  box(2.7, 2.6, 9.5, '#ffcf3f', 0, 1.75, 0, g);
  box(2.72, .9, 8.6, '#8fd3f5', 0, 2.25, -.2, g);
  box(2.4, 1.2, .06, '#8fd3f5', 0, 2.1, 4.76, g);
  box(2.74, .25, 9.52, '#e67e22', 0, 1.0, 0, g);
  box(.06, 1.9, 1.2, '#3a3f48', 1.37, 1.5, 3, g); // door (right side)
  box(2.4, .15, 9, '#e8b52c', 0, 3.1, 0, g);
  for (const x of [-1.25, 1.25]) for (const z of [-3.2, 3.2]) cyl(.55, .55, .4, '#1e1e1e', x, .55, z, g, 14).rotation.z = Math.PI / 2;
  for (const x of [-.9, .9]) mesh(sphere(.18), NIGHT.bulb, x, 1.1, 4.78, g).userData.keep = true;
  mergeStatic(g);
  shadows(g);
  return g;
}

export class BusService {
  constructor(game) {
    this.game = game;
    this.queue = [];      // citizens waiting to arrive
    this.bus = null;
    this.state = 'idle';
    this.timer = 0;
  }
  stop() { return this.game.props.list.find(p => p.type === 'busstop') || null; }

  // put a bus stop on a sidewalk near the town centre if there is none
  ensureStop() {
    const g = this.game;
    if (this.stop()) return;
    const roads = g.tiles.roadList().sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [i, j] of roads) {
      if (Math.hypot(i, j) < 1) continue;
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (g.tiles.isRoad(i + di, j + dj)) continue;
        const x = i * TILE + di * (HALF - .9), z = j * TILE + dj * (HALF - .9);
        g.props.add('busstop', x, z, Math.atan2(-di, -dj));
        return;
      }
    }
    g.props.add('busstop', 24, HALF - .9, Math.PI);
  }

  // where arrivals stand / the lane the bus drives in
  geometry() {
    const s = this.stop();
    if (!s) return null;
    const n = { x: Math.sin(s.rot), z: Math.cos(s.rot) };   // from the stop towards the road
    const d = { x: n.z, z: -n.x };                          // along the road
    const lane = { x: s.x + n.x * 3.4, z: s.z + n.z * 3.4 };
    return { s, n, d, lane, spot: (k = 0) => ({ x: s.x + n.x * 1.4 + d.x * (k - 1) * 1.2, z: s.z + n.z * 1.4 + d.z * (k - 1) * 1.2 }) };
  }

  // a new resident: hidden on the bus until it arrives
  arrive(c) {
    const geo = this.geometry();
    if (!geo) return false;
    const p = geo.spot(0);
    c.root.position.set(p.x, 0, p.z);
    c.inBus = true;
    this.queue.push(c);
    if (this.state === 'idle') this.start();
    return true;
  }

  start() {
    const geo = this.geometry();
    if (!geo) { this.release(); return; }
    if (!this.bus) { this.bus = makeBus(); this.game.scene.add(this.bus); }
    this.bus.visible = true;
    this.geo = geo;
    this.state = 'arriving';
    this.timer = 0;
  }

  release() {
    const geo = this.geometry();
    this.queue.forEach((c, k) => {
      if (!this.game.chars.includes(c)) return;
      const p = geo ? geo.spot(k) : this.game.world.spawnPoint();
      c.root.position.set(p.x, 0, p.z);
      c.root.rotation.y = geo ? Math.atan2(-geo.n.x, -geo.n.z) : 0;
      c.inBus = false;
      this.game.effects.emit('sparkle', { x: p.x, y: 1.5, z: p.z }, 6);
    });
    if (this.queue.length) this.game.effects.emit('confetti', { x: this.geo?.lane.x ?? 0, y: 3, z: this.geo?.lane.z ?? 0 }, 40);
    this.queue = [];
  }

  update(dt) {
    if (this.state === 'idle' || !this.bus) return;
    const { lane, d } = this.geo;
    this.timer += dt;
    const DIST = 90;
    let off = 0;
    if (this.state === 'arriving') {
      const u = clamp(this.timer / 6, 0, 1), e = 1 - (1 - u) ** 2;   // slows down at the stop
      off = -DIST * (1 - e);
      if (u >= 1) { this.state = 'stopped'; this.timer = 0; this.release(); }
    } else if (this.state === 'stopped') {
      if (this.timer > 3.5 && !this.queue.length) { this.state = 'leaving'; this.timer = 0; }
      if (this.queue.length && this.timer > .5) this.release();
    } else if (this.state === 'leaving') {
      const u = clamp(this.timer / 6, 0, 1);
      off = DIST * u * u;
      if (u >= 1) { this.state = 'idle'; this.bus.visible = false; if (this.queue.length) this.start(); }
    }
    this.bus.position.set(lane.x + d.x * off, 0, lane.z + d.z * off);
    this.bus.rotation.y = Math.atan2(d.x, d.z);
  }
}
