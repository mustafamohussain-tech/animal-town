// Accessories: little things a resident wears on top of their clothes — on the head (a bow, a hat...),
// round the neck (a tie, a bow tie, a scarf) and on the face (a mask, sunglasses, a moustache), each in
// its own colour. A new resident picks some at random; the town's owner can change them on the profile.
import * as THREE from 'three';
import { mesh, sphere, domeGeo, boxGeo, cylGeo, coneGeo, torusGeo, pick } from './util.js';
import { torsoRadius } from './clothes.js';

export const ACC_COLORS = ['#e91e63', '#ff80ab', '#f44336', '#ff9800', '#ffd23f', '#8bc34a', '#4caf50',
  '#00bcd4', '#2196f3', '#3f51b5', '#9c27b0', '#ffffff', '#222222'];

// a slightly darker / lighter shade of a colour (bands, knots, pompoms)
const shade = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();

// a bow: two puffy loops pointing at a round knot (lying in the x-y plane, facing +z)
function bowShape(parent, col, s = 1) {
  for (const k of [-1, 1]) {
    const loop = mesh(coneGeo(.11 * s, .2 * s, 14), col, k * .1 * s, 0, 0, parent);
    loop.rotation.z = k * Math.PI / 2;
    loop.scale.set(1, 1, .55);
  }
  mesh(sphere(.055 * s), shade(col, .8), 0, 0, .01, parent);
}

// H = head gear group (origin = head centre), B = body gear group (inside the torso), d = animal,
// hy = top of the skull, e = eye position, col = the chosen colour
const ACC = {
  head: {
    bow(H, B, d, hy, e, col) {
      const g = new THREE.Group();
      g.position.set(.17, hy - .04, .2);
      g.rotation.set(-.35, .25, -.35);
      H.add(g);
      bowShape(g, col, 1.15);
    },
    tophat(H, B, d, hy, e, col) {
      mesh(cylGeo(.38, .38, .03, 28), col, 0, hy - .07, 0, H);
      mesh(cylGeo(.23, .25, .38, 24), col, 0, hy + .12, 0, H);
      mesh(cylGeo(.255, .255, .07, 24), shade(col, .55), 0, hy - .02, 0, H);
    },
    party(H, B, d, hy, e, col) {
      const g = new THREE.Group();
      g.position.set(.06, hy + .1, 0);
      g.rotation.z = -.2;
      H.add(g);
      mesh(coneGeo(.19, .44, 18), col, 0, .1, 0, g);
      for (const y of [-.03, .11]) mesh(torusGeo(.17 - y * .45, .018, 6, 20), '#ffffff', 0, y, 0, g).rotation.x = Math.PI / 2;
      mesh(sphere(.065), '#ffd23f', 0, .34, 0, g);
    },
    beanie(H, B, d, hy, e, col) {
      mesh(domeGeo(.4), col, 0, hy - .2, 0, H).scale.set(1.04, .85, 1.04);
      mesh(torusGeo(.39, .06, 8, 26), shade(col, .8), 0, hy - .18, 0, H).rotation.x = Math.PI / 2;
      mesh(sphere(.1), '#ffffff', 0, hy + .15, 0, H);
    },
    cap(H, B, d, hy, e, col) {
      mesh(domeGeo(.38), col, 0, hy - .15, 0, H).scale.set(1, .72, 1);
      mesh(boxGeo(.4, .035, .3), shade(col, .75), 0, hy - .13, .36, H);
      mesh(sphere(.035), '#ffffff', 0, hy + .13, 0, H);
    },
    flower(H, B, d, hy, e, col) {
      const g = new THREE.Group();
      g.position.set(.2, hy - .02, .14);
      g.rotation.set(-.5, .3, -.4);
      H.add(g);
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        mesh(sphere(.06), col, Math.cos(a) * .075, Math.sin(a) * .075, 0, g).scale.set(1, 1, .45);
      }
      mesh(sphere(.05), '#ffd23f', 0, 0, .02, g);
    },
    crownflowers(H, B, d, hy, e, col) {   // a ring of little flowers round the head
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2;
        mesh(sphere(.06), k % 2 ? col : '#ffffff', Math.sin(a) * .33, hy - .1, Math.cos(a) * .33, H);
      }
      mesh(torusGeo(.33, .02, 6, 30), '#4caf50', 0, hy - .1, 0, H).rotation.x = Math.PI / 2;
    },
  },
  neck: {
    tie(H, B, d, hy, e, col) {
      const z = y => torsoRadius(y) + .025;
      mesh(boxGeo(.1, .08, .035), shade(col, .8), 0, 1.66, z(1.66), B);
      mesh(boxGeo(.1, .3, .02), col, 0, 1.47, z(1.47), B);
      mesh(boxGeo(.072, .072, .02), col, 0, 1.31, z(1.31), B).rotation.z = Math.PI / 4;
      mesh(boxGeo(.035, .3, .015), shade(col, 1.25), 0, 1.47, z(1.47) + .012, B);   // a stripe
    },
    bowtie(H, B, d, hy, e, col) {
      const g = new THREE.Group();
      g.position.set(0, 1.7, torsoRadius(1.7) + .04);
      B.add(g);
      bowShape(g, col, .9);
    },
    scarf(H, B, d, hy, e, col) {
      mesh(torusGeo(torsoRadius(1.77) + .03, .065, 8, 26), col, 0, 1.77, 0, B).rotation.x = Math.PI / 2;
      const end = mesh(boxGeo(.13, .34, .04), col, .12, 1.56, torsoRadius(1.56) + .04, B);
      end.rotation.z = .12;
      mesh(boxGeo(.135, .04, .045), shade(col, .7), .1, 1.42, torsoRadius(1.42) + .05, B).rotation.z = .12;
    },
  },
  face: {
    mask(H, B, d, hy, e, col) {   // a hero / party mask with holes for the eyes
      for (const s of [-1, 1]) mesh(torusGeo(.085, .045, 8, 20), col, s * e.x, e.y, e.z + .03, H).scale.set(1.15, .9, .6);
      mesh(boxGeo(Math.max(.03, e.x * 2 - .2), .07, .04), col, 0, e.y + .01, e.z + .05, H);
      const hr = d.headR || .37;
      mesh(torusGeo(hr + .01, .02, 6, 30), col, 0, e.y, 0, H).rotation.x = Math.PI / 2;
    },
    sunglasses(H, B, d, hy, e, col) {
      for (const s of [-1, 1]) {
        // dark lenses in front of the eyes (the eyes stick out about .1)
        mesh(cylGeo(.112, .112, .02, 20), '#141414', s * e.x, e.y, e.z + .13, H).rotation.x = Math.PI / 2;
        mesh(torusGeo(.112, .02, 6, 20), col, s * e.x, e.y, e.z + .135, H);
        mesh(boxGeo(.05, .02, .02), '#ffffff', s * e.x - .035, e.y + .045, e.z + .145, H).rotation.z = -.6;   // a shine
      }
      mesh(boxGeo(Math.max(.02, e.x * 2 - .22), .03, .025), col, 0, e.y + .03, e.z + .135, H);
    },
    moustache(H, B, d, hy, e, col) {
      const g = new THREE.Group();
      g.position.set(0, e.y - .19, e.z + .14);
      H.add(g);
      for (const s of [-1, 1]) {
        const m = mesh(capsule2(), col, s * .07, 0, 0, g);
        m.rotation.z = s * (Math.PI / 2 - .35);
      }
    },
  },
};
const capsule2 = () => new THREE.CapsuleGeometry(.035, .09, 4, 10);

