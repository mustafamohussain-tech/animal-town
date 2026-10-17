// Smooth body shape + job outfits. Clothes are built on the same body profile so they hug the body.
import * as THREE from 'three';
import { mesh, mat, sideMat, sphere, domeGeo, boxGeo, cylGeo, torusGeo, tube, mergeStatic, shadows } from './util.js';

// Side profile of the torso as [radius, height]; spun around to make one smooth body.
const TORSO = [[0, .8], [.24, .81], [.3, .88], [.31, .98], [.29, 1.12], [.28, 1.24],
  [.3, 1.38], [.31, 1.5], [.29, 1.62], [.23, 1.73], [.13, 1.81], [0, 1.85]];
export const TORSO_DEPTH = .8; // front-to-back squash

// radius of the body (or of clothes) at height y; below the hips clothes flare out a little (coats)
export function torsoRadius(y) {
  if (y <= .88) return .3 + (.88 - y) * .12;
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
    if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return 0;
}

// a band of body/clothing between heights y0..y1 around angles phiStart..+phiLen (angle 0 = front)
export function bodyPart(parent, y0, y1, off, material, phiStart = 0, phiLen = Math.PI * 2) {
  const pts = [];
  const rows = Math.max(2, Math.min(10, Math.round((y1 - y0) * 9)));
  for (let i = 0; i <= rows; i++) {
    const y = y0 + (y1 - y0) * i / rows;
    pts.push(new THREE.Vector2(Math.max(0, torsoRadius(y) + off), y));
  }
  const partial = phiLen < Math.PI * 2 - .001;
  const m = typeof material === 'string' ? (partial ? sideMat(material) : mat(material)) : material;
  return mesh(new THREE.LatheGeometry(pts, Math.max(6, Math.round(24 * phiLen / (Math.PI * 2))), phiStart, phiLen), m, 0, 0, 0, parent);
}

// small item (badge, button, pocket) pressed flat onto the body; its local Y points out of the body
export function onBody(parent, geo, color, y, phi, off = .01) {
  const r = torsoRadius(y) + off;
  const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
  const m = mesh(geo, color, n.x * r, y, n.z * r, parent);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  return m;
}

const TWO_PI = Math.PI * 2;
const openFront = (B, y0, y1, off, color, gap = .32) => bodyPart(B, y0, y1, off, color, gap, TWO_PI - gap * 2);

// shirt / pants colours that replace the character's own clothes for some jobs
export const UNIFORM = {
  police: { shirt: '#3d5a9e', pants: '#24365e' },
  chef: { shirt: '#ffffff', pants: '#3a3a3a' },
  doctor: { shirt: '#7fc8c2', pants: '#7fc8c2' },
  firefighter: { shirt: '#c9a46a', pants: '#c9a46a' },
  farmer: { shirt: '#d9534f', pants: '#3e6db5' },
  teacher: { shirt: '#dfeaf7' },
};

