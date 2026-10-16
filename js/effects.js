// Little particle effects: dust, smoke, fire, water, confetti, emoji (💤 ❤️ ✨ 🎵).
import * as THREE from 'three';
import { emojiTexture, rand, pick } from './util.js';

function canvasTex(draw, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SOFT = canvasTex((g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.5, 'rgba(255,255,255,.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}, 64);
const SQUARE = canvasTex((g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); }, 8);

const KINDS = {
  dust: { tex: SOFT, color: '#d9c9a5', size: [.5, 1.4], life: [.7, 1.1], spread: .9, up: [.3, .8], grav: -.3, op: .8 },
  smoke: { tex: SOFT, color: '#a3a3a3', size: [.6, 2.0], life: [2, 3], spread: .25, up: [.6, 1], grav: 0, op: .5 },
  steam: { tex: SOFT, color: '#ffffff', size: [.25, .8], life: [1, 1.4], spread: .12, up: [.5, .8], grav: 0, op: .6 },
  fire: { tex: SOFT, colors: ['#ff9a1f', '#ffcf3f', '#ff5a1f'], size: [1.1, .2], life: [.5, .9], spread: .3, up: [1.2, 2.2], grav: 0, op: .95, add: true },
  water: { tex: SOFT, color: '#7fd0ff', size: [.25, .35], life: [.7, 1], spread: .1, up: [0, 0], grav: -9, op: .85 },
  splash: { tex: SOFT, color: '#bfe9ff', size: [.28, .15], life: [.5, .8], spread: 1.6, up: [2, 3.5], grav: -9, op: .9 },
  sparkle: { emoji: ['✨'], size: [.45, .2], life: [.8, 1.2], spread: .7, up: [.3, .8], grav: 0 },
  heart: { emoji: ['❤️', '💚', '💛'], size: [.4, .55], life: [1.2, 1.6], spread: .5, up: [.6, 1], grav: 0 },
  zzz: { emoji: ['💤'], size: [.45, .75], life: [1.8, 2.4], spread: .15, up: [.4, .6], grav: 0 },
  note: { emoji: ['🎵', '🎶'], size: [.4, .5], life: [1.2, 1.6], spread: .6, up: [.6, 1], grav: 0 },
  spark: { tex: SOFT, colors: ['#ff5d73', '#ffcf3f', '#5fb3ff', '#7be07b', '#c38bff'], size: [.9, .15], life: [1.2, 1.9], spread: 9, up: [-6, 6], grav: -2.5, op: 1, add: true },
  confetti: { tex: SQUARE, colors: ['#ff5d73', '#ffcf3f', '#5fb3ff', '#7be07b', '#c38bff'], size: [.18, .18], life: [1.6, 2.4], spread: 3.2, up: [3, 6.5], grav: -6, spin: true },
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.live = [];
  }

  // pos: {x,y,z}; o.dir + o.speed shoot particles in a direction (water jets)
  emit(kind, pos, n = 1, o = {}) {
    const k = KINDS[kind];
    for (let i = 0; i < n; i++) {
      if (this.live.length > 900) return;
      const s = this.free.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, transparent: true, depthWrite: false }));
      const m = s.material;
      m.map = k.emoji ? emojiTexture(pick(k.emoji)) : k.tex;
      m.color.set(k.emoji ? '#ffffff' : (k.colors ? pick(k.colors) : (o.color || k.color)));
      m.blending = k.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.rotation = k.spin ? rand(0, 6) : 0;
      const sp = k.spread;
      s.position.set(pos.x + rand(-.15, .15) * sp, pos.y, pos.z + rand(-.15, .15) * sp);
      let vx = rand(-1, 1) * sp, vy = rand(k.up[0], k.up[1]), vz = rand(-1, 1) * sp;
      if (o.dir) {
        const sp2 = o.speed || 6;
        vx = o.dir.x * sp2 + rand(-.3, .3); vy = o.dir.y * sp2 + rand(-.3, .3); vz = o.dir.z * sp2 + rand(-.3, .3);
      }
      s.scale.setScalar(k.size[0]);
      this.scene.add(s);
      this.live.push({ s, vx, vy, vz, age: 0, life: rand(k.life[0], k.life[1]), s0: k.size[0], s1: k.size[1], grav: k.grav, op: k.op ?? 1, spin: k.spin });
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.s);
        this.free.push(p.s);
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y = Math.max(.05, p.s.position.y + p.vy * dt);
      p.s.position.z += p.vz * dt;
      if (p.grav < -1 && p.s.position.y <= .05) { p.vx *= .8; p.vz *= .8; }
      const f = p.age / p.life;
      const size = p.s0 + (p.s1 - p.s0) * f;
      p.s.scale.set(size, size, 1);
      p.s.material.opacity = p.op * Math.min(1, f / .1) * (f > .6 ? (1 - f) / .4 : 1);
      if (p.spin) p.s.material.rotation += dt * 4;
    }
  }
}
