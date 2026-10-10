// Seeded PRNG (mulberry32). The state lives in a plain object ({ s }) so it can
// be stored inside the save game and resumed exactly.

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

export class Rng {
  constructor(state) {
    if (typeof state === 'object' && state !== null) this.st = state;
    else this.st = { s: (Number(state) >>> 0) || 1 };
  }

  get state() { return this.st; }

  next() {
    let t = (this.st.s = (this.st.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(a = 0, b = 1) { return a + (b - a) * this.next(); }

  // Inclusive integer range.
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }

  chance(p) { return this.next() < p; }

  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  normal(mean = 0, sd = 1) {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // items: array, weight: (item) => number
  weighted(items, weight) {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
