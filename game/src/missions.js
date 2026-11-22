"use strict";
// Low Tide City — missions and side work.

function anchor(name) {
  const lot = (i, j) => City.lotRect(i, j);
  switch (name) {
    case "garage": return City.garagePos;
    case "dock": return City.dockPos;
    case "station": return City.stationPos;
    case "safehouse": return City.safehouses[0];
    case "spray2": return City.sprays[1];
    case "bank": { const l = lot(8, 5); return { x: (l.x0 + l.x1) / 2, y: l.y1 + 6 }; }
    case "port": { const l = lot(11, 13); return { x: (l.x0 + l.x1) / 2, y: (l.y0 + l.y1) / 2 }; }
    case "warehouse": { const l = lot(10, 12); return { x: l.x0 - 6, y: (l.y0 + l.y1) / 2 }; }
    case "impound": return { x: City.stationPos.x + 16, y: City.stationPos.y + 2 };
    case "ramon": return City.givers.ramon;
    case "lucia": return City.givers.lucia;
  }
  return { x: 0, y: 0 };
}

const Missions = {
  active: null,     // {def, i, car, target, t, left, count, cp, points, items, tx, ty}
  done: {},         // mission id -> true
  failedNote: "",
  selectIdx: 0,

  // The next mission this giver hands out: chain order, prerequisites
  forGiver(world, giver) {
    if (this.active) return null;
    for (const def of MISSIONS) {
      if (def.giver !== giver || this.done[def.id]) continue;
      if (def.requires.some((r) => !this.done[r])) continue;
      if (rankFor(world.respect) < (def.rank || 0)) continue;
      return def;
    }
    return null;
  },

  // Every mission with its state, for the phone (Tab) list.
  list(world) {
    return MISSIONS.map((def) => {
      let state = "ready";
      if (this.done[def.id]) state = "done";
      else if (def.requires.some((r) => !this.done[r])) state = "locked";
      else if (rankFor(world.respect) < (def.rank || 0)) state = "rank " + ((def.rank || 0) + 1);
      return { def, state };
    });
  },

  start(world, def) {
    this.active = { def, i: 0, car: null, target: null, t: 0, left: 0, count: 0, cp: 0 };
    this._enter(world);
    world.banner = { text: def.title, sub: def.giverName, t: 3.2 };
  },

  _heat(world, stars) {
    world.heat = Math.max(world.heat, STAR_AT[stars]);
    world.stars = world.starsFor(world.heat);
  },

  _enter(world) {
    const a = this.active;
    const step = a.def.steps[a.i];
    if (!step) return;
    a.t = 0; a.count = 0; a.cp = 0; a.stopT = 0; a.closeT = 0; a.farT = 0;
    if (step.heatAtEnter) this._heat(world, step.heatAtEnter);
    if (step.type === "dialogue") {
      world.dialogue = { lines: step.lines, at: 0 };
    }
    if (step.at) { const an = anchor(step.at); a.tx = an.x; a.ty = an.y; }
    else if (step.x !== undefined) { a.tx = step.x; a.ty = step.y; }
    if (step.type === "enterVehicle") {
      if (step.carRef === "missionCar") a.car = world.missionCar;
      else if (step.spawn) {
        const an = anchor(step.spawn.at);
        const car = makeCar(step.spawn.type, an.x + (step.spawn.dx || 0), an.y + (step.spawn.dy || 0),
          step.spawn.ang || 0, step.spawn.color || "#8a8f96");
        car.parked = true;
        world.cars.push(car);
        a.car = car;
      } else a.car = null;
    }
    if (step.type === "chase") {
      const an = anchor(step.at || "ramon");
      const car = makeCar(step.spawnType || "sedan", an.x + (step.dx || 14), an.y + (step.dy || 0),
        0, step.color || "#c2a12e");
      car.driver = "prey";
      world.cars.push(car);
      a.target = car;
    }
    if (step.type === "checkpoints") {
      a.points = step.points.map(([k, m]) => ({ x: roadCenter(k), y: roadCenter(m) }));
      a.left = step.time;
    }
    if (step.type === "collect") {
      a.items = step.atTarget
        ? [{ x: a.dropPos ? a.dropPos.x : 0, y: a.dropPos ? a.dropPos.y : 0, got: false }]
        : step.items.map(([x, y]) => ({ x, y, got: false }));
      if (step.seconds) a.left = step.seconds;
    }
    if (step.type === "survive") {
      a.left = step.seconds;
      this._heat(world, step.stars);
    }
    if (step.type === "rampage") a.left = step.seconds;
  },

  _advance(world) {
    const a = this.active;
    a.i++;
    if (a.i >= a.def.steps.length) {
      const def = a.def;
      this.active = null;
      this.done[def.id] = true;
      const before = rankFor(world.respect);
      world.cash += def.reward.cash;
      world.respect += def.reward.respect;
      const lines = ["+$" + def.reward.cash, "+" + def.reward.respect + " respect"];
      if (rankFor(world.respect) > before) lines.push("RANK UP — " + RANKS[rankFor(world.respect)][1]);
      if (def.id === "free_city") world.ownAllHouses = true;
      world.resultScreen = { kind: "complete", title: def.title, lines, t: 4.5 };
      world.save();
      return;
    }
    this._enter(world);
  },

  fail(world, why) {
    if (!this.active) return;
    const def = this.active.def;
    if (this.active.target && this.active.target.driver === "prey") {
      this.active.target.driver = "despawn";
    }
    this.active = null;
    world.dialogue = null;
    world.resultScreen = { kind: "failed", title: def.title, lines: [why], t: 4 };
  },

  // The HUD reads this: current objective text + world marker, if any.
  objective(world) {
    const a = this.active;
    if (!a) return Jobs.objective(world);
    const step = a.def.steps[a.i];
    switch (step.type) {
      case "dialogue":
        return { text: "Talk to " + step.speaker, marker: null };
      case "enterVehicle":
        return { text: step.text, marker: a.car ? { x: a.car.x, y: a.car.y } : null };
      case "goto": case "deliver":
        return { text: step.text, marker: { x: a.tx, y: a.ty } };
      case "escape":
        return { text: step.text, marker: null };
      case "chase":
        return {
          text: step.text, marker: a.target ? { x: a.target.x, y: a.target.y } : null,
          count: step.mode === "follow" ? Math.floor(a.t) + " / " + step.seconds + "s" : null,
        };
      case "checkpoints":
        return {
          text: step.text, marker: a.points[a.cp] || null, timer: a.left,
          count: a.cp + " / " + a.points.length,
        };
      case "survive":
        return { text: step.text, marker: null, timer: a.left };
      case "rampage":
        return { text: step.text, marker: null, timer: a.left, count: a.count + " / " + step.count };
      case "collect": {
        const it = a.items.find((i2) => !i2.got);
        return {
          text: step.text, marker: it || null,
          count: (a.items.length - a.items.filter((i2) => !i2.got).length) + " / " + a.items.length,
        };
      }
      default:
        return null;
    }
  },

  update(world, dt) {
    Jobs.update(world, dt);
    const a = this.active;
    if (!a) return;
    const step = a.def.steps[a.i];
    const p = world.player;

    if (a.car && (a.car.sunk || a.car.damage >= 130)) {
      this.fail(world, "The car was destroyed.");
      return;
    }

    switch (step.type) {
      case "dialogue": {
        if (!world.dialogue) { this._advance(world); break; }
        if (Input.consume("interact") || Input.consume("confirm")) {
          world.dialogue.at++;
          if (world.dialogue.at >= world.dialogue.lines.length) {
            world.dialogue = null;
            this._advance(world);
          }
        }
        break;
      }
      case "enterVehicle": {
        if (p.car && ((a.car && p.car === a.car) || (!a.car && step.matchType && p.car.type === step.matchType))) {
          this._advance(world);
        }
        break;
      }
      case "goto": {
        const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
        if (step.needCar && !p.car) break;
        if (step.needStepCar && p.car !== a.car) break;
        if (dist2(px, py, a.tx, a.ty) < step.r * step.r) this._advance(world);
        break;
      }
      case "deliver": {
        if (!p.car || p.car !== a.car) break;
        if (dist2(p.car.x, p.car.y, a.tx, a.ty) < step.r * step.r) {
          const cap = 130 * (step.maxDamage || 100) / 100;
          if (a.car.damage > cap) { this.fail(world, "The cargo arrived as scrap."); break; }
          this._advance(world);
        }
        break;
      }
      case "escape": {
        if (world.stars <= step.toStars) this._advance(world);
        break;
      }
      case "chase": {
        const t = a.target;
        if (!t || t.sunk || t.driver === "despawn") {
          if (step.mode === "takedown") { a.dropPos = t ? { x: t.x, y: t.y } : null; this._advance(world); }
          else this.fail(world, "The target is gone.");
          break;
        }
        // The prey runs: away from the player, snapped to the road grid.
        const away = Math.atan2(t.y - p.y, t.x - p.x);
        const snap = City.nearestRoadPoint(t.x + Math.cos(away) * 55, t.y + Math.sin(away) * 55);
        stepCar(t, Traffic.drive(t, snap.x, snap.y, step.mode === "follow" ? 15.5 : 14.5, dt), dt, world.events);
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (step.mode === "takedown") {
          if (t.damage >= 130) { a.dropPos = { x: t.x, y: t.y }; this._advance(world); break; }
          if (carSpeed(t) < 0.7 && d < 13) {
            a.stopT += dt;
            if (a.stopT > 3) { a.dropPos = { x: t.x, y: t.y }; this._advance(world); break; }
          } else a.stopT = 0;
          if (d > 230) { this.fail(world, "The debtor got away."); break; }
        } else {
          if (d > 15 && d < 90) a.t += dt;
          if (d < 12) {
            a.closeT += dt;
            if (a.closeT > 2) { this.fail(world, "Spotted — you rode her bumper."); break; }
          } else a.closeT = 0;
          if (d > 210) {
            a.farT += dt;
            if (a.farT > 5) { this.fail(world, "You lost the tail."); break; }
          } else a.farT = 0;
          if (a.t >= step.seconds) this._advance(world);
        }
        break;
      }
      case "checkpoints": {
        a.left -= dt;
        const pt = a.points[a.cp];
        if (pt) {
          const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
          if (dist2(px, py, pt.x, pt.y) < 144) {
            a.cp++;
            a.left += step.bonus || 0;
            world.toast = { text: "Checkpoint " + a.cp + " / " + a.points.length, t: 1.6 };
          }
        }
        if (a.cp >= a.points.length) { this._advance(world); break; }
        if (a.left <= 0) this.fail(world, "Out of time.");
        break;
      }
      case "collect": {
        if (step.seconds) {
          a.left -= dt;
          if (a.left <= 0) { this.fail(world, "Out of time."); break; }
        }
        const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
        let left = 0;
        for (const it of a.items) {
          if (it.got) continue;
          if (dist2(px, py, it.x, it.y) < 16) {
            it.got = true;
            world.toast = { text: "Package recovered", t: 1.6 };
          } else left++;
        }
        if (left === 0) this._advance(world);
        break;
      }
      case "survive": {
        if (world.stars < step.stars) this._heat(world, step.stars);
        a.left -= dt;
        if (a.left <= 0) this._advance(world);
        break;
      }
      case "rampage": {
        a.left -= dt;
        for (const car of world.cars) {
          if (car._counted || !car._byPlayer || car === p.car) continue;
          if (car.damage >= 100) { car._counted = true; a.count++; }
        }
        if (a.count >= step.count) { this._advance(world); break; }
        if (a.left <= 0) this.fail(world, "Time — the strip still stands.");
        break;
      }
    }
  },
};

