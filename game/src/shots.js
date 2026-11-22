"use strict";
// Low Tide City — screenshot staging.

const Shots = {
  stage(name, world) {
    const fn = {
      cover: this._cover,
      city: this._city,
      chase: this._chase,
      mission: this._mission,
    }[name];
    if (!fn) return null;
    return fn.call(this, world);
  },

  // Run the world with a scripted keyboard for n fixed steps.
  _run(world, steps, script) {
    for (let s = 0; s < steps; s++) {
      Input.keys = Object.create(null);
      Input.pressed = Object.create(null);
      if (script) script(s);
      world.state = "play";
      world.step(DT);
    }
    Input.keys = Object.create(null);
    Input.pressed = Object.create(null);
  },

  _cover(world) {
    world.hours = 19.35;
    world.weather = "clear";
    // A Falcata at speed on the La Orilla avenue, sliding through the turn.
    const road = 12, cx = roadCenter(road);
    const car = makeCar("sports", cx + City.laneOffset(road), 1160, -Math.PI / 2, "#c23b2e");
    car.driver = "player";
    world.cars.push(car);
    world.player.car = car;
    world.player.x = car.x; world.player.y = car.y;
    car.vy = -15.5; car.vx = 1.5;
    // Two patrol cars in pursuit, close behind.
    for (let i = 0; i < 2; i++) {
      const cop = makeCar("police", cx + 2 + i * 7, 1183 + i * 12, -Math.PI / 2, "#e8e8e8");
      cop.driver = "cop";
      cop.vy = -19.5;
      cop.ai = { mode: "hunt", searchT: 0, sx: car.x, sy: car.y, stuckT: 0, reverseT: 0, lx: cop.x, ly: cop.y };
      world.cars.push(cop);
    }
    // Traffic ahead, both ways, so the avenue feels inhabited.
    const ahead = makeCar("sedan", cx + City.laneOffset(road), 1066, -Math.PI / 2, "#d8d8d8");
    ahead.driver = "traffic"; ahead.vy = -10;
    ahead.ai = { leg: { vertical: true, k: road, dir: -1 }, path: [], pathI: 0 };
    Traffic._extendPath(ahead, world.rng);
    world.cars.push(ahead);
    const oncoming = makeCar("taxi", cx - City.laneOffset(road), 1096, Math.PI / 2, "#e8a812");
    oncoming.driver = "traffic"; oncoming.vy = 11;
    oncoming.ai = { leg: { vertical: true, k: road, dir: 1 }, path: [], pathI: 0 };
    Traffic._extendPath(oncoming, world.rng);
    world.cars.push(oncoming);
    world.heat = 400; // three stars
    world.stars = 3;
    // The helicopter is already on station, searchlight swinging in.
    world.heli = { x: car.x + 15, y: car.y - 19, vx: 0, vy: -12, ang: -Math.PI / 2, fireT: 2.5 };
    this._run(world, 30, (s) => {
      Input.keys.up = true;
      Input.keys.right = s > 9 && s < 25;
      Input.keys.handbrake = s > 13 && s < 25;
    });
    const c = world.player.car;
    return { x: c.x + 8, y: c.y + 3, zoom: 1.22 };
  },

  _city(world) {
    world.hours = 17.8;
    world.weather = "clear";
    // Golden hour on the Centro avenue: the player's Toro GT in traffic.
    const road = 8, cx = roadCenter(road);
    const car = makeCar("muscle", cx - City.laneOffset(road), 700, Math.PI / 2, "#2e5fc2");
    car.driver = "player";
    car.vy = 11;
    world.cars.push(car);
    world.player.car = car;
    world.player.x = car.x; world.player.y = car.y;
    // Company on the road, both directions.
    const others = [
      ["sedan", cx + City.laneOffset(road), 664, -Math.PI / 2, -10],
      ["taxi", cx - City.laneOffset(road), 742, Math.PI / 2, 10],
      ["suv", cx - City.laneOffset(road), 668, Math.PI / 2, 9],
      ["compact", cx + City.laneOffset(road), 726, -Math.PI / 2, -11],
    ];
    for (const [type, x, y, ang, vy] of others) {
      const oc = makeCar(type, x, y, ang, world.rng.pick(CAR_COLORS));
      oc.driver = "traffic";
      oc.vy = vy;
      oc.ai = { leg: { vertical: true, k: road, dir: vy > 0 ? 1 : -1 }, path: [], pathI: 0 };
      Traffic._extendPath(oc, world.rng);
      world.cars.push(oc);
    }
    // Sidewalks alive near the avenue.
    for (let i = 0; i < 9; i++) Peds.spawn(world, world.rng);
    this._run(world, 30, () => { Input.keys.up = true; });
    const c = world.player.car;
    return { x: c.x - 16, y: c.y + 4, zoom: 1.05 };
  },

  _chase(world) {
    world.hours = 22.15;
    world.weather = "rain";
    // Night, rain, the middle bridge — and the far end is blocked.
    const row = 7, cy = roadCenter(row);
    const river = City.riverRect();
    const midX = (river.x0 + river.x1) / 2;
    const car = makeCar("sedan", midX - 34, cy + City.laneOffset(row), 0, "#d8d8d8");
    car.driver = "player";
    car.vx = 21;
    world.cars.push(car);
    world.player.car = car;
    world.player.x = car.x; world.player.y = car.y;
    for (let i = 0; i < 2; i++) {
      const cop = makeCar("police", midX - 56 - i * 15, cy + City.laneOffset(row) + (i ? 3.4 : 0), 0, "#e8e8e8");
      cop.driver = "cop";
      cop.vx = 22;
      cop.ai = { mode: "hunt", searchT: 0, sx: car.x, sy: car.y, stuckT: 0, reverseT: 0, lx: cop.x, ly: cop.y };
      world.cars.push(cop);
    }
    world.heat = 900; // five stars: the full response
    world.stars = 5;
    world.heli = { x: midX - 6, y: cy - 44, vx: 10, vy: 0, ang: 0, fireT: 2.5 };
    this._run(world, 30, () => { Input.keys.up = true; });
    const c = world.player.car;
    return { x: c.x + 20, y: c.y - 4, zoom: 1.08 };
  },

  _mission(world) {
    world.hours = 18.55;
    world.weather = "clear";
    // Hot Cargo, mid-run: the loaded van is out of the docks, running
    const p = world.player;
    p.x = City.dockPos.x; p.y = City.dockPos.y + 2;
    Missions.start(world, MISSIONS[1]);
    world.dialogue = null;
    Missions.active.i = 1; // dialogue heard; now the enterVehicle step
    Missions._enter(world); // spawns and binds the cargo van
    const mc = Missions.active.car;
    mc.parked = false;
    mc.driver = "player";
    p.car = mc;
    p.x = mc.x; p.y = mc.y; p.ang = mc.ang;
    world.state = "play";
    Missions.update(world, DT); // enterVehicle step completes -> deliver
    // The van is running south on road 11, home toward the port.
    mc.x = roadCenter(11) - City.laneOffset(11);
    mc.y = 1062;
    mc.ang = Math.PI / 2;
    mc.vy = 13; mc.vx = 0;
    mc.damage = 18; // a scuffed wing: the cargo rules are in play
    p.x = mc.x; p.y = mc.y; p.ang = mc.ang;
    const ahead = makeCar("compact", mc.x, 1124, Math.PI / 2, "#3f9e58");
    ahead.driver = "traffic"; ahead.vy = 10;
    ahead.ai = { leg: { vertical: true, k: 11, dir: 1 }, path: [], pathI: 0 };
    Traffic._extendPath(ahead, world.rng);
    world.cars.push(ahead);
    const south = makeCar("van", roadCenter(11) + City.laneOffset(11), 1150, -Math.PI / 2, "#9fb6c9");
    south.driver = "traffic"; south.vy = -10;
    south.ai = { leg: { vertical: true, k: 11, dir: -1 }, path: [], pathI: 0 };
    Traffic._extendPath(south, world.rng);
    world.cars.push(south);
    this._run(world, 215, () => { Input.keys.up = true; });
    const c = world.player.car || mc;
    return { x: c.x, y: c.y, zoom: 1.1 };
  },

  // The cover carries the game's name, like a box shot.
  paintOverlay(ctx, name) {
    if (name !== "cover") return;
    ctx.textAlign = "left";
    ctx.font = "bold 52px Georgia, serif";
    ctx.fillStyle = "rgba(6,8,14,0.5)";
    ctx.fillText("LOW TIDE CITY", 45, 97);
    ctx.fillStyle = "#ffb000";
    ctx.fillText("LOW TIDE CITY", 43, 95);
    ctx.font = "14px Verdana, sans-serif";
    ctx.fillStyle = "rgba(255,224,160,0.95)";
    ctx.fillText("P U E R T O   Á M B A R", 45, 121);
  },
};
