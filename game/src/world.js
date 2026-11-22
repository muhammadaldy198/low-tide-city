"use strict";
// Low Tide City — the world: state, the fixed-step simulation, crime and
// consequences. Everything the other modules need to agree on lives here:
// the player, the car and ped lists, the clock, the weather, the heat.

const World = {
  state: "title", // title | play | pause | howto | busted | wasted
  seed: 7,
  rng: null,
  cars: [],
  peds: [],
  carGrid: makeGrid(24),
  player: null,
  missionCar: null,
  hours: START_HOUR,
  weather: "clear",
  weatherT: 30,
  heat: 0,
  stars: 0,
  unseenT: 0,
  copSeesPlayer: false,
  bustT: 0,
  cash: 120,
  respect: 0,
  dialogue: null,
  banner: null,
  resultScreen: null,
  prompt: null,
  stateT: 0, // time in busted/wasted screens
  events: [],

  build(seed) {
    this.seed = seed;
    this.rng = makeRng(seed ^ 0x9e3779b9);
    City.build(seed);
    this.cars = [];
    this.peds = [];
    // Parked cars: the full set exists as scenery; only stolen ones move.
    for (const spot of City.parkedSpots) {
      const type = this.rng.pick(TRAFFIC_TYPES);
      const car = makeCar(type, spot.x, spot.y, spot.ang, this.rng.pick(CAR_COLORS));
      car.parked = true;
      this.cars.push(car);
    }
    // Marisol's Corvo, waiting by the dock office.
    const ms = City.missionCarSpot;
    this.missionCar = makeCar("sedan", ms.x, ms.y, ms.ang, "#8a8f96");
    this.missionCar.parked = true;
    this.cars.push(this.missionCar);
    // The garage step of mission 1 points at the real garage.
    const gotoStep = MISSION_WHEELS_UP.steps[2];
    gotoStep.x = City.garagePos.x; gotoStep.y = City.garagePos.y;

    this.player = {
      x: City.playerStart.x, y: City.playerStart.y, ang: -Math.PI / 2,
      vx: 0, vy: 0, car: null, health: PLAYER.health, walkPhase: 0,
    };
    this.hours = START_HOUR;
    this.weather = "clear";
    this.weatherT = 40;
    this.heat = 0; this.stars = 0; this.unseenT = 0;
    this.cash = 120; this.respect = 0;
    this.dialogue = null; this.banner = null; this.resultScreen = null;
    this.state = "title";
    return this;
  },

  starsFor(heat) {
    let s = 0;
    for (let i = 0; i < STAR_AT.length; i++) if (heat >= STAR_AT[i]) s = i;
    return s;
  },

  // A crime goes on the heat only if someone saw it: a cop with line of
  // sight, or a pedestrian close by. Either way the police now know
  // roughly where to look.
  reportCrime(kind, x, y) {
    let witnessed = Peds.anyNear(this, x, y, 55);
    if (!witnessed) {
      for (const car of this.cars) {
        if (car.driver === "cop" && dist2(car.x, car.y, x, y) < 85 * 85 &&
            Police.hasLOS(car.x, car.y, x, y)) { witnessed = true; break; }
      }
    }
    if (witnessed) {
      this.heat += CRIME[kind] || 0;
      this.stars = this.starsFor(this.heat);
      for (const car of this.cars) {
        if (car.driver === "cop" && car.ai) { car.ai.sx = x; car.ai.sy = y; }
      }
    }
    return witnessed;
  },

  step(dt) {
    if (this.state !== "play") return;
    this.events.length = 0;

    // Clock and weather.
    this.hours = (this.hours + dt * 24 / DAY_SECONDS) % 24;
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 45 + this.rng.next() * 60;
      const roll = this.rng.next();
      if (this.weather === "clear") this.weather = roll < 0.3 ? "cloud" : "clear";
      else if (this.weather === "cloud") this.weather = roll < 0.4 ? "rain" : roll < 0.7 ? "clear" : "cloud";
      else this.weather = roll < 0.5 ? "cloud" : "rain";
    }

    this._playerStep(dt);
    Traffic.update(this, dt, this.events, this.rng);
    Peds.update(this, dt, this.events, this.rng);
    Police.update(this, dt, this.events, this.rng);
    this._collisions(dt);
    this._events(dt);
    Missions.update(this, dt);
    this._wantedStep(dt);
    this._promptStep();

    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.resultScreen) {
      this.resultScreen.t -= dt;
      if (this.resultScreen.t <= 0) this.resultScreen = null;
    }
    Input.endStep();
  },

  _playerStep(dt) {
    const p = this.player;
    if (p.car) {
      const car = p.car;
      const ctrl = {
        throttle: (Input.keys.up ? 1 : 0) - (Input.keys.down ? 1 : 0),
        steer: (Input.keys.right ? 1 : 0) - (Input.keys.left ? 1 : 0),
        handbrake: !!Input.keys.handbrake,
      };
      stepCar(car, ctrl, dt, this.events);
      p.x = car.x; p.y = car.y; p.ang = car.ang;
      if (Input.consume("interact")) this._exitCar();
      return;
    }
    // On foot.
    const ax = Input.axisX(), ay = Input.axisY();
    const moving = ax !== 0 || ay !== 0;
    const speed = Input.keys.sprint ? PLAYER.sprint : PLAYER.walk;
    if (moving) {
      const l = Math.hypot(ax, ay);
      p.vx = (ax / l) * speed; p.vy = (ay / l) * speed;
      p.ang = Math.atan2(p.vy, p.vx);
      p.walkPhase += dt * (Input.keys.sprint ? 11 : 8);
    } else {
      p.vx = 0; p.vy = 0;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    // Buildings and parked cars are solid.
    City.grid.query(p.x, p.y, 4, (b) => {
      const hit = circleVsAabb(p.x, p.y, PLAYER.r, b);
      if (hit) { p.x += hit.x; p.y += hit.y; }
    });
    for (const car of this.cars) {
      if (car.sunk) continue;
      if (dist2(p.x, p.y, car.x, car.y) < 16) {
        const cs = carCircles(car, _circlesA);
        for (const c of cs) {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          const rr = c.r + PLAYER.r;
          if (d < rr && d > 0.001) {
            p.x += (p.x - c.x) / d * (rr - d);
            p.y += (p.y - c.y) / d * (rr - d);
          }
        }
      }
    }
    p.x = clamp(p.x, 4, WORLD_SIZE - 4);
    p.y = clamp(p.y, 4, WORLD_SIZE - 4);
    if (City.isWater(p.x, p.y)) {
      // Wading is not swimming: push back to the bank.
      p.x -= p.vx * dt * 2; p.y -= p.vy * dt * 2;
    }
    if (Input.consume("interact")) {
      if (this.promptAction) { this.promptAction(); this.promptAction = null; }
      else this._tryEnterCar();
    }
  },

  _tryEnterCar() {
    const p = this.player;
    let best = null, bd = 4.2 * 4.2;
    for (const car of this.cars) {
      if (car.sunk) continue;
      const d = dist2(p.x, p.y, car.x, car.y);
      if (d < bd) { bd = d; best = car; }
    }
    if (!best) return;
    const wasParked = best.parked;
    const hadDriver = best.driver === "traffic";
    if (best.type === "police") this.reportCrime("stealCop", best.x, best.y);
    else if (hadDriver) this.reportCrime("carjack", best.x, best.y);
    else if (wasParked) this.reportCrime("stealParked", best.x, best.y);
    if (hadDriver) {
      // The driver bails out and runs.
      const ped = {
        x: best.x + 2, y: best.y, ang: 0, per: null, s: 0, dir: 1,
        speed: 1.4, state: "flee", stateT: 2.6,
        fleeX: 1, fleeY: 0, shirt: "#d84f3a", skin: "#c98d64", pants: "#2e3440",
        seedPhase: 0,
      };
      ped.per = { x0: best.x - 30, y0: best.y - 30, x1: best.x + 30, y1: best.y + 30 };
      this.peds.push(ped);
    }
    best.parked = false;
    best.driver = "player";
    p.car = best;
  },

  _exitCar() {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    car.driver = null;
    car.parked = carSpeed(car) < 0.5;
    p.car = null;
    const side = Math.PI / 2;
    for (const sgn of [1, -1]) {
      const nx = car.x + Math.cos(car.ang + side * sgn) * (car.def.wid / 2 + 0.9);
      const ny = car.y + Math.sin(car.ang + side * sgn) * (car.def.wid / 2 + 0.9);
      let blocked = false;
      City.grid.query(nx, ny, 3, (b) => {
        if (nx > b.x0 - 0.4 && nx < b.x1 + 0.4 && ny > b.y0 - 0.4 && ny < b.y1 + 0.4) blocked = true;
      });
      if (!blocked && !City.isWater(nx, ny)) { p.x = nx; p.y = ny; return; }
    }
    p.x = car.x; p.y = car.y + car.def.wid;
  },

  _collisions(dt) {
    // Rebuild the car grid, then resolve car-car pairs and car-ped hits.
    this.carGrid.clear();
    for (const car of this.cars) this.carGrid.insert(car, car.x, car.y);
    for (const car of this.cars) {
      if (car.sunk) continue;
      this.carGrid.query(car.x, car.y, 9, (other) => {
        if (other.id <= car.id || other.sunk) return;
        if (dist2(car.x, car.y, other.x, other.y) < 81) {
          collideCars(car, other, this.events);
        }
      });
    }
    // Cars vs pedestrians (and vs the player on foot).
    const testVictim = (vx, vy, isPlayer, ped) => {
      this.carGrid.query(vx, vy, 7, (car) => {
        if (car.sunk || car.parked || car === this.player.car) return;
        const sp = carSpeed(car);
        if (sp < 3.2) return;
        const cs = carCircles(car, _circlesB);
        for (const c of cs) {
          if (dist2(vx, vy, c.x, c.y) < (c.r + 0.35) * (c.r + 0.35)) {
            if (isPlayer) this._playerHitByCar(car, sp);
            else Peds.hitBy(ped, car, this.events);
            return;
          }
        }
      });
    };
    for (const ped of this.peds) {
      if (ped.state !== "down") testVictim(ped.x, ped.y, false, ped);
    }
    if (!this.player.car) testVictim(this.player.x, this.player.y, true, null);
  },

  _playerHitByCar(car, sp) {
    const p = this.player;
    if (this._hitCooldown > 0) return;
    this._hitCooldown = 0.8;
    p.health -= sp * 2.1;
    p.x += car.vx * 0.12; p.y += car.vy * 0.12;
    if (p.health <= 0) this._wasted();
  },

  _events(dt) {
    if (this._hitCooldown > 0) this._hitCooldown -= dt;
    for (const ev of this.events) {
      if (ev.kind === "crash") {
        const mine = ev.car === this.player.car || ev.other === this.player.car;
        if (mine && ev.impulse > 4.5) {
          const other = ev.car === this.player.car ? ev.other : ev.car;
          if (other && other.type === "police") this.reportCrime("damageCop", ev.x, ev.y);
          else if (other) this.reportCrime("hitCar", ev.x, ev.y);
          else this.reportCrime("crashProp", ev.x, ev.y);
        }
      } else if (ev.kind === "pedHit") {
        if (ev.car === this.player.car) {
          this.reportCrime(ev.fatal ? "killPed" : "hitPed", ev.ped.x, ev.ped.y);
        }
      } else if (ev.kind === "splash") {
        if (ev.car === this.player.car) {
          // Drag the player back to the nearest bank.
          const p = this.player;
          p.car = null;
          for (let r = 4; r < 90; r += 4) {
            let done = false;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
              const nx = ev.x + Math.cos(a) * r, ny = ev.y + Math.sin(a) * r;
              if (!City.isWater(nx, ny)) { p.x = nx; p.y = ny; done = true; break; }
            }
            if (done) break;
          }
          p.health -= 15;
          if (p.health <= 0) this._wasted();
        }
      }
    }
  },

  _wantedStep(dt) {
    this.stars = this.starsFor(this.heat);
    if (this.stars > 0 && !this.copSeesPlayer) {
      this.unseenT += dt;
      const interval = 6 + 3 * this.stars;
      if (this.unseenT >= interval) {
        this.unseenT = 0;
        this.heat = Math.max(0, STAR_AT[this.stars - 1] - 1);
        this.stars = this.starsFor(this.heat);
      }
    } else {
      this.unseenT = 0;
    }
    // Busted: a patrol car sitting on a player on foot.
    const p = this.player;
    if (!p.car && this.stars > 0 && this.state === "play") {
      let near = false;
      for (const car of this.cars) {
        if (car.driver === "cop" && dist2(car.x, car.y, p.x, p.y) < 49 && carSpeed(car) < 3.5) {
          near = true; break;
        }
      }
      this.bustT = near ? this.bustT + dt : Math.max(0, this.bustT - dt * 2);
      if (this.bustT > 1.2) this._busted();
    } else {
      this.bustT = 0;
    }
  },

  _busted() {
    this.state = "busted";
    this.stateT = 0;
    Missions.fail(this, "Busted.");
  },

  _wasted() {
    if (this.state !== "play") return;
    this.state = "wasted";
    this.stateT = 0;
    Missions.fail(this, "You were wasted.");
  },

  // After the busted/wasted screens, the world resets around the player.
  respawn() {
    const p = this.player;
    if (this.state === "busted") {
      const fine = Math.min(this.cash, 100 + 50 * this.stars);
      this.cash -= fine;
      p.x = City.stationPos.x; p.y = City.stationPos.y;
    } else {
      this.cash = Math.max(0, this.cash - 100);
      p.x = City.hospitalPos.x; p.y = City.hospitalPos.y;
    }
    if (p.car) { p.car.driver = null; p.car = null; }
    p.health = PLAYER.health;
    this.heat = 0; this.stars = 0; this.bustT = 0;
    this.state = "play";
  },

  _promptStep() {
    this.prompt = null;
    this.promptAction = null;
    const p = this.player;
    if (p.car || this.dialogue) return;
    const def = Missions.available(this);
    if (def && City.dockPos && dist2(p.x, p.y, City.dockPos.x, City.dockPos.y) < 20) {
      this.prompt = "E — Talk to Marisol";
      this.promptAction = () => Missions.start(this, def);
      return;
    }
    // Otherwise, hint at the nearest car door.
    let bd = 4.2 * 4.2;
    for (const car of this.cars) {
      if (car.sunk) continue;
      const d = dist2(p.x, p.y, car.x, car.y);
      if (d < bd) {
        bd = d;
        this.prompt = car.driver === "traffic" ? "E — Steal the " + car.def.name
          : "E — Drive the " + car.def.name;
      }
    }
  },
};