// Side work: climb into a cab or a van with no story mission running and
const Jobs = {
  job: null, // {kind, phase, x, y, t, chain, dist}

  _roadPoint(world, lo, hi) {
    const rng = world.rng;
    for (let i = 0; i < 12; i++) {
      const vert = rng.chance(0.5);
      const k = rng.int(0, BLOCKS);
      if (!vert && !BRIDGE_ROWS.includes(k)) continue;
      const along = clamp((vert ? world.player.y : world.player.x) + rng.range(-hi, hi), 40, WORLD_SIZE - 40);
      const pt = vert ? { x: roadCenter(k), y: along } : { x: along, y: roadCenter(k) };
      const d = Math.hypot(pt.x - world.player.x, pt.y - world.player.y);
      if (d >= lo && d <= hi && !City.isWater(pt.x, pt.y)) return pt;
    }
    return { x: world.player.x + 150, y: world.player.y };
  },

  update(world, dt) {
    const p = world.player;
    const want = !Missions.active && p.car
      ? (p.car.type === "taxi" ? "taxi" : p.car.type === "van" ? "courier" : null)
      : null;
    if (!want) { this.job = null; return; }
    if (!this.job || this.job.kind !== want) {
      const pt = this._roadPoint(world, 140, 320);
      this.job = { kind: want, phase: "pickup", x: pt.x, y: pt.y, t: 0, chain: 0 };
      world.banner = {
        text: want === "taxi" ? "Taxi — a fare is waiting" : "Courier — a pickup is waiting",
        sub: "Follow the yellow marker", t: 2.6,
      };
      return;
    }
    const j = this.job;
    const d = Math.hypot(p.x - j.x, p.y - j.y);
    if (carSpeed(p.car) < 1 && d < 7) {
      j.t += dt;
      if (j.t > 0.8) {
        j.t = 0;
        if (j.phase === "pickup") {
          const pt = this._roadPoint(world, 200, 520);
          j.phase = "drop"; j.x = pt.x; j.y = pt.y;
          j.dist = Math.hypot(pt.x - p.x, pt.y - p.y);
          world.toast = { text: j.kind === "taxi" ? "Fare aboard — go!" : "Package loaded — go!", t: 2 };
        } else {
          const pay = Math.round(j.dist * 1.6) + 40 + j.chain * 15;
          world.cash += pay;
          j.chain++;
          world.toast = {
            text: (j.kind === "taxi" ? "Fare" : "Delivery") + " +$" + pay +
              (j.chain > 1 ? " · chain ×" + j.chain : ""),
            t: 2.6,
          };
          const pt = this._roadPoint(world, 140, 340);
          j.phase = "pickup"; j.x = pt.x; j.y = pt.y;
        }
      }
    } else j.t = 0;
  },

  objective(world) {
    const j = this.job;
    if (!j) return null;
    return {
      text: (j.kind === "taxi" ? "Taxi" : "Courier") +
        (j.phase === "pickup" ? ": reach the pickup" : ": reach the drop-off"),
      marker: { x: j.x, y: j.y },
    };
  },
};

