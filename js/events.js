// Weekly town calendar: pick an event for each weekday. On that day decorations go up and residents join in.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, coneGeo, rand, pick, mergeStatic, shadows } from './util.js';
import { NIGHT, addGlow } from './daynight.js';
import { goTo, wait, say, buyActs, chatAct } from './behavior.js';
import { t } from './i18n.js';

export const EVENT_ORDER = ['festival', 'market', 'sports', 'rain', 'fireworks', 'cleanup', 'eid', 'concert'];
const COLORS = ['#ff5d73', '#ffcf3f', '#5fb3ff', '#7be07b', '#c38bff', '#ff9f43'];

const head = c => ({ x: c.root.position.x, y: c.root.position.y + 2.8, z: c.root.position.z });

// a free spot around the gathering place
function around(g, center, r0 = 3, r1 = 9) {
  for (let k = 0; k < 20; k++) {
    const a = rand(0, Math.PI * 2), r = rand(r0, r1);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    if (g.world.grid.freeAt(x, z)) return { x, z };
  }
  return { x: center.x, z: center.z };
}
const faceTo = (p, q) => Math.atan2(q.x - p.x, q.z - p.z);

// ---------- decorations ----------
function bunting(p, r = 9) {
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    cyl(.08, .08, 5, '#8b5a2b', x, 2.5, z, p, 6);
    for (let k = 0; k < 6; k++) {
      const b = (i + k / 6) / 6 * Math.PI * 2, rr = r * (1 - .03 * Math.sin(k / 6 * Math.PI));
      mesh(coneGeo(.25, .45, 3), pick(COLORS), Math.cos(b) * rr, 4.4 - Math.sin(k / 6 * Math.PI) * .6, Math.sin(b) * rr, p).rotation.x = Math.PI;
    }
  }
}
function balloons(p, n = 10) {
  for (let i = 0; i < n; i++) {
    const x = rand(-8, 8), z = rand(-8, 8), y = rand(3.5, 6);
    ball(.45, pick(COLORS), x, y, z, p).scale.y = 1.2;
    cyl(.01, .01, y - .5, '#dddddd', x, (y - .5) / 2, z, p, 3);
  }
}
const DECOR = {
  festival(p) { bunting(p); balloons(p); },
  market(p) {
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + .4, x = Math.cos(a) * 7, z = Math.sin(a) * 7, s = new THREE.Group();
      s.position.set(x, 0, z); s.rotation.y = -a + Math.PI / 2; p.add(s);
      box(2.8, 1, 1.2, '#b07a45', 0, .5, 0, s);
      for (const sx of [-1.3, 1.3]) for (const sz of [-.55, .55]) cyl(.05, .05, 2.6, '#8b5a2b', sx, 1.3, sz, s, 5);
      const col = pick(COLORS);
      for (let k = 0; k < 5; k++) box(.6, .05, 1.6, k % 2 ? '#ffffff' : col, -1.2 + k * .6, 2.6, 0, s);
      for (let k = 0; k < 6; k++) ball(.15, pick(['#e74c3c', '#f39c12', '#7cc576', '#f1c40f']), rand(-1.1, 1.1), 1.1, rand(-.4, .4), s);
    }
  },
  sports(p) {
    for (const s of [-1, 1]) {
      const gg = new THREE.Group(); gg.position.set(s * 8, 0, 0); p.add(gg);
      for (const z of [-1.8, 1.8]) cyl(.08, .08, 2.2, '#ffffff', 0, 1.1, z, gg, 6);
      box(.1, .1, 3.7, '#ffffff', 0, 2.2, 0, gg);
    }
    ball(.35, '#ffffff', 0, .35, 0, p);
    for (let i = 0; i < 8; i++) mesh(coneGeo(.25, .6, 10), '#ff7a1a', rand(-9, 9), .3, rand(-5, 5), p);
  },
  fireworks(p) { for (let i = 0; i < 5; i++) cyl(.18, .22, 1.2, pick(COLORS), rand(-4, 4), .6, rand(-4, 4), p, 8); },
  cleanup(p) { for (let i = 0; i < 6; i++) { const x = rand(-8, 8), z = rand(-8, 8); cyl(.35, .3, .9, '#2e7d32', x, .45, z, p, 10); } },
  eid(p) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 8, z = Math.sin(a) * 8;
      cyl(.08, .08, 4.5, '#5d4037', x, 2.25, z, p, 6);
      for (let k = 0; k < 4; k++) {
        const b = (i + k / 4) / 6 * Math.PI * 2, lx = Math.cos(b) * 8, lz = Math.sin(b) * 8, y = 4 - Math.sin(k / 4 * Math.PI) * .5;
        const l = mesh(sphere(.28), NIGHT.bulb, lx, y, lz, p); l.userData.keep = true; l.scale.y = 1.3;
        addGlow(p, lx, y, lz, 1.4, 3);
      }
    }
    // crescent moon sign
    const m = mesh(new THREE.TorusGeometry(1.1, .22, 8, 24, Math.PI * 1.3), NIGHT.bulb, 0, 6, 0, p);
    m.userData.keep = true; m.rotation.z = .6;
    cyl(.1, .1, 4.8, '#5d4037', 0, 2.4, 0, p, 6);
  },
  concert(p) {
    const s = new THREE.Group(); s.position.set(0, 0, -6); p.add(s);
    box(8, 1, 4, '#3a3f48', 0, .5, 0, s);
    box(8, .2, 4.2, '#222222', 0, 5.6, -.1, s);
    for (const x of [-3.8, 3.8]) { cyl(.12, .12, 5.1, '#555555', x, 3.1, -1.8, s, 6); box(1, 1.8, .9, '#111111', x, 1.9, 1.4, s); }
    for (let i = 0; i < 4; i++) { const l = mesh(sphere(.25), NIGHT.bulb, -2.4 + i * 1.6, 5.3, 1.6, s); l.userData.keep = true; addGlow(s, -2.4 + i * 1.6, 5.3, 1.6, 2, 5); }
  },
  rain() {},
};

