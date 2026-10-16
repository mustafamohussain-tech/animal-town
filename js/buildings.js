// Building types + styles, the Building class (placement on tiles, construction, cut-away view, fire) and the Town.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { box, cyl, ball, mesh, sphere, coneGeo, cylGeo, signTexture, shadows, mergeStatic, flatten, rand, pick, clamp, easeOutBack, dist2d } from './util.js';
import { TILE } from './path.js';
import { buildShell, FH } from './buildgen.js';
import { F } from './interiors.js';
import { NIGHT, addGlow } from './daynight.js';
import { t } from './i18n.js';

export const SHOP_EMOJI = { food: '🍎', clothes: '👕', toys: '🧸' };
const SHOP_COL = { food: '#7cc576', clothes: '#f28fb2', toys: '#a78bfa' };

// ---------- catalogue: every type has styles; floors = [min, max, default] ----------
export const TYPES = {
  house: {
    emoji: '🏠', role: 'home', tiles: [1, 1], floors: [1, 3, 2], time: 12,
    styles: {
      cottage: { roof: 'gable', window: 'square', chimney: true, walls: ['#f6d6a8', '#f7c6d9', '#d7f0c2', '#fff1b8', '#cfe8f7'], roofs: ['#c0392b', '#8e44ad', '#d35400', '#7f4f24', '#2f6f9f'] },
      modern: { roof: 'flat', window: 'wide', walls: ['#eceff1', '#d5dbe1', '#fafafa'], roofs: ['#4a4f5a'], trim: '#8a6a4a', band: '#8a6a4a' },
      villa: { roof: 'hip', window: 'tall', balcony: true, columns: true, walls: ['#f3e5c8', '#efd9b4', '#e8d3c0'], roofs: ['#b5523b', '#a0522d'] },
    },
  },
  apartment: {
    emoji: '🏢', role: 'apartment', tiles: [1, 1], floors: [3, 12, 5], time: 8,
    styles: {
      brick: { roof: 'flat', window: 'square', balcony: true, walls: ['#b5523b', '#a0472f', '#c0623f'], roofs: ['#555555'], trim: '#f1e3d3', band: '#f1e3d3' },
      modern: { roof: 'flat', window: 'band', walls: ['#e8eef3', '#d6dde4'], roofs: ['#4a4f5a'], trim: '#5d6d7e' },
      classic: { roof: 'hip', window: 'arch', balcony: true, walls: ['#efe0c4', '#e6d2b0'], roofs: ['#7f4f24'], band: '#ffffff' },
    },
  },
  shop: {
    emoji: '🏪', role: 'shop', tiles: [1, 1], floors: [1, 3, 1], time: 14, variants: ['food', 'clothes', 'toys'], job: 'shopkeeper', signBg: '#2e7d4f',
    styles: {
      corner: { roof: 'flat', window: 'wide', awning: true, variantWalls: true },
      boutique: { roof: 'flat', window: 'band', variantWalls: true, band: '#ffffff' },
    },
  },
  restaurant: {
    emoji: '🍕', role: 'restaurant', tiles: [1, 1], floors: [1, 3, 1], time: 16, job: 'chef', signBg: '#b03a2e',
    styles: {
      diner: { roof: 'flat', window: 'wide', awning: '#c0392b', walls: ['#f4c27a', '#f6d39a'] },
      cafe: { roof: 'gable', window: 'tall', awning: '#2e7d4f', walls: ['#e8d3b9', '#f1e2cc'], roofs: ['#6d4c41'] },
    },
  },
  hospital: {
    emoji: '🏥', role: 'hospital', tiles: [2, 1], floors: [1, 6, 3], time: 20, job: 'doctor', signBg: '#c0392b',
    styles: {
      modern: { roof: 'flat', window: 'band', walls: ['#f7f9fb'], band: '#e74c3c', cross: true },
      classic: { roof: 'flat', window: 'tall', walls: ['#f2efe6'], band: '#3e7cc2', cross: true, columns: true },
    },
  },
  school: {
    emoji: '🏫', role: 'school', tiles: [2, 1], floors: [1, 4, 2], time: 18, job: 'teacher', signBg: '#d35454',
    styles: {
      classic: { roof: 'gable', window: 'tall', walls: ['#ffd166'], roofs: ['#d35454'], bell: true, clock: true },
      modern: { roof: 'flat', window: 'band', walls: ['#f6efe0'], band: '#ff9f43', clock: true },
    },
  },
  police: {
    emoji: '🚓', role: 'police', tiles: [1, 1], floors: [1, 4, 2], time: 16, job: 'police', signBg: '#2f5aa8',
    styles: { station: { roof: 'flat', window: 'square', walls: ['#e8eef7'], band: '#2f5aa8', sirens: true } },
  },
  firestation: {
    emoji: '🚒', role: 'firestation', tiles: [2, 1], floors: [1, 3, 2], time: 18, job: 'firefighter', signBg: '#b71c1c',
    styles: { classic: { roof: 'flat', window: 'square', walls: ['#c0392b'], band: '#ffffff', garage: true, tower: true } },
  },
  farm: { emoji: '🌾', open: true, tiles: [2, 2], floors: [1, 1, 1], time: 14, job: 'farmer', signBg: '#8a5a2b', styles: { farm: {} } },
  dock: { emoji: '🎣', open: true, tiles: [2, 2], floors: [1, 1, 1], time: 14, job: 'fisher', canBurn: false, signBg: '#1f6f9f', styles: { pond: {} } },
  park: { emoji: '🌳', open: true, tiles: [1, 1], floors: [1, 1, 1], time: 10, canBurn: false, signBg: '#2e7d32', styles: { small: {}, big: { tiles: [2, 2] } } },
  custom: { emoji: '🏗️', role: 'office', tiles: [1, 1], floors: [1, 20, 3], time: 12, styles: { custom: {} } },
};
export const BUILD_MENU = ['house', 'apartment', 'shop', 'restaurant', 'hospital', 'school', 'police', 'firestation', 'farm', 'dock', 'park'];

