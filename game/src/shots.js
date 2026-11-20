// The screenshot scenes behind ?shot=start|play|end|pickup. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always gives the same
// frame. The start scene is the title over a living city; play is a car chase with the cops
// on the player; end is a street fight; pickup is the second mission's handover.
import { BLOCK, ROAD, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 3.2;
const END_SECONDS = 12;
const PICKUP_SECONDS = 9;

/** Centre of the road band the coordinate sits in. */
function roadCentre(coord) {
  return Math.floor(coord / BLOCK) * BLOCK + ROAD / 2;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Put the player in a car: take the first traffic car and hand it over. */
function giveCar(world) {
  const state = world.state;
  const car = state.cars.find((c) => c.kind === 'traffic');
  if (!car) return null;
  car.kind = 'player';
  car.color = '#e8483f';
  car.speed = 0;
  state.player.onFoot = false;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  return car;
}

/** Drive along a horizontal road at roadY, steering back onto its centreline. */
function driveAlongRoad(state, roadY) {
  const car = state.player.car;
  if (!car) return { x: 0, y: 0 };
  const steer = clamp((roadY - car.y) / 70, -1, 1);
  return { x: steer, y: -1 };
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any other name is the start scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    // A chase: the player in a stolen car, three stars, the cops closing in.
    // A straight run east down the avenue at full speed, so the frame catches
    // the chase in motion before the cops can pin the car at a turn.
    const car = giveCar(world);
    if (car) {
      car.x = 700;
      car.y = roadCentre(368);
      car.angle = 0;
      car.dir = 0;
      state.player.x = car.x;
      state.player.y = car.y;
      state.player.angle = 0;
    }
    state.wanted = 3;
    state.wantedTimer = 0;
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, driveAlongRoad(state, roadCentre(368)), 0, false);
    }
    return { screen: SCREEN_PLAY, hasSave: false };
  }
  if (name === 'end') {
    // A street fight: the player on foot, closing on a thug by the garage.
    state.player.x = 1160;
    state.player.y = 900;
    state.player.angle = 0;
    const thug = state.thugs[0];
    thug.x = 1260;
    thug.y = 900;
    thug.state = 'idle';
    thug.health = 68; // two punches finish him, so the frame catches the takedown
    for (let i = 0; i < END_SECONDS / STEP; i += 1) {
      const dx = thug.x - state.player.x;
      const dy = thug.y - state.player.y;
      const d = Math.hypot(dx, dy) || 1;
      const axis = { x: dx / d, y: dy / d };
      const actions = d < 52 ? 8 : 0;
      world.step(STEP, axis, actions, false);
      if (thug.state === 'down') break;
    }
    return { screen: SCREEN_PLAY, hasSave: false };
  }
  if (name === 'pickup') {
    // The second mission's handover: drive up to Rook at the yellow marker.
    state.missionIndex = 1;
    state.missionStage = 0;
    state.objective = 'Drive to Rook (yellow marker) and pick him up';
    state.target = { x: 688, y: 368, color: '#facc15' };
    const car = giveCar(world);
    if (car) {
      car.x = 380;
      car.y = roadCentre(368);
      car.angle = 0;
      car.dir = 0;
      state.player.x = car.x;
      state.player.y = car.y;
      state.player.angle = 0;
    }
    for (let i = 0; i < PICKUP_SECONDS / STEP; i += 1) {
      const axis = driveAlongRoad(state, roadCentre(368));
      world.step(STEP, axis, 0, false);
      const dx = state.rook.x - state.player.x;
      const dy = state.rook.y - state.player.y;
      if (Math.hypot(dx, dy) < 90) break;
    }
    return { screen: SCREEN_PLAY, hasSave: false };
  }
  // Start: the title over a city that is already moving.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, 0, true);
  }
  return { screen: SCREEN_TITLE, hasSave: false };
}