// Mission 1 — "Wheels Up". Marisol runs the dock crews; her Corvo sedan
const MISSION_WHEELS_UP = {
  id: "wheels_up",
  title: "Wheels Up",
  giver: "marisol",
  giverName: "Marisol — Los Muelles",
  requires: [],
  reward: { cash: 500, respect: 10 },
  steps: [
    {
      type: "dialogue", speaker: "Marisol",
      lines: [
        { who: "Marisol", text: "You walk like someone who needs money, chico." },
        { who: "Marisol", text: "That grey Corvo by the office? It needs to be in Centro. Tonight." },
        { who: "You", text: "Whose car is it?" },
        { who: "Marisol", text: "Wrong question. The garage by Ámbar Tower. Don't scratch it." },
      ],
    },
    { type: "enterVehicle", carRef: "missionCar", text: "Get in Marisol's Corvo" },
    {
      type: "goto", carRef: "missionCar", needCar: true, needStepCar: true, at: "garage",
      x: 0, y: 0, r: 9, // x/y kept for the world-build hook; `at` wins
      text: "Take the Corvo to the garage in Centro",
    },
  ],
};

const D = (speaker, lines) => ({ type: "dialogue", speaker, lines });
const L = (who, text) => ({ who, text });

// The thirteen-mission chain, in hand-out order.
const MISSIONS = [
  MISSION_WHEELS_UP,
  {
    id: "hot_cargo", title: "Hot Cargo", giver: "marisol", giverName: "Marisol — Los Muelles",
    requires: ["wheels_up"], reward: { cash: 900, respect: 15 },
    steps: [
      D("Marisol", [
        L("Marisol", "The van by the office is full of 'frozen fish'. The port crane yard wants it whole."),
      ]),
      { type: "enterVehicle", spawn: { type: "van", at: "dock", dx: 26, dy: 10, color: "#9fb6c9" }, text: "Get in the loaded van" },
      { type: "deliver", at: "port", r: 11, maxDamage: 40, text: "Deliver the van to the port, gently" },
    ],
  },
  {
    id: "shake_tail", title: "Shake the Tail", giver: "marisol", giverName: "Marisol — Los Muelles",
    requires: ["hot_cargo"], reward: { cash: 1200, respect: 20 },
    steps: [
      D("Marisol", [
        L("Marisol", "Pick up a package at the Centro bank. If the Policía bite, lose them before my door."),
      ]),
      { type: "goto", at: "bank", r: 8, text: "Pick up the package at the bank" },
      { type: "escape", toStars: 0, heatAtEnter: 2, text: "Lose the Policía" },
      { type: "goto", at: "dock", r: 9, text: "Bring the package to Marisol" },
    ],
  },
  {
    id: "the_debt", title: "The Debt", giver: "ramon", giverName: "Tío Ramón — Casco",
    requires: ["hot_cargo"], reward: { cash: 1500, respect: 25 },
    steps: [
      D("Tío Ramón", [
        L("Tío Ramón", "A debtor, gold sedan, leaving now. Stop him and take the envelope."),
      ]),
      { type: "chase", mode: "takedown", spawnType: "sedan", at: "ramon", color: "#c2a12e", text: "Stop the debtor's sedan" },
      { type: "collect", atTarget: true, text: "Take the envelope" },
    ],
  },
  {
    id: "paint_it_hot", title: "Paint It Hot", giver: "ramon", giverName: "Tío Ramón — Casco",
    requires: ["the_debt"], rank: 1, reward: { cash: 1800, respect: 30 },
    steps: [
      D("Tío Ramón", [
        L("Tío Ramón", "A patrol car sits at the station, full tank. Take it to Spray Rápido in Casco — new paint, no questions."),
      ]),
      { type: "enterVehicle", spawn: { type: "police", at: "station", dx: 10, dy: 6 }, text: "Take the patrol car" },
      { type: "goto", at: "spray2", r: 9, needCar: true, needStepCar: true, heatAtEnter: 3, text: "Get the patrol car resprayed" },
    ],
  },
  {
    id: "neon_rampage", title: "Neon Rampage", giver: "ramon", giverName: "Tío Ramón — Casco",
    requires: ["paint_it_hot"], reward: { cash: 2000, respect: 35 },
    steps: [
      D("Tío Ramón", [
        L("Tío Ramón", "The Neón strip crews dented my taxis. Wreck eight of their cars in ninety seconds."),
      ]),
      { type: "rampage", count: 8, seconds: 90, text: "Wreck the strip crews' cars" },
    ],
  },
  {
    id: "midnight_line", title: "Midnight Line", giver: "lucia", giverName: "Lucía — La Orilla",
    requires: [], rank: 1, reward: { cash: 2200, respect: 30 },
    steps: [
      D("Lucía", [
        L("Lucía", "Eight corners, one line, my Falcata by the kerb. Beat the clock; scratch her and you walk."),
      ]),
      { type: "enterVehicle", spawn: { type: "sports", at: "lucia", dx: 8, dy: 4, color: "#7a4fa3" }, text: "Get in Lucía's Falcata" },
      {
        type: "checkpoints", text: "Run the midnight line",
        points: [[12, 4], [12, 6], [10, 8], [8, 8], [8, 6], [6, 6], [8, 4], [10, 4]],
        time: 150, bonus: 8,
      },
    ],
  },
  {
    id: "ghost_run", title: "Ghost Run", giver: "lucia", giverName: "Lucía — La Orilla",
    requires: ["midnight_line"], reward: { cash: 2500, respect: 35 },
    steps: [
      D("Lucía", [
        L("Lucía", "Tail the courier forty seconds — close, never on her bumper. Then the Los Muelles warehouse."),
      ]),
      { type: "chase", mode: "follow", spawnType: "sports", at: "lucia", seconds: 40, color: "#2e5fc2", text: "Tail the courier — close, not touching" },
      { type: "goto", at: "warehouse", r: 10, text: "Report at the warehouse" },
    ],
  },
  {
    id: "bridge_out", title: "Bridge Out", giver: "lucia", giverName: "Lucía — La Orilla",
    requires: ["ghost_run"], rank: 2, reward: { cash: 3000, respect: 45 },
    steps: [
      D("Lucía", [
        L("Lucía", "The Policía rehearse bridge closures tonight. Cross all three bridges, both banks, on their clock."),
      ]),
      {
        type: "checkpoints", text: "Cross every bridge, both banks", heatAtEnter: 4,
        points: [[5, 3], [6, 3], [5, 7], [6, 7], [5, 11], [6, 11]],
        time: 170, bonus: 10,
      },
    ],
  },
  {
    id: "evidence", title: "Evidence", giver: "ortega", giverName: "Capitán Ortega — Casco",
    requires: ["neon_rampage", "bridge_out"], reward: { cash: 3500, respect: 50 },
    steps: [
      D("Capitán Ortega", [
        L("Capitán Ortega", "A sedan in my impound filmed the wrong wedding. Take it to Marisol's dock — my patrols will object. That is the point."),
      ]),
      { type: "goto", at: "impound", r: 8, text: "Reach the impound lot" },
      { type: "enterVehicle", spawn: { type: "sedan", at: "impound", dx: 4, dy: 2, color: "#3a3f4a" }, heatAtEnter: 3, text: "Take the evidence sedan" },
      { type: "escape", toStars: 0, text: "Lose the Policía" },
      { type: "deliver", at: "dock", r: 10, maxDamage: 50, text: "Deliver the sedan to the dock" },
    ],
  },
  {
    id: "clean_sweep", title: "Clean Sweep", giver: "ortega", giverName: "Capitán Ortega — Casco",
    requires: ["evidence"], rank: 3, reward: { cash: 4000, respect: 60 },
    steps: [
      D("Capitán Ortega", [
        L("Capitán Ortega", "Internal affairs sweeps tonight. Be the loudest thing in it for sixty seconds — then vanish."),
      ]),
      { type: "survive", seconds: 60, stars: 4, text: "Survive the sweep" },
      { type: "escape", toStars: 0, text: "Vanish" },
    ],
  },
  {
    id: "big_score", title: "The Big Score", giver: "marisol", giverName: "Marisol — Los Muelles",
    requires: ["clean_sweep"], reward: { cash: 8000, respect: 100 },
    steps: [
      D("Marisol", [
        L("Marisol", "The Centro bank, chico. Thirty seconds of alarm, then the van, then the port. After tonight the city works for us."),
      ]),
      { type: "goto", at: "bank", r: 8, text: "Reach the bank" },
      { type: "survive", seconds: 30, stars: 4, text: "Hold while the vault empties" },
      { type: "enterVehicle", spawn: { type: "van", at: "bank", dx: 12, dy: 4, color: "#5c6650" }, text: "Take the getaway van" },
      { type: "deliver", at: "port", r: 11, maxDamage: 60, text: "Get the van to the port" },
      { type: "escape", toStars: 0, heatAtEnter: 5, text: "Lose every star" },
    ],
  },
  {
    id: "free_city", title: "Free City", giver: "marisol", giverName: "Marisol — Los Muelles",
    requires: ["big_score"], reward: { cash: 0, respect: 50 },
    steps: [
      D("Marisol", [
        L("Marisol", "Every door in this city knows your name now. The safehouses? Yours. All of them."),
        L("You", "And the city?"),
        L("Marisol", "The city, chico, is free. Keep it that way."),
      ]),
    ],
  },
];