// turn a type + choices into a full design ("spec") with colours picked
export function makeSpec(type, o = {}) {
  const def = TYPES[type] || TYPES.house;
  const styleKey = def.styles[o.style] ? o.style : Object.keys(def.styles)[0];
  const st = def.styles[styleKey];
  const variant = def.variants ? (def.variants.includes(o.variant) ? o.variant : def.variants[0]) : undefined;
  const vcol = variant ? SHOP_COL[variant] : null;
  return {
    type, style: styleKey, variant, role: def.role,
    tiles: (st.tiles || def.tiles).slice(),
    floors: clamp(Math.round(o.floors ?? def.floors[2]), def.floors[0], def.floors[1]),
    roof: st.roof || 'flat', window: st.window || 'square',
    balcony: !!st.balcony, columns: !!st.columns, chimney: !!st.chimney,
    awning: st.awning === true ? vcol : (st.awning || null),
    band: st.band || null, cross: !!st.cross, bell: !!st.bell, clock: !!st.clock, sirens: !!st.sirens,
    garage: !!st.garage, tower: !!st.tower,
    wall: o.wall || (st.variantWalls && vcol) || pick(st.walls || ['#e8e2d6']),
    roofColor: o.roofColor || pick(st.roofs || ['#4a4f5a']),
    trim: o.trim || st.trim || '#ffffff',
  };
}

// ---------- open places ----------
function makeCrop(g, kind) {
  if (kind === 'carrot') {
    for (const a of [-.3, 0, .3]) mesh(coneGeo(.04, .3, 5), '#4caf50', Math.sin(a) * .08, .2, 0, g).rotation.z = a;
    mesh(coneGeo(.07, .12, 8), '#f57c00', 0, .03, 0, g).rotation.x = Math.PI;
  } else if (kind === 'cabbage') {
    ball(.16, '#7cc576', 0, .12, 0, g).scale.set(1, .8, 1);
    ball(.1, '#a5d6a7', 0, .2, 0, g);
  } else if (kind === 'corn') {
    cyl(.025, .03, .7, '#7cb342', 0, .35, 0, g, 6);
    mesh(sphere(.06), '#fbc02d', .05, .45, 0, g).scale.set(1, 2.2, 1);
    mesh(coneGeo(.05, .3, 4), '#7cb342', -.06, .5, 0, g).rotation.z = .6;
  } else {
    ball(.15, '#ef8a17', 0, .12, 0, g).scale.set(1.2, .85, 1.2);
    cyl(.02, .02, .08, '#5d4037', 0, .27, 0, g, 6);
  }
}
function lampPost(b, p, x, z) {
  cyl(.1, .14, 4.2, '#3a3f48', x, 2.1, z, p, 8);
  mesh(sphere(.32), NIGHT.bulb, x, 4.35, z, p).userData.keep = true;
  addGlow(p, x, 4.35, z, 2.4, 9);
  b.lightSpots.push([x, 4.3, z]);
}
function signPost(b, p, x, z) {
  cyl(.08, .08, 2.2, '#8b5a2b', x, 1.1, z, p, 6);
  b.sign(p, x, 2.4, z + .05, 3.2, .8);
}

