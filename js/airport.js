// Planes at the airport: each one waits at its gate, taxis to the end of the runway, takes off, flies a
// wide circle over the town, lands, and taxis back. Two planes per airport, one always in the air.
// The planes live in the scene (not inside the airport model), so they keep flying when the camera is far.
import * as THREE from 'three';
import { box, cyl, mesh, mergeStatic, shadows, lerpAngle, clamp, pick } from './util.js';

const LIVERY = ['#1d5fa8', '#c62828', '#2e7d32', '#6a1b9a', '#ef6c00'];

export function makePlane(color) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const W = '#f4f6f8';
  // the nose points along +z
  cyl(.95, .95, 12, W, 0, 0, 0, body, 16).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(.95, 16, 10), W, 0, 0, 6, body).scale.set(1, .9, 1.5);
  const tail = mesh(new THREE.ConeGeometry(.95, 3.2, 16), W, 0, .25, -7.5, body);
  tail.rotation.x = -Math.PI / 2;
  box(.22, .35, 12.4, color, .96, -.05, -.4, body);
  box(.22, .35, 12.4, color, -.96, -.05, -.4, body);
  for (let z = -4.5; z < 5; z += .7) for (const s of [-1, 1]) box(.05, .22, .3, '#2c3e50', s * .93, .35, z, body);
  box(1.1, .3, .4, '#2c3e50', 0, .55, 6.9, body).rotation.x = .5;
  const wing = box(14, .22, 2.6, W, 0, -.35, .4, body);
  wing.rotation.y = 0;
  box(4.6, .16, 1.4, W, 0, .3, -7.6, body);
  const fin = box(.2, 2.8, 2, color, 0, 1.7, -7.7, body);
  fin.rotation.x = .35;
  for (const s of [-1, 1]) {
    cyl(.5, .45, 2, '#d0d5db', s * 3.4, -.95, .9, body, 12).rotation.x = Math.PI / 2;
    cyl(.32, .32, .1, '#3a3f48', s * 3.4, -.95, 1.92, body, 12).rotation.x = Math.PI / 2;
  }
  mergeStatic(body);
  // wheels (folded away in the air) and the lights
  const gear = new THREE.Group();
  for (const [x, z] of [[0, 4.6], [-1.3, -.4], [1.3, -.4]]) { cyl(.06, .06, .9, '#7a8088', x, -1.3, z, gear, 6); cyl(.32, .32, .25, '#222222', x, -1.75, z, gear, 10).rotation.z = Math.PI / 2; }
  mergeStatic(gear);
  body.add(gear);
  const light = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 })); m.position.set(x, y, z); body.add(m); return m; };
  light('#ff2a2a', -7, -.3, .4);
  light('#2aff5a', 7, -.3, .4);
  const strobe = light('#ffffff', 0, 3.1, -8.4);
  shadows(g);
  g.userData = { body, gear, strobe };
  return g;
}

// the circuit, in the airport's own frame (x along the runway, which is at z = zr)
function legs(b) {
  const W = b.W, D = b.D, zr = -D / 2 + 6, zt = -2;
  return {
    W, zr, zt,
    out: gx => [
      { x: gx, z: zt, v: 5 }, { x: -W / 2 + 9, z: zt, v: 7 }, { x: -W / 2 + 6, z: zr + 1.5, v: 4 },
      { x: -W / 2 + 7, z: zr, v: 3, hold: true },                       // waits here until the runway is free
    ],
    air: [
      { x: W / 2 + 140, z: zr, y: 40, v: 42 }, { x: W / 2 + 230, z: zr + 160, y: 62, v: 44 },
      { x: 0, z: zr + 300, y: 70, v: 46 }, { x: -W / 2 - 260, z: zr + 200, y: 60, v: 44 },
      { x: -W / 2 - 380, z: zr + 40, y: 38, v: 38 }, { x: -W / 2 - 170, z: zr, y: 18, v: 32 },
      { x: -W / 2 + 12, z: zr, y: 0, v: 27, touch: true },
    ],
    back: gx => [
      { x: W / 2 - 26, z: zr, v: 7 }, { x: W / 2 - 8, z: zr, v: 5 }, { x: W / 2 - 6, z: zt, v: 5 },
      { x: gx + 5, z: zt, v: 7 }, { x: gx, z: zt + 1.5, v: 3 }, { x: gx, z: 4, v: 2, gate: true },
    ],
  };
}

