// Drawing only: the game's state in, pixels out. The camera follows the player
// across the 2400x1800 city; the view is 1280x720 and scales to the window.
// Flat shapes, warm sun colours, neon signs, and a minimap in the corner.
import { COLORS, MISSIONS, ROADS_X, ROADS_Y, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_WIN = 'win';

const VIEW_W = 1280;
const VIEW_H = 720;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / VIEW_W, h / VIEW_H);
    view.x = (w - VIEW_W * view.scale) / 2;
    view.y = (h - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function drawCity(city, cam, time) {
    // Ground.
    rect(0, 0, WORLD.width, WORLD.waterTop, COLORS.grass);
    // Sand strip along the promenade.
    rect(0, WORLD.waterTop - 26, WORLD.width, 26, COLORS.sand);
    // Harbor water with slow moving bands.
    rect(0, WORLD.waterTop, WORLD.width, WORLD.height - WORLD.waterTop, COLORS.water);
    ctx.fillStyle = COLORS.waterDeep;
    for (let i = 0; i < 5; i += 1) {
      const y = WORLD.waterTop + 34 + i * 52 + Math.sin(time * 0.7 + i * 1.7) * 5;
      ctx.fillRect(0, y, WORLD.width, 5);
    }
    // Piers.
    for (const pier of city.piers) {
      rect(pier.x, pier.y, pier.w, pier.h, COLORS.pier);
      ctx.fillStyle = '#6d543d';
      for (let y = pier.y + 14; y < pier.y + pier.h; y += 26) ctx.fillRect(pier.x + 4, y, pier.w - 8, 3);
    }
    // Parks.
    for (const park of city.parks) {
      rect(park.x, park.y, park.w, park.h, '#7ba75a');
      ctx.fillStyle = '#6a9a4c';
      for (let i = 0; i < 4; i += 1) {
        circle(park.x + park.w * (0.2 + 0.2 * i), park.y + park.h * (0.3 + 0.35 * (i % 2)), 16, '#6a9a4c');
      }
    }
    // Roads and sidewalks.
    for (const rx of ROADS_X) {
      rect(rx - WORLD.roadWidth / 2 - WORLD.sidewalk, 0, WORLD.roadWidth + WORLD.sidewalk * 2, WORLD.waterTop, COLORS.sidewalk);
      rect(rx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.waterTop, COLORS.road);
    }
    for (const ry of ROADS_Y) {
      rect(0, ry - WORLD.roadWidth / 2 - WORLD.sidewalk, WORLD.width, WORLD.roadWidth + WORLD.sidewalk * 2, COLORS.sidewalk);
      rect(0, ry - WORLD.roadWidth / 2, WORLD.width, WORLD.roadWidth, COLORS.road);
    }
    // Centre dashes.
    ctx.fillStyle = COLORS.roadLine;
    for (const rx of ROADS_X) {
      for (let y = 20; y < WORLD.waterTop; y += 64) ctx.fillRect(rx - 3, y, 6, 30);
    }
    for (const ry of ROADS_Y) {
      for (let x = 20; x < WORLD.width; x += 64) ctx.fillRect(x, ry - 3, 30, 6);
    }
    // Buildings: soft shadow, walls, roof, windows, neon sign.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      rect(b.x, b.y, b.w, b.h, b.wall);
      rect(b.x + 6, b.y + 6, b.w - 12, b.h - 12, b.roof);
      ctx.fillStyle = 'rgba(255,255,210,0.75)';
      const ww = (b.w - 16) / b.windowsX;
      const wh = (b.h - 16) / b.windowsY;
      for (let ix = 0; ix < b.windowsX; ix += 1) {
        for (let iy = 0; iy < b.windowsY; iy += 1) {
          ctx.fillRect(b.x + 10 + ix * ww, b.y + 10 + iy * wh, ww * 0.55, wh * 0.55);
        }
      }
      if (b.neon) {
        ctx.fillStyle = b.neon;
        ctx.fillRect(b.x + b.w * 0.2, b.y - 12, b.w * 0.6, 16);
        ctx.fillStyle = '#111';
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + 1);
      }
    }
    // Palms along the promenade.
    for (const palm of city.palms) {
      ctx.strokeStyle = '#6d4c2f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y + 14);
      ctx.lineTo(palm.x, palm.y - 8);
      ctx.stroke();
      circle(palm.x, palm.y - 12, 12, COLORS.palm);
    }
    void cam;
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-22, -12, 46, 26);
    rect(-21, -13, 42, 26, car.color);
    rect(-8, -11, 16, 22, '#9fc6e8');
    rect(12, -11, 4, 5, '#fff2b0');
    rect(12, 6, 4, 5, '#fff2b0');
    rect(-22, -11, 3, 5, '#ff5a4d');
    rect(-22, 6, 3, 5, '#ff5a4d');
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    circle(0, 0, radius, color);
    circle(4, -6, 4, '#f2c79b');
    circle(4, 6, 4, '#f2c79b');
    circle(9, 0, 5, '#2b2b2b');
    ctx.restore();
  }

  function drawMarker(x, y, time, label) {
    const bob = Math.sin(time * 4) * 6;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(x, y - 52 + bob);
    ctx.lineTo(x - 13, y - 26 + bob);
    ctx.lineTo(x + 13, y - 26 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,77,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26 + Math.sin(time * 4) * 4, 0, Math.PI * 2);
    ctx.stroke();
    if (label) text(label, x, y - 62 + bob, 15, '#ffe14d', 'center', 'bold');
  }

  function drawParticles(particles) {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      circle(p.x, p.y, p.size, p.color);
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(state, city) {
    const mw = 196;
    const mh = 147;
    const mx = VIEW_W - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(mx, my + WORLD.waterTop * sy, mw, mh - WORLD.waterTop * sy);
    ctx.fillStyle = '#6a6a6a';
    for (const rx of ROADS_X) ctx.fillRect(mx + rx * sx - 2, my, 4, WORLD.waterTop * sy);
    for (const ry of ROADS_Y) ctx.fillRect(mx, my + ry * sy - 2, mw, 4);
    ctx.fillStyle = '#c9b98a';
    for (const b of city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    const mission = MISSIONS[state.mission];
    if (mission) {
      const blink = Math.sin(state.time * 5) > 0 ? '#ffe14d' : '#ff9d00';
      circle(mx + mission.target.x * sx, my + mission.target.y * sy, 5, blink);
    }
    for (const car of state.cars) {
      if (car.isPolice) circle(mx + car.x * sx, my + car.y * sy, 3, '#ff3b30');
      else circle(mx + car.x * sx, my + car.y * sy, 2, '#d8d8d8');
    }
    circle(mx + state.player.x * sx, my + state.player.y * sy, 4, '#ffffff');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx + state.player.x * sx, my + state.player.y * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawHud(state) {
    // Wanted stars, top-left.
    for (let i = 0; i < 5; i += 1) {
      text('★', 24 + i * 30, 40, 28, i < state.wanted ? '#ffd94d' : 'rgba(255,255,255,0.25)', 'left', 'bold');
    }
    // Health bar.
    rect(22, 52, 150, 14, 'rgba(0,0,0,0.55)');
    rect(22, 52, 150 * Math.max(0, state.player.health / 100), 14, state.player.health > 30 ? '#58d158' : '#ff5a4d');
    text('HEALTH', 178, 64, 14, '#fff', 'left', 'bold');
    // Cash.
    text(`$${state.cash}`, 24, 96, 26, '#7cfc66', 'left', 'bold');
    // Mission objective banner, top-centre.
    const mission = MISSIONS[state.mission];
    if (mission) {
      ctx.fillStyle = 'rgba(10,14,20,0.66)';
      const label = `${mission.title} — ${mission.text}`;
      const w = Math.min(720, 24 + label.length * 8.4);
      ctx.fillRect((VIEW_W - w) / 2, 12, w, 34);
      text(label, VIEW_W / 2, 36, 17, '#ffe14d', 'center', 'bold');
    }
    // Speed, bottom-right, while driving.
    if (state.player.car) {
      const speed = Math.round(Math.abs(state.player.car.speed) * 0.9);
      text(`${speed}`, VIEW_W - 24, VIEW_H - 26, 34, '#fff', 'right', 'bold');
      text('km/h', VIEW_W - 24, VIEW_H - 58, 14, '#cfcfcf', 'right');
    }
    // Toast message, centre.
    if (state.toast && state.toastTime > 0) {
      ctx.fillStyle = 'rgba(10,14,20,0.7)';
      const w = 24 + state.toast.length * 9;
      ctx.fillRect((VIEW_W - w) / 2, VIEW_H - 150, w, 40);
      text(state.toast, VIEW_W / 2, VIEW_H - 122, 20, '#ffffff', 'center', 'bold');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 640;
    const h = 150 + lines.length * 34;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = '#171c26';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || '#ff4fa3';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    text(title, VIEW_W / 2, y + 66, 46, '#fff', 'center', 'bold');
    lines.forEach((line, i) => text(line, VIEW_W / 2, y + 116 + i * 34, 20, '#cfd6de', 'center'));
    text(prompt, VIEW_W / 2, y + h - 30, 20, '#ffe14d', 'center', 'bold');
  }

  function draw(state, city, screen, extra) {
    const cam = state.camera;
    const shake = state.shake || 0;
    const shX = shake ? (Math.random() - 0.5) * shake : 0;
    const shY = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + shX * view.scale, view.y + shY * view.scale);
    // Camera transform into world space.
    ctx.save();
    ctx.translate(-cam.x + VIEW_W / 2, -cam.y + VIEW_H / 2);
    drawCity(city, cam, state.time);
    // Mission marker.
    const mission = MISSIONS[state.mission];
    if (mission && screen === SCREEN_PLAY) drawMarker(mission.target.x, mission.target.y, state.time, mission.title);
    for (const car of state.cars) drawCar(car);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, 8);
    for (const thug of state.thugs) drawPerson(thug.x, thug.y, thug.angle, COLORS.thug, 11);
    if (state.rook) drawPerson(state.rook.x, state.rook.y, state.rook.angle, '#37e0ff', 11);
    drawParticles(state.particles);
    // Player (hidden while driving — the car shows instead).
    if (!state.player.car) {
      drawPerson(state.player.x, state.player.y, state.player.angle, COLORS.player, PLAYER_RADIUS);
    }
    ctx.restore();
    // Screen-space HUD and panels.
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(state);
      drawMinimap(state, city);
    }
    if (screen === SCREEN_TITLE) {
      drawPanel('NEON HARBOR', [
        'A sun-soaked harbor city. Steal cars, dodge the law,',
        'run three jobs for Rook — and own the waterfront.',
        'Move: WASD / arrows    Punch: Space    Steal car: E',
        'Run: Shift    Pause: P    Save: automatic',
      ], extra && extra.hasSave ? 'ENTER — Continue    N — New game' : 'ENTER — Start', '#ff4fa3');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The harbor waits for you.'], 'P — Resume', '#37e0ff');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Harbor PD caught up with you.', `Cash kept: $${state.cash}`], 'ENTER — Walk free', '#2f6fd0');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Neon Harbor is unforgiving.', `Cash kept: $${state.cash}`], 'ENTER — Back on your feet', '#ff3b30');
    } else if (screen === SCREEN_WIN) {
      drawPanel('YOU OWN THE HARBOR', ['All three jobs done. Rook owes you one.', `Cash: $${state.cash}`], 'ENTER — Keep roaming', '#ffe14d');
    }
  }

  const PLAYER_RADIUS = 14;

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
