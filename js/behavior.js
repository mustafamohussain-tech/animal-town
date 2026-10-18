// What characters do: small "activities" (walk, wait, build…) chained into routines.
// An activity is { name, start(c), update(c,dt,t) -> true when done, end(c) }.
import { swimwear } from './clothes.js';
import { NIGHT_EVENTS } from './events.js';
import { makeRideBoat, WATER_Y } from './water.js';
import * as THREE from 'three';
import { rand, pick, angleTo, dist2d } from './util.js';

const CHAT = ['👋', '😂', '😄', '❤️', '🍕', '⚽', '🎵', '🤔', '😮', '👍', '🙌', '😎', '🥳', '☕', '🌞', '🤣', '😍'];
const IDLE = ['🙂', '🎵', '🌸', '😊', '🤗', '👀', '☀️'];
const NIGHT_SHIFT = ['police', 'firefighter', 'doctor'];
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
const POSE = { sit: 'sit', lie: 'lie', stand: 'idle' };

// ---------- basic building blocks ----------
export function goTo(x, z, o = {}) {
  return {
    name: o.name || 'goto',
    start(c) { c.moveTo(x, z, o.speed); c.pose = 'idle'; },
    update(c) {
      if (c.moving) return false;
      if (o.face != null) c.faceAngle = o.face;
      return true;
    },
  };
}

// walk to a spot of a building; upstairs spots are reached through the stairs
export function toSpot(b, s, o = {}) {
  let phase = 0;
  return {
    name: o.name || 'goto',
    start(c) {
      c.pose = 'idle';
      const st = s.y > 1.5 ? b.stairWorld() : null;
      if (st) { c.moveTo(st.x, st.z, o.speed); phase = 1; } else { c.moveTo(s.x, s.z, o.speed); phase = 2; }
    },
    update(c) {
      if (c.moving) return false;
      if (phase === 1) {
        c.game.effects.emit('dust', { x: c.root.position.x, y: .5, z: c.root.position.z }, 3);
        c.root.position.set(s.x, s.y, s.z);
        c.upstairs = b;
      } else c.root.position.y = s.y;
      c.faceAngle = s.face;
      c.root.rotation.y = s.face;
      return true;
    },
  };
}

// stand/sit/etc. for some seconds; o.tick may return true to finish early
export function wait(sec, pose = 'idle', o = {}) {
  let left = sec;
  return {
    name: o.name || pose,
    start(c) {
      left = sec;
      c.pose = pose;
      if (o.face != null) c.faceAngle = o.face;
      if (o.tool) c.setTool(o.tool);
      o.onStart?.(c);
    },
    update(c, dt, t) {
      left -= dt;
      if (o.faceEach) c.faceAngle = o.faceEach(c);
      return o.tick?.(c, dt, t) === true || left <= 0;
    },
    end(c) {
      c.pose = 'idle';
      if (o.tool) c.setTool(null);
      o.onEnd?.(c, left <= 0);
    },
  };
}

export const say = (text, dur) => ({ name: 'say', update(c) { c.say(text, dur); return true; } });
export const call = fn => ({ name: 'call', update(c) { fn(c); return true; } });

// run a list of activities one after another
export function routine(list, name) {
  let i = 0, sub = null;
  return {
    name,
    update(c, dt, t) {
      for (let guard = 0; guard < 20; guard++) {
        if (!sub) {
          if (i >= list.length) return true;
          sub = list[i++];
          sub.start?.(c);
        }
        if (!sub.update(c, dt, t)) return false;
        sub.end?.(c);
        sub = null;
      }
      return false;
    },
    end(c) { sub?.end?.(c); sub = null; },
  };
}

// go to a reserved spot, do a pose there, then free the spot
function useSpot(b, kind, sec, o = {}) {
  const s = o.spot || b.reserve(kind);
  if (!s) return null;
  return [toSpot(b, s, { speed: o.speed }), wait(sec, o.pose || POSE[s.pose] || 'idle', {
    face: s.face, tool: o.tool, name: o.name,
    onStart: o.onStart, tick: o.tick,
    onEnd: (c, done) => { b.release(kind, s.idx); o.onEnd?.(c, done); },
  })];
}

