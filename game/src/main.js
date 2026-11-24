// Neon Harbor — boot and the one loop. The game moves between title, play,
// paused, busted, wasted and win screens. The world advances in fixed 1/60 s
// steps; input is read every frame. ?shot=<name>&seed=<n> stages a screenshot
// scene instead of running the loop.
import { CAR, MISSIONS, PLAYER, ROADS_X, ROADS_Y, SAVE_KEY, TRAFFIC, PEDS, THUGS, WANTED, WORLD, COLORS } from './config.js';
import { createRandom, pick, range } from './random.js';
import { createCity, PLACES, angleTo, clamp, dist } from './world.js';
import { ACT_CONFIRM, ACT_ENTER_CAR, ACT_PAUSE, ACT_PUNCH, createInput } from './input.js';
import { createSound } from './sound.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const sound = createSound();
const renderer = createRenderer(canvas);

function makeCar(x, y, angle, color, isPolice) {
  return { x, y, angle, speed: 0, color, isPolice: !!isPolice, isPlayer: false, stuck: 0 };
}

function makePed(x, y) {
  return {
    x, y, angle: random() * Math.PI * 2, speed: range(random, PEDS.speedMin, PEDS.speedMax),
    color: pick(random, COLORS.ped), state: 'walk', timer: range(random, 1, 4), down: 0,
  };
}

function makeThug(x, y) {
  return { x, y, angle: 0, health: 100, cooldown: 0, respawn: 0, speed: 95 };
}

function createState() {
  return {
    time: 0,
    screen: SCREEN_TITLE,
    player: {
      x: PLACES.start.x, y: PLACES.start.y, angle: -Math.PI / 2,
      health: PLAYER.health, car: null, punchTimer: 0, punchAnim: 0,
    },
    cars: [],
    peds: [],
    thugs: [],
    particles: [],
    cash: 0,
    mission: 0,
    wanted: 0,
    crimeTimer: 0,
    decayTimer: 0,
    camera: { x: PLACES.start.x, y: PLACES.start.y },
    shake: 0,
    toast: '',
    toastTime: 0,
    rook: { x: PLACES.pierEnd.x, y: PLACES.pierEnd.y, angle: Math.PI / 2 },
    bustedTimer: 0,
    saveTimer: 0,
    won: false,
  };
}

const state = createState();

function spawnTraffic() {
  state.cars = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const spot = city.randomRoadSpot();
    const road = city.nearestRoad(spot.x, spot.y);
    const angle = road.axis === 'v' ? (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (road.dir > 0 ? 0 : Math.PI);
    const car = makeCar(spot.x, spot.y, angle, pick(random, COLORS.car), false);
    car.speed = range(random, TRAFFIC.speedMin, TRAFFIC.speedMax);
    car.road = road;
    state.cars.push(car);
  }
  // A few parked cars along the roads, easy to steal.
  for (let i = 0; i < 6; i += 1) {
    const rx = pick(random, ROADS_X);
    const car = makeCar(rx + 34, range(random, 120, 1400), Math.PI / 2, pick(random, COLORS.car), false);
    car.speed = 0;
    car.parked = true;
    state.cars.push(car);
  }
}

function spawnPeds() {
  state.peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const spot = city.randomWalkSpot();
    state.peds.push(makePed(spot.x, spot.y));
  }
}

function spawnThugs() {
  state.thugs = [];
  for (let i = 0; i < THUGS.count; i += 1) {
    const spot = city.randomWalkSpot();
    state.thugs.push(makeThug(spot.x, spot.y));
  }
}

function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i += 1) {
    const a = random() * Math.PI * 2;
    const v = range(random, speed * 0.4, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: range(random, 0.25, 0.5), max: 0.5, size: range(random, 2, 5), color,
    });
  }
}

function toast(message, seconds) {
  state.toast = message;
  state.toastTime = seconds || 3;
}

// Keep an entity inside the world rectangle; returns true when it was pushed back.
function clampToWorld(entity, radius) {
  const beforeX = entity.x;
  const beforeY = entity.y;
  entity.x = clamp(entity.x, radius, WORLD.width - radius);
  entity.y = clamp(entity.y, radius, WORLD.height - radius);
  return entity.x !== beforeX || entity.y !== beforeY;
}

function addWanted(n) {
  state.wanted = Math.min(WANTED.maxStars, state.wanted + n);
  state.crimeTimer = 0;
  state.decayTimer = 0;
  if (state.wanted > 0) sound.siren(true);
}

