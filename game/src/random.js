// A small seeded random number generator: the same seed gives the same city,
// which is what makes the screenshot scenes repeatable. Mulberry32.
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick an element of an array with the seeded generator.
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// A number in [min, max) from the seeded generator.
export function range(random, min, max) {
  return min + random() * (max - min);
}

// A whole number in [min, max] from the seeded generator.
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