export const ACC_SLOTS = ['head', 'neck', 'face'];
export const ACC_KINDS = { head: Object.keys(ACC.head), neck: Object.keys(ACC.neck), face: Object.keys(ACC.face) };
export const ACC_EMOJI = { bow: '🎀', tophat: '🎩', party: '🥳', beanie: '🧶', cap: '🧢', flower: '🌸', crownflowers: '💐',
  tie: '👔', bowtie: '🎀', scarf: '🧣', mask: '🎭', sunglasses: '🕶️', moustache: '🥸' };

// jobs that already have something there (a helmet, a tie, glasses): the accessory waits until the job ends
const BUSY = {
  head: ['builder', 'farmer', 'chef', 'police', 'firefighter', 'fisher', 'imam', 'professor', 'pilot', 'operator'],
  neck: ['teacher', 'pilot', 'doctor', 'imam', 'chef', 'firefighter'],
  face: ['teacher', 'professor'],
};

// a random set for a new resident: most wear something, some wear two or three things
export function randomAccessories() {
  const a = {};
  if (Math.random() < .5) a.head = [pick(ACC_KINDS.head), pick(ACC_COLORS)];
  if (Math.random() < .35) a.neck = [pick(ACC_KINDS.neck), pick(ACC_COLORS)];
  if (Math.random() < .14) a.face = [pick(ACC_KINDS.face), pick(ACC_COLORS)];
  return a;
}

// put the resident's accessories on (called by dress, after the job's own outfit)
export function wearAccessories(c, job) {
  const a = c.acc;
  if (!a) return;
  const e = c.head.userData.eye || { x: .14, y: .07, z: .3 };
  for (const slot of ACC_SLOTS) {
    const [kind, col] = a[slot] || [];
    if (!kind || !ACC[slot][kind] || BUSY[slot].includes(job)) continue;
    ACC[slot][kind](c.gearHead, c.gearBody, c.def, c.def.hatY, e, col || ACC_COLORS[0]);
  }
}
