// Big landmark buildings, each a hand-made model: an Ottoman-style mosque (Damascus style: striped
// "ablaq" stone, a big lead dome, pencil minarets), a university campus, an airport (its planes fly in
// airport.js) and an amusement park with rides that turn. Same helpers as the farm / dock / park models.
import * as THREE from 'three';
import { box, cyl, ball, mesh, boxGeo, coneGeo, cylGeo, torusGeo, domeGeo, prism, mergeStatic, rand, pick } from './util.js';
import { NIGHT, addGlow } from './daynight.js';

const STONE = '#efe6d2', BASALT = '#3b3836', LEAD = '#8795a3', GOLD = '#d4a017', MARBLE = '#f5f1e8', WOOD = '#6b4226';
const GLASS = '#2c4a5e';
const SEMI = new THREE.CircleGeometry(1, 14, 0, Math.PI);   // the round top of an arched window or door

// dark basalt courses around a stone block: the striped "ablaq" walls of Damascus
function ablaq(p, w, d, h, x, z, y0 = .4, step = .9) {
  for (let y = y0; y < h - .3; y += step) box(w + .06, .3, d + .06, BASALT, x, y, z, p);
}
function crescent(p, x, y, z, s = 1) {
  const c = mesh(torusGeo(.32 * s, .07 * s, 6, 16, Math.PI * 1.45), GOLD, x, y, z, p);
  c.rotation.z = Math.PI * .27;
  ball(.13 * s, GOLD, x, y - .45 * s, z, p);
}
// an arched opening drawn on a wall facing +z (rot turns it to other walls)
function archWin(p, x, y, z, w, h, rot = 0, color = GLASS, frame = null) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  p.add(g);
  if (frame) {
    box(w + .3, h + .15, .1, frame, 0, 0, .02, g);
    const f = mesh(SEMI, frame, 0, h / 2, .03, g);
    f.scale.set(w / 2 + .15, w / 2 + .15, 1);
  }
  box(w, h, .12, color, 0, 0, .06, g);
  const top = mesh(SEMI, color, 0, h / 2, .125, g);
  top.scale.set(w / 2, w / 2, 1);
  return g;
}
function lamp(b, p, x, z, h = 3.6) {
  cyl(.09, .13, h, '#2f343c', x, h / 2, z, p, 8);
  const bulb = mesh(new THREE.SphereGeometry(.28, 12, 8), NIGHT.bulb, x, h + .15, z, p);
  bulb.userData.keep = true;
  addGlow(p, x, h + .15, z, 2.2, 8);
  b.lightSpots.push([x, h, z]);
}
function tree(p, x, z, s = 1, cypress = false) {
  cyl(.14 * s, .2 * s, 1.4 * s, '#7a5230', x, .7 * s, z, p, 6);
  if (cypress) mesh(coneGeo(.75 * s, 5.2 * s, 8), '#2f6b3a', x, 3.6 * s, z, p);
  else {
    mesh(new THREE.IcosahedronGeometry(1.1 * s, 0), pick(['#4caf50', '#43a047', '#5cc461']), x, 2.1 * s, z, p);
    mesh(new THREE.IcosahedronGeometry(.7 * s, 0), '#66bb6a', x + .4 * s, 2.7 * s, z + .1, p);
  }
}
function bench(b, p, x, z, rot) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  p.add(g);
  box(2.2, .12, .7, '#a0703f', 0, .55, 0, g);
  box(2.2, .6, .1, '#a0703f', 0, .95, -.33, g);
  for (const s of [-1, 1]) box(.1, .55, .6, '#555555', s * .95, .27, 0, g);
  const sx = Math.abs(Math.sin(rot)) > .5;
  for (const k of [-.55, .55]) (b.spots.seat ||= []).push([x + (sx ? 0 : k) + Math.sin(rot) * .1, z + (sx ? k : 0) + Math.cos(rot) * .1, rot, 'sit', 0, 0]);
  b.blocks.push([x - (sx ? .45 : 1.2), z - (sx ? 1.2 : .45), x + (sx ? .45 : 1.2), z + (sx ? 1.2 : .45)]);
}
// a fountain basin with a jet (the game sprays water from points.fountain)
function fountain(b, p, x, z, r, jetY) {
  cyl(r, r + .1, .7, MARBLE, x, .35, z, p, 8);
  const w = cyl(r - .2, r - .2, .08, '#5ab8ee', x, .7, z, p, 8);
  w.userData.keep = true;
  cyl(.22, .3, jetY - .7, MARBLE, x, (jetY + .7) / 2, z, p, 10);
  cyl(.6, .25, .25, MARBLE, x, jetY, z, p, 12);
  b.points.fountain = [x, jetY + .2, z];
  b.blocks.push([x - r - .2, z - r - .2, x + r + .2, z + r + .2]);
}

// the airport's plan (the planes in airport.js use it too): runway, taxiway, where the planes park, the terminal
export function airportLayout(W, D) {
  const zr = -D / 2 + 6;          // runway centre line
  const zt = zr + 16;             // taxiway: a plane's wings (7 each side) never meet one on the runway
  const gz = zt + 16.5;           // parked planes' centre: their tails stay clear of the taxiway
  const tb = gz + 10.5;           // the terminal's back wall: the noses stop short of it
  const tw = Math.min(60, W - 40), tx = -W / 2 + 12 + tw / 2;
  return { zr, zt, gz, tb, tx, tw, gates: [tx - tw / 4, tx + tw / 4] };
}

