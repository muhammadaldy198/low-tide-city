"use strict";
// Low Tide City — vehicles: factory, arcade physics, collisions.
//
// The driving model splits velocity into forward and lateral parts in the
// car's own frame. The engine pushes the forward part (with a soft cap so
// cars ease into their top speed), drag bleeds it, and the tyres scrub the
// lateral part away at the type's grip rate — drop the grip (handbrake)
// and the car slides. Collisions are three circles per car against
// building AABBs and other cars' circles, resolved with impulses.

let _carId = 1;

function makeCar(type, x, y, ang, color) {
  const def = VEHICLE_TYPES[type];
  return {
    id: _carId++,
    type, def,
    x, y, ang,
    vx: 0, vy: 0,
    steer: 0,          // smoothed steering, -1..1
    color,
    parked: false,
    driver: null,      // null | "player" | "traffic" | "cop"
    ai: null,          // traffic/police state, owned by their modules
    damage: 0,
    dead: false,
    sunk: false,
    brakeLight: 0,     // seconds of braking left to show
    honk: 0,
  };
}

function carSpeed(car) { return Math.hypot(car.vx, car.vy); }

// Forward speed signed along the heading.
function carForward(car) {
  return car.vx * Math.cos(car.ang) + car.vy * Math.sin(car.ang);
}

// The three collision circles in world space.
function carCircles(car, out) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang);
  const off = car.def.len * 0.32, r = car.def.wid * 0.62;
  out[0].x = car.x - c * off; out[0].y = car.y - s * off; out[0].r = r;
  out[1].x = car.x; out[1].y = car.y; out[1].r = r * 1.05;
  out[2].x = car.x + c * off; out[2].y = car.y + s * off; out[2].r = r;
  return out;
}
const _circlesA = [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }];
const _circlesB = [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }];

// ctrl: {throttle: -1..1, steer: -1..1, handbrake: bool}
// events: array receiving {kind:"crash", car, other, impulse, x, y}
function stepCar(car, ctrl, dt, events) {
  if (car.sunk) return;
  const def = car.def;
  const c = Math.cos(car.ang), s = Math.sin(car.ang);
  // Decompose velocity into the car's frame.
  let vf = car.vx * c + car.vy * s;
  let vl = -car.vx * s + car.vy * c;

  const wrecked = car.damage >= 100;
  const topSpeed = wrecked ? 7 : def.maxSpd;
  const throttle = ctrl.throttle || 0;

  // Engine: full push at a standstill, fading as speed nears the cap;
  // reverse is capped at 30% of top speed.
  if (throttle > 0) {
    const soft = Math.max(0, 1 - (vf / topSpeed) * (vf / topSpeed));
    vf += def.accel * (wrecked ? 0.35 : 1) * soft * throttle * dt * 3.2;
  } else if (throttle < 0) {
    if (vf > 0.5) {
      vf -= 16 * dt; // brakes
      car.brakeLight = 0.15;
    } else {
      const soft = Math.max(0, 1 - (-vf / (topSpeed * 0.3)) ** 2);
      vf += def.accel * 0.6 * soft * throttle * dt * 3.2;
    }
  }
  // Drag and rolling resistance.
  vf -= vf * 0.35 * dt;
  if (throttle === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.6 * dt);

  // Tyres scrub lateral velocity; the handbrake loosens them and sharpens
  // the yaw, which is what makes the car slide.
  const grip = ctrl.handbrake ? def.grip * 0.32 : def.grip;
  vl *= Math.exp(-grip * dt);

  // Steering: smoothed input, authority grows with speed then fades.
  const steerTarget = clamp(ctrl.steer || 0, -1, 1);
  car.steer += clamp(steerTarget - car.steer, -6 * dt, 6 * dt);
  const speedTerm = Math.min(1, Math.abs(vf) / 8) / (1 + Math.abs(vf) / 42);
  let yaw = car.steer * def.turn * speedTerm * (ctrl.handbrake ? 1.35 : 1);
  if (vf < 0) yaw = -yaw;
  car.ang += yaw * dt;

  // Recompose with the new heading.
  const nc = Math.cos(car.ang), ns = Math.sin(car.ang);
  car.vx = nc * vf - ns * vl;
  car.vy = ns * vf + nc * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  if (car.brakeLight > 0) car.brakeLight -= dt;

  collideWorld(car, events);
}

// Buildings, other cars, the map edge and the water.
function collideWorld(car, events) {
  // Map edge.
  const m = 6;
  car.x = clamp(car.x, m, WORLD_SIZE - m);
  car.y = clamp(car.y, m, WORLD_SIZE - m);

  // Buildings via the city's spatial grid.
  const cs = carCircles(car, _circlesA);
  City.grid.query(car.x, car.y, car.def.len, (b) => {
    for (let i = 0; i < 3; i++) {
      const hit = circleVsAabb(cs[i].x, cs[i].y, cs[i].r, b);
      if (hit) {
        car.x += hit.x; car.y += hit.y;
        // Cancel the velocity going into the wall, keep a small bounce.
        const inv = 1 / Math.max(hit.depth, 0.001);
        const nx = hit.x * inv, ny = hit.y * inv;
        const vn = car.vx * nx + car.vy * ny;
        if (vn < 0) {
          car.vx -= 1.25 * vn * nx;
          car.vy -= 1.25 * vn * ny;
          registerCrash(car, null, -vn, events);
        }
        // Recompute circles after the push for the next test.
        carCircles(car, cs);
      }
    }
  });

  // Water: a car whose centre leaves the bridges and banks sinks.
  if (City.isWater(car.x, car.y) && !car.sunk) {
    car.sunk = true;
    car.dead = true;
    events.push({ kind: "splash", car, x: car.x, y: car.y });
  }
}

function registerCrash(car, other, impulse, events) {
  if (impulse < 1.2) return;
  car.damage = Math.min(130, car.damage + Math.max(0, impulse - 3) * 2.0);
  if (other) other.damage = Math.min(130, other.damage + Math.max(0, impulse - 3) * 1.6);
  events.push({ kind: "crash", car, other, impulse, x: car.x, y: car.y });
}

// Car-vs-car: circle pairs with a mass-weighted impulse. Called by
// world.js for nearby pairs only.
function collideCars(a, b, events) {
  const ca = carCircles(a, _circlesA);
  const cb = carCircles(b, _circlesB);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dx = cb[j].x - ca[i].x, dy = cb[j].y - ca[i].y;
      const rr = ca[i].r + cb[j].r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d, overlap = rr - d;
      const totalMass = a.def.mass + b.def.mass;
      if (!a.parked || a.driver) { a.x -= nx * overlap * (b.def.mass / totalMass); a.y -= ny * overlap * (b.def.mass / totalMass); }
      if (!b.parked || b.driver) { b.x += nx * overlap * (a.def.mass / totalMass); b.y += ny * overlap * (a.def.mass / totalMass); }
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const imp = -(1.35) * vn;
        a.vx -= nx * imp * (b.def.mass / totalMass);
        a.vy -= ny * imp * (b.def.mass / totalMass);
        b.vx += nx * imp * (a.def.mass / totalMass);
        b.vy += ny * imp * (a.def.mass / totalMass);
        registerCrash(a, b, Math.abs(vn), events);
      }
      return; // one contact per pair per step is enough
    }
  }
}
