"use strict";
// Low Tide City — the Policía Municipal: wanted response.

const Police = {
  // Line of sight: sample the segment; a building swallows it.
  hasLOS(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 34) return true;
    const steps = Math.floor(d / 11);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      let blocked = false;
      City.grid.query(px, py, 2, (b) => {
        if (px > b.x0 - 0.5 && px < b.x1 + 0.5 && py > b.y0 - 0.5 && py < b.y1 + 0.5) blocked = true;
      });
      if (blocked) return false;
    }
    return true;
  },

  // If the target is across the river, route via the nearest bridge.
  routeTarget(cop, tx, ty) {
    const r = City.riverRect();
    const midX = (r.x0 + r.x1) / 2;
    const copSide = cop.x < r.x0 ? -1 : cop.x > r.x1 ? 1 : 0;
    const tgtSide = tx < r.x0 ? -1 : tx > r.x1 ? 1 : 0;
    if (copSide !== 0 && tgtSide !== 0 && copSide !== tgtSide) {
      let best = BRIDGE_ROWS[0], bd = 1e9;
      for (const k of BRIDGE_ROWS) {
        const dd = Math.abs(roadCenter(k) - cop.y);
        if (dd < bd) { bd = dd; best = k; }
      }
      return { x: midX, y: roadCenter(best) };
    }
    return { x: tx, y: ty };
  },

  spawnCop(world, rng) {
    for (let tries = 0; tries < 12; tries++) {
      const vertical = rng.chance(0.5);
      let k = rng.int(0, BLOCKS);
      if (!vertical && !BRIDGE_ROWS.includes(k)) k = BRIDGE_ROWS[rng.int(0, BRIDGE_ROWS.length - 1)];
      const dir = rng.chance(0.5) ? 1 : -1;
      const off = City.laneOffset(k);
      const px = world.player.x, py = world.player.y;
      let x, y;
      if (vertical) {
        x = roadCenter(k) + (dir > 0 ? -off : off);
        y = clamp(py + rng.sign() * rng.range(180, 280), 30, WORLD_SIZE - 30);
      } else {
        y = roadCenter(k) + (dir > 0 ? off : -off);
        x = clamp(px + rng.sign() * rng.range(180, 280), 30, WORLD_SIZE - 30);
      }
      if (dist2(x, y, px, py) < 150 * 150) continue;
      if (City.isWater(x, y)) continue;
      const car = makeCar("police", x, y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), "#e8e8e8");
      car.driver = "cop";
      car.ai = { mode: "hunt", searchT: 0, sx: px, sy: py, stuckT: 0, reverseT: 0, lx: x, ly: y };
      world.cars.push(car);
      return car;
    }
    return null;
  },

  countCops(world) {
    let n = 0;
    for (const car of world.cars) if (car.driver === "cop" && car.ai && car.ai.mode !== "blockade") n++;
    return n;
  },

  update(world, dt, events, rng) {
    const stars = world.stars;
    const want = COPS_AT[stars] || 0;
    if (stars > 0 && this.countCops(world) < want) this.spawnCop(world, rng);
    world.heliSees = false;

    let anySee = false;
    for (const car of world.cars) {
      if (car.driver !== "cop") continue;
      const ai = car.ai;
      const p = world.player;
      const d = Math.hypot(car.x - p.x, car.y - p.y);

      if (ai.mode === "blockade") {
        // Parked across a bridge; only joins the chase at ramming range.
        if (stars < 2 || d > 300) { car.driver = "despawn"; }
        else if (d < 10) { ai.mode = "hunt"; car.parked = false; }
        else continue;
      }
      if (car.sunk) { car.driver = "despawn"; continue; }
      if (stars === 0 && d > 200) { car.driver = "despawn"; continue; }

      const sees = stars > 0 && d < (world.weather === "fog" ? 58 : 95) && this.hasLOS(car.x, car.y, p.x, p.y);
      if (sees) {
        anySee = true;
        ai.sx = p.x; ai.sy = p.y;
        ai.searchT = 0;
      }

      // Stuck recovery: barely moving while trying → reverse out.
      const moved = Math.hypot(car.x - ai.lx, car.y - ai.ly);
      if (moved < 0.05 && carSpeed(car) < 1) ai.stuckT += dt; else ai.stuckT = 0;
      ai.lx = car.x; ai.ly = car.y;
      if (ai.stuckT > 1.4) { ai.reverseT = 0.75; ai.stuckT = 0; }
      if (ai.reverseT > 0) {
        ai.reverseT -= dt;
        stepCar(car, { throttle: -1, steer: -car.steer, handbrake: false }, dt, events);
        continue;
      }

      let tx, ty, speedWanted;
      if (sees) {
        // Intercept: aim at where the player will be, closing the gap.
        const pvx = p.car ? p.car.vx : p.vx, pvy = p.car ? p.car.vy : p.vy;
        const closing = Math.max(6, carSpeed(car) + 4);
        const lead = clamp(d / closing, 0, 1.2);
        tx = p.x + pvx * lead; ty = p.y + pvy * lead;
        // At 2+ stars, aim for the rear quarter: a PIT shove.
        if (stars >= 2 && d < 13 && p.car) {
          const back = 2.6;
          tx = p.x - Math.cos(p.ang) * back + Math.cos(p.ang + Math.PI / 2) * 1.1;
          ty = p.y - Math.sin(p.ang) * back + Math.sin(p.ang + Math.PI / 2) * 1.1;
        }
        speedWanted = car.def.maxSpd;
      } else {
        // Hunt the last known position by road, then search around it.
        const rt = this.routeTarget(car, ai.sx, ai.sy);
        tx = rt.x; ty = rt.y;
        speedWanted = 17;
        if (Math.hypot(car.x - ai.sx, car.y - ai.sy) < 16) {
          ai.searchT -= dt;
          speedWanted = 8;
          if (ai.searchT <= 0) {
            const R = 60 + 40 * stars;
            ai.sx = clamp(p.x + rng.range(-R, R), 20, WORLD_SIZE - 20);
            ai.sy = clamp(p.y + rng.range(-R, R), 20, WORLD_SIZE - 20);
            const rp = City.nearestRoadPoint(ai.sx, ai.sy);
            ai.sx = rp.x; ai.sy = rp.y;
            ai.searchT = rng.range(4, 8);
          }
        }
      }
      const ctrl = Traffic.drive(car, tx, ty, speedWanted, dt);
      stepCar(car, ctrl, dt, events);
    }
    this._heli(world, dt, rng);
    world.copSeesPlayer = anySee || world.heliSees;
    this._blockades(world, rng);
  },

  // The helicopter: from three stars it shadows the player from 30 m up,
  _heli(world, dt, rng) {
    const p = world.player;
    if (world.stars >= 3 && !world.heli) {
      const a = rng.range(0, Math.PI * 2);
      world.heli = {
        x: p.x + Math.cos(a) * 240, y: p.y + Math.sin(a) * 240,
        vx: 0, vy: 0, ang: 0, fireT: 2.5,
      };
    }
    const h = world.heli;
    if (!h) return;
    const dxp = h.x - p.x, dyp = h.y - p.y;
    const dp = Math.hypot(dxp, dyp) || 1;
    if (world.stars < 3) {
      h.vx = (dxp / dp) * 34; h.vy = (dyp / dp) * 34;
      h.x += h.vx * dt; h.y += h.vy * dt;
      h.ang = Math.atan2(h.vy, h.vx);
      if (dp > 330) world.heli = null;
      return;
    }
    // Orbit point: ahead of the player's motion, circling when slow.
    const pvx = p.car ? p.car.vx : p.vx, pvy = p.car ? p.car.vy : p.vy;
    const orb = world.time * 0.45;
    const tx = p.x + pvx * 1.1 + Math.cos(orb) * 20;
    const ty = p.y + pvy * 1.1 + Math.sin(orb) * 20;
    const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy) || 1;
    const want = Math.min(30, d * 1.5);
    h.vx += clamp((dx / d) * want - h.vx, -30 * dt, 30 * dt);
    h.vy += clamp((dy / d) * want - h.vy, -30 * dt, 30 * dt);
    h.x += h.vx * dt; h.y += h.vy * dt;
    if (Math.abs(h.vx) + Math.abs(h.vy) > 0.5) h.ang = Math.atan2(h.vy, h.vx);
    if (dp < 62) {
      world.heliSees = true;
      for (const car of world.cars) {
        if (car.driver === "cop" && car.ai) { car.ai.sx = p.x; car.ai.sy = p.y; }
      }
    }
    if (world.stars >= 5) {
      h.fireT -= dt;
      if (h.fireT <= 0 && dp < 75) {
        h.fireT = 3;
        world.tracers.push({ x0: h.x, y0: h.y, x1: p.x, y1: p.y, t: 0.14 });
        if (rng.chance(0.55)) {
          if (p.car) p.car.damage = Math.min(130, p.car.damage + 7);
          else { p.health -= 8; if (p.health <= 0) world._wasted(); }
        }
      }
    }
  },

  // Bridge blockades at 3+ stars: one pair per bridge, spawned once —
  _blockades(world, rng) {
    if (world.stars < 3) return;
    if (!world.blockadedRows) world.blockadedRows = new Set();
    // Prune rows whose cars have all left, so a bridge can re-block.
    for (const k of [...world.blockadedRows]) {
      let alive = 0;
      for (const car of world.cars) {
        if (car.ai && car.ai.mode === "blockade" && car.ai.row === k) alive++;
      }
      if (alive === 0) {
        world.blockadedRows.delete(k);
        if (world.spikes) world.spikes = world.spikes.filter((s) => s.row !== k);
      }
    }
    const p = world.player;
    const r = City.riverRect();
    const midX = (r.x0 + r.x1) / 2;
    for (const k of BRIDGE_ROWS) {
      if (world.blockadedRows.has(k)) continue;
      const by = roadCenter(k);
      if (Math.abs(p.y - by) > 90 || Math.abs(p.x - midX) > 170) continue;
      const w = roadWidth(k);
      for (let s = -1; s <= 1; s += 2) {
        const car = makeCar("police", midX + s * w * 0.22, by + s * 1.5, Math.PI / 2 + s * 0.5, "#e8e8e8");
        car.driver = "cop";
        car.parked = true;
        car.ai = { mode: "blockade", row: k };
        world.cars.push(car);
      }
      // From four stars the gap between the cars gets a spike strip.
      if (world.stars >= 4) {
        if (!world.spikes) world.spikes = [];
        world.spikes.push({ x: midX, y: by, len: w * 0.8, row: k });
      }
      world.blockadedRows.add(k);
      return;
    }
  },
};