function clearWanted() {
  state.wanted = 0;
  state.crimeTimer = 0;
  state.decayTimer = 0;
  sound.siren(false);
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, mission: state.mission }));
  } catch { /* storage can be off; the game still plays */ }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.mission !== 'number') return false;
    state.cash = data.cash;
    state.mission = Math.min(data.mission, MISSIONS.length - 1);
    return true;
  } catch {
    return false;
  }
}

function startMission(index) {
  const mission = MISSIONS[index];
  if (!mission) return;
  if (mission.setWanted) {
    state.wanted = mission.setWanted;
    state.crimeTimer = 0;
    state.decayTimer = 0;
    sound.siren(true);
    toast('The cops are onto you — run!', 3.5);
  }
  toast(`${mission.title}: ${mission.text}`, 4);
}

function completeMission() {
  const mission = MISSIONS[state.mission];
  if (!mission) return;
  state.cash += mission.reward;
  sound.mission();
  sound.cash();
  burst(state.player.x, state.player.y, '#ffe14d', 26, 160);
  toast(`Job done — +$${mission.reward}`, 3.5);
  state.mission += 1;
  saveGame();
  if (state.mission >= MISSIONS.length) {
    state.won = true;
    clearWanted();
    state.screen = SCREEN_WIN;
    status.textContent = 'You own the Harbor.';
  } else {
    startMission(state.mission);
  }
}

function nearestCar(x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.isPlayer) continue;
    const d = dist({ x, y }, car);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  car.isPlayer = true;
  car.parked = false;
  state.player.car = car;
  state.player.angle = car.angle;
  sound.click();
  addWanted(1);
  toast('You stole the car — the cops noticed', 2.5);
}

function exitCar() {
  const car = state.player.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  const side = state.player.angle + Math.PI / 2;
  state.player.x = car.x + Math.cos(side) * 34;
  state.player.y = car.y + Math.sin(side) * 34;
  city.resolveCircle(state.player, PLAYER.radius);
  state.player.car = null;
  state.player.angle = car.angle;
}

function punch() {
  const p = state.player;
  if (p.punchTimer > 0 || p.car) return;
  p.punchTimer = PLAYER.punchCooldown;
  p.punchAnim = 0.18;
  sound.punch();
  let hitSomething = false;
  for (const thug of state.thugs) {
    if (thug.respawn > 0) continue;
    const d = dist(p, thug);
    if (d > PLAYER.punchRange + 12) continue;
    const a = angleTo(p, thug);
    let diff = Math.abs(a - p.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > PLAYER.punchArc) continue;
    thug.health -= PLAYER.punchDamage;
    burst(thug.x, thug.y, '#ffd94d', 8, 120);
    hitSomething = true;
    if (thug.health <= 0) {
      thug.respawn = 12;
      thug.health = 100;
      state.cash += 25;
      sound.cash();
      burst(thug.x, thug.y, '#7cfc66', 18, 170);
      toast('Thug down — +$25', 2);
    }
  }
  if (!hitSomething) {
    // A wild swing still scares nearby pedestrians.
    for (const ped of state.peds) {
      if (dist(p, ped) < 60) { ped.state = 'flee'; ped.timer = 2; }
    }
  }
}

function hitPedestrian(ped) {
  if (ped.down > 0) return;
  ped.down = 2.5;
  ped.state = 'down';
  burst(ped.x, ped.y, '#ff5a4d', 10, 130);
  addWanted(1);
  state.shake = 7;
}

function updatePlayer(dt, move, running, actions) {
  const p = state.player;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.punchAnim > 0) p.punchAnim -= dt;

  if (actions & ACT_PUNCH) punch();
  if (actions & ACT_ENTER_CAR) {
    if (p.car) exitCar();
    else {
      const car = nearestCar(p.x, p.y, 56);
      if (car) enterCar(car);
    }
  }

  if (p.car) {
    const car = p.car;
    const throttle = -move.y; // up = forward
    const steer = move.x;
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
    else car.speed -= car.speed * CAR.drag * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    if (Math.abs(car.speed) > 8) {
      car.angle += steer * CAR.turnRate * dt * (car.speed / CAR.maxSpeed) * (car.speed < 0 ? -1 : 1);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = nx;
    car.y = ny;
    if (city.resolveCircle(car, CAR.radius)) {
      car.speed *= 0.45;
      state.shake = Math.max(state.shake, 4);
      if (Math.abs(car.speed) > 200) sound.hit();
    }
    if (clampToWorld(car, CAR.radius)) car.speed *= 0.5;
    // Bump pedestrians and traffic.
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (dist(car, ped) < CAR.radius + 8 && Math.abs(car.speed) > 40) hitPedestrian(ped);
    }
    for (const other of state.cars) {
      if (other === car || other.isPlayer) continue;
      if (dist(car, other) < CAR.radius + 18) {
        const push = angleTo(other, car);
        other.x += Math.cos(push) * 26 * dt * 10;
        other.y += Math.sin(push) * 26 * dt * 10;
        car.speed *= 0.92;
      }
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    sound.engine(Math.abs(car.speed) / CAR.maxSpeed);
    if (Math.abs(car.speed) > 300 && random() < dt * 20) {
      state.particles.push({
        x: car.x - Math.cos(car.angle) * 22, y: car.y - Math.sin(car.angle) * 22,
        vx: 0, vy: 0, life: 0.4, max: 0.4, size: 5, color: '#cfc4a8',
      });
    }
    return;
  }

  sound.engine(0);
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(move.x, move.y);
  if (len > 0) {
    const nx = move.x / len;
    const ny = move.y / len;
    p.angle = Math.atan2(ny, nx);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    city.resolveCircle(p, PLAYER.radius);
    clampToWorld(p, PLAYER.radius);
  }
}

