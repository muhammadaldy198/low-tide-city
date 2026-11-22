"use strict";
// Low Tide City — bootstrap and game loop.
//
// Two ways in:
//   * plain open: the title screen over a living city, then play.
//   * ?shot=<name>&seed=<n>: stage one deterministic scene (shots.js),
//     paint it, and set window.__shotReady for the capture harness.
//
// The simulation runs on a fixed 1/60 step with an accumulator; rendering
// happens once per animation frame.

(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get("seed") || 7) | 0;

  Input.init();
  const world = World.build(seed);
  Render.buildStatic();
  Render.buildMinimap();

  // ---- screenshot mode ----
  const shotName = params.get("shot");
  if (shotName) {
    world.state = "play";
    const cam = Shots.stage(shotName, world) || { x: world.player.x, y: world.player.y, zoom: 1 };
    Render.draw(ctx, world, cam, 1.25);
    Render.draw(ctx, world, cam, 1.25);
    Hud.draw(ctx, world, 1.25);
    Shots.paintOverlay(ctx, shotName);
    window.__shotReady = true;
    return;
  }

  // ---- interactive mode ----
  let cam = { x: world.player.x, y: world.player.y - 30, zoom: 1 };
  let last = performance.now();
  let acc = 0;
  let mouseX = -1, mouseY = -1;

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (VIEW_W / r.width);
    mouseY = (e.clientY - r.top) * (VIEW_H / r.height);
    if (world.state === "title") {
      for (const rect of Hud.menuRects) {
        if (mouseX >= rect.x && mouseX <= rect.x + rect.w && mouseY >= rect.y && mouseY <= rect.y + rect.h) {
          Hud.menuIndex = rect.index;
        }
      }
    }
  });
  canvas.addEventListener("click", () => {
    if (world.state !== "title") return;
    for (const rect of Hud.menuRects) {
      if (mouseX >= rect.x && mouseX <= rect.x + rect.w && mouseY >= rect.y && mouseY <= rect.y + rect.h) {
        activateMenu(rect.index);
      }
    }
  });

  function activateMenu(index) {
    if (index === 0) {
      world.state = "play";
      world.banner = { text: "Low Tide City", sub: "Find Marisol at the docks — follow the gold marker", t: 3.6 };
    } else {
      world.state = "howto";
    }
  }

  function menuStep() {
    if (world.state === "title") {
      if (Input.consume("up")) Hud.menuIndex = (Hud.menuIndex + 1) % 2;
      if (Input.consume("down")) Hud.menuIndex = (Hud.menuIndex + 1) % 2;
      if (Input.consume("confirm") || Input.consume("interact")) activateMenu(Hud.menuIndex);
      // The city lives behind the menu.
      world.events.length = 0;
      Traffic.update(world, DT, world.events, world.rng);
      Peds.update(world, DT, world.events, world.rng);
      world.carGrid.clear();
      for (const car of world.cars) world.carGrid.insert(car, car.x, car.y);
    } else if (world.state === "howto") {
      if (Input.consume("confirm") || Input.consume("pause") || Input.consume("interact")) {
        world.state = "title";
      }
    }
    Input.endStep();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;

    if (world.state === "play") {
      if (Input.consume("pause")) {
        world.state = "pause";
      } else {
        acc += elapsed;
        let steps = 0;
        while (acc >= DT && steps < 5) {
          world.step(DT);
          acc -= DT;
          steps++;
          if (world.state !== "play") { acc = 0; break; }
        }
        if (steps === 5) acc = 0;
      }
    } else if (world.state === "pause") {
      if (Input.consume("pause")) world.state = "play";
      Input.endStep();
    } else if (world.state === "busted" || world.state === "wasted") {
      world.stateT += elapsed;
      Input.endStep();
      if (world.stateT > 2.6) world.respawn();
    } else {
      menuStep();
    }

    // Camera: follow the player (or their car) with a velocity lead.
    const p = world.player;
    const lead = p.car ? 0.55 : 0.2;
    const tx = p.x + (p.car ? p.car.vx : p.vx) * lead;
    const ty = p.y + (p.car ? p.car.vy : p.vy) * lead;
    if (world.state === "title" || world.state === "howto") {
      // A slow drift over La Orilla behind the title.
      cam.x = City.playerStart.x + Math.sin(now / 9000) * 30;
      cam.y = City.playerStart.y + Math.cos(now / 11000) * 22;
    } else {
      cam.x += (tx - cam.x) * Math.min(1, elapsed * 5);
      cam.y += (ty - cam.y) * Math.min(1, elapsed * 5);
    }
    const vw = VIEW_W / PX_PER_M, vh = VIEW_H / PX_PER_M;
    cam.x = clamp(cam.x, vw / 2 - 24, WORLD_SIZE - vw / 2 + 24);
    cam.y = clamp(cam.y, vh / 2 - 24, WORLD_SIZE - vh / 2 + 24);

    const tNow = now / 1000;
    Render.draw(ctx, world, cam, tNow);
    Hud.draw(ctx, world, tNow);
  }
  requestAnimationFrame(frame);
})();
