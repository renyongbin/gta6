// Neon Harbor — tuning and constants. Every number here is the game's own.
// The city is a sun-soaked harbor town: a road grid, a waterfront in the south,
// neon signs on a few rooftops. All art is drawn in code; no assets are loaded.
export const WORLD = {
  width: 2400,
  height: 1800,
  // Harbor water occupies the southern band; the promenade runs along its edge.
  waterTop: 1500,
  roadWidth: 92,
  sidewalk: 16,
};

export const ROADS_X = [300, 700, 1100, 1500, 1900];
export const ROADS_Y = [250, 600, 950, 1300];

export const COLORS = {
  grass: '#8fae5d',
  block: '#d9c9a3',
  road: '#3d3a38',
  roadLine: '#e8d44d',
  sidewalk: '#b7ab8e',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  sand: '#e3d3a4',
  pier: '#8a6b4f',
  buildingRoof: ['#c96f4a', '#d9a441', '#7d9b6a', '#b0523c', '#5f7fa3', '#a37d4f'],
  buildingWall: ['#e8dcc0', '#f0e6cc', '#dcc7a0', '#e5d3ae'],
  neon: ['#ff4fa3', '#37e0ff', '#ffe14d', '#7cfc66'],
  palm: '#3f7d3a',
  player: '#ffd94d',
  playerDark: '#2b2b2b',
  police: '#2f6fd0',
  policeLight: '#ff3b30',
  thug: '#7a3b2e',
  ped: ['#e2725b', '#5b8dd9', '#e0a458', '#8a6fb0', '#4fae7d'],
  car: ['#d94f3d', '#3d7dd9', '#e8b73d', '#7ddb6a', '#c9c9c9', '#8a5fd0'],
};

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 14,
  health: 100,
  punchRange: 36,
  punchArc: 1.15,
  punchDamage: 34,
  punchCooldown: 0.38,
};

export const CAR = {
  accel: 430,
  brake: 640,
  reverseAccel: 260,
  maxSpeed: 440,
  maxReverse: 150,
  turnRate: 2.7,
  radius: 20,
  drag: 0.55,
};

export const TRAFFIC = { count: 14, speedMin: 90, speedMax: 150 };
export const PEDS = { count: 26, speedMin: 28, speedMax: 55 };
export const THUGS = { count: 4 };

export const WANTED = {
  decayDelay: 16, // seconds without a crime before stars start falling
  decayStep: 6, // seconds per star lost
  maxStars: 5,
  policePerStar: 1,
  policeSpeed: 335,
  policeRamDamage: 14,
  bustedHold: 0.9, // seconds of police contact on foot before busted
};

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Harbor Pickup',
    text: 'Steal a car and drive it to the garage',
    type: 'driveTo',
    target: { x: 1500, y: 950, r: 70 },
    needCar: true,
    reward: 150,
  },
  {
    id: 'rook',
    title: 'Meet Rook',
    text: 'On foot: meet Rook at the end of the pier',
    type: 'walkTo',
    target: { x: 1180, y: 1690, r: 46 },
    needCar: false,
    reward: 200,
  },
  {
    id: 'escape',
    title: 'Hot Escape',
    text: 'The heat is on — lose the cops at the safehouse',
    type: 'escapeTo',
    target: { x: 300, y: 250, r: 70 },
    needCar: false,
    setWanted: 3,
    reward: 400,
  },
];

export const SAVE_KEY = 'neon-harbor-save-v1';

// Screenshot scenes, driven by ?shot=<name>&seed=<n> in the URL.
export const SHOTS = ['start', 'play', 'end', 'pickup'];
