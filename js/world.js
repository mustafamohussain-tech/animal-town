// The 3D world: renderer, camera, lights, sky, the land (which can be expanded) and the forest around it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Grid, TILE, MAX_R } from './path.js';
import { mesh, mat, sphere, cylGeo, rand, pick, clamp, mergeStatic } from './util.js';

export const LEAVES = ['#4caf50', '#5cc461', '#43a047', '#66bb6a', '#3e9b4f'];

export class World {
  constructor(frame) {
    this.frame = frame;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.maxPR = Math.min(devicePixelRatio, 1.5);
    this.pr = this.maxPR;
    r.setPixelRatio(this.pr);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    frame.prepend(r.domElement);

    const l = this.labels = new CSS2DRenderer();
    Object.assign(l.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '1' });
    frame.appendChild(l.domElement);

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color('#a9dcff');
    s.fog = new THREE.Fog('#a9dcff', 140, 520);

    const cam = this.camera = new THREE.PerspectiveCamera(50, 9 / 16, .2, 3000);
    cam.position.set(0, 24, 36);
    const c = this.controls = new OrbitControls(cam, r.domElement);
    c.target.set(0, 1, 0);
    c.enableDamping = true;
    c.dampingFactor = .12;
    c.rotateSpeed = .7;
    c.zoomSpeed = 1.3;
    c.panSpeed = 1;
    c.zoomToCursor = true;
    // mouse: left drag = move over the map, right drag = turn the camera, wheel = zoom
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.maxPolarAngle = Math.PI * .48;
    c.minDistance = 2.5;
    c.maxDistance = 260;
    c.screenSpacePanning = false;

    this.hemi = new THREE.HemisphereLight('#ffffff', '#6aa84f', 1.15);
    s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff4dd', 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
    sun.shadow.bias = -.0004;
    sun.shadow.normalBias = .04;
    sun.shadow.autoUpdate = false; // refreshed every other frame (see render)
    this.frame = 0;
    this.ft = 1 / 60;
    s.add(sun, sun.target);
    this.sunOffset = new THREE.Vector3(30, 50, 25);
    // light space, used to move the shadow box in whole shadow pixels (no shimmering while the camera moves)
    this.lightRot = new THREE.Matrix4().lookAt(this.sunOffset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.lightInv = this.lightRot.clone().invert();
    this.texel = 90 / 1024;

    this.grid = new Grid();
    this.landR = 5;
    // ground outside the land: darker (not built yet), lower and pushed back in depth so it never
    // flickers against the land when the camera is far away
    const g = this.outside = mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#4d7244', roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }), 0, -.35, 0, s);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.land = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#8fd67a', roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }), 0, 0, 0, s);
    this.land.rotation.x = -Math.PI / 2;
    this.land.receiveShadow = true;
    this.border = new THREE.Group();
    s.add(this.border);
    this.buildForest();
    this.buildClouds();
    this.setLand(5);
  }

  get landHalf() { return this.landR * TILE + TILE / 2; }
  inLand(i, j) { return Math.abs(i) <= this.landR && Math.abs(j) <= this.landR; }

  setLand(r) {
    this.landR = clamp(r, 3, MAX_R);
    const half = this.landHalf;
    this.land.scale.set(half * 2, half * 2, 1);
    this.grid.setLand(this.landR);
    // little fence posts along the edge of the land
    this.border.clear();
    for (let x = -half; x <= half; x += 6) {
      for (const [px, pz] of [[x, -half], [x, half], [-half, x], [half, x]]) {
        mesh(cylGeo(.12, .12, 1.1, 5), '#a0703f', px, .55, pz, this.border);
      }
    }
    mergeStatic(this.border);
    this.placeForest();
  }