// ---------- building ----------
export function buildAct(b, shift = rand(40, 80)) {
  let spot = null, timer = 0, worked = 0;
  return {
    name: 'build',
    start(c) { c.setTool('hammer'); spot = null; c.focusBuilding = b; },
    update(c, dt) {
      if (!b.alive || b.complete || worked > shift) return true;
      if (!spot || timer <= 0) {
        spot = b.buildSpot();
        c.moveTo(spot.x, spot.z, c.commanded ? 3.4 : 2);
        timer = rand(4, 7);
      }
      if (c.moving) { c.pose = 'idle'; return false; }
      c.pose = 'hammer';
      c.faceAngle = angleTo(c.root.position, b.center);
      b.addProgress(dt);
      timer -= dt;
      worked += dt;
      if (Math.random() < dt * 1.2) {
        c.handR.getWorldPosition(v3);
        c.game.effects.emit('dust', { x: v3.x, y: .4, z: v3.z }, 2);
      }
      return false;
    },
    end(c) { c.setTool(null); c.pose = 'idle'; if (c.focusBuilding === b) c.focusBuilding = null; },
  };
}

// ---------- firefighting ----------
export function fightFire(b) {
  let spot = null;
  return {
    name: 'fire',
    start(c) {
      c.setTool('hose');
      spot = b.fireSpot();
      c.moveTo(spot.x, spot.z, 3.8);
      c.say('🚨', 2);
    },
    update(c, dt) {
      if (!b.fire || !b.alive) return true;
      if (c.moving) return false;
      c.pose = 'spray';
      c.faceAngle = angleTo(c.root.position, b.center);
      b.extinguish(dt);
      if (Math.random() < dt * 30) {
        c.handR.getWorldPosition(v3);
        v3b.set(b.center.x - v3.x, b.roofTop * .8 - v3.y + 3, b.center.z - v3.z).normalize();
        c.game.effects.emit('water', v3, 1, { dir: v3b, speed: 9 });
      }
      return false;
    },
    end(c) { c.setTool(null); c.pose = 'idle'; },
  };
}

// ---------- chatting with someone ----------
export function chatAct(other, leader) {
  let tm = 0, talking = 0, nextSay = leader ? .3 : 1.1;
  return {
    name: 'chat',
    start(c) {
      c.chatWith = other.id;
      if (leader) {
        const p = other.root.position, q = c.root.position;
        const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
        c.moveTo(p.x + dx / d * 1.4, p.z + dz / d * 1.4);
      }
    },
    update(c, dt) {
      tm += dt;
      if (tm > 18 || !c.game.chars.includes(other)) return true;
      if (tm > .6 && other.chatWith !== c.id) return true;
      if (c.moving) return false;
      c.faceAngle = angleTo(c.root.position, other.root.position);
      if (other.moving || dist2d(c.root.position, other.root.position) > 2.6) { c.pose = 'idle'; return false; }
      talking += dt;
      c.pose = 'talk';
      nextSay -= dt;
      if (nextSay <= 0) { c.say(pick(CHAT), 1.4); nextSay = 1.6; }
      return talking > 6;
    },
    end(c) { if (c.chatWith === other.id) c.chatWith = null; c.pose = 'idle'; },
  };
}

// ---------- visiting places ----------
export function buyActs(c, shop) {
  const g = c.game, list = [];
  const browse = useSpot(shop, 'browse', rand(2.5, 4), { onStart: x => Math.random() < .5 && x.say('🤔') });
  if (browse) list.push(...browse);
  const pay = useSpot(shop, 'counter', 2.5, {
    onStart: x => x.say('🛍️'),
    onEnd: (x, done) => { if (!done) return; g.workerAt(shop)?.say('🙏', 2); x.setCarry('bag', 30); },
  });
  if (pay) list.push(...pay);
  return list;
}
export function eatActs(c, rest) {
  return useSpot(rest, 'seat', rand(7, 10), { pose: 'eat', tool: 'food', onEnd: (x, d) => d && x.say('😋') }) || [];
}
function sitActs(b, emoji, sec = rand(6, 10)) {
  return useSpot(b, 'seat', sec, { onStart: x => emoji && x.say(emoji) }) || [];
}
function homeOf(c) { const h = c.game.town.get(c.homeId); return h?.complete ? h : null; }
function bedSpot(c, home) {
  const n = home.count('bed');
  if (!n) return null;
  const i = Math.max(0, home.residents.indexOf(c.id));
  return home.spot('bed', i);
}
function sleepActs(c, untilMorning) {
  const g = c.game, home = homeOf(c);
  const zzz = (x, dt) => {
    if (Math.random() < dt * 1.1) g.effects.emit('zzz', { x: x.root.position.x, y: x.root.position.y + 1.2, z: x.root.position.z });
    if (untilMorning && !g.daynight.isNight) return true;
  };
  const bed = home && bedSpot(c, home);
  if (bed) return [toSpot(home, bed), wait(untilMorning ? 9999 : 18, 'sleep', { face: bed.face, tick: zzz, name: 'sleep' })];
  return [wait(untilMorning ? 9999 : 12, 'sleepGround', { tick: zzz, name: 'sleep' })];
}

