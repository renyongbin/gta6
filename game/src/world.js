// Neon Harbor's rules and state, with no drawing and no browser in it: the city grid, the
// player on foot or in a car, traffic, pedestrians, police, thugs, the wanted system, the
// three missions and combat. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sounds, announcements) without the world knowing about
// screens. The city is generated once from the seed, so a seed always gives the same city.
import { BLOCK, CAR, PED, PLAYER, POLICE, ROAD, START_MONEY, THUG, TRAFFIC, WANTED, WORLD } from './config.js';

export const EVENT_MISSION = 1;
export const EVENT_CRIME = 2;
export const EVENT_PUNCH = 4;
export const EVENT_HIT = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_PICKUP = 64;

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const BUILDING_COLORS = ['#5b4a7a', '#7a4a5e', '#3f6a72', '#8a6a3f', '#4a5e8a', '#6a4a7a'];
const PED_COLORS = ['#e8e3d9', '#d9a05b', '#8ab4f8', '#f28bb1', '#a3e635'];

/** Mission definitions: id, name, reward and the stage list. A stage completes when its
 * check returns true; the world then advances and pays out at the last stage. */
const MISSIONS = [
  {
    id: 0,
    name: 'Borrowed Wheels',
    reward: 500,
    stages: [
      { text: 'Steal a car — walk up to one and press E', target: null },
      { text: 'Drive to the garage (blue marker)', target: { x: 1328, y: 1008, color: '#22d3ee' } },
    ],
  },
  {
    id: 1,
    name: 'The Pickup',
    reward: 800,
    stages: [
      { text: 'Drive to Rook (yellow marker) and pick him up', target: { x: 688, y: 368, color: '#facc15' } },
      { text: 'Drive Rook to the drop-off (green marker)', target: { x: 1968, y: 1328, color: '#34d399' } },
    ],
  },
  {
    id: 2,
    name: 'Heat',
    reward: 1200,
    stages: [
      { text: 'Lose the heat — reach the safehouse (green marker)', target: { x: 368, y: 1328, color: '#34d399' } },
    ],
  },
];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/** True when the point is on a road band (a road runs along the top/left edge of each block). */
function onRoad(x, y) {
  return (x % BLOCK) < ROAD || (y % BLOCK) < ROAD;
}

/** Centre of the road band the coordinate sits in, for snapping a car onto its lane. */
function roadCentre(coord) {
  return Math.floor(coord / BLOCK) * BLOCK + ROAD / 2;
}