export class Flights {
  constructor(game) {
    this.game = game;
    this.byAirport = new Map();   // airport id -> [planes]
    this.t = 0;
  }
  update(dt) {
    const g = this.game;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 2;
      const ports = new Set(g.town.all.filter(b => b.type === 'airport' && b.complete && b.alive));
      for (const [id, planes] of this.byAirport) if (![...ports].some(b => b.id === id)) { planes.forEach(p => this.remove(p)); this.byAirport.delete(id); }
      for (const b of ports) if (!this.byAirport.has(b.id)) this.byAirport.set(b.id, this.start(b));
    }
    for (const planes of this.byAirport.values()) for (const p of planes) this.fly(p, dt, planes);
  }
  start(b) {
    const L = legs(b);
    return [-18, -4].map((gx, k) => {
      const obj = makePlane(LIVERY[(b.id + k) % LIVERY.length]);
      this.game.scene.add(obj);
      const p = { b, L, gx, obj, x: gx, z: 4, y: 0, h: Math.PI, v: 0, pitch: 0, roll: 0, mode: 'gate', wait: 8 + k * 30, route: [], i: 0 };
      if (k === 1) { const a = L.air[2]; Object.assign(p, { mode: 'air', x: a.x - 120, z: a.z, y: a.y, h: Math.PI / 2, v: 44, route: L.air, i: 2 }); }
      this.place(p);
      return p;
    });
  }
  remove(p) { this.game.scene.remove(p.obj); p.obj.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); }); }
  clear() { for (const planes of this.byAirport.values()) planes.forEach(p => this.remove(p)); this.byAirport.clear(); }

  fly(p, dt, planes) {
    const L = p.L;
    if (p.mode === 'gate') {
      // at the gate: turn round slowly to face the taxiway, then go
      p.h = lerpAngle(p.h, Math.PI, 1 - Math.exp(-dt * .6));
      p.wait -= dt;
      if (p.wait <= 0) { p.mode = 'taxi'; p.route = L.out(p.gx); p.i = 0; }
    } else if (p.mode === 'roll') {
      // the take-off run: faster and faster along the runway, then up
      p.h = lerpAngle(p.h, Math.PI / 2, 1 - Math.exp(-dt * 3));
      p.v = Math.min(44, p.v + dt * 7.5);
      p.x += Math.sin(p.h) * p.v * dt;
      p.z += Math.cos(p.h) * p.v * dt;
      if (p.v > 26) p.y += (p.v - 26) * .45 * dt;
      if (p.y > 10) { p.mode = 'air'; p.route = L.air; p.i = 0; }
    } else this.follow(p, dt, planes);
    if (p.y < 0) p.y = 0;
    p.vy = (p.y - (p.y0 ?? p.y)) / Math.max(dt, 1e-3);
    p.y0 = p.y;
    this.place(p);
  }
  // move toward the next point of the route, turning smoothly
  follow(p, dt, planes) {
    const L = p.L;
    const w = p.route[p.i];
    if (!w) return;
    const air = p.mode === 'air';
    if (w.hold && planes.some(o => o !== p && (o.mode === 'roll' || (o.mode === 'air' && o.i >= 5) || (o.mode === 'land' && o.i <= 1)))) { p.v = Math.max(0, p.v - dt * 4); return; }
    const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz), turn = air ? .32 : 1.1;
    let diff = Math.atan2(Math.sin(want - p.h), Math.cos(want - p.h));
    const step = clamp(diff, -turn * dt, turn * dt);
    p.h += step;
    p.roll += ((air ? -step / dt * 1.4 : 0) - p.roll) * (1 - Math.exp(-dt * 2));
    p.v += clamp(w.v - p.v, -6 * dt, (air ? 4 : 3) * dt);
    if (!air && Math.abs(diff) > 1.2) p.v = Math.min(p.v, 2);
    p.x += Math.sin(p.h) * p.v * dt;
    p.z += Math.cos(p.h) * p.v * dt;
    if (air) {
      const t = Math.max(.5, d / Math.max(p.v, 1));
      p.y += clamp((w.y - p.y) / t, -7, 7) * dt;
    }
    // a leg that can't be reached (inside the turning circle) is given up after a while
    p.legT = (p.legI === p.i && p.route === p.legR ? p.legT : 0) + dt;
    p.legI = p.i; p.legR = p.route;
    const passed = w.touch && p.x > w.x - 3 && Math.abs(p.z - w.z) < 12;
    if (passed) p.z = w.z;
    if (d < (air ? (w.touch ? 6 : 30) : 1.2) || passed || (air && p.legT > 45)) {
      if (w.touch && !(passed || d < 6)) { p.i = 0; return; }   // not lined up with the runway: go around
      p.i++;
      if (w.hold) { p.mode = 'roll'; p.v = 2; return; }
      if (w.touch) { p.mode = 'land'; p.y = 0; p.route = L.back(p.gx); p.i = 0; return; }
      if (w.gate) { p.mode = 'gate'; p.v = 0; p.wait = 25 + Math.random() * 25; return; }
      if (air && p.i >= p.route.length) p.i = 0;
    }
    if (p.mode === 'land' && p.i === 0) p.v = Math.max(w.v, p.v - dt * 7);   // braking after touching down
  }
  place(p) {
    const b = p.b, o = p.obj, ud = o.userData;
    const w = b.toWorld(p.x, p.z);
    const up = p.mode === 'air' || p.mode === 'roll' ? p.y : 0;
    o.position.set(w.x, up + 2.05, w.z);
    o.rotation.y = p.h + b.angle;
    const climb = p.mode === 'air' || (p.mode === 'roll' && p.y > 0) ? clamp(Math.atan2(p.vy || 0, Math.max(p.v, 5)), -.2, .28) : 0;
    p.pitch += (climb - p.pitch) * .08;
    ud.body.rotation.x = -p.pitch;
    ud.body.rotation.z = clamp(p.roll, -.5, .5);
    ud.gear.visible = up < 25;
    ud.strobe.visible = (performance.now() / 1000) % 1.3 < .08;
  }
}