  // ---------- forest ring outside the land (instanced = cheap) ----------
  buildForest() {
    const N = this.forestN = 420;
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .42, 2.4, 6), mat('#8b5a2b'), N);
    this.tops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 0), mat('#ffffff'), N);
    this.trunks.castShadow = this.tops.castShadow = true;
    for (let k = 0; k < N; k++) this.tops.setColorAt(k, new THREE.Color(pick(LEAVES)).multiplyScalar(.68));
    this.scene.add(this.trunks, this.tops);
  }
  placeForest() {
    const half = this.landHalf, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let k = 0; k < this.forestN; k++) {
      let x, z;
      do { x = rand(-half - 70, half + 70); z = rand(-half - 70, half + 70); } while (Math.max(Math.abs(x), Math.abs(z)) < half + 5);
      const s = rand(1, 2.2);
      q.setFromAxisAngle(v.set(0, 1, 0), rand(0, 6));
      m4.compose(v.set(x, 1.2 * s, z), q, sc.set(s, s, s)); this.trunks.setMatrixAt(k, m4);
      m4.compose(v.set(x, 3.6 * s, z), q, sc.set(s, s * 1.2, s)); this.tops.setMatrixAt(k, m4);
    }
    this.trunks.instanceMatrix.needsUpdate = this.tops.instanceMatrix.needsUpdate = true;
    this.trunks.computeBoundingSphere(); this.tops.computeBoundingSphere();
  }

  buildClouds() {
    this.clouds = [];
    const cm = mat('#ffffff', { roughness: 1 });
    for (let k = 0; k < 16; k++) {
      const g = new THREE.Group();
      for (let p = 0; p < 4; p++) mesh(sphere(rand(3, 5), 12, 8), cm, p * 3.5 - 5, rand(-.6, .8), rand(-1.5, 1.5), g);
      g.position.set(rand(-300, 300), rand(60, 90), rand(-300, 200));
      g.userData.speed = rand(.8, 2);
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  // ---------- walking spots ----------
  spawnPoint() { return { x: rand(-2, 2), z: rand(-2, 2) }; }
  randomSpot(near, r = 14) {
    const half = this.landHalf - 2;
    for (let k = 0; k < 30; k++) {
      const x = clamp(near.x + rand(-r, r), -half, half), z = clamp(near.z + rand(-r, r), -half, half);
      if (this.grid.freeAt(x, z)) return { x, z };
    }
    return this.spawnPoint();
  }

  // ---------- frame ----------
  resize(w, h) {
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 320) c.position.x = -320;
    }
    const t = this.controls.target, half = this.landHalf + 20;
    t.x = clamp(t.x, -half, half);
    t.z = clamp(t.z, -half, half);
    // the sun's shadow box follows what we look at, snapped to whole shadow pixels
    const p = this.snapV || (this.snapV = new THREE.Vector3());
    p.copy(t).applyMatrix4(this.lightInv);
    p.x = Math.round(p.x / this.texel) * this.texel;
    p.y = Math.round(p.y / this.texel) * this.texel;
    p.applyMatrix4(this.lightRot);
    this.sun.position.copy(p).add(this.sunOffset);
    this.sun.target.position.copy(p);
    // depth precision: the near plane moves out when the camera is far (stops the ground flickering)
    const cam = this.camera, h = cam.position.y;
    const near = clamp(Math.min(h, cam.position.distanceTo(t)) * .03, .2, 6);
    if (Math.abs(near - cam.near) > .05) { cam.near = near; cam.updateProjectionMatrix(); }
    // see further when the camera is high (airplane view)
    this.scene.fog.near = 140 + h * 1.2;
    this.scene.fog.far = 520 + h * 4;
  }

  // keep the frame rate smooth: lower the resolution a bit when the PC is struggling, raise it again when fine
  // recording at full size: the 3D view is drawn at exactly this pixel ratio (null = back to automatic)
  forcePixelRatio(pr) {
    this.forcedPR = pr ? Math.min(pr, 4) : null;
    this.setPR(this.forcedPR || Math.min(this.pr, this.maxPR));
  }
  setPR(pr) {
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    const s = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setSize(s.x, s.y);
  }
  adapt(dt) {
    if (this.forcedPR) return;
    this.ft += (Math.min(dt, .1) - this.ft) * .05;
    this.adaptT = (this.adaptT || 0) + dt;
    if (this.adaptT < 1.5) return;
    this.adaptT = 0;
    let pr = this.pr;
    if (this.ft > 1 / 40 && pr > .7) pr = Math.max(.7, pr - .15);
    else if (this.ft < 1 / 57 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + .1);
    if (pr !== this.pr) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      const s = this.renderer.getSize(new THREE.Vector2());
      this.renderer.setSize(s.x, s.y);
    }
  }

  render() {
    // shadows only need a refresh when something moved; the light only moves in whole shadow pixels
    if ((this.frame++ & 1) === 0 || !this.lastSun?.equals(this.sun.position)) this.sun.shadow.needsUpdate = true;
    (this.lastSun ||= new THREE.Vector3()).copy(this.sun.position);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