function updateTraffic(dt) {
  for (const car of state.cars) {
    if (car.isPlayer || car.parked || car.isPolice) continue;
    const road = car.road || city.nearestRoad(car.x, car.y);
    car.road = road;
    const dir = road.axis === 'v'
      ? { x: 0, y: road.dir }
      : { x: road.dir, y: 0 };
    const targetAngle = Math.atan2(dir.y, dir.x);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const onX = ROADS_X.some((rx) => Math.abs(car.x - rx) < 8);
    const onY = ROADS_Y.some((ry) => Math.abs(car.y - ry) < 8);
    if (onX && onY && random() < dt * 0.5) {
      const cross = city.nearestRoad(car.x + (road.axis === 'v' ? 60 : 0), car.y + (road.axis === 'h' ? 60 : 0));
      if (cross && cross.axis !== road.axis) car.road = cross;
    }
    // Wrap around the city edge.
    if (car.x < -40) car.x = WORLD.width + 40;
    if (car.x > WORLD.width + 40) car.x = -40;
    if (car.y < -40) car.y = WORLD.waterTop - 40;
    if (car.y > WORLD.waterTop + 40) car.y = -40;
    if (city.solidAt(car.x, car.y)) {
      // Nudged off the road (a bump): steer back to the road centre.
      const r = city.nearestRoad(car.x, car.y);
      if (r.axis === 'v') car.x += (r.at - car.x) * dt * 3;
      else car.y += (r.at - car.y) * dt * 3;
    }
  }
}

function updatePeds(dt) {
  for (const ped of state.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) ped.state = 'walk';
      continue;
    }
    ped.timer -= dt;
    const player = state.player;
    const dPlayer = dist(ped, player);
    const playerCar = player.car;
    if ((playerCar && dPlayer < 130) || (!playerCar && dPlayer < 46 && player.punchTimer > 0)) {
      ped.state = 'flee';
      ped.timer = 2;
    }
    if (ped.state === 'flee') {
      const away = angleTo(player, ped);
      ped.angle = away;
      ped.x += Math.cos(away) * ped.speed * 2.1 * dt;
      ped.y += Math.sin(away) * ped.speed * 2.1 * dt;
      if (ped.timer <= 0) ped.state = 'walk';
    } else {
      if (ped.timer <= 0) {
        ped.timer = range(random, 1.5, 5);
        ped.angle = random() * Math.PI * 2;
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
    }
    if (city.solidAt(ped.x, ped.y)) {
      ped.x -= Math.cos(ped.angle) * ped.speed * dt * 2;
      ped.y -= Math.sin(ped.angle) * ped.speed * dt * 2;
      ped.angle += Math.PI / 2;
    }
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.waterTop - 8);
  }
}

