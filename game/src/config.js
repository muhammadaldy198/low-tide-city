"use strict";
// Low Tide City — world constants and tuning tables.

const DT = 1 / 60;
const VIEW_W = 1280;
const VIEW_H = 720;
const PX_PER_M = 8; // at zoom 1

// City grid: 14x14 blocks on a 96 m pitch. Road centrelines sit at
const BLOCKS = 14;
const PITCH = 96;
const ROAD_OFF = 48;
const WORLD_SIZE = ROAD_OFF * 2 + BLOCKS * PITCH; // 1440
const RIVER_COL = 5; // block column that is water instead of lots
const BRIDGE_ROWS = [3, 7, 11]; // road rows carrying a bridge deck

function roadCenter(k) { return ROAD_OFF + k * PITCH; }
function isAvenue(k) { return k % 4 === 0; }
function roadWidth(k) { return isAvenue(k) ? 24 : 16; }

// Districts by nearest centre; centres are in block coordinates.
const DISTRICTS = [
  { id: "centro",   name: "Centro",      cx: 8.2,  cy: 6.8,  ground: "#5d6066", tint: "#8f9bb0" },
  { id: "casco",    name: "Casco",       cx: 2.2,  cy: 10.2, ground: "#6b6257", tint: "#c08552" },
  { id: "orilla",   name: "La Orilla",   cx: 12.6, cy: 5.6,  ground: "#8a7f5c", tint: "#e8b4b8" },
  { id: "muelles",  name: "Los Muelles", cx: 10.6, cy: 12.2, ground: "#5a5c55", tint: "#7d8a99" },
  { id: "lomas",    name: "Las Lomas",   cx: 2.0,  cy: 2.2,  ground: "#5f7050", tint: "#a8b89a" },
  { id: "neon",     name: "Neón",        cx: 12.4, cy: 11.4, ground: "#4c4457", tint: "#b07cd8" },
];

// Vehicle types: length/width in metres, top speed m/s, engine m/s^2.
const VEHICLE_TYPES = {
  compact: { name: "Brisa",     len: 3.9, wid: 1.8, maxSpd: 34, accel: 7.5,  grip: 7.0, turn: 2.6, mass: 1.0 },
  sedan:   { name: "Corvo",     len: 4.7, wid: 1.9, maxSpd: 38, accel: 7.0,  grip: 6.5, turn: 2.4, mass: 1.2 },
  muscle:  { name: "Toro GT",   len: 4.8, wid: 2.0, maxSpd: 46, accel: 9.0,  grip: 5.5, turn: 2.3, mass: 1.3 },
  sports:  { name: "Falcata",   len: 4.4, wid: 1.9, maxSpd: 54, accel: 11.5, grip: 7.5, turn: 2.8, mass: 1.1 },
  suv:     { name: "Montaña",   len: 4.9, wid: 2.1, maxSpd: 36, accel: 6.0,  grip: 5.8, turn: 2.1, mass: 1.6 },
  van:     { name: "Carga",     len: 5.4, wid: 2.1, maxSpd: 30, accel: 4.8,  grip: 5.2, turn: 1.9, mass: 1.8 },
  police:  { name: "Patrulla",  len: 4.8, wid: 1.9, maxSpd: 44, accel: 9.5,  grip: 6.8, turn: 2.5, mass: 1.25 },
  taxi:    { name: "Ámbar Cab", len: 4.7, wid: 1.9, maxSpd: 38, accel: 7.0,  grip: 6.5, turn: 2.4, mass: 1.2 },
};
const TRAFFIC_TYPES = ["compact", "sedan", "sedan", "muscle", "suv", "van", "taxi", "compact"];

// Wanted system: heat thresholds per star, patrol cars fielded per level.
const STAR_AT = [0, 50, 150, 350, 600, 850];
const COPS_AT = [0, 2, 3, 4, 6, 8];

// Crime heat values (when witnessed).
const CRIME = {
  hitPed: 20, stealParked: 30, carjack: 60, assault: 25, killPed: 90,
  damageCop: 50, stealCop: 150, killCop: 250, crashProp: 8, hitCar: 10,
};

// Progression: respect thresholds and the title each rank carries.
const RANKS = [
  [0, "Nobody"], [60, "Street Runner"], [160, "Wheelman"],
  [320, "Fixer"], [560, "Legend of Puerto Ámbar"],
];
function rankFor(respect) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (respect >= RANKS[i][0]) r = i;
  return r;
}

// Weather grip multiplier, set by world.js each step (rain loosens tyres).
let GRIP_MUL = 1;

// Clock: a full day lasts 16 real minutes; the game opens at 17:30.
const DAY_SECONDS = 16 * 60;
const START_HOUR = 17.5;

// Player tuning.
const PLAYER = { r: 0.4, walk: 3.2, sprint: 6.5, health: 100 };
