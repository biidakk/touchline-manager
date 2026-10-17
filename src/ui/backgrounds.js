// Stadium photos for the kick-off screen (img/bg, credits in img/bg/CREDITS.md).

export const STADIUMS = ['stadium-crowd', 'stadium-bowl', 'stadium-teal', 'stadium-stands', 'stadium-lights'];

export const photoUrl = (pic) => `img/bg/${pic}.jpg`;

// A stadium photo for a fixture (the same one each time it is shown).
export function stadiumFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STADIUMS[h % STADIUMS.length];
}
