// The game: holds the world, town, citizens, roads, clock and camera; runs orders and events.
import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { DayNight } from './daynight.js';
import { TileMap } from './tiles.js';
import { Props } from './props.js';
import { Curves } from './curves.js';
import { Vehicles, CAR_TYPES } from './vehicles.js';
import { foundedAt } from './save.js';
import { Events } from './events.js';
import { BusService } from './bus.js';
import { Water } from './water.js';
import { History } from './history.js';
import { Paths } from './paths.js';
import { Parks } from './parks.js';
import { Traffic } from './traffic.js';
import { Chunks, LandMap, BuildingProxies, TreeProxies } from './lod.js';
import { Flights } from './airport.js';
import { Town, TYPES, makeSpec, autoPlace } from './buildings.js';
import { FH } from './buildgen.js';
import { Character } from './character.js';
import { CameraDirector } from './camera.js';
import { Editor } from './editor.js';
import { JOBS } from './jobs.js';
import { buildAct, wait, call, actionActs } from './behavior.js';
import { t } from './i18n.js';
import { pick, dist2d, clamp } from './util.js';

const normName = n => String(n || '').trim().replace(/^@+/, '').toLowerCase();
// only this many residents (the nearest to the camera) have a 3D body and act at the same time
const AWAKE_R = 65, AWAKE_MAX = 120, TAGS_MAX = 45, TAGS_R = 90, SHADOW_R = 45;
const SEATED = new Set(['pray', 'sit', 'eat', 'lie', 'sleep', 'sleepGround', 'sitGround', 'stir', 'sell', 'point', 'fish', 'heal', 'hoe', 'hammer']);

export class Game {
  constructor(frame) {
    this.frame = frame;
    this.world = new World(frame);
    this.scene = this.world.scene;
    // big towns: full detail only near the camera (lod.js)
    this.chunks = new Chunks(this);
    this.proxies = new BuildingProxies(this);
    this.treeProxies = new TreeProxies(this);
    this.landMap = new LandMap(this);
    this.world.useLandMap(this.landMap.tex);
    this.chunks.onChange(L => { if (L.has('prop')) this.treeProxies.mark(); });
    this.awake = new Set();          // residents that have a body right now
    this.charById = new Map();
    this.charByName = new Map();
    this.effects = new Effects(this.scene);
    this.daynight = new DayNight(this.world);
    this.tiles = new TileMap(this);
    this.props = new Props(this);
    this.curves = new Curves(this);
    this.water = new Water(this);
    this.paths = new Paths(this);
    this.parks = new Parks(this);
    this.traffic = new Traffic(this);
    this.flights = new Flights(this);   // planes of the airports
    this.history = new History(this);
    this.vehicles = new Vehicles(this);
    this.events = new Events(this);
    this.bus = new BusService(this);
    this.founded = foundedAt();   // day 1 of the town (never reset)
    this.screenMode = 'phone';   // phone (9:16) | pc (16:9) | fill
    this.town = new Town(this);
    this.chars = [];
    this.time = 0;
    this.selected = null;
    this.selectedBuilding = null;
    this.followNew = true;
    this.nightSleep = true;
    this.showCard = true;
    this.buildDuration = 7 * 86400000; // how long a construction takes (real time)       // resident profile card on screen
    this.choosePlace = false;   // when true, typed build commands also let you pick the spot
    this.handlers = {};
    this.bannerEl = frame.querySelector('#banners');
    this.raycaster = new THREE.Raycaster();
    this.director = new CameraDirector(this);
    this.editor = new Editor(this);
    this.viewTimer = 0;
    this.setupPicking();
  }

  // a fresh town: a cross of roads in the middle and some wild trees
  newTown() {
    for (let k = -3; k <= 3; k++) { this.tiles.setRoad(k, 0, true); this.tiles.setRoad(0, k, true); }
    this.props.sprinkle(2, this.world.landR);
    this.bus.ensureStop();
  }
  expandLand(n = 3) {
    const old = this.world.landR;
    this.world.setLand(old + n);
    if (this.world.landR === old) return this.log(t('maxLand'));
    this.landMap.mark();
    this.props.sprinkle(old + 1, this.world.landR);
    this.emit('change');
    return this.announce(t('expanded', { n: this.world.landR * 2 + 1 }));
  }