// H = head gear group (origin = head centre), B = body gear group (inside the torso), d = animal, hy = top of skull
const GEAR = {
  builder(H, B, d, hy) {
    mesh(domeGeo(.4), '#ffc21a', 0, hy - .16, 0, H).scale.set(1, .78, 1);
    mesh(cylGeo(.47, .47, .025, 28), '#ffc21a', 0, hy - .16, .04, H);
    mesh(boxGeo(.08, .05, .62), '#f0a800', 0, hy + .15, 0, H);
    openFront(B, 1.0, 1.66, .012, '#ff7a1a');
    for (const y of [1.12, 1.36]) openFront(B, y, y + .055, .02, '#e9ff7a');
  },
  shopkeeper(H, B) {
    bodyPart(B, .86, 1.47, .012, '#ffffff', -.95, 1.9);
    bodyPart(B, 1.0, 1.13, .02, '#e6e6e6', -.32, .64);
    bodyPart(B, 1.47, 1.72, .012, '#ffffff', -.55, .22);
    bodyPart(B, 1.47, 1.72, .012, '#ffffff', .33, .22);
  },
  farmer(H, B, d, hy) {
    mesh(cylGeo(.56, .56, .03, 28), '#e8c86a', 0, hy - .04, 0, H);
    mesh(cylGeo(.27, .3, .22, 20), '#e8c86a', 0, hy + .07, 0, H);
    mesh(cylGeo(.305, .305, .06, 20), '#c0392b', 0, hy + .0, 0, H);
    bodyPart(B, .95, 1.42, .016, '#3e6db5', -.75, 1.5);
    bodyPart(B, .8, 1.04, .016, '#3e6db5');
    bodyPart(B, 1.42, 1.74, .016, '#3e6db5', -.55, .2);
    bodyPart(B, 1.42, 1.74, .016, '#3e6db5', .35, .2);
    for (const p of [-.45, .45]) onBody(B, cylGeo(.03, .03, .015, 10), '#f2c94c', 1.38, p, .03);
  },
  chef(H, B, d, hy) {
    mesh(cylGeo(.25, .22, .3, 20), '#ffffff', 0, hy + .1, 0, H);
    mesh(sphere(.3), '#ffffff', 0, hy + .3, 0, H).scale.set(1, .55, 1);
    bodyPart(B, 1.62, 1.73, .02, '#d9534f');
    for (const y of [1.2, 1.35, 1.5]) for (const p of [-.15, .15]) onBody(B, cylGeo(.025, .025, .015, 10), '#333333', y, p, .01);
  },
  police(H, B, d, hy) {
    const cap = new THREE.Group();
    cap.position.set(0, hy, .02);
    H.add(cap);
    mesh(cylGeo(.31, .28, .16, 24), '#24365e', 0, .02, 0, cap);
    mesh(cylGeo(.24, .24, .03, 24), '#1a2645', 0, -.06, .17, cap).scale.set(1, 1, .7);
    mesh(cylGeo(.05, .05, .02, 6), '#ffd23f', 0, .03, .3, cap).rotation.x = Math.PI / 2;
    onBody(B, cylGeo(.055, .055, .015, 6), '#ffd23f', 1.48, .45);
    for (const y of [1.15, 1.3, 1.45, 1.6]) onBody(B, cylGeo(.02, .02, .01, 10), '#d7dbe6', y, 0);
  },
  firefighter(H, B, d, hy) {
    mesh(domeGeo(.41), '#d62d20', 0, hy - .16, 0, H).scale.set(1, .8, 1);
    mesh(cylGeo(.5, .5, .03, 28), '#d62d20', 0, hy - .16, -.06, H).scale.set(1, 1, 1.15);
    mesh(boxGeo(.22, .2, .03), '#ffd23f', 0, hy + .02, .36, H).rotation.x = -.45;
    for (const y of [1.05, 1.3]) bodyPart(B, y, y + .06, .016, '#e9ff7a');
    bodyPart(B, 1.62, 1.74, .02, '#3a3a3a');
  },
  teacher(H, B) {
    const e = H.userData.eye || { x: .14, y: .07, z: .3 };
    for (const s of [-1, 1]) mesh(torusGeo(.095, .014, 8, 20), '#2b2b2b', s * e.x, e.y, e.z + .07, H);
    mesh(boxGeo(Math.max(.02, e.x * 2 - .19), .02, .02), '#2b2b2b', 0, e.y, e.z + .07, H);
    bodyPart(B, 1.66, 1.76, .015, '#ffffff');
    mesh(boxGeo(.08, .36, .02), '#c0392b', 0, 1.43, torsoRadius(1.43) + .02, B);
    mesh(boxGeo(.1, .08, .03), '#a93226', 0, 1.64, torsoRadius(1.64) + .025, B);
  },
  fisher(H, B, d, hy) {
    mesh(cylGeo(.29, .33, .2, 20), '#6b7d4a', 0, hy + .02, 0, H);
    mesh(cylGeo(.47, .35, .07, 24), '#6b7d4a', 0, hy - .08, 0, H);
    openFront(B, 1.0, 1.66, .014, '#7d8f55', .3);
    for (const p of [-.6, .6]) onBody(B, boxGeo(.13, .02, .11), '#6b7d4a', 1.2, p, .03);
  },
  doctor(H, B) {
    openFront(B, .62, 1.72, .022, '#ffffff', .22);
    onBody(B, boxGeo(.13, .02, .12), '#f0f0f0', 1.45, .6, .035);
    tube([[-.12, 1.8, .1], [-.18, 1.6, .27], [-.08, 1.44, .34], [.03, 1.38, .35]], .016, '#333333', B);
    tube([[.12, 1.8, .1], [.18, 1.6, .27], [.1, 1.47, .33]], .016, '#333333', B);
    onBody(B, cylGeo(.045, .045, .02, 14), '#c0c6cf', 1.38, .12, .05);
  },
};

// dress a character for a job: clear old gear, recolour shirt/pants, add the new outfit
export function dress(c, job) {
  for (const g of [c.gearHead, c.gearBody]) {
    while (g.children.length) {
      const ch = g.children[0];
      g.remove(ch);
      ch.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    }
  }
  const u = UNIFORM[job] || {};
  c.shirtMat.color.set(u.shirt || c.shirt);
  c.pantsMat.color.set(u.pants || c.pants);
  c.gearHead.userData.eye = c.head.userData.eye;
  GEAR[job]?.(c.gearHead, c.gearBody, c.def, c.def.hatY);
  mergeStatic(c.gearHead);
  mergeStatic(c.gearBody);
  shadows(c.gearHead);
  shadows(c.gearBody);
}

// swimming: a full one-piece swimsuit (body, arms and legs in one colour) and a swim cap, instead of the
// citizen's own clothes and job gear. on = false puts everything back.
const SWIM = ['#1e88e5', '#e53935', '#8e24aa', '#00a0a0', '#ff7043', '#3949ab', '#d81b60', '#43a047'];
export function swimwear(c, on) {
  if (!!c.inSwimsuit === on) return;
  c.inSwimsuit = on;
  if (on) {
    const col = SWIM[c.id % SWIM.length];
    c.shirtMat.color.set(col);
    c.pantsMat.color.set(col);
    c.gearHead.visible = c.gearBody.visible = false;
    if (c.belt) c.belt.visible = false;
    if (!c.swimCap) {
      c.swimCap = new THREE.Group();
      const hy = c.def.hatY;
      mesh(domeGeo(.4), col, 0, hy - .2, 0, c.swimCap).scale.set(1.05, .8, 1.05);
      mesh(torusGeo(.38, .025, 6, 24), '#ffffff', 0, hy - .19, 0, c.swimCap).rotation.x = Math.PI / 2;
      c.gearHead.parent.add(c.swimCap);
    }
    c.swimCap.children[0].material = mat(col);
    c.swimCap.visible = true;
  } else {
    c.gearHead.visible = c.gearBody.visible = true;
    if (c.belt) c.belt.visible = true;
    if (c.swimCap) c.swimCap.visible = false;
    dress(c, c.job);
  }
}