const OPEN = {
  farm(b) {
    const { W, D } = b;
    box(W, .06, D, '#a4c86a', 0, .03, 0, b.base());
    buildShell(b, { floors: 1, wall: '#b83b3b', trim: '#ffffff', roof: 'gable', roofColor: '#5a3b2a', window: 'square', role: 'barn', sign: false }, 8, 7, { ox: -W / 2 + 4.6, oz: -D / 2 + 4.2 });
    const rows = b.piece(0, 0);
    const plants = b.piece(0, 0);
    b.crops = [];
    const kinds = ['carrot', 'cabbage', 'corn', 'pumpkin'];
    let r = 0;
    for (let z = -D / 2 + 1.6; z < D / 2 - 3; z += 2.1, r++) {
      const xa = r < 4 ? -W / 2 + 10.5 : -W / 2 + 1.5, xb = W / 2 - 1.2;
      box(xb - xa, .18, .9, '#6b4a2b', (xa + xb) / 2, .1, z, rows);
      for (let x = xa + .6; x < xb - .3; x += 1.9) {
        const g = new THREE.Group();
        g.position.set(x, .2, z);
        g.userData.keep = true; // crops grow, so they stay separate
        makeCrop(g, kinds[r % 4]);
        mergeStatic(g);
        plants.add(g);
        const grow = rand(.3, 1);
        g.userData.base = 1.7;
        g.scale.setScalar(1.7 * (.25 + .75 * grow));
        b.crops.push({ g, grow, lx: x, lz: z });
      }
    }
    const fence = b.piece(0, 0);
    for (let x = -W / 2; x <= W / 2 + .01; x += 2) {
      cyl(.08, .08, 1.2, '#a0703f', x, .6, -D / 2, fence, 6);
      if (Math.abs(x) > 2) cyl(.08, .08, 1.2, '#a0703f', x, .6, D / 2, fence, 6);
    }
    for (let z = -D / 2; z <= D / 2 + .01; z += 2) for (const x of [-W / 2, W / 2]) cyl(.08, .08, 1.2, '#a0703f', x, .6, z, fence, 6);
    for (const y of [.5, .95]) {
      box(W, .08, .06, '#c08a4a', 0, y, -D / 2, fence);
      for (const s of [-1, 1]) box(W / 2 - 2, .08, .06, '#c08a4a', s * (W / 4 + 1), y, D / 2, fence);
      for (const x of [-W / 2, W / 2]) box(.06, .08, D, '#c08a4a', x, y, 0, fence);
    }
    const sc = b.piece(-W / 2 + 4, D / 2 - 2.5);
    cyl(.07, .07, 2.6, '#8b5a2b', 0, 1.3, 0, sc, 6);
    box(1.6, .08, .08, '#8b5a2b', 0, 1.9, 0, sc);
    box(.6, .7, .3, '#3e6db5', 0, 1.85, 0, sc);
    ball(.28, '#f2deb0', 0, 2.55, 0, sc);
    cyl(.5, .5, .05, '#e8c86a', 0, 2.75, 0, sc);
    cyl(.24, .26, .25, '#e8c86a', 0, 2.88, 0, sc);
    signPost(b, sc, 3.5, 2);
    b.spots.door = [[0, D / 2 + 1.4, Math.PI, 'stand', 0, 0]];
  },
  dock(b) {
    const { W, D } = b;
    const R = Math.min(W, D) / 2 - 2.2, cz = -1.2;
    cyl(R + .6, R + .6, .08, '#e8d7a5', 0, .04, cz, b.base(), 48);
    const pond = b.piece(0, cz);
    const water = new THREE.Mesh(cylGeo(R, R, .1, 48), new THREE.MeshStandardMaterial({ color: '#4fb3e8', roughness: .12, metalness: .15, transparent: true, opacity: .92 }));
    water.position.y = .08;
    water.userData.keep = true;
    water.userData.noShadow = true;
    pond.add(water);
    b.water = water;
    for (let k = 0; k < 9; k++) { const a = rand(0, 6.28), r = rand(2, R - 1); cyl(.45, .45, .03, '#3e9b4f', Math.cos(a) * r, .15, Math.sin(a) * r, pond, 12); }
    for (let k = 0; k < 30; k++) {
      const a = k / 30 * Math.PI * 2 + rand(-.05, .05);
      if (Math.sin(a) > .85) continue;
      cyl(.05, .05, rand(1, 1.8), '#5a8f3a', Math.cos(a) * (R + .2), .7, Math.sin(a) * (R + .2), pond, 5);
    }
    const pier = b.piece(0, 0);
    const pz0 = D / 2, pz1 = cz - 2;
    for (let z = pz0; z > pz1; z -= .55) box(1.9, .12, .48, '#a5774b', 0, .32, z, pier);
    for (let z = pz0; z > pz1; z -= 2.2) for (const x of [-.95, .95]) cyl(.09, .09, .6, '#7a5534', x, .15, z, pier, 6);
    const boat = b.piece(-R / 2, cz - R / 3);
    box(1.2, .45, 2.6, '#8a5a2b', 0, .25, 0, boat);
    box(1.0, .1, .4, '#c08a4a', 0, .45, 0, boat);
    const hut = b.piece(-W / 2 + 2.6, D / 2 - 2);
    box(3, 2.6, 2.4, '#d6b98c', 0, 1.3, 0, hut);
    box(3.4, .2, 2.8, '#2f6f9f', 0, 2.7, 0, hut);
    signPost(b, hut, 3.2, .8);
    b.bobber = ball(.12, '#e74c3c', 0, .2, pz1 - 2.5, pond);
    b.bobber.position.z = pz1 - 2.5 - cz;
    b.bobber.userData.keep = true;
    b.bobber.visible = false;
    b.blocks.push([-W / 2, cz - R - .2, -1, D / 2 - 3.4], [1, cz - R - .2, W / 2, D / 2 - .6], [-1, cz - R - .2, 1, pz1 - .2]);
    b.spots.work = [[0, pz1 + .4, Math.PI, 'stand', 0, 0], [.3, pz1 + 3, -Math.PI / 2, 'stand', 0, 0], [-.3, pz1 + 5, Math.PI / 2, 'stand', 0, 0]];
    b.spots.door = [[0, D / 2 + 1.4, Math.PI, 'stand', 0, 0]];
    b.points.bobber = [0, .2, pz1 - 2.5];
    b.points.pond = [0, .2, cz];
    b.pondR = R;
  },
  park(b) {
    const { W, D } = b, big = W > 14;
    const base = b.base();
    box(W, .06, D, '#73c25f', 0, .03, 0, base);
    box(2, .07, D, '#e3d3a8', 0, .035, 0, base);
    box(W, .07, 2, '#e3d3a8', 0, .035, 0, base);
    const fo = b.piece(0, 0);
    const fr = big ? 2.6 : 1.8;
    cyl(fr, fr + .2, .6, '#b9c2cc', 0, .3, 0, fo, 28);
    cyl(fr - .15, fr - .15, .06, '#5ab8ee', 0, .58, 0, fo, 28).userData.keep = true;
    cyl(.25, .3, 1.6, '#b9c2cc', 0, 1.1, 0, fo, 12);
    cyl(.8, .35, .3, '#b9c2cc', 0, 1.95, 0, fo, 16);
    const d = fr + 2.2;
    for (const [x, z, rot] of [[-d, 0, Math.PI / 2], [d, 0, -Math.PI / 2], [0, -d, 0], [0, d, Math.PI]]) {
      if (z > 0 && !big) continue;
      const bn = b.piece(x, z);
      bn.rotation.y = rot;
      box(2.4, .12, .8, '#a0703f', 0, .6, 0, bn);
      box(2.4, .7, .1, '#a0703f', 0, 1.05, -.38, bn);
      for (const s of [-1, 1]) box(.1, .6, .7, '#555555', s * 1.05, .3, 0, bn);
      const sx = Math.abs(Math.sin(rot)) > .5;
      for (const k of [-.6, .6]) {
        const px = x + (sx ? 0 : k), pz = z + (sx ? k : 0);
        (b.spots.seat ||= []).push([px + Math.sin(rot) * .1, pz + Math.cos(rot) * .1, rot, 'sit', 0, 0]);
      }
      b.blocks.push([x - (sx ? .5 : 1.3), z - (sx ? 1.3 : .5), x + (sx ? .5 : 1.3), z + (sx ? 1.3 : .5)]);
    }
    const tr = b.piece(0, 0);
    const corners = [[-W / 2 + 1.8, -D / 2 + 1.8], [W / 2 - 1.8, -D / 2 + 1.8], [W / 2 - 1.8, D / 2 - 1.8], [-W / 2 + 1.8, D / 2 - 1.8]];
    for (const [x, z] of corners) { b.world_tree(x, z, 2.3, tr); b.blocks.push([x - .6, z - .6, x + .6, z + .6]); }
    for (let k = 0; k < 16; k++) ball(.12, pick(['#ff7aa2', '#ffd23f', '#ffffff', '#b48cff']), rand(-W / 2 + 1, -1.5), .15, rand(1.5, D / 2 - 1), tr);
    const lp = b.piece(0, 0);
    for (const [x, z] of [[-1.6, D / 2 - 1.2], [1.6, -D / 2 + 1.2]]) lampPost(b, lp, x, z);
    if (big) {
      const pg = b.piece(W / 4 + 1, D / 4 + 1);
      box(1.2, 3, 1.2, '#e74c3c', -1.5, 1.5, 0, pg);
      const slide = box(1, .1, 4.2, '#ffcf3f', -1.5, 1.6, 2.2, pg);
      slide.rotation.x = .62;
      for (const s of [-1, 1]) cyl(.08, .08, 3, '#5d6d7e', 1.5 + s * 1.2, 1.5, 0, pg, 6);
      box(2.6, .1, .1, '#5d6d7e', 1.5, 3, 0, pg);
      box(.7, .08, .4, '#3498db', 1.5, .8, 0, pg);
      b.blocks.push([W / 4 - 1.2, D / 4 - .2, W / 4 + 3.2, D / 4 + 4.5]);
    }
    b.blocks.push([-fr - .3, -fr - .3, fr + .3, fr + .3]);
    b.points.fountain = [0, 2.1, 0];
    b.spots.door = [[0, D / 2 + 1, Math.PI, 'stand', 0, 0]];
  },
};

