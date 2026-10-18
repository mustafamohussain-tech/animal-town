// Camera modes: free (mouse + WASD), follow a citizen, cinematic shots, airplane view, inside a building.
import * as THREE from 'three';
import { rand, clamp, lerpAngle, pick } from './util.js';
import { FH } from './buildgen.js';

const v = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
const k = (dt, speed) => 1 - Math.exp(-dt * speed);

// Cinematic shots. Offsets are [side, up, forward] relative to the citizen (forward = where they face).
// Every shot keeps the whole body in frame and slowly glides from `from` to `to` (a gentle dolly).
const SHOTS = [
  { name: 'front', from: [2.8, 2.1, 5.6], to: [2.0, 1.8, 4.6], at: 1.3 },
  { name: 'side', from: [6.2, 1.7, 1.2], to: [6.2, 1.9, -1.0], at: 1.3 },
  { name: 'wide', from: [8, 5.5, 10], to: [6, 4.5, 8.5], at: 1.2 },
  { name: 'orbit', orbit: 6.8, up: 2.6, at: 1.3 },
  { name: 'low', from: [1.8, .55, 5.4], to: [1.2, .7, 4.6], at: 1.6 },
  { name: 'drone', from: [5.5, 5, 7], to: [4, 4, 6], at: 1.1 },
  { name: 'behind', from: [-2.4, 2.6, -5.2], to: [-1.8, 2.3, -4.4], at: 1.2, ahead: 2.5 },
];