const headPos = c => ({ x: c.root.position.x, y: c.root.position.y + 2.8, z: c.root.position.z });

// ---------- commanded actions (from the panel or a comment) ----------
export function actionActs(c, a, o = {}) {
  const g = c.game, pos = c.root.position;
  switch (a) {
    case 'dance':
      return [wait(8, 'dance', { onStart: x => x.say('💃'), tick: (x, dt) => { if (Math.random() < dt * 2.5) g.effects.emit('note', headPos(x)); } })];
    case 'wave': return [wait(3, 'wave', { onStart: x => x.say('👋') })];
    case 'jump': return [wait(3, 'jump', { onStart: x => x.say('🤸') })];
    case 'cheer': return [wait(3, 'cheer', { onStart: x => x.say('🎉') })];
    case 'sit': {
      const park = g.town.nearest('park', pos);
      const l = park ? sitActs(park, '😌', 12) : [];
      return l.length ? l : [wait(10, 'sitGround')];
    }
    case 'sleep': return sleepActs(c, false);
    case 'swim': return swimActs(c) || [wait(2, 'idle', { onStart: x => x.say('🤷') })];
    case 'boat': return boatActs(c) || [wait(2, 'idle', { onStart: x => x.say('🤷') })];
    case 'drive': {
      // by car (or taxi) to a building: the one named, or somewhere on the other side of town
      const far = g.town.all.filter(b => b.complete && !b.def.open && dist2d(b.center, pos) > 50);
      const b = (o.type && g.town.nearest(o.type, pos)) || (far.length ? pick(far) : null);
      if (!b) return [wait(2, 'idle', { onStart: x => x.say('🤷') })];
      const s = b.spot('door', c.id);
      return [call(x => { x.forceRide = o.taxi ? 'taxi' : true; }), goTo(s.x, s.z, { face: s.face }), wait(2, 'idle')];
    }
    case 'eat': {
      const rest = g.town.nearest('restaurant', pos);
      const l = rest ? eatActs(c, rest) : [];
      return l.length ? l : [wait(5, 'eatStand', { tool: 'food', onEnd: (x, d) => d && x.say('😋') })];
    }
    case 'buy': {
      const shop = g.town.nearest('shop', pos, { variant: o.variant });
      return shop ? buyActs(c, shop) : null;
    }
    case 'chat': {
      const other = g.nearestChar(c, x => !x.hurt && !x.upstairs);
      if (!other) return [wait(2, 'idle', { onStart: x => x.say('🤷') })];
      other.command([chatAct(c, false)], false);
      return [chatAct(other, true)];
    }
    case 'home': {
      const home = homeOf(c);
      if (!home) return null;
      const seat = home.reserve('seat');
      if (seat) return [toSpot(home, seat), wait(8, 'sit', { face: seat.face, onStart: x => x.say('🏠'), onEnd: () => home.release('seat', seat.idx) })];
      const d = home.spot('door');
      return [goTo(d.x, d.z, { face: d.face }), wait(2, 'wave', { onStart: x => x.say('🏠') })];
    }
    case 'goto': {
      const b = g.town.nearest(o.type, pos, { variant: o.variant });
      if (!b) return null;
      const s = b.spot('door', c.id);
      return [goTo(s.x, s.z, { face: s.face }), wait(2, 'idle')];
    }
  }
  return null;
}