export const LANDMARKS = {
  // ---------- the mosque (2 x 2 tiles): prayer hall + big dome, a portico, two pencil minarets, a courtyard with the ablution fountain ----------
  mosque(b) {
    const { W, D } = b, base = b.base();
    box(W, .1, D, '#e9dfcb', 0, .05, 0, base);
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 3) box(.14, .02, D - 2, '#d3c6ab', x, .11, 0, base);
    const hw = 15, hd = 10.5, hh = 7.4, hz = -D / 2 + 6;
    const front = hz + hd / 2;                 // the hall's front wall (the courtyard side)

    // prayer hall
    const hall = b.piece(0, hz);
    box(hw, hh, hd, STONE, 0, hh / 2, 0, hall);
    ablaq(hall, hw, hd, hh, 0, 0);
    box(hw + .5, .5, hd + .5, '#ddd0b6', 0, hh + .25, 0, hall);
    for (const x of [-5.6, -3, 3, 5.6]) { archWin(hall, x, 2.3, hd / 2, 1.1, 1.7, 0, GLASS, '#ddd0b6'); archWin(hall, x, 5.4, hd / 2, .8, 1.1, 0, GLASS, '#ddd0b6'); }
    for (const z of [-3, 0, 3]) for (const s of [-1, 1]) { archWin(hall, s * hw / 2, 2.3, z, 1.1, 1.7, s * Math.PI / 2, GLASS, '#ddd0b6'); archWin(hall, s * hw / 2, 5.4, z, .8, 1.1, s * Math.PI / 2, GLASS, '#ddd0b6'); }
    // the main door: a tall stone portal with a wooden door
    box(3.6, 6.2, .5, BASALT, 0, 3.1, hd / 2 + .1, hall);
    archWin(hall, 0, 2, hd / 2 + .36, 2.2, 3.4, 0, WOOD, MARBLE);
    ball(.1, GOLD, -.35, 2, hd / 2 + .5, hall); ball(.1, GOLD, .35, 2, hd / 2 + .5, hall);
    // the big dome on a drum with windows, a gold finial and crescent
    cyl(4.5, 4.7, 1.7, STONE, 0, hh + 1.35, 0, hall, 18);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; archWin(hall, Math.sin(a) * 4.55, hh + 1.2, Math.cos(a) * 4.55, .45, .7, a, GLASS); }
    mesh(domeGeo(4.5), LEAD, 0, hh + 2.2, 0, hall).scale.y = .95;
    cyl(.12, .12, 1.4, GOLD, 0, hh + 7.1, 0, hall, 6);
    ball(.28, GOLD, 0, hh + 7.1, 0, hall);
    crescent(hall, 0, hh + 8.3, 0);
    // four small domes on the corners of the roof
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (hw / 2 - 1.8), z = sz * (hd / 2 - 1.8);
      cyl(1.2, 1.3, .7, STONE, x, hh + .85, z, hall, 12);
      mesh(domeGeo(1.2), LEAD, x, hh + 1.2, z, hall);
    }
    b.blocks.push([-hw / 2, hz - hd / 2, hw / 2, front]);

    // the portico in front of the hall: columns, arches, five small domes
    const por = b.piece(0, front);
    for (let x = -6; x <= 6.01; x += 3) {
      cyl(.26, .3, 4.1, MARBLE, x, 2.05, 3, por, 10);
      box(.7, .35, .7, '#ddd0b6', x, 4.25, 3, por);
    }
    for (let x = -4.5; x <= 4.51; x += 3) {
      const a = mesh(torusGeo(1.25, .2, 6, 14, Math.PI), BASALT, x, 4.2, 3, por);
      a.scale.y = .9;
      mesh(domeGeo(1.15), LEAD, x, 5.85, 1.6, por);
      ball(.12, GOLD, x, 7.05, 1.6, por);
    }
    box(hw - 1, .55, 3.6, STONE, 0, 5.55, 1.6, por);
    box(hw - 1, .25, 3.66, BASALT, 0, 5.2, 1.6, por);

    // two pencil minarets at the front corners of the hall
    for (const s of [-1, 1]) {
      const x = s * (hw / 2 + 1.4), z = front - 1.2, m = b.piece(x, z);
      box(2.4, 4, 2.4, STONE, 0, 2, 0, m);
      ablaq(m, 2.4, 2.4, 4, 0, 0, .5, .9);
      cyl(.78, .86, 13, STONE, 0, 10.5, 0, m, 12);
      for (const y of [6, 9, 12, 15]) cyl(.82, .82, .3, BASALT, 0, y, 0, m, 12);
      cyl(1.3, .85, .6, '#ddd0b6', 0, 17.2, 0, m, 12);          // the balcony (sherefe)
      mesh(torusGeo(1.25, .06, 6, 24), '#ddd0b6', 0, 18.3, 0, m).rotation.x = Math.PI / 2;
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; cyl(.04, .04, .8, '#ddd0b6', Math.sin(a) * 1.25, 17.9, Math.cos(a) * 1.25, m, 4); }
      const lights = mesh(torusGeo(1.32, .07, 6, 24), NIGHT.bulb, 0, 17.55, 0, m);   // lit at night
      lights.rotation.x = Math.PI / 2;
      lights.userData.keep = true;
      cyl(.62, .7, 4.6, STONE, 0, 19.8, 0, m, 12);
      mesh(coneGeo(.78, 5.6, 12), LEAD, 0, 24.9, 0, m);            // the pointed lead cap
      cyl(.05, .05, 1.2, GOLD, 0, 28.1, 0, m, 5);
      ball(.18, GOLD, 0, 28, 0, m);
      crescent(m, 0, 29.1, 0, .9);
      b.blocks.push([x - 1.3, z - 1.3, x + 1.3, z + 1.3]);
    }

    // the courtyard: striped walls, a gate with the name, the ablution fountain under a little dome, cypress trees
    const cz0 = front + 3.6, cz1 = D / 2 - .3;
    const yard = b.piece(0, 0);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - .3);
      box(.6, 3, cz1 - cz0, STONE, x, 1.5, (cz0 + cz1) / 2, yard);
      for (const y of [.6, 1.5, 2.4]) box(.66, .26, cz1 - cz0, BASALT, x, y, (cz0 + cz1) / 2, yard);
      b.blocks.push([x - .4, cz0, x + .4, cz1]);
    }
    for (const s of [-1, 1]) {
      const x0 = s * 2.4, x1 = s * (W / 2);
      box(Math.abs(x1 - x0), 3, .6, STONE, (x0 + x1) / 2, 1.5, cz1, yard);
      for (const y of [.6, 1.5, 2.4]) box(Math.abs(x1 - x0), .26, .66, BASALT, (x0 + x1) / 2, y, cz1, yard);
      b.blocks.push([Math.min(x0, x1), cz1 - .4, Math.max(x0, x1), cz1 + .4]);
      box(1.1, 5.4, 1.1, STONE, s * 2.6, 2.7, cz1, yard);
      ablaq(yard, 1.1, 1.1, 5.4, s * 2.6, cz1, .5, .9);
      mesh(domeGeo(.5), LEAD, s * 2.6, 5.4, cz1, yard);
    }
    box(6.3, 1.1, 1.1, STONE, 0, 4.9, cz1, yard);
    box(6.36, .3, 1.16, BASALT, 0, 4.6, cz1, yard);
    const gm = mesh(torusGeo(2, .22, 6, 14, Math.PI), BASALT, 0, 3.6, cz1 + .1, yard);
    gm.scale.y = .55;
    box(4.6, .9, .12, '#ffffff', 0, 4.95, cz1 + .6, yard);
    b.sign(yard, 0, 4.95, cz1 + .68, 4.3, .75);
    for (const s of [-1, 1]) lamp(b, yard, s * 4, cz1 - 1.2, 3.2);
    // the ablution fountain (shadirvan)
    const fz = (cz0 + cz1) / 2 + .6, fo = b.piece(0, fz);
    fountain(b, fo, 0, 0, 1.9, 1.7);
    b.blocks[b.blocks.length - 1] = [-2.1, fz - 2.1, 2.1, fz + 2.1];
    b.points.fountain = [0, 1.9, fz];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; cyl(.07, .07, 3, MARBLE, Math.sin(a) * 2.25, 1.5, Math.cos(a) * 2.25, fo, 6); }
    mesh(coneGeo(2.8, 1.5, 8), LEAD, 0, 3.75, 0, fo).rotation.y = Math.PI / 8;
    crescent(fo, 0, 5, 0, .6);
    const tr = b.piece(0, 0);
    for (const s of [-1, 1]) { tree(tr, s * (W / 2 - 2), cz1 - 2, 1, true); tree(tr, s * (W / 2 - 2), cz0 + 1.6, .8, true); b.blocks.push([s * (W / 2 - 2) - .6, cz1 - 2.6, s * (W / 2 - 2) + .6, cz1 - 1.4]); }

    // prayer rows in the portico and the courtyard, all facing the qibla wall; the imam stands in front
    for (const z of [front + 1.4, front + 2.6, front + 3.8]) for (let x = -6; x <= 6.01; x += 1.2) (b.spots.pray ||= []).push([x, z, Math.PI, 'pray', 0, 0]);
    b.spots.work = [[0, front + .55, Math.PI, 'pray', 0, 0]];
    b.spots.door = [[0, D / 2 + 1.4, Math.PI, 'stand', 0, 0]];
    b.points.minaret = [hw / 2 + 1.4, 18.6, front - 1.2];
  },

  // ---------- the university (3 x 2 tiles): a columned main hall with a green dome, two wings, a lawn with a fountain ----------
  university(b) {
    const { W, D } = b, base = b.base();
    box(W, .08, D, '#7cc06a', 0, .04, 0, base);
    const CREAM = '#efe3c8', TRIM = '#ffffff', COPPER = '#5f9e8f';
    const mz = -D / 2 + 4.8, mw = W - 4, mh = 11, md = 8, mfront = mz + md / 2;
    box(2.6, .1, D / 2 - mfront + D / 2, '#d9cfb9', 0, .09, (mfront + D / 2) / 2, base);
    box(W - 16, .1, 2.2, '#d9cfb9', 0, .09, 5, base);

    const main = b.piece(0, mz);
    box(mw, mh, md, CREAM, 0, mh / 2, 0, main);
    box(mw + .5, .6, md + .5, TRIM, 0, mh + .3, 0, main);
    for (const y of [3.9, 7.6]) box(mw + .1, .25, md + .1, TRIM, 0, y, 0, main);
    for (let k = 0; k < 3; k++) for (let x = -mw / 2 + 1.6; x < mw / 2 - 1; x += 2.6) {
      if (Math.abs(x) < 6.6) continue;
      const m = [NIGHT.winLit, NIGHT.winLit2, NIGHT.winDark][(k * 7 + Math.round(x)) % 3 < 0 ? 0 : (k * 7 + Math.round(x)) % 3];
      mesh(boxGeo(1.2, 2.1, .15), m, x, 1.9 + k * 3.7, md / 2 + .02, main);
      box(1.4, .15, .3, TRIM, x, .8 + k * 3.7, md / 2 + .1, main);
    }
    // the portico: steps, six columns, a pediment
    for (let s = 0; s < 3; s++) box(13 - s * .6, .3, 3.6 - s * .5, '#e3dccd', 0, .15 + s * .3, md / 2 + 1.8 - s * .25, main);
    for (let x = -5; x <= 5.01; x += 2) { cyl(.42, .48, 7.6, TRIM, x, 4.7, md / 2 + 2.3, main, 14); box(1.1, .35, 1.1, TRIM, x, 8.6, md / 2 + 2.3, main); }
    box(12.4, 1, 3.2, TRIM, 0, 9.2, md / 2 + 1.6, main);
    mesh(prism(12.6, 2.4, 3.3), TRIM, 0, 9.7, md / 2 + 1.6, main);
    box(2.6, 3.8, .2, WOOD, 0, 2.8, md / 2 + .05, main);
    // the dome with a clock
    cyl(3.2, 3.4, 2, CREAM, 0, mh + 1.5, 0, main, 18);
    mesh(domeGeo(3.2), COPPER, 0, mh + 2.5, 0, main);
    cyl(.5, .6, 1.2, TRIM, 0, mh + 6, 0, main, 10);
    mesh(coneGeo(.6, .9, 10), COPPER, 0, mh + 7, 0, main);
    cyl(1, 1, .12, '#ffffff', 0, mh + 1.6, 3.3, main, 24).rotation.x = Math.PI / 2;
    box(.08, .7, .05, '#222222', 0, mh + 1.85, 3.38, main);
    box(.5, .08, .05, '#222222', .2, mh + 1.6, 3.38, main);
    b.blocks.push([-mw / 2, mz - md / 2, mw / 2, mfront + .2], [-6.6, mfront, 6.6, mfront + 3.2]);

    // two wings
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 4), z0 = mfront, z1 = mfront + 9.5, w = b.piece(x, (z0 + z1) / 2);
      box(7, 8, z1 - z0, CREAM, 0, 4, 0, w);
      box(7.4, .5, z1 - z0 + .4, TRIM, 0, 8.2, 0, w);
      box(7.1, .25, z1 - z0 + .1, TRIM, 0, 3.9, 0, w);
      for (let k = 0; k < 2; k++) for (let z = -(z1 - z0) / 2 + 1.6; z < (z1 - z0) / 2 - 1; z += 2.6) mesh(boxGeo(.15, 2, 1.2), NIGHT.winLit2, -s * 3.52, 2 + k * 3.8, z, w);
      for (let k = 0; k < 2; k++) for (const xx of [-1.6, 1.6]) mesh(boxGeo(1.2, 2, .15), NIGHT.winLit, xx, 2 + k * 3.8, (z1 - z0) / 2 + .02, w);
      b.blocks.push([x - 3.6, z0, x + 3.6, z1]);
    }

    // the quad: fountain, trees, benches, a flag
    const q = b.piece(0, 0);
    fountain(b, q, 0, 5, 1.8, 1.6);
    for (const [x, z, r] of [[-4.6, 5, Math.PI / 2], [4.6, 5, -Math.PI / 2]]) bench(b, q, x, z, r);
    for (const [x, z] of [[-9, 8.5], [9, 8.5], [-5.5, 9.4], [5.5, 9.4]]) { tree(q, x, z, 1.2); b.blocks.push([x - .5, z - .5, x + .5, z + .5]); }
    cyl(.07, .07, 9, '#c0c6cf', -W / 2 + 9, 4.5, D / 2 - 2, q, 6);
    box(2, 1.2, .05, '#2e7d32', -W / 2 + 10, 8.2, D / 2 - 2, q);
    // the gate with the name
    const gate = b.piece(0, D / 2 - .4);
    for (const s of [-1, 1]) { box(1, 4.6, 1, CREAM, s * 3.2, 2.3, 0, gate); box(1.3, .3, 1.3, TRIM, s * 3.2, 4.7, 0, gate); b.blocks.push([s * 3.2 - .6, D / 2 - 1, s * 3.2 + .6, D / 2]); }
    box(7.6, 1.1, .6, CREAM, 0, 4.4, 0, gate);
    box(6, .9, .12, '#ffffff', 0, 4.4, .35, gate);
    b.sign(gate, 0, 4.4, .42, 5.7, .75);
    for (const s of [-1, 1]) for (let x = 4; x < W / 2 - .5; x += 1.4) cyl(.05, .05, 1, '#3a3f48', s * x, .5, 0, gate, 4);
    for (const s of [-1, 1]) box(W / 2 - 3.8, .08, .08, '#3a3f48', s * (W / 4 + 1.9), .95, 0, gate);
    for (const s of [-1, 1]) lamp(b, q, s * 2.2, D / 2 - 2.2, 3.2);

    // a lecture on the lawn: the professor at a lectern, students sitting on the grass
    b.spots.work = [[0, mfront + 4.3, 0, 'stand', 0, 0], [-8.5, mfront + 4.3, 0, 'stand', 0, 0], [8.5, mfront + 4.3, 0, 'stand', 0, 0]];
    box(.9, 1.2, .6, WOOD, 0, .6, mfront + 5.2, q);
    for (const cx of [0, -8.5, 8.5]) for (const dx of [-1.6, 0, 1.6]) for (const dz of [8, 9.6]) (b.spots.study ||= []).push([cx + dx, mfront + dz - (cx ? 0 : 0), Math.PI, 'sitGround', 0, 0]);
    b.spots.study = b.spots.study.filter(s => Math.hypot(s[0], s[1] - 5) > 2.6);
    b.spots.door = [[0, D / 2 + 1.4, Math.PI, 'stand', 0, 0]];
  },

  // ---------- the airport (10 x 5 tiles): runway, taxiway, apron with two gates, terminal, control tower ----------
  // Distances are kept wide (planes are 16 long, 14 across): a plane on the taxiway never touches one on the
  // runway or at a gate, and parked planes stay clear of the terminal and of each other. Planes: airport.js
  airport(b) {
    const { W, D } = b, base = b.base();
    const A = airportLayout(W, D), { zr, zt, gz, tb, tx, tw, gates } = A;
    box(W, .06, D, '#8fbf6a', 0, .03, 0, base);
    // runway with markings, and the two links to the taxiway at its ends
    box(W - 2, .1, 8.4, '#3d4148', 0, .08, zr, base);
    for (let x = -W / 2 + 14; x < W / 2 - 14; x += 6) box(3, .02, .25, '#ffffff', x, .14, zr, base);
    for (const s of [-1, 1]) {
      for (let k = -3; k <= 3; k++) if (k) box(3.6, .02, .5, '#ffffff', s * (W / 2 - 4), .14, zr + k * .95, base);
      box(.25, .02, 8, '#ffffff', s * (W / 2 - 8), .14, zr, base);
      box(4.4, .1, zt - zr, '#4a4f57', s * (W / 2 - 6), .07, (zr + zt) / 2, base);
      box(.16, .02, zt - zr, '#f2c230', s * (W / 2 - 6), .13, (zr + zt) / 2, base);
    }
    box(W - 2, .02, .2, '#ffffff', 0, .14, zr - 3.9, base);
    box(W - 2, .02, .2, '#ffffff', 0, .14, zr + 3.9, base);
    // taxiway, apron and the gate lines
    box(W - 8, .1, 4.4, '#4a4f57', 0, .08, zt, base);
    box(W - 8, .02, .16, '#f2c230', 0, .14, zt, base);
    box(tw + 4, .1, tb - zt - 2, '#b9b4aa', tx, .07, (zt + 2 + tb) / 2, base);
    for (const gx of gates) {
      box(.16, .02, tb - zt - 2.5, '#f2c230', gx, .13, (zt + 2 + tb) / 2, base);
      box(3, .02, .16, "#f2c230", gx, .13, gz + 4.6, base);   // the stop line for the nose wheel
    }
    // runway edge lights
    const el = b.piece(0, 0);
    for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 5) for (const z of [zr - 4.3, zr + 4.3]) { const m = mesh(new THREE.SphereGeometry(.16, 6, 4), NIGHT.bulb, x, .2, z, el); m.userData.keep = true; }

    // the terminal: a long glass hall with a wavy roof; a covered bridge reaches each parked plane's door
    const tz = tb + 3.5, ter = b.piece(tx, tz);
    box(tw, 6, 7, '#e8edf2', 0, 3, 0, ter);
    for (let x = -tw / 2 + 1.5; x < tw / 2 - 1; x += 2.5) {
      mesh(boxGeo(2.2, 4.2, .12), NIGHT.winLit2, x, 2.6, 3.52, ter);
      mesh(boxGeo(2.2, 4.2, .12), NIGHT.winLit, x, 2.6, -3.52, ter);
    }
    for (let k = 0; k < 12; k++) { const r = box(tw / 12 + .1, .4, 8.8, '#f4f6f8', -tw / 2 + tw / 24 + k * tw / 12, 6.4 + Math.sin(k * .7) * .35, 0, ter); r.rotation.z = Math.cos(k * .7) * .06; }
    box(5, 3.6, .2, '#2c4a5e', 0, 1.8, 3.6, ter);
    box(9, 1.1, .2, '#ffffff', 0, 5.2, 3.65, ter);
    b.sign(ter, 0, 5.2, 3.76, 8.6, .95);
    for (const gx of gates) {
      // from the terminal wall to the door near the nose, high above the wing
      const jb = b.piece(gx + 2.1, (tb + gz + 4.5) / 2), len = tb - (gz + 4.5);
      box(2.2, 2.6, len, '#d0d5db', 0, 4.4, 0, jb);
      for (let k = 0; k < 3; k++) box(2.3, .1, .1, '#9aa0a8', 0, 5.75, -len / 2 + (k + .5) * len / 3, jb);
      cyl(.25, .3, 3.1, '#7a8088', 0, 1.55, len / 2 - 1, jb, 8);
    }
    b.blocks.push([tx - tw / 2, tb, tx + tw / 2, tb + 7]);
    // service trucks between the gates (well outside the wings)
    const ex = b.piece(0, 0);
    for (const [x, c] of [[(gates[0] + gates[1]) / 2, '#f2c230'], [gates[1] + 13, '#e8edf2']]) {
      box(1.6, 1.6, 3, c, x, 1.1, gz + 3, ex); box(1.6, 1.4, 1.2, '#2c4a5e', x, 1, gz + 5, ex);
      for (const s of [-1, 1]) for (const dz of [2, 4.4]) cyl(.35, .35, .3, '#222222', x + s * .8, .35, gz + dz, ex, 10).rotation.z = Math.PI / 2;
    }

    // the control tower (front right, far from the planes) with a turning radar
    const twx = W / 2 - 10, twz = tb + 3.5, tow = b.piece(twx, twz);
    box(4.4, 4, 4.4, '#e8edf2', 0, 2, 0, tow);
    cyl(1.3, 1.6, 16, '#e8edf2', 0, 12, 0, tow, 12);
    cyl(2.9, 2.2, 1, '#e8edf2', 0, 20.3, 0, tow, 8);
    mesh(cylGeo(2.9, 2.9, 2.6, 8), NIGHT.winLit2, 0, 22.1, 0, tow);
    cyl(3.2, 3, .5, '#3a3f48', 0, 23.6, 0, tow, 8);
    cyl(.08, .08, 3, '#aab0b8', 1, 25.3, 0, tow, 5);
    const beacon = mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1 }), 1, 26.9, 0, tow);
    beacon.userData.keep = true;
    const radar = new THREE.Group();
    radar.position.set(-1, 24.1, 0);
    radar.userData.keep = true;
    box(.2, 1, .2, '#aab0b8', 0, .5, 0, radar);
    box(2.4, .7, .15, '#f4f6f8', 0, 1.2, 0, radar);
    mergeStatic(radar);
    tow.add(radar);
    b.tickers.push((dt, tm) => { radar.rotation.y += dt * 1.6; beacon.visible = tm % 1.4 < .7; });
    b.blocks.push([twx - 2.5, twz - 2.5, twx + 2.5, twz + 2.5]);

    // a windsock and a fence between the airside and the street side
    const wx = W / 2 - 4, wz = D / 2 - 2;
    cyl(.07, .07, 4, '#c0c6cf', wx, 2, wz, ex, 6);
    const sock = mesh(coneGeo(.45, 2.2, 10), '#ff7a1a', wx - 1.1, 3.8, wz, ex);
    sock.rotation.z = -Math.PI / 2;
    for (const [a, z] of [[-W / 2 + 1, tx - tw / 2], [tx + tw / 2, twx - 3]]) {
      for (let x = a; x < z; x += 2) cyl(.04, .04, 1.4, '#9aa0a8', x, .7, tb, ex, 4);
      box(z - a, .06, .06, '#9aa0a8', (a + z) / 2, 1.35, tb, ex);
    }
    // the airside is closed to people walking (planes move there)
    b.blocks.push([-W / 2, -D / 2, W / 2, tb]);
    for (const x of [tx - 22, tx - 8, tx + 8, tx + 22]) lamp(b, ex, x, D / 2 - .8, 3.6);

    b.spots.door = [[tx, D / 2 + 1.2, Math.PI, 'stand', 0, 0]];
    b.spots.work = [[tx - 4, D / 2 + .9, 0, 'stand', 0, 0], [tx + 4, D / 2 + .9, 0, 'stand', 0, 0], [tx + 8, D / 2 + .9, 0, 'stand', 0, 0]];
    b.points.inside = [tx, 0, tz];
  },

  // ---------- the amusement park (2 x 2 tiles): Ferris wheel, carousel, swing ride, stands ----------
  amusement(b) {
    const { W, D } = b, base = b.base();
    box(W, .08, D, '#f2d7a6', 0, .04, 0, base);
    for (const [x, z, w, d] of [[-W / 4, D / 4, W / 2 - 2, D / 2 - 3], [W / 4, -D / 4, W / 2 - 2, D / 2 - 3]]) box(w, .1, d, '#8bd17c', x, .06, z, base);
    const COLS = ['#ff5d8f', '#ffd23f', '#4fc3f7', '#7c4dff', '#66bb6a', '#ff7043'];

    // the Ferris wheel (back left): turns slowly, the cabins stay upright
    const fw = b.piece(-5.2, -5.2);
    const R = 6.2, hub = 8.4;
    for (const s of [-1, 1]) for (const lean of [-1, 1]) { const leg = box(.35, hub + .4, .35, '#e8edf2', lean * 1.9, hub / 2, s * 1.2, fw); leg.rotation.z = -lean * .27; }
    cyl(.4, .4, 2.8, '#c0c6cf', 0, hub, 0, fw, 10).rotation.x = Math.PI / 2;
    const wheel = new THREE.Group();
    wheel.position.set(0, hub, 0);
    wheel.userData.keep = true;
    fw.add(wheel);
    const rim = new THREE.Group();
    for (const z of [-.9, .9]) mesh(torusGeo(R, .12, 6, 48), '#e8edf2', 0, 0, z, rim);
    for (let k = 0; k < 12; k++) { const sp = box(.1, R, .1, '#e8edf2', Math.sin(k / 12 * Math.PI * 2) * R / 2, Math.cos(k / 12 * Math.PI * 2) * R / 2, 0, rim); sp.rotation.z = -k / 12 * Math.PI * 2; }
    mergeStatic(rim);
    wheel.add(rim);
    const bulbs = new THREE.Group();
    for (let k = 0; k < 24; k++) mesh(new THREE.SphereGeometry(.13, 6, 4), NIGHT.bulb, Math.sin(k / 24 * Math.PI * 2) * R, Math.cos(k / 24 * Math.PI * 2) * R, 1, bulbs);
    mergeStatic(bulbs);
    wheel.add(bulbs);
    const cabins = [];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, c = new THREE.Group();
      c.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
      box(.06, .8, .06, '#c0c6cf', 0, -.4, 0, c);
      box(1.2, 1, 1.3, COLS[k % COLS.length], 0, -1.25, 0, c);
      box(1.3, .12, 1.4, '#ffffff', 0, -.68, 0, c);
      mergeStatic(c);
      wheel.add(c);
      cabins.push(c);
    }
    b.tickers.push(dt => { wheel.rotation.z += dt * .12; for (const c of cabins) c.rotation.z = -wheel.rotation.z; });
    b.blocks.push([-8.6, -7.2, -1.8, -3.2]);

    // the carousel (front right): the platform turns, the horses go up and down
    const ca = b.piece(4.6, 3.6);
    cyl(3.6, 3.7, .45, '#d4a017', 0, .22, 0, ca, 24);
    cyl(.35, .35, 4.6, '#d4a017', 0, 2.5, 0, ca, 10);
    const top = new THREE.Group();
    top.position.y = 4.6;
    top.userData.keep = true;
    ca.add(top);
    mesh(coneGeo(4, 1.8, 24), '#e53935', 0, .9, 0, top);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ball(.35, k % 2 ? '#ffd23f' : '#ffffff', Math.sin(a) * 3.9, 0, Math.cos(a) * 3.9, top); }
    mesh(new THREE.SphereGeometry(.4, 10, 8), GOLD, 0, 2, 0, top);
    mergeStatic(top);
    const plat = new THREE.Group();
    plat.position.y = .45;
    plat.userData.keep = true;
    ca.add(plat);
    const horses = [];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, h = new THREE.Group();
      h.position.set(Math.sin(a) * 2.6, 1.2, Math.cos(a) * 2.6);
      h.rotation.y = a + Math.PI / 2;
      cyl(.04, .04, 3.6, GOLD, 0, .5, 0, h, 5);
      box(.35, .5, 1.2, ['#ffffff', '#8d6e63', '#212121', '#ffcc80'][k % 4], 0, 0, 0, h);
      box(.3, .55, .3, ['#ffffff', '#8d6e63', '#212121', '#ffcc80'][k % 4], 0, .35, .55, h).rotation.x = -.4;
      for (const dz of [-.4, .4]) box(.1, .55, .1, '#5d4037', 0, -.45, dz, h);
      box(.38, .1, .4, COLS[k % COLS.length], 0, .28, 0, h);
      mergeStatic(h);
      plat.add(h);
      horses.push(h);
    }
    b.tickers.push((dt, tm) => { plat.rotation.y += dt * .7; horses.forEach((h, k) => { h.position.y = 1.2 + Math.sin(tm * 2.2 + k * 1.3) * .3; }); });
    b.blocks.push([4.6 - 3.9, 3.6 - 3.9, 4.6 + 3.9, 3.6 + 3.9]);

    // the swing ride (back right): the top turns and the chairs swing out
    const sw = b.piece(6.2, -5.6);
    cyl(.4, .6, 7.5, '#7c4dff', 0, 3.75, 0, sw, 10);
    cyl(1.4, 1.4, .5, '#ffd23f', 0, .25, 0, sw, 16);
    const head = new THREE.Group();
    head.position.y = 7.4;
    head.userData.keep = true;
    sw.add(head);
    mesh(coneGeo(3.2, 1.2, 16), '#7c4dff', 0, .9, 0, head);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ball(.18, k % 2 ? '#ffd23f' : '#ffffff', Math.sin(a) * 3.1, .3, Math.cos(a) * 3.1, head); }
    const chairs = [];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, arm = new THREE.Group();
      arm.rotation.y = a;
      head.add(arm);
      const ch = new THREE.Group();
      ch.position.set(0, .2, 2.5);
      arm.add(ch);
      box(.04, 3, .04, '#c0c6cf', 0, -1.5, 0, ch);
      box(.6, .12, .55, COLS[k % COLS.length], 0, -3.05, 0, ch);
      box(.6, .5, .08, COLS[k % COLS.length], 0, -2.8, -.25, ch);
      chairs.push(ch);
    }
    mergeStatic(head);
    b.tickers.push((dt, tm) => {
      const sp = .9 + Math.sin(tm * .25) * .5;          // speeds up and slows down
      head.rotation.y += dt * sp * 1.4;
      for (const c of chairs) c.rotation.x = -sp * .55;   // swing outwards
    });
    b.blocks.push([6.2 - 1.6, -5.6 - 1.6, 6.2 + 1.6, -5.6 + 1.6]);

    // stands, the entrance arch, balloons, light strings
    const st = b.piece(0, 0);
    for (const [x, z, c] of [[-8.5, 3, '#ff5d8f'], [-8.5, 7.4, '#4fc3f7']]) {
      box(2.6, 2.2, 2, '#ffffff', x, 1.1, z, st);
      for (let k = 0; k < 6; k++) box(.48, .08, 2.6, k % 2 ? '#ffffff' : c, x - 1.2 + k * .48, 2.5, z + .2, st).rotation.x = .25;
      ball(.35, c, x, 2.9, z, st);
      b.blocks.push([x - 1.4, z - 1.1, x + 1.4, z + 1.1]);
    }
    for (let k = 0; k < 7; k++) { const x = -2 + k * .55, y = 3.4 + (k % 3) * .4; cyl(.01, .01, y - .3, '#dddddd', x, y / 2, 9.6, st, 3); ball(.32, COLS[k % COLS.length], x, y, 9.6, st).scale.y = 1.2; }
    const gate = b.piece(0, D / 2 - .5);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) cyl(.45, .45, .8, k % 2 ? '#ffffff' : COLS[(k + (s > 0 ? 2 : 0)) % COLS.length], s * 3.4, .4 + k * .8, 0, gate, 12);
      ball(.6, '#ffd23f', s * 3.4, 5.1, 0, gate);
      b.blocks.push([s * 3.4 - .5, D / 2 - 1, s * 3.4 + .5, D / 2]);
    }
    box(7.4, 1.2, .5, '#e53935', 0, 4.6, 0, gate);
    box(6.6, 1, .12, '#ffffff', 0, 4.6, .3, gate);
    b.sign(gate, 0, 4.6, .37, 6.3, .85);
    const lights = new THREE.Group();
    for (let k = 0; k <= 16; k++) { const u = k / 16; mesh(new THREE.SphereGeometry(.12, 6, 4), NIGHT.bulb, -10 + u * 20, 5.5 - Math.sin(u * Math.PI) * 1.2, -.2, lights); }
    mergeStatic(lights);
    lights.position.set(0, 0, 1.2);
    st.add(lights);
    for (const s of [-1, 1]) { cyl(.07, .07, 5.6, '#3a3f48', s * 10, 2.8, 1, st, 6); }
    for (const s of [-1, 1]) lamp(b, st, s * 6.5, D / 2 - 2, 3.4);

    // visitors watch and cheer around the rides; one operator per ride
    b.spots.fun = [
      [-4.8, -1.4, Math.PI, 'cheer', 0, 0], [-6.4, -1.6, Math.PI, 'idle', 0, 0], [-3.2, -1.6, Math.PI, 'cheer', 0, 0],
      [0, 3.6, -Math.PI / 2, 'cheer', 0, 0], [0, 5.2, -Math.PI / 2, 'idle', 0, 0], [0, 2, -Math.PI / 2, 'jump', 0, 0],
      [6.2, -.4, Math.PI, 'cheer', 0, 0], [4.6, -.6, Math.PI, 'idle', 0, 0], [7.8, -.6, Math.PI, 'jump', 0, 0],
      [-6, 3, -Math.PI / 2, 'eatStand', 0, 0], [-6, 7.4, -Math.PI / 2, 'eatStand', 0, 0],
    ];
    b.spots.work = [[-1.3, -4, -Math.PI / 2, 'stand', 0, 0], [4.6, 8, Math.PI, 'stand', 0, 0], [9.6, -2.2, -Math.PI * .75, 'stand', 0, 0]];
    b.spots.door = [[0, D / 2 + 1.4, Math.PI, 'stand', 0, 0]];
  },
};

// what the far simple block of each landmark looks like (lod.js)
export const LANDMARK_PROXY = {
  mosque: { k: .7, h: 7.5, wall: STONE, roof: LEAD, shape: 'pyr' },
  university: { k: .9, h: 11, wall: '#efe3c8', roof: '#5f9e8f', shape: 'flat' },
  airport: { k: 1, h: .3, wall: '#8a9099', shape: 'none' },
  amusement: { k: .8, h: 1, wall: '#ff5d8f', shape: 'none' },
};
