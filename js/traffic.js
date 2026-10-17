// Driving: residents drive their own car on long trips, everybody else sometimes takes a taxi.
// Cars follow the road tiles (asphalt and dirt) and the curved roads joined to them, keep to the right lane,
// slow down behind other cars and wait at red traffic lights.
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { sampleCurve } from './curves.js';
import { makeCar } from './vehicles.js';
import { box } from './util.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const H = TILE / 2, LANE = 1.8;   // centre of the right lane
const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const key = (i, j) => i + ',' + j;
const right = (dx, dz) => [-dz, dx];   // the right-hand side of a direction (x east, z south)
// do two car bodies (centre x/z, heading r) touch? (with a safety margin)
function bodiesTouch(ax, az, ar, bx, bz, br, m = .65) {
  const hw = 1.03 + m, hl = 2.25 + m;
  const axes = [[Math.sin(ar), Math.cos(ar)], [Math.cos(ar), -Math.sin(ar)], [Math.sin(br), Math.cos(br)], [Math.cos(br), -Math.sin(br)]];
  const ext = (r, ax2, az2) => hw * Math.abs(Math.cos(r) * ax2 - Math.sin(r) * az2) + hl * Math.abs(Math.sin(r) * ax2 + Math.cos(r) * az2);
  for (const [ux, uz] of axes) if (Math.abs((bx - ax) * ux + (bz - az) * uz) > ext(ar, ux, uz) + ext(br, ux, uz)) return false;
  return true;
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
  }
  get T() { return this.game.tiles; }

  // ---------- the road network ----------
  // neighbours of a road tile: the 4 tiles around it, plus the far end of every curved road joined to it
  links(i, j) {
    const out = [];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.T.isDrivable(i + a, j + b)) out.push({ i: i + a, j: j + b });
    for (const c of this.game.curves.list) {
      if (c.links?.length !== 2) continue;
      const [A, B] = c.links;
      if (A.i === i && A.j === j) out.push({ i: B.i, j: B.j, via: c, fwd: true });
      else if (B.i === i && B.j === j) out.push({ i: A.i, j: A.j, via: c, fwd: false });
    }
    return out;
  }
  route(a, b) {
    const start = key(a.i, a.j), goal = key(b.i, b.j), prev = new Map([[start, null]]), q = [a];
    for (let h = 0; h < q.length && q.length < 6000; h++) {
      const cur = q[h];
      if (key(cur.i, cur.j) === goal) break;
      for (const n of this.links(cur.i, cur.j)) {
        const k = key(n.i, n.j);
        if (prev.has(k)) continue;
        prev.set(k, { from: cur, step: n });
        q.push(n);
      }
    }
    if (!prev.has(goal)) return null;
    const out = [];
    for (let k = goal; k; ) {
      const p = prev.get(k);
      if (!p) { out.push({ i: a.i, j: a.j }); break; }
      out.push(p.step);
      k = key(p.from.i, p.from.j);
    }
    return out.reverse();
  }
  nearestRoad(x, z, r = 3) {
    const ti = tileOf(x), tj = tileOf(z);
    let best = null, bd = Infinity;
    for (let a = ti - r; a <= ti + r; a++) for (let b = tj - r; b <= tj + r; b++) {
      if (!this.T.isDrivable(a, b)) continue;
      const d = Math.hypot(a * TILE - x, b * TILE - z);
      if (d < bd) { bd = d; best = { i: a, j: b }; }
    }
    return best;
  }
  // a road tile a few steps away along the network (where a taxi comes from / goes to)
  away(t, steps) {
    let cur = t, last = null;
    for (let s = 0; s < steps; s++) {
      const opts = this.links(cur.i, cur.j).filter(n => !n.via && !(last && n.i === last.i && n.j === last.j));
      if (!opts.length) break;
      last = cur;
      cur = opts[Math.floor(Math.random() * opts.length)];
    }
    return cur;
  }
  lights(i, j) {
    if (!this.T.isJunction(i, j)) return false;
    return this.game.props.list.some(p => p.type === 'traffic' && Math.abs(p.x - i * TILE) < 11 && Math.abs(p.z - j * TILE) < 11);
  }
  green(axis) { return (this.game.time + (axis === 'x' ? 7 : 0)) % 14 < 6; }

  // ---------- turning a route into points along the right lane ----------
  lanePath(route) {
    const pts = [], gates = [];
    const push = (x, z, y = this.T.groundY(x, z)) => pts.push({ x, z, y });
    const dirBetween = (a, b) => {
      if (b.via) { const l = b.via.links[b.fwd ? 0 : 1]; return SIDE[l.side]; }   // leaving a through the curve's side
      return [Math.sign(b.i - a.i), Math.sign(b.j - a.j)];
    };
    const dirInto = (a, b) => {
      if (b.via) { const l = b.via.links[b.fwd ? 1 : 0]; const s = SIDE[l.side]; return [-s[0], -s[1]]; }
      return [Math.sign(b.i - a.i), Math.sign(b.j - a.j)];
    };
    for (let k = 0; k < route.length; k++) {
      const cur = route[k], prev = route[k - 1], next = route[k + 1];
      const cx = cur.i * TILE, cz = cur.j * TILE;
      // arriving over a curved road: follow it (it may be a bridge: y goes up and down)
      if (cur.via) {
        let S = cur.via.S;
        const sgn = cur.fwd ? 1 : -1;
        if (!cur.fwd) S = S.slice().reverse();
        for (const s of S) push(s.x + s.nx * LANE * sgn, s.z + s.nz * LANE * sgn, s.y);
      }
      const din = prev ? dirInto(prev, cur) : null, dout = next ? dirBetween(cur, next) : null;
      if (!din && !dout) { push(cx, cz); continue; }
      if (!din) { const [rx, rz] = right(...dout); push(cx - dout[0] * 2 + rx * LANE, cz - dout[1] * 2 + rz * LANE); push(cx + dout[0] * H + rx * LANE, cz + dout[1] * H + rz * LANE); continue; }
      const [rx, rz] = right(...din);
      const ex = cx - din[0] * H + rx * LANE, ez = cz - din[1] * H + rz * LANE;   // where we enter the tile
      if (this.lights(cur.i, cur.j)) gates.push({ k: pts.length, axis: din[0] ? 'x' : 'z' });
      push(ex, ez);
      if (!dout) { push(cx + rx * LANE, cz + rz * LANE); continue; }
      const [ox, oz] = right(...dout);
      const xx = cx + dout[0] * H + ox * LANE, xz = cz + dout[1] * H + oz * LANE;  // where we leave it
      if (din[0] === dout[0] && din[1] === dout[1]) { push(xx, xz); continue; }
      if (din[0] === -dout[0] && din[1] === -dout[1]) {
        // dead end: turn around
        push(cx + din[0] * (H - 2.5) + rx * LANE, cz + din[1] * (H - 2.5) + rz * LANE);
        push(cx + din[0] * (H - 2.5) - rx * LANE, cz + din[1] * (H - 2.5) - rz * LANE);
        push(xx, xz);
        continue;
      }
      // a turn: smooth curve between the two lanes
      const px = cx + (rx + ox) * LANE, pz = cz + (rz + oz) * LANE;
      for (let u = .2; u <= 1.001; u += .2) {
        const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        push(a * ex + b * px + c * xx, a * ez + b * pz + c * xz);
      }
    }
    return { pts, gates };
  }

  // ---------- trips ----------
  // should c go there by car? (long distances; own car if it's close, otherwise sometimes a taxi)
  wantsRide(c, x, z) {
    const force = c.forceRide;
    const d = Math.hypot(x - c.root.position.x, z - c.root.position.z);
    if (c.hurt || c.inCar || c.upstairs || this.cars.length >= 14) return false;
    if (d < (force ? 24 : 70)) return false;
    if (!this.nearestRoad(c.root.position.x, c.root.position.z) || !this.nearestRoad(x, z)) return false;
    if (force) return true;
    const own = this.ownCar(c);
    return Math.random() < (own ? .8 : .35);
  }
  ownCar(c) {
    const p = c.root.position;
    // the car parked furthest out (on the driveway, not the one behind it under the carport) goes first
    return [...this.game.vehicles.ofOwner(c.id)].reverse().find(v => !v.busy && !v.stored && Math.hypot(v.x - p.x, v.z - p.z) < 45) || null;
  }
  // where an own car will be left at the end of a trip: the home carport, or a free bay in a car park
  // near the destination. Cars are never left on the street: no place there = no driving there.
  parkPlan(c, v, x, z) {
    const g = this.game, home = g.town.get(c.homeId), k = g.vehicles.ofOwner(v.ownerId).indexOf(v);
    if (home?.complete && home.parkSpots?.[k] && Math.hypot(home.center.x - x, home.center.z - z) < 25) {
      const [lx, lz] = home.parkSpots[k], w = home.toWorld(lx, lz), f = home.toWorld(lx, home.D / 2 + 3.4);
      return { x: w.x, z: w.z, rot: home.angle, bay: null, out: [f], into: [f, w] };
    }
    const gs = g.vehicles.garageSpot(v, { x, z });
    if (gs && Math.hypot(gs.x - x, gs.z - z) < 55) return { ...gs, into: [...gs.out].reverse().concat([{ x: gs.x, z: gs.z }]) };
    return null;
  }
  // plan a trip; returns the trip or null (then the citizen just walks)
  startTrip(c, x, z) {
    const g = this.game, p = c.root.position;
    const taxiOnly = c.forceRide === 'taxi', forced = !!c.forceRide;
    c.forceRide = null;
    let own = !taxiOnly && this.ownCar(c);
    const park = own && this.parkPlan(c, own, x, z);
    if (own && !park) { own = null; if (!forced && Math.random() < .5) return null; }   // nowhere to park there: taxi (or walk)
    const exit = own && own.out?.length ? own.out[own.out.length - 1] : own;
    const end = park ? park.into[0] : { x, z };
    const from = own ? this.nearestRoad(exit.x, exit.z) : this.nearestRoad(p.x, p.z), to = this.nearestRoad(end.x, end.z);
    if (!from || !to || (from.i === to.i && from.j === to.j)) return null;
    const ride = this.route(from, to);
    if (!ride || ride.length < 3) return null;
    const lp = this.lanePath(ride);
    if (park) lp.pts.push(...park.into.map(q => ({ x: q.x, z: q.z, y: 0 })));   // off the road into the carport / bay
    // (two taxis for the same corner simply queue: the second waits behind the first, then pulls up)
    const start = lp.pts[0];
    const dir0 = [lp.pts[1].x - start.x, lp.pts[1].z - start.z], l0 = Math.hypot(...dir0) || 1;
    const [rx, rz] = right(dir0[0] / l0, dir0[1] / l0);
    // the passenger waits on the sidewalk next to where the car starts
    const curb = { x: start.x + rx * (H - LANE - .9), z: start.z + rz * (H - LANE - .9) };
    const trip = { c, final: { x, z }, curb, phase: 'walk', ride: lp, park };
    let car;
    if (own) {
      own.busy = true;   // (it stays in the walk grid until they get in, so people walk around it)
      car = { group: own.group, own, pts: [], gates: [], k: 0, v: 0, state: 'wait', trip };
      // the passenger walks to the car door on their side (beside it, never through it)
      const doors = [1, -1].map(sd => ({ x: own.x + Math.cos(own.rot) * 1.8 * sd, z: own.z - Math.sin(own.rot) * 1.8 * sd }))
        .filter(q => g.world.grid.freeAt(q.x, q.z));
      doors.sort((a2, b2) => Math.hypot(a2.x - p.x, a2.z - p.z) - Math.hypot(b2.x - p.x, b2.z - p.z));
      trip.curb = doors[0] || { x: own.x + Math.cos(own.rot) * 1.8, z: own.z - Math.sin(own.rot) * 1.8 };
    } else {
      // a taxi comes from a few streets away, from a spot where no other car is
      const freeAt = t => t && !this.cars.some(o => Math.hypot(o.group.position.x - t.i * TILE, o.group.position.z - t.j * TILE) < 10);
      let spawn = null;
      for (let n = 0; n < 14 && !spawn; n++) { const t = this.away(from, 3 + n % 5); if (freeAt(t)) spawn = t; }
      if (!spawn) return null;   // the streets around are busy: walk instead
      const r1 = this.route(spawn, from);
      const g1 = makeCar('car', '#ffcf3f');
      box(.9, .3, .45, '#ffffff', 0, 1.88, -.2, g1);
      box(.92, .12, .47, '#222222', 0, 1.78, -.2, g1);
      g.scene.add(g1);
      const lp1 = r1 && r1.length > 1 ? this.lanePath(r1) : { pts: [start], gates: [] };
      car = { group: g1, taxi: true, pts: [...lp1.pts, start], gates: lp1.gates, k: 0, v: 0, state: 'pickup', trip };
      g1.position.set(car.pts[0].x, 0, car.pts[0].z);
    }
    trip.car = car;
    car.id = this.serial = (this.serial || 0) + 1;   // older cars have priority when two block each other
    this.cars.push(car);
    c.path = g.world.grid.findPath(p.x, p.z, trip.curb.x, trip.curb.z);
    c.say(own ? '🚗' : '🚕', 2.5);
    return trip;
  }
  // the name of who is in the car, above it
  setLabel(car, c) {
    if (car.label) { car.group.remove(car.label); car.label = null; }
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'clabel';
    el.innerHTML = '<div class="inner"><b></b><span></span></div>';
    el.querySelector('b').textContent = c.name;
    el.querySelector('b').dir = 'auto';
    el.querySelector('span').textContent = car.taxi ? '🚕' : '🚗';
    car.label = new CSS2DObject(el);
    car.label.position.set(0, 3.2, 0);
    car.group.add(car.label);
  }
  // the citizen changed plans: get out beside the car
  cancel(c) {
    const tr = c.trip;
    if (!tr) return;
    c.trip = null;
    if (c.inCar) {
      c.inCar = false;
      const grid = this.game.world.grid, p = tr.car.group.position, d = grid.nearestFree(grid.cell(p.x + 2), grid.cell(p.z), 6);
      c.root.position.set(d ? grid.center(d[0]) : p.x, 0, d ? grid.center(d[1]) : p.z);
    }
    this.finishCar(tr.car, false);
  }
  // after the trip: a taxi drives off and disappears; an own car stays in its carport / bay
  finishCar(car, arrived) {
    const park = car.trip?.park;
    car.trip = null;
    this.setLabel(car, null);
    if (car.own) {
      const g = car.group, v = car.own, V = this.game.vehicles;
      v.busy = false;
      if (arrived && park) {
        v.x = park.x; v.z = park.z; v.rot = park.rot; v.bay = park.bay; v.out = park.out; v.away = false;
        g.position.set(v.x, this.T.groundY(v.x, v.z), v.z);
        g.rotation.y = v.rot;
        V.block(v);
      } else V.park(v);   // plans changed on the way: it goes back to its parking place
      this.cars.splice(this.cars.indexOf(car), 1);
      return;
    }
    const here = this.nearestRoad(car.group.position.x, car.group.position.z), far = here && this.away(here, 7);
    const r = here && far && this.route(here, far);
    const lp = r && r.length > 1 ? this.lanePath(r) : { pts: [], gates: [] };
    car.pts = lp.pts; car.gates = lp.gates; car.k = 0; car.from = null; car.state = 'leave';
    if (!lp.pts.length) this.dropCar(car);
  }
  dropCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (car.taxi) this.game.scene.remove(car.group);
  }

  // ---------- every frame ----------
  update(dt) {
    for (const car of [...this.cars]) this.drive(car, dt);
    this.keepPeopleOut();
  }
  // nobody ever stands inside a car: anyone overlapping one is moved out beside it
  keepPeopleOut() {
    const boxes = [...this.cars.map(c => c.group), ...this.game.vehicles.list.filter(v => !v.busy && !v.stored).map(v => v.group)];
    for (const ch of this.game.chars) {
      if (ch.inCar || ch.inBus || !ch.root.visible) continue;
      const p = ch.root.position;
      for (const b of boxes) {
        const dx = p.x - b.position.x, dz = p.z - b.position.z;
        if (dx * dx + dz * dz > 10) continue;
        const r = b.rotation.y, fx = Math.sin(r), fz = Math.cos(r), lx = dx * fz - dz * fx, lz = dx * fx + dz * fz;
        if (Math.abs(lx) < 1.3 && Math.abs(lz) < 2.55) {
          const sx = lx >= 0 ? 1 : -1;
          p.x = b.position.x + (sx * 1.45) * fz + lz * fx;
          p.z = b.position.z - (sx * 1.45) * fx + lz * fz;
        }
      }
    }
  }
  tileKey(x, z) { return key(tileOf(x), tileOf(z)); }
  drive(car, dt) {
    const tr = car.trip, c = tr?.c, g = car.group;
    if (tr && !this.game.chars.includes(c)) { this.finishCar(car, false); return; }
    // waiting for the passenger at the pickup point / beside the parked car
    if (car.state === 'wait') {
      // they get in at the door point, or as soon as they reach the car from either side
      const cp = c.root.position, gp2 = g.position;
      if (tr.phase === 'atCurb' || Math.hypot(cp.x - tr.curb.x, cp.z - tr.curb.z) < 1.5 || Math.hypot(cp.x - gp2.x, cp.z - gp2.z) < 3.3) {
        c.inCar = true;
        c.path = null;
        tr.phase = 'ride';
        car.state = 'ride';
        if (car.own) this.game.vehicles.unblock(car.own);
        this.setLabel(car, c);
        // an own car first rolls out of its carport / bay along the driveway
        const pre = car.own ? (car.own.out || []).map(q => ({ x: q.x, z: q.z, y: 0 })) : [];
        car.pts = [...pre, ...tr.ride.pts]; car.gates = tr.ride.gates.map(q => ({ ...q, k: q.k + pre.length })); car.k = 0; car.from = null;
      }
      return;
    }
    const pts = car.pts;
    if (car.k >= pts.length) {
      if (car.state === 'pickup') { car.state = 'wait'; return; }
      if (car.state === 'ride') { this.arrive(car); return; }
      this.dropCar(car);
      return;
    }
    const tgt = pts[car.k], p = g.position;
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    // almost at the final stop (pickup / drop-off): just pull in, don't block the street waiting for the car behind
    if (car.k === pts.length - 1 && d < 1.6 && car.state !== 'leave') { p.x = tgt.x; p.z = tgt.z; car.v = 0; car.k++; car.from = null; return; }
    // red light ahead? stop at the line
    let want = car.state === 'leave' || !car.own ? 9 : 8;
    const gate = car.gates.find(q => q.k === car.k);
    if (gate && d < 3 && !this.green(gate.axis)) want = 0;
    const hx = Math.sin(g.rotation.y), hz = Math.cos(g.rotation.y);
    const ahead = (ox, oz) => [ox * hx + oz * hz, Math.abs(-ox * hz + oz * hx)];
    const ghost = car.stuck > 20;   // last resort if a jam never clears
    // two cars waiting for each other: the older one goes, the younger one gives way
    const yields = o => !(o.blockedBy === car && (car.id || 0) < (o.id || 0));
    car.blockedBy = null;
    // other cars (driving or parked) in front: keep a car's length away, never drive into one
    for (const o of this.cars) {
      if (o === car || ghost) continue;
      const [a, sd] = ahead(o.group.position.x - p.x, o.group.position.z - p.z);
      if (a > 0 && sd < 2.4 && a < 9 && yields(o)) { want = Math.min(want, a < 5.6 ? 0 : 3); if (a < 5.6) car.blockedBy = o; }
    }
    for (const v of this.game.vehicles.list) {
      if (v.busy || v.stored || v.group === g) continue;
      const [a, sd] = ahead(v.x - p.x, v.z - p.z);
      if (a > 0 && a < 5.6 && sd < 2.3) want = 0;
    }
    // people crossing in front: wait for them
    for (const ch of this.game.chars) {
      if (ch.inCar || ch === c || !ch.root.visible) continue;
      const ox = ch.root.position.x - p.x, oz = ch.root.position.z - p.z, [a, sd] = ahead(ox, oz);
      if (a > 0 && a < 4.2 && sd < 1.7) {
        want = 0;
        // someone standing still in the street steps aside after a moment so the car can pass
        ch.inWayT = (ch.inWayT || 0) + dt;
        if (ch.inWayT > 1.5 && (!ch.moving || ch.inWayT > 5)) {
          const sgn = (-ox * hz + oz * hx) >= 0 ? 1 : -1;
          ch.root.position.x += -hz * sgn * 2.4;
          ch.root.position.z += hx * sgn * 2.4;
          ch.inWayT = 0;
        }
      }
    }
    // never drive into another car: look where our body will be in a moment
    const look = Math.max(car.v, 2.5) * .35, nx = p.x + (d > .01 ? dx / d : hx) * look, nz = p.z + (d > .01 ? dz / d : hz) * look;
    if (!ghost) {
      for (const o of this.cars) {
        if (o === car || (o.state === 'wait' && o.own)) continue;
        const op = o.group.position;
        if (bodiesTouch(nx, nz, Math.atan2(dx, dz), op.x, op.z, o.group.rotation.y) && Math.hypot(op.x - nx, op.z - nz) < Math.hypot(op.x - p.x, op.z - p.z) + .01 && yields(o)) { want = 0; car.blockedBy = o; }
      }
    }
    // a junction is entered only when no other car is in it
    const nextT = this.tileKey(tgt.x, tgt.z);
    if (nextT !== this.tileKey(p.x, p.z) && this.T.isJunction(tileOf(tgt.x), tileOf(tgt.z)) &&
      this.cars.some(o => o !== car && this.tileKey(o.group.position.x, o.group.position.z) === nextT)) want = 0;
    car.stuck = want === 0 && !gate ? (car.stuck || 0) + dt : 0;
    if (car.stuck > 22) car.stuck = 0;
    // giving way to an older car that waits for us: back up a little to make room
    const bb = car.blockedBy;
    if (want === 0 && bb && bb.blockedBy === car && (car.id || 0) > (bb.id || 0)) {
      const bp = bb.group.position, bx = p.x - hx * 1.5 * dt, bz = p.z - hz * 1.5 * dt;
      if (Math.hypot(bx - bp.x, bz - bp.z) > Math.hypot(p.x - bp.x, p.z - bp.z)) { p.x = bx; p.z = bz; car.from = null; }
      car.v = 0;
      if (car.state === 'ride' && c) c.root.position.set(p.x, p.y, p.z);
      return;
    }
    car.v += Math.max(-14 * dt, Math.min(6 * dt, want - car.v));
    const step = Math.max(0, car.v) * dt;
    const from = car.from || (car.from = { x: p.x, y: p.y, z: p.z });
    if (d <= step || d < .05) { p.x = tgt.x; p.z = tgt.z; p.y = tgt.y ?? 0; car.k++; car.from = { x: p.x, y: p.y, z: p.z }; }
    else {
      p.x += dx / d * step; p.z += dz / d * step;
      const len = Math.hypot(tgt.x - from.x, tgt.z - from.z) || 1;
      p.y = from.y + ((tgt.y ?? 0) - from.y) * Math.max(0, Math.min(1, 1 - (d - step) / len));
    }
    if (d > .05 && step > 0) {
      let a = Math.atan2(dx, dz) - g.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      g.rotation.y += a * Math.min(1, dt * 8);
    }
    // the passenger rides along (hidden); the camera can still follow them
    if (car.state === 'ride' && c) c.root.position.set(p.x, p.y, p.z);
  }
  arrive(car) {
    const tr = car.trip, c = tr.c, g = this.game, p = car.group.position;
    const hx = Math.sin(car.group.rotation.y), hz = Math.cos(car.group.rotation.y), [rx, rz] = right(hx, hz);
    // out of a parked own car: beside its door; out of a taxi: onto the sidewalk
    const off = car.own ? 1.7 : H - LANE - .9;
    const out = { x: p.x + rx * off, z: p.z + rz * off };
    c.inCar = false;
    c.trip = null;
    c.root.position.set(out.x, this.T.groundY(out.x, out.z), out.z);
    c.say(pick2(['👋', '😊', '🏁']), 2);
    c.path = g.world.grid.findPath(out.x, out.z, tr.final.x, tr.final.z);
    c.moving = true;
    this.finishCar(car, true);
  }
}
const pick2 = a => a[Math.floor(Math.random() * a.length)];