// ---------- water: fishing from the bank / pier, swimming in a lake ----------
export function waterFishActs(c) {
  const g = c.game, w = g.water.nearest(c.root.position);
  if (!w) return null;
  const s = w.pier && Math.random() < .35 ? w.pier : g.water.shoreSpot(c.root.position, w);
  return [goTo(s.x, s.z, { face: s.face }), wait(rand(6, 10), 'fish', {
    face: s.face, tool: 'rod',
    onEnd: (x, done) => { if (done) { g.effects.emit('splash', s.bob, 10); x.say(pick(['🐟', '🐠', '🎣', '🐡', '👢']), 2); } },
  }), wait(1.5, 'cheer', { tool: 'fish' })];
}
export function swimActs(c) {
  const g = c.game, w = g.water.nearest(c.root.position, 'lake');
  if (!w) return null;
  const sh = g.water.shoreSpot(c.root.position, w);
  return [goTo(sh.x, sh.z), swimAct(w, sh, rand(16, 26))];
}
// a boat ride on the lake from the pier (or the bank), rowing a few laps
export function boatActs(c) {
  const g = c.game, w = g.water.nearest(c.root.position, 'lake');
  if (!w) return null;
  const dock = w.pier || g.water.shoreSpot(c.root.position, w);
  return [goTo(dock.x, dock.z, { face: dock.face }), boatAct(w, dock, rand(25, 40))];
}
function boatAct(w, dock, sec) {
  let boat = null, left = sec, k = 0, back = false, from = null;
  return {
    name: 'boat',
    start(c) {
      left = sec; back = false;
      from = { x: dock.bob.x, z: dock.bob.z };   // the water next to the pier
      boat = makeRideBoat();
      boat.position.set(from.x, WATER_Y, from.z);
      boat.rotation.y = dock.face;
      c.game.scene.add(boat);
      c.inBoat = true;
      c.setTool(null);
      c.pose = 'row';
      c.say('🚣', 2);
      let bd = Infinity;
      w.rideLoop.forEach((q, i) => { const d = Math.hypot(q.x - from.x, q.z - from.z); if (d < bd) { bd = d; k = i; } });
      c.game.effects.emit('splash', { x: from.x, y: .2, z: from.z }, 8);
    },
    update(c, dt, t) {
      left -= dt;
      if (left <= 0) back = true;
      const tg = back ? from : w.rideLoop[k], p = boat.position;
      const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
      if (d < .9) { if (back) return true; k = (k + 1) % w.rideLoop.length; return false; }
      const want = Math.atan2(dx, dz);
      let da = want - boat.rotation.y;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      boat.rotation.y += da * Math.min(1, dt * 1.8);
      const s = Math.min(d, 2.2 * dt) * Math.max(.25, Math.cos(da));
      p.x += Math.sin(boat.rotation.y) * s;
      p.z += Math.cos(boat.rotation.y) * s;
      const bob = Math.sin(t * 1.8) * .05;
      p.y = WATER_Y + bob;
      boat.rotation.z = Math.sin(t * 1.3) * .04;
      for (const o of boat.userData.oars) o.rotation.x = Math.sin(t * 3.2) * .7;
      c.root.position.set(p.x, .32 + bob, p.z);
      c.root.rotation.y = boat.rotation.y;
      c.faceAngle = boat.rotation.y;
      return false;
    },
    end(c) {
      if (boat) { c.game.scene.remove(boat); boat = null; }
      c.inBoat = false;
      c.pose = 'idle';
      c.root.position.set(dock.x, 0, dock.z);
      c.say(pick(['😄', '🌊', '👍']), 2);
    },
  };
}