  // ---------- events for the UI ----------
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, data) { (this.handlers[ev] || []).forEach(f => f(data)); }
  log(msg) { this.emit('log', msg); return msg; }
  banner(text) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.textContent = text;
    el.dir = 'auto';
    this.bannerEl.appendChild(el);
    while (this.bannerEl.children.length > 3) this.bannerEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3300);
    setTimeout(() => el.remove(), 3900);
  }
  announce(msg) { this.banner(msg); return this.log(msg); }

  // ---------- citizens ----------
  findChar(name) { const n = normName(name); return n ? this.charByName.get(n) || null : null; }
  getChar(id) { return id == null ? null : this.charById.get(id) || null; }

  addCharacter(d, announce = true) {
    const raw = String(d.name || '').trim().replace(/^@+/, '').slice(0, 24);
    if (!raw) return { error: t('needName') };
    if (this.findChar(raw)) return { error: t('nameTaken', { name: '@' + raw }) };
    const c = new Character(this, { ...d, name: '@' + raw });
    const home = this.town.get(c.homeId);
    // people appear at home, or next to the bus stop
    const geo = this.bus.geometry();
    // a big town being loaded: residents without a finished home wait somewhere in town (not all at the bus stop)
    const any = !announce && !home?.complete && this.town.all.length > 30 ? this.town.all[Math.random() * this.town.all.length | 0] : null;
    const p = home?.complete ? home.spot('door') : any ? any.toWorld(0, any.D / 2 + 2.6) : geo ? geo.spot(Math.random() * 3) : this.world.spawnPoint();
    c.root.position.set(p.x, 0, p.z);
    this.chars.push(c);
    this.charById.set(c.id, c);
    this.charByName.set(normName(c.name), c);
    if (announce) {
      c.wake();   // a new follower is always shown
      this.effects.emit('confetti', { x: p.x, y: 2.6, z: p.z }, 50);
      this.effects.emit('sparkle', { x: p.x, y: 1.5, z: p.z }, 8);
      this.announce(t('joined', { name: c.name }));
      // they arrive on the bus, step off and wave
      const byBus = this.bus.arrive(c);
      // off the bus: wave at the stop and only walk away once the bus has gone (never through it)
      const busGone = { name: 'busgone', update: () => !['stopped', 'leaving'].includes(this.bus.state) };
      c.command([...(byBus ? [{ name: 'bus', update: x => !x.inBus }] : []), wait(2.5, 'wave', { onStart: x => x.say('👋') }), ...(byBus ? [busGone] : [])], false);
      if (this.followNew) this.select(c, true);
      this.giveHomes();
      this.emit('joined', c);
    }
    this.emit('change');
    return c;
  }

  removeCharacter(c) {
    if (!this.chars.includes(c)) return;
    if (this.selected === c) this.select(null);
    for (const b of this.town.all) {
      if (b.ownerId === c.id) { b.ownerId = null; b.refreshText(); }
      b.residents = b.residents.filter(id => id !== c.id);
    }
    c.dispose();
    this.chars.splice(this.chars.indexOf(c), 1);
    this.charById.delete(c.id);
    this.charByName.delete(normName(c.name));
    this.log(t('removed', { name: c.name }));
    this.emit('change');
  }

  select(c, follow = false) {
    if (this.selected) this.selected.setSelected(false);
    this.selected = c;
    if (c) {
      c.setSelected(true);
      this.selectedBuilding = null;
      if (follow) this.director.setMode('follow', { char: c });
    }
    this.emit('select', c);
  }
  selectBuilding(b) {
    if (this.selected) this.selected.setSelected(false);
    this.selected = null;
    this.selectedBuilding = b;
    this.emit('select', null);
  }
  cinematic(c) { if (c) { this.select(c); this.director.setMode('cinema', { char: c }); } }

  nearestChar(c, filter = () => true) {
    let best = null, bd = Infinity;
    for (const o of this.awake) {
      if (o === c || !filter(o)) continue;
      const d = dist2d(o.root.position, c.root.position);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  nearbyIdle(c, r) {
    return this.nearestChar(c, o => !o.commanded && !o.queue.length && o.activity?.name === 'idle' && !o.hurt && !o.upstairs &&
      !o.chatWith && dist2d(o.root.position, c.root.position) < r);
  }

  // ---------- homes ----------
  giveHomes() {
    // apartments take in homeless citizens; houses belong to whoever they were built for
    const homeless = this.chars.filter(c => c.homeId == null || !this.town.get(c.homeId));
    if (!homeless.length) return;
    let k = 0;
    for (const b of this.town.all) {
      if (k >= homeless.length) break;
      if (!b.complete || b.spec.role !== 'apartment') continue;
      const cap = Math.max(1, b.capacity());
      while (b.residents.length < cap && k < homeless.length) {
        const c = homeless[k++];
        b.residents.push(c.id);
        c.homeId = b.id;
      }
    }
  }
  moveIn(c, b) {
    for (const o of this.town.all) o.residents = o.residents.filter(id => id !== c.id);
    if (!b.residents.includes(c.id)) b.residents.unshift(c.id);
    c.homeId = b.id;
  }

  // ---------- jobs ----------
  workplaceFor(c) {
    const type = JOBS[c.job]?.place;
    if (!type) return null;
    const cur = this.town.get(c.workplaceId);
    // hired at one exact building (or by its owner): only work there
    if (c.workPinned) {
      if (cur) return cur.complete && cur.alive ? cur : null;
      c.workPinned = false;
    }
    if (cur && cur.kind === type && cur.complete && cur.alive) return cur;
    const options = this.town.of(type);
    if (!options.length) return null;
    // close to where they are, and not too crowded (in a big town the far side is a long trip)
    const score = b => dist2d(b.center, c.root.position) + this.workerCount(b) * 30;
    options.sort((a, b) => score(a) - score(b));
    c.workplaceId = options[0].id;
    return options[0];
  }
  // who works where (counted again at most once a second: fast with thousands of residents)
  staffOf(b) {
    if (!this.staff || this.time - this.staffAt > 1) {
      this.staff = new Map();
      this.staffAt = this.time;
      for (const x of this.chars) if (x.workplaceId != null) (this.staff.get(x.workplaceId) || this.staff.set(x.workplaceId, []).get(x.workplaceId)).push(x);
    }
    return (this.staff.get(b.id) || []).filter(x => x.workplaceId === b.id);
  }
  workerCount(b) { return this.staffOf(b).length; }
  workerIndex(c, b) { return this.staffOf(b).sort((a, z) => a.id - z.id).indexOf(c); }
  workerAt(b) { return this.staffOf(b).find(x => x.activity?.name === 'work') || null; }
  jobLabel(job) { return t('job_' + job); }

  // the job a building offers (null = nobody works there)
  jobAt(b) { return (b && Object.keys(JOBS).find(k => JOBS[k].place === b.kind)) || null; }
  // a business someone owns, for "@ali work for @sara"
  businessOf(owner, kind) {
    const list = this.town.all.filter(b => b.ownerId === owner.id && this.jobAt(b) && (!kind || b.kind === kind));
    return list.sort((a, z) => z.complete - a.complete)[0] || null;
  }
  // c works at this exact building (for its owner, if it has one)
  hire(c, b) {
    const job = this.jobAt(b);
    if (!job) return this.log(t('cantHire', { b: b.displayName() }));
    const boss = this.getChar(b.ownerId);
    const msg = boss && boss !== c ? t('hiredFor', { name: c.name, o: boss.name, b: b.displayName(), emoji: JOBS[job].emoji })
      : t('hired', { name: c.name, b: b.displayName(), emoji: JOBS[job].emoji });
    if (b.complete) {
      c.setJob(job);
      c.workplaceId = b.id;
      c.workPinned = true;
      c.pendingJob = null;
      c.command([wait(1.6, 'cheer', { onStart: x => x.say(JOBS[job].emoji) })]);
    } else {
      // not open yet: they help build it and start working when it opens
      c.pendingJob = { job, buildingId: b.id };
      c.command([buildAct(b), wait(2, 'cheer', { onStart: x => x.say('🔨') })]);
    }
    this.emit('change');
    return this.announce(msg);
  }

  assignJob(c, job) {
    if (!JOBS[job]) return null;
    if (job === 'none') {
      c.setJob('none');
      c.command([wait(1.5, 'idle', { onStart: x => x.say('😌') })]);
      this.emit('change');
      return this.log(t('quit', { name: c.name }));
    }
    const place = JOBS[job].place;
    const done = x => {
      x.setJob(job);
      this.emit('change');
      return this.announce(t('nowJob', { name: x.name, job: this.jobLabel(job), emoji: JOBS[job].emoji }));
    };
    if (!place || this.town.has(place) || (job === 'fisher' && this.water.list.length)) {
      c.command([wait(1.6, 'cheer', { onStart: x => x.say(JOBS[job].emoji) })]);
      return done(c);
    }
    // the workplace doesn't exist yet: this citizen builds it first, then starts the job
    let site = this.town.of(place, false).find(b => !b.complete);
    if (!site) {
      const spec = makeSpec(place);
      const spot = autoPlace(this, spec);
      if (!spot) return this.log(t('noSpace'));
      site = this.town.create(spec, spot.i, spot.j, spot.rot, { builtBy: c.id });
    }
    // the job starts when the building is finished (it takes real time now)
    c.pendingJob = { job, buildingId: site.id };
    c.command([buildAct(site), wait(2, 'cheer', { onStart: x => x.say('🔨') })]);
    this.emit('change');
    return this.log(t('needsPlace', { name: c.name, b: site.displayName(), job: this.jobLabel(job) }));
  }

  // ---------- building ----------
  pickBuilder() {
    if (this.selected) return this.selected;
    const builders = this.chars.filter(c => c.job === 'builder' && !c.commanded);
    if (builders.length) return pick(builders);
    return this.chars.length ? pick(this.chars) : null;
  }

  // spec = a design (makeSpec / custom). ask = let the player choose the spot with the ghost.
  // "build a park": a natural park (drawn shape, plants itself) around a free spot
  makeParkNear(near) {
    const s = autoPlace(this, makeSpec('park'));
    if (!s) return this.log(t('noSpace'));
    const cx = s.i * 12, cz = s.j * 12, pts = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, r = 11 + Math.random() * 4; pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    let ref = this.parks.add(pts, { plant: true });
    this.history.push(t('tool_parkzone'), () => this.parks.remove(ref, true), () => { ref = this.parks.add(pts, { plant: true }); });
    this.emit('change');
    return this.announce(t('parkMade'));
  }
  orderBuild(c, spec, owner, ask = false) {
    if (spec.type === 'park') return this.makeParkNear(c?.root.position);
    c ||= this.pickBuilder();
    if (!c) return this.log(t('notFound'));
    if (ask || this.choosePlace) {
      this.editor.setTool('place', { spec, onPlace: s => this.placeBuilding(spec, s, c, owner) });
      return this.log(t('choosePlace'));
    }
    const s = autoPlace(this, spec);
    if (!s) return this.log(t('noSpace'));
    return this.placeBuilding(spec, s, c, owner);
  }
  placeBuilding(spec, s, c, owner) {
    const b = this.town.create(spec, s.i, s.j, s.rot, { builtBy: c?.id });
    // shops, restaurants, farms and custom buildings belong to whoever they were built for
    if (['shop', 'restaurant', 'farm'].includes(spec.type) || (spec.type === 'custom' && !['home', 'apartment', 'hospital', 'school', 'police'].includes(spec.role))) {
      const o = owner || c;
      if (o) b.ownerId = o.id;
    }
    if (spec.role === 'home') {
      const o = owner || c;
      if (o) { b.ownerId = o.id; this.moveIn(o, b); }
    }
    b.refreshText();   // the sign shows the owner's name
    if (c && this.chars.includes(c)) c.command([buildAct(b), wait(2, 'cheer', { onStart: x => x.say('🎉') })]);
    let ref = b;
    this.history.push(b.displayName(), () => this.demolish(ref), () => { ref = this.restoreBuilding(ref.toJSON()); });
    this.emit('change');
    return this.log(t('building1', { name: c?.name || '', b: b.displayName() }));
  }
  // put a building back exactly as it was (undo)
  restoreBuilding(j) {
    const b = this.town.create(j.spec, j.i, j.j, j.rot, { id: j.id, progress: j.progress, startedAt: j.startedAt, duration: j.duration, ownerId: j.ownerId, builtBy: j.builtBy, residents: j.residents, crops: j.crops });
    for (const id of b.residents) { const c = this.getChar(id); if (c && !this.town.get(c.homeId)) c.homeId = b.id; }
    this.emit('change');
    return b;
  }
  demolish(b) {
    if (!this.history.busy) {
      const j = b.toJSON();
      let ref = null;
      this.history.push(t('h_demolish', { b: b.displayName() }), () => { ref = this.restoreBuilding(j); }, () => ref && this.demolish(ref));
    }
    for (const c of this.chars) {
      if (c.pendingJob?.buildingId === b.id) c.pendingJob = null;
      if (c.homeId === b.id) c.homeId = null;
      if (c.workplaceId === b.id) c.workplaceId = null;
      if (c.upstairs === b) { c.upstairs = null; c.root.position.y = 0; }
    }
    if (this.selectedBuilding === b) this.selectedBuilding = null;
    if (this.director.building === b) this.director.setMode('free');
    this.town.remove(b);
    this.emit('change');
  }

  onBuilt(b) {
    this.announce(t('built', { emoji: b.emoji, b: b.displayName() }));
    for (const c of this.chars) {
      if (c.pendingJob?.buildingId !== b.id) continue;
      const job = c.pendingJob.job;
      c.pendingJob = null;
      c.setJob(job);
      c.workplaceId = b.id;
      c.workPinned = true;
      this.announce(t('nowJob', { name: c.name, job: this.jobLabel(job), emoji: JOBS[job].emoji }));
    }
    const job = Object.keys(JOBS).find(j => JOBS[j].place === b.kind);
    if (job && this.town.of(b.kind).length === 1) {
      setTimeout(() => this.announce(t('unlocked', { emoji: JOBS[job].emoji, job: this.jobLabel(job) })), 900);
    }
    this.giveHomes();
    this.emit('change');
  }

  // ---------- events ----------
  startFire(b) {
    if (!b) {
      const list = this.town.all.filter(x => x.complete && !x.fire && TYPES[x.type]?.canBurn !== false);
      if (!list.length) return this.log(t('noFireTarget'));
      b = pick(list);
    }
    if (!b.startFire()) return this.log(t('noFireTarget'));
    const msg = this.announce(t('fireAt', { b: b.displayName() }));
    for (const c of this.chars) {
      if (c.job === 'firefighter') c.interrupt();
      else if (dist2d(c.root.position, b.center) < 18) c.say('😱', 2.5);
    }
    if (!this.chars.some(c => c.job === 'firefighter')) setTimeout(() => this.log(t('noFirefighter')), 600);
    this.emit('change');
    return msg;
  }
  onFireOut() { this.announce(t('fireOut')); this.emit('change'); }

  hurt(c) {
    if (c.hurt) return null;
    c.setHurt(true);
    c.command([wait(1.5, 'hurt', { onStart: x => x.say('🤕') })], false);
    this.emit('change');
    return this.announce(t('hurt', { name: c.name }));
  }
  heal(c) {
    if (!c.hurt) return null;
    c.setHurt(false);
    c.patientBed = null;
    c.interrupt();
    this.effects.emit('heart', { x: c.root.position.x, y: c.root.position.y + 2.6, z: c.root.position.z }, 6);
    c.say('💚', 2.5);
    this.emit('change');
    return this.announce(t('healed', { name: c.name }));
  }

  doAction(c, a, o = {}) {
    if (a === 'hurt') return this.hurt(c);
    if (a === 'heal') return this.heal(c);
    if (a === 'quit') return this.assignJob(c, 'none');
    if (a === 'car') return this.giveCar(c, o.type);
    if (a === 'cinema') { this.cinematic(c); return this.log(t('cinemaOn', { name: c.name })); }
    const acts = actionActs(c, a, o);
    if (!acts) {
      if (a === 'home') return this.log(t('noHome', { name: c.name }));
      const type = a === 'buy' ? 'shop' : o.type;
      const name = type === 'shop' && o.variant ? t('b_shop_' + o.variant) : t('b_' + (type || 'shop'));
      return this.log(t('noPlace', { b: name }));
    }
    c.command(acts);
    return this.log(t('doing', { name: c.name, a: t('a_' + a) }));
  }

  sayText(c, text) {
    const s = String(text).slice(0, 80);
    c.say(s, 6);
    return this.log(t('said', { name: c.name, text: s }));
  }

  // the town's age in days (day 1 = the day it started)
  get day() {
    const a = new Date(this.founded), b = new Date();
    const d0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()), d1 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.max(1, Math.round((d1 - d0) / 86400000) + 1);
  }

  giveCar(c, type) {
    if (this.vehicles.ofOwner(c.id).length >= 3) return this.log(t('tooManyCars', { name: c.name }));
    const v = this.vehicles.add(c.id, { type: CAR_TYPES.includes(type) ? type : undefined });
    c.say('🚗', 3);
    this.emit('change');
    return this.announce(t('gotCar', { name: c.name, car: t('car_' + v.type) }));
  }

  setOwner(b, c) {
    b.ownerId = c ? c.id : null;
    if (c && b.spec.role === 'home') this.moveIn(c, b);
    b.refreshText();
    this.emit('change');
  }

  setHour(h) { this.daynight.setHour(h); }

  // ---------- picking with the mouse ----------
  setupPicking() {
    const el = this.world.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
    el.addEventListener('pointerup', e => {
      if (!down || this.editor.tool || down.b !== 0) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 6) this.pick(e);
    });
  }
  pick(e) {
    const r = this.world.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.world.camera);
    const hits = this.raycaster.intersectObjects([...this.awake].filter(c => c.root.visible).map(c => c.root), true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && o.userData.charId == null) o = o.parent;
      const c = o && this.getChar(o.userData.charId);
      if (c) { this.select(c, true); this.emit('picked', c); return; }
    }
    const near = [...this.town.awake];
    const bh = this.raycaster.intersectObjects(near.map(b => b.group), true);
    const far = this.proxies.pick(this.raycaster);
    for (const h of bh) {
      if (!h.object.visible) continue;
      if (far && far.distance < h.distance) break;
      let o = h.object;
      while (o && !near.some(b => b.group === o)) o = o.parent;
      const b = near.find(x => x.group === o);
      if (b) { this.selectBuilding(b); this.emit('picked', b); return; }
    }
    // a far building (a simple block)
    if (far?.b) { this.selectBuilding(far.b); this.emit('picked', far.b); }
  }

  // ---------- per frame ----------
  update(dt) {
    this.time += dt;
    const tm = this.time;
    this.daynight.update(dt);
    this.chunks.update(dt);
    this.landMap.update(dt);
    this.treeProxies.update(dt);
    this.updateAwake(dt);
    for (const c of this.awake) c.update(dt, tm);
    this.separate();
    this.town.update(dt, tm);
    this.props.update(dt, tm);
    this.vehicles.update(dt);
    this.events.update(dt);
    this.water.update(dt);
    this.traffic.update(dt);
    this.flights.update(dt);
    this.bus.update(dt);
    this.effects.update(dt);
    this.world.update(dt);
    this.director.update(dt);
    this.updateViews(dt);
    this.collectLabels();
  }
  // the page elements above heads (names, speech, building sites, drivers): listed here so the
  // label renderer doesn't walk through every object of the town each frame
  collectLabels() {
    const L = this.world.labelScene ||= { matrixWorldAutoUpdate: false, children: [], traverse(fn) { for (const o of this.children) fn(o); } };
    const out = L.children;
    out.length = 0;
    for (const c of this.awake) if (c.tagged && c.label) out.push(c.label, c.bubble);
    for (const b of this.town.awake) if (b.siteLabel) out.push(b.siteLabel);
    for (const car of this.traffic.cars) if (car.label) out.push(car.label);
  }

  // ---------- only the residents near the camera have a body and act (so 10,000 residents stay smooth) ----------
  // the others keep their place, home and job, and come back to life when the camera comes near them
  updateAwake(dt) {
    this.awakeT = (this.awakeT || 0) - dt;
    if (this.awakeT <= 0) {
      this.awakeT = .4;
      const f = this.world.controls.target, d = this.director, list = [];
      // seen from very high up the residents are dots: fewer of them get a body
      const R = this.world.camera.position.distanceTo(f) > 350 ? 35 : AWAKE_R;
      for (const c of this.chars) {
        const p = c.root.position, dd = Math.hypot(p.x - f.x, p.z - f.z);
        // always: the chosen / followed resident, and anyone riding a car or the bus
        if (c === this.selected || c === d.char || c.inCar || c.inBus || c.trip) list.push([c, dd - 1e6]);
        // next: anyone doing an order from the chat (until it is done, even far from the camera)
        else if (c.commanded) list.push([c, dd - 1e5]);
        else if (dd < (c.awake ? R + 15 : R)) list.push([c, dd - (c.awake ? 20 : 0)]);   // the awake ones stay (no coming and going at the edge)
      }
      list.sort((a, b) => a[1] - b[1]);
      this.wantAwake = list.slice(0, AWAKE_MAX).map(x => x[0]);
      const keep = new Set(this.wantAwake);
      for (const c of [...this.awake]) if (!keep.has(c)) c.sleep();
    }
    // a few new bodies per frame, so moving the camera never stutters
    const t0 = performance.now();
    for (const c of this.wantAwake || []) {
      if (c.awake) continue;
      if (performance.now() - t0 > 4) break;
      c.wake();
    }
  }

  // keep citizens from standing inside each other
  separate() {
    const cells = new Map(), R = .95;
    for (const c of this.awake) {
      const p = c.root.position, k = Math.floor(p.x / 2) + ',' + Math.floor(p.z / 2);
      (cells.get(k) || cells.set(k, []).get(k)).push(c);
    }
    const grid = this.world.grid;
    for (const c of this.awake) {
      if (c.inCar) continue;
      const p = c.root.position, cx = Math.floor(p.x / 2), cz = Math.floor(p.z / 2);
      const wa = c.moving ? 1 : SEATED.has(c.pose) ? 0 : .35;
      if (!wa) continue;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const o of cells.get((cx + a) + ',' + (cz + b)) || []) {
          if (o === c || Math.abs(o.root.position.y - p.y) > 1) continue;
          const dx = p.x - o.root.position.x, dz = p.z - o.root.position.z, d = Math.hypot(dx, dz);
          if (d >= R) continue;
          const push = (R - d) * .5 * wa;
          const nx = d > .001 ? dx / d : Math.random() - .5, nz = d > .001 ? dz / d : Math.random() - .5;
          const x = p.x + nx * push, z = p.z + nz * push;
          if (grid.freeAt(x, z) || !grid.freeAt(p.x, p.z)) { p.x = x; p.z = z; }
        }
      }
    }
  }

  // cut-away views + which citizens/labels are visible
  updateViews(dt) {
    const cam = this.world.camera.position, d = this.director;
    const focusChar = (d.mode === 'cinema' || d.mode === 'follow') ? d.char : null;
    this.viewTimer -= dt;
    if (this.viewTimer <= 0) {
      this.viewTimer = .25;
      const order = [];
      for (const c of this.awake) {
        c.bld = this.town.at(c.root.position.x, c.root.position.z);
        order.push([c, c === this.selected || c === d.char ? -1 : cam.distanceTo(c.root.position)]);
      }
      // name tags for the nearest residents only
      order.sort((a, b) => a[1] - b[1]);
      order.forEach(([c, dd], k) => { c.setTagged(k < TAGS_MAX && dd < TAGS_R); c.setShadow(dd < SHADOW_R); });
    }
    for (const b of this.town.awake) {
      const forced = (d.mode === 'interior' && d.building === b) || (focusChar && focusChar.bld === b);
      const floorMax = d.mode === 'interior' && d.building === b ? d.floor : (focusChar && focusChar.bld === b ? Math.floor((focusChar.root.position.y + .5) / FH) : null);
      b.applyView(cam, forced, floorMax);
    }
    for (const c of this.awake) {
      const b = c.bld;
      const hiddenFloor = c.inBus || c.inCar || (b && b.viewFloorMax != null && c.root.position.y > b.viewFloorMax * FH + 1);
      const insideClosed = b && b.complete && !b.isCut && c !== this.selected;
      c.root.visible = !hiddenFloor;
      c.label.visible = !hiddenFloor && !insideClosed;
      if (c.bubble.visible && (hiddenFloor || insideClosed)) c.bubble.visible = false;
      const dist = cam.distanceTo(c.root.position);
      const s = clamp(22 / dist, .3, 1);
      if (Math.abs(s - c.labelScale) > .02) {
        c.labelScale = s;
        c.labelInner.style.transform = `scale(${s.toFixed(2)})`;
        c.bubbleInner.style.transform = `scale(${s.toFixed(2)})`;
      }
      if (dist > 160 && c.label.visible) c.label.visible = false;
    }
  }

  refreshText() {
    for (const c of this.awake) c.updateLabel();
    for (const b of this.town.all) b.refreshText();
  }
}
