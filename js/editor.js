// Mouse tools on the map: draw roads, curved roads, bridges, place lamps / traffic lights / trees,
// erase, and choose where a building goes (see-through "ghost").
// While a tool is active: left mouse = use the tool, right mouse = turn the camera, wheel = zoom.
import * as THREE from 'three';
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { buildCurveMesh } from './curves.js';
import { PROP_TYPES } from './props.js';
import { canPlace, roadInFront, footprint, makeGhostModel, GHOST_OK, GHOST_BAD } from './buildings.js';

const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Editor {
  constructor(game) {
    this.game = game;
    this.tool = null;
    this.opts = {};
    this.pts = [];
    this.rot = 0;
    this.manualRot = false;
    this.ray = new THREE.Raycaster();
    this.painting = false;

    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffcf3f', transparent: true, opacity: .35, depthWrite: false }));
    this.cursor.position.y = .25;
    this.cursor.visible = false;
    game.scene.add(this.cursor);
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.9, .12, 8, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffcf3f' }));
    ring.position.y = .2;
    this.marker.add(ring, new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 4), new THREE.MeshBasicMaterial({ color: '#ffcf3f' })));
    this.marker.children[1].position.y = 2;
    this.marker.visible = false;
    game.scene.add(this.marker);
    this.dots = new THREE.Group();
    game.scene.add(this.dots);

    const el = game.world.renderer.domElement;
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', () => this.up());
    this.linePool = [];
    el.addEventListener('dblclick', () => { if (this.tool === 'curve' || this.tool === 'bridge') this.finishCurve(); });
    el.addEventListener('contextmenu', e => { if (this.tool) e.preventDefault(); });
    addEventListener('keydown', e => this.key(e));
  }

  // ---------- switching tools ----------
  setTool(tool, opts = {}) {
    this.clearPreview();
    this.pts = [];
    this.tool = tool;
    this.opts = opts;
    this.manualRot = false;
    const ctl = this.game.world.controls;
    ctl.mouseButtons.LEFT = tool ? -1 : THREE.MOUSE.ROTATE;
    ctl.mouseButtons.RIGHT = tool ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    this.game.world.renderer.domElement.style.cursor = tool ? 'crosshair' : '';
    // building / drawing needs a free camera: stop following a citizen and look from above
    const d = this.game.director;
    if (tool && ['follow', 'cinema', 'plane'].includes(d.mode)) d.overview(d.char?.root.position);
    if (tool === 'place') {
      this.ghost = makeGhostModel(this.game, opts.spec);
      this.game.scene.add(this.ghost);
    }
    this.game.emit('tool', tool);
  }
  clearPreview() {
    this.lineStart = null;
    this.hideLine?.();
    if (this.ghost) { this.game.scene.remove(this.ghost); this.ghost = null; }
    if (this.curvePreview) { this.game.scene.remove(this.curvePreview); this.curvePreview = null; }
    this.dots.clear();
    this.cursor.visible = false;
    this.marker.visible = false;
  }

  point(e) {
    const r = this.game.world.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.game.world.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(PLANE, p) ? p : null;
  }

  // ---------- mouse ----------
  down(e) {
    if (!this.tool || e.button !== 0) return;
    const p = this.point(e);
    if (!p) return;
    const t = this.tool, g = this.game;
    if (t === 'road' || t === 'erase') { this.lineStart = [tileOf(p.x), tileOf(p.z)]; this.lineEnd = this.lineStart; this.showLine(); return; }
    if (t === 'curve' || t === 'bridge') {
      const q = this.snap(p);
      this.pts.push(q);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.5), new THREE.MeshBasicMaterial({ color: '#ffcf3f' }));
      dot.position.set(q.x, .5, q.z);
      this.dots.add(dot);
      this.updateCurve(p);
      return;
    }
    if (PROP_TYPES[t]) {
      if (!g.world.inLand(tileOf(p.x), tileOf(p.z))) return;
      if (t === 'busstop') for (const old of g.props.list.filter(q => q.type === 'busstop')) g.props.remove(old); // only one bus stop
      g.props.add(t, Math.round(p.x * 2) / 2, Math.round(p.z * 2) / 2, this.rot * Math.PI / 2);
      g.emit('change');
      return;
    }
    if (t === 'place') {
      const s = this.ghostAt(p);
      if (!s.ok) return;
      const cb = this.opts.onPlace;
      this.setTool(null);
      cb?.(s);
    }
  }

  move(e) {
    if (!this.tool) return;
    const p = this.point(e);
    if (!p) return;
    this.lastPoint = p;
    const t = this.tool;
    if (t === 'road' || t === 'erase') {
      const i = tileOf(p.x), j = tileOf(p.z);
      if (this.lineStart) {
        // straight line from where you pressed: follow the longer direction
        const [a, c] = this.lineStart;
        this.lineEnd = Math.abs(i - a) >= Math.abs(j - c) ? [i, c] : [a, j];
        this.showLine();
      } else {
        this.cursor.visible = this.game.world.inLand(i, j);
        this.cursor.position.set(i * TILE, .25, j * TILE);
        this.cursor.material.color.set(t === 'road' ? '#ffcf3f' : '#ff3b30');
      }
    } else if (t === 'curve' || t === 'bridge') {
      this.updateCurve(p);
    } else if (PROP_TYPES[t]) {
      this.marker.visible = true;
      this.marker.position.set(Math.round(p.x * 2) / 2, 0, Math.round(p.z * 2) / 2);
    } else if (t === 'place') {
      this.ghostAt(p);
    }
  }

  // tiles of the straight line being drawn
  lineTiles() {
    const [a, c] = this.lineStart, [b, d] = this.lineEnd, out = [];
    const n = Math.max(Math.abs(b - a), Math.abs(d - c));
    for (let k = 0; k <= n; k++) out.push([a + Math.sign(b - a) * k, c + Math.sign(d - c) * k]);
    return out;
  }
  // preview: green = will be built, red = blocked (building / outside the land)
  showLine() {
    const g = this.game, tiles = this.lineTiles();
    while (this.linePool.length < tiles.length) {
      const m = new THREE.Mesh(this.cursor.geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .4, depthWrite: false }));
      g.scene.add(m);
      this.linePool.push(m);
    }
    this.cursor.visible = false;
    this.linePool.forEach((m, k) => {
      const tl = tiles[k];
      m.visible = !!tl;
      if (!tl) return;
      const [i, j] = tl, rec = g.tiles.get(i, j);
      const ok = this.tool === 'erase' || (g.world.inLand(i, j) && !(rec && rec.building != null));
      m.position.set(i * TILE, .26, j * TILE);
      m.material.color.set(this.tool === 'erase' ? '#ff3b30' : ok ? '#4cd964' : '#ff3b30');
    });
  }
  hideLine() { this.linePool.forEach(m => { m.visible = false; }); }
  up() {
    if (!this.lineStart) return;
    const g = this.game, tiles = this.lineTiles(), single = tiles.length === 1;
    for (const [i, j] of tiles) {
      if (this.tool === 'road') g.tiles.setRoad(i, j, true);
      else if (g.tiles.isRoad(i, j)) g.tiles.setRoad(i, j, false);
      else if (single) {
        // a single click on something that isn't a road: remove a curved road / lamp / tree there
        const x = i * TILE, z = j * TILE, p = this.lastPoint || { x, z };
        const cv = g.curves.nearest(p.x, p.z, 6);
        if (cv) g.curves.remove(cv);
        else { const pr = g.props.nearest(p.x, p.z, 2.5); if (pr) g.props.remove(pr); }
      }
    }
    this.lineStart = null;
    this.hideLine();
    g.emit('change');
  }
  // curved roads: points near an existing road snap onto it so the joint is clean
  snap(p) {
    const g = this.game, i = tileOf(p.x), j = tileOf(p.z);
    let best = null, bd = 7;
    for (let a = i - 1; a <= i + 1; a++) for (let c = j - 1; c <= j + 1; c++) {
      if (!g.tiles.isRoad(a, c)) continue;
      const d = Math.hypot(a * TILE - p.x, c * TILE - p.z);
      if (d < bd) { bd = d; best = { x: a * TILE, z: c * TILE }; }
    }
    return best || { x: Math.round(p.x), z: Math.round(p.z) };
  }

  // (old free painting, kept for reference: not used)
  paint(p) {
    const g = this.game, i = tileOf(p.x), j = tileOf(p.z);
    const doTile = (a, c) => {
      if (this.tool === 'road') { g.tiles.setRoad(a, c, true); return; }
      if (g.tiles.isRoad(a, c)) { g.tiles.setRoad(a, c, false); return; }
      const cv = g.curves.nearest(p.x, p.z, 6);
      if (cv) { g.curves.remove(cv); return; }
      const pr = g.props.nearest(p.x, p.z, 2.5);
      if (pr) g.props.remove(pr);
    };
    if (!this.last || this.tool === 'erase') doTile(i, j);
    else {
      let [a, c] = this.last;
      while (a !== i) { a += Math.sign(i - a); doTile(a, c); }
      while (c !== j) { c += Math.sign(j - c); doTile(a, c); }
    }
    this.last = [i, j];
    g.emit('change');
  }

  updateCurve(p) {
    if (this.curvePreview) this.game.scene.remove(this.curvePreview);
    const pts = [...this.pts];
    if (p) pts.push(this.snap(p));
    this.curvePreview = buildCurveMesh(pts, this.tool === 'bridge', true);
    this.game.scene.add(this.curvePreview);
  }
  finishCurve() {
    const pts = this.pts.filter((q, k, a) => k === 0 || Math.hypot(q.x - a[k - 1].x, q.z - a[k - 1].z) > 1);
    if (pts.length >= 2) { this.game.curves.add(pts, this.tool === 'bridge'); this.game.emit('change'); }
    const t = this.tool;
    this.setTool(t); // ready for the next one
  }

  // building ghost: snap to tiles, turn towards a road, green = OK / red = blocked
  ghostAt(p) {
    const g = this.game, spec = this.opts.spec;
    const anchor = rot => {
      const { rw, rd } = footprint(spec, 0, 0, rot);
      return { i: Math.round(p.x / TILE - (rw - 1) / 2), j: Math.round(p.z / TILE - (rd - 1) / 2), rw, rd };
    };
    let rot = this.rot;
    if (!this.manualRot) {
      for (const r of [this.rot, 0, 1, 2, 3]) {
        const a = anchor(r);
        if (canPlace(g, spec, a.i, a.j, r) && roadInFront(g, spec, a.i, a.j, r)) { rot = r; break; }
      }
    }
    const a = anchor(rot);
    const ok = canPlace(g, spec, a.i, a.j, rot);
    this.ghost.position.set((a.i + (a.rw - 1) / 2) * TILE, 0, (a.j + (a.rd - 1) / 2) * TILE);
    this.ghost.rotation.y = rot * Math.PI / 2;
    const m = ok ? GHOST_OK : GHOST_BAD;
    if (this.ghostOk !== ok) { this.ghost.traverse(o => { if (o.isMesh) o.material = m; }); this.ghostOk = ok; }
    this.rot = rot;
    return { ok, i: a.i, j: a.j, rot };
  }

  key(e) {
    if (!this.tool || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'Escape') {
      if ((this.tool === 'curve' || this.tool === 'bridge') && this.pts.length) { this.setTool(this.tool); return; }
      this.setTool(null);
    } else if (e.key === 'Enter') { if (this.tool === 'curve' || this.tool === 'bridge') this.finishCurve(); }
    else if (e.key === 'Backspace') { this.pts.pop(); this.dots.children.at(-1) && this.dots.remove(this.dots.children.at(-1)); this.updateCurve(); }
    else if (e.key.toLowerCase() === 'r') {
      this.rot = (this.rot + 1) % 4;
      this.manualRot = true;
      this.marker.rotation.y = this.rot * Math.PI / 2;
    }
  }
}