// a few laps on the lake, then out again where they went in
function swimAct(w, sh, sec) {
  let left = sec, k = 0, back = false;
  return {
    name: 'swim',
    start(c) {
      left = sec; back = false;
      c.pose = 'swim';
      c.swimming = true;
      c.setTool(null);
      swimwear(c, true);   // changes into a swimsuit at the water's edge
      c.say('🏊', 2);
      const p = c.root.position;
      let bd = Infinity;
      w.swimLoop.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; k = i; } });
      c.game.effects.emit('splash', { x: p.x, y: .2, z: p.z }, 10);
    },
    update(c, dt) {
      left -= dt;
      if (left <= 0) back = true;
      const tg = back ? sh : w.swimLoop[k], p = c.root.position;
      const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
      if (d < .6) { if (back) return true; k = (k + 1) % w.swimLoop.length; return false; }
      // someone swimming right in front: slow down instead of swimming through them
      let sp = 1.6;
      for (const o of c.game.chars) {
        if (o === c || !o.swimming) continue;
        const ox = o.root.position.x - p.x, oz = o.root.position.z - p.z, od = Math.hypot(ox, oz);
        if (od < 1.8 && (ox * dx + oz * dz) > 0) sp = .3;
      }
      const s = Math.min(d, sp * dt);
      p.x += dx / d * s;
      p.z += dz / d * s;
      c.faceAngle = Math.atan2(dx, dz);
      if (Math.random() < dt * 2.2) c.game.effects.emit('splash', { x: p.x + Math.sin(c.root.rotation.y) * .6, y: .15, z: p.z + Math.cos(c.root.rotation.y) * .6 }, 2);
      return false;
    },
    end(c) {
      c.swimming = false;
      c.pose = 'idle';
      swimwear(c, false);
      c.game.effects.emit('sparkle', { x: sh.x, y: 1.2, z: sh.z }, 6);
      c.root.position.set(sh.x, 0, sh.z);
      c.say(pick(['😎', '💦', '🥶']), 2);
    },
  };
}

// ---------- parks: a stroll on the path, a rest on a bench ----------
export function parkActs(c) {
  const g = c.game;
  if (!g.parks.list.length) return null;
  const benches = g.props.list.filter(b => b.type === 'bench' && !b.user && g.parks.at(b.x, b.z));
  const pos = c.root.position;
  benches.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
  const b = Math.random() < .7 && benches.slice(0, 4)[Math.floor(Math.random() * Math.min(4, benches.length))];
  if (b) {
    const fx = Math.sin(b.rot), fz = Math.cos(b.rot), front = { x: b.x + fx * 1.2, z: b.z + fz * 1.2 };
    return [goTo(front.x, front.z), {
      name: 'bench',
      start(x) { b.user = x.id; x.root.position.set(b.x + fx * .15, 0, b.z + fz * .15); x.faceAngle = b.rot; x.root.rotation.y = b.rot; x.pose = 'sit'; this.left = rand(8, 16); if (Math.random() < .3) x.say(pick(['😌', '🌳', '☀️', '🐦'])); },
      update(x, dt) { this.left -= dt; return this.left <= 0; },
      end(x) { b.user = null; x.pose = 'idle'; x.root.position.set(front.x, 0, front.z); },
    }];
  }
  const s = g.paths.walkSpot(pos) || null;
  return s ? [goTo(s.x, s.z), wait(rand(2, 4), 'idle')] : null;
}

// ---------- by the lake: a rest on a bench looking at the water, or a walk along the beach ----------
export function lakeActs(c) {
  const g = c.game, W = g.water, lakes = W.list.filter(w => w.kind === 'lake');
  if (!lakes.length) return null;
  const pos = c.root.position;
  const near = lakes.filter(w => Math.hypot(w.c.x - pos.x, w.c.z - pos.z) < 160);
  if (!near.length) return null;
  const benches = g.props.list.filter(b => b.type === 'bench' && !b.user && near.some(w => !W.wetIn(w, b.x, b.z) && W.wetIn(w, b.x, b.z, 6)));
  benches.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
  const b = Math.random() < .55 && benches.slice(0, 5)[Math.floor(Math.random() * Math.min(5, benches.length))];
  if (b) {
    const fx = Math.sin(b.rot), fz = Math.cos(b.rot), front = { x: b.x + fx * 1.2, z: b.z + fz * 1.2 };
    return [goTo(front.x, front.z), {
      name: 'bench',
      start(x) { b.user = x.id; x.root.position.set(b.x + fx * .15, 0, b.z + fz * .15); x.faceAngle = b.rot; x.root.rotation.y = b.rot; x.pose = 'sit'; this.left = rand(10, 20); if (Math.random() < .35) x.say(pick(['😌', '🌊', '🦆', '☀️'])); },
      update(x, dt) { this.left -= dt; return this.left <= 0; },
      end(x) { b.user = null; x.pose = 'idle'; x.root.position.set(front.x, 0, front.z); },
    }];
  }
  // a stroll round the lake: two or three spots along the beach
  const list = [];
  for (let k = 0; k < 3; k++) { const s = W.beachSpot(pos); if (s) list.push(goTo(s.x, s.z), wait(rand(1, 3), 'idle')); }
  return list.length ? list : null;
}