function updateThugs(dt) {
  const player = state.player;
  for (const thug of state.thugs) {
    if (thug.respawn > 0) {
      thug.respawn -= dt;
      if (thug.respawn <= 0) {
        const spot = city.randomWalkSpot();
        thug.x = spot.x;
        thug.y = spot.y;
        thug.health = 100;
      }
      continue;
    }
    thug.cooldown -= dt;
    const d = dist(thug, player);
    if (d < 280 && !player.car) {
      thug.angle = angleTo(thug, player);
      if (d > 26) {
        thug.x += Math.cos(thug.angle) * thug.speed * dt;
        thug.y += Math.sin(thug.angle) * thug.speed * dt;
        city.resolveCircle(thug, 12);
        clampToWorld(thug, 12);
      } else if (thug.cooldown <= 0) {
        thug.cooldown = 1.1;
        player.health -= 8;
        sound.hit();
        state.shake = Math.max(state.shake, 5);
        burst(player.x, player.y, '#ff5a4d', 7, 110);
        if (player.health <= 0) {
          player.health = 0;
          state.screen = SCREEN_WASTED;
          sound.busted();
          status.textContent = 'Wasted.';
        }
      }
    } else {
      // Idle drift.
      thug.angle += Math.sin(state.time * 0.7 + thug.x) * dt * 0.6;
      thug.x += Math.cos(thug.angle) * 14 * dt;
      thug.y += Math.sin(thug.angle) * 14 * dt;
      city.resolveCircle(thug, 12);
      clampToWorld(thug, 12);
    }
  }
}

function wantedPoliceCount() {
  return state.wanted * WANTED.policePerStar;
}

function updatePolice(dt) {
  const want = wantedPoliceCount();
  const police = state.cars.filter((c) => c.isPolice);
  // Spawn more police when the wanted level rises.
  if (police.length < want) {
    const spot = city.randomRoadSpot();
    const car = makeCar(spot.x, spot.y, 0, COLORS.police, true);
    car.speed = WANTED.policeSpeed;
    state.cars.push(car);
  }
  // When the heat is off, the police peel away.
  if (want === 0) {
    for (const car of police) {
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (car.x < -80 || car.x > WORLD.width + 80 || car.y < -80 || car.y > WORLD.height + 80) {
        state.cars.splice(state.cars.indexOf(car), 1);
      }
    }
    return;
  }
  const player = state.player;
  let touching = false;
  for (const car of police) {
    const target = angleTo(car, player);
    let diff = target - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -3.1 * dt, 3.1 * dt);
    car.speed = WANTED.policeSpeed;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (city.solidAt(car.x, car.y)) {
      car.angle += Math.PI * 0.5;
      car.x -= Math.cos(car.angle) * car.speed * dt;
      car.y -= Math.sin(car.angle) * car.speed * dt;
    }
    city.resolveCircle(car, CAR.radius);
    clampToWorld(car, CAR.radius);
    const d = dist(car, player);
    if (player.car) {
      if (d < CAR.radius + 20) {
        player.health -= WANTED.policeRamDamage * dt;
        state.shake = Math.max(state.shake, 6);
        if (random() < dt * 8) sound.hit();
        if (player.health <= 0) {
          player.health = 0;
          state.screen = SCREEN_BUSTED;
          sound.busted();
          status.textContent = 'Busted.';
        }
      }
    } else if (d < CAR.radius + 12) {
      touching = true;
    }
  }
  if (!player.car && touching) {
    state.bustedTimer += dt;
    if (state.bustedTimer >= WANTED.bustedHold) {
      state.screen = SCREEN_BUSTED;
      sound.busted();
      status.textContent = 'Busted.';
    }
  } else {
    state.bustedTimer = 0;
  }
}

function updateMissions() {
  const mission = MISSIONS[state.mission];
  if (!mission) return;
  const player = state.player;
  const d = dist(player, mission.target);
  if (mission.type === 'driveTo') {
    if (player.car && d < mission.target.r) completeMission();
  } else if (mission.type === 'walkTo') {
    if (!player.car && d < mission.target.r) completeMission();
  } else if (mission.type === 'escapeTo') {
    if (d < mission.target.r) completeMission();
  }
}

