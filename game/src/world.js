"use strict";
// Low Tide City — the world: state, the fixed-step simulation, crime and

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
  time: 0, // simulation seconds since build (traffic lights, the heli)
  weather: "clear",
  weatherT: 30,
  lightningT: 0,
  heat: 0,
  stars: 0,
  unseenT: 0,
  copSeesPlayer: false,
  heli: null,
  heliSees: false,
  spikes: [],
  pendingReports: [], // crimes a pedestrian is still calling in
  bustT: 0,
  cash: 120,
  respect: 0,
  dialogue: null,
  banner: null,
  toast: null,
  tracers: [],
  resultScreen: null,
  prompt: null,
  sprayT: 0,
  ownedHouses: [true, false, false],
  ownAllHouses: false,
  garageCar: null,
  packagesGot: 0,
  selectOpen: false, // the phone's mission list (Tab) pauses the world
  waypoint: null,
  stateT: 0, // time in busted/wasted screens
  events: [],

  build(seed, fresh) {
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
    const ms = City.missionCarSpot;
    this.missionCar = makeCar("sedan", ms.x, ms.y, ms.ang, "#8a8f96");
    this.missionCar.parked = true;
    this.cars.push(this.missionCar);
    const gotoStep = MISSION_WHEELS_UP.steps[2];
    gotoStep.x = City.garagePos.x; gotoStep.y = City.garagePos.y;

    this.player = {
      x: City.playerStart.x, y: City.playerStart.y, ang: -Math.PI / 2,
      vx: 0, vy: 0, car: null, health: PLAYER.health, walkPhase: 0,
    };
    this.hours = START_HOUR;
    this.time = 0;
    this.weather = "clear";
    this.weatherT = 40;
    this.lightningT = 0;
    this.heat = 0; this.stars = 0; this.unseenT = 0;
    this.cash = 120; this.respect = 0;
    this.dialogue = null; this.banner = null; this.resultScreen = null;
    this.toast = null; this.tracers = [];
    this.heli = null; this.heliSees = false;
    this.spikes = []; this.pendingReports = [];
    this.sprayT = 0; this._sprayLatch = false;
    this.ownedHouses = [true, false, false];
    this.ownAllHouses = false;
    this.garageCar = null;
    this.packagesGot = 0;
    this.selectOpen = false;
    this.waypoint = null;
    if (fresh) { Missions.done = {}; Missions.active = null; Jobs.job = null; }
    else this._load();
    this.state = "title";
    return this;
  },

  // ---- save / load (localStorage; a courtesy, never a crash) ----
  save() {
    try {
      localStorage.setItem("lowtide.save.v1", JSON.stringify({
        v: 1, cash: this.cash, respect: this.respect, done: Missions.done,
        pkg: City.packages.map((k) => (k.got ? 1 : 0)),
        owned: this.ownedHouses, ownAll: this.ownAllHouses, garage: this.garageCar,
      }));
    } catch (e) { /* storage blocked: play on unsaved */ }
  },
  hasSave() {
    try { return !!localStorage.getItem("lowtide.save.v1"); } catch (e) { return false; }
  },
  clearSave() {
    try { localStorage.removeItem("lowtide.save.v1"); } catch (e) { /* ignore */ }
  },
  _load() {
    try {
      const raw = localStorage.getItem("lowtide.save.v1");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return;
      this.cash = s.cash | 0;
      this.respect = s.respect | 0;
      Missions.done = s.done || {};
      if (Array.isArray(s.pkg)) {
        s.pkg.forEach((g, i) => { if (City.packages[i]) City.packages[i].got = !!g; });
        this.packagesGot = City.packages.filter((k) => k.got).length;
      }
      if (Array.isArray(s.owned)) this.ownedHouses = s.owned;
      this.ownAllHouses = !!s.ownAll;
      this.garageCar = s.garage || null;
    } catch (e) { /* a broken save is a fresh start */ }
  },

  starsFor(heat) {
    let s = 0;
    for (let i = 0; i < STAR_AT.length; i++) if (heat >= STAR_AT[i]) s = i;
    return s;
  },

  // A crime goes on the heat only if someone saw it. A cop with line of
  reportCrime(kind, x, y) {
    for (const car of this.cars) {
      if (car.driver === "cop" && dist2(car.x, car.y, x, y) < 85 * 85 &&
          Police.hasLOS(car.x, car.y, x, y)) {
        this._applyCrime(kind, x, y);
        return true;
      }
    }
    if (this.stars > 0) { this._applyCrime(kind, x, y); return true; }
    let wit = null, bd = 30 * 30;
    for (const ped of this.peds) {
      if (ped.state === "down") continue;
      const d = dist2(ped.x, ped.y, x, y);
      if (d < bd) { bd = d; wit = ped; }
    }
    if (wit) {
      this.pendingReports.push({ kind, x, y, t: 2.5, ped: wit });
      return true;
    }
    return false;
  },

  _applyCrime(kind, x, y) {
    this.heat += CRIME[kind] || 0;
    this.stars = this.starsFor(this.heat);
    for (const car of this.cars) {
      if (car.driver === "cop" && car.ai) { car.ai.sx = x; car.ai.sy = y; }
    }
  },

  step(dt) {
    if (this.state !== "play") return;
    if (this.selectOpen) { this._selectStep(); Input.endStep(); return; }
    if (Input.consume("jobs") && !this.dialogue) { this.selectOpen = true; Input.endStep(); return; }
    this.events.length = 0;
    this.time += dt;

    // Clock and weather: a Markov chain rolled once a game hour.
    this.hours = (this.hours + dt * 24 / DAY_SECONDS) % 24;
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 40;
      const rows = {
        clear: [0.70, 0.90, 0.95, 0.95], cloud: [0.30, 0.70, 0.90, 0.95],
        rain: [0.10, 0.40, 0.80, 0.95], storm: [0, 0.20, 0.70, 1],
        fog: [0.40, 0.70, 0.80, 0.80],
      };
      const row = rows[this.weather] || rows.clear;
      const roll = this.rng.next();
      const names = ["clear", "cloud", "rain", "storm", "fog"];
      for (let i = 0; i < 5; i++) {
        if (roll <= (i < 4 ? row[i] : 1)) { this.weather = names[i]; break; }
      }
    }
    GRIP_MUL = this.weather === "rain" ? 0.82 : this.weather === "storm" ? 0.74 : 1;
    if (this.weather === "storm" && this.rng.chance(dt / 8)) this.lightningT = 0.16;
    if (this.lightningT > 0) this.lightningT -= dt;

    this._playerStep(dt);
    Traffic.update(this, dt, this.events, this.rng);
    Peds.update(this, dt, this.events, this.rng);
    Police.update(this, dt, this.events, this.rng);
    this._collisions(dt);
    this._events(dt);
    Missions.update(this, dt);
    this._wantedStep(dt);
    this._placesStep(dt);
    this._promptStep();

    for (let i = this.pendingReports.length - 1; i >= 0; i--) {
      const r = this.pendingReports[i];
      r.t -= dt;
      if (r.t > 0) continue;
      this.pendingReports.splice(i, 1);
      if (r.ped.state !== "down" && this.peds.includes(r.ped) &&
          dist2(r.ped.x, r.ped.y, r.x, r.y) < 50 * 50) {
        this._applyCrime(r.kind, r.x, r.y);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].t -= dt;
      if (this.tracers[i].t <= 0) this.tracers.splice(i, 1);
    }

    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.resultScreen) {
      this.resultScreen.t -= dt;
      if (this.resultScreen.t <= 0) this.resultScreen = null;
    }
    Input.endStep();
  },

  // The phone's mission list: navigate, pick a giver to waypoint, close.
  _selectStep() {
    const list = Missions.list(this);
    if (Input.consume("jobs") || Input.consume("pause")) { this.selectOpen = false; return; }
    if (Input.consume("up")) Missions.selectIdx = (Missions.selectIdx + list.length - 1) % list.length;
    if (Input.consume("down")) Missions.selectIdx = (Missions.selectIdx + 1) % list.length;
    if (Input.consume("confirm") || Input.consume("interact")) {
      const row = list[Missions.selectIdx];
      if (row && row.state !== "locked") {
        const g = City.givers[row.def.giver];
        if (g) this.waypoint = { x: g.x, y: g.y };
      }
      this.selectOpen = false;
    }
  },

  // Services and collectibles that tick every step: spike strips under
  _placesStep(dt) {
    const p = this.player;
    if (p.car) {
      for (const s of this.spikes) {
        if (!p.car.spiked && Math.abs(p.car.x - s.x) < 1.6 &&
            Math.abs(p.car.y - s.y) < s.len / 2 && carSpeed(p.car) > 4) {
          p.car.spiked = true;
          this.toast = { text: "Tyres shredded on the spike strip!", t: 2.6 };
        }
      }
      let inSpray = false;
      if (this.stars <= 4) {
        for (const s of City.sprays) {
          if (dist2(p.car.x, p.car.y, s.x, s.y) < 64) { inSpray = true; break; }
        }
      }
      if (inSpray && carSpeed(p.car) < 1.2) {
        this.sprayT += dt;
        if (this.sprayT > 1.1 && !this._sprayLatch) {
          this._sprayLatch = true;
          const free = Missions.active && Missions.active.def.id === "paint_it_hot";
          if (free || this.cash >= 250) {
            if (!free) this.cash -= 250;
            this.heat = 0; this.stars = 0;
            p.car.damage = 0; p.car.spiked = false;
            p.car.color = this.rng.pick(CAR_COLORS);
            this.banner = {
              text: "Spray Rápido",
              sub: free ? "On Ramón's tab — fresh paint, clean record" : "Fresh paint, clean record — $250",
              t: 2.6,
            };
          } else {
            this.toast = { text: "Spray Rápido needs $250", t: 2 };
          }
        }
      } else this.sprayT = 0;
      if (!inSpray) this._sprayLatch = false;
    }
    const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
    for (const pk of City.packages) {
      if (pk.got) continue;
      if (dist2(px, py, pk.x, pk.y) < 12) {
        pk.got = true;
        this.packagesGot++;
        this.cash += 100;
        this.toast = { text: "Hidden package " + this.packagesGot + " / 20 · +$100", t: 2.2 };
        if (this.packagesGot === 20) {
          this.cash += 1000;
          this.banner = { text: "All 20 packages", sub: "+$1,000 — the city provides", t: 3 };
        }
        this.save();
      }
    }
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
    // A car handed over by a mission step is a gift, not a theft.
    const handed = Missions.active && Missions.active.car === best;
    if (!handed) {
      if (best.type === "police") this.reportCrime("stealCop", best.x, best.y);
      else if (hadDriver) this.reportCrime("carjack", best.x, best.y);
      else if (wasParked) this.reportCrime("stealParked", best.x, best.y);
    }
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
        if (ev.car === this.player.car && ev.other) ev.other._byPlayer = true;
        if (ev.other === this.player.car && ev.car) ev.car._byPlayer = true;
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
    // Mission givers: anyone with work for you gets a prompt.
    for (const key of Object.keys(City.givers)) {
      const g = City.givers[key];
      if (!g || dist2(p.x, p.y, g.x, g.y) >= 20) continue;
      const def = Missions.forGiver(this, key);
      if (def) {
        this.prompt = "E — Talk to " + def.giverName.split(" — ")[0];
        this.promptAction = () => Missions.start(this, def);
        return;
      }
    }
    // Safehouses: buy the door, rest behind it, work the garage.
    for (let i = 0; i < City.safehouses.length; i++) {
      const h = City.safehouses[i];
      if (dist2(p.x, p.y, h.x, h.y) >= 14) continue;
      const owned = this.ownAllHouses || this.ownedHouses[i];
      if (!owned) {
        if (this.cash >= h.price) {
          this.prompt = "E — Buy this safehouse ($" + h.price.toLocaleString("en-US") + ")";
          this.promptAction = () => {
            this.cash -= h.price;
            this.ownedHouses[i] = true;
            this.banner = { text: "Safehouse bought", sub: "A door of your own in Puerto Ámbar", t: 2.6 };
            this.save();
          };
        } else {
          this.prompt = "Safehouse — $" + h.price.toLocaleString("en-US");
        }
        return;
      }
      if (h.garage) {
        let bayCar = null;
        for (const car of this.cars) {
          if (!car.driver && !car.sunk && dist2(car.x, car.y, h.x, h.y) < 64) { bayCar = car; break; }
        }
        if (bayCar && !this.garageCar) {
          this.prompt = "E — Store the " + bayCar.def.name + " in the garage";
          this.promptAction = () => {
            this.garageCar = { type: bayCar.type, color: bayCar.color, damage: bayCar.damage };
            this.cars.splice(this.cars.indexOf(bayCar), 1);
            this.toast = { text: "Stored in the garage", t: 2 };
            this.save();
          };
          return;
        }
        if (!bayCar && this.garageCar) {
          const g2 = this.garageCar;
          this.prompt = "E — Take out the " + VEHICLE_TYPES[g2.type].name;
          this.promptAction = () => {
            const car = makeCar(g2.type, h.x + 4, h.y, 0, g2.color);
            car.damage = g2.damage;
            car.parked = true;
            this.cars.push(car);
            this.garageCar = null;
            this.save();
          };
          return;
        }
      }
      this.prompt = "E — Rest at the safehouse";
      this.promptAction = () => {
        p.health = PLAYER.health;
        if (this.hours > 19 || this.hours < 5.5) this.hours = 8;
        this.banner = { text: "Rested", sub: "The city kept turning without you", t: 2.2 };
        this.save();
      };
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