// ---------- placement on the tile grid ----------
export function footprint(spec, i, j, rot) {
  const [tw, td] = spec.tiles;
  const rw = rot % 2 ? td : tw, rd = rot % 2 ? tw : td;
  const list = [];
  for (let a = 0; a < rw; a++) for (let c = 0; c < rd; c++) list.push([i + a, j + c]);
  return { list, rw, rd };
}
export function canPlace(game, spec, i, j, rot, ignoreId) {
  const { list } = footprint(spec, i, j, rot);
  return list.every(([a, c]) => game.tiles.freeForBuilding(a, c, ignoreId));
}
// is there a road right in front of the building?
export function roadInFront(game, spec, i, j, rot) {
  const { rw, rd } = footprint(spec, i, j, rot);
  const cells = [];
  if (rot === 0) for (let a = 0; a < rw; a++) cells.push([i + a, j + rd]);
  if (rot === 2) for (let a = 0; a < rw; a++) cells.push([i + a, j - 1]);
  if (rot === 1) for (let c = 0; c < rd; c++) cells.push([i + rw, j + c]);
  if (rot === 3) for (let c = 0; c < rd; c++) cells.push([i - 1, j + c]);
  return cells.some(([a, c]) => game.tiles.isRoadish(a, c));
}
export function bestRotation(game, spec, i, j, fallback = 0) {
  for (const r of [fallback, 0, 1, 2, 3]) if (roadInFront(game, spec, i, j, r)) return r;
  return fallback;
}
// find the nearest free spot (facing a road if possible) for a building ordered by a command
export function autoPlace(game, spec) {
  const R = game.world.landR;
  let best = null, bestScore = Infinity;
  for (let i = -R; i <= R; i++) {
    for (let j = -R; j <= R; j++) {
      const d = Math.hypot(i, j);
      if (d * 10 > bestScore) continue;
      for (let rot = 0; rot < 4; rot++) {
        if (!canPlace(game, spec, i, j, rot)) continue;
        const score = d * 10 + (roadInFront(game, spec, i, j, rot) ? 0 : 60);
        if (score < bestScore) { bestScore = score; best = { i, j, rot }; }
      }
    }
  }
  return best;
}