function updateWanted(dt) {
  if (state.wanted === 0) return;
  state.crimeTimer += dt;
  if (state.crimeTimer < WANTED.decayDelay) return;
  state.decayTimer += dt;
  if (state.decayTimer >= WANTED.decayStep) {
    state.decayTimer = 0;
    state.wanted -= 1;
    if (state.wanted === 0) {
      sound.siren(false);
      toast('You lost them', 2.5);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateCamera(dt) {
  const target = state.player.car || state.player;
  const tx = clamp(target.x, 640, WORLD.width - 640);
  const ty = clamp(target.y, 360, WORLD.height - 360);
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);
}

function stepGame(dt, move, running, actions) {
  state.time += dt;
  if (state.toastTime > 0) state.toastTime -= dt;
  state.saveTimer += dt;
  if (state.saveTimer > 10) {
    state.saveTimer = 0;
    saveGame();
  }
  updatePlayer(dt, move, running, actions);
  if (state.screen !== SCREEN_PLAY) return;
  updateTraffic(dt);
  updatePeds(dt);
  updateThugs(dt);
  updatePolice(dt);
  updateMissions();
  updateWanted(dt);
  updateParticles(dt);
  updateCamera(dt);
}

function resetRun(cash, mission) {
  state.cash = cash;
  state.mission = mission;
  spawnTraffic();
  spawnPeds();
  spawnThugs();
  state.player.x = PLACES.start.x;
  state.player.y = PLACES.start.y;
  state.player.angle = -Math.PI / 2;
  state.player.health = PLAYER.health;
  state.player.car = null;
  state.player.punchTimer = 0;
  state.wanted = 0;
  state.crimeTimer = 0;
  state.decayTimer = 0;
  state.bustedTimer = 0;
  state.particles = [];
  state.camera.x = PLACES.start.x;
  state.camera.y = PLACES.start.y;
  state.shake = 0;
  state.toast = '';
  state.toastTime = 0;
  clearWanted();
  state.screen = SCREEN_PLAY;
  startMission(state.mission);
  status.textContent = `Playing. Mission: ${MISSIONS[state.mission].title}.`;
}

function announceScreen() {
  if (state.screen === SCREEN_TITLE) status.textContent = 'Neon Harbor. Press Enter to start.';
}

const game = {
  state, city, sound, random,
  resetRun, startMission, addWanted, completeMission, stepGame,
};

// ---- boot ----
function runShotMode(name) {
  const scene = stageShot(name, game);
  // resetRun announces mission 0; a staged scene may be a different mission
  // or the title screen, so say what the frame actually shows.
  status.textContent = scene.screen === SCREEN_TITLE
    ? 'Neon Harbor. Press Enter to start.'
    : `Playing. Mission: ${MISSIONS[state.mission].title}.`;
  let painted = 0;
  function paint() {
    renderer.draw(state, city, scene.screen, { hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let hasSave = loadGame();
  // Keep the loaded save for Continue, but reset the run when starting.
  const savedCash = state.cash;
  const savedMission = state.mission;
  state.cash = 0;
  state.mission = 0;
  state.screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let titlePan = 0;

  function syncScreen() {
    screen = state.screen;
  }

  function startGame(fromSave) {
    sound.unlock();
    sound.click();
    if (!fromSave) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    }
    resetRun(fromSave ? savedCash : 0, fromSave ? savedMission : 0);
    syncScreen();
  }

  // Screen-level keys only (confirm / pause). Gameplay keys (punch, steal)
  // stay in `actions` and are handed to the step loop by the caller, so a
  // press is read exactly once per frame.
  function handleActions(actions) {
    if (screen === SCREEN_TITLE) {
      if (actions & ACT_CONFIRM) startGame(hasSave);
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACT_PAUSE) {
        state.screen = SCREEN_PAUSED;
        syncScreen();
        status.textContent = 'Paused.';
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACT_PAUSE | ACT_CONFIRM)) {
        state.screen = SCREEN_PLAY;
        syncScreen();
        status.textContent = 'Playing.';
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACT_CONFIRM) {
        state.player.health = PLAYER.health;
        clearWanted();
        state.player.x = PLACES.start.x;
        state.player.y = PLACES.start.y;
        if (state.player.car) {
          state.player.car.isPlayer = false;
          state.player.car = null;
        }
        state.screen = SCREEN_PLAY;
        syncScreen();
        status.textContent = 'Playing.';
      }
      return;
    }
    if (screen === SCREEN_WIN) {
      if (actions & ACT_CONFIRM) {
        state.screen = SCREEN_PLAY;
        syncScreen();
        status.textContent = 'Playing.';
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Title screen pans slowly across the harbor city behind the panel.
    if (screen === SCREEN_TITLE) {
      titlePan += 0.016;
      state.camera.x = 1200 + Math.sin(titlePan * 0.35) * 320;
      state.camera.y = 900 + Math.cos(titlePan * 0.22) * 160;
      state.time += 0.016;
    }
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP) {
        stepGame(STEP, input.move(), input.running(), firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
        if (state.screen !== SCREEN_PLAY) break;
      }
      syncScreen();
    } else {
      accumulator = 0;
    }
    renderer.draw(state, city, screen, { hasSave });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === SCREEN_PLAY) {
      state.screen = SCREEN_PAUSED;
      syncScreen();
      status.textContent = 'Paused.';
    }
  });
  // The N key starts a fresh game from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && state.screen === SCREEN_TITLE) {
      hasSave = false;
      startGame(false);
    }
  });

  announceScreen();
  requestAnimationFrame(frame);
}

if (shotName) runShotMode(shotName);
else runGame();
