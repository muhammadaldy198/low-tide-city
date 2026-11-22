"use strict";
// Low Tide City — pedestrians.

const Peds = {
  TARGET: 40,

  spawn(world, rng) {
    for (let tries = 0; tries < 10; tries++) {
      const i = clamp(Math.floor((world.player.x - ROAD_OFF) / PITCH) + rng.int(-2, 2), 0, BLOCKS - 1);
      const j = clamp(Math.floor((world.player.y - ROAD_OFF) / PITCH) + rng.int(-2, 2), 0, BLOCKS - 1);
      if (i === RIVER_COL) continue;
      const lot = City.lotRect(i, j);
      const per = { x0: lot.x0 - 1.6, y0: lot.y0 - 1.6, x1: lot.x1 + 1.6, y1: lot.y1 + 1.6 };
      const s = rng.range(0, this._perLen(per));
      const pos = this._perPoint(per, s);
      if (dist2(pos.x, pos.y, world.player.x, world.player.y) < 25 * 25) continue;
      if (dist2(pos.x, pos.y, world.player.x, world.player.y) > 200 * 200) continue;
      const ped = {
        x: pos.x, y: pos.y, ang: 0,
        per, s, dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(1.0, 1.7),
        state: "walk", stateT: 0,
        fleeX: 0, fleeY: 0,
        shirt: rng.pick(PED_SHIRTS), skin: rng.pick(PED_SKINS),
        pants: rng.pick(PED_PANTS),
        seedPhase: rng.range(0, Math.PI * 2),
      };
      world.peds.push(ped);
      return ped;
    }
    return null;
  },

  _perLen(p) { return 2 * ((p.x1 - p.x0) + (p.y1 - p.y0)); },
  _perPoint(p, s) {
    const w = p.x1 - p.x0, h = p.y1 - p.y0;
    s = ((s % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
    if (s < w) return { x: p.x0 + s, y: p.y0, ang: 0 };
    if (s < w + h) return { x: p.x1, y: p.y0 + (s - w), ang: Math.PI / 2 };
    if (s < 2 * w + h) return { x: p.x1 - (s - w - h), y: p.y1, ang: Math.PI };
    return { x: p.x0, y: p.y1 - (s - 2 * w - h), ang: -Math.PI / 2 };
  },

  update(world, dt, events, rng) {
    if (world.peds.length < this.TARGET) this.spawn(world, rng);
    for (let idx = world.peds.length - 1; idx >= 0; idx--) {
      const ped = world.peds[idx];
      const d2p = dist2(ped.x, ped.y, world.player.x, world.player.y);
      if (d2p > 240 * 240) { world.peds.splice(idx, 1); continue; }
      ped.stateT -= dt;

      if (ped.state === "down") {
        if (ped.stateT <= 0 && !ped.dead) {
          ped.state = "walk"; // injured get up and limp on
          ped.speed = Math.max(0.7, ped.speed * 0.6);
        }
        continue;
      }

      // Danger scan: a fast car close by, or a crash just heard.
      let threat = null;
      world.carGrid.query(ped.x, ped.y, 10, (car) => {
        if (threat || car.sunk || car.parked) return;
        const sp = carSpeed(car);
        if (sp > 6 && dist2(ped.x, ped.y, car.x, car.y) < 64) threat = car;
      });
      if (threat && ped.state !== "flee") {
        ped.state = "flee";
        ped.stateT = rng.range(1.6, 3.2);
        ped.fleeX = ped.x - threat.x; ped.fleeY = ped.y - threat.y;
        const l = Math.hypot(ped.fleeX, ped.fleeY) || 1;
        ped.fleeX /= l; ped.fleeY /= l;
      }

      if (ped.state === "flee") {
        ped.x += ped.fleeX * 4.4 * dt;
        ped.y += ped.fleeY * 4.4 * dt;
        ped.ang = Math.atan2(ped.fleeY, ped.fleeX);
        // Buildings stop a fleeing ped cold (slide along via push-out).
        City.grid.query(ped.x, ped.y, 4, (b) => {
          const hit = circleVsAabb(ped.x, ped.y, 0.4, b);
          if (hit) { ped.x += hit.x; ped.y += hit.y; }
        });
        if (ped.stateT <= 0) {
          // Head back to the nearest point of the home sidewalk loop.
          ped.state = "return";
        }
        continue;
      }

      if (ped.state === "return") {
        const target = this._perPoint(ped.per, ped.s);
        const dx = target.x - ped.x, dy = target.y - ped.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.8) { ped.state = "walk"; continue; }
        ped.x += (dx / d) * ped.speed * 1.6 * dt;
        ped.y += (dy / d) * ped.speed * 1.6 * dt;
        ped.ang = Math.atan2(dy, dx);
        continue;
      }

      // Plain walking along the loop.
      ped.s += ped.dir * ped.speed * dt;
      const pos = this._perPoint(ped.per, ped.s);
      ped.x = pos.x; ped.y = pos.y; ped.ang = pos.ang + (ped.dir < 0 ? Math.PI : 0);
    }
  },

  // Cars call this (via world) when they run a ped down.
  hitBy(ped, car, events) {
    const sp = carSpeed(car);
    if (ped.state === "down") return;
    ped.state = "down";
    ped.dead = sp > 9;
    ped.stateT = ped.dead ? 25 : 6.5;
    events.push({ kind: "pedHit", ped, car, fatal: ped.dead });
  },

  anyNear(world, x, y, r) {
    for (const ped of world.peds) {
      if (ped.state !== "down" && dist2(ped.x, ped.y, x, y) < r * r) return true;
    }
    return false;
  },
};

const PED_SHIRTS = ["#d84f3a", "#3a7bd8", "#e8c33a", "#4fae62", "#e8e2d4", "#8c5aa8", "#3a3f4a", "#e07ba0"];
const PED_SKINS = ["#8a5a3b", "#c98d64", "#6e452a", "#e0ac82", "#5a3a22"];
const PED_PANTS = ["#2e3440", "#5a4632", "#3c4a6b", "#222222", "#6b705c"];
