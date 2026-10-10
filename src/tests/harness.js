// Minimal test harness for tests.html.

export const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function assertBetween(v, lo, hi, msg = '') {
  if (!(v >= lo && v <= hi)) throw new Error(`${msg} expected ${lo}..${hi}, got ${v}`);
}

// Tests may call info() to report numbers (e.g. engine statistics).
export const infoLog = [];
export const info = (line) => infoLog.push(line);