// ---------- the "brain": what to do when nobody gives orders ----------
// ---------- the five prayers (by the town's clock): people go to the nearest mosque ----------
const PRAYERS = [4.75, 12.1, 15.4, 17.9, 19.4];
export function prayerNow(g) {
  const h = g.daynight.hour;
  return PRAYERS.findIndex(t => h >= t && h < t + .5);
}
function prayerActs(c) {
  const g = c.game, k = prayerNow(g);
  if (k < 0 || c.job === 'imam') return null;
  const key = new Date().toDateString() + k;
  if (c.prayed === key) return null;
  c.prayed = key;   // decided once per prayer
  const friday = new Date().getDay() === 5 && k === 1;
  if (Math.random() > (friday ? .8 : .35)) return null;
  const m = g.town.nearest('mosque', c.root.position);
  if (!m || dist2d(m.center, c.root.position) > 260) return null;
  const s = m.reserve('pray');
  if (!s) return null;
  return [toSpot(m, s), wait(32, 'pray', { face: s.face, onStart: x => Math.random() < .3 && x.say('🤲'), onEnd: () => m.release('pray', s.idx) })];
}
// a trip by plane: into the terminal, away for a while, back with a suitcase
function travelActs(c, port, pilot = false) {
  const d = port.spot('door'), inside = port.point('inside');
  return [toSpot(port, d), wait(1.5, 'wave', { onStart: x => x.say(pilot ? '🧑‍✈️' : '🧳') }),
    call(x => x.root.position.set(inside.x, 0, inside.z)), wait(rand(50, 110), 'idle'),
    call(x => { x.root.position.set(d.x, 0, d.z); x.say(pick(pilot ? ['✈️', '🧑‍✈️👋'] : ['🧳✈️', '🌍', '😎']), 3); })];
}

export function brain(c) {
  const g = c.game;
  if (c.hurt) return routine(patientRoutine(c), 'patient');
  const pr = prayerActs(c);
  if (pr) return routine(pr, 'pray');
  // festive days carry on after dark: everyone gathers for the fireworks
  const ev = NIGHT_EVENTS.includes(g.events.active) || !g.daynight.isNight ? g.events.routineFor(c) : null;
  if (ev) return routine(ev, 'event');
  if (g.nightSleep && g.daynight.isNight && !NIGHT_SHIFT.includes(c.job) && homeOf(c)) return routine(sleepActs(c, true), 'sleep');
  // in the daytime, people work on the building they are building for themselves
  const mine = !g.daynight.isNight && g.town.sites().find(b => b.builtBy === c.id);
  if (mine && Math.random() < .45) return routine([buildAct(mine)], 'build');
  if (c.job === 'builder') {
    const site = !g.daynight.isNight && g.town.siteFor(c.root.position);
    if (site) return routine([buildAct(site)], 'build');
  } else if (c.job !== 'none' && !(g.daynight.isNight && !NIGHT_SHIFT.includes(c.job))) {
    const wp = g.workplaceFor(c);
    if (wp) { const l = jobRoutine(c, wp); if (l.length) return routine(l, 'work'); }
    // fishers without a fishing pond fish in the river or lake
    else if (c.job === 'fisher' && g.water.list.length) { const l = waterFishActs(c); if (l) return routine(l, 'work'); }
  }
  return routine(idleRoutine(c), 'idle');
}

function patientRoutine(c) {
  const g = c.game;
  const h = g.town.nearest('hospital', c.root.position);
  if (!h) return [wait(5, 'hurt', { onStart: x => x.say('🤕') })];
  const bed = h.reserve('patient');
  if (!bed) return [wait(4, 'hurt', { onStart: x => x.say('🤕') })];
  return [toSpot(h, bed), call(x => { x.atHospital = h.id; x.patientBed = bed; }), wait(30, 'lie', {
    face: bed.face,
    onStart: x => x.say(g.chars.some(d => d.job === 'doctor') ? '🤕' : '👨‍⚕️❓'),
    tick: x => !x.hurt,
    onEnd: () => h.release('patient', bed.idx),
  })];
}

