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
    addEventListener('pointerup', () => { this.painting = false; this.last = null; });
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
    if (tool === 'place') {
      this.ghost = makeGhostModel(this.game, opts.spec);
      this.game.scene.add(this.ghost);
    }
    this.game.emit('tool', tool);
  }
  clearPreview() {
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
    if (t === 'road' || t === 'erase') { this.painting = true; this.last = null; this.paint(p); return; }
    if (t === 'curve' || t === 'bridge') {
      this.pts.push({ x: Math.round(p.x), z: Math.round(p.z) });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.5), new THREE.MeshBasicMaterial({ color: '#ffcf3f' }));
      dot.position.set(Math.round(p.x), .5, Math.round(p.z));
      this.dots.add(dot);
      this.updateCurve(p);
      return;
    }
    if (PROP_TYPES[t]) {
      if (!g.world.inLand(tileOf(p.x), tileOf(p.z))) return;
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
    const t = this.tool;
    if (t === 'road' || t === 'erase') {
      const i = tileOf(p.x), j = tileOf(p.z);
      this.cursor.visible = this.game.world.inLand(i, j);
      this.cursor.position.set(i * TILE, .25, j * TILE);
      this.cursor.material.color.set(t === 'road' ? '#ffcf3f' : '#ff3b30');
      if (this.painting) this.paint(p);
    } else if (t === 'curve' || t === 'bridge') {
      this.updateCurve(p);
    } else if (PROP_TYPES[t]) {
      this.marker.visible = true;
      this.marker.position.set(Math.round(p.x * 2) / 2, 0, Math.round(p.z * 2) / 2);
    } else if (t === 'place') {
      this.ghostAt(p);
    }
  }

  // roads: paint tiles along the mouse path (fills gaps so the road stays connected)
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
    if (p) pts.push({ x: Math.round(p.x), z: Math.round(p.z) });
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
