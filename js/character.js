// One animal citizen: 3D body, label, speech bubble, walking and poses.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ANIMALS } from './animals.js';
import { bodyPart, dress, TORSO_DEPTH } from './clothes.js';
import { makeTool } from './tools.js';
import { JOBS } from './jobs.js';
import { badgeOf } from './badges.js';
import { brain } from './behavior.js';
import { t } from './i18n.js';
import { mesh, sphere, capsule, cylGeo, lerpAngle, damp, mergeStatic, shadows, pick } from './util.js';

export const SHIRTS = ['#4a90e2', '#e94f64', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e', '#ff6fb5', '#16a085', '#c0392b', '#8e44ad'];
export const PANTS = ['#3a4a6b', '#2c3e50', '#5d4037', '#4b5a3a', '#37474f', '#6d4c41', '#263238', '#4a148c'];
let nextId = 1;

export class Character {
  constructor(game, d) {
    this.game = game;
    this.id = d.id ?? nextId;
    nextId = Math.max(nextId, this.id + 1);
    this.name = d.name;
    this.animal = ANIMALS[d.animal] ? d.animal : 'cat';
    this.def = ANIMALS[this.animal];
    this.shirt = d.shirt || pick(SHIRTS);
    this.pants = d.pants || pick(PANTS);
    this.job = 'none';
    this.homeId = d.homeId ?? null;
    this.pendingJob = d.pendingJob || null;
    // profile: when they arrived, what the follower wishes for, and their social account
    this.joinedAt = d.joinedAt || Date.now();
    // goals written from this follower's comments: [{ text, done, at }]
    this.goals = Array.isArray(d.goals) ? d.goals : (d.goal ? [{ text: d.goal, done: false, at: this.joinedAt }] : []);
    this.account = d.account || { platform: 'tiktok', handle: String(d.name || '').replace(/^@+/, '') };
    // supporter badge (set by the town's owner): heart / star / medal / crown / member (monthly, until a date)
    this.supporter = d.supporter || null;
    this.supporterUntil = d.supporterUntil || null;
    this.workplaceId = null;
    this.hurt = false;
    this.queue = [];
    this.activity = null;
    this.commanded = false;
    this.path = null;
    this.moving = false;
    this.speed = 1.7;
    this.heading = 0;
    this.faceAngle = null;
    this.pose = 'idle';
    this.walkPhase = 0;
    this.tailPhase = 0;
    this.phase = Math.random() * 10;
    this.nextBlink = 1 + Math.random() * 3;
    this.bubbleUntil = 0;
    this.carryUntil = 0;
    this.inside = false;
    this.labelScale = 1;
    this.P = {};
    // the body is only built while the resident is near the camera (see wake / sleep and Game.updateAwake)
    this.root = new THREE.Group();
    this.root.userData.charId = this.id;
    this.awake = false;
    this.setJob(d.job && JOBS[d.job] ? d.job : 'none');
    this.workplaceId = d.workplaceId ?? null;
    this.workPinned = !!d.workPinned;
    if (d.hurt) this.setHurt(true);
  }

  // ---------- near the camera: a full 3D body; far away: just a position (nothing to draw or animate) ----------
  wake() {
    if (this.awake) return;
    this.awake = true;
    this.buildModel();
    dress(this, this.job);
    this.updateLabel();
    this.bandage.visible = this.hurt;
    this.ring.visible = !!this.isSel;
    const tool = this.toolName;
    this.toolName = null;
    if (tool) this.setTool(tool);
    this.labelScale = 1;
    this.root.visible = !this.inside;
    this.game.scene.add(this.root);
    this.game.awake.add(this);
  }
  sleep() {
    if (!this.awake) return;
    // what they were doing is dropped (they pick something new when the camera comes back);
    // orders from the chat are kept and go on later
    if (!this.commanded) { this.activity?.end?.(this); this.activity = null; this.queue = []; this.stop(); this.pose = 'idle'; }
    this.awake = false;
    this.game.awake.delete(this);
    this.game.scene.remove(this.root);
    this.root.remove(this.label, this.bubble);   // takes the name tags out of the page
    for (const o of [...this.root.children]) {
      this.root.remove(o);
      o.traverse(m => { if (m.isMesh && m.userData.ownGeo) m.geometry.dispose(); });
    }
    this.shirtMat.dispose();
    this.pantsMat.dispose();
    this.body = this.label = this.bubble = this.ring = this.bandage = this.tool = this.carry = this.swimCap = null;
    this.inSwimsuit = false;
    this.carryUntil = 0;
  }

  buildModel() {
    const d = this.def, neck = d.neck || 0;
    this.shirtMat = new THREE.MeshStandardMaterial({ color: this.shirt, roughness: .8 });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: this.pants, roughness: .85 });
    const root = this.root;
    const body = this.body = new THREE.Group();
    root.add(body);

    // legs (pivot at the hip)
    this.legs = [-1, 1].map(s => {
      const leg = new THREE.Group();
      leg.position.set(s * .15, .9, 0);
      mesh(capsule(.11, .55), this.pantsMat, 0, -.4, 0, leg);
      mesh(sphere(.12), '#3b2f2f', 0, -.83, .05, leg).scale.set(1, .55, 1.4);
      body.add(leg);
      return leg;
    });

    // torso: one smooth shape (shirt) with pants + belt hugging the hips
    const torso = this.torso = new THREE.Group();
    torso.scale.z = TORSO_DEPTH;
    body.add(torso);
    bodyPart(torso, .8, 1.85, 0, this.shirtMat);
    bodyPart(torso, .8, 1.02, .008, this.pantsMat);
    this.belt = bodyPart(torso, .99, 1.045, .014, '#3a2c22');
    this.belt.userData.keep = true; // hidden while swimming
    const neckMesh = mesh(cylGeo(.1, .13, .24 + neck, 14), d.fur, 0, 1.88 + neck / 2, 0, body);
    if (d.neckSpots) {
      for (let k = 0; k < 7; k++) {
        const a = k * 1.9, y = 1.8 + (k / 7) * (neck + .2);
        const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const s = mesh(sphere(.05, 10, 8), d.neckSpots, n.x * .108, y, n.z * .108, body);
        s.scale.set(1, 1.3, .35);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      }
    }

    // arms: shoulder ball + sleeve + fur forearm + hand (pivot inside the shoulder)
    this.arms = [-1, 1].map(s => {
      const arm = new THREE.Group();
      arm.position.set(s * .31, 1.6, 0);
      mesh(sphere(.125), this.shirtMat, 0, 0, 0, arm);
      mesh(capsule(.105, .2), this.shirtMat, 0, -.17, 0, arm);
      mesh(capsule(.08, .26), d.fur, 0, -.42, 0, arm);
      mesh(sphere(.1), d.hand, 0, -.64, 0, arm).scale.set(.9, 1, .85);
      const hand = new THREE.Group();
      hand.position.set(0, -.64, 0);
      arm.add(hand);
      arm.userData.hand = hand;
      body.add(arm);
      return arm;
    });
    this.handR = this.arms[0].userData.hand; // right hand = -x side
    this.handL = this.arms[1].userData.hand;

    // head + tail
    const head = this.head = new THREE.Group();
    head.position.set(0, 2.2 + neck, 0);
    body.add(head);
    this.eyes = d.head(head) || [];
    const tail = this.tail = new THREE.Group();
    tail.position.set(0, .95, -.2);
    d.tail?.(tail);
    body.add(tail);

    this.gearHead = new THREE.Group();
    head.add(this.gearHead);
    this.gearBody = new THREE.Group();
    torso.add(this.gearBody);

    const hr = d.headR || .37;
    this.bandage = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(hr * .99, .045, 8, 28), '#ffffff', 0, .14, 0, this.bandage);
    band.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(.14, .04, .03), '#e74c3c', .16, .2, hr * .86, this.bandage);
    mesh(new THREE.BoxGeometry(.04, .14, .03), '#e74c3c', .16, .2, hr * .86, this.bandage);
    this.bandage.visible = false;
    head.add(this.bandage);

    for (const g of [torso, head, tail, body, ...this.legs, ...this.arms]) mergeStatic(g);
    shadows(root);

    const ring = this.ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .05, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffcf3f' }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .05;
    ring.visible = false;
    ring.castShadow = false;
    root.add(ring);

    // name + job label, and a speech bubble above it
    const el = document.createElement('div');
    el.className = 'clabel';
    el.innerHTML = '<div class="inner"><b></b><span></span></div>';
    this.labelInner = el.firstChild;
    this.labelName = this.labelInner.querySelector('b');
    this.labelName.dir = 'auto';
    this.labelJob = this.labelInner.querySelector('span');
    this.label = new CSS2DObject(el);
    this.label.position.set(0, 3.1 + neck, 0);
    root.add(this.label);

    const bel = document.createElement('div');
    bel.className = 'cbubble';
    bel.innerHTML = '<div class="inner"></div>';
    this.bubbleInner = bel.firstChild;
    this.bubble = new CSS2DObject(bel);
    this.bubble.position.set(0, 3.85 + neck, 0);
    this.bubble.visible = false;
    root.add(this.bubble);
    this.tagged = true;
    this.shadowOn = true;
  }
  // only residents close to the camera cast a shadow (the far ones are small; it saves a lot of drawing)
  setShadow(v) {
    if (!this.awake || this.shadowOn === v) return;
    this.shadowOn = v;
    this.body.traverse(o => { if (o.isMesh) o.castShadow = v; });
  }
  // the name tag + speech bubble are page elements: only the nearest residents carry them (Game.updateViews)
  setTagged(v) {
    if (!this.awake || this.tagged === v) return;
    this.tagged = v;
    if (v) this.root.add(this.label, this.bubble);
    else this.root.remove(this.label, this.bubble);
  }

  // ---------- goals ----------
  addGoal(text) {
    const s = String(text || '').trim().slice(0, 140);
    if (!s) return null;
    const g = { text: s, done: false, at: Date.now() };
    this.goals.push(g);
    if (this.goals.length > 20) this.goals.shift();
    return g;
  }
  get goal() { return (this.goals.find(g => !g.done) || this.goals[this.goals.length - 1])?.text || ''; }

  // ---------- state ----------
  setJob(job) {
    this.workPinned = false;
    this.job = job;
    this.workplaceId = null;
    if (this.awake) { dress(this, job); this.updateLabel(); }
  }
  updateLabel() {
    if (!this.awake) return;
    const bd = badgeOf(this);
    this.labelName.textContent = (bd ? bd.emoji + ' ' : '') + this.name;
    this.labelInner.parentNode.className = 'clabel' + (bd ? ' sup-' + bd.key : '');
    this.labelJob.textContent = this.job === 'none' ? '' : `${JOBS[this.job].emoji} ${t('job_' + this.job)}`;
    this.labelJob.style.display = this.job === 'none' ? 'none' : '';
  }
  say(text, dur = 3.5) {
    if (!this.awake) return;
    this.bubbleInner.textContent = text;
    this.bubbleInner.dir = 'auto';
    this.bubble.visible = !this.inside;
    this.bubbleUntil = this.game.time + dur;
  }
  setTool(name) {
    if (this.toolName === name) return;
    this.toolName = name;
    if (!this.awake) return;
    if (this.tool) this.handR.remove(this.tool);
    this.tool = null;
    if (name) { this.tool = makeTool(name); this.handR.add(this.tool); }
  }
  setCarry(name, sec) {
    if (!this.awake) { this.carryUntil = 0; return; }
    if (this.carry) this.handL.remove(this.carry);
    this.carry = name ? makeTool(name) : null;
    if (this.carry) this.handL.add(this.carry);
    this.carryUntil = name ? this.game.time + sec : 0;
  }
  setHurt(v) {
    this.hurt = v;
    if (this.bandage) this.bandage.visible = v;
    if (!v) this.atHospital = null;
  }
  setInside(v) {
    this.inside = v;
    this.root.visible = !v;
    if (!this.awake) return;
    this.label.visible = !v;
    if (v) this.bubble.visible = false;
  }
  setSelected(v) { this.isSel = v; if (this.ring) this.ring.visible = v; }

  // ---------- orders ----------
  moveTo(x, z, speed = 2) {
    const p = this.root.position;
    // come back down from an upper floor / bed before walking
    if (this.upstairs) {
      const st = this.upstairs.alive ? this.upstairs.stairWorld() : null;
      if (st) p.set(st.x, 0, st.z);
      this.upstairs = null;
    }
    if (this.trip) this.game.traffic.cancel(this);
    p.y = this.game.tiles.groundY(p.x, p.z);
    // far away: by car (own car or taxi) when there are roads, otherwise on foot
    const tr = this.game.traffic;
    if (tr?.wantsRide(this, x, z)) this.trip = tr.startTrip(this, x, z);
    this.forceRide = null;
    this.dest = { x, z };
    if (!this.trip) { this.path = this.game.world.grid.findPath(p.x, p.z, x, z); this.longWalk = this.game.world.grid.lastCut; }
    this.moving = true;
    this.speed = speed;
  }
  stop() {
    if (this.trip) this.game.traffic.cancel(this);
    this.path = null;
    this.longWalk = false;
    this.moving = false;
  }

  // replace whatever we're doing with a list of activities
  command(acts, commanded = true) {
    this.activity?.end?.(this);
    this.activity = null;
    this.queue = acts.slice();
    this.commanded = commanded;
    this.stop();
    this.pose = 'idle';
  }
  // stop the current self-chosen routine so the brain picks again (e.g. a fire started)
  interrupt() {
    if (this.commanded || this.queue.length) return;
    this.activity?.end?.(this);
    this.activity = null;
    this.stop();
  }
  // short status emoji for the panel list
  status() {
    if (this.inside) return '😴';
    const n = this.activity?.name;
    return { build: '🔨', work: '💼', patient: '🤕', fire: '🧯' }[n] || (this.pose === 'dance' ? '💃' : this.pose === 'talk' ? '💬' : '');
  }

  // ---------- per frame ----------
  update(dt, t) {
    if (!this.activity) {
      if (this.queue.length) this.activity = this.queue.shift();
      else { this.commanded = false; this.activity = brain(this); }
      this.activity.start?.(this);
    }
    const r = this.activity.update(this, dt, t);
    if (r) {
      this.activity.end?.(this);
      this.activity = null;
      if (r === 'abort') this.queue = [];   // couldn't get there: the rest of the order is dropped too
    }

    // walk along the path
    let walking = false;
    if (this.moving && this.path) {
      const p = this.root.position;
      let step = this.speed * (this.hurt ? .55 : 1) * dt;
      let target = this.path[0], dx = 0, dz = 0, d = 0;
      while (target) {
        dx = target.x - p.x; dz = target.z - p.z; d = Math.hypot(dx, dz);
        if (d > step) break;
        p.x = target.x; p.z = target.z; step -= d;
        this.path.shift();
        target = this.path[0];
      }
      if (target) {
        p.x += dx / d * step;
        p.z += dz / d * step;
        if (!this.upstairs) p.y = this.game.tiles.groundY(p.x, p.z);
        this.heading = Math.atan2(dx, dz);
        walking = true;
      } else if (this.trip) {
        // at the curb: wait there for the car (still "on the way")
        this.path = null;
        if (this.trip.phase === 'walk') this.trip.phase = 'atCurb';
      } else if (this.longWalk && this.dest) {
        // a very long walk is found in parts: the next part from here
        const grid = this.game.world.grid;
        this.path = grid.findPath(p.x, p.z, this.dest.x, this.dest.z);
        this.longWalk = grid.lastCut;
      } else this.stop();
    }
    const want = walking ? this.heading : this.faceAngle;
    if (want != null) this.root.rotation.y = lerpAngle(this.root.rotation.y, want, 1 - Math.exp(-dt * 10));

    this.animatePose(dt, t, walking);

    if (this.bubble.visible && this.game.time > this.bubbleUntil) this.bubble.visible = false;
    if (this.carryUntil && this.game.time > this.carryUntil) this.setCarry(null);
    if (t > this.nextBlink) {
      const closed = t < this.nextBlink + .12;
      for (const e of this.eyes) e.scale.y = e.userData.s * (closed ? .1 : 1);
      if (!closed) this.nextBlink = t + 2 + Math.random() * 3;
    }
  }

  animatePose(dt, t, walking) {
    const P = this.P;
    P.legL = 0; P.legR = 0; P.armRx = 0; P.armRz = -.08; P.armLx = 0; P.armLz = .08;
    P.bodyY = 0; P.bodyRx = 0; P.bodyRy = 0; P.bodyRz = 0; P.headRx = 0; P.headRy = 0; P.headRz = 0;
    const tt = t + this.phase;
    let pose = this.pose;
    if (!walking && this.hurt && pose === 'idle') pose = 'hurt';

    if (walking) {
      this.walkPhase += dt * this.speed * (this.hurt ? 3 : 4.7);
      const s = Math.sin(this.walkPhase);
      P.legL = s * .55; P.legR = -s * .55;
      P.armRx = -s * .45; P.armLx = s * .45;
      P.bodyY = Math.abs(Math.cos(this.walkPhase)) * .035;
      if (this.hurt) { P.bodyRz = .08; P.headRz = .12; }
      if (this.speed > 2.5) P.bodyRx = .12;
    } else {
      switch (pose) {
        case 'wave':
          P.armRz = -2.6 + Math.sin(tt * 8) * .35; P.headRz = Math.sin(tt * 2) * .08; break;
        case 'cheer':
          P.armRz = -2.5 + Math.sin(tt * 10) * .15; P.armLz = 2.5 - Math.sin(tt * 10) * .15;
          P.bodyY = Math.abs(Math.sin(tt * 5)) * .12; break;
        case 'jump': {
          const h = Math.abs(Math.sin(tt * 5));
          P.bodyY = h * .7; P.armRz = -2.4; P.armLz = 2.4; P.legL = P.legR = -h * .4; break;
        }
        case 'dance': {
          const s = Math.sin(tt * 6);
          P.armRz = -2.2 + s * .45; P.armLz = 2.2 + s * .45;
          P.bodyRy = Math.sin(tt * 3) * .45; P.bodyY = Math.abs(s) * .1;
          P.legL = Math.max(0, s) * .45; P.legR = Math.max(0, -s) * .45; P.headRz = s * .12; break;
        }
        case 'hammer': {
          const s = (Math.sin(tt * 6) + 1) / 2;
          P.armRx = -.5 - s * 1.6; P.armRz = -.05; P.bodyRx = .06; P.headRx = .15; break;
        }
        case 'hoe': {
          const s = (Math.sin(tt * 4) + 1) / 2;
          P.armRx = P.armLx = -.3 - s * 1.2; P.armRz = .25; P.armLz = -.25; P.bodyRx = .12; P.headRx = .2; break;
        }
        case 'stir':
          P.armRx = -.9 + Math.cos(tt * 4) * .2; P.armRz = -.1 + Math.sin(tt * 4) * .25; P.armLx = -.4; P.headRx = .25; break;
        case 'sell':
          if (Math.sin(tt * .8) > .85) P.armRz = -2.6 + Math.sin(tt * 8) * .3;
          P.headRy = Math.sin(tt * .5) * .25; break;
        case 'fish':
          P.armRx = -1.05 + Math.sin(tt * 1.5) * .05; P.armLx = -.95; P.armRz = .25; P.armLz = -.25; break;
        case 'point':
          P.armRz = -1.45 + Math.sin(tt * 2) * .1; P.armRx = -.3; P.headRy = -.45; break;
        case 'spray':
          P.armRx = -1.35; P.armLx = -1.25; P.armRz = .2; P.armLz = -.2; P.bodyRx = -.05; break;
        case 'heal':
          P.armRx = -1.25 + Math.sin(tt * 5) * .1; P.armLx = -1.25 + Math.cos(tt * 5) * .1; break;
        case 'talk':
          P.armRx = -.35 + Math.sin(tt * 3) * .25; P.armLx = -.25 + Math.sin(tt * 3 + 1.5) * .2; P.headRx = Math.sin(tt * 4) * .06; break;
        case 'sit':
          P.legL = P.legR = -1.45; P.bodyY = -.3; P.armRx = P.armLx = -.5; break;
        case 'sitGround':
          P.legL = P.legR = -1.5; P.bodyY = -.78; P.armRx = P.armLx = -.3; P.headRy = Math.sin(tt * .6) * .3; break;
        case 'eat':
          P.legL = P.legR = -1.45; P.bodyY = -.3;
          P.armRx = -2.1 + Math.sin(tt * 3) * .15; P.armRz = .35; P.armLx = -.5; P.headRx = .1; break;
        case 'eatStand':
          P.armRx = -2.1 + Math.sin(tt * 3) * .15; P.armRz = .35; break;
        case 'hurt':
          P.armRx = -2.5; P.armRz = .45; P.headRz = .15; P.bodyRx = .08; break;
        case 'row': {
          // sitting in the boat, pulling both oars
          const s = Math.sin(tt * 3.2);
          P.legL = P.legR = -1.45; P.bodyY = -.3; P.bodyRx = s * .14;
          P.armRx = P.armLx = -1.25 + s * .55; P.armRz = -.25; P.armLz = .25; break;
        }
        case 'swim': {
          // only head and shoulders above the water (the rest is under the ground line)
          const s = Math.sin(tt * 3.4), kick = Math.sin(tt * 11);
          P.bodyY = -1.02 + Math.sin(tt * 6.8) * .04; P.bodyRx = .5; P.bodyRz = s * .14;
          P.headRx = -.45; P.headRy = Math.max(0, Math.sin(tt * 1.7)) * .55;
          P.armRx = -1.55 + s * 1.5; P.armLx = -1.55 - s * 1.5; P.armRz = -.25 - Math.max(0, s) * .25; P.armLz = .25 + Math.max(0, -s) * .25;
          P.legL = kick * .32; P.legR = -kick * .32; break;
        }
        case 'pray': {
          // everyone prays together (the same clock): standing, bowing, prostrating, sitting
          const ph = t % 16;
          if (ph < 6) { P.armRx = P.armLx = -.75; P.armRz = .45; P.armLz = -.45; }
          else if (ph < 8.5) { P.bodyRx = .55; P.bodyY = -.08; P.headRx = .35; P.armRx = P.armLx = -.7; }
          else if (ph < 12) { P.legL = P.legR = -1.5; P.bodyY = -.8; P.bodyRx = .95; P.headRx = .3; P.armRx = P.armLx = -1.5; }
          else { P.legL = P.legR = -1.5; P.bodyY = -.78; P.armRx = P.armLx = -.35; }
          break;
        }
        case 'sleep': case 'lie': case 'sleepGround':
          P.bodyRx = -1.5; P.bodyY = .32; P.armRz = -.1; P.armLz = .1; break;
        default:
          P.headRy = Math.sin(tt * .7) * .3;
      }
    }

    const k = 1 - Math.exp(-dt * 16);
    const L = this.legs, A = this.arms, B = this.body, H = this.head;
    L[1].rotation.x = damp(L[1].rotation.x, P.legL, k);
    L[0].rotation.x = damp(L[0].rotation.x, P.legR, k);
    A[0].rotation.x = damp(A[0].rotation.x, P.armRx, k);
    A[0].rotation.z = damp(A[0].rotation.z, P.armRz, k);
    A[1].rotation.x = damp(A[1].rotation.x, P.armLx, k);
    A[1].rotation.z = damp(A[1].rotation.z, P.armLz, k);
    B.position.y = damp(B.position.y, P.bodyY, k);
    B.rotation.x = damp(B.rotation.x, P.bodyRx, k);
    B.rotation.y = damp(B.rotation.y, P.bodyRy, k);
    B.rotation.z = damp(B.rotation.z, P.bodyRz, k);
    H.rotation.x = damp(H.rotation.x, P.headRx, k);
    H.rotation.y = damp(H.rotation.y, P.headRy, k);
    H.rotation.z = damp(H.rotation.z, P.headRz, k);

    this.tailPhase += dt * (walking || this.def.wag ? 7 : 2.5);
    this.tail.rotation.y = Math.sin(this.tailPhase) * .35;
  }

  dispose() {
    this.activity?.end?.(this);
    this.activity = null;
    this.commanded = false;
    this.sleep();
  }

  toJSON() {
    return { id: this.id, name: this.name, animal: this.animal, shirt: this.shirt, pants: this.pants, job: this.job, homeId: this.homeId, hurt: this.hurt, pendingJob: this.pendingJob || null, workplaceId: this.workplaceId, workPinned: !!this.workPinned, joinedAt: this.joinedAt, goals: this.goals, account: this.account, supporter: this.supporter || undefined, supporterUntil: this.supporterUntil || undefined };
  }
}
