// Furniture + room layouts inside buildings.
// Every layout works in building-local coordinates: x = left/right, z = back(-)/front(+), door at the front centre.
// A layout receives R = { g, W, D, k, floors, x0, x1, z0, z1, xs, spot(), block(), light() }.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, coneGeo, chalkTexture, pick, rand } from './util.js';
import { NIGHT } from './daynight.js';

const WOOD = '#a0703f', DARK = '#5a3b22', WHITE = '#f2f2f2', METAL = '#9aa3ad';
const FABRIC = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e', '#ff7aa2'];
const H = Math.PI / 2;

function at(p, x, z, rot = 0, y = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  p.add(g);
  return g;
}
// offset (dx,dz) in an object's own frame -> building coordinates
const off = (x, z, rot, dx, dz) => [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)];
const swap = rot => Math.abs(Math.sin(rot)) > .5;
function blockBox(R, x, z, w, d, rot = 0) {
  if (swap(rot)) [w, d] = [d, w];
  R.block(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}

// ---------------- furniture (front of each piece faces +z) ----------------
export const F = {
  table(p, x, z, w = 1.6, d = 1, h = 1.0, color = WOOD, rot = 0) {
    const g = at(p, x, z, rot);
    box(w, .1, d, color, 0, h, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.1, h, .1, DARK, sx * (w / 2 - .1), h / 2, sz * (d / 2 - .1), g);
    return g;
  },
  chair(p, x, z, rot = 0, color = WOOD) {
    const g = at(p, x, z, rot);
    box(.7, .1, .7, color, 0, .62, 0, g);
    box(.7, .8, .1, color, 0, 1.05, -.31, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.07, .62, .07, DARK, sx * .28, .31, sz * .28, g);
    return g;
  },
  stool(p, x, z, color = '#e67e22') { const g = at(p, x, z); cyl(.3, .3, .1, color, 0, .62, 0, g); cyl(.06, .08, .6, METAL, 0, .3, 0, g); return g; },
  sofa(p, x, z, rot = 0, color = pick(FABRIC)) {
    const g = at(p, x, z, rot);
    box(2.6, .5, 1.0, color, 0, .3, 0, g);
    box(2.6, .9, .3, color, 0, .75, -.38, g);
    for (const s of [-1, 1]) box(.3, .75, 1.0, color, s * 1.3, .45, 0, g);
    for (const s of [-1, 1]) box(1.1, .16, .8, color, s * .6, .62, .08, g);
    return g;
  },
  bed(p, x, z, rot = 0, color = pick(FABRIC)) {
    const g = at(p, x, z, rot);
    box(1.8, .4, 3.0, WOOD, 0, .22, 0, g);
    box(1.7, .22, 2.85, WHITE, 0, .52, 0, g);
    box(1.15, .18, .5, '#ffffff', 0, .7, -1.1, g);
    box(1.74, .24, 1.8, color, 0, .56, .5, g);
    box(1.9, 1.3, .14, WOOD, 0, .65, -1.5, g);
    return g;
  },
  hospitalBed(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(1.6, .5, 2.9, '#dfe6ee', 0, .45, 0, g);
    box(1.5, .2, 2.75, '#ffffff', 0, .78, 0, g);
    box(1.0, .16, .45, '#ffffff', 0, .95, -1.05, g);
    box(1.52, .22, 1.5, '#7fc8c2', 0, .82, .55, g);
    for (const s of [-1, 1]) box(.06, .35, 1.4, METAL, s * .8, 1.05, .2, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(.05, .05, .45, METAL, sx * .65, .22, sz * 1.3, g, 6);
    box(1.6, 1.0, .1, '#c0c6cf', 0, .9, -1.45, g);
    return g;
  },
  desk(p, x, z, rot = 0, w = 1.8, color = WOOD) {
    const g = at(p, x, z, rot);
    box(w, .08, .9, color, 0, 1.0, 0, g);
    box(.5, .95, .85, DARK, w / 2 - .3, .48, 0, g);
    box(.08, .95, .85, DARK, -w / 2 + .05, .48, 0, g);
    return g;
  },
  computer(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(.75, .48, .06, '#1d1d1d', 0, 1.42, -.2, g);
    box(.68, .4, .02, '#3f7fd6', 0, 1.42, -.165, g);
    box(.08, .22, .08, '#333333', 0, 1.13, -.2, g);
    box(.6, .03, .22, '#333333', 0, 1.05, .1, g);
    return g;
  },
  shelf(p, x, z, rot = 0, w = 2.4, h = 2.6, goods = FABRIC) {
    const g = at(p, x, z, rot);
    box(w, h, .1, '#c9a27a', 0, h / 2, -.38, g);
    for (const s of [-1, 1]) box(.08, h, .8, '#b08860', s * w / 2, h / 2, 0, g);
    for (let k = 0; k < 4; k++) {
      const y = .15 + k * (h - .3) / 3;
      box(w, .06, .8, '#b08860', 0, y, 0, g);
      if (k === 3) continue;
      for (let i = 0; i < Math.floor(w / .38); i++) {
        const gw = rand(.2, .3), gh = rand(.3, .5);
        box(gw, gh, rand(.25, .45), pick(goods), -w / 2 + .25 + i * .38, y + gh / 2 + .03, rand(-.05, .1), g);
      }
    }
    return g;
  },
  counter(p, x, z, rot = 0, w = 2.6, color = '#b07a45') {
    const g = at(p, x, z, rot);
    box(w, 1.1, .9, color, 0, .55, 0, g);
    box(w + .1, .08, 1.0, DARK, 0, 1.14, 0, g);
    return g;
  },
  register(p, x, z, rot = 0) {
    const g = at(p, x, z, rot, 1.18);
    box(.5, .25, .4, '#444444', 0, .12, 0, g);
    box(.4, .25, .05, '#2ecc71', 0, .38, -.12, g);
    return g;
  },
  board(p, x, z, rot = 0, w = 4.5) {
    const g = at(p, x, z, rot);
    box(w + .2, 1.9, .08, DARK, 0, 2.25, 0, g);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.7), new THREE.MeshStandardMaterial({ map: chalkTexture(), roughness: .9 }));
    b.position.set(0, 2.25, .05);
    b.userData.keep = true;
    g.add(b);
    box(w, .06, .15, DARK, 0, 1.33, .1, g);
    return g;
  },
  tv(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(1.8, .6, .5, DARK, 0, .3, 0, g);
    box(1.9, 1.05, .08, '#111111', 0, 1.25, -.05, g);
    box(1.78, .93, .02, '#2a5ea8', 0, 1.25, -.005, g);
    return g;
  },
  rug(p, x, z, w, d, color = pick(['#c0392b', '#2c6e9b', '#8e5a3c', '#6c5b7b'])) { return box(w, .03, d, color, x, .02, z, p); },
  plant(p, x, z) {
    const g = at(p, x, z);
    cyl(.28, .22, .5, '#b5651d', 0, .25, 0, g, 10);
    for (let k = 0; k < 4; k++) ball(.3, '#3e9b4f', rand(-.15, .15), .75 + k * .18, rand(-.15, .15), g);
    return g;
  },
  floorLamp(p, x, z) {
    const g = at(p, x, z);
    cyl(.25, .25, .05, '#333333', 0, .03, 0, g);
    cyl(.04, .04, 2.2, '#333333', 0, 1.1, 0, g, 6);
    mesh(coneGeo(.4, .5, 14), NIGHT.ceiling, 0, 2.3, 0, g).rotation.x = Math.PI;
    return g;
  },
  fridge(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(1.0, 2.3, .85, '#e8eef2', 0, 1.15, 0, g);
    box(.06, .6, .06, METAL, .38, 1.6, .45, g);
    box(1.0, .03, .87, '#c9d2d8', 0, 1.5, 0, g);
    return g;
  },
  kitchen(p, x, z, rot = 0, w = 3) {
    const g = at(p, x, z, rot);
    box(w, 1.0, .85, '#f0e6d8', 0, .5, 0, g);
    box(w + .05, .08, .9, '#5d6d7e', 0, 1.04, 0, g);
    box(.7, .05, .55, '#2b2b2b', w / 2 - .7, 1.1, 0, g);
    cyl(.22, .2, .25, METAL, w / 2 - .7, 1.25, 0, g, 12);
    box(.6, .05, .4, '#aeb6bf', -w / 2 + .7, 1.09, 0, g);
    box(w, .8, .45, '#e6dccd', 0, 2.5, -.2, g);
    return g;
  },
  wardrobe(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(1.7, 2.6, .7, '#8e5a3c', 0, 1.3, 0, g);
    box(.04, 2.4, .02, DARK, 0, 1.3, .36, g);
    for (const s of [-1, 1]) ball(.05, '#f2c94c', s * .12, 1.35, .38, g);
    return g;
  },
  lockers(p, x, z, rot = 0, n = 4) {
    const g = at(p, x, z, rot);
    for (let i = 0; i < n; i++) {
      box(.65, 2.3, .6, i % 2 ? '#b0413e' : '#c0504d', -n * .33 + .33 + i * .66, 1.15, 0, g);
      box(.3, .05, .02, '#eeeeee', -n * .33 + .33 + i * .66, 1.9, .31, g);
    }
    return g;
  },
  bars(p, x0, z0, x1, z1, h = 3) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / .35));
    for (let i = 0; i <= n; i++) cyl(.04, .04, h, '#555555', x0 + (x1 - x0) * i / n, h / 2, z0 + (z1 - z0) * i / n, p, 6);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
    const top = box(len, .08, .08, '#555555', mx, h - .1, mz, p);
    top.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  },
  cabinet(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(1.4, 2.0, .6, '#ffffff', 0, 1.0, 0, g);
    box(.5, .14, .02, '#e74c3c', 0, 1.5, .31, g);
    box(.14, .5, .02, '#e74c3c', 0, 1.5, .31, g);
    return g;
  },
  curtain(p, x, z, rot = 0, len = 2.6) { const g = at(p, x, z, rot); box(.05, 2.2, len, '#a8d8e0', 0, 1.3, 0, g); return g; },
  bookshelf(p, x, z, rot = 0, w = 2.4) { return F.shelf(p, x, z, rot, w, 2.6, ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#7f4f24']); },
  hay(p, x, z, rot = 0) { const g = at(p, x, z, rot); box(1.4, .8, .9, '#e2c15c', 0, .4, 0, g); box(1.42, .06, .92, '#c9a63c', 0, .5, 0, g); return g; },
  truck(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(2.4, 1.3, 5.2, '#d62d20', 0, 1.05, -.3, g);
    box(2.4, 1.2, 1.7, '#d62d20', 0, 1.6, 2.6, g);
    box(2.2, .7, .06, '#8fd3f5', 0, 1.95, 3.46, g);
    for (const s of [-1, 1]) box(.08, .08, 4.4, '#dddddd', s * .7, 1.8, -.6, g);
    for (let k = 0; k < 9; k++) box(1.4, .06, .06, '#dddddd', 0, 1.8, -2.6 + k * .5, g);
    box(1.2, .18, .3, '#ffd23f', 0, 2.27, 2.6, g);
    for (const sx of [-1, 1]) for (const sz of [-1.8, .2, 2.6]) cyl(.45, .45, .3, '#222222', sx * 1.2, .45, sz, g, 14).rotation.z = H;
    return g;
  },
  stairs(p, x, z, w, len, height) {
    const g = at(p, x, z);
    const n = 12;
    for (let i = 0; i < n; i++) box(w, height / n, len / n + .02, '#c8b8a2', 0, (i + .5) * height / n, len / 2 - (i + .5) * len / n, g);
    box(.08, 1, len, METAL, w / 2, height / 2 + .5, 0, g).rotation.x = Math.atan2(height, len);
    return g;
  },
  ceiling(p, x, y, z) {
    const g = at(p, x, z, 0, y);
    cyl(.02, .02, .6, '#333333', 0, -.2, 0, g, 4);
    mesh(coneGeo(.45, .35, 14), NIGHT.ceiling, 0, -.6, 0, g);
    return g;
  },
  waterCooler(p, x, z) { const g = at(p, x, z); box(.5, 1.1, .5, '#dfe6ee', 0, .55, 0, g); cyl(.22, .22, .55, '#7fc8ff', 0, 1.38, 0, g, 12); return g; },
  mailboxes(p, x, z, rot = 0) {
    const g = at(p, x, z, rot);
    box(2.4, 1.6, .3, '#b8a07a', 0, 1.5, 0, g);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) box(.38, .38, .04, '#8a7350', -.96 + c * .48, .98 + r * .5, .16, g);
    return g;
  },
};

