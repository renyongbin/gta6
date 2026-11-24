// Keyboard input for Neon Harbor. Held keys give a move vector; one-shot presses
// (punch, steal a car, confirm, pause) are queued as flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
export const ACT_PUNCH = 1;
export const ACT_ENTER_CAR = 2;
export const ACT_CONFIRM = 4;
export const ACT_PAUSE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;

  function press(event) {
    if (event.repeat) return;
    if (event.code === 'Space') actions |= ACT_PUNCH;
    else if (event.code === 'KeyE') actions |= ACT_ENTER_CAR;
    else if (event.code === 'Enter') actions |= ACT_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACT_PAUSE;
    else return;
    event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    held.add(event.code);
    press(event);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || event.code === 'Space') {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointerdown', () => {
    actions |= ACT_CONFIRM;
  });

  function has(keys) {
    for (const code of keys) if (held.has(code)) return true;
    return false;
  }

  return {
    // Move vector, -1..1 on each axis, from WASD / arrow keys.
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { x, y };
    },
    running() {
      return has(RUN);
    },
    // The one-shot presses since the last call, as ACT_* flags.
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