export function createWorld(random) {
  // ---- city generation (deterministic from the seed) ----------------------
  const solids = []; // buildings + water: {x, y, w, h} that nothing can enter
  const buildings = []; // {x, y, w, h, color} — drawn with roofs; also in solids
  const trees = []; // {x, y, r} in the park
  const cols = WORLD.width / BLOCK;
  const rows = WORLD.height / BLOCK;
  const park = { bx: 3, by: 2 };
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      const blockX = bx * BLOCK + ROAD;
      const blockY = by * BLOCK + ROAD;
      const blockW = BLOCK - ROAD;
      if (by === rows - 1) continue; // harbour row: water, no buildings
      if (bx === park.bx && by === park.by) {
        for (let t = 0; t < 7; t += 1) {
          trees.push({
            x: blockX + 30 + random() * (blockW - 60),
            y: blockY + 30 + random() * (blockW - 60),
            r: 16 + random() * 10,
          });
        }
        continue;
      }
      if (random() < 0.62) {
        const w = 130 + random() * 70;
        const h = 130 + random() * 70;
        const b = { x: blockX + (blockW - w) / 2, y: blockY + (blockW - h) / 2, w, h, color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)] };
        buildings.push(b);
        solids.push(b);
      } else {
        const w = 90 + random() * 30;
        const h = 150 + random() * 50;
        const b1 = { x: blockX + 12, y: blockY + (blockW - h) / 2, w, h, color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)] };
        const b2 = { x: blockX + blockW - 12 - w, y: blockY + (blockW - h) / 2, w, h, color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)] };
        buildings.push(b1, b2);
        solids.push(b1, b2);
      }
    }
  }
  // The harbour (bottom row) is water: nothing drives or walks in.
  const water = { x: 0, y: (rows - 1) * BLOCK + ROAD, w: WORLD.width, h: BLOCK - ROAD };
  solids.push(water);

  function hitsSolid(x, y, r) {
    for (let i = 0; i < solids.length; i += 1) {
      const s = solids[i];
      if (x + r > s.x && x - r < s.x + s.w && y + r > s.y && y - r < s.y + s.h) return true;
    }
    return false;
  }

  /** Move a circle, sliding along solids: try x, then y, keeping the axis that is free. */
  function moveCircle(e, dx, dy, r) {
    const nx = e.x + dx;
    if (!hitsSolid(nx, e.y, r)) e.x = nx;
    const ny = e.y + dy;
    if (!hitsSolid(e.x, ny, r)) e.y = ny;
    e.x = clamp(e.x, r, WORLD.width - r);
    e.y = clamp(e.y, r, WORLD.height - r);
  }

  // ---- entities ------------------------------------------------------------
  const player = {
    x: 1008, y: 688, angle: 0, health: PLAYER.health, money: START_MONEY,
    onFoot: true, car: null, punchCooldown: 0, invulnerable: 0, arrest: 0,
  };
  const cars = []; // traffic + police + the player's car: {x,y,angle,speed,color,kind,dir,health,arrest}
  for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnTrafficCar());
  const peds = [];
  for (let i = 0; i < PED.count; i += 1) peds.push(spawnPed());
  const thugs = [];
  const thugSpots = [{ x: 1250, y: 900 }, { x: 1400, y: 1100 }, { x: 620, y: 300 }, { x: 780, y: 460 }];
  for (let i = 0; i < THUG.count; i += 1) {
    thugs.push({
      x: thugSpots[i].x, y: thugSpots[i].y, angle: 0, speed: THUG.speed,
      health: THUG.health, state: 'idle', cooldown: 0, flash: 0,
    });
  }
  // Rook, the pickup for mission 2: a waiting pedestrian at the yellow marker.
  const rook = { x: 688, y: 368, pickedUp: false, inCar: false };

  const state = {
    player, cars, peds, thugs, rook, buildings, trees, water, park,
    wanted: 0, wantedTimer: 0, decayTimer: 0,
    missionIndex: 0, missionStage: 0, missionsDone: [], storyDone: false,
    objective: MISSIONS[0].stages[0].text,
    target: MISSIONS[0].stages[0].target,
    time: 0, message: '', messageTimer: 0,
  };

  function spawnTrafficCar() {
    // On a random road, facing along it.
    const horizontal = random() < 0.5;
    const lane = Math.floor(random() * (horizontal ? rows : cols));
    const along = random() * (horizontal ? WORLD.width : WORLD.height);
    const dir = Math.floor(random() * 4);
    const car = {
      x: 0, y: 0, angle: 0, speed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      color: '#7fb069', kind: 'traffic', dir, health: 100,
    };
    if (horizontal) {
      car.y = lane * BLOCK + ROAD / 2;
      car.x = clamp(along, 60, (horizontal ? WORLD.width : WORLD.height) - 60);
      car.dir = random() < 0.5 ? 0 : 2;
    } else {
      car.x = lane * BLOCK + ROAD / 2;
      car.y = clamp(along, 60, WORLD.height - 60);
      car.dir = random() < 0.5 ? 1 : 3;
    }
    car.angle = car.dir * Math.PI / 2;
    car.color = ['#7fb069', '#4a90d9', '#c9c9c9', '#e07b39', '#9b7ede'][Math.floor(random() * 5)];
    return car;
  }

  function spawnPed() {
    const horizontal = random() < 0.5;
    const lane = Math.floor(random() * (horizontal ? rows : cols));
    const p = {
      x: 0, y: 0, angle: 0, speed: PED.speedMin + random() * (PED.speedMax - PED.speedMin),
      color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      dir: Math.floor(random() * 4), state: 'walk', timer: 0, down: 0,
    };
    if (horizontal) {
      p.y = lane * BLOCK + ROAD / 2 + (random() < 0.5 ? -28 : 28);
      p.x = random() * WORLD.width;
      p.dir = random() < 0.5 ? 0 : 2;
    } else {
      p.x = lane * BLOCK + ROAD / 2 + (random() < 0.5 ? -28 : 28);
      p.y = random() * WORLD.height;
      p.dir = random() < 0.5 ? 1 : 3;
    }
    // Keep pedestrians out of the water.
    p.y = Math.min(p.y, water.y - 20);
    return p;
  }

  function spawnPolice() {
    // On a road near the player, off to one side.
    const angle = random() * Math.PI * 2;
    let x = player.x + Math.cos(angle) * 650;
    let y = player.y + Math.sin(angle) * 650;
    x = clamp(x, 60, WORLD.width - 60);
    y = clamp(y, 60, water.y - 60);
    // Snap onto the nearest road centreline so the car starts on asphalt.
    if (onRoad(x, y)) {
      if ((x % BLOCK) < ROAD) x = roadCentre(x);
      else y = roadCentre(y);
    } else {
      x = roadCentre(x);
      y = roadCentre(y);
    }
    return { x, y, angle: 0, speed: POLICE.speed, color: '#2b4acb', kind: 'police', dir: 0, health: 100, arrest: 0, siren: random() * 2 };
  }

  function addWanted(n, events) {
    if (state.wanted >= WANTED.max) return events;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedTimer = 0;
    state.decayTimer = 0;
    return events | EVENT_CRIME;
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < cars.length; i += 1) {
      const c = cars[i];
      const d = dist2(player.x, player.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function reset() {
    player.x = 1008;
    player.y = 688;
    player.angle = 0;
    player.health = PLAYER.health;
    player.money = START_MONEY;
    player.onFoot = true;
    player.car = null;
    player.punchCooldown = 0;
    player.invulnerable = 0;
    player.arrest = 0;
    cars.length = 0;
    for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnTrafficCar());
    peds.length = 0;
    for (let i = 0; i < PED.count; i += 1) peds.push(spawnPed());
    for (let i = 0; i < thugs.length; i += 1) {
      thugs[i].x = thugSpots[i].x;
      thugs[i].y = thugSpots[i].y;
      thugs[i].health = THUG.health;
      thugs[i].state = 'idle';
      thugs[i].cooldown = 0;
      thugs[i].flash = 0;
    }
    rook.x = 688;
    rook.y = 368;
    rook.pickedUp = false;
    rook.inCar = false;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.decayTimer = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.missionsDone = [];
    state.storyDone = false;
    state.objective = MISSIONS[0].stages[0].text;
    state.target = MISSIONS[0].stages[0].target;
    state.time = 0;
    state.message = '';
    state.messageTimer = 0;
  }

  function advanceMission(events) {
    const mission = MISSIONS[state.missionIndex];
    if (!mission) return events;
    if (state.missionStage + 1 < mission.stages.length) {
      state.missionStage += 1;
      const stage = mission.stages[state.missionStage];
      state.objective = stage.text;
      state.target = stage.target;
      state.message = mission.name + ': ' + stage.text;
      state.messageTimer = 4;
      return events | EVENT_MISSION;
    }
    // Mission complete: pay out and move to the next one.
    player.money += mission.reward;
    state.missionsDone.push(mission.id);
    state.message = mission.name + ' complete! +$' + mission.reward;
    state.messageTimer = 4;
    if (state.missionIndex + 1 < MISSIONS.length) {
      state.missionIndex += 1;
      state.missionStage = 0;
      const next = MISSIONS[state.missionIndex];
      state.objective = next.stages[0].text;
      state.target = next.stages[0].target;
      if (state.missionIndex === 2) {
        // Heat: the job starts hot.
        state.wanted = 3;
        state.wantedTimer = 0;
      }
    } else {
      state.storyDone = true;
      state.objective = 'Story complete — Neon Harbor is yours. Free roam!';
      state.target = null;
    }
    return events | EVENT_MISSION | EVENT_PICKUP;
  }

  function stepTraffic(dt) {
    for (let i = 0; i < cars.length; i += 1) {
      const c = cars[i];
      if (c.kind !== 'traffic') continue;
      const d = DIRS[c.dir];
      // Slow down if another car is close ahead in the same lane.
      let speed = c.speed;
      for (let j = 0; j < cars.length; j += 1) {
        if (i === j) continue;
        const o = cars[j];
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const ahead = dx * d.x + dy * d.y;
        const side = Math.abs(dx * d.y - dy * d.x);
        if (ahead > 0 && ahead < 90 && side < 40) speed = Math.min(speed, o.speed * 0.5);
      }
      const nx = c.x + d.x * speed * dt;
      const ny = c.y + d.y * speed * dt;
      // At an intersection centre, maybe turn onto the crossing road.
      const nearX = Math.abs((nx % BLOCK) - ROAD / 2) < 26;
      const nearY = Math.abs((ny % BLOCK) - ROAD / 2) < 26;
      if (nearX && nearY) {
        const roll = random();
        if (roll < 0.3) {
          // Turn: pick a perpendicular direction and snap onto that road.
          const turn = random() < 0.5 ? 1 : 3;
          c.dir = (c.dir + turn) % 4;
          const nd = DIRS[c.dir];
          if (nd.x !== 0) c.y = roadCentre(c.y);
          else c.x = roadCentre(c.x);
        } else if (roll < 0.36) {
          // U-turn is rare; mostly keep going.
          c.dir = (c.dir + 2) % 4;
        }
      }
      c.x = clamp(nx, 40, WORLD.width - 40);
      c.y = clamp(ny, 40, water.y - 40);
      c.angle = c.dir * Math.PI / 2;
    }
  }

  function stepPeds(dt, events) {
    for (let i = 0; i < peds.length; i += 1) {
      const p = peds[i];
      if (p.state === 'down') {
        p.down -= dt;
        if (p.down <= 0) {
          p.state = 'walk';
          // Get back up somewhere on a road.
          p.x = roadCentre(p.x);
          p.y = Math.min(p.y, water.y - 20);
        }
        continue;
      }
      const d = DIRS[p.dir];
      let speed = p.speed;
      if (p.state === 'flee') {
        speed = p.speed * 2.4;
        p.timer -= dt;
        if (p.timer <= 0) p.state = 'walk';
      }
      const nx = p.x + d.x * speed * dt;
      const ny = p.y + d.y * speed * dt;
      const nearX = Math.abs((nx % BLOCK) - ROAD / 2) < 24;
      const nearY = Math.abs((ny % BLOCK) - ROAD / 2) < 24;
      if (nearX && nearY && random() < 0.02) {
        p.dir = (p.dir + (random() < 0.5 ? 1 : 3)) % 4;
        const nd = DIRS[p.dir];
        if (nd.x !== 0) p.y = roadCentre(p.y) + (random() < 0.5 ? -28 : 28);
        else p.x = roadCentre(p.x) + (random() < 0.5 ? -28 : 28);
      }
      p.x = clamp(nx, 20, WORLD.width - 20);
      p.y = clamp(ny, 20, water.y - 20);
    }
    return events;
  }

  function stepPolice(dt, events) {
    // Spawn to match the wanted level.
    let policeCount = 0;
    for (let i = 0; i < cars.length; i += 1) if (cars[i].kind === 'police') policeCount += 1;
    const wanted = Math.min(state.wanted * POLICE.perStar, POLICE.maxCars);
    while (policeCount < wanted) {
      cars.push(spawnPolice());
      policeCount += 1;
    }
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const c = cars[i];
      if (c.kind !== 'police') continue;
      if (c.health <= 0) {
        // Disabled: smoke and stop, then despawn once the player is far.
        c.speed = 0;
        if (dist2(c.x, c.y, player.x, player.y) > 900 * 900) cars.splice(i, 1);
        continue;
      }
      if (state.wanted === 0) {
        // Heat off: cruise away and despawn.
        cars.splice(i, 1);
        continue;
      }
      c.siren += dt;
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
      const targetSpeed = d > 120 ? POLICE.speed : POLICE.speed * 0.55;
      c.speed += clamp(targetSpeed - c.speed, -600 * dt, 500 * dt);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      const ox = c.x;
      const oy = c.y;
      c.x = nx;
      c.y = ny;
      if (hitsSolid(c.x, c.y, 20)) {
        c.x = ox;
        c.y = oy;
        c.angle += 0.9 * dt * 10;
        c.speed *= 0.6;
      }
      c.x = clamp(c.x, 40, WORLD.width - 40);
      c.y = clamp(c.y, 40, water.y - 40);
      // Touching the player on foot builds the arrest meter.
      if (player.onFoot && d < 52) {
        c.arrest = (c.arrest || 0) + dt;
        if (c.arrest >= POLICE.arrestTime) return events | EVENT_BUSTED;
      } else {
        c.arrest = 0;
      }
    }
    return events;
  }

  function stepThugs(dt, events) {
    for (let i = 0; i < thugs.length; i += 1) {
      const t = thugs[i];
      if (t.flash > 0) t.flash -= dt;
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.state === 'down') continue;
      const d = Math.hypot(player.x - t.x, player.y - t.y);
      if (d < 380 && player.health > 0) {
        t.state = 'chase';
        const dx = player.x - t.x;
        const dy = player.y - t.y;
        const len = Math.hypot(dx, dy) || 1;
        t.angle = Math.atan2(dy, dx);
        if (d > THUG.punchRange + 6) {
          moveCircle(t, (dx / len) * t.speed * dt, (dy / len) * t.speed * dt, 13);
        } else if (t.cooldown <= 0) {
          t.cooldown = THUG.punchCooldown;
          if (player.invulnerable === 0) {
            player.health -= THUG.damage;
            player.invulnerable = PLAYER.invulnerable;
            events |= EVENT_HIT;
            if (player.health <= 0) return events | EVENT_WASTED;
          }
        }
      } else {
        t.state = 'idle';
      }
    }
    return events;
  }

  function stepPlayer(dt, axis, actions) {
    let events = 0;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;

    // Enter / exit a car.
    if (actions & 4) {
      if (player.onFoot) {
        const car = nearestCar(64);
        if (car) {
          player.onFoot = false;
          player.car = car;
          if (car.kind === 'traffic') {
            car.kind = 'player';
            car.color = '#e8483f';
            events = addWanted(1, events);
            state.message = 'Car stolen! The cops are coming.';
            state.messageTimer = 3;
          } else if (car.kind === 'police') {
            car.kind = 'player';
            car.color = '#e8483f';
            events = addWanted(2, events);
            state.message = 'You stole a police car!';
            state.messageTimer = 3;
          }
          player.x = car.x;
          player.y = car.y;
          player.angle = car.angle;
        }
      } else if (player.car) {
        const car = player.car;
        player.onFoot = true;
        player.car = null;
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
        player.angle = car.angle;
        if (hitsSolid(player.x, player.y, PLAYER.radius)) {
          player.x = car.x - Math.cos(car.angle + Math.PI / 2) * 40;
          player.y = car.y - Math.sin(car.angle + Math.PI / 2) * 40;
        }
      }
    }

    if (player.onFoot) {
      const len = Math.hypot(axis.x, axis.y);
      if (len > 0) {
        const nx = axis.x / len;
        const ny = axis.y / len;
        player.angle = Math.atan2(ny, nx);
        moveCircle(player, nx * PLAYER.walkSpeed * dt, ny * PLAYER.walkSpeed * dt, PLAYER.radius);
      }
      // Punch: hits enemies within range and roughly in front of the player.
      if ((actions & 8) && player.punchCooldown <= 0) {
        player.punchCooldown = PLAYER.punchCooldown;
        events |= EVENT_PUNCH;
        const range = PLAYER.punchRange + 18;
        const cosA = Math.cos(player.angle);
        const sinA = Math.sin(player.angle);
        function inArc(tx, ty) {
          const dx = tx - player.x;
          const dy = ty - player.y;
          const d = Math.hypot(dx, dy);
          if (d > range) return false;
          if (d < 1) return true;
          return (dx * cosA + dy * sinA) / d > 0.2;
        }
        for (let i = 0; i < thugs.length; i += 1) {
          const t = thugs[i];
          if (t.state === 'down') continue;
          if (inArc(t.x, t.y)) {
            t.health -= PLAYER.punchDamage;
            t.flash = 0.18;
            if (t.health <= 0) {
              t.state = 'down';
              player.money += 50;
              events |= EVENT_PICKUP;
              state.message = 'Thug down! +$50';
              state.messageTimer = 2;
            }
          }
        }
        for (let i = 0; i < peds.length; i += 1) {
          const p = peds[i];
          if (p.state === 'down') continue;
          if (inArc(p.x, p.y)) {
            p.state = 'flee';
            p.timer = 3;
            const away = Math.atan2(p.y - player.y, p.x - player.x);
            p.dir = Math.abs(Math.cos(away)) > Math.abs(Math.sin(away)) ? (Math.cos(away) > 0 ? 0 : 2) : (Math.sin(away) > 0 ? 1 : 3);
            events = addWanted(1, events);
          }
        }
      }
    } else if (player.car) {
      const car = player.car;
      // Drive: up accelerates, down brakes/reverses, left/right steer.
      const throttle = -axis.y;
      const steer = axis.x;
      if (throttle > 0) car.speed += CAR.accel * throttle * dt;
      else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.5) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
      car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
      if (Math.abs(car.speed) > 8) {
        // Turn rate grows with speed but never vanishes, so a slow car can still turn.
        const grip = clamp(Math.abs(car.speed) / 200, 0.35, 1);
        car.angle += steer * CAR.turnRate * grip * dt * (car.speed < 0 ? -1 : 1);
      }
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const ox = car.x;
      const oy = car.y;
      car.x = nx;
      car.y = ny;
      if (hitsSolid(car.x, car.y, 20)) {
        car.x = ox;
        car.y = oy;
        if (Math.abs(car.speed) > 220) {
          player.health -= 6;
          events |= EVENT_HIT;
          if (player.health <= 0) return events | EVENT_WASTED;
        }
        car.speed *= -0.25;
      }
      car.x = clamp(car.x, 40, WORLD.width - 40);
      car.y = clamp(car.y, 40, water.y - 40);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Running over a pedestrian is a crime.
      for (let i = 0; i < peds.length; i += 1) {
        const p = peds[i];
        if (p.state === 'down') continue;
        if (dist2(car.x, car.y, p.x, p.y) < 34 * 34 && Math.abs(car.speed) > 60) {
          p.state = 'down';
          p.down = 5;
          events = addWanted(1, events);
          state.message = 'You hit a pedestrian!';
          state.messageTimer = 2;
        }
      }
      // Ramming a police car damages it.
      for (let i = 0; i < cars.length; i += 1) {
        const o = cars[i];
        if (o.kind !== 'police' || o.health <= 0) continue;
        if (dist2(car.x, car.y, o.x, o.y) < 52 * 52 && Math.abs(car.speed) > 240) {
          o.health -= 45;
          car.speed *= 0.55;
          if (o.health <= 0) {
            events = addWanted(1, events);
            state.message = 'Police car disabled!';
            state.messageTimer = 2;
          }
        }
      }
    }
    return events;
  }

  function stepMission(dt, events) {
    if (state.storyDone) return events;
    const mission = MISSIONS[state.missionIndex];
    if (!mission) return events;
    const stage = mission.stages[state.missionStage];
    if (mission.id === 0 && state.missionStage === 0) {
      if (!player.onFoot) return advanceMission(events);
    } else if (mission.id === 0 && state.missionStage === 1) {
      if (!player.onFoot && dist2(player.x, player.y, stage.target.x, stage.target.y) < 78 * 78) {
        return advanceMission(events);
      }
    } else if (mission.id === 1 && state.missionStage === 0) {
      if (!rook.pickedUp && !player.onFoot && dist2(player.x, player.y, rook.x, rook.y) < 66 * 66) {
        rook.pickedUp = true;
        rook.inCar = true;
        state.message = 'Rook is in! Drive him to the drop-off.';
        state.messageTimer = 3;
        return advanceMission(events);
      }
    } else if (mission.id === 1 && state.missionStage === 1) {
      if (!player.onFoot && dist2(player.x, player.y, stage.target.x, stage.target.y) < 78 * 78) {
        return advanceMission(events);
      }
    } else if (mission.id === 2 && state.missionStage === 0) {
      if (dist2(player.x, player.y, stage.target.x, stage.target.y) < 78 * 78) {
        return advanceMission(events);
      }
    }
    return events;
  }

  /**
   * One fixed step. `axis` is the movement vector, `actions` the one-shot flags (bit 4 =
   * enter/exit car, bit 8 = attack). With `demo` set (the title screen's backdrop) traffic
   * and pedestrians move but nothing interacts with the player.
   */
  function step(dt, axis, actions, demo) {
    let events = 0;
    state.time += dt;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    stepTraffic(dt);
    events = stepPeds(dt, events);
    if (demo) return events;

    events = stepPlayer(dt, axis, actions);
    if (events & (EVENT_BUSTED | EVENT_WASTED)) return events;
    events = stepPolice(dt, events);
    if (events & EVENT_BUSTED) return events;
    events = stepThugs(dt, events);
    if (events & EVENT_WASTED) return events;

    // Wanted decay: stars fall once the heat has cooled off.
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      if (state.wantedTimer > WANTED.decayDelay) {
        state.decayTimer += dt;
        if (state.decayTimer >= WANTED.decayInterval) {
          state.decayTimer = 0;
          state.wanted -= 1;
        }
      }
    }

    events = stepMission(dt, events);
    return events;
  }

  /** Save data for localStorage (money, missions, position, health). */
  function getSave() {
    return {
      money: player.money,
      missionsDone: state.missionsDone.slice(),
      missionIndex: state.missionIndex,
      missionStage: state.missionStage,
      x: player.x,
      y: player.y,
      health: player.health,
      wanted: state.wanted,
    };
  }

  function applySave(save) {
    if (!save) return;
    player.money = save.money ?? START_MONEY;
    state.missionsDone = (save.missionsDone ?? []).slice();
    state.missionIndex = save.missionIndex ?? 0;
    state.missionStage = save.missionStage ?? 0;
    state.storyDone = state.missionIndex >= MISSIONS.length;
    if (save.x !== undefined && save.y !== undefined) {
      player.x = clamp(save.x, 40, WORLD.width - 40);
      player.y = clamp(save.y, 40, water.y - 40);
    }
    player.health = save.health ?? PLAYER.health;
    state.wanted = save.wanted ?? 0;
    if (state.storyDone) {
      state.objective = 'Story complete — Neon Harbor is yours. Free roam!';
      state.target = null;
    } else {
      const mission = MISSIONS[state.missionIndex];
      if (mission) {
        state.objective = mission.stages[state.missionStage].text;
        state.target = mission.stages[state.missionStage].target;
      }
    }
    player.onFoot = true;
    player.car = null;
    rook.pickedUp = false;
    rook.inCar = false;
  }

  reset();
  return { state, reset, step, getSave, applySave, MISSIONS };
}