// ---------------- room layouts ----------------
const mid = R => (R.z0 + R.z1) / 2;

function seatsAround(R, x, z, n = 2, color) {
  F.table(R.g, x, z, 1.3, 1.3, 1.0, '#ffffff');
  R.blockBox(x, z, 1.3, 1.3);
  const sides = n === 4 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-1, 0], [1, 0]];
  for (const [sx, sz] of sides) {
    const rot = Math.atan2(-sx, -sz);
    const cx = x + sx * 1.05, cz = z + sz * 1.05;
    F.chair(R.g, cx, cz, rot, color);
    R.spot('seat', cx, cz, rot, 'sit');
  }
}

function classroom(R) {
  const { x0, x1, z0, z1 } = R;
  const bw = Math.min(R.W - 5, 6.5);
  F.board(R.g, 0, z0 + .08, 0, bw);
  R.blockBox(0, z0 + .1, bw, .3);
  F.desk(R.g, x1 - 1.6, z0 + 1.6, 0, 1.6, '#8e5a3c');
  R.blockBox(x1 - 1.6, z0 + 1.6, 1.6, .9);
  R.spot('work', 1.4, z0 + 1.7, 0, 'stand');
  R.spot('work', -1.4, z0 + 1.7, 0, 'stand');
  for (let z = z0 + 4.2; z < z1 - 1.8; z += 2.5) {
    for (let x = R.xs + 1.2; x < x1 - .9; x += 2.4) {
      if (Math.abs(x) < 1.7 && z > z1 - 3.6 && R.k === 0) continue;
      F.table(R.g, x, z, 1.3, .7, .9, '#d8b07a');
      R.blockBox(x, z, 1.3, .7);
      F.chair(R.g, x, z + .75, Math.PI, '#3e7cc2');
      R.spot('seat', x, z + .75, Math.PI, 'sit');
    }
  }
  F.bookshelf(R.g, x1 - .45, mid(R) + 1, -H, 2.2);
  R.blockBox(x1 - .45, mid(R) + 1, 2.2, .8, -H);
  F.plant(R.g, x0 + .6, z1 - .6);
}

