// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player through a 1280x720 window of the city; the margin is filled with the backdrop
// colour. Flat shapes and canvas text: roads and buildings, cars and people, the HUD (minimap,
// wanted stars, health, money, objective, speed) and the menu panels.
import { BLOCK, CAR, FONT, PALETTE, PLAYER, ROAD, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const MAP = { x: VIEW.width - 244, y: 16, w: 228, h: 170 };

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCity(state) {
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + VIEW.width + 40);
    const y1 = Math.min(WORLD.height, cam.y + VIEW.height + 40);
    // Ground.
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Harbour water along the bottom.
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, state.water.y, x1 - x0, state.water.h);
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, state.water.y - 8, x1 - x0, 8);
    // Roads: asphalt bands along every grid line.
    context.fillStyle = PALETTE.road;
    for (let gx = 0; gx * BLOCK < WORLD.width; gx += 1) {
      context.fillRect(gx * BLOCK, y0, ROAD, y1 - y0);
    }
    for (let gy = 0; gy * BLOCK < WORLD.height; gy += 1) {
      context.fillRect(x0, gy * BLOCK, x1 - x0, ROAD);
    }
    // Lane dashes down the middle of each road.
    context.fillStyle = PALETTE.lane;
    for (let gx = 0; gx * BLOCK < WORLD.width; gx += 1) {
      const cx = gx * BLOCK + ROAD / 2;
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
        context.fillRect(cx - 2, y, 4, 22);
      }
    }
    for (let gy = 0; gy * BLOCK < WORLD.height; gy += 1) {
      const cy = gy * BLOCK + ROAD / 2;
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
        context.fillRect(x, cy - 2, 22, 4);
      }
    }
    // Park.
    const parkX = 3 * BLOCK + ROAD;
    const parkY = 2 * BLOCK + ROAD;
    context.fillStyle = PALETTE.park;
    context.fillRect(parkX, parkY, BLOCK - ROAD, BLOCK - ROAD);
    context.fillStyle = '#3f7a44';
    for (let i = 0; i < state.trees.length; i += 1) {
      const t = state.trees[i];
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
    }
    // Buildings: coloured footprint, darker roof inset, a few lit windows.
    for (let i = 0; i < state.buildings.length; i += 1) {
      const b = state.buildings[i];
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
      context.fillStyle = 'rgba(255, 214, 120, 0.5)';
      const cols = Math.floor(b.w / 34);
      const rows = Math.floor(b.h / 34);
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + i) % 3 === 0) {
            context.fillRect(b.x + 18 + cx * 34, b.y + 18 + cy * 34, 12, 12);
          }
        }
      }
    }
  }

  function drawMarker(state) {
    const t = state.target;
    if (!t) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    context.save();
    context.globalAlpha = 0.85;
    context.strokeStyle = t.color;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(t.x, t.y, 46 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.25;
    context.fillStyle = t.color;
    context.beginPath();
    context.arc(t.x, t.y, 46 * pulse, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // A light beam so the marker reads from far away.
    context.save();
    context.globalAlpha = 0.16 + Math.sin(state.time * 4) * 0.05;
    context.fillStyle = t.color;
    context.fillRect(t.x - 6, t.y - 260, 12, 260);
    context.restore();
    // Off-screen arrow: point from the screen edge toward the target.
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx < 40 || sx > VIEW.width - 40 || sy < 40 || sy > VIEW.height - 40) {
      const cx = clamp(sx, 60, VIEW.width - 60);
      const cy = clamp(sy, 60, VIEW.height - 60);
      const ang = Math.atan2(sy - cy, sx - cx);
      context.save();
      context.translate(cam.x + cx, cam.y + cy);
      context.rotate(ang);
      context.fillStyle = t.color;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -12);
      context.lineTo(-10, 12);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawCar(c, isPlayer) {
    context.save();
    context.translate(c.x, c.y);
    context.rotate(c.angle);
    const len = CAR.length;
    const wid = CAR.width;
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(-len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    context.fill();
    context.fillStyle = c.color;
    roundRect(-len / 2, -wid / 2, len, wid, 8);
    context.fill();
    // Windshield and rear window.
    context.fillStyle = 'rgba(180, 220, 255, 0.85)';
    context.fillRect(len / 2 - 16, -wid / 2 + 4, 10, wid - 8);
    context.fillRect(-len / 2 + 4, -wid / 2 + 4, 8, wid - 8);
    // Headlights.
    context.fillStyle = '#fff7c0';
    context.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 6);
    context.fillRect(len / 2 - 2, wid / 2 - 9, 3, 6);
    if (c.kind === 'police') {
      const flash = Math.floor((c.siren ?? 0) * 4) % 2 === 0;
      context.fillStyle = flash ? '#ff2e4d' : '#3b82f6';
      context.fillRect(-6, -wid / 2 + 2, 12, 6);
      context.fillStyle = flash ? '#3b82f6' : '#ff2e4d';
      context.fillRect(-6, wid / 2 - 8, 12, 6);
      if (c.health <= 0) {
        context.fillStyle = 'rgba(120, 120, 120, 0.6)';
        context.beginPath();
        context.arc(-len / 2, 0, 12, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (isPlayer) {
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 2;
      roundRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 10);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, radius, flash) {
    context.save();
    context.translate(x, y);
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(2, 4, radius, radius * 0.7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = flash > 0 ? '#ffffff' : color;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    // Facing tick.
    context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * (radius + 6), Math.sin(angle) * (radius + 6));
    context.stroke();
    context.restore();
  }

  function drawMinimap(state) {
    const mx = MAP.x;
    const my = MAP.y;
    const mw = MAP.w;
    const mh = MAP.h;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    context.save();
    context.fillStyle = 'rgba(10, 8, 20, 0.82)';
    context.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    context.strokeStyle = '#6b6390';
    context.lineWidth = 2;
    context.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
    context.beginPath();
    context.rect(mx, my, mw, mh);
    context.clip();
    // Water.
    context.fillStyle = PALETTE.water;
    context.fillRect(mx, my + state.water.y * sy, mw, state.water.h * sy);
    // Roads.
    context.fillStyle = '#3a3a4a';
    for (let gx = 0; gx * BLOCK < WORLD.width; gx += 1) {
      context.fillRect(mx + gx * BLOCK * sx, my, ROAD * sx, mh);
    }
    for (let gy = 0; gy * BLOCK < WORLD.height; gy += 1) {
      context.fillRect(mx, my + gy * BLOCK * sy, mw, ROAD * sy);
    }
    // Mission target.
    if (state.target) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.3;
      context.fillStyle = state.target.color;
      context.beginPath();
      context.arc(mx + state.target.x * sx, my + state.target.y * sy, 5 * pulse, 0, Math.PI * 2);
      context.fill();
    }
    // Rook.
    if (!state.rook.pickedUp) {
      context.fillStyle = '#facc15';
      context.beginPath();
      context.arc(mx + state.rook.x * sx, my + state.rook.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Police.
    for (let i = 0; i < state.cars.length; i += 1) {
      const c = state.cars[i];
      if (c.kind !== 'police' || c.health <= 0) continue;
      context.fillStyle = '#5b8cff';
      context.beginPath();
      context.arc(mx + c.x * sx, my + c.y * sy, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    // Player.
    context.fillStyle = '#ffd23f';
    context.beginPath();
    context.arc(mx + state.player.x * sx, my + state.player.y * sy, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffd23f';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(mx + state.player.x * sx, my + state.player.y * sy, 8, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawHud(state) {
    const p = state.player;
    context.textBaseline = 'top';
    // Money and health, top left.
    text('$' + p.money, 20, 16, 30, PALETTE.money, 'left');
    const barW = 220;
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(20, 52, barW, 16);
    context.fillStyle = p.health > 30 ? PALETTE.health : PALETTE.healthLow;
    context.fillRect(20, 52, barW * Math.max(0, p.health) / PLAYER.health, 16);
    context.strokeStyle = '#6b6390';
    context.lineWidth = 1;
    context.strokeRect(20, 52, barW, 16);
    text('HP', 250, 50, 18, PALETTE.text, 'left');
    // Objective, under the health bar.
    text(state.objective, 20, 78, 20, PALETTE.text, 'left');
    if (state.message) {
      context.textBaseline = 'alphabetic';
      text(state.message, VIEW.width / 2, 116, 24, '#ffd23f', 'center');
      context.textBaseline = 'top';
    }
    // Minimap and wanted stars, top right.
    drawMinimap(state);
    const starY = MAP.y + MAP.h + 14;
    for (let s = 0; s < 5; s += 1) {
      context.fillStyle = s < state.wanted ? PALETTE.star : 'rgba(255, 255, 255, 0.18)';
      drawStar(MAP.x + 14 + s * 26, starY + 10, 10);
    }
    text(state.wanted > 0 ? 'WANTED' : 'CLEAN', MAP.x + 150, starY, 18, state.wanted > 0 ? '#ff6b6b' : PALETTE.muted, 'left');
    // Speed, bottom right, when driving.
    if (!p.onFoot && p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
      text(kmh + ' km/h', VIEW.width - 24, VIEW.height - 52, 30, PALETTE.text, 'right');
    }
    // Hint line, bottom left.
    text(p.onFoot ? 'WASD move · E enter car · Space punch · P pause' : 'W/S drive · A/D steer · E exit car · P pause', 20, VIEW.height - 36, 16, PALETTE.muted, 'left');
  }

  function drawStar(cx, cy, r) {
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(20, 14, 36, 0.92)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = '#6b6390';
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 38, 22, '#ffd23f', 'center');
  }

  /** Paint one frame: the city, the people and cars, the HUD, and a panel for the screen. */
  function draw(state, screen, info) {
    const p = state.player;
    cam.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    cam.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - cam.x * view.scale, view.y - cam.y * view.scale);
    drawCity(state);
    drawMarker(state);
    // Rook, waiting for the pickup.
    if (!state.rook.pickedUp) {
      drawPerson(state.rook.x, state.rook.y, -Math.PI / 2, '#facc15', 13, 0);
      context.fillStyle = '#facc15';
      context.font = 'bold 20px ' + FONT;
      context.textAlign = 'center';
      context.fillText('ROOK', state.rook.x, state.rook.y + 34);
    }
    // Pedestrians.
    for (let i = 0; i < state.peds.length; i += 1) {
      const ped = state.peds[i];
      if (ped.state === 'down') {
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(1.2);
        context.fillStyle = ped.color;
        context.fillRect(-12, -5, 24, 10);
        context.restore();
      } else {
        drawPerson(ped.x, ped.y, ped.dir * Math.PI / 2, ped.color, 11, 0);
      }
    }
    // Thugs, with health bars.
    for (let i = 0; i < state.thugs.length; i += 1) {
      const t = state.thugs[i];
      if (t.state === 'down') {
        context.save();
        context.translate(t.x, t.y);
        context.rotate(1.2);
        context.fillStyle = '#7f1d1d';
        context.fillRect(-13, -5, 26, 10);
        context.restore();
        continue;
      }
      drawPerson(t.x, t.y, t.angle, '#b91c1c', 14, t.flash);
      context.fillStyle = 'rgba(0, 0, 0, 0.55)';
      context.fillRect(t.x - 18, t.y - 30, 36, 6);
      context.fillStyle = '#ef4444';
      context.fillRect(t.x - 18, t.y - 30, 36 * Math.max(0, t.health) / 100, 6);
    }
    // Cars (traffic, police, the player's).
    for (let i = 0; i < state.cars.length; i += 1) {
      const c = state.cars[i];
      drawCar(c, state.player.car === c);
    }
    // The player on foot (when driving, the car above is the player).
    if (p.onFoot) {
      const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0;
      if (!blink) drawPerson(p.x, p.y, p.angle, PALETTE.player, PLAYER.radius, 0);
    }
    // Punch arc.
    if (p.onFoot && p.punchCooldown > 0.24) {
      context.save();
      context.translate(p.x + Math.cos(p.angle) * 34, p.y + Math.sin(p.angle) * 34);
      context.rotate(p.angle);
      context.strokeStyle = 'rgba(255, 210, 63, 0.9)';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, 18, -0.9, 0.9);
      context.stroke();
      context.restore();
    }
    // HUD in view space.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      drawHud(state);
    }
    if (screen === SCREEN_TITLE) {
      const lines = [
        'A top-down open-world crime game. Steal cars, dodge the cops,',
        'run three jobs across Neon Harbor — and keep the money.',
        'WASD / arrows move & drive · E steal or exit a car',
        'Space punch · P pause · M mute',
        info.hasSave ? 'A save was found — Enter continues it, N starts fresh.' : 'No save yet — Enter starts a new game.',
      ];
      drawPanel('NEON HARBOR', lines, 'Press Enter to play');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['Progress is saved. The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Game over', ['Score: $' + p.money, 'Missions done: ' + state.missionsDone.length + ' / 3'], 'Press Space to play again');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Harbor PD caught up with you.', 'You lose $100 bail. Missions done: ' + state.missionsDone.length + ' / 3'], 'Press Space to try again');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Neon Harbor is unforgiving.', 'Missions done: ' + state.missionsDone.length + ' / 3'], 'Press Space to try again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
