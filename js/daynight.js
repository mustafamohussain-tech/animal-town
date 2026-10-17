// Day / night clock: moves the sun, colours the sky, turns on windows, street lamps and nearby lights.
import * as THREE from 'three';
import { clamp } from './util.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SKY_NIGHT = new THREE.Color('#0a1130'), SKY_DAWN = new THREE.Color('#f4a36c'), SKY_DAY = new THREE.Color('#a9dcff');
const HEMI_NIGHT = new THREE.Color('#5d6fb8'), HEMI_DAY = new THREE.Color('#ffffff');
const POOL_SIZE = 4;

// soft round glow texture (lamp halos, light on the ground)
function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.35, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTex();

// shared materials that light up at night
export const NIGHT = {
  winLit: new THREE.MeshStandardMaterial({ color: '#9fd6f5', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: .15, metalness: .2 }),
  winLit2: new THREE.MeshStandardMaterial({ color: '#a8dcf7', emissive: '#ffe6b0', emissiveIntensity: 0, roughness: .15, metalness: .2 }),
  winDark: new THREE.MeshStandardMaterial({ color: '#8fc9ea', roughness: .15, metalness: .25 }),
  bulb: new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe7a3', emissiveIntensity: .1 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff0c0', emissiveIntensity: .3 }),
  halo: new THREE.SpriteMaterial({ map: GLOW, color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  pool: new THREE.MeshBasicMaterial({ map: GLOW, color: '#ffc870', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
};
const POOL_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// a lamp's glow: a halo around the bulb + a warm light pool on the ground
export function addGlow(parent, x, y, z, size = 2.2, groundSize = 9) {
  const s = new THREE.Sprite(NIGHT.halo);
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  parent.add(s);
  const p = new THREE.Mesh(POOL_GEO, NIGHT.pool);
  p.position.set(x, .07, z);
  p.scale.set(groundSize, 1, groundSize);
  p.userData.keep = true;
  p.userData.noShadow = true;
  parent.add(p);
}

export class DayNight {
  constructor(world) {
    this.world = world;
    // The clock follows real time: by default a full day+night takes 12 real hours
    // (6 hours of daylight, 6 hours of night), and it keeps going while the game is closed.
    this.cycleMs = 24 * 3600000;
    this.real = true;   // the town's clock follows the local time of day
    this.paused = false;
    this.offset = 0;
    this.setHour(9);
    this.night = 0;
    this.sources = new Set(); // { pos: Vector3 (world), power, alive() }
    this.poolTimer = 0;

    const s = world.scene;
    this.moonLight = new THREE.DirectionalLight('#8ea2ff', 0);
    this.moonLight.position.set(-30, 60, -20);
    s.add(this.moonLight);

    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight('#ffc77a', 0, 22, 1.6);
      s.add(l);
      this.pool.push(l);
    }

    // stars + moon
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * .45 + .08;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 900;
      pos[i * 3 + 1] = Math.sin(e) * 900;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 900;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff8e0', fog: false, transparent: true, opacity: 0 }));
    s.add(this.stars, this.moon);
    this.apply();
  }

  clockHour() {
    if (this.real) { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    return ((Date.now() / this.cycleMs * 24 + this.offset) % 24 + 24) % 24;
  }
  setReal() { this.real = true; this.cycleMs = 24 * 3600000; this.paused = false; this.hour = this.clockHour(); if (this.moon) this.apply(); }
  setHour(h) {
    this.real = false;   // picking an hour by hand leaves real time (the "real time" option brings it back)
    this.hour = ((h % 24) + 24) % 24;
    this.offset = ((this.hour - Date.now() / this.cycleMs * 24) % 24 + 24) % 24;
    if (this.moon) this.apply();
  }
  setPaused(p) { this.paused = p; if (!p) this.setHour(this.hour); }
  setCycle(ms) { const h = this.hour; this.cycleMs = ms; this.setHour(h); this.real = false; }
  get clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get isNight() { return this.hour >= 21.5 || this.hour < 6; }

  addSource(src) { this.sources.add(src); return src; }
  removeSource(src) { this.sources.delete(src); }

  update(dt) {
    if (!this.paused) this.hour = this.clockHour();
    this.apply();
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) { this.poolTimer = .4; this.assignPool(); }
    const k = this.night, on = k > .02;
    for (const l of this.pool) { l.intensity = (l.userData.power || 0) * k; if (l.visible !== on) l.visible = on; }
  }

  apply() {
    const w = this.world, h = this.hour;
    const elev = Math.sin((h - 6) / 12 * Math.PI);
    const dayAmt = smooth(-.12, .3, elev) * (1 - .35 * (this.weather || 0));
    this.night = 1 - smooth(-.08, .18, elev);

    const sky = SKY_NIGHT.clone().lerp(SKY_DAWN, smooth(-.2, .05, elev)).lerp(SKY_DAY, smooth(.05, .4, elev));
    w.scene.background.copy(sky);
    w.scene.fog.color.copy(sky);
    w.sun.intensity = 2.2 * smooth(0, .25, elev);
    w.sun.color.setHSL(.1, .6 + .4 * (1 - smooth(0, .4, elev)) * .5, .5 + .4 * smooth(0, .4, elev));
    w.hemi.intensity = .22 + .95 * dayAmt;
    w.hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, dayAmt);
    this.moonLight.intensity = .45 * (1 - dayAmt);

    const a = (h - 6) / 12 * Math.PI;
    w.sunOffset.set(Math.cos(a) * 45, Math.max(10, Math.sin(a) * 55), 25);
    this.moon.position.set(-Math.cos(a) * 700, Math.max(120, -Math.sin(a) * 600), -300);
    this.moon.material.opacity = 1 - dayAmt;
    this.stars.material.opacity = clamp(1 - dayAmt * 1.6, 0, 1);
    this.stars.visible = this.moon.visible = dayAmt < .95;

    const n = this.night;
    NIGHT.winLit.emissiveIntensity = 1.35 * n;
    NIGHT.winLit2.emissiveIntensity = .9 * n;
    NIGHT.bulb.emissiveIntensity = .1 + 3 * n;
    NIGHT.ceiling.emissiveIntensity = .3 + 1.6 * n;
    NIGHT.halo.opacity = .75 * n;
    NIGHT.pool.opacity = .38 * n;
    for (const c of w.clouds) c.children.forEach(m => m.material.color.setScalar(.35 + .65 * dayAmt));
  }

  // give the few real point lights to the light sources closest to the camera
  assignPool() {
    if (this.night < .01) { for (const l of this.pool) l.userData.power = 0; return; }
    const t = this.world.controls.target;
    const list = [];
    for (const s of this.sources) {
      if (s.alive && !s.alive()) continue;
      list.push([s, (s.pos.x - t.x) ** 2 + (s.pos.z - t.z) ** 2]);
    }
    list.sort((a, b) => a[1] - b[1]);
    this.pool.forEach((l, i) => {
      const s = list[i]?.[0];
      if (!s) { l.userData.power = 0; return; }
      l.position.copy(s.pos);
      l.userData.power = s.power || 6;
      l.color.set(s.color || '#ffc77a');
    });
  }
}