function bedroom(R, beds) {
  const { x1, z0, z1 } = R;
  const usable = x1 - R.xs, n = beds || Math.max(1, Math.min(3, Math.floor(usable / 3.4)));
  for (let i = 0; i < n; i++) {
    const x = R.xs + 1.4 + i * 3.3;
    F.bed(R.g, x, z0 + 1.6, 0);
    R.blockBox(x, z0 + 1.6, 1.9, 3.1);
    R.spot('bed', x, z0 + 3.05, 0, 'lie', .62);
  }
  F.wardrobe(R.g, x1 - .45, z1 - 1.6, -H);
  R.blockBox(x1 - .45, z1 - 1.6, 1.7, .7, -H);
  F.desk(R.g, R.xs + 1.2, z1 - .55, Math.PI, 1.6);
  F.chair(R.g, R.xs + 1.2, z1 - 1.4, 0);
  F.rug(R.g, (R.xs + x1) / 2, mid(R) + .8, 3, 2.2);
  F.floorLamp(R.g, x1 - .6, z0 + .6);
}

export const ROOMS = {
  home(R) {
    if (R.k > 0) return bedroom(R);
    const { x0, x1, z0, z1 } = R, m = mid(R);
    F.rug(R.g, x0 + 2.6, m + 1, 3.6, 3);
    F.sofa(R.g, x0 + .75, m + 1, H);
    R.blockBox(x0 + .75, m + 1, 2.9, 1.1, H);
    R.spot('seat', x0 + 1.0, m + .45, H, 'sit');
    R.spot('seat', x0 + 1.0, m + 1.55, H, 'sit');
    F.table(R.g, x0 + 2.5, m + 1, .9, 1.4, .55);
    R.blockBox(x0 + 2.5, m + 1, .9, 1.4);
    F.tv(R.g, x0 + 4.4, m + 1, -H);
    R.blockBox(x0 + 4.4, m + 1, 1.9, .55, -H);
    F.kitchen(R.g, x1 - 2.7, z0 + .45, 0, 3);
    R.blockBox(x1 - 2.7, z0 + .45, 3, .9);
    F.fridge(R.g, x1 - .55, z0 + .5, 0);
    R.blockBox(x1 - .55, z0 + .5, 1, .9);
    R.spot('work', x1 - 2.7, z0 + 1.6, Math.PI, 'stand');
    seatsAround(R, x1 - 2.4, m + .9, 2);
    if (R.floors === 1) {
      // one-floor house: the bed is downstairs
      F.bed(R.g, x1 - 1.6, z1 - 1.4, -H);
      R.blockBox(x1 - 1.6, z1 - 1.4, 1.9, 3.1, -H);
      R.spot('bed', x1 - 3.05, z1 - 1.4, -H, 'lie', .62);
    } else F.plant(R.g, x1 - .6, z1 - .6);
    F.floorLamp(R.g, x0 + .6, z1 - .8);
    R.light(0, m);
  },
  apartment(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    if (R.k === 0) {
      F.counter(R.g, x0 + 2.4, z1 - 2.6, 0, 2.6, '#8e5a3c');
      R.blockBox(x0 + 2.4, z1 - 2.6, 2.6, .9);
      R.spot('work', x0 + 2.4, z1 - 3.6, 0, 'stand');
      F.mailboxes(R.g, x1 - 2, z0 + .2, 0);
      F.sofa(R.g, x1 - .75, m + .5, -H, '#6c5b7b');
      R.blockBox(x1 - .75, m + .5, 2.9, 1.1, -H);
      R.spot('seat', x1 - 1.0, m, -H, 'sit');
      R.spot('seat', x1 - 1.0, m + 1.1, -H, 'sit');
      F.plant(R.g, x0 + .6, z1 - .6); F.plant(R.g, x1 - .6, z1 - .6);
      box(1.6, 2.6, .1, '#aeb6bf', R.xs + 1.2, 1.3, z0 + .05, R.g);
      return;
    }
    // two flats per floor, split by a wall
    box(.2, R.FH - .3, R.D - 3, '#e8e2d6', .6, (R.FH - .3) / 2, z0 + (R.D - 3) / 2 - .4, R.g);
    R.block(.4, z0 - .5, .8, z0 + R.D - 3.6);
    for (const [a, b] of [[R.xs, .3], [.9, x1]]) {
      const cx = (a + b) / 2;
      F.bed(R.g, cx, z0 + 1.6, 0);
      R.blockBox(cx, z0 + 1.6, 1.9, 3.1);
      R.spot('bed', cx, z0 + 3.05, 0, 'lie', .62);
      F.sofa(R.g, cx, z1 - .7, Math.PI);
      R.blockBox(cx, z1 - .7, 2.9, 1.1, Math.PI);
      F.rug(R.g, cx, m + .8, 2.4, 2);
    }
  },
  shop(R, variant) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    const goods = { food: ['#e74c3c', '#f39c12', '#f1c40f', '#7cc576', '#d8a35c'], clothes: FABRIC, toys: ['#ff5d73', '#ffcf3f', '#5fb3ff', '#7be07b', '#c38bff'] }[variant] || FABRIC;
    for (let x = R.xs + 1.3; x < x1 - 1.1; x += 2.5) {
      F.shelf(R.g, x, z0 + .45, 0, 2.3, 2.6, goods);
      R.blockBox(x, z0 + .45, 2.3, .8);
      R.spot('browse', x, z0 + 1.6, Math.PI, 'stand');
    }
    for (let z = z0 + 3; z < z1 - 2.5; z += 2.5) {
      F.shelf(R.g, x0 + .45, z, H, 2.3, 2.6, goods);
      R.blockBox(x0 + .45, z, 2.3, .8, H);
      R.spot('browse', x0 + 1.6, z, -H, 'stand');
    }
    F.shelf(R.g, 0, m - .2, H, 2.6, 1.6, goods);
    R.blockBox(0, m - .2, 2.6, .8, H);
    F.counter(R.g, x1 - 2, z1 - 2.8, 0, 2.6);
    R.blockBox(x1 - 2, z1 - 2.8, 2.6, .9);
    F.register(R.g, x1 - 2.3, z1 - 2.8);
    R.spot('work', x1 - 2, z1 - 3.85, 0, 'stand');
    R.spot('counter', x1 - 2, z1 - 1.7, Math.PI, 'stand');
    R.spot('counter', x1 - 2.9, z1 - 1.5, Math.PI, 'stand');
    R.light(0, m);
  },
  restaurant(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    if (R.k === 0) {
      const kw = Math.min(R.W - 4.5, 8);
      F.kitchen(R.g, .6, z0 + .45, 0, kw);
      R.blockBox(.6, z0 + .45, kw, .9);
      F.fridge(R.g, x1 - .55, z0 + .5);
      R.blockBox(x1 - .55, z0 + .5, 1, .9);
      R.spot('work', -.6, z0 + 1.6, Math.PI, 'stand');
      R.spot('work', 1.8, z0 + 1.6, Math.PI, 'stand');
      for (const z of [m + .4, z1 - 2.3]) for (let x = R.xs + 1.8; x < x1 - 1.2; x += 3.6) {
        if (Math.abs(x) < 1.9 && z > z1 - 3.4) continue;
        seatsAround(R, x, z, 2, '#c0392b');
      }
    } else {
      for (const z of [z0 + 2.2, m + .8, z1 - 2]) for (let x = R.xs + 1.8; x < x1 - 1.2; x += 3.6) seatsAround(R, x, z, 2, '#c0392b');
    }
    F.plant(R.g, x0 + .6, z1 - .6);
    R.light(0, m);
  },
  hospital(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    for (let x = R.xs + 1.2; x < x1 - .9; x += 3.4) {
      F.hospitalBed(R.g, x, z0 + 1.6, 0);
      R.blockBox(x, z0 + 1.6, 1.7, 3);
      R.spot('patient', x, z0 + 3.0, 0, 'lie', .88);
      R.spot('work', x + 1.1, z0 + 3.9, Math.PI * .85, 'stand');
      if (x + 1.7 < x1 - 1) F.curtain(R.g, x + 1.7, z0 + 1.5, 0, 2.8);
    }
    if (R.k === 0) {
      F.counter(R.g, x0 + 2.6, z1 - 2.6, 0, 3, '#dfe6ee');
      R.blockBox(x0 + 2.6, z1 - 2.6, 3, .9);
      F.computer(R.g, x0 + 2.6, z1 - 2.8, Math.PI);
      R.spot('work', x0 + 2.6, z1 - 3.6, 0, 'stand');
      for (let x = 2.4; x < x1 - .6; x += 1.1) { F.chair(R.g, x, z1 - .6, Math.PI, '#3e7cc2'); R.spot('seat', x, z1 - .6, Math.PI, 'sit'); }
    }
    F.cabinet(R.g, x1 - .4, m + .6, -H);
    R.blockBox(x1 - .4, m + .6, 1.4, .6, -H);
    F.plant(R.g, x0 + .6, m + 1);
    R.light(0, m);
  },
  school(R) { classroom(R); R.light(0, mid(R)); },
  police(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    const cellX = x1 - 3.6;
    F.bars(R.g, cellX, z0 + 3.4, x1, z0 + 3.4, 2.9);
    F.bars(R.g, cellX, z0, cellX, z0 + 3.4, 2.9);
    R.block(cellX - .2, z0 - .5, x1 + .5, z0 + 3.6);
    box(2, .5, .7, '#777777', x1 - 1.4, .25, z0 + .6, R.g);
    for (let i = 0; i < (R.W > 14 ? 4 : 2); i++) {
      const x = R.xs + 1.6 + i * 3;
      F.desk(R.g, x, m + .6, Math.PI, 1.8);
      R.blockBox(x, m + .6, 1.8, .9);
      F.computer(R.g, x, m + .6, Math.PI);
      F.chair(R.g, x, m - .4, 0, '#2c3e50');
      R.spot(i === 0 ? 'work' : 'seat', x, m - .4, 0, 'sit');
    }
    F.waterCooler(R.g, x0 + .5, z1 - .6);
    F.plant(R.g, x1 - .6, z1 - .6);
    R.light(0, m);
  },
  firestation(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    if (R.k === 0) {
      const tx = x0 + (R.W / 4);
      F.truck(R.g, tx, m + .2, 0);
      R.blockBox(tx, m + .2, 2.6, 6.4);
      F.lockers(R.g, x1 - 2.2, z0 + .35, 0, 5);
      R.blockBox(x1 - 2.2, z0 + .35, 3.4, .7);
      seatsAround(R, x1 - 3, m + 1.2, 4, '#c0392b');
      cyl(.08, .08, R.FH, '#cccccc', 2.2, R.FH / 2, z0 + 1.5, R.g, 8);
      R.spot('work', x1 - 2.2, z0 + 1.4, Math.PI, 'stand');
      R.light(tx, m);
      R.light(x1 - 3, m);
    } else bedroom(R, 3);
  },
  office(R) {
    const { x0, x1, z0, z1 } = R, m = mid(R);
    for (let z = z0 + 1.5; z < z1 - 2.5; z += 3) for (let x = R.xs + 1.4; x < x1 - 1; x += 3.2) {
      F.desk(R.g, x, z, 0, 1.8);
      R.blockBox(x, z, 1.8, .9);
      F.computer(R.g, x, z, 0);
      F.chair(R.g, x, z + .9, Math.PI, '#34495e');
      R.spot('seat', x, z + .9, Math.PI, 'sit');
    }
    F.waterCooler(R.g, x1 - .5, z1 - .6);
    F.plant(R.g, x0 + .6, z1 - .6);
    R.light(0, m);
  },
  barn(R) {
    const { x0, x1, z0, z1 } = R;
    for (let k = 0; k < 4; k++) { F.hay(R.g, x0 + 1 + (k % 2) * 1.5, z0 + .7 + Math.floor(k / 2) * 1.1); }
    R.block(x0, z0, x0 + 3.5, z0 + 2.4);
    box(.1, 1.6, 2, '#8b5a2b', x1 - .2, 1.2, (z0 + z1) / 2, R.g);
  },
};
