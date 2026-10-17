// Driving: residents drive their own car on long trips, everybody else sometimes takes a taxi.
// Cars follow the road tiles (asphalt and dirt) and the curved roads joined to them, keep to the right lane,
// slow down behind other cars and wait at red traffic lights.
import { TILE } from './path.js';
import { tileOf } from './tiles.js';
import { sampleCurve } from './curves.js';
import { makeCar } from './vehicles.js';
import { box } from './util.js';

const H = TILE / 2, LANE = 1.8;   // centre of the right lane
const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const key = (i, j) => i + ',' + j;
const right = (dx, dz) => [-dz, dx];   // the right-hand side of a direction (x east, z south)

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
        let S = sampleCurve(cur.via.pts, cur.via.bridge);
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
    return this.game.vehicles.ofOwner(c.id).find(v => !v.busy && Math.hypot(v.x - p.x, v.z - p.z) < 45) || null;
  }
  // plan a trip; returns the trip or null (then the citizen just walks)
  startTrip(c, x, z) {
    const g = this.game, p = c.root.position;
    const taxiOnly = c.forceRide === 'taxi';
    c.forceRide = null;
    const own = !taxiOnly && this.ownCar(c);
    const exit = own && own.out?.length ? own.out[own.out.length - 1] : own;
    const from = own ? this.nearestRoad(exit.x, exit.z) : this.nearestRoad(p.x, p.z), to = this.nearestRoad(x, z);
    if (!from || !to || (from.i === to.i && from.j === to.j)) return null;
    const ride = this.route(from, to);
    if (!ride || ride.length < 3) return null;
    const lp = this.lanePath(ride);
    const start = lp.pts[0], dir0 = [lp.pts[1].x - start.x, lp.pts[1].z - start.z], l0 = Math.hypot(...dir0) || 1;
    const [rx, rz] = right(dir0[0] / l0, dir0[1] / l0);
    // the passenger waits on the sidewalk next to where the car starts
    const curb = { x: start.x + rx * (H - LANE - .9), z: start.z + rz * (H - LANE - .9) };
    const trip = { c, final: { x, z }, curb, phase: 'walk', ride: lp };
    let car;
    if (own) {
      own.busy = true;
      car = { group: own.group, own, pts: [{ x: own.x, z: own.z, y: 0 }, ...(own.out || []).map(q => ({ x: q.x, z: q.z, y: 0 })), start], gates: [], k: 0, v: 0, state: 'pickup', trip };
    } else {
      // a taxi comes from a few streets away
      const spawn = this.away(from, 5);
      const r1 = spawn && this.route(spawn, from);
      const g1 = makeCar('car', '#ffcf3f');
      box(.9, .3, .45, '#ffffff', 0, 1.88, -.2, g1);
      box(.92, .12, .47, '#222222', 0, 1.78, -.2, g1);
      g.scene.add(g1);
      const lp1 = r1 && r1.length > 1 ? this.lanePath(r1) : { pts: [start], gates: [] };
      car = { group: g1, taxi: true, pts: [...lp1.pts, start], gates: lp1.gates, k: 0, v: 0, state: 'pickup', trip };
      g1.position.set(car.pts[0].x, 0, car.pts[0].z);
    }
    trip.car = car;
    this.cars.push(car);
    if (own) { trip.curb = { x: own.x + Math.cos(own.rot) * 1.6, z: own.z - Math.sin(own.rot) * 1.6 }; car.state = 'wait'; car.atStart = true; }
    c.path = g.world.grid.findPath(p.x, p.z, trip.curb.x, trip.curb.z);
    c.say(own ? '🚗' : '🚕', 2.5);
    return trip;
  }
  // the citizen changed plans: get out wherever the car is
  cancel(c) {
    const tr = c.trip;
    if (!tr) return;
    c.trip = null;
    if (c.inCar) {
      c.inCar = false;
      const p = tr.car.group.position, d = this.game.world.grid.nearestFree(this.game.world.grid.cell(p.x), this.game.world.grid.cell(p.z), 6);
      c.root.position.set(d ? this.game.world.grid.center(d[0]) : p.x, 0, d ? this.game.world.grid.center(d[1]) : p.z);
    }
    this.finishCar(tr.car);
  }
  // after the trip: a taxi drives off and disappears, an own car parks at the curb
  finishCar(car) {
    car.trip = null;
    if (car.own) {
      const g = car.group, v = car.own;
      v.busy = false;
      v.x = g.position.x; v.z = g.position.z; v.rot = g.rotation.y;
      v.bay = null; v.out = []; v.away = true;   // parked at the curb where the trip ended
      g.position.y = this.T.groundY(g.position.x, g.position.z);
      const home = this.game.town.get(this.game.getChar(v.ownerId)?.homeId);
      if (home && Math.hypot(home.center.x - v.x, home.center.z - v.z) < 30) { v.away = false; this.game.vehicles.park(v); }
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
  }
  drive(car, dt) {
    const tr = car.trip, c = tr?.c, g = car.group;
    if (tr && !this.game.chars.includes(c)) { this.finishCar(car); return; }
    // waiting for the passenger at the pickup point
    if (car.state === 'wait') {
      if (tr.phase === 'atCurb' || Math.hypot(c.root.position.x - tr.curb.x, c.root.position.z - tr.curb.z) < 1.5) {
        c.inCar = true;
        c.path = null;
        tr.phase = 'ride';
        car.state = 'ride';
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
    // red light ahead? stop at the line
    let want = car.state === 'leave' || !car.own ? 9 : 8;
    const gate = car.gates.find(q => q.k === car.k);
    if (gate && d < 3 && !this.green(gate.axis)) want = 0;
    // a car in front: slow down / stop
    const hx = Math.sin(g.rotation.y), hz = Math.cos(g.rotation.y);
    for (const o of this.cars) {
      if (o === car) continue;
      const ox = o.group.position.x - p.x, oz = o.group.position.z - p.z, ahead = ox * hx + oz * hz, side = Math.abs(-ox * hz + oz * hx);
      if (ahead > 0 && ahead < 7 && side < 1.8) want = Math.min(want, ahead < 5 ? 0 : 3);
    }
    car.v += Math.max(-14 * dt, Math.min(6 * dt, want - car.v));
    let step = Math.max(0, car.v) * dt;
    const from = car.from || (car.from = { x: p.x, y: p.y, z: p.z });
    if (d <= step || d < .05) { p.x = tgt.x; p.z = tgt.z; p.y = tgt.y ?? 0; car.k++; car.from = { x: p.x, y: p.y, z: p.z }; }
    else {
      p.x += dx / d * step; p.z += dz / d * step;
      const len = Math.hypot(tgt.x - from.x, tgt.z - from.z) || 1;
      p.y = from.y + ((tgt.y ?? 0) - from.y) * Math.max(0, Math.min(1, 1 - (d - step) / len));
    }
    if (d > .05) {
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
    const out = { x: p.x + rx * (H - LANE - .9), z: p.z + rz * (H - LANE - .9) };
    c.inCar = false;
    c.trip = null;
    c.root.position.set(out.x, this.T.groundY(out.x, out.z), out.z);
    c.say(pick2(['👋', '😊', '🏁']), 2);
    c.path = g.world.grid.findPath(out.x, out.z, tr.final.x, tr.final.z);
    c.moving = true;
    this.finishCar(car);
  }
}
const pick2 = a => a[Math.floor(Math.random() * a.length)];
