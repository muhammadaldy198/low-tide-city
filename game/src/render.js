"use strict";
// Low Tide City — rendering.
//
// The ground (water, roads, pavements, lots, bridge decks) never changes,
// so it is painted once into a big offscreen canvas at 2 px per metre and
// blitted each frame. Buildings, cars and people are drawn per frame in
// painter's order; buildings lean away from the screen centre in
// proportion to their height, which fakes the third dimension. A lighting
// pass tints the scene by the hour and, after dark, adds lamp pools,
// headlight cones and police flashers.

const Render = {
  staticLayer: null,
  minimap: null,
  lightCanvas: null,

  buildStatic() {
    const S = 2; // px per metre in the static layer
    const cv = document.createElement("canvas");
    cv.width = WORLD_SIZE * S;
    cv.height = WORLD_SIZE * S;
    const g = cv.getContext("2d");
    g.scale(S, S);

    // Sea and deep water under everything.
    g.fillStyle = "#17384f";
    g.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    // Landmass base.
    g.fillStyle = "#585c50";
    g.fillRect(0, 0, WORLD_SIZE - 18, WORLD_SIZE);

    // Per-block ground: pavements, then the lot itself.
    for (const block of City.blocks) {
      if (block.kind === "water") continue;
      const lot = City.lotRect(block.i, block.j);
      const px0 = lot.x0 - 3, py0 = lot.y0 - 3, px1 = lot.x1 + 3, py1 = lot.y1 + 3;
      g.fillStyle = "#8f8f88";
      g.fillRect(px0, py0, px1 - px0, py1 - py0);
      if (block.kind === "park") {
        g.fillStyle = "#4c6e3c";
        g.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
        const rng = makeRng(block.i * 131 + block.j * 17 + City.seed);
        for (let t = 0; t < 9; t++) {
          g.fillStyle = t % 2 ? "#426335" : "#557a42";
          g.beginPath();
          g.arc(rng.range(lot.x0 + 6, lot.x1 - 6), rng.range(lot.y0 + 6, lot.y1 - 6),
            rng.range(3.5, 6.5), 0, Math.PI * 2);
          g.fill();
        }
      } else if (block.kind === "beach") {
        g.fillStyle = "#c9b078";
        g.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
      } else if (block.kind === "port") {
        g.fillStyle = "#676b62";
        g.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
        const rng = makeRng(block.i * 71 + block.j * 7 + City.seed);
        const cols = ["#b8512f", "#2f6db8", "#3f9e58", "#c2a12e", "#7a4fa3"];
        for (let t = 0; t < 5; t++) {
          g.fillStyle = cols[t % cols.length];
          g.fillRect(rng.range(lot.x0 + 4, lot.x1 - 16), rng.range(lot.y0 + 4, lot.y1 - 8), 12, 5);
        }
      } else {
        g.fillStyle = block.district.ground;
        g.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
      }
    }

    // The river, over the land base.
    const river = City.riverRect();
    const grad = g.createLinearGradient(river.x0, 0, river.x1, 0);
    grad.addColorStop(0, "#1d4258");
    grad.addColorStop(0.5, "#26546e");
    grad.addColorStop(1, "#1d4258");
    g.fillStyle = grad;
    g.fillRect(river.x0, 0, river.x1 - river.x0, WORLD_SIZE);
    // River banks.
    g.fillStyle = "#7c7663";
    g.fillRect(river.x0 - 2.5, 0, 2.5, WORLD_SIZE);
    g.fillRect(river.x1, 0, 2.5, WORLD_SIZE);
    // The beach and the sea edge.
    g.fillStyle = "#c9b078";
    g.fillRect(WORLD_SIZE - 34, 0, 16, WORLD_SIZE);
    g.fillStyle = "#1a4066";
    g.fillRect(WORLD_SIZE - 18, 0, 18, WORLD_SIZE);

    // Roads.
    for (let k = 0; k <= BLOCKS; k++) {
      const c = roadCenter(k), w = roadWidth(k), av = isAvenue(k);
      g.fillStyle = av ? "#3b4046" : "#33373c";
      g.fillRect(c - w / 2, 0, w, WORLD_SIZE);
      g.fillRect(0, c - w / 2, WORLD_SIZE, w);
    }
    // Bridge decks over the river.
    for (const k of BRIDGE_ROWS) {
      const c = roadCenter(k), w = roadWidth(k);
      g.fillStyle = "#43484f";
      g.fillRect(river.x0 - 4, c - w / 2, river.x1 - river.x0 + 8, w);
      g.fillStyle = "#c8c2b2";
      g.fillRect(river.x0 - 4, c - w / 2 - 1.2, river.x1 - river.x0 + 8, 1.2);
      g.fillRect(river.x0 - 4, c + w / 2, river.x1 - river.x0 + 8, 1.2);
    }
    // Lane markings.
    g.strokeStyle = "rgba(232,232,220,0.55)";
    g.lineWidth = 0.35;
    g.setLineDash([4, 5]);
    for (let k = 0; k <= BLOCKS; k++) {
      const c = roadCenter(k), w = roadWidth(k);
      if (isAvenue(k)) {
        for (const s of [-1, 1]) {
          g.beginPath(); g.moveTo(c + s * w / 4, 0); g.lineTo(c + s * w / 4, WORLD_SIZE); g.stroke();
          g.beginPath(); g.moveTo(0, c + s * w / 4); g.lineTo(WORLD_SIZE, c + s * w / 4); g.stroke();
        }
      } else {
        g.beginPath(); g.moveTo(c, 0); g.lineTo(c, WORLD_SIZE); g.stroke();
        g.beginPath(); g.moveTo(0, c); g.lineTo(WORLD_SIZE, c); g.stroke();
      }
    }
    g.setLineDash([]);
    // Avenue medians: double yellow.
    g.strokeStyle = "rgba(232,180,40,0.8)";
    g.lineWidth = 0.4;
    for (let k = 0; k <= BLOCKS; k += 4) {
      const c = roadCenter(k);
      for (const s of [-0.8, 0.8]) {
        g.beginPath(); g.moveTo(c + s, 0); g.lineTo(c + s, WORLD_SIZE); g.stroke();
        g.beginPath(); g.moveTo(0, c + s); g.lineTo(WORLD_SIZE, c + s); g.stroke();
      }
    }
    // Crosswalks at avenue junctions.
    g.fillStyle = "rgba(230,230,225,0.5)";
    for (let a = 0; a <= BLOCKS; a += 4) {
      for (let b = 0; b <= BLOCKS; b += 4) {
        const cx = roadCenter(a), cy = roadCenter(b);
        const w = Math.max(roadWidth(a), roadWidth(b)) / 2;
        for (let s = -2; s <= 2; s++) {
          g.fillRect(cx - w - 2.4, cy + s * 2.2 - 0.7, 2.2, 1.4);
          g.fillRect(cx + w + 0.2, cy + s * 2.2 - 0.7, 2.2, 1.4);
          g.fillRect(cx + s * 2.2 - 0.7, cy - w - 2.4, 1.4, 2.2);
          g.fillRect(cx + s * 2.2 - 0.7, cy + w + 0.2, 1.4, 2.2);
        }
      }
    }
    // Palms: a top-down star of fronds and a shadow.
    for (const palm of City.palms) {
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.beginPath(); g.ellipse(palm.x + 1.6, palm.y + 2.2, 3.4 * palm.s, 2.4 * palm.s, 0.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#3f7a34";
      g.lineWidth = 0.8;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + palm.x;
        g.beginPath();
        g.moveTo(palm.x, palm.y);
        g.quadraticCurveTo(
          palm.x + Math.cos(a) * 2.2 * palm.s, palm.y + Math.sin(a) * 2.2 * palm.s,
          palm.x + Math.cos(a) * 3.6 * palm.s, palm.y + Math.sin(a) * 3.6 * palm.s + 0.8);
        g.stroke();
      }
      g.fillStyle = "#6b4e2e";
      g.beginPath(); g.arc(palm.x, palm.y, 0.5, 0, Math.PI * 2); g.fill();
    }
    this.staticLayer = cv;
    return cv;
  },

  buildMinimap() {
    const S = 280 / WORLD_SIZE;
    const cv = document.createElement("canvas");
    cv.width = 280; cv.height = 280;
    const g = cv.getContext("2d");
    g.fillStyle = "#17384f";
    g.fillRect(0, 0, 280, 280);
    for (const block of City.blocks) {
      if (block.kind === "water") continue;
      g.fillStyle = block.district.ground;
      const lot = City.lotRect(block.i, block.j);
      g.fillRect(lot.x0 * S, lot.y0 * S, (lot.x1 - lot.x0) * S, (lot.y1 - lot.y0) * S);
    }
    g.strokeStyle = "rgba(240,240,235,0.75)";
    g.lineWidth = 1;
    for (let k = 0; k <= BLOCKS; k++) {
      const c = roadCenter(k) * S;
      g.beginPath(); g.moveTo(c, 0); g.lineTo(c, 280); g.stroke();
      g.beginPath(); g.moveTo(0, c); g.lineTo(280, c); g.stroke();
    }
    this.minimap = cv;
    return cv;
  },

  // ---- per-frame drawing ----

  // Interpolate the sky tint for an hour of day.
  tintFor(hours) {
    const KEYS = [
      [0.0, [13, 18, 46], 0.55], [4.6, [13, 18, 46], 0.55],
      [6.2, [255, 178, 122], 0.20], [8.0, [255, 240, 214], 0.0],
      [16.4, [255, 240, 214], 0.0], [18.1, [255, 154, 92], 0.17],
      [19.4, [74, 58, 122], 0.34], [21.2, [16, 22, 56], 0.50],
      [24.0, [13, 18, 46], 0.55],
    ];
    for (let i = 0; i < KEYS.length - 1; i++) {
      const a = KEYS[i], b = KEYS[i + 1];
      if (hours >= a[0] && hours <= b[0]) {
        const t = (hours - a[0]) / Math.max(0.001, b[0] - a[0]);
        return {
          r: Math.round(lerp(a[1][0], b[1][0], t)),
          g: Math.round(lerp(a[1][1], b[1][1], t)),
          b: Math.round(lerp(a[1][2], b[1][2], t)),
          a: lerp(a[2], b[2], t),
        };
      }
    }
    return { r: 13, g: 18, b: 46, a: 0.55 };
  },

  draw(ctx, world, cam, tNow) {
    if (!this.staticLayer) { this.buildStatic(); this.buildMinimap(); }
    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement("canvas");
      this.lightCanvas.width = VIEW_W; this.lightCanvas.height = VIEW_H;
    }
    const zoom = cam.zoom || 1;
    const scale = PX_PER_M * zoom;
    const vw = VIEW_W / scale, vh = VIEW_H / scale; // visible metres
    const vx0 = cam.x - vw / 2, vy0 = cam.y - vh / 2;

    // Ground.
    const S = 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.staticLayer,
      Math.max(0, vx0 * S), Math.max(0, vy0 * S), vw * S, vh * S,
      Math.max(0, -vx0 * scale), Math.max(0, -vy0 * scale), vw * scale, vh * scale);

    const toX = (wx) => (wx - vx0) * scale;
    const toY = (wy) => (wy - vy0) * scale;

    // Gather what's visible and paint far-to-near by south edge.
    const items = [];
    City.grid.query(cam.x, cam.y, Math.hypot(vw, vh) / 2 + 30, (b) => {
      if (b.x1 < vx0 - 40 || b.x0 > vx0 + vw + 40 || b.y1 < vy0 - 60 || b.y0 > vy0 + vh + 60) return;
      items.push({ kind: "building", y: b.y1, b });
    });
    for (const car of world.cars) {
      if (car.x < vx0 - 12 || car.x > vx0 + vw + 12 || car.y < vy0 - 12 || car.y > vy0 + vh + 12) continue;
      items.push({ kind: "car", y: car.y + car.def.wid, car });
    }
    for (const ped of world.peds) {
      if (ped.x < vx0 - 4 || ped.x > vx0 + vw + 4 || ped.y < vy0 - 4 || ped.y > vy0 + vh + 4) continue;
      items.push({ kind: "ped", y: ped.y + 0.4, ped });
    }
    if (!world.player.car) items.push({ kind: "player", y: world.player.y + 0.4 });
    for (const lm of City.landmarks) {
      if (lm.kind === "wheel") items.push({ kind: "wheel", y: lm.y + lm.r, lm });
    }
    items.sort((a, b) => a.y - b.y);
    const dark = this.tintFor(world.hours).a;
    for (const it of items) {
      if (it.kind === "building") this._building(ctx, it.b, cam, scale, toX, toY, tNow, dark);
      else if (it.kind === "car") this._car(ctx, it.car, scale, toX, toY, tNow);
      else if (it.kind === "ped") this._ped(ctx, it.ped, scale, toX, toY, tNow, false);
      else if (it.kind === "player") this._ped(ctx, world.player, scale, toX, toY, tNow, true);
      else if (it.kind === "wheel") this._wheel(ctx, it.lm, scale, toX, toY, tNow);
    }

    // The mission marker: a column of gold light.
    const obj = Missions.objective(world);
    if (obj && obj.marker && world.state === "play") {
      const mx = toX(obj.marker.x), my = toY(obj.marker.y);
      if (mx > -40 && mx < VIEW_W + 40 && my > -80 && my < VIEW_H + 40) {
        const bob = Math.sin(tNow * 2.4) * 4;
        const grad = ctx.createLinearGradient(0, my - 130, 0, my);
        grad.addColorStop(0, "rgba(255,190,40,0)");
        grad.addColorStop(1, "rgba(255,190,40,0.30)");
        ctx.fillStyle = grad;
        ctx.fillRect(mx - 7, my - 130, 14, 130);
        ctx.fillStyle = "#ffbe28";
        ctx.save();
        ctx.translate(mx, my - 26 + bob);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }

    if (world.weather === "rain") this._rain(ctx, tNow);
    this._lighting(ctx, world, cam, scale, toX, toY, tNow);
  },

  _building(ctx, b, cam, scale, toX, toY, tNow, dark) {
    // Roof lean: away from the screen centre, scaled by height.
    const bcx = (b.x0 + b.x1) / 2, bcy = (b.y0 + b.y1) / 2;
    const lean = 0.30 * b.h;
    const ox = clamp(((bcx - cam.x) / (VIEW_W / 2 / PX_PER_M)) * lean, -16, 16);
    const oy = clamp(((bcy - cam.y) / (VIEW_H / 2 / PX_PER_M)) * lean, -16, 16);
    const x0 = toX(b.x0), y0 = toY(b.y0), x1 = toX(b.x1), y1 = toY(b.y1);
    const rx0 = x0 + ox * scale, ry0 = y0 + oy * scale;
    const rx1 = x1 + ox * scale, ry1 = y1 + oy * scale;

    // Walls: only the two faces turned toward the viewer get drawn, and
    // tall faces carry a window grid so the height reads.
    const winFace = (ax, ay, bx, by, cx2, cy2, dx2, dy2, wallH) => {
      ctx.fillStyle = shade(b.wall, 0.62);
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.lineTo(dx2, dy2);
      ctx.closePath(); ctx.fill();
      const wallPx = Math.abs(wallH);
      if (b.h < 9 || wallPx < 9) return;
      const rows = clamp(Math.floor(b.h / 7), 1, 5);
      const cols = clamp(Math.floor(Math.hypot(bx - ax, by - ay) / scale / 6), 2, 10);
      for (let rI = 1; rI <= rows; rI++) {
        const t = rI / (rows + 1);
        for (let cI = 0; cI < cols; cI++) {
          const u = (cI + 0.5) / cols;
          const wx = lerp(lerp(ax, bx, u), lerp(dx2, cx2, u), t);
          const wy = lerp(lerp(ay, by, u), lerp(dy2, cy2, u), t);
          const lit = hash2((b.x0 + cI * 7) | 0, (b.y0 + rI * 13) | 0, 11) < dark * 0.85;
          ctx.fillStyle = lit ? "rgba(255,214,150,0.95)" : "rgba(18,26,40,0.55)";
          ctx.fillRect(wx - 1.3, wy - 1, 2.6, 2);
        }
      }
    };
    if (oy > 0.2) winFace(x0, y1, x1, y1, rx1, ry1, rx0, ry1, oy * scale);
    else if (oy < -0.2) winFace(x0, y0, x1, y0, rx1, ry0, rx0, ry0, oy * scale);
    if (ox > 0.2) winFace(x1, y0, x1, y1, rx1, ry1, rx1, ry0, ox * scale);
    else if (ox < -0.2) winFace(x0, y0, x0, y1, rx0, ry1, rx0, ry0, ox * scale);

    // Roof: a parapet edge around a panel in the wall's own family.
    ctx.fillStyle = b.kind === "house" ? "#7a4a38" : shade(b.wall, 0.9);
    ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(rx0 + 0.7, ry0 + 0.7, rx1 - rx0 - 1.4, ry1 - ry0 - 1.4);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    const inset = Math.min(5, (rx1 - rx0) * 0.14, (ry1 - ry0) * 0.14);
    if (inset > 1.6) ctx.strokeRect(rx0 + inset, ry0 + inset, rx1 - rx0 - inset * 2, ry1 - ry0 - inset * 2);
    const rw = rx1 - rx0, rh = ry1 - ry0;
    if (b.kind === "stadium") {
      ctx.fillStyle = "#4c7a3f";
      ctx.fillRect(rx0 + rw * 0.18, ry0 + rh * 0.2, rw * 0.64, rh * 0.6);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.strokeRect(rx0 + rw * 0.18, ry0 + rh * 0.2, rw * 0.64, rh * 0.6);
    } else if (b.kind === "lighthouse") {
      ctx.fillStyle = "#c8352c";
      ctx.fillRect(rx0, ry0 + rh * 0.3, rw, rh * 0.18);
      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath(); ctx.arc(rx0 + rw / 2, ry0 + rh / 2, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (b.kind === "crane") {
      ctx.strokeStyle = "#c75b39";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(rx0 + rw / 2, ry0 + rh / 2);
      ctx.lineTo(rx0 + rw / 2 + 52, ry0 + rh / 2 - 30);
      ctx.moveTo(rx0 + rw / 2, ry0 + rh / 2);
      ctx.lineTo(rx0 + rw / 2 - 18, ry0 + rh / 2 + 8);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx0 + rw / 2 + 44, ry0 + rh / 2 - 26);
      ctx.lineTo(rx0 + rw / 2 + 44, ry0 + rh / 2 - 6);
      ctx.stroke();
    } else if (b.kind === "neon") {
      // A glowing sign band along the roof's south edge.
      const hue = (hash2(b.x0, b.y0, 3) * 4) | 0;
      ctx.fillStyle = ["#ff4fd8", "#37e0ff", "#ffb000", "#7dff5e"][hue];
      ctx.fillRect(rx0 + 2, ry1 - 3.4, rw - 4, 2.2);
    } else if (b.h >= 12 && rw > 26 && rh > 26) {
      // Roof furniture on the bigger roofs: a plant box and a water tank.
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(rx0 + rw * 0.16, ry0 + rh * 0.16, rw * 0.24, rh * 0.2);
      ctx.beginPath();
      ctx.arc(rx0 + rw * 0.72, ry0 + rh * 0.66, Math.min(4.5, rw * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
    // Generic roof clutter — vents and a skylight — so a big flat roof
    // reads as a roof and not a void.
    if (rw > 34 && rh > 34 && b.kind !== "stadium" && b.kind !== "crane" && b.kind !== "lighthouse") {
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      const n = 2 + Math.floor(hash2(b.x0, b.y0, 5) * 3);
      for (let vi = 0; vi < n; vi++) {
        const vx = rx0 + rw * (0.14 + 0.68 * hash2(b.x0 + vi * 31, b.y0, 6));
        const vy = ry0 + rh * (0.14 + 0.68 * hash2(b.x0, b.y0 + vi * 47, 6));
        ctx.fillRect(vx, vy, 3.6, 2.6);
      }
      ctx.fillStyle = "rgba(190,220,240,0.20)";
      ctx.fillRect(rx0 + rw * 0.3, ry0 + rh * 0.42, rw * 0.4, rh * 0.14);
    }
  },

  _car(ctx, car, scale, toX, toY, tNow) {
    const x = toX(car.x), y = toY(car.y);
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(x + 2.5, y + 3.5, car.def.len * scale * 0.52, car.def.wid * scale * 0.55, car.ang, 0, Math.PI * 2);
    ctx.fill();
    const spr = Sprites.car(car.type, car.color);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.ang);
    if (car.sunk) ctx.globalAlpha = 0.45;
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
    // Brake lights.
    if (car.brakeLight > 0) {
      ctx.fillStyle = "rgba(255,60,40,0.85)";
      const bx = -Math.cos(car.ang) * car.def.len * scale * 0.5;
      const by = -Math.sin(car.ang) * car.def.len * scale * 0.5;
      const px = Math.cos(car.ang + Math.PI / 2), py = Math.sin(car.ang + Math.PI / 2);
      ctx.beginPath(); ctx.arc(x + bx + px * 3, y + by + py * 3, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + bx - px * 3, y + by - py * 3, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // Damage smoke.
    if (car.damage > 55 && !car.sunk) {
      const ph = (tNow * 1.4 + car.id * 0.7) % 1;
      ctx.fillStyle = `rgba(70,70,76,${0.35 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(car.ang) * car.def.len * scale * 0.4, y - ph * 16, 2.5 + ph * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  _ped(ctx, ped, scale, toX, toY, tNow, isPlayer) {
    const x = toX(ped.x), y = toY(ped.y);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, 3.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    const shirt = isPlayer ? "#2a9d8f" : ped.shirt;
    const skin = isPlayer ? "#c98d64" : ped.skin;
    const pants = isPlayer ? "#26303c" : ped.pants;
    if (ped.state === "down") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ped.ang || 0.6);
      ctx.fillStyle = pants;
      ctx.fillRect(-4.4, -1.4, 4.4, 2.8);
      ctx.fillStyle = shirt;
      ctx.fillRect(0, -1.8, 4.2, 3.6);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(5.6, 0, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const moving = isPlayer ? (ped.vx !== 0 || ped.vy !== 0) : true;
    const ph = isPlayer ? ped.walkPhase : tNow * 7 * ped.speed + ped.seedPhase;
    const swing = moving ? Math.sin(ph) * 2.0 : 0;
    const fx = Math.cos(ped.ang), fy = Math.sin(ped.ang);
    const px = Math.cos(ped.ang + Math.PI / 2), py = Math.sin(ped.ang + Math.PI / 2);
    ctx.strokeStyle = pants;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + fx * swing + px * 1.3, y + fy * swing + py * 1.3);
    ctx.moveTo(x, y);
    ctx.lineTo(x - fx * swing - px * 1.3, y - fy * swing - py * 1.3);
    ctx.stroke();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x + fx * 0.8, y + fy * 0.8, 1.6, 0, Math.PI * 2); ctx.fill();
    if (isPlayer) {
      // A soft ring so the player reads at a glance.
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.stroke();
    }
  },

  _wheel(ctx, lm, scale, toX, toY, tNow) {
    const x = toX(lm.x), y = toY(lm.y), r = lm.r * scale;
    ctx.strokeStyle = "rgba(20,20,26,0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r); ctx.lineTo(x, y - r * 0.2); ctx.lineTo(x + r * 0.5, y + r); ctx.stroke();
    const rot = tNow * 0.12;
    ctx.strokeStyle = "#e8e2d4";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.78, 0, Math.PI * 2); ctx.stroke();
    for (let s = 0; s < 8; s++) {
      const a = rot + (s / 8) * Math.PI * 2;
      const cxp = x + Math.cos(a) * r * 0.78, cyp = y - r * 0.2 + Math.sin(a) * r * 0.78;
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.2); ctx.lineTo(cxp, cyp); ctx.stroke();
      ctx.fillStyle = ["#ff4fd8", "#37e0ff", "#ffb000", "#7dff5e"][s % 4];
      ctx.fillRect(cxp - 2.4, cyp - 2.4, 4.8, 4.8);
    }
  },

  _rain(ctx, tNow) {
    ctx.strokeStyle = "rgba(180,200,230,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 110; i++) {
      const x = (i * 173.3 + tNow * 60) % (VIEW_W + 40) - 20;
      const y = (i * 97.7 + tNow * 620) % (VIEW_H + 30) - 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2.5, y + 11);
    }
    ctx.stroke();
  },

  _lighting(ctx, world, cam, scale, toX, toY, tNow) {
    const tint = this.tintFor(world.hours);
    if (tint.a > 0.005) {
      ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (tint.a < 0.14) return; // daylight: no artificial light needed
    const lg = this.lightCanvas.getContext("2d");
    lg.clearRect(0, 0, VIEW_W, VIEW_H);
    lg.globalCompositeOperation = "lighter";
    const glow = (x, y, r, color, alpha) => {
      if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) return;
      const gr = lg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color.replace("A", String(alpha)));
      gr.addColorStop(1, color.replace("A", "0"));
      lg.fillStyle = gr;
      lg.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // Lamp pools along the avenues.
    for (const lamp of City.lamps) {
      glow(toX(lamp.x), toY(lamp.y), 38, "rgba(255,190,110,A)", 0.13);
    }
    // Headlight cones and police flashers.
    for (const car of world.cars) {
      if (car.sunk) continue;
      const x = toX(car.x), y = toY(car.y);
      if (x < -90 || x > VIEW_W + 90 || y < -90 || y > VIEW_H + 90) continue;
      if (car.driver && carSpeed(car) > 0.5) {
        const hx = x + Math.cos(car.ang) * 34, hy = y + Math.sin(car.ang) * 34;
        glow(hx, hy, 44, "rgba(255,240,200,A)", 0.10);
      }
      if (car.type === "police" && (car.driver === "cop" || world.stars > 0)) {
        const phase = Math.sin(tNow * 9 + car.id * 2.1) > 0;
        glow(x, y, 36, phase ? "rgba(255,60,50,A)" : "rgba(70,110,255,A)", 0.17);
      }
    }
    // Neon signs bleed colour onto their streets.
    City.grid.query(cam.x, cam.y, 130, (b) => {
      if (b.kind !== "neon") return;
      const hue = (hash2(b.x0, b.y0, 3) * 4) | 0;
      const cols = ["rgba(255,79,216,A)", "rgba(55,224,255,A)", "rgba(255,176,0,A)", "rgba(125,255,94,A)"];
      glow(toX((b.x0 + b.x1) / 2), toY(b.y1), 40, cols[hue], 0.13);
    });
    ctx.save();
    ctx.globalAlpha = clamp((tint.a - 0.1) * 2.4, 0, 1);
    ctx.drawImage(this.lightCanvas, 0, 0);
    ctx.restore();
  },
};
