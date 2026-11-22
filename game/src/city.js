"use strict";
// Low Tide City — city generation.

const City = {
  seed: 7,
  buildings: [],      // {x0,y0,x1,y1,h,wall,roof,kind,district}
  blocks: [],         // {i,j,district,kind} kind: lots|water|park|beach|port
  parkedSpots: [],    // {x,y,ang}
  palms: [],          // {x,y,s}
  lamps: [],          // {x,y}
  landmarks: [],      // {kind,x,y,...}
  grid: null,         // spatial grid over building AABBs
  missionCarSpot: null,
  playerStart: null,
  stationPos: null,   // police station door (busted respawn)
  hospitalPos: null,  // hospital door (wasted respawn)
  garagePos: null,    // mission 1 destination bay
  dockPos: null,      // Marisol's office door (mission 1 start)
  lights: [],         // {a, b, x, y} signalled junctions (avenue crossings)
  sprays: [],         // Pay 'n' Spray bays {x, y}
  safehouses: [],     // {x, y, price, garage}
  givers: {},         // mission-giver standing spots by key
  packages: [],       // hidden packages {x, y, got}

  lotRect(i, j) {
    const x0 = roadCenter(i) + roadWidth(i) / 2 + 3;
    const x1 = roadCenter(i + 1) - roadWidth(i + 1) / 2 - 3;
    const y0 = roadCenter(j) + roadWidth(j) / 2 + 3;
    const y1 = roadCenter(j + 1) - roadWidth(j + 1) / 2 - 3;
    return { x0, y0, x1, y1 };
  },

  districtForBlock(i, j) {
    let best = null, bd = 1e9;
    for (const d of DISTRICTS) {
      const dd = dist2(i + 0.5, j + 0.5, d.cx, d.cy);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  },
  districtAt(x, y) {
    const i = clamp(Math.floor((x - ROAD_OFF) / PITCH), 0, BLOCKS - 1);
    const j = clamp(Math.floor((y - ROAD_OFF) / PITCH), 0, BLOCKS - 1);
    return this.districtForBlock(i, j);
  },

  // The river channel: the open span between roads 5 and 6.
  riverRect() {
    return {
      x0: roadCenter(RIVER_COL) + roadWidth(RIVER_COL) / 2,
      x1: roadCenter(RIVER_COL + 1) - roadWidth(RIVER_COL + 1) / 2,
      y0: 0, y1: WORLD_SIZE,
    };
  },
  onBridge(x, y) {
    const r = this.riverRect();
    if (x < r.x0 - 2 || x > r.x1 + 2) return false;
    for (const k of BRIDGE_ROWS) {
      if (Math.abs(y - roadCenter(k)) <= roadWidth(k) / 2 + 2) return true;
    }
    return false;
  },
  isWater(x, y) {
    if (x >= WORLD_SIZE - 20) return true; // the sea
    const r = this.riverRect();
    if (x > r.x0 && x < r.x1 && !this.onBridge(x, y)) return true;
    return false;
  },

  build(seed) {
    this.seed = seed;
    this.buildings = [];
    this.blocks = [];
    this.parkedSpots = [];
    this.palms = [];
    this.lamps = [];
    this.landmarks = [];
    const rng = makeRng(seed * 7919 + 13);

    for (let j = 0; j < BLOCKS; j++) {
      for (let i = 0; i < BLOCKS; i++) {
        const district = this.districtForBlock(i, j);
        const block = { i, j, district, kind: "lots" };
        if (i === RIVER_COL) block.kind = "water";
        else if (i === BLOCKS - 1 && district.id === "orilla") block.kind = "beach";
        else if (j === BLOCKS - 1 && district.id === "muelles") block.kind = "port";
        else if (rng.chance(0.05) && district.id !== "centro" && district.id !== "muelles") block.kind = "park";
        this.blocks.push(block);
        if (block.kind === "lots" || block.kind === "port" || block.kind === "beach") {
          this._buildLot(block, rng);
        }
        if (block.kind !== "water") this._streetDressing(block, rng);
      }
    }
    this._landmarks(rng);
    this._places(rng);
    this.grid = makeGrid(48);
    for (const b of this.buildings) {
      this.grid.insert(b, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    }
    return this;
  },

  _palette(district, rng) {
    // Wall colours lean on the district tint; roofs stay darker.
    const base = {
      centro: ["#9aa7bd", "#8794a9", "#b6c0d2", "#77879e"],
      casco: ["#c08552", "#b3763f", "#cd9a67", "#a96f42"],
      orilla: ["#e8b4b8", "#f0d0b0", "#d9e2c8", "#f2e3c9"],
      muelles: ["#7d8a99", "#6e6257", "#8a7a5c", "#5f707c"],
      lomas: ["#d8cfc0", "#c9bda8", "#e2d8ce", "#bfc9b4"],
      neon: ["#6a5a8c", "#7c6aa8", "#584a75", "#8c7ab8"],
    }[district.id];
    const wall = rng.pick(base);
    return { wall, roof: "#3c3f46" };
  },

  _addBuilding(x0, y0, x1, y1, h, wall, kind, district) {
    this.buildings.push({
      x0, y0, x1, y1, h, wall,
      roof: kind === "house" ? "#7a4a38" : "#3c3f46",
      kind: kind || "block", district: district.id,
    });
  },

  _buildLot(block, rng) {
    const { i, j, district } = block;
    const lot = this.lotRect(i, j);
    const W = lot.x1 - lot.x0, H = lot.y1 - lot.y0;
    const special = this._specialLot(i, j, lot, district);
    if (special) return;
    const pal = () => this._palette(district, rng);
    if (district.id === "centro") {
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const w = W / n;
        const inset = rng.range(4, 8);
        this._addBuilding(
          lot.x0 + k * w + inset, lot.y0 + inset,
          lot.x0 + (k + 1) * w - inset, lot.y1 - inset,
          rng.range(42, 105), pal().wall, "tower", district);
      }
    } else if (district.id === "muelles" || block.kind === "port") {
      if (rng.chance(0.3)) { // open yard with crates
        for (let k = 0; k < 4; k++) {
          const cx = rng.range(lot.x0 + 8, lot.x1 - 14);
          const cy = rng.range(lot.y0 + 8, lot.y1 - 14);
          this._addBuilding(cx, cy, cx + rng.range(5, 9), cy + rng.range(5, 9),
            2.6, "#8a6f4d", "crate", district);
        }
      } else {
        this._addBuilding(lot.x0 + 5, lot.y0 + 6, lot.x1 - 5, lot.y1 - 6,
          rng.range(8, 14), pal().wall, "warehouse", district);
      }
    } else if (district.id === "lomas") {
      const n = rng.int(4, 6);
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      let placed = 0;
      for (let r = 0; r < rows && placed < n; r++) {
        for (let c = 0; c < cols && placed < n; c++) {
          const cw = W / cols, ch = H / rows;
          this._addBuilding(
            lot.x0 + c * cw + 5, lot.y0 + r * ch + 5,
            lot.x0 + (c + 1) * cw - 5, lot.y0 + (r + 1) * ch - 5,
            rng.range(5, 9), pal().wall, "house", district);
          placed++;
        }
      }
    } else {
      // casco / orilla / neon: a few mid-rise blocks per lot.
      const n = rng.int(2, district.id === "casco" ? 5 : 3);
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      let placed = 0;
      for (let r = 0; r < rows && placed < n; r++) {
        for (let c = 0; c < cols && placed < n; c++) {
          const cw = W / cols, ch = H / rows;
          const tall = district.id === "neon" ? rng.range(16, 44)
            : district.id === "orilla" ? rng.range(10, 30)
            : rng.range(9, 18);
          this._addBuilding(
            lot.x0 + c * cw + 3, lot.y0 + r * ch + 3,
            lot.x0 + (c + 1) * cw - 3, lot.y0 + (r + 1) * ch - 3,
            tall, pal().wall, district.id === "neon" ? "neon" : "block", district);
        }
      }
    }
  },

  // Fixed lots the story and the skyline depend on. Returns true when the
  _specialLot(i, j, lot, district) {
    const midX = (lot.x0 + lot.x1) / 2, midY = (lot.y0 + lot.y1) / 2;
    if (i === 8 && j === 6) { // Ámbar Tower, Centro
      this._addBuilding(lot.x0 + 14, lot.y0 + 14, lot.x1 - 14, lot.y1 - 14,
        120, "#c9a86a", "tower", district);
      this.landmarks.push({ kind: "tower", x: midX, y: midY });
      return true;
    }
    if (i === 2 && j === 10) { // the cathedral, Casco
      this._addBuilding(lot.x0 + 12, lot.y0 + 20, lot.x1 - 12, lot.y1 - 10,
        20, "#d8c9a8", "cathedral", district);
      this._addBuilding(lot.x0 + 12, lot.y0 + 8, lot.x0 + 22, lot.y0 + 20, 34, "#d8c9a8", "spire", district);
      this._addBuilding(lot.x1 - 22, lot.y0 + 8, lot.x1 - 12, lot.y0 + 20, 34, "#d8c9a8", "spire", district);
      this.landmarks.push({ kind: "cathedral", x: midX, y: midY });
      return true;
    }
    if (i === 3 && j === 10) { // police station, Casco
      this._addBuilding(lot.x0 + 8, lot.y0 + 8, lot.x1 - 8, lot.y1 - 14,
        13, "#5a6a8c", "station", district);
      this.stationPos = { x: midX, y: lot.y1 + 6 };
      return true;
    }
    if (i === 8 && j === 9) { // hospital, Centro
      this._addBuilding(lot.x0 + 8, lot.y0 + 8, lot.x1 - 8, lot.y1 - 8,
        22, "#dfe3e6", "hospital", district);
      this.hospitalPos = { x: midX, y: lot.y1 + 6 };
      return true;
    }
    if (i === 8 && j === 7) { // the garage Marisol's sedan must reach
      this._addBuilding(lot.x0 + 6, lot.y0 + 6, lot.x1 - 20, lot.y1 - 6,
        11, "#8c8578", "garage", district);
      this.garagePos = { x: lot.x1 - 8, y: midY };
      return true;
    }
    if (i === 11 && j === 12) { // Marisol's dock office, Los Muelles
      this._addBuilding(lot.x0 + 8, lot.y0 + 8, lot.x0 + 34, lot.y0 + 26,
        9, "#a85f3c", "office", district);
      this.dockPos = { x: lot.x0 + 21, y: lot.y0 + 34 };
      this.missionCarSpot = { x: lot.x0 + 48, y: lot.y0 + 40, ang: 0 };
      return true;
    }
    if ((i === 1 && j === 1) || (i === 2 && j === 1)) { // stadium shell
      if (i === 1) {
        const l2 = this.lotRect(2, 1);
        this._addBuilding(lot.x0 + 4, lot.y0 + 8, l2.x1 - 4, lot.y1 - 8,
          14, "#b8bcc2", "stadium", district);
        this.landmarks.push({ kind: "stadium", x: (lot.x0 + l2.x1) / 2, y: midY });
      }
      return true;
    }
    if (i === 13 && j === 5) { // ferris wheel on the beachfront
      this.landmarks.push({ kind: "wheel", x: midX, y: midY, r: 17 });
      return true;
    }
    if ((i === 11 && j === 13) || (i === 12 && j === 13)) { // port cranes
      this._addBuilding(lot.x0 + 26, lot.y0 + 20, lot.x0 + 32, lot.y0 + 26,
        24, "#c75b39", "crane", district);
      this.landmarks.push({ kind: "crane", x: lot.x0 + 29, y: lot.y0 + 23 });
      return false; // warehouses may still share the lot
    }
    return false;
  },

  _landmarks(rng) {
    // The lighthouse stands in the shallows at the north-east corner.
    this._addBuilding(WORLD_SIZE - 16, 168, WORLD_SIZE - 8, 176, 30, "#e8e2d4", "lighthouse",
      DISTRICTS[2]);
    this.landmarks.push({ kind: "lighthouse", x: WORLD_SIZE - 12, y: 172 });
    // Player start: a La Orilla sidewalk, two blocks from the wheel.
    const lot = this.lotRect(12, 6);
    this.playerStart = { x: lot.x0 - 6, y: (lot.y0 + lot.y1) / 2 };
  },

  // Signal state at junction (a, b) for traffic running along the
  lightState(a, b, vertical, t) {
    const ph = (t + hash2(a, b, 7) * 24) % 24;
    if (vertical) return ph < 9 ? "green" : ph < 11 ? "amber" : "red";
    return ph >= 12 && ph < 21 ? "green" : ph >= 21 && ph < 23 ? "amber" : "red";
  },

  // The fixed service geography: signalled junctions, spray bays,
  _places(rng) {
    this.lights = [];
    for (let a = 0; a <= BLOCKS; a++) {
      for (let b = 0; b <= BLOCKS; b++) {
        if (!isAvenue(a) && !isAvenue(b)) continue;
        const x = roadCenter(a), y = roadCenter(b);
        if (this.isWater(x, y)) continue;
        this.lights.push({ a, b, x, y });
      }
    }
    const edge = (i, j, dx, dy) => {
      const lot = this.lotRect(i, j);
      return { x: (lot.x0 + lot.x1) / 2 + dx, y: lot.y1 + 6 + dy };
    };
    this.sprays = [edge(8, 6, 18, 0), edge(4, 11, -14, 0), edge(12, 3, 10, 0)];
    this.safehouses = [
      { ...edge(12, 6, -20, 0), price: 0, garage: true },
      { ...edge(1, 3, 12, 0), price: 5000, garage: false },
      { ...edge(13, 10, -16, 0), price: 12000, garage: false },
    ];
    this.givers = {
      marisol: this.dockPos,
      ramon: edge(2, 9, -10, 0),
      lucia: edge(13, 6, -6, 0),
      ortega: this.stationPos,
    };
    this.packages = [];
    for (let n = 0; n < 20; n++) {
      const i = rng.int(0, BLOCKS - 1), j = rng.int(0, BLOCKS - 1);
      if (i === RIVER_COL) { n--; continue; }
      const lot = this.lotRect(i, j);
      this.packages.push({
        x: rng.chance(0.5) ? lot.x0 + 2.5 : lot.x1 - 2.5,
        y: rng.range(lot.y0 + 6, lot.y1 - 6),
        got: false,
      });
    }
  },

  _streetDressing(block, rng) {
    const { i, j, district } = block;
    const lot = this.lotRect(i, j);
    // Parked cars along the south and east lot edges, parallel to the road.
    const density = { centro: 0.55, casco: 0.5, orilla: 0.45, muelles: 0.35, lomas: 0.3, neon: 0.5 }[district.id];
    for (let k = 0; k < 3; k++) {
      if (rng.chance(density)) {
        this.parkedSpots.push({
          x: lot.x0 + 8 + k * 22 + rng.range(-2, 2), y: lot.y1 + 5.2, ang: 0,
        });
      }
      if (rng.chance(density)) {
        this.parkedSpots.push({
          x: lot.x1 + 5.2, y: lot.y0 + 8 + k * 22 + rng.range(-2, 2), ang: Math.PI / 2,
        });
      }
    }
    // Palms on the beachfront and around La Orilla / Neón sidewalks.
    if (district.id === "orilla" || district.id === "neon") {
      for (let k = 0; k < 3; k++) {
        if (rng.chance(0.6)) {
          this.palms.push({
            x: lot.x0 - 1.5, y: lot.y0 + 10 + k * 26 + rng.range(-3, 3),
            s: rng.range(0.8, 1.25),
          });
        }
      }
    }
    // Lamps where this block meets an avenue corner.
    if (isAvenue(i)) this.lamps.push({ x: roadCenter(i) - roadWidth(i) / 2 - 1, y: lot.y0 - 4 });
    if (isAvenue(j)) this.lamps.push({ x: lot.x0 - 4, y: roadCenter(j) - roadWidth(j) / 2 - 1 });
  },

  // Lane centre offset for one direction of travel on road k.
  laneOffset(k) { return roadWidth(k) / 4; },

  // The point on the road network closest to (x, y): used by police
  nearestRoadPoint(x, y) {
    const ki = clamp(Math.round((x - ROAD_OFF) / PITCH), 0, BLOCKS);
    const kj = clamp(Math.round((y - ROAD_OFF) / PITCH), 0, BLOCKS);
    const vx = roadCenter(ki), hy = roadCenter(kj);
    if (Math.abs(x - vx) < Math.abs(y - hy)) return { x: vx, y, road: ki, vertical: true };
    return { x, y: hy, road: kj, vertical: false };
  },
};
