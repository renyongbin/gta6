// Neon Harbor — a top-down open-world crime game. Every tuning number and colour in one
// place. The world is a fixed 2560x1920 city; the renderer shows a 1280x720 window of it and
// the camera follows the player, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };

/** City grid: streets every BLOCK units, each ROAD wide, along the top/left edge of a block. */
export const BLOCK = 320;
export const ROAD = 96;

/** The camera's logical view, in world units. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  health: 100,
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.38,
  invulnerable: 1.0,
};

export const CAR = {
  accel: 520,
  brake: 700,
  maxSpeed: 460,
  reverseMax: 150,
  turnRate: 2.6,
  length: 54,
  width: 26,
};

export const TRAFFIC = { count: 14, speedMin: 110, speedMax: 175 };

export const PED = { count: 22, speedMin: 28, speedMax: 55 };

export const POLICE = {
  /** Police cars per wanted star, capped. */
  perStar: 1,
  maxCars: 6,
  speed: 430,
  ramDamage: 12,
  /** Seconds a police car must stay touching the player on foot to bust them. */
  arrestTime: 2.2,
};

export const THUG = { health: 100, speed: 150, damage: 9, punchRange: 40, punchCooldown: 0.9, count: 4 };

export const WANTED = {
  max: 5,
  /** Seconds after the last crime before stars start to fall. */
  decayDelay: 22,
  /** Seconds between star drops once decaying. */
  decayInterval: 9,
};

/** Money the player starts with, and what each mission pays. */
export const START_MONEY = 250;

export const PALETTE = {
  backdrop: '#14101f',
  sky: '#1a1430',
  grass: '#233d2b',
  water: '#16324a',
  sand: '#3a2f28',
  road: '#23232e',
  roadEdge: '#3a3a4a',
  lane: '#c9a227',
  sidewalk: '#4a4658',
  buildingA: '#5b4a7a',
  buildingB: '#7a4a5e',
  buildingC: '#3f6a72',
  buildingD: '#8a6a3f',
  buildingE: '#4a5e8a',
  roof: '#2c2438',
  park: '#2c5a34',
  player: '#ffd23f',
  playerCar: '#e8483f',
  traffic: ['#7fb069', '#4a90d9', '#c9c9c9', '#e07b39', '#9b7ede'],
  police: '#2b4acb',
  policeLight: '#ff2e4d',
  ped: ['#e8e3d9', '#d9a05b', '#8ab4f8', '#f28bb1', '#a3e635'],
  thug: '#b91c1c',
  marker: '#22d3ee',
  markerPickup: '#facc15',
  markerEscape: '#34d399',
  text: '#f2ead8',
  muted: '#a89ec4',
  panel: '#1e1830',
  star: '#ffd23f',
  health: '#4ade80',
  healthLow: '#ef4444',
  money: '#4ade80',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';
