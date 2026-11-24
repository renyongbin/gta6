// The screenshot scenes behind ?shot=start|play|end|pickup. Each one plays the
// real rules forward from a fresh run for a few seconds, steered by scripted
// inputs, so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { ACT_PUNCH } from './input.js';
import { PLACES } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const STEP = 1 / 60;

// Drive the game forward `seconds` with a fixed move input.
function drive(game, seconds, move, actions) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.stepGame(STEP, move, false, i === 0 ? actions : 0);
    if (game.state.screen !== SCREEN_PLAY) break;
  }
}

// Put the player into the nearest parked car and hand it to them.
function putPlayerInCar(game) {
  const state = game.state;
  let car = null;
  for (const candidate of state.cars) {
    if (candidate.parked) { car = candidate; break; }
  }
  if (!car) car = state.cars[0];
  car.isPlayer = true;
  car.parked = false;
  car.speed = 260;
  car.angle = -Math.PI / 2; // face north, up a road
  car.x = 1100;
  car.y = 950;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
}

export function stageShot(name, game) {
  const state = game.state;
  if (name === 'start') {
    game.resetRun(0, 0);
    state.screen = SCREEN_TITLE;
    state.camera.x = 1200;
    state.camera.y = 980;
    state.time = 6;
    return { screen: SCREEN_TITLE };
  }

  if (name === 'play') {
    game.resetRun(0, 0);
    putPlayerInCar(game);
    game.addWanted(3);
    // A few seconds of flat-out driving up the avenue, police behind.
    drive(game, 4.5, { x: 0, y: -1 }, 0);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'end') {
    game.resetRun(0, 0);
    // A street fight: player on foot, a thug right in front, mid-swing.
    const thug = state.thugs[0];
    state.player.x = 700;
    state.player.y = 600;
    state.player.angle = 0;
    thug.x = 700 + 30;
    thug.y = 600;
    thug.health = 66;
    drive(game, 0.5, { x: 0, y: 0 }, ACT_PUNCH);
    drive(game, 0.6, { x: 0, y: 0 }, 0);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'pickup') {
    game.resetRun(0, 0);
    // Mission two: meet Rook at the end of the pier.
    state.mission = 1;
    game.startMission(1);
    state.player.x = PLACES.pierEnd.x;
    state.player.y = PLACES.pierEnd.y - 110;
    state.player.angle = Math.PI / 2;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    drive(game, 0.4, { x: 0, y: 0 }, 0);
    return { screen: SCREEN_PLAY };
  }

  // Any other name is the title.
  game.resetRun(0, 0);
  state.screen = SCREEN_TITLE;
  state.camera.x = 1200;
  state.camera.y = 980;
  return { screen: SCREEN_TITLE };
}
