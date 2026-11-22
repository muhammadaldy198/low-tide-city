"use strict";
// Low Tide City — keyboard input with edge detection.
//
// `keys` holds the live state by semantic action; `pressed` holds actions
// that went down since the last simulation step, so one physical press is
// consumed exactly once even at a fixed timestep.

const Input = {
  keys: Object.create(null),
  pressed: Object.create(null),
  _map: {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
    ShiftLeft: "sprint", ShiftRight: "sprint",
    KeyE: "interact",
    Space: "handbrake",
    KeyM: "map",
    KeyP: "pause", Escape: "pause",
    Enter: "confirm",
  },
  init() {
    addEventListener("keydown", (e) => {
      const a = this._map[e.code];
      if (!a) return;
      if (!this.keys[a]) this.pressed[a] = true;
      this.keys[a] = true;
      if (a === "up" || a === "down" || a === "left" || a === "right" || a === "handbrake") {
        e.preventDefault();
      }
    });
    addEventListener("keyup", (e) => {
      const a = this._map[e.code];
      if (a) this.keys[a] = false;
    });
    addEventListener("blur", () => {
      this.keys = Object.create(null);
    });
  },
  // Called by the game loop after each fixed step.
  endStep() {
    this.pressed = Object.create(null);
  },
  // Read-and-clear one pressed action: exactly one consumer gets it.
  consume(name) {
    if (this.pressed[name]) { delete this.pressed[name]; return true; }
    return false;
  },
  axisX() { return (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0); },
  axisY() { return (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0); },
};
