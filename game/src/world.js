// Neon Harbor's city: a road grid, blocks full of buildings, and a harbor
// waterfront along the south edge with piers and palms. Generation is seeded, so
// the same seed always builds the same city. Nothing here draws or plays sound;
// it only builds the map and answers collision questions.
import { COLORS, ROADS_X, ROADS_Y, WORLD } from './config.js';
import { int, pick, range } from './random.js';

const BUILDING_MIN = 90;
const BUILDING_MAX = 190;

// Where the three missions point: garage, pier end, safehouse corner.
export const PLACES = {
  garage: { x: 1500, y: 950 },
  pierEnd: { x: 1180, y: 1690 },
  safehouse: { x: 300, y: 250 },
  start: { x: 1100, y: 600 },
};

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const piers = [];
  const parks = [];

  // Piers reach out from the promenade into the harbor water.
  for (const pierX of [560, 1180, 1780]) {
    piers.push({ x: pierX - 26, y: WORLD.waterTop, w: 52, h: 220 });
  }

  // One block of buildings between each pair of neighbouring roads.
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
      const left = ROADS_X[ix] + WORLD.roadWidth / 2 + WORLD.sidewalk + 14;
      const right = ROADS_X[ix + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 14;
      const top = ROADS_Y[iy] + WORLD.roadWidth / 2 + WORLD.sidewalk + 14;
      const bottom = ROADS_Y[iy + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 14;
      // A park instead of buildings in one block in three.
      if (random() < 0.3) {
        parks.push({ x: left, y: top, w: right - left, h: bottom - top });
        continue;
      }
      // Two buildings side by side fill most blocks.
      const split = left + (right - left) * range(random, 0.42, 0.58);
      for (const [bx, bw] of [[left, split - left - 12], [split + 12, right - split - 12]]) {
        const bh = Math.min(bottom - top, range(random, BUILDING_MIN, BUILDING_MAX));
        const by = top + range(random, 0, Math.max(0, bottom - top - bh));
        const roof = pick(random, COLORS.buildingRoof);
        const wall = pick(random, COLORS.buildingWall);
        const neon = random() < 0.4 ? pick(random, COLORS.neon) : null;
        const label = neon ? pick(random, ['NEON', 'BAR', 'HOTEL', 'PIER 9', 'TACOS', '24H']) : null;
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof, wall, neon, label,
          windowsX: Math.max(2, Math.floor(bw / 34)),
          windowsY: Math.max(2, Math.floor(bh / 40)),
        });
      }
    }
  }

  // Palms line the promenade above the water.
  for (let x = 120; x < WORLD.width - 80; x += 130) {
    if (random() < 0.75) palms.push({ x: x + range(random, -18, 18), y: WORLD.waterTop - 26 });
  }

  function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function onRoad(x, y) {
    if (y >= WORLD.waterTop) return false;
    for (const rx of ROADS_X) if (Math.abs(x - rx) <= WORLD.roadWidth / 2) return true;
    for (const ry of ROADS_Y) if (Math.abs(y - ry) <= WORLD.roadWidth / 2) return true;
    return false;
  }

  function onSidewalk(x, y) {
    if (y >= WORLD.waterTop) return false;
    for (const rx of ROADS_X) {
      const d = Math.abs(x - rx);
      if (d > WORLD.roadWidth / 2 && d <= WORLD.roadWidth / 2 + WORLD.sidewalk) return true;
    }
    for (const ry of ROADS_Y) {
      const d = Math.abs(y - ry);
      if (d > WORLD.roadWidth / 2 && d <= WORLD.roadWidth / 2 + WORLD.sidewalk) return true;
    }
    return false;
  }

  function onPier(x, y) {
    for (const pier of piers) if (inRect(x, y, pier)) return true;
    return false;
  }

  // Is a point blocked for walking or driving? Buildings and deep water block;
  // the promenade strip and the piers are walkable, the water is not.
  function solidAt(x, y) {
    if (x < 12 || y < 12 || x > WORLD.width - 12 || y > WORLD.height - 12) return true;
    if (y >= WORLD.waterTop + 8 && !onPier(x, y)) return true;
    for (const b of buildings) if (inRect(x, y, b)) return true;
    return false;
  }

  // Push a circle out of solid ground; returns true when it had to move.
  function resolveCircle(body, radius) {
    let moved = false;
    for (let tries = 0; tries < 3; tries += 1) {
      let pushed = false;
      const probe = (x, y) => solidAt(x, y);
      // Test the four edge points and shove the body back along the axis it hit.
      if (probe(body.x + radius, body.y)) { body.x -= 2; pushed = true; }
      if (probe(body.x - radius, body.y)) { body.x += 2; pushed = true; }
      if (probe(body.x, body.y + radius)) { body.y -= 2; pushed = true; }
      if (probe(body.x, body.y - radius)) { body.y += 2; pushed = true; }
      if (!pushed) break;
      moved = true;
    }
    return moved;
  }

  // The nearest road centre and its direction, for traffic to follow.
  function nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of ROADS_X) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { axis: 'v', at: rx, dir: y < WORLD.height / 2 ? 1 : -1 }; }
    }
    for (const ry of ROADS_Y) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { axis: 'h', at: ry, dir: x < WORLD.width / 2 ? 1 : -1 }; }
    }
    return best;
  }

  // A random spot on a road, for spawning traffic.
  function randomRoadSpot() {
    if (random() < 0.5) {
      return { x: pick(random, ROADS_X) + range(random, -22, 22), y: range(random, 60, WORLD.waterTop - 60) };
    }
    return { x: range(random, 60, WORLD.width - 60), y: pick(random, ROADS_Y) + range(random, -22, 22) };
  }

  // A random walkable spot (road or sidewalk), for spawning pedestrians.
  function randomWalkSpot() {
    for (let tries = 0; tries < 24; tries += 1) {
      const x = range(random, 60, WORLD.width - 60);
      const y = range(random, 60, WORLD.waterTop - 60);
      if (!solidAt(x, y) && (onRoad(x, y) || onSidewalk(x, y))) return { x, y };
    }
    return { x: PLACES.start.x, y: PLACES.start.y };
  }

  return {
    buildings, palms, piers, parks,
    solidAt, resolveCircle, onRoad, onSidewalk, onPier,
    nearestRoad, randomRoadSpot, randomWalkSpot,
  };
}

// Distance helpers shared by the game loop.
export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function randomize(rng) {
  return int(rng, 0, 0xffffffff);
}
