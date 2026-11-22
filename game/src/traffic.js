"use strict";
// Low Tide City — traffic: cars that drive the road grid on their own.

const Traffic = {
  TARGET: 24, // cars alive at once

  // The signal at the junction this car is rolling toward, and how far
  lightAhead(car, world) {
    const vert = Math.abs(Math.sin(car.ang)) > Math.abs(Math.cos(car.ang));
    const dir = vert ? Math.sign(Math.sin(car.ang)) : Math.sign(Math.cos(car.ang));
    if (!dir) return null;
    const along = vert ? car.y : car.x;
    const m = dir > 0
      ? Math.floor((along - ROAD_OFF) / PITCH) + 1
      : Math.ceil((along - ROAD_OFF) / PITCH) - 1;
    if (m < 0 || m > BLOCKS) return null;
    const k = Math.round(((vert ? car.x : car.y) - ROAD_OFF) / PITCH);
    if (k < 0 || k > BLOCKS) return null;
    if (!isAvenue(k) && !isAvenue(m)) return null;
    const d = (roadCenter(m) - along) * dir;
    if (d < 2 || d > 16) return null;
    // lightState names junctions (vertical road, horizontal road).
    const state = vert ? City.lightState(k, m, true, world.time)
      : City.lightState(m, k, false, world.time);
    return { state, d };
  },

  // Steer one car toward a world point at a wanted speed; returns the
  drive(car, tx, ty, speedWanted, dt) {
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = angDiff(desired, car.ang);
    const steer = clamp(diff * 1.7, -1, 1);
    const vf = carForward(car);
    let throttle = 0;
    if (Math.abs(diff) > 2.4) {
      throttle = vf > 1 ? -1 : 0.25; // badly misaligned: brake, then crawl
    } else if (vf < speedWanted) {
      throttle = Math.abs(diff) > 1.1 ? 0.35 : 1;
    } else if (vf > speedWanted + 3) {
      throttle = -0.7;
    }
    return { throttle, steer, handbrake: false };
  },

  // Is something slow or stopped just ahead of this car?
  blockedAhead(car, world) {
    const fx = car.x + Math.cos(car.ang) * 8;
    const fy = car.y + Math.sin(car.ang) * 8;
    let blocked = false;
    world.carGrid.query(fx, fy, 5, (other) => {
      if (blocked || other === car || other.sunk) return;
      if (Math.abs(angDiff(other.ang, car.ang)) < 1.2 || other.parked || !other.driver) {
        blocked = true;
      }
    });
    return blocked;
  },

  spawn(world, rng) {
    // A road point on a ring around the player: close enough to meet,
    for (let tries = 0; tries < 12; tries++) {
      const vertical = rng.chance(0.5);
      let k = rng.int(0, BLOCKS);
      // Horizontal spawns only on bridge rows: other rows end at the river.
      if (!vertical && !BRIDGE_ROWS.includes(k)) k = BRIDGE_ROWS[rng.int(0, BRIDGE_ROWS.length - 1)];
      const along = clamp(world.player.x + rng.range(-260, 260), 30, WORLD_SIZE - 30);
      const alongY = clamp(world.player.y + rng.range(-260, 260), 30, WORLD_SIZE - 30);
      const dir = rng.chance(0.5) ? 1 : -1;
      const off = City.laneOffset(k);
      let x, y;
      if (vertical) { x = roadCenter(k) + (dir > 0 ? -off : off); y = alongY; }
      else { y = roadCenter(k) + (dir > 0 ? off : -off); x = along; }
      if (City.isWater(x, y) && !City.onBridge(x, y)) continue;
      if (dist2(x, y, world.player.x, world.player.y) < 120 * 120) continue;
      const type = rng.pick(TRAFFIC_TYPES);
      const car = makeCar(type, x, y, 0, rng.pick(CAR_COLORS));
      car.driver = "traffic";
      car.ang = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      car.ai = { leg: { vertical, k, dir }, path: [], pathI: 0 };
      this._extendPath(car, rng);
      world.cars.push(car);
      return car;
    }
    return null;
  },

  // Append the next leg's waypoints: junction entry, the corner, and a
  _extendPath(car, rng) {
    const ai = car.ai;
    const leg = ai.leg;
    // Next junction along the leg from the car's current position.
    const pos = leg.vertical ? car.y : car.x;
    let m = Math.round((pos - ROAD_OFF) / PITCH);
    m = clamp(m + leg.dir, 0, BLOCKS);
    const off = City.laneOffset(leg.k);
    const laneHere = leg.vertical
      ? roadCenter(leg.k) + (leg.dir > 0 ? -off : off)
      : roadCenter(leg.k) + (leg.dir > 0 ? off : -off);
    const jx = leg.vertical ? laneHere : roadCenter(m);
    const jy = leg.vertical ? roadCenter(m) : laneHere;
    ai.path.push({ x: jx, y: jy });

    // Choose the next leg at that junction.
    const roll = rng.next();
    let next;
    if (roll < 0.55) {
      next = leg; // straight on
    } else {
      const nd = rng.chance(0.5) ? 1 : -1;
      next = { vertical: !leg.vertical, k: m, dir: nd };
    }
    // The river rule: a horizontal leg crosses the channel, so it is only
    if (!next.vertical && !BRIDGE_ROWS.includes(next.k)) {
      next = leg;
    }
    // At the map edge there is no straight on: turn around instead.
    const atEnd = (leg.dir > 0 && m >= BLOCKS) || (leg.dir < 0 && m <= 0);
    if (atEnd && next === leg) {
      next = { vertical: leg.vertical, k: leg.k, dir: -leg.dir };
    }
    const noff = City.laneOffset(next.k);
    const far = 46;
    if (next.vertical) {
      const lx = roadCenter(next.k) + (next.dir > 0 ? -noff : noff);
      ai.path.push({ x: lx, y: jy });
      ai.path.push({ x: lx, y: clamp(jy + next.dir * far, 10, WORLD_SIZE - 10) });
    } else {
      const ly = roadCenter(next.k) + (next.dir > 0 ? noff : -noff);
      ai.path.push({ x: jx, y: ly });
      ai.path.push({ x: clamp(jx + next.dir * far, 10, WORLD_SIZE - 10), y: ly });
    }
    ai.leg = next;
  },

  update(world, dt, events, rng) {
    // Keep the population topped up around the player.
    let alive = 0;
    for (const car of world.cars) if (car.driver === "traffic") alive++;
    if (alive < this.TARGET) this.spawn(world, rng);

    for (const car of world.cars) {
      if (car.driver !== "traffic") continue;
      const d2p = dist2(car.x, car.y, world.player.x, world.player.y);
      if (d2p > 340 * 340 || car.sunk) { car.driver = "despawn"; continue; }
      const ai = car.ai;
      // Advance along the path.
      while (ai.path.length && dist2(car.x, car.y, ai.path[0].x, ai.path[0].y) < 9 * 9) {
        ai.path.shift();
      }
      if (ai.path.length < 3) this._extendPath(car, rng);
      // Look-ahead point: walk the path to ~9 m ahead.
      let tx = ai.path[0].x, ty = ai.path[0].y;
      let budget = 9;
      let px = car.x, py = car.y;
      for (const p of ai.path) {
        const seg = Math.hypot(p.x - px, p.y - py);
        if (seg >= budget) {
          const t = budget / Math.max(seg, 0.001);
          tx = px + (p.x - px) * t; ty = py + (p.y - py) * t;
          break;
        }
        budget -= seg; px = p.x; py = p.y; tx = p.x; ty = p.y;
      }
      let speed = 12.5;
      if (this.blockedAhead(car, world)) speed = 0;
      else {
        // Signals: stop for a red, and for an amber still far out.
        const la = this.lightAhead(car, world);
        if (la && (la.state === "red" || (la.state === "amber" && la.d > 8))) speed = 0;
      }
      const ctrl = this.drive(car, tx, ty, speed, dt);
      stepCar(car, ctrl, dt, events);
    }
    // Sweep despawned cars.
    for (let i = world.cars.length - 1; i >= 0; i--) {
      if (world.cars[i].driver === "despawn") world.cars.splice(i, 1);
    }
  },
};

const CAR_COLORS = ["#c23b2e", "#2e5fc2", "#d8d8d8", "#2b2b30", "#c2a12e", "#3f9e58",
  "#7a4fa3", "#c2702e", "#9fb6c9", "#5c6650", "#e0e0e0", "#804040"];