// ---------- what residents do ----------
const ROUTINES = {
  festival(c, g, ctr) {
    const s = around(g, ctr);
    return [goTo(s.x, s.z), wait(rand(8, 14), Math.random() < .7 ? 'dance' : 'cheer', {
      face: faceTo(s, ctr), onStart: x => x.say(pick(['🎉', '🥳', '💃', '🎊'])),
      tick: (x, dt) => { if (Math.random() < dt * 1.5) g.effects.emit('note', head(x)); },
    })];
  },
  market(c, g, ctr) {
    const shop = g.town.randomOf('shop');
    if (shop && Math.random() < .4) return buyActs(c, shop);
    const s = around(g, ctr, 4, 9);
    return [goTo(s.x, s.z), wait(rand(4, 7), 'idle', { face: faceTo(s, ctr), onStart: x => x.say(pick(['🛍️', '🍎', '🍞', '🧀', '💰'])), onEnd: (x, d) => d && Math.random() < .6 && x.setCarry('bag', 40) })];
  },
  sports(c, g, ctr) {
    const list = [];
    for (let k = 0; k < 3; k++) { const s = around(g, ctr, 1, 9); list.push(goTo(s.x, s.z, { speed: 4 })); }
    list.push(wait(rand(3, 5), Math.random() < .5 ? 'jump' : 'cheer', { onStart: x => x.say(pick(['⚽', '🏃', '🏆', '💪'])) }));
    return list;
  },
  rain(c, g) {
    if (g.daynight.isNight) return null;
    const s = g.world.randomSpot(c.root.position, 14);
    c.setCarry('umbrella', 60);
    return [goTo(s.x, s.z), wait(rand(2, 4), 'idle', { onStart: x => Math.random() < .3 && x.say(pick(['☔', '🌧️', '💧'])) })];
  },
  fireworks(c, g, ctr) {
    const s = around(g, ctr, 6, 13);
    return [goTo(s.x, s.z), wait(rand(8, 14), 'cheer', { face: faceTo(s, ctr), onStart: x => x.say(pick(['🎆', '😍', '✨', '🤩'])) })];
  },
  cleanup(c, g) {
    const s = g.world.randomSpot(c.root.position, 12);
    return [goTo(s.x, s.z), wait(rand(4, 7), 'hoe', { tool: 'broom', onStart: x => Math.random() < .4 && x.say('🧹'), onEnd: (x, d) => d && g.effects.emit('sparkle', { x: x.root.position.x, y: .5, z: x.root.position.z }, 4) })];
  },
  eid(c, g, ctr) {
    const o = g.nearbyIdle(c, 16);
    if (o && Math.random() < .5) { o.command([chatAct(c, false)], false); return [say(pick(['🌙', '🍬', '🎁']), 2), chatAct(o, true)]; }
    const s = around(g, ctr, 3, 9);
    return [goTo(s.x, s.z), wait(rand(6, 10), Math.random() < .5 ? 'wave' : 'cheer', { face: faceTo(s, ctr), onStart: x => x.say(pick(['🌙', '🕌', '🍬', '🎁', '✨'])) })];
  },
  concert(c, g, ctr) {
    const s = around(g, { x: ctr.x, z: ctr.z + 2 }, 2, 8);
    const stage = { x: ctr.x, z: ctr.z - 6 };
    return [goTo(s.x, s.z), wait(rand(8, 14), Math.random() < .6 ? 'dance' : 'cheer', { face: faceTo(s, stage), onStart: x => x.say(pick(['🎸', '🎤', '🤘', '🎶'])) })];
  },
};

