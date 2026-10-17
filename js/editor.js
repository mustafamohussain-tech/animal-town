// Mouse tools on the map: draw roads, curved roads, bridges, place lamps / traffic lights / trees,
// erase, and choose where a building goes (see-through "ghost").
// While a tool is active: left mouse = use the tool, right mouse = turn the camera, wheel = zoom.
import * as THREE from 'three';
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { buildCurveMesh } from './curves.js';
import { previewWater, RIVER_W } from './water.js';
import { PROP_TYPES } from './props.js';
import { t, t as i18n } from './i18n.js';
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
    this.riverWidth = RIVER_W.medium;
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
    addEventListener('pointerup', e => {
      if (e.button === 2) return;
      if (this.ldown && e.button === 0) {
        const moved = Math.hypot(e.clientX - this.ldown.x, e.clientY - this.ldown.y);
        this.ldown = null;
        if (moved < 6) this.click(e);
        return;
      }
      this.up();
    });
    // right click (without dragging) = cancel: the building being placed, the line or points being drawn, or the tool
    el.addEventListener('pointerdown', e => { if (e.button === 2) this.rdown = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', e => {
      if (e.button !== 2 || !this.rdown) return;
      const moved = Math.hypot(e.clientX - this.rdown.x, e.clientY - this.rdown.y);
      this.rdown = null;
      if (moved < 6 && this.tool) this.cancel();
    });
    this.linePool = [];
    el.addEventListener('dblclick', () => { if (this.pathTool) this.finishCurve(); });
    el.addEventListener('contextmenu', e => { if (this.tool) e.preventDefault(); });
    addEventListener('keydown', e => this.key(e));
  }

  // ---------- switching tools ----------
  cancel() {
    if (this.lineStart) { this.lineStart = null; this.hideLine(); return; }
    if (this.pathTool && this.pts.length) { this.setTool(this.tool); return; }   // drop the points drawn so far
    const wasPlace = this.tool === 'place';
    this.setTool(null);
    this.game.log(i18n(wasPlace ? 'placeCancelled' : 'toolOff'));
  }
  // tools drawn with points: curved road, bridge, river, lake
  get pathTool() { return ['curve', 'bridge', 'river', 'lake'].includes(this.tool); }
  get waterTool() { return this.tool === 'river' || this.tool === 'lake'; }
  setTool(tool, opts = {}) {
    this.clearPreview();
    this.pts = [];
    this.tool = tool;
    this.opts = opts;
    this.manualRot = false;
    const ctl = this.game.world.controls;
    // with a tool the left button builds; right still turns, the middle button moves the map
    ctl.mouseButtons.LEFT = tool && (tool === 'road' || tool === 'erase') ? -1 : THREE.MOUSE.PAN;
    ctl.mouseButtons.MIDDLE = tool ? THREE.MOUSE.PAN : THREE.MOUSE.DOLLY;
    ctl.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
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
  // roads / eraser draw while the left button is held; every other tool acts on a click,
  // so dragging with the left button still moves the map
  get dragTool() { return this.tool === 'road' || this.tool === 'erase'; }
  down(e) {
    if (!this.tool || e.button !== 0) return;
    if (!this.dragTool) { this.ldown = { x: e.clientX, y: e.clientY }; return; }
    const p = this.point(e);
    if (!p) return;
    this.lineStart = [tileOf(p.x), tileOf(p.z)];
    this.lineEnd = this.lineStart;
    this.showLine();
  }
  click(e) {
    if (!this.tool) return;
    const p = this.point(e);
    if (!p) return;
    const t = this.tool, g = this.game;
    if (this.pathTool) {
      const q = this.waterTool ? { x: Math.round(p.x), z: Math.round(p.z) } : this.snap(p);
      // points outside the town land are pulled back to its edge (not dropped)
      if (this.waterTool) { const h = g.world.landHalf - 1; q.x = Math.max(-h, Math.min(h, q.x)); q.z = Math.max(-h, Math.min(h, q.z)); }
      this.pts.push(q);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.5), new THREE.MeshBasicMaterial({ color: '#ffcf3f' }));
      dot.position.set(q.x, .5, q.z);
      this.dots.add(dot);
      this.updateCurve(p);
      return;
    }
    if (PROP_TYPES[t]) {
      const s = this.propSpot(t, p);
      if (!s.ok) { if (s.why) g.emit('toolmsg', s.why); return; }
      const olds = t === 'busstop' ? g.props.list.filter(q => q.type === 'busstop').map(q => ({ ...q })) : [];
      for (const o of olds) g.props.remove(g.props.list.find(q => q.id === o.id)); // only one bus stop
      let ref = g.props.add(t, s.x, s.z, s.rot);
      g.history.push(i18n('tool_' + t),
        () => { g.props.remove(ref); for (const o of olds) g.props.add(o.type, o.x, o.z, o.rot, { id: o.id, scale: o.scale }); },
        () => { for (const o of olds) { const q = g.props.list.find(x => x.id === o.id); if (q) g.props.remove(q); } ref = g.props.add(t, s.x, s.z, s.rot, { scale: ref.scale }); });
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
    } else if (this.pathTool) {
      this.updateCurve(p);
    } else if (PROP_TYPES[t]) {
      // shows where it will really stand (snapped to the sidewalk / junction corner), red = not allowed here
      const s = this.propSpot(t, p);
      this.marker.visible = true;
      this.marker.position.set(s.x, 0, s.z);
      this.marker.traverse(o => o.material?.color.set(s.ok ? '#4cd964' : '#ff3b30'));
    } else if (t === 'place') {
      this.ghostAt(p);
    }
  }

  // where a street object may stand:
  //  lamp / bench / bus stop -> on the sidewalk beside a road (snapped, facing the road)
  //  traffic light           -> only on the corners of a crossing / T-junction
  //  tree / flowers          -> anywhere except on the road
  propSpot(type, p) {
    const g = this.game, T = g.tiles, H = TILE / 2;
    const i = tileOf(p.x), j = tileOf(p.z);
    const free = { ok: true, x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2, rot: this.rot * Math.PI / 2 };
    const bad = why => ({ ok: false, x: free.x, z: free.z, why });
    if (!g.world.inLand(i, j)) return bad('');
    const busy = (x, z) => { const r = T.get(tileOf(x), tileOf(z)); return r && r.building != null; };

    if (type === 'traffic') {
      let best = null, bd = 11;
      for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
        if (!T.isJunction(a, b)) continue;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          if (T.isRoad(a + sx, b + sz)) continue;
          const x = a * TILE + sx * (H + .8), z = b * TILE + sz * (H + .8);
          const d = Math.hypot(x - p.x, z - p.z);
          // each corner faces one of the two roads, so the lights take turns
          if (d < bd && !busy(x, z)) { bd = d; best = { ok: true, x, z, rot: sx * sz > 0 ? (sx > 0 ? -Math.PI / 2 : Math.PI / 2) : (sz > 0 ? Math.PI : 0) }; }
        }
      }
      return best || bad(t('propJunction'));
    }

    if (type === 'lamp' || type === 'bench' || type === 'busstop') {
      const off = type === 'lamp' ? .6 : .9;
      let best = null, bd = T.onAsphalt(p.x, p.z) ? 9 : type === 'busstop' ? 7 : 3.5;
      for (let a = i - 2; a <= i + 2; a++) for (let b = j - 2; b <= j + 2; b++) {
        if (!T.isRoad(a, b)) continue;
        for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          if (T.isRoad(a + di, b + dj)) continue;
          // the sidewalk along this edge of the road tile
          const cx = a * TILE + di * (H - off), cz = b * TILE + dj * (H - off);
          const along = di ? Math.max(-H + 1.2, Math.min(H - 1.2, p.z - b * TILE)) : Math.max(-H + 1.2, Math.min(H - 1.2, p.x - a * TILE));
          const x = di ? cx : a * TILE + Math.round(along * 2) / 2, z = di ? b * TILE + Math.round(along * 2) / 2 : cz;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < bd) { bd = d; best = { ok: true, x, z, rot: Math.atan2(-di, -dj) }; }
        }
      }
      if (best) return best;
      if (type === 'busstop' || T.onAsphalt(p.x, p.z)) return bad(t('propRoadside'));
      return busy(p.x, p.z) ? bad('') : free;   // a lamp or bench in a park is fine
    }

    if (T.onAsphalt(p.x, p.z)) return bad(t('propOffRoad'));
    return busy(p.x, p.z) ? bad('') : free;
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
    const g = this.game, tiles = this.lineTiles(), single = tiles.length === 1, on = this.tool === 'road', changed = [];
    for (const [i, j] of tiles) {
      if (on) { if (g.tiles.setRoad(i, j, true)) changed.push([i, j]); }
      else if (g.tiles.isRoad(i, j)) { if (g.tiles.setRoad(i, j, false)) changed.push([i, j]); }
      else if (single) {
        // a single click on something that isn't a road: remove a curved road / water / lamp / tree there
        const x = i * TILE, z = j * TILE, p = this.lastPoint || { x, z };
        const cv = g.curves.nearest(p.x, p.z, 6);
        const wt = !cv && g.water.list.find(w => g.water.wetIn(w, p.x, p.z, 1));
        if (cv) {
          let ref = cv;
          g.curves.remove(cv);
          g.history.push(i18n(cv.bridge ? 'tool_bridge' : 'tool_curve'), () => { ref = g.curves.add(ref.pts, ref.bridge, { id: ref.id }); }, () => g.curves.remove(ref));
        } else if (wt) {
          let ref = wt;
          const d = { kind: wt.kind, pts: wt.pts, width: wt.width };
          g.water.remove(wt);
          g.history.push(i18n('tool_' + wt.kind), () => { ref = g.water.add(d, { id: ref.id }); }, () => g.water.remove(ref));
        } else {
          const pr = g.props.nearest(p.x, p.z, 2.5);
          if (pr) {
            const o = { ...pr };
            let ref = pr;
            g.props.remove(pr);
            g.history.push(i18n('tool_' + o.type), () => { ref = g.props.add(o.type, o.x, o.z, o.rot, { id: o.id, natural: o.natural, scale: o.scale }); }, () => g.props.remove(ref));
          }
        }
      }
    }
    if (changed.length) {
      g.history.push(i18n(on ? 'h_road' : 'h_erase', { n: changed.length }),
        () => changed.forEach(([i, j]) => g.tiles.setRoad(i, j, !on)),
        () => changed.forEach(([i, j]) => g.tiles.setRoad(i, j, on)));
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
    if (p) pts.push(this.waterTool ? { x: Math.round(p.x), z: Math.round(p.z) } : this.snap(p));
    this.curvePreview = this.waterTool ? previewWater(this.tool, pts, this.riverWidth) : buildCurveMesh(pts, this.tool === 'bridge', true);
    this.game.scene.add(this.curvePreview);
  }
  finishCurve() {
    const g = this.game, tool = this.tool;
    const pts = this.pts.filter((q, k, a) => k === 0 || Math.hypot(q.x - a[k - 1].x, q.z - a[k - 1].z) > 1);
    if (this.waterTool) {
      if (pts.length >= (tool === 'lake' ? 3 : 2)) {
        const d = { kind: tool, pts, width: this.riverWidth };
        const w = g.water.add(d);
        // water may not cover buildings
        // only refused when the water really covers a building (passing close by is fine);
        // the points stay, so you can move them (Backspace) and finish again
        const hit = w && [...g.tiles.tiles.entries()].find(([k, r]) => r.building != null && g.water.tileWet(...k.split(',').map(Number), 0));
        if (hit) {
          g.water.remove(w);
          const b = g.town.get(hit[1].building);
          g.emit('toolmsg', i18n('waterOnBuilding', { b: b ? b.displayName() : '' }));
          return;
        }
        else if (w) {
          let ref = w;
          g.history.push(i18n('tool_' + tool), () => g.water.remove(ref), () => { ref = g.water.add(d, { id: ref.id }); });
          g.emit('change');
        }
      } else { g.emit('toolmsg', i18n(tool === 'lake' ? 'needLakePts' : 'needRiverPts')); return; }
    } else if (pts.length >= 2) {
      let ref = g.curves.add(pts, tool === 'bridge');
      g.history.push(i18n('tool_' + tool), () => g.curves.remove(ref), () => { ref = g.curves.add(ref.pts, ref.bridge, { id: ref.id }); });
      g.emit('change');
    }
    this.setTool(tool); // ready for the next one
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
      if (this.pathTool && this.pts.length) { this.setTool(this.tool); return; }
      this.setTool(null);
    } else if (e.key === 'Enter') { if (this.pathTool) this.finishCurve(); }
    else if (e.key === 'Backspace') { this.pts.pop(); this.dots.children.at(-1) && this.dots.remove(this.dots.children.at(-1)); this.updateCurve(); }
    else if (e.key.toLowerCase() === 'r') {
      this.rot = (this.rot + 1) % 4;
      this.manualRot = true;
      this.marker.rotation.y = this.rot * Math.PI / 2;
    }
  }
}