// ---------- one building ----------
export class Building {
  constructor(game, d) {
    this.game = game;
    this.world = game.world;
    this.id = d.id;
    this.spec = d.spec;
    this.type = d.spec.type;
    this.def = TYPES[this.type] || TYPES.custom;
    this.variant = d.spec.variant;
    this.ownerId = d.ownerId ?? null;
    this.builtBy = d.builtBy ?? null; // who built it (shown in their belongings)
    this.residents = d.residents || [];
    this.progress = d.progress ?? 0;
    this.tile = { i: d.i, j: d.j };
    this.rot = d.rot || 0;
    this.alive = true;
    this.complete = false;
    this.fire = null;
    this.fishing = 0;
    this.pieces = []; this.blocks = []; this.wallRects = []; this.spots = {}; this.points = {};
    this.signs = []; this.lightSpots = []; this.floorGroups = []; this.roofGroups = [];
    this.seatRes = {}; this.anims = []; this.sources = [];
    this.cutState = '';

    const fp = footprint(this.spec, d.i, d.j, this.rot);
    this.tiles = fp.list;
    this.W = this.spec.tiles[0] * TILE - 1.6;
    this.D = this.spec.tiles[1] * TILE - 1.6;
    this.cx = (d.i + (fp.rw - 1) / 2) * TILE;
    this.cz = (d.j + (fp.rd - 1) / 2) * TILE;
    this.angle = this.rot * Math.PI / 2;
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
    this.center = { x: this.cx, z: this.cz };
    for (const [a, c] of this.tiles) game.tiles.claim(a, c, this.id);
    game.props.clearRect(this.cx - fp.rw * TILE / 2, this.cz - fp.rd * TILE / 2, this.cx + fp.rw * TILE / 2, this.cz + fp.rd * TILE / 2);

    this.group = new THREE.Group();
    this.group.position.set(this.cx, 0, this.cz);
    this.group.rotation.y = this.angle;
    this.model = new THREE.Group();
    this.group.add(this.model);

    if (this.def.open) OPEN[this.type](this);
    else buildShell(this, { ...this.spec, signBg: this.def.signBg }, this.W, this.D);
    if (this.crops && d.crops) d.crops.forEach((g, k) => { const c = this.crops[k]; if (c) { c.grow = g; c.g.scale.setScalar(1.7 * (.25 + .75 * g)); } });
    this.group.updateMatrixWorld(true);
    for (const p of this.pieces) { flatten(p); mergeStatic(p); }
    shadows(this.group);
    this.group.traverse(o => { if (o.isMesh && o.parent?.userData.interior) o.castShadow = false; });
    this.roofTop ??= 3;
    for (const [x, y, z] of this.lightSpots) {
      const w = this.toWorld(x, z);
      this.sources.push(game.daynight.addSource({ pos: new THREE.Vector3(w.x, y, w.z), power: 7, alive: () => this.alive && this.complete }));
    }
    game.scene.add(this.group);

    this.footRect = this.rectToWorld([-this.W / 2 - .3, -this.D / 2 - .3, this.W / 2 + .3, this.D / 2 + .3]);
    if (this.progress >= 1) this.finish(true);
    else {
      this.world.grid.mark(...this.footRect, 1);
      this.makeScaffold();
      this.reveal(true);
    }
  }

  world_tree(x, z, s, parent) {
    const g = new THREE.Group();
    cyl(.15, .2, 1.2, '#8b5a2b', 0, .6, 0, g);
    mesh(new THREE.IcosahedronGeometry(.9, 0), pick(['#4caf50', '#5cc461', '#43a047']), 0, 1.7, 0, g);
    mesh(new THREE.IcosahedronGeometry(.6, 0), pick(['#4caf50', '#66bb6a']), .3, 2.3, .1, g);
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    parent.add(g);
    return g;
  }

