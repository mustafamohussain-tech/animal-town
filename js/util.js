// Small shared helpers: math, cached materials/geometries, mesh builders, textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- math ----------
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (cur, target, k) => cur + (target - cur) * k;
export const lerpAngle = (a, b, t) =>
  a + ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * t;
export const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

// ---------- cached materials ----------
const matCache = new Map();
export function mat(color, opts) {
  const key = opts ? color + '|' + JSON.stringify(opts) : color;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: .8, ...(opts || {}) });
    matCache.set(key, m);
  }
  return m;
}
export const sideMat = c => mat(c, { side: THREE.DoubleSide });

// ---------- cached geometries ----------
const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) geoCache.set(key, g = make()); return g; };
export const sphere = (r, w = 14, h = 10) => cached(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
export const domeGeo = r => cached(`d${r}`, () => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
export const capsule = (r, l, c = 6, s = 12) => cached(`c${r},${l},${c},${s}`, () => new THREE.CapsuleGeometry(r, l, c, s));
export const boxGeo = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cylGeo = (rt, rb, h, s = 16) => cached(`y${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const coneGeo = (r, h, s = 12) => cached(`o${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
export const torusGeo = (r, t, rs = 8, ts = 24, arc = Math.PI * 2) =>
  cached(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));

// ---------- mesh builders ----------
export function mesh(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export const box = (w, h, d, c, x, y, z, p) => mesh(boxGeo(w, h, d), c, x, y, z, p);
export const cyl = (rt, rb, h, c, x, y, z, p, s) => mesh(cylGeo(rt, rb, h, s), c, x, y, z, p);
export const ball = (r, c, x, y, z, p) => mesh(sphere(r), c, x, y, z, p);

// flattened blob stuck onto a sphere surface (spots, stripes, patches)
export function blob(parent, radius, dir, size, color, sx = 1, sy = 1) {
  const n = new THREE.Vector3(...dir).normalize();
  const m = mesh(sphere(size, 16, 12), color, 0, 0, 0, parent);
  m.scale.set(sx, sy, .3);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.position.copy(n.multiplyScalar(radius * .97));
  return m;
}

export function tube(points, r, color, parent) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, 12, r, 6), color, 0, 0, 0, parent);
}

// gable roof: triangle prism, ridge along x
export function prism(w, h, d) {
  return cached(`p${w},${h},${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

export function shadows(obj, cast = true) {
  obj.traverse(o => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = cast; o.receiveShadow = true; } });
}

// Pull every nested mesh up to be a direct child of `group` (keeping its look), so mergeStatic can combine it.
export function flatten(group) {
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const movers = [];
  group.traverse(o => {
    if (!o.isMesh || o.parent === group || o.userData.keep) return;
    for (let p = o.parent; p && p !== group; p = p.parent) if (p.userData.keep) return;
    movers.push(o);
  });
  const m = new THREE.Matrix4();
  for (const o of movers) {
    m.multiplyMatrices(inv, o.matrixWorld);
    o.parent.remove(o);
    m.decompose(o.position, o.quaternion, o.scale);
    group.add(o);
  }
}

// Merge the direct mesh children of a group that share a material into one mesh.
// Far fewer draw calls -> the game stays smooth with many characters/buildings.
// Meshes marked userData.keep (animated ones) are left alone.
export function mergeStatic(group) {
  const byMat = new Map();
  for (const ch of group.children) {
    if (!ch.isMesh || ch.userData.keep) continue;
    if (!byMat.has(ch.material)) byMat.set(ch.material, []);
    byMat.get(ch.material).push(ch);
  }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map(o => {
      o.updateMatrix();
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    list.forEach(o => group.remove(o));
    const m = new THREE.Mesh(merged, material);
    m.userData.ownGeo = true;
    group.add(m);
  }
}

// ---------- textures ----------
const texCache = new Map();
export function emojiTexture(e) {
  if (texCache.has(e)) return texCache.get(e);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(e, t);
  return t;
}

const isArabic = s => /[؀-ۿ]/.test(s);

// shop/building sign: rounded board with emoji + name
export function signTexture(emoji, text, bg = '#2b3a55', fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(4, 4, 504, 120, 28); g.fill();
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = '64px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  g.fillText(emoji, 70, 68);
  g.fillStyle = fg;
  let size = 56;
  const font = s => `800 ${s}px "Segoe UI", Tahoma, Arial, sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > 360 && size > 24) g.font = font(size -= 2);
  g.direction = isArabic(text) ? 'rtl' : 'ltr';
  g.fillText(text, 300, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// school chalkboard
export function chalkTexture() {
  return cached('chalk', () => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#2f5d46'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#f4f4f4'; g.font = 'bold 40px "Comic Sans MS", "Segoe Print", sans-serif';
    g.fillText('A B C', 30, 62);
    g.fillText('1+2=3', 30, 120);
    g.font = '40px "Segoe UI Emoji",sans-serif'; g.fillText('🍎', 190, 110);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
