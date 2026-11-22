"use strict";
// Low Tide City — missions: a small step runner plus the story chain.
//
// A mission is a list of steps; each step knows how to enter, how to test
// itself against the world, and what the HUD should say while it runs.
// Step types: dialogue (advance with E), enterVehicle, goto (reach a
// place, optionally in a specific car), escape (drop the heat to a level).

const Missions = {
  active: null,     // {def, i, car}
  done: {},         // mission id -> true
  failedNote: "",

  available(world) {
    if (this.active) return null;
    if (!this.done.wheels_up) return MISSION_WHEELS_UP;
    return null;
  },

  start(world, def) {
    this.active = { def, i: 0 };
    this._enter(world);
    world.banner = { text: def.title, sub: def.giver, t: 3.2 };
  },

  _enter(world) {
    const step = this.active.def.steps[this.active.i];
    if (!step) return;
    if (step.type === "dialogue") {
      world.dialogue = { lines: step.lines, at: 0 };
    }
    if (step.type === "enterVehicle" && step.carRef === "missionCar") {
      this.active.car = world.missionCar;
    }
  },

  _advance(world) {
    const a = this.active;
    a.i++;
    if (a.i >= a.def.steps.length) {
      const def = a.def;
      this.active = null;
      this.done[def.id] = true;
      world.cash += def.reward.cash;
      world.respect += def.reward.respect;
      world.resultScreen = {
        kind: "complete", title: def.title,
        lines: ["+$" + def.reward.cash, "+" + def.reward.respect + " respect"],
        t: 4.5,
      };
      return;
    }
    this._enter(world);
  },

  fail(world, why) {
    if (!this.active) return;
    const def = this.active.def;
    this.active = null;
    world.dialogue = null;
    world.resultScreen = { kind: "failed", title: def.title, lines: [why], t: 4 };
  },

  // The HUD reads this: current objective text + world marker, if any.
  objective(world) {
    const a = this.active;
    if (!a) return null;
    const step = a.def.steps[a.i];
    switch (step.type) {
      case "dialogue":
        return { text: "Talk to " + step.speaker, marker: null };
      case "enterVehicle":
        return { text: step.text, marker: a.car ? { x: a.car.x, y: a.car.y } : null };
      case "goto":
        return { text: step.text, marker: { x: step.x, y: step.y } };
      case "escape":
        return { text: step.text, marker: null };
      default:
        return null;
    }
  },

  update(world, dt) {
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
        if (p.car && a.car && p.car === a.car) this._advance(world);
        break;
      }
      case "goto": {
        const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
        if (step.needCar && !p.car) break;
        if (step.carRef === "missionCar" && p.car !== a.car) break;
        if (dist2(px, py, step.x, step.y) < step.r * step.r) this._advance(world);
        break;
      }
      case "escape": {
        if (world.stars <= step.toStars) this._advance(world);
        break;
      }
    }
  },
};

// Mission 1 — "Wheels Up". Marisol runs the dock crews; her Corvo sedan
// needs to reach a garage in Centro before anyone asks whose it is.
const MISSION_WHEELS_UP = {
  id: "wheels_up",
  title: "Wheels Up",
  giver: "Marisol — Los Muelles",
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
      type: "goto", carRef: "missionCar", needCar: true,
      x: 0, y: 0, r: 9, // filled from City.garagePos at build time
      text: "Take the Corvo to the garage in Centro",
    },
  ],
};
