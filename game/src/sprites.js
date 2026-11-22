"use strict";
// Low Tide City — sprites: every vehicle is drawn once, at load, onto its

const SPRITE_SCALE = 8; // px per metre, matches zoom 1

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const Sprites = {
  cache: new Map(),

  car(type, color) {
    const key = type + "|" + color;
    if (this.cache.has(key)) return this.cache.get(key);
    const def = VEHICLE_TYPES[type];
    const L = def.len * SPRITE_SCALE, W = def.wid * SPRITE_SCALE;
    const pad = 6;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(L + pad * 2);
    cv.height = Math.ceil(W + pad * 2);
    const ctx = cv.getContext("2d");
    ctx.translate(cv.width / 2, cv.height / 2);
    const x0 = -L / 2, y0 = -W / 2;

    // Wheels first (they peek out from under the body).
    ctx.fillStyle = "#15151a";
    const ww = L * 0.16, wh = W * 0.16;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.fillRect(
        sx * L * 0.30 - ww / 2 + (sx > 0 ? ww * 0.1 : -ww * 0.1),
        sy * (W / 2) - wh / 2 + (sy > 0 ? 1 : -1),
        ww, wh);
    }
    // Body.
    const bodyColor = type === "police" ? "#eef0f2" : type === "taxi" ? "#e8a812" : color;
    ctx.fillStyle = bodyColor;
    roundRectPath(ctx, x0, y0, L, W, W * 0.28);
    ctx.fill();
    ctx.strokeStyle = shade(bodyColor.startsWith("#") ? bodyColor : "#888888", 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();

    if (type === "van") {
      // A cargo box: plainer, with panel seams.
      ctx.fillStyle = shade(bodyColor.startsWith("#") ? bodyColor : "#888888", 0.92);
      roundRectPath(ctx, x0 + L * 0.16, y0 + 1.5, L * 0.8, W - 3, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + L * 0.16 + (L * 0.8 / 4) * i, y0 + 2);
        ctx.lineTo(x0 + L * 0.16 + (L * 0.8 / 4) * i, y0 + W - 2);
        ctx.stroke();
      }
    } else {
      // Cabin: windshield, roof, rear window.
      const cabX = x0 + L * 0.30, cabL = L * 0.42;
      ctx.fillStyle = "#1c2733";
      roundRectPath(ctx, cabX, y0 + W * 0.14, cabL, W * 0.72, 3);
      ctx.fill();
      ctx.fillStyle = shade(bodyColor.startsWith("#") ? bodyColor : "#888888", 0.8);
      roundRectPath(ctx, cabX + cabL * 0.22, y0 + W * 0.20, cabL * 0.52, W * 0.60, 2.5);
      ctx.fill();
      // Windshield sheen.
      ctx.fillStyle = "rgba(160,210,240,0.5)";
      ctx.fillRect(cabX + cabL * 0.78, y0 + W * 0.18, cabL * 0.14, W * 0.64);
    }

    // Panel detail: door seams, mirrors, bright wheel hubs.
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    for (const fx of [0.30, 0.68]) {
      ctx.beginPath();
      ctx.moveTo(x0 + L * fx, y0 + 1.5);
      ctx.lineTo(x0 + L * fx, y0 + W - 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = shade(bodyColor.startsWith("#") ? bodyColor : "#888888", 0.7);
    ctx.fillRect(x0 + L * 0.66, y0 - 1.6, 3.4, 1.8);
    ctx.fillRect(x0 + L * 0.66, y0 + W - 0.2, 3.4, 1.8);
    ctx.fillStyle = "rgba(200,205,215,0.8)";
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.fillRect(sx * L * 0.30 - 1.2, sy * (W / 2) + (sy > 0 ? 0.4 : -2.2), 2.4, 1.8);
    }

    // Type dressing.
    if (type === "police") {
      ctx.fillStyle = "#2050a0";
      ctx.fillRect(x0 + L * 0.06, y0, L * 0.16, W);
      ctx.fillRect(x0 + L * 0.80, y0, L * 0.13, W);
      // Light bar: red and blue halves.
      ctx.fillStyle = "#e03030";
      ctx.fillRect(x0 + L * 0.46, y0 + W * 0.16, L * 0.07, W * 0.30);
      ctx.fillStyle = "#3060e8";
      ctx.fillRect(x0 + L * 0.46, y0 + W * 0.54, L * 0.07, W * 0.30);
    } else if (type === "taxi") {
      ctx.fillStyle = "#20222a";
      for (let i = 0; i < 5; i++) ctx.fillRect(x0 + L * 0.1 + i * 3.4, y0 + W * 0.44, 1.8, W * 0.12);
      ctx.fillStyle = "#fff2c8";
      ctx.fillRect(x0 + L * 0.47, y0 + W * 0.36, L * 0.07, W * 0.28);
    } else if (type === "sports") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x0 + 1, y0 + W * 0.08, L * 0.09, W * 0.84); // spoiler
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x0 + L * 0.2, y0 + W * 0.42, L * 0.6, W * 0.16); // stripe
    } else if (type === "muscle") {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(x0 + L * 0.58, y0 + W * 0.30, L * 0.16, W * 0.40); // scoop
    }

    // Lights: pale headlights east, red taillights west.
    ctx.fillStyle = "#ffeeb8";
    ctx.fillRect(x0 + L - 2.2, y0 + W * 0.12, 2.2, W * 0.18);
    ctx.fillRect(x0 + L - 2.2, y0 + W * 0.70, 2.2, W * 0.18);
    ctx.fillStyle = "#c02828";
    ctx.fillRect(x0, y0 + W * 0.12, 2, W * 0.18);
    ctx.fillRect(x0, y0 + W * 0.70, 2, W * 0.18);

    this.cache.set(key, cv);
    return cv;
  },
};