  // ----- helpers used by the generators -----
  toWorld(lx, lz) { return { x: this.cx + lx * this.cos + lz * this.sin, z: this.cz - lx * this.sin + lz * this.cos }; }
  toLocal(x, z) { const dx = x - this.cx, dz = z - this.cz; return { x: dx * this.cos - dz * this.sin, z: dx * this.sin + dz * this.cos }; }
  rectToWorld([x0, z0, x1, z1]) {
    const a = this.toWorld(x0, z0), b = this.toWorld(x1, z1);
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
  }
  base() { const g = new THREE.Group(); this.model.add(g); return g; }
  piece(x = 0, z = 0, y = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.userData.baseY = y;
    g.userData.revealed = false;
    g.visible = false;
    this.model.add(g);
    this.pieces.push(g);
    return g;
  }
  sign(parent, x, y, z, w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true }));
    m.position.set(x, y, z);
    m.userData.keep = true;
    m.userData.noShadow = true;
    parent.add(m);
    this.signs.push(m);
    this.drawSign(m);
    return m;
  }
  drawSign(m) {
    const old = m.material.map;
    m.material.map = signTexture(this.emoji, this.displayName(), this.def.signBg || '#2b3a55');
    m.material.needsUpdate = true;
    old?.dispose();
  }
  // what the building counts as (a custom design with role 'shop' works like a shop)
  get kind() { return this.type === 'custom' ? ({ shop: 'shop', restaurant: 'restaurant', hospital: 'hospital', school: 'school', police: 'police', home: 'house', apartment: 'apartment' }[this.spec.role] || 'custom') : this.type; }
  get emoji() { return this.type === 'shop' ? SHOP_EMOJI[this.variant] || '🏪' : (this.spec.emoji || this.def.emoji); }
  displayName() {
    if (this.spec.name) return this.spec.name;
    return this.type === 'shop' ? t('b_shop_' + this.variant) : t('b_' + this.type);
  }
  refreshText() { this.signs.forEach(m => this.drawSign(m)); this.updateSiteLabel(true); }

  // ----- spots (where characters go) -----
  spotList(kind) {
    if (this.spots[kind]?.length) return this.spots[kind];
    if (kind === 'door' || kind === 'counter' || kind === 'customer') return [[this.doorX || 0, this.D / 2 + 1.5, Math.PI, 'stand', 0, 0]];
    if (kind === 'front') return [[this.doorX || 0, this.D / 2 + 2.6, 0, 'stand', 0, 0]];
    return null;
  }
  spot(kind, idx = 0) {
    const arr = this.spotList(kind) || this.spotList('door');
    const n = arr.length, i = ((idx % n) + n) % n, s = arr[i];
    const w = this.toWorld(s[0], s[1]);
    return { x: w.x, z: w.z, face: this.angle + (s[2] ?? 0), pose: s[3] || 'stand', y: s[4] || 0, floor: s[5] || 0, idx: i };
  }
  count(kind) { return this.spots[kind]?.length || 0; }
  stairWorld() { return this.stairSpot ? this.toWorld(this.stairSpot[0], this.stairSpot[1]) : null; }
  point(name) {
    const p = this.points[name] || [0, this.roofTop, 0];
    const w = this.toWorld(p[0], p[2]);
    return { x: w.x, y: p[1], z: w.z };
  }
  buildSpot() {
    const { W, D } = this, s = Math.random();
    const l = s < .4 ? [rand(-W / 2, W / 2), D / 2 + 1.6] : s < .7 ? [-W / 2 - 1.6, rand(-D / 2, D / 2)] : [W / 2 + 1.6, rand(-D / 2, D / 2)];
    return this.toWorld(l[0], l[1]);
  }
  fireSpot() { return this.toWorld(rand(-this.W / 3, this.W / 3), this.D / 2 + 3.2); }
  reserve(kind, avoid) {
    const arr = this.spotList(kind);
    if (!arr) return null;
    const now = this.game.time, key = kind;
    this.seatRes[key] ||= {};
    const res = this.seatRes[key];
    const free = arr.map((s, i) => i).filter(i => !(res[i] > now) && !(avoid && avoid(i)));
    if (!free.length) return null;
    const i = pick(free);
    res[i] = now + 20;
    return this.spot(kind, i);
  }
  release(kind, i) { if (this.seatRes[kind]) delete this.seatRes[kind][i]; }

  // ----- farm -----
  randomCrop() { return Math.floor(Math.random() * (this.crops?.length || 1)); }
  cropSpot(k) { const c = this.crops[k], w = this.toWorld(c.lx, c.lz + .9); return { x: w.x, z: w.z, face: this.angle + Math.PI, y: 0 }; }
  tendCrop(k) {
    const c = this.crops[k];
    const sc = g => c.g.scale.setScalar(1.7 * (.25 + .75 * g));
    if (c.grow >= 1) { c.grow = .25; sc(c.grow); return pick(['🥕', '🥬', '🌽', '🎃']); }
    c.grow = Math.min(1, c.grow + .35); sc(c.grow);
    return null;
  }

  // ----- construction -----
  makeScaffold() {
    const g = this.scaffold = new THREE.Group();
    const { W, D } = this, H = Math.min(this.roofTop, 30);
    for (const x of [-W / 2 - .5, W / 2 + .5]) for (const z of [-D / 2 - .5, D / 2 + .5]) cyl(.09, .09, H, '#c89b5a', x, H / 2, z, g, 6);
    for (let y = 2; y < H; y += 3) {
      for (const z of [-D / 2 - .5, D / 2 + .5]) box(W + 1, .1, .1, '#c89b5a', 0, y, z, g);
      for (const x of [-W / 2 - .5, W / 2 + .5]) box(.1, .1, D + 1, '#c89b5a', x, y, 0, g);
    }
    for (const x of [-W / 2 + 1, W / 2 - 1]) {
      mesh(coneGeo(.3, .75, 12), '#ff7a1a', x, .38, D / 2 + 1.6, g);
      cyl(.22, .22, .1, '#ffffff', x, .42, D / 2 + 1.6, g, 12);
    }
    mergeStatic(g);
    shadows(g);
    this.group.add(g);
    const el = document.createElement('div');
    el.className = 'site';
    this.siteEl = el;
    this.siteLabel = new CSS2DObject(el);
    this.siteLabel.position.set(0, H + 2, 0);
    this.group.add(this.siteLabel);
    this.updateSiteLabel(true);
  }
  updateSiteLabel(force) {
    if (!this.siteEl) return;
    const pct = Math.floor(this.progress * 100);
    if (!force && pct === this.lastPct) return;
    this.lastPct = pct;
    this.siteEl.textContent = '';
    const s = document.createElement('span'); s.textContent = `${this.emoji} ${this.displayName()}`;
    const i = document.createElement('i'); i.style.setProperty('--p', pct + '%');
    const b = document.createElement('b'); b.textContent = pct + '%';
    this.siteEl.append(s, i, b);
  }
  get buildTime() { return (this.def.time || 12) + (this.spec.floors - 1) * 6; }
  reveal(instant) {
    const n = this.pieces.length;
    const count = Math.min(n, Math.floor(this.progress * (n + 1)));
    for (let k = 0; k < count; k++) {
      const p = this.pieces[k];
      if (p.userData.revealed) continue;
      p.userData.revealed = true;
      this.setVis(p);
      if (instant) continue;
      this.anims.push({ o: p, age: 0 });
      p.position.y = p.userData.baseY + 4;
      const w = this.toWorld(p.position.x, p.position.z);
      this.game.effects.emit('dust', { x: w.x, y: p.userData.baseY + .5, z: w.z }, 6);
    }
  }
  setVis(g) { g.visible = !!g.userData.revealed && !g.userData.cut && !g.userData.far && !this.lodOn; }

  // A closed building seen from outside is drawn as a few merged meshes (fast);
  // the detailed walls + furniture are only shown when the camera looks inside.
  buildLod() {
    this.needLod = false;
    if (this.def.open || this.lod) return;
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    const lod = new THREE.Group(), tmp = new THREE.Group(), m = new THREE.Matrix4();
    for (const p of this.pieces) {
      if (p.userData.interior) continue;
      p.traverse(o => {
        if (!o.isMesh && !o.isSprite) return;
        m.multiplyMatrices(inv, o.matrixWorld);
        const c = o.isSprite ? new THREE.Sprite(o.material) : new THREE.Mesh(o.geometry, o.material);
        m.decompose(c.position, c.quaternion, c.scale);
        if (o.isSprite || o.userData.keep) { c.userData.keep = true; lod.add(c); } else tmp.add(c);
      });
    }
    mergeStatic(tmp);
    for (const c of [...tmp.children]) lod.add(c);
    shadows(lod);
    lod.traverse(o => { if (o.userData.noShadow || o.material?.transparent) o.castShadow = false; });
    this.lod = lod;
    this.model.add(lod);
    this.lodOn = true;
    this.cutState = '';
    for (const p of this.pieces) this.setVis(p);
  }
  addProgress(dt) {
    if (this.complete) return;
    this.progress = Math.min(1, this.progress + dt / this.buildTime);
    this.reveal(false);
    this.updateSiteLabel();
    if (this.progress >= 1) this.finish(false);
  }
  finish(silent) {
    if (!silent) this.world.grid.mark(...this.footRect, -1);
    this.complete = true;
    this.progress = 1;
    for (const p of this.pieces) { p.userData.revealed = true; if (silent) p.position.y = p.userData.baseY; this.setVis(p); }
    if (this.scaffold) { this.group.remove(this.scaffold); this.scaffold = null; }
    if (this.siteLabel) { this.group.remove(this.siteLabel); this.siteLabel = null; this.siteEl = null; }
    for (const r of [...this.wallRects, ...this.blocks]) this.world.grid.mark(...this.rectToWorld(r), 1);
    if (!silent) {
      this.game.effects.emit('confetti', { x: this.cx, y: this.roofTop + 1, z: this.cz }, 80);
      this.game.onBuilt(this);
    }
    this.needLod = true;
    if (silent) this.buildLod();
  }

  // ----- cut-away: hide roof + walls between the camera and the inside -----
  applyView(cam, forced, floorMax) {
    const l = this.toLocal(cam.x, cam.z);
    const { W, D } = this;
    const close = Math.abs(l.x) < W / 2 + 3.5 && Math.abs(l.z) < D / 2 + 3.5 && cam.y < this.roofTop + 6;
    const near = this.complete && (forced || close);
    let fm = floorMax;
    if (near && fm == null && Math.abs(l.x) < W / 2 && Math.abs(l.z) < D / 2) fm = Math.floor(Math.max(0, cam.y - .5) / FH);
    const far = !near && Math.hypot(cam.x - this.cx, cam.z - this.cz) > 75;
    const wantLod = !near && !!this.lod;
    if (wantLod !== !!this.lodOn) { this.lodOn = wantLod; this.lod.visible = wantLod; this.cutState = ''; }
    const key = near ? `n${fm}|${l.x > W / 2 - .3}${l.x < -W / 2 + .3}${l.z > D / 2 - .3}${l.z < -D / 2 + .3}` : far ? 'far' : 'out';
    this.viewFloorMax = near ? fm : null;
    this.isCut = near;
    if (key === this.cutState) return;
    this.cutState = key;
    for (const g of this.roofGroups) { g.userData.cut = near; this.setVis(g); }
    this.floorGroups.forEach((fg, k) => {
      const hide = near && fm != null && k > fm;
      for (const g of fg.all) { g.userData.cut = hide; g.userData.far = g.userData.interior ? far : false; }
      if (near && !hide) {
        if (fg.walls.front) fg.walls.front.userData.cut = l.z > D / 2 - .3 || (forced && l.z > 0);
        if (fg.walls.back) fg.walls.back.userData.cut = l.z < -D / 2 + .3;
        if (fg.walls.left) fg.walls.left.userData.cut = l.x < -W / 2 + .3;
        if (fg.walls.right) fg.walls.right.userData.cut = l.x > W / 2 - .3;
      }
      for (const g of fg.all) this.setVis(g);
    });
  }

  // ----- fire -----
  startFire() {
    if (!this.complete || this.fire || this.def.canBurn === false) return false;
    this.fire = { left: 1, age: 0 };
    return true;
  }
  extinguish(dt) { if (this.fire) { this.fire.left -= dt / 6; if (this.fire.left <= 0) this.putOut(); } }
  putOut() {
    if (!this.fire) return;
    this.fire = null;
    this.game.effects.emit('steam', { x: this.cx, y: this.roofTop, z: this.cz }, 30);
    this.game.onFireOut(this);
  }

  update(dt, tm) {
    for (let k = this.anims.length - 1; k >= 0; k--) {
      const a = this.anims[k];
      a.age += dt;
      const f = Math.min(1, a.age / .5);
      a.o.position.y = a.o.userData.baseY + 4 * (1 - easeOutBack(f));
      if (f >= 1) { a.o.position.y = a.o.userData.baseY; this.anims.splice(k, 1); }
    }
    if (!this.complete) return;
    if (this.needLod && !this.anims.length) this.buildLod();
    if (this.lights) {
      const on = Math.floor(tm * 3) % 2;
      this.lights[0].material.emissiveIntensity = on ? 2.5 : .15;
      this.lights[1].material.emissiveIntensity = on ? .15 : 2.5;
    }
    if (this.crops) for (const c of this.crops) if (c.grow < 1) { c.grow = Math.min(1, c.grow + dt * .006); c.g.scale.setScalar(1.7 * (.25 + .75 * c.grow)); }
    const fx = this.game.effects;
    if (this.water) this.water.material.color.setHSL(.55, .7, .55 + Math.sin(tm * 1.5) * .03);
    if (this.bobber) { this.bobber.visible = this.fishing > 0; this.bobber.position.y = .2 + Math.sin(tm * 3) * .05; }
    if (this.pondR && Math.random() < dt * .25) {
      const a = rand(0, 6.28), r = rand(1, this.pondR - 1), p = this.toWorld(Math.cos(a) * r, this.points.pond[2] + Math.sin(a) * r);
      fx.emit('splash', { x: p.x, y: .3, z: p.z }, 8);
    }
    if (this.points.fountain && Math.random() < dt * 18) {
      const a = rand(0, 6.28);
      fx.emit('water', this.point('fountain'), 1, { dir: new THREE.Vector3(Math.cos(a) * .35, 1, Math.sin(a) * .35).normalize(), speed: 4 });
    }
    if (this.fire) {
      this.fire.age += dt;
      const h = this.roofTop;
      for (let i = 0; i < (Math.random() < dt * 50 ? 3 : 0); i++) {
        const p = this.toWorld(rand(-this.W / 2, this.W / 2), rand(-this.D / 2, this.D / 2));
        fx.emit('fire', { x: p.x, y: rand(h * .4, h + .5), z: p.z });
      }
      if (Math.random() < dt * 8) fx.emit('smoke', { x: this.cx + rand(-2, 2), y: h + 1.5, z: this.cz + rand(-2, 2) });
      if (this.fire.age > 80) this.putOut();
    }
  }

  dispose() {
    this.alive = false;
    this.game.scene.remove(this.group);
    if (this.complete) for (const r of [...this.wallRects, ...this.blocks]) this.world.grid.mark(...this.rectToWorld(r), -1);
    else this.world.grid.mark(...this.footRect, -1);
    for (const [a, c] of this.tiles) this.game.tiles.release(a, c, this.id);
    for (const s of this.sources) this.game.daynight.removeSource(s);
    this.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
  }

  toJSON() {
    return {
      id: this.id, spec: this.spec, i: this.tile.i, j: this.tile.j, rot: this.rot,
      progress: this.complete ? 1 : +this.progress.toFixed(3), ownerId: this.ownerId, builtBy: this.builtBy, residents: this.residents,
      crops: this.crops?.map(c => +c.grow.toFixed(2)),
    };
  }
}

