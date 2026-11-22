"use strict";
// Low Tide City — spatial helpers: a uniform grid hash for broad-phase

function makeGrid(cellSize) {
  const cells = new Map();
  const key = (cx, cy) => cx + ":" + cy;
  return {
    cellSize,
    clear() { cells.clear(); },
    insert(item, x, y) {
      const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
      let arr = cells.get(k);
      if (!arr) { arr = []; cells.set(k, arr); }
      arr.push(item);
    },
    // Visit every item in cells overlapping the circle (x, y, r).
    query(x, y, r, fn) {
      const cs = cellSize;
      const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
      const y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const arr = cells.get(key(cx, cy));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) fn(arr[i]);
        }
      }
    },
  };
}

// Circle (cx, cy, r) against an axis-aligned box. Returns null when clear,
function circleVsAabb(cx, cy, r, b) {
  const nx = Math.max(b.x0, Math.min(cx, b.x1));
  const ny = Math.max(b.y0, Math.min(cy, b.y1));
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d), depth: r - d };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const left = cx - b.x0, right = b.x1 - cx, top = cy - b.y0, bot = b.y1 - cy;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: -(left + r), y: 0, depth: left + r };
  if (m === right) return { x: right + r, y: 0, depth: right + r };
  if (m === top) return { x: 0, y: -(top + r), depth: top + r };
  return { x: 0, y: bot + r, depth: bot + r };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest signed angular difference a-b, wrapped to [-PI, PI].
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