function jobRoutine(c, wp) {
  const g = c.game;
  const idx = g.workerIndex(c, wp);
  const chance = p => Math.random() < p;
  const workAt = (sec, pose, o = {}) => {
    const s = wp.spot('work', idx);
    return [toSpot(wp, s), wait(sec, o.pose || pose, { face: s.face, ...o })];
  };
  switch (c.job) {
    case 'shopkeeper':
      return workAt(rand(6, 10), 'sell', { onStart: x => chance(.35) && x.say(pick(['👋', wp.emoji, '🛍️', '💰'])) });
    case 'chef':
      return workAt(rand(7, 10), 'stir', {
        tool: 'ladle',
        onStart: x => chance(.3) && x.say(pick(['🍕', '🍝', '🍲', '😋', '🍔'])),
        tick: x => { if (Math.random() < .05) g.effects.emit('steam', { x: x.root.position.x + Math.sin(x.root.rotation.y) * .8, y: x.root.position.y + 1.4, z: x.root.position.z + Math.cos(x.root.rotation.y) * .8 }); },
      });
    case 'farmer': {
      const k = wp.randomCrop(), s = wp.cropSpot(k);
      return [goTo(s.x, s.z, { face: s.face }), wait(rand(3, 5), 'hoe', {
        face: s.face, tool: 'hoe',
        tick: (x, dt) => { if (Math.random() < dt * 1.5) g.effects.emit('dust', { x: s.x + Math.sin(s.face) * .9, y: .2, z: s.z + Math.cos(s.face) * .9 }); },
        onEnd: (x, done) => { if (!done) return; const h = wp.tendCrop(k); if (h) { x.say(h, 2.5); g.effects.emit('sparkle', headPos(x), 4); } },
      })];
    }
    case 'police': {
      if (chance(.35)) return workAt(rand(6, 9), 'sit', { onStart: x => chance(.3) && x.say('📋') });
      const p = g.world.randomSpot(c.root.position, 30);
      return [goTo(p.x, p.z), wait(rand(1.5, 3), 'idle', { onStart: x => chance(.3) && x.say(pick(['🚓', '👮', '🚨', '👀'])) })];
    }
    case 'firefighter': {
      const fire = g.town.burning()[0];
      if (fire) return [fightFire(fire)];
      return workAt(rand(4, 7), 'idle');
    }
    case 'imam': {
      // at prayer time he leads the prayer (and calls it first); otherwise he greets people at the door
      const now = prayerNow(g) >= 0;
      return workAt(rand(10, 16), now ? 'pray' : 'idle', { onStart: x => { if (now && chance(.5)) x.say('📢 الله أكبر', 4); else if (chance(.3)) x.say(pick(['🕌', '🤲', '📿'])); } });
    }
    case 'professor':
      return workAt(rand(8, 12), 'point', { tool: 'pointer', onStart: x => chance(.6) && x.say(pick(['🎓', '📐', '🔬', '📖', '🧪', '🌍'])) });
    case 'pilot':
      if (chance(.3)) return travelActs(c, wp, true);
      return workAt(rand(6, 10), 'idle', { onStart: x => chance(.4) && x.say(pick(['✈️', '🧑‍✈️', '🛫', '🛬'])) });
    case 'operator':
      return workAt(rand(6, 10), 'idle', { onStart: x => chance(.4) && x.say(pick(['🎡', '🎠', '🎢', '🎟️'])) });
    case 'teacher':
      return workAt(rand(7, 10), 'point', { tool: 'pointer', onStart: x => x.say(pick(['📚', '✏️', '🔤', '➕', '🌍', '🧮'])) });
    case 'fisher': {
      const s = wp.spot('work', idx);
      return [toSpot(wp, s), wait(rand(5, 9), 'fish', {
        face: s.face, tool: 'rod',
        onStart: () => wp.fishing++,
        onEnd: (x, done) => {
          wp.fishing = Math.max(0, wp.fishing - 1);
          if (done) { g.effects.emit('splash', wp.point('bobber'), 10); x.say(pick(['🐟', '🐠', '🎣', '🐡', '👢']), 2); }
        },
      }), wait(1.5, 'cheer', { tool: 'fish' })];
    }
    case 'doctor': {
      const pat = g.chars.find(p => p.hurt && p.atHospital === wp.id && p.patientBed && !(p.healerUntil > g.time));
      if (pat) {
        const bi = pat.patientBed.idx;
        const stand = wp.spot('work', bi);
        return [
          call(() => { pat.healerUntil = g.time + 20; }),
          toSpot(wp, stand),
          wait(3.5, 'heal', {
            tool: 'clipboard',
            faceEach: x => angleTo(x.root.position, pat.root.position),
            onStart: x => x.say('🩺'),
            tick: (x, dt) => {
              if (!pat.hurt || !g.chars.includes(pat)) return true;
              if (Math.random() < dt * 5) g.effects.emit('sparkle', { x: pat.root.position.x, y: pat.root.position.y + 1.2, z: pat.root.position.z });
            },
            onEnd: (x, done) => { pat.healerUntil = 0; if (done && pat.hurt) g.heal(pat); },
          }),
        ];
      }
      return workAt(rand(3, 5), 'idle');
    }
  }
  return [wait(3)];
}

