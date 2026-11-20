// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, game over, busted and wasted. Progress
// (money, missions, position) is saved to localStorage on mission complete and on pause.
//
// ?seed=N fixes the city. ?shot=start|play|end|pickup (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRIME, EVENT_HIT, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_WASTED } from './world.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { hasSave: false, muted: sound.muted });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let hasSave = !!save;
  let accumulator = 0;
  let last = performance.now();
  let sirenTimer = 0;
  let sirenHigh = false;
  let newGameKey = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && !event.repeat) newGameKey = true;
  });

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
      save = null;
      hasSave = false;
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Ignore storage failures.
      }
    } else if (save) {
      world.reset();
      world.applySave(save);
    } else {
      world.reset();
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    sound.unlock();
    announce('Playing in Neon Harbor.');
  }

  function handleEvents(events) {
    if (events & EVENT_PUNCH) sound.punch();
    if (events & EVENT_HIT) sound.hit();
    if (events & EVENT_CRIME) sound.crime();
    if (events & EVENT_PICKUP) sound.pickup();
    if (events & EVENT_MISSION) {
      sound.mission();
      writeSave();
    }
    if (events & EVENT_BUSTED) {
      sound.busted();
      const p = world.state.player;
      p.money = Math.max(0, p.money - 100);
      screen = SCREEN_BUSTED;
      writeSave();
      announce('Busted. You paid $100 bail.');
    } else if (events & EVENT_WASTED) {
      sound.busted();
      screen = SCREEN_WASTED;
      announce('Wasted.');
    }
  }

  function respawn() {
    const p = world.state.player;
    p.health = 100;
    p.x = 1008;
    p.y = 688;
    p.onFoot = true;
    p.car = null;
    p.invulnerable = 0;
    p.arrest = 0;
    world.state.wanted = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Back on the streets.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      else if (newGameKey) startGame(true);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        writeSave();
        announce('Paused. Progress saved.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_ATTACK)) respawn();
    }
    newGameKey = false;
    return actions;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, 0, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const actions = handleActions();
    const axis = input.axis();
    const events = world.step(STEP, axis, actions, false);
    handleEvents(events);
    // Engine hum while driving; a siren blip while wanted.
    const p = world.state.player;
    sound.engine(p.car ? p.car.speed : 0, !p.onFoot && !!p.car);
    if (world.state.wanted > 0) {
      sirenTimer -= STEP;
      if (sirenTimer <= 0) {
        sirenTimer = 0.85;
        sirenHigh = !sirenHigh;
        sound.siren(sirenHigh);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE) handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      handleActions();
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { hasSave, muted: sound.muted });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
