// Background photos (img/bg, credits in img/bg/CREDITS.md), as in the old CSM:
// one per screen, and a stadium for the general screens that changes with the
// match day. The kick-off screen shows a stadium chosen by the fixture.

const BY_SCREEN = { myteam: 'keeper', tactics: 'penalty', otherteams: 'keeper', training: 'training-night', youth: 'training-smoke',
  u19: 'training-smoke', preseason: 'training-night', market: 'boot-ball', deals: 'boot-ball', search: 'boot-ball', title: 'stadium-lights',
  newgame: 'stadium-lights', saves: 'stadium-lights' };
export const STADIUMS = ['stadium-crowd', 'stadium-bowl', 'stadium-teal', 'stadium-stands', 'stadium-lights'];

export const photoUrl = (pic) => `img/bg/${pic}.jpg`;

export function setBackground(name, game) {
  const el = document.getElementById('bg');
  if (!el) return;
  const pick = BY_SCREEN[name] || STADIUMS[Math.floor((game?.day || 0) / 7) % STADIUMS.length];
  if (el.dataset.pic !== pick) {
    el.dataset.pic = pick;
    el.style.backgroundImage = `url(${photoUrl(pick)})`;
  }
}

// A stadium photo for a fixture (the same one each time it is shown).
export function stadiumFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STADIUMS[h % STADIUMS.length];
}