// ---------- see-through preview used while choosing where to build ----------
export const GHOST_OK = new THREE.MeshBasicMaterial({ color: '#4cd964', transparent: true, opacity: .42, depthWrite: false });
export const GHOST_BAD = new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: .42, depthWrite: false });
export function makeGhostModel(game, spec) {
  const def = TYPES[spec.type] || TYPES.custom;
  const fake = Object.create(Building.prototype);
  Object.assign(fake, {
    game, world: game.world, spec, type: spec.type, def, variant: spec.variant, pieces: [], blocks: [], wallRects: [],
    spots: {}, points: {}, signs: [], lightSpots: [], floorGroups: [], roofGroups: [], seatRes: {}, anims: [],
    W: spec.tiles[0] * TILE - 1.6, D: spec.tiles[1] * TILE - 1.6, cos: 1, sin: 0, cx: 0, cz: 0, angle: 0,
  });
  fake.model = new THREE.Group();
  if (def.open) OPEN[spec.type](fake); else buildShell(fake, spec, fake.W, fake.D);
  fake.model.traverse(o => {
    if (o.userData?.interior) { o.visible = false; return; }
    if (o.isGroup) o.visible = true;
    if (o.isSprite) o.visible = false;
    if (o.isMesh) { o.material = GHOST_OK; o.castShadow = false; o.receiveShadow = false; }
  });
  return fake.model;
}

