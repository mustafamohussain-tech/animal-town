// The 20 animal heads (+ tails). Each head is built around (0,0,0) facing +z.
// fur = neck/forearm colour, hand = hand colour, hatY = top of the skull (where hats sit).
import * as THREE from 'three';
import { mesh, sphere, capsule, coneGeo, cylGeo, boxGeo, blob, tube } from './util.js';

function eyes(h, x, y, z, s = 1) {
  h.userData.eye = { x, y, z };
  const list = [];
  for (const k of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(k * x, y, z);
    e.scale.setScalar(s);
    e.userData.s = s;
    mesh(sphere(.085), '#ffffff', 0, 0, 0, e).scale.set(1, 1.15, .6);
    mesh(sphere(.05), '#1b1b1b', 0, -.005, .04, e);
    mesh(sphere(.016), '#ffffff', .018, .02, .085, e);
    h.add(e);
    list.push(e);
  }
  return list;
}

export const ANIMAL_ORDER = ['cat', 'dog', 'rabbit', 'hamster', 'cow', 'pig', 'sheep', 'chicken', 'horse',
  'lion', 'tiger', 'bear', 'monkey', 'elephant', 'giraffe', 'penguin', 'frog', 'panda', 'fox', 'duck'];

export const ANIMALS = {
  // ---------------- pets ----------------
  cat: {
    emoji: '🐱', fur: '#f29c38', hand: '#fff6ea', hatY: .33,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h).scale.set(1.1, .95, 1);
      for (const s of [-1, 1]) {
        mesh(coneGeo(.14, .3, 4), this.fur, s * .22, .36, 0, h).rotation.z = -s * .35;
        mesh(coneGeo(.08, .18, 4), '#ffb3c1', s * .21, .34, .05, h).rotation.z = -s * .35;
        for (const k of [-1, 1]) {
          const w = mesh(cylGeo(.006, .006, .32, 4), '#ffffff', s * .26, -.1 + k * .03, .3, h);
          w.rotation.z = Math.PI / 2 + s * k * .15;
        }
      }
      for (const x of [-.09, 0, .09]) blob(h, .4, [x, .9, .35], .06, '#c96a14', .5, 1.6);
      mesh(sphere(.16), '#fff6ea', 0, -.12, .28, h).scale.set(1.35, .8, .8);
      mesh(sphere(.045), '#ff7f9a', 0, -.05, .4, h);
      return eyes(h, .14, .06, .3);
    },
    tail(t) { tube([[0, 0, 0], [0, .1, -.3], [0, .5, -.45], [.12, .8, -.38]], .05, this.fur, t); },
  },
  dog: {
    emoji: '🐶', fur: '#b07a45', hand: '#e9c99a', hatY: .33,
    head(h) {
      mesh(sphere(.37), this.fur, 0, 0, 0, h).scale.set(1, .95, 1);
      mesh(sphere(.18), '#f1d9b5', 0, -.12, .29, h).scale.set(1.2, .85, 1.15);
      mesh(sphere(.07), '#222222', 0, -.05, .48, h).scale.set(1.2, .8, .8);
      mesh(sphere(.05), '#ff7f9a', 0, -.24, .36, h).scale.set(1, .5, 1);
      for (const s of [-1, 1]) {
        const ear = mesh(sphere(.15), '#7a4f2a', s * .36, 0, -.02, h);
        ear.scale.set(.42, 1.2, .8);
        ear.rotation.z = s * .3;
      }
      blob(h, .37, [.38, .32, .85], .11, '#7a4f2a');
      return eyes(h, .13, .07, .3);
    },
    tail(t) { tube([[0, 0, 0], [0, .15, -.22], [0, .38, -.3]], .045, this.fur, t); },
    wag: true,
  },
  rabbit: {
    emoji: '🐰', fur: '#f2efe9', hand: '#ffffff', hatY: .3,
    head(h) {
      mesh(sphere(.36), this.fur, 0, 0, 0, h);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * .13, .28, -.02);
        ear.rotation.z = -s * .15;
        h.add(ear);
        mesh(capsule(.075, .42), this.fur, 0, .28, 0, ear);
        mesh(capsule(.04, .32), '#ffb3c1', 0, .28, .05, ear).scale.z = .5;
        mesh(sphere(.09), '#ffffff', s * .07, -.12, .29, h);
      }
      mesh(sphere(.04), '#ff8fa8', 0, -.06, .36, h);
      mesh(boxGeo(.08, .07, .02), '#ffffff', 0, -.2, .33, h);
      return eyes(h, .14, .06, .29);
    },
    tail(t) { mesh(sphere(.12), '#ffffff', 0, .05, -.12, t); },
  },
  hamster: {
    emoji: '🐹', fur: '#e5a54f', hand: '#fbe3c0', hatY: .31,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h).scale.set(1.12, .95, 1);
      for (const s of [-1, 1]) {
        mesh(sphere(.17), '#fbe3c0', s * .2, -.12, .18, h);
        mesh(sphere(.1), this.fur, s * .25, .3, 0, h).scale.set(1, 1, .5);
        mesh(sphere(.06), '#f3a3a3', s * .25, .3, .03, h).scale.set(1, 1, .5);
      }
      mesh(sphere(.2), '#fbe3c0', 0, -.1, .22, h).scale.set(1, .8, .75);
      mesh(sphere(.035), '#f37f8f', 0, -.03, .37, h);
      return eyes(h, .15, .08, .3, .85);
    },
    tail(t) { mesh(sphere(.06), this.fur, 0, 0, -.08, t); },
  },

  // ---------------- farm ----------------
  cow: {
    emoji: '🐮', fur: '#f8f6f0', hand: '#3a3a3a', hatY: .35,
    head(h) {
      mesh(sphere(.37), this.fur, 0, 0, 0, h).scale.set(1, 1.05, 1);
      blob(h, .38, [.7, .5, .4], .13, '#2b2b2b');
      blob(h, .38, [-.8, .2, .1], .15, '#2b2b2b');
      blob(h, .38, [-.2, .9, -.3], .12, '#2b2b2b');
      for (const s of [-1, 1]) {
        mesh(coneGeo(.06, .22, 12), '#efe2b8', s * .36, .26, 0, h).rotation.z = -s;
        const ear = mesh(sphere(.12), this.fur, s * .43, .02, 0, h);
        ear.scale.set(1.4, .55, .7);
        ear.rotation.z = s * .3;
        mesh(sphere(.035), '#4a2a2a', s * .08, -.17, .47, h);
      }
      mesh(sphere(.2), '#f4b8b0', 0, -.17, .3, h).scale.set(1.45, .85, .85);
      return eyes(h, .14, .08, .29);
    },
    tail(t) {
      tube([[0, 0, 0], [0, -.2, -.15], [0, -.5, -.18]], .03, this.fur, t);
      mesh(sphere(.07), '#2b2b2b', 0, -.55, -.18, t).scale.set(1, 1.5, 1);
    },
  },
  pig: {
    emoji: '🐷', fur: '#f5a9b8', hand: '#f08ca0', hatY: .34,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h);
      mesh(cylGeo(.13, .14, .12, 20), '#f08ca0', 0, -.08, .37, h).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        mesh(sphere(.03), '#a3485a', s * .045, -.08, .435, h);
        mesh(coneGeo(.11, .2, 4), this.fur, s * .24, .32, .05, h).rotation.set(.6, 0, -s * .3);
      }
      return eyes(h, .14, .08, .3);
    },
    tail(t) {
      const pts = [];
      for (let k = 0; k <= 14; k++) { const a = k * .7; pts.push([Math.cos(a) * .06, .03 + k * .008, -.04 - k * .012 + Math.sin(a) * .06]); }
      tube(pts, .022, this.fur, t);
    },
  },
  sheep: {
    emoji: '🐑', fur: '#f4f1ea', hand: '#3d3a3a', hatY: .4,
    head(h) {
      mesh(sphere(.3), '#4a4444', 0, -.04, .08, h).scale.set(.9, 1.05, 1);
      for (const [x, y, z, r] of [[0, .24, -.05, .2], [-.18, .18, -.02, .16], [.18, .18, -.02, .16], [-.12, .3, .08, .13],
        [.12, .3, .08, .13], [0, .08, -.2, .26], [-.25, 0, -.1, .17], [.25, 0, -.1, .17], [0, .32, .12, .12]]) {
        mesh(sphere(r), this.fur, x, y, z, h);
      }
      for (const s of [-1, 1]) {
        const e = mesh(sphere(.1), '#4a4444', s * .32, 0, .06, h);
        e.scale.set(1.5, .5, .6);
        e.rotation.z = -s * .3;
      }
      return eyes(h, .11, .03, .3, .9);
    },
    tail(t) { mesh(sphere(.13), this.fur, 0, .05, -.1, t); },
  },
  chicken: {
    emoji: '🐔', fur: '#ffffff', hand: '#f5b02e', hatY: .33,
    head(h) {
      mesh(sphere(.36), this.fur, 0, 0, 0, h);
      for (const [y, z] of [[.36, .1], [.41, 0], [.36, -.1]]) mesh(sphere(.08), '#e23b3b', 0, y, z, h);
      mesh(coneGeo(.08, .18, 10), '#f5b02e', 0, -.02, .4, h).rotation.x = Math.PI / 2;
      mesh(sphere(.06), '#e23b3b', 0, -.16, .32, h).scale.set(1, 1.4, .8);
      return eyes(h, .14, .07, .29);
    },
    tail(t) {
      for (const k of [-1, 0, 1]) {
        const f = mesh(sphere(.13), '#f4f4f4', k * .08, .18, -.05, t);
        f.scale.set(.35, 1, .8);
        f.rotation.set(-.5, 0, k * .3);
      }
    },
  },
  horse: {
    emoji: '🐴', fur: '#8a5a33', hand: '#3a2a20', hatY: .37,
    head(h) {
      mesh(sphere(.34), this.fur, 0, .05, -.02, h);
      mesh(capsule(.19, .26, 8, 16), '#9c6a40', 0, -.13, .24, h).rotation.x = Math.PI / 2 + .45;
      for (const s of [-1, 1]) {
        mesh(sphere(.032), '#2a1a12', s * .07, -.26, .48, h);
        mesh(coneGeo(.07, .2, 8), this.fur, s * .15, .4, -.02, h).rotation.z = -s * .2;
      }
      blob(h, .35, [0, .35, 1], .07, '#ffffff', .6, 2.2);
      for (let k = 0; k < 6; k++) mesh(sphere(.08), '#3a2a20', 0, .38 - k * .06, .06 - k * .08, h);
      return eyes(h, .19, .12, .22);
    },
    tail(t) { tube([[0, 0, 0], [0, -.15, -.22], [0, -.5, -.28]], .06, '#3a2a20', t); },
  },

  // ---------------- wild ----------------
  lion: {
    emoji: '🦁', fur: '#e8b04a', hand: '#e8b04a', hatY: .34, headR: .4,
    head(h) {
      const mane = ['#b0581b', '#cf7426'];
      mesh(sphere(.42), mane[0], 0, .02, -.16, h);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        mesh(sphere(.17), mane[i % 2], Math.cos(a) * .42, Math.sin(a) * .42 + .02, -.06, h);
      }
      mesh(sphere(.36), this.fur, 0, 0, .02, h);
      for (const s of [-1, 1]) {
        mesh(sphere(.09), this.fur, s * .26, .3, .02, h).scale.set(1, 1, .6);
        mesh(sphere(.05), '#c98a2e', s * .26, .3, .06, h).scale.set(1, 1, .5);
      }
      mesh(sphere(.17), '#f7e2b4', 0, -.12, .27, h).scale.set(1.3, .85, .8);
      mesh(coneGeo(.06, .07, 3), '#5a3418', 0, -.04, .41, h).rotation.x = Math.PI;
      return eyes(h, .13, .08, .3);
    },
    tail(t) {
      tube([[0, 0, 0], [0, -.1, -.35], [0, .05, -.6], [0, .3, -.7]], .035, this.fur, t);
      mesh(sphere(.09), '#b0581b', 0, .32, -.7, t);
    },
  },
  tiger: {
    emoji: '🐯', fur: '#f08a24', hand: '#fff3e0', hatY: .33,
    head(h) {
      const k = '#2a1d14';
      mesh(sphere(.38), this.fur, 0, 0, 0, h).scale.set(1.08, .97, 1);
      blob(h, .39, [0, .9, .42], .07, k, .45, 1.6);
      blob(h, .39, [-.28, .85, .45], .06, k, .4, 1.3);
      blob(h, .39, [.28, .85, .45], .06, k, .4, 1.3);
      for (const s of [-1, 1]) for (const y of [.35, .05]) blob(h, .41, [s, y, .15], .07, k, 1.6, .4);
      mesh(sphere(.17), '#fff3e0', 0, -.13, .28, h).scale.set(1.4, .8, .8);
      for (const s of [-1, 1]) {
        mesh(sphere(.13), '#fff3e0', s * .2, -.12, .2, h);
        mesh(sphere(.1), this.fur, s * .26, .3, 0, h).scale.set(1, 1, .5);
        mesh(sphere(.055), '#fff3e0', s * .26, .3, .035, h).scale.set(1, 1, .5);
      }
      mesh(sphere(.045), '#d9707e', 0, -.05, .41, h);
      return eyes(h, .14, .07, .3);
    },
    tail(t) {
      const pts = [[0, 0, 0], [0, -.05, -.35], [0, .15, -.6], [0, .4, -.65]];
      tube(pts, .045, this.fur, t);
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
      for (const u of [.35, .6, .85]) { const p = curve.getPoint(u); mesh(sphere(.052), '#2a1d14', p.x, p.y, p.z, t).scale.set(1, .5, 1); }
    },
  },
  bear: {
    emoji: '🐻', fur: '#7a5232', hand: '#5c3c22', hatY: .35, headR: .39,
    head(h) {
      mesh(sphere(.39), this.fur, 0, 0, 0, h);
      for (const s of [-1, 1]) {
        mesh(sphere(.12), this.fur, s * .28, .3, 0, h).scale.set(1, 1, .6);
        mesh(sphere(.07), '#c79b72', s * .28, .3, .045, h).scale.set(1, 1, .5);
      }
      mesh(sphere(.17), '#c79b72', 0, -.12, .3, h).scale.set(1.25, .85, .9);
      mesh(sphere(.06), '#1f1410', 0, -.06, .45, h).scale.set(1.3, .8, .8);
      return eyes(h, .14, .08, .31, .9);
    },
    tail(t) { mesh(sphere(.08), this.fur, 0, 0, -.08, t); },
  },
  monkey: {
    emoji: '🐵', fur: '#7b4a2a', hand: '#e8c49a', hatY: .33,
    head(h) {
      mesh(sphere(.36), this.fur, 0, 0, 0, h);
      mesh(sphere(.26), '#e8c49a', 0, -.06, .16, h).scale.set(1.1, .95, .75);
      for (const s of [-1, 1]) {
        mesh(sphere(.14), '#e8c49a', s * .1, .07, .2, h).scale.set(1, 1, .7);
        mesh(sphere(.13), this.fur, s * .38, .02, 0, h).scale.set(.5, 1, 1);
        mesh(sphere(.09), '#e8c49a', s * .4, .02, .02, h).scale.set(.5, 1, 1);
        mesh(sphere(.022), '#4a2c1a', s * .035, -.08, .36, h);
      }
      return eyes(h, .1, .07, .3, .85);
    },
    tail(t) { tube([[0, 0, 0], [0, -.1, -.4], [0, .2, -.7], [0, .55, -.6], [0, .6, -.42]], .035, this.fur, t); },
  },
  elephant: {
    emoji: '🐘', fur: '#9aa3ad', hand: '#8a929b', hatY: .35,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h);
      for (const s of [-1, 1]) {
        mesh(sphere(.32), this.fur, s * .45, .02, -.12, h).scale.set(.95, 1, .2);
        mesh(sphere(.25), '#e3b5bd', s * .46, 0, -.08, h).scale.set(.95, .9, .15);
        mesh(coneGeo(.04, .2, 8), '#fffaf0', s * .14, -.2, .34, h).rotation.x = Math.PI / 2 + .5;
      }
      tube([[0, -.02, .3], [0, -.22, .45], [0, -.5, .46], [0, -.66, .56]], .085, this.fur, h);
      mesh(sphere(.085), this.fur, 0, -.66, .56, h);
      return eyes(h, .17, .1, .29);
    },
    tail(t) {
      tube([[0, 0, 0], [0, -.15, -.12], [0, -.4, -.15]], .025, this.fur, t);
      mesh(sphere(.05), '#555555', 0, -.42, -.15, t);
    },
  },
  giraffe: {
    emoji: '🦒', fur: '#f2c24f', hand: '#8a5a2b', hatY: .3, neck: .45, neckSpots: '#a8642a', headR: .31,
    head(h) {
      mesh(sphere(.3), this.fur, 0, 0, 0, h).scale.set(.95, 1, 1.05);
      mesh(sphere(.2), '#f7d98a', 0, -.1, .25, h).scale.set(1, .8, 1.15);
      for (const s of [-1, 1]) {
        mesh(cylGeo(.035, .035, .22, 8), '#8a5a2b', s * .1, .36, -.05, h);
        mesh(sphere(.055), '#5a3a1a', s * .1, .48, -.05, h);
        mesh(sphere(.09), this.fur, s * .3, .18, -.05, h).scale.set(1.6, .5, .6);
        mesh(sphere(.025), '#3a2a1a', s * .06, -.12, .47, h);
      }
      blob(h, .31, [-.6, .5, .2], .08, '#a8642a');
      blob(h, .31, [.5, .6, -.4], .08, '#a8642a');
      blob(h, .31, [.2, .2, -.9], .09, '#a8642a');
      return eyes(h, .15, .08, .22);
    },
    tail(t) {
      tube([[0, 0, 0], [0, -.2, -.15], [0, -.5, -.18]], .025, this.fur, t);
      mesh(sphere(.06), '#3a2a1a', 0, -.53, -.18, t).scale.set(1, 1.4, 1);
    },
  },

  // ---------------- fun extras ----------------
  penguin: {
    emoji: '🐧', fur: '#22252b', hand: '#22252b', hatY: .34,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h);
      mesh(sphere(.3), '#ffffff', 0, -.05, .13, h).scale.set(1.05, .95, .85);
      for (const s of [-1, 1]) {
        mesh(sphere(.16), '#ffffff', s * .12, .08, .2, h).scale.set(1, 1, .7);
        mesh(sphere(.05), '#ff9fb0', s * .2, -.1, .33, h).scale.set(1, .6, .4);
      }
      mesh(coneGeo(.07, .16, 10), '#f7a21b', 0, -.06, .42, h).rotation.x = Math.PI / 2;
      return eyes(h, .12, .07, .33, .9);
    },
    tail(t) { mesh(coneGeo(.1, .2, 8), this.fur, 0, -.05, -.08, t).rotation.x = -2.2; },
  },
  frog: {
    emoji: '🐸', fur: '#5dbb4a', hand: '#4aa63a', hatY: .36,
    head(h) {
      mesh(sphere(.38), this.fur, 0, 0, 0, h).scale.set(1.2, .8, 1);
      for (const s of [-1, 1]) {
        mesh(sphere(.15), this.fur, s * .18, .24, .1, h);
        mesh(sphere(.06), '#ff8fa8', s * .28, -.06, .27, h).scale.set(1, .6, .4);
      }
      mesh(boxGeo(.3, .022, .03), '#7a2a2a', 0, -.1, .35, h);
      return eyes(h, .18, .28, .23, 1.15);
    },
  },
  panda: {
    emoji: '🐼', fur: '#f7f7f5', hand: '#1d1d1d', hatY: .35, headR: .39,
    head(h) {
      mesh(sphere(.39), this.fur, 0, 0, 0, h);
      for (const s of [-1, 1]) {
        mesh(sphere(.12), '#1d1d1d', s * .27, .3, 0, h).scale.set(1, 1, .6);
        blob(h, .39, [s * .36, .16, .9], .11, '#1d1d1d', 1, 1.3);
      }
      mesh(sphere(.15), '#ffffff', 0, -.13, .3, h).scale.set(1.25, .8, .8);
      mesh(sphere(.05), '#1d1d1d', 0, -.08, .42, h).scale.set(1.3, .8, .8);
      return eyes(h, .135, .06, .35, .8);
    },
    tail(t) { mesh(sphere(.08), this.fur, 0, 0, -.08, t); },
  },
  fox: {
    emoji: '🦊', fur: '#e8702a', hand: '#2b2422', hatY: .31,
    head(h) {
      mesh(sphere(.36), this.fur, 0, 0, 0, h).scale.set(1.1, .95, 1);
      mesh(coneGeo(.15, .32, 16), this.fur, 0, -.1, .4, h).rotation.x = Math.PI / 2;
      mesh(sphere(.13), '#ffffff', 0, -.17, .3, h).scale.set(1.3, .6, 1.3);
      for (const s of [-1, 1]) {
        mesh(sphere(.14), '#ffffff', s * .2, -.12, .18, h);
        mesh(coneGeo(.13, .32, 4), this.fur, s * .2, .38, 0, h).rotation.z = -s * .25;
        mesh(coneGeo(.065, .13, 4), '#2b2422', s * .225, .47, 0, h).rotation.z = -s * .25;
      }
      mesh(sphere(.045), '#1d1d1d', 0, -.1, .56, h);
      return eyes(h, .14, .06, .29);
    },
    tail(t) {
      [[0, 0, 0, .1], [0, -.05, -.25, .16], [0, .05, -.5, .18], [0, .25, -.65, .15]].forEach(([x, y, z, r]) => mesh(sphere(r), this.fur, x, y, z, t));
      mesh(sphere(.12), '#ffffff', 0, .38, -.68, t);
    },
  },
  duck: {
    emoji: '🦆', fur: '#fafafa', hand: '#f59a1b', hatY: .33,
    head(h) {
      mesh(sphere(.37), this.fur, 0, 0, 0, h);
      mesh(sphere(.2), '#f59a1b', 0, -.1, .34, h).scale.set(1.1, .35, 1.1);
      mesh(sphere(.07), this.fur, 0, .4, .02, h).scale.set(.5, 1.5, .5);
      return eyes(h, .14, .08, .3);
    },
    tail(t) { mesh(coneGeo(.1, .22, 8), this.fur, 0, .08, -.1, t).rotation.x = -2.0; },
  },
};