export class CameraDirector {
  constructor(game) {
    this.game = game;
    this.mode = 'free';
    this.char = null;
    this.building = null;
    this.floor = 0;
    this.shot = null;
    this.shotTime = 0;
    this.shotLen = 7;
    this.planeAngle = 0;
    this.goal = null;
    this.look = new THREE.Vector3();
    this.sp = new THREE.Vector3();   // smoothed citizen position (cinematic) - moves the camera
    this.aim = new THREE.Vector3();  // lightly smoothed position - where the camera points
    this.sa = 0;                     // smoothed facing angle (cinematic)
    this.keys = new Set();
    // the player takes over: any automatic camera flight (e.g. up to the view from above when building) stops
    const el = game.world.renderer.domElement;
    el.addEventListener('pointerdown', () => { this.goal = null; });
    // dragging the map while following someone: the camera stays where you moved it (no tug back)
    const ptrs = new Map();
    el.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); });
    el.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p || ptrs.size !== 1 || p.b !== 0 || this.mode !== 'follow') return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) this.setMode('free');
    });
    const up = e => ptrs.delete(e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', () => { this.goal = null; }, { passive: true });
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'z'].includes(key)) {
        this.goal = null;
        this.keys.add(key);
        if (key.startsWith('arrow')) e.preventDefault();
      }
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }
  get cam() { return this.game.world.camera; }
  get ctl() { return this.game.world.controls; }

  setMode(mode, o = {}) {
    const ctl = this.ctl;
    if (this.mode === 'interior') { ctl.minDistance = 2.5; ctl.maxDistance = Math.max(420, this.game.world.landHalf * 2.3); ctl.maxPolarAngle = Math.PI * .48; }
    if (this.mode === 'cinema' || this.mode === 'plane') ctl.target.copy(this.look);
    this.mode = mode;
    this.goal = null;
    ctl.enabled = mode === 'free' || mode === 'follow' || mode === 'interior';
    if (mode === 'follow' || mode === 'cinema') this.char = o.char || this.char;
    if (mode === 'follow' && this.char) {
      // come closer if we are far away
      const p = this.char.root.position;
      if (this.cam.position.distanceTo(p) > 40) {
        const dir = tmp.copy(this.cam.position).sub(ctl.target).setY(0).normalize();
        this.goal = { target: new THREE.Vector3(p.x, 1.4, p.z), pos: new THREE.Vector3(p.x + dir.x * 14, 9, p.z + dir.z * 14), follow: true };
      }
    }
    if (mode === 'cinema') {
      const c = this.char;
      this.sp.copy(c.root.position);
      this.aim.copy(c.root.position);
      this.sa = c.root.rotation.y;
      this.look.set(this.sp.x, this.sp.y + 1.3, this.sp.z);
      this.nextShot(true);
    }
    if (mode === 'plane') this.planeAngle = Math.atan2(this.cam.position.x, this.cam.position.z);
    if (mode === 'interior') {
      this.building = o.building;
      this.floor = o.floor ?? 0;
      const b = this.building;
      ctl.minDistance = 2;
      ctl.maxDistance = Math.max(b.W, b.D) * 1.3;
      ctl.maxPolarAngle = Math.PI * .49;
      this.focusFloor();
    }
    this.game.emit('camera', mode);
  }
  // step back to a view from above (e.g. to choose where to build), free to move
  overview(p) {
    const ctl = this.ctl;
    if (this.mode !== 'free') this.setMode('free');
    p ||= ctl.target;
    const dir = tmp.copy(this.cam.position).sub(ctl.target).setY(0);
    if (dir.lengthSq() < .01) dir.set(0, 0, 1);
    dir.normalize();
    this.goal = { target: new THREE.Vector3(p.x, 0, p.z), pos: new THREE.Vector3(p.x + dir.x * 34, 38, p.z + dir.z * 34) };
  }
  focusFloor() {
    const b = this.building;
    const y = this.floor * FH + 1.2;
    const t = new THREE.Vector3(b.cx, y, b.cz);
    const out = b.toWorld(b.W * .25, b.D * .9);
    this.goal = { target: t, pos: new THREE.Vector3(out.x, y + Math.min(9, b.D * .7), out.z) };
  }
  setFloor(n) {
    if (this.mode !== 'interior') return;
    this.floor = clamp(n, 0, this.building.spec.floors - 1);
    this.focusFloor();
    this.game.emit('camera', this.mode);
  }
  overview() {
    this.setMode('free');
    const h = this.game.world.landHalf;
    this.goal = { target: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(0, h * 1.1 + 20, h * 1.25 + 20) };
  }

  // ---------- cinematic ----------
  // where the camera would be for a shot at progress u (0..1)
  shotPos(s, u, out, lookOut) {
    const c = this.char, p = this.sp, a = this.sa;
    const f = [Math.sin(a), Math.cos(a)], r = [-Math.cos(a), Math.sin(a)];
    const e = u * u * (3 - 2 * u);
    if (s.name === 'action') {
      // show the citizen AND what they are working on (e.g. the building going up)
      const b = s.b, dx = p.x - b.cx, dz = p.z - b.cz, d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d, sx = -uz, sz = ux;
      const dist = 9 - 2 * e, side = 4 - 2 * e;
      out.set(p.x + ux * dist + sx * side, p.y + 3.4 - e, p.z + uz * dist + sz * side);
      const by = Math.min(b.roofTop * .45, 4);
      const q = this.aim;
      lookOut.set(q.x * .75 + b.cx * .25, q.y + 1.2 * .75 + by * .25, q.z * .75 + b.cz * .25);
      return;
    }
    if (s.orbit) {
      const th = s.start + u * this.shotLen * .22;
      out.set(p.x + Math.sin(th) * s.orbit, p.y + s.up, p.z + Math.cos(th) * s.orbit);
    } else {
      const o = [0, 1, 2].map(i => s.from[i] + (s.to[i] - s.from[i]) * e);
      out.set(p.x + r[0] * o[0] + f[0] * o[2], p.y + o[1], p.z + r[1] * o[0] + f[1] * o[2]);
    }
    const ah = s.ahead || 0, q = this.aim;
    lookOut.set(q.x + f[0] * ah, q.y + s.at, q.z + f[1] * ah);
  }
  // a shot is bad if the camera is inside another building, or a building stands between the camera and the citizen
  blocked(pos, target) {
    const town = this.game.town, cp = this.char.root.position, own = town.at(cp.x, cp.z);
    const trees = this.game.props.list.filter(t => t.type === 'tree' && Math.abs(t.x - pos.x) + Math.abs(t.z - pos.z) < 40);
    const sites = town.near(pos.x, pos.z, 40).filter(b => !b.complete);
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = pos.x + (target.x - pos.x) * u, z = pos.z + (target.z - pos.z) * u, y = pos.y + (target.y - pos.y) * u;
      const b = town.at(x, z);
      if (b && b !== own && y < (b.complete ? b.roofTop : Math.min(b.roofTop, 30)) + .5) return true;
      for (const t of trees) if (y < 6 * t.scale && Math.hypot(t.x - x, t.z - z) < 2.2 * t.scale && u < .9) return true;
      // scaffolding poles stand just outside a construction site
      if (u < .85) {
        for (const s of sites) {
          const l = s.toLocal(x, z);
          if (Math.abs(l.x) < s.W / 2 + 1.2 && Math.abs(l.z) < s.D / 2 + 1.2 && y < Math.min(s.roofTop, 30) + .5) return true;
        }
      }
    }
    return false;
  }
  nextShot(first) {
    const c = this.char;
    const options = [];
    if (c.focusBuilding?.alive && !c.focusBuilding.complete) options.push({ name: 'action', b: c.focusBuilding }, { name: 'action', b: c.focusBuilding });
    const prev = this.shot?.name;
    for (const s of SHOTS) if (s.name !== prev) options.push(s);
    // keep only the shots that have a clear view at the start and the middle of the shot
    this.shotLen = rand(6, 9);
    const clear = [];
    for (const o of options) {
      const s = { ...o };
      if (s.orbit) s.start = this.sa + rand(-1, 1);
      this.shotPos(s, 0, v, look);
      if (this.blocked(v, look)) continue;
      this.shotPos(s, .5, v, look);
      if (this.blocked(v, look)) continue;
      clear.push(s);
    }
    if (clear.length) this.shot = pick(clear);
    else {
      // crowded street: rise above the roofs and look down at the citizen
      const p = this.sp;
      let top = 6;
      for (const b of this.game.town.near(p.x, p.z, 22)) if (Math.hypot(b.cx - p.x, b.cz - p.z) < 22) top = Math.max(top, b.complete ? b.roofTop : Math.min(b.roofTop, 30));
      this.shot = { name: 'crane', from: [3, top + 4, 7], to: [2, top + 3, 6], at: 1 };
    }
    this.shotTime = 0;
    if (first) { this.shotPos(this.shot, 0, v, look); this.cam.position.copy(v); this.look.copy(look); }
  }

  update(dt) {
    const cam = this.cam, ctl = this.ctl;
    const c = this.char && this.game.chars.includes(this.char) ? this.char : null;
    if ((this.mode === 'follow' || this.mode === 'cinema') && !c) this.setMode('free');

    if (this.mode === 'cinema') {
      // smooth the citizen's position and turning so the camera never shakes
      const p = c.root.position;
      this.sp.x += (p.x - this.sp.x) * k(dt, 3);
      this.sp.z += (p.z - this.sp.z) * k(dt, 3);
      this.sp.y += (p.y - this.sp.y) * k(dt, 3);
      this.aim.lerp(p, k(dt, 10));
      this.sa = lerpAngle(this.sa, c.root.rotation.y, k(dt, c.moving ? .8 : 1.5));
      this.shotTime += dt;
      const action = c.focusBuilding?.alive && !c.focusBuilding.complete;
      if (this.shotTime > this.shotLen || (this.shot.name === 'action' && !action)) this.nextShot();
      this.shotPos(this.shot, Math.min(1, this.shotTime / this.shotLen), v, look);
      // if something blocks the view for a moment, change the angle
      this.blockedT = this.blocked(cam.position, this.look) ? (this.blockedT || 0) + dt : 0;
      if (this.blockedT > .8) { this.blockedT = 0; this.nextShot(true); } // cut straight to a clear view
      cam.position.lerp(v, k(dt, c.moving ? 3 : 2.2));
      this.look.lerp(look, k(dt, 9));
      cam.lookAt(this.look);
      return;
    }
    if (this.mode === 'plane') {
      const h = this.game.world.landHalf;
      this.planeAngle += dt * .035;
      const R = h * .7 + 40, H = Math.max(170, h * 1.6);
      v.set(Math.sin(this.planeAngle) * R, H, Math.cos(this.planeAngle) * R);
      cam.position.lerp(v, k(dt, .8));
      look.set(Math.sin(this.planeAngle + .6) * R * .3, 0, Math.cos(this.planeAngle + .6) * R * .3);
      this.look.lerp(look, k(dt, .8));
      cam.lookAt(this.look);
      return;
    }

    // keyboard: WASD / arrows move the camera over the ground, Q / Z go up / down
    if (this.keys.size && (this.mode === 'free' || this.mode === 'follow')) {
      if (this.mode === 'follow') this.setMode('free');
      const fwd = tmp.copy(ctl.target).sub(cam.position).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const speed = clamp(cam.position.distanceTo(ctl.target), 8, 120) * 1.1 * dt;
      const m = new THREE.Vector3();
      if (this.keys.has('w') || this.keys.has('arrowup')) m.add(fwd);
      if (this.keys.has('s') || this.keys.has('arrowdown')) m.sub(fwd);
      if (this.keys.has('d') || this.keys.has('arrowright')) m.add(right);
      if (this.keys.has('a') || this.keys.has('arrowleft')) m.sub(right);
      m.multiplyScalar(speed);
      if (this.keys.has('q')) m.y += speed * .6;
      if (this.keys.has('z')) m.y -= speed * .6;
      ctl.target.add(m);
      cam.position.add(m);
      ctl.target.y = clamp(ctl.target.y, 0, 60);
    }

    if (this.mode === 'follow') {
      const p = c.root.position;
      v.set(p.x, p.y + 1.4, p.z).sub(ctl.target).multiplyScalar(k(dt, 3));
      ctl.target.add(v);
      cam.position.add(v);
    }
    if (this.goal) {
      const kk = k(dt, 3);
      if (!this.goal.follow) ctl.target.lerp(this.goal.target, kk);
      cam.position.lerp(this.goal.pos, kk);
      if (cam.position.distanceTo(this.goal.pos) < .3) this.goal = null;
    }
    ctl.update();
    if (this.mode !== 'interior') this.keepOutside();
    this.look.copy(ctl.target);
  }
  // the camera never goes under the ground or into a building (the inside view is its own mode):
  // over a building it glides up above the roof (no jumping sideways through walls)
  keepOutside() {
    const p = this.cam.position;
    if (p.y < 1.4) p.y = 1.4;
    for (const b of this.game.town.near(p.x, p.z, 16)) {
      if (b.def.open || b.W == null) continue;
      const l = b.toLocal(p.x, p.z), mx = b.W / 2 + .9, mz = b.D / 2 + .9, top = (b.complete ? b.roofTop : Math.min(b.roofTop, 30)) + 1.2;
      if (Math.abs(l.x) >= mx || Math.abs(l.z) >= mz || p.y > top) continue;
      p.y = top;
    }
  }
}