// ---------- all buildings ----------
export class Town {
  constructor(game) { this.game = game; this.all = []; this.nextId = 1; }
  create(spec, i, j, rot, o = {}) {
    const b = new Building(this.game, { id: o.id ?? this.nextId, spec, i, j, rot, progress: o.progress, ownerId: o.ownerId, builtBy: o.builtBy, residents: o.residents, crops: o.crops });
    this.nextId = Math.max(this.nextId, b.id + 1);
    this.all.push(b);
    return b;
  }
  remove(b) { b.dispose(); this.all.splice(this.all.indexOf(b), 1); }
  get(id) { return id == null ? null : this.all.find(b => b.id === id) || null; }
  of(type, completeOnly = true) { return this.all.filter(b => b.kind === type && (!completeOnly || b.complete)); }
  byRole(role) { return this.all.filter(b => b.complete && (b.spec.role === role)); }
  has(type) { return this.all.some(b => b.kind === type && b.complete); }
  nearest(type, pos, o = {}) {
    let best = null, bd = Infinity;
    for (const b of this.of(type)) {
      if (o.variant && b.variant !== o.variant) continue;
      const d = dist2d(b.center, pos);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best && o.variant) return this.nearest(type, pos);
    return best;
  }
  randomOf(type) { const l = this.of(type); return l.length ? pick(l) : null; }
  sites() { return this.all.filter(b => !b.complete); }
  siteFor(pos) {
    let best = null, bd = Infinity;
    for (const b of this.sites()) { const d = dist2d(b.center, pos); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  burning() { return this.all.filter(b => b.fire); }
  at(x, z) {
    for (const b of this.all) { const l = b.toLocal(x, z); if (Math.abs(l.x) < b.W / 2 && Math.abs(l.z) < b.D / 2) return b; }
    return null;
  }
  update(dt, tm) { for (const b of this.all) b.update(dt, tm); }
  clear() { for (const b of this.all) b.dispose(); this.all = []; this.nextId = 1; }
}
