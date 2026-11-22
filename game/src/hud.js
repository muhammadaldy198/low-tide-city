"use strict";
// Low Tide City — HUD and screens.
//
// In play: cash, clock and wanted stars top-right; health and the minimap
// bottom-left; speed bottom-right in a car; the objective across the top;
// dialogue, prompts and banners as they happen. Around play: the title
// screen, the how-to panel, pause, and the BUSTED / WASTED overlays.

const Hud = {
  menuIndex: 0,
  menuRects: [],
  lastDistrict: "",
  districtT: 0,

  star(ctx, x, y, r, filled) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (filled) { ctx.fillStyle = "#ffb000"; ctx.fill(); }
    ctx.strokeStyle = "rgba(255,176,0,0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },

  draw(ctx, world, tNow) {
    if (world.state === "title") return this._title(ctx, world, tNow, false);
    if (world.state === "howto") return this._title(ctx, world, tNow, true);
    this._hud(ctx, world, tNow);
    if (world.state === "pause") this._pause(ctx, world);
    if (world.state === "busted") this._endScreen(ctx, "BUSTED", "#e0483c", "The Policía Municipal got their collar.");
    if (world.state === "wasted") this._endScreen(ctx, "WASTED", "#c8ccd4", "You wake up at the hospital, lighter by $100.");
  },

  _hud(ctx, world, tNow) {
    const p = world.player;
    ctx.textAlign = "left";
    // Wanted stars, top-right; they blink while the heat cools unseen.
    const blink = world.stars > 0 && !world.copSeesPlayer && world.unseenT > 1.5 &&
      Math.sin(tNow * 7) > -0.2;
    for (let i = 0; i < 5; i++) {
      const filled = i < world.stars && (!blink || i < world.stars - 1 || Math.sin(tNow * 7) > 0.4);
      this.star(ctx, VIEW_W - 34 - i * 34, 34, 13, filled);
    }
    // Cash and clock under the stars.
    ctx.textAlign = "right";
    ctx.font = "bold 27px Verdana, sans-serif";
    ctx.fillStyle = "#4ee07a";
    ctx.fillText("$" + world.cash.toLocaleString("en-US"), VIEW_W - 22, 84);
    const hh = Math.floor(world.hours), mm = Math.floor((world.hours - hh) * 60);
    ctx.font = "15px Verdana, sans-serif";
    ctx.fillStyle = "rgba(240,240,235,0.9)";
    const district = City.districtAt(p.x, p.y).name;
    ctx.fillText(
      String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + "  ·  " + district +
      (world.respect > 0 ? "  ·  ★ " + world.respect : ""),
      VIEW_W - 22, 108);

    // District toast on crossing a border.
    if (district !== this.lastDistrict) {
      if (this.lastDistrict !== "") this.districtT = 2.4;
      this.lastDistrict = district;
    }
    if (this.districtT > 0) {
      this.districtT -= 1 / 60;
      ctx.textAlign = "center";
      ctx.font = "italic 30px Georgia, serif";
      ctx.fillStyle = `rgba(255,214,140,${clamp(this.districtT, 0, 1)})`;
      ctx.fillText(district, VIEW_W / 2, 120);
    }

    // Health bar, bottom-left above the minimap.
    const hx = 24, hy = VIEW_H - 196;
    ctx.fillStyle = "rgba(8,10,16,0.55)";
    ctx.fillRect(hx - 3, hy - 3, 156, 13);
    ctx.fillStyle = "#3a3f46";
    ctx.fillRect(hx, hy, 150, 7);
    ctx.fillStyle = p.health > 30 ? "#4ee07a" : "#e0483c";
    ctx.fillRect(hx, hy, 150 * clamp(p.health, 0, 100) / 100, 7);

    this._minimap(ctx, world, tNow);

    // Speedometer in a car.
    if (p.car) {
      ctx.textAlign = "right";
      ctx.font = "bold 34px Verdana, sans-serif";
      ctx.fillStyle = "#f2f2ee";
      ctx.fillText(String(Math.round(Math.abs(carForward(p.car)) * 3.6)), VIEW_W - 22, VIEW_H - 46);
      ctx.font = "12px Verdana, sans-serif";
      ctx.fillStyle = "rgba(240,240,235,0.75)";
      ctx.fillText("km/h · " + p.car.def.name, VIEW_W - 22, VIEW_H - 24);
    }

    // Objective across the top.
    const obj = Missions.objective(world);
    if (obj && world.state === "play") {
      ctx.font = "16px Verdana, sans-serif";
      const wText = ctx.measureText(obj.text).width + 90;
      ctx.fillStyle = "rgba(8,10,16,0.62)";
      roundRectPath(ctx, VIEW_W / 2 - wText / 2, 14, wText, 34, 8);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd76a";
      let label = obj.text;
      if (obj.marker) {
        const d = Math.round(Math.hypot(obj.marker.x - p.x, obj.marker.y - p.y));
        label += "  ·  " + d + " m";
      }
      ctx.fillText(label, VIEW_W / 2, 37);
    }

    // Mission banner and result cards.
    if (world.banner) {
      ctx.textAlign = "center";
      ctx.font = "bold 40px Georgia, serif";
      ctx.fillStyle = "#ffd76a";
      ctx.fillText(world.banner.text, VIEW_W / 2, 168);
      ctx.font = "17px Verdana, sans-serif";
      ctx.fillStyle = "rgba(240,240,235,0.9)";
      ctx.fillText(world.banner.sub, VIEW_W / 2, 194);
    }
    if (world.resultScreen) {
      const rs = world.resultScreen;
      ctx.fillStyle = "rgba(8,10,16,0.66)";
      roundRectPath(ctx, VIEW_W / 2 - 210, 210, 420, 118, 10);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.font = "bold 27px Georgia, serif";
      ctx.fillStyle = rs.kind === "complete" ? "#4ee07a" : "#e0483c";
      ctx.fillText(rs.kind === "complete" ? "MISSION COMPLETE" : "MISSION FAILED", VIEW_W / 2, 250);
      ctx.font = "16px Verdana, sans-serif";
      ctx.fillStyle = "#f2f2ee";
      ctx.fillText(rs.title + (rs.lines.length ? "  —  " + rs.lines.join("   ") : ""), VIEW_W / 2, 282);
    }

    // Bust meter while a collar is closing in.
    if (world.bustT > 0.08) {
      ctx.fillStyle = "rgba(8,10,16,0.6)";
      ctx.fillRect(VIEW_W / 2 - 90, VIEW_H - 128, 180, 10);
      ctx.fillStyle = "#e0483c";
      ctx.fillRect(VIEW_W / 2 - 90, VIEW_H - 128, 180 * clamp(world.bustT / 1.2, 0, 1), 10);
    }

    // Context prompt.
    if (world.prompt && !world.dialogue) {
      ctx.font = "16px Verdana, sans-serif";
      const wText = ctx.measureText(world.prompt).width + 28;
      ctx.fillStyle = "rgba(8,10,16,0.66)";
      roundRectPath(ctx, VIEW_W / 2 - wText / 2, VIEW_H - 104, wText, 30, 7);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#f2f2ee";
      ctx.fillText(world.prompt, VIEW_W / 2, VIEW_H - 83);
    }

    // Dialogue box.
    if (world.dialogue) {
      const line = world.dialogue.lines[world.dialogue.at];
      if (line) {
        ctx.fillStyle = "rgba(8,10,16,0.78)";
        roundRectPath(ctx, VIEW_W / 2 - 330, VIEW_H - 108, 660, 76, 9);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.font = "bold 15px Verdana, sans-serif";
        ctx.fillStyle = "#ffb000";
        ctx.fillText(line.who, VIEW_W / 2 - 312, VIEW_H - 82);
        ctx.font = "16px Verdana, sans-serif";
        ctx.fillStyle = "#f2f2ee";
        ctx.fillText(line.text, VIEW_W / 2 - 312, VIEW_H - 56);
        ctx.textAlign = "right";
        ctx.font = "12px Verdana, sans-serif";
        ctx.fillStyle = "rgba(240,240,235,0.6)";
        ctx.fillText("E ▸", VIEW_W / 2 + 312, VIEW_H - 42);
      }
    }
  },

  _minimap(ctx, world, tNow) {
    const size = 168, x0 = 24, y0 = VIEW_H - size - 16;
    const span = 210; // metres across the map view
    const ms = 280 / WORLD_SIZE; // minimap px per metre
    const cx = world.player.x * ms, cy = world.player.y * ms;
    const src = span * ms;
    ctx.save();
    roundRectPath(ctx, x0, y0, size, size, 10);
    ctx.clip();
    ctx.fillStyle = "#17384f";
    ctx.fillRect(x0, y0, size, size);
    ctx.drawImage(Render.minimap,
      clamp(cx - src / 2, 0, 280 - src), clamp(cy - src / 2, 0, 280 - src), src, src,
      x0, y0, size, size);
    const toMapX = (wx) => x0 + (wx - (world.player.x - span / 2)) * (size / span);
    const toMapY = (wy) => y0 + (wy - (world.player.y - span / 2)) * (size / span);
    const blip = (wx, wy, color, r) => {
      const bx = toMapX(wx), by = toMapY(wy);
      if (bx < x0 || bx > x0 + size || by < y0 || by > y0 + size) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    };
    const obj = Missions.objective(world);
    if (obj && obj.marker) blip(obj.marker.x, obj.marker.y, "#ffbe28", 4);
    for (const car of world.cars) {
      if (car.driver === "cop") {
        blip(car.x, car.y, Math.sin(tNow * 9 + car.id) > 0 ? "#ff5040" : "#4f7dff", 3);
      }
    }
    // Player arrow.
    const px = toMapX(world.player.x), py = toMapY(world.player.y);
    const ang = world.player.car ? world.player.car.ang : world.player.ang;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -3.6); ctx.lineTo(-4, 3.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.4;
    roundRectPath(ctx, x0, y0, size, size, 10);
    ctx.stroke();
  },

  _title(ctx, world, tNow, showHelp) {
    // A dusk gradient settles the live city behind the menu.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, "rgba(10,10,26,0.30)");
    grad.addColorStop(0.65, "rgba(10,10,26,0.42)");
    grad.addColorStop(1, "rgba(10,10,26,0.78)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.font = "bold 96px Georgia, serif";
    ctx.fillStyle = "#0b0e1a";
    ctx.fillText("LOW TIDE CITY", VIEW_W / 2 + 3, 223);
    ctx.fillStyle = "#ffb000";
    ctx.fillText("LOW TIDE CITY", VIEW_W / 2, 220);
    ctx.font = "19px Verdana, sans-serif";
    ctx.fillStyle = "rgba(255,224,160,0.95)";
    ctx.fillText("P U E R T O   Á M B A R", VIEW_W / 2, 258);
    ctx.font = "italic 16px Georgia, serif";
    ctx.fillStyle = "rgba(240,240,235,0.8)";
    ctx.fillText("Six districts. One river. Every car is somebody else's — at first.", VIEW_W / 2, 292);

    if (showHelp) {
      ctx.fillStyle = "rgba(8,10,16,0.82)";
      roundRectPath(ctx, VIEW_W / 2 - 300, 330, 600, 252, 12);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.font = "16px Verdana, sans-serif";
      ctx.fillStyle = "#f2f2ee";
      const lines = [
        "WASD / arrows — walk and drive",
        "Shift — sprint on foot",
        "E — enter / leave a car, talk, confirm",
        "Space — handbrake",
        "P / Esc — pause",
        "",
        "Start at Marisol's dock office in Los Muelles (gold marker).",
        "Stars bring the Policía. Break their sight to cool the heat.",
      ];
      lines.forEach((ln, i) => ctx.fillText(ln, VIEW_W / 2 - 268, 372 + i * 25));
      ctx.textAlign = "center";
      ctx.font = "14px Verdana, sans-serif";
      ctx.fillStyle = "rgba(240,240,235,0.65)";
      ctx.fillText("Enter or Esc — back", VIEW_W / 2, 616);
      return;
    }

    const items = ["New Game", "How to Play"];
    this.menuRects = [];
    ctx.font = "bold 25px Verdana, sans-serif";
    items.forEach((label, i) => {
      const y = 396 + i * 52;
      this.menuRects.push({ x: VIEW_W / 2 - 130, y: y - 30, w: 260, h: 40, index: i });
      if (i === this.menuIndex) {
        ctx.fillStyle = "rgba(255,176,0,0.16)";
        roundRectPath(ctx, VIEW_W / 2 - 130, y - 30, 260, 40, 8);
        ctx.fill();
        ctx.fillStyle = "#ffb000";
        ctx.fillText("▸ " + label + " ◂", VIEW_W / 2, y);
      } else {
        ctx.fillStyle = "rgba(240,240,235,0.88)";
        ctx.fillText(label, VIEW_W / 2, y);
      }
    });
    ctx.font = "13px Verdana, sans-serif";
    ctx.fillStyle = "rgba(240,240,235,0.55)";
    ctx.fillText("↑ ↓ choose · Enter select — or click", VIEW_W / 2, 530);
  },

  _pause(ctx, world) {
    ctx.fillStyle = "rgba(6,8,14,0.62)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.font = "bold 44px Georgia, serif";
    ctx.fillStyle = "#f2f2ee";
    ctx.fillText("PAUSED", VIEW_W / 2, 300);
    ctx.font = "17px Verdana, sans-serif";
    ctx.fillStyle = "rgba(240,240,235,0.8)";
    ctx.fillText("P or Esc — back to the city", VIEW_W / 2, 344);
  },

  _endScreen(ctx, word, color, sub) {
    ctx.fillStyle = word === "BUSTED" ? "rgba(120,16,10,0.35)" : "rgba(10,10,14,0.5)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.font = "bold 92px Georgia, serif";
    ctx.fillStyle = color;
    ctx.fillText(word, VIEW_W / 2, VIEW_H / 2);
    ctx.font = "17px Verdana, sans-serif";
    ctx.fillStyle = "rgba(240,240,235,0.9)";
    ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 42);
  },
};