function idleRoutine(c) {
  const g = c.game, town = g.town, r = Math.random();
  const night = g.daynight.isNight;
  if (r < .18) {
    const o = g.nearbyIdle(c, 12);
    if (o) { o.command([chatAct(c, false)], false); return [chatAct(o, true)]; }
  }
  if (!night && g.parks.list.length && Math.random() < .14) { const l = parkActs(c); if (l) return l; }
  if (!night && g.water.list.length && Math.random() < .12) { const l = lakeActs(c); if (l) return l; }
  if (!night && g.water.list.length && Math.random() < .09) {
    const r2 = Math.random();
    const l = r2 < .45 ? swimActs(c) : r2 < .65 ? boatActs(c) : waterFishActs(c);
    if (l) return l;
  }
  // a day out: the amusement park, a lecture at the university, a trip by plane
  if (g.daynight.hour > 8 && g.daynight.hour < 23 && Math.random() < .08) {
    const am = town.nearest('amusement', c.root.position), s = am && am.reserve('fun');
    if (s) return [toSpot(am, s), wait(rand(8, 14), s.pose, { face: s.face, onStart: x => x.say(pick(['🎡', '🎠', '😄', '🤩', '🍿', '🎢'])), onEnd: () => am.release('fun', s.idx) })];
  }
  if (!night && Math.random() < .06) {
    const un = town.nearest('university', c.root.position), s = un && un.reserve('study');
    if (s) return [toSpot(un, s), wait(rand(10, 16), 'sitGround', { face: s.face, onStart: x => x.say(pick(['📖', '✏️', '🎓', '🤔'])), onEnd: () => un.release('study', s.idx) })];
  }
  if (!night && Math.random() < .015) { const ap = town.nearest('airport', c.root.position); if (ap) return travelActs(c, ap); }
  if (!night) {
    if (r < .28) { const shop = town.randomOf('shop'); if (shop) { const l = buyActs(c, shop); if (l.length) return l; } }
    if (r < .38) { const rest = town.randomOf('restaurant'); if (rest) { const l = eatActs(c, rest); if (l.length) return l; } }
    if (r < .46) { const sch = town.randomOf('school'); if (sch) { const l = sitActs(sch, '📚', rand(8, 12)); if (l.length) return l; } }
  }
  if (r < .54) { const park = town.randomOf('park'); if (park) { const l = sitActs(park); if (l.length) return l; } }
  if (r < .62) {
    const home = homeOf(c);
    if (home) {
      const kind = Math.random() < .5 ? 'seat' : 'work';
      const l = useSpot(home, kind, rand(6, 10), { pose: kind === 'work' ? 'stir' : undefined, onStart: x => Math.random() < .3 && x.say(kind === 'work' ? '🍳' : '📺') });
      if (l) return l;
    }
  }
  let p;
  const built = town.all.filter(b => b.complete);
  if (built.length && Math.random() < .45) p = pick(built).spot('front', c.id);
  // otherwise a stroll along a sidewalk nearby (or a footpath)
  else p = (g.paths?.list.length && Math.random() < .35 && g.paths.walkSpot(c.root.position)) || g.tiles.walkSpot(c.root.position) || g.world.randomSpot(c.root.position, 16);
  const list = [goTo(p.x + rand(-1.5, 1.5), p.z + rand(-1.5, 1.5)), wait(rand(1.5, 4), 'idle')];
  if (Math.random() < .15) list.push(say(pick(IDLE)));
  return list;
}