export class Events {
  constructor(game) {
    this.game = game;
    this.calendar = {};          // weekday (0 = Sunday) -> event key
    this.preview = null;         // { key, until } to try an event now
    this.active = null;
    this.decor = null;
    this.rain = null;
    this.fwTimer = 0;
  }
  todayKey() {
    if (this.preview && Date.now() < this.preview.until) return this.preview.key;
    this.preview = null;
    return this.calendar[new Date().getDay()] || null;
  }
  tryNow(key, minutes = 10) { this.preview = key ? { key, until: Date.now() + minutes * 60000 } : null; this.timer = 0; }
  // where people gather: a park if there is one, otherwise the town centre
  center() {
    const park = this.game.town.of('park')[0];
    return park ? { x: park.cx, z: park.cz } : { x: 0, z: 0 };
  }

  update(dt) {
    this.timer = (this.timer || 0) - dt;
    if (this.timer <= 0) {
      this.timer = 2;
      const key = this.todayKey();
      if (key !== this.active) this.switchTo(key);
    }
    const g = this.game;
    if (this.active === 'fireworks' && g.daynight.night > .5) {
      this.fwTimer -= dt;
      if (this.fwTimer <= 0) {
        this.fwTimer = rand(.6, 1.6);
        const c = this.center(), x = c.x + rand(-12, 12), z = c.z + rand(-12, 12), y = rand(22, 34);
        g.effects.emit('spark', { x, y, z }, 46, { color: pick(COLORS) });
      }
    }
    if (this.rain) this.updateRain(dt);
  }

  switchTo(key) {
    const g = this.game;
    if (this.decor) { g.scene.remove(this.decor); this.decor = null; }
    if (this.rain) { g.scene.remove(this.rain); this.rain = null; g.daynight.weather = 0; }
    this.active = key;
    if (!key) { g.emit('change'); return; }
    const c = this.center();
    this.decor = new THREE.Group();
    this.decor.position.set(c.x, 0, c.z);
    DECOR[key]?.(this.decor);
    mergeStatic(this.decor);
    shadows(this.decor);
    g.scene.add(this.decor);
    if (key === 'rain') this.makeRain();
    g.announce(t('eventToday', { e: t('ev_' + key), emoji: t('evE_' + key) }));
    for (const ch of g.chars) if (!ch.commanded) ch.interrupt();
    g.emit('event', key);
    g.emit('change');
  }

  // residents: join the event most of the time (workers a bit less)
  routineFor(c) {
    const key = this.active;
    if (!key || !ROUTINES[key]) return null;
    if (key === 'fireworks' && this.game.daynight.night < .5 && Math.random() < .7) return null;
    if (Math.random() > (c.job !== 'none' ? .35 : .7)) return null;
    return ROUTINES[key](c, this.game, this.center());
  }

  // ---------- rain ----------
  makeRain() {
    const n = 2400, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = rand(-60, 60), y = rand(0, 50), z = rand(-60, 60);
      pos.set([x, y, z, x + .1, y - 1.2, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#aac8e8', transparent: true, opacity: .55 }));
    this.rain.frustumCulled = false;
    this.game.scene.add(this.rain);
    this.game.daynight.weather = 1;
  }
  updateRain(dt) {
    const tgt = this.game.world.controls.target;
    this.rain.position.set(tgt.x, 0, tgt.z);
    const a = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 6) {
      a[i + 1] -= dt * 38; a[i + 4] -= dt * 38;
      if (a[i + 4] < 0) { a[i + 1] += 50; a[i + 4] += 50; }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  toJSON() { return { calendar: this.calendar }; }
}
