// Original SVG graphics: jerseys, crests, flags and menu icons.

let uidCounter = 0;
const uid = (p) => `${p}${++uidCounter}`;

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
export const textOn = (hex) => (lum(hex) > 0.6 ? '#111' : '#fff');

const SHIRT = 'M30 8 L42 4 Q50 11 58 4 L70 8 L95 23 L85 43 L75 37 L75 95 L25 95 L25 37 L15 43 L5 23 Z';

function kitPattern(pattern, c2) {
  switch (pattern) {
    case 'stripes': return [31, 43, 55, 67].map((x) => `<rect x="${x}" y="0" width="6" height="100" fill="${c2}"/>`).join('');
    case 'pinstripes': return [30, 36, 42, 48, 54, 60, 66].map((x) => `<rect x="${x}" y="0" width="1.6" height="100" fill="${c2}"/>`).join('');
    case 'hoops': return [22, 42, 62, 82].map((y) => `<rect x="0" y="${y}" width="100" height="10" fill="${c2}"/>`).join('');
    case 'halves': return `<rect x="50" y="0" width="50" height="100" fill="${c2}"/>`;
    case 'sash': return `<polygon points="25,30 38,22 78,92 64,100" fill="${c2}"/>`;
    case 'sleeves': return `<polygon points="0,0 30,0 30,100 0,100" fill="${c2}"/><polygon points="70,0 100,0 100,100 70,100" fill="${c2}"/>`;
    default: return '';
  }
}

// opts: { colors:{primary,secondary,pattern}, number, gk, size }
export function jersey({ colors, number = '', gk = false, size = 48 }) {
  const id = uid('j');
  const c1 = gk ? '#1b1b1b' : colors.primary;
  const c2 = gk ? '#3a3a3a' : colors.secondary;
  const pattern = gk ? 'plain' : colors.pattern;
  const fg = textOn(pattern === 'stripes' || pattern === 'halves' ? mix(c1, c2) : c1);
  const stroke = fg === '#fff' ? '#000' : '#fff';
  return `<svg class="jersey" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
<defs><clipPath id="${id}"><path d="${SHIRT}"/></clipPath>
<linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
<g clip-path="url(#${id})"><rect width="100" height="100" fill="${c1}"/>${kitPattern(pattern, c2)}<rect width="100" height="100" fill="url(#${id}g)"/></g>
<path d="M42 4 Q50 11 58 4" fill="none" stroke="${c2}" stroke-width="3"/>
<path d="${SHIRT}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/>
${number !== '' ? `<text x="50" y="66" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="32" fill="${fg}" stroke="${stroke}" stroke-width="1.2" paint-order="stroke">${number}</text>` : ''}
</svg>`;
}

function mix(a, b) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round((((pa >> s) & 255) + ((pb >> s) & 255)) / 2);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

const CREST_PATHS = {
  shield: 'M10 8 H90 V48 Q90 80 50 96 Q10 80 10 48 Z',
  badge: 'M50 4 L92 20 V56 Q92 82 50 96 Q8 82 8 56 V20 Z',
  round: 'M14 10 H86 Q92 10 92 16 V60 Q92 84 50 96 Q8 84 8 60 V16 Q8 10 14 10 Z',
};

function crestPattern(pattern, c2) {
  switch (pattern) {
    case 'halves': return `<rect x="50" y="0" width="50" height="100" fill="${c2}"/>`;
    case 'stripes': return [22, 42, 62, 82].map((x) => `<rect x="${x - 5}" y="0" width="10" height="100" fill="${c2}"/>`).join('');
    case 'chevron': return `<polygon points="0,40 50,70 100,40 100,58 50,88 0,58" fill="${c2}"/>`;
    case 'quarters': return `<rect x="50" y="0" width="50" height="50" fill="${c2}"/><rect x="0" y="50" width="50" height="50" fill="${c2}"/>`;
    case 'band': return `<rect x="0" y="36" width="100" height="28" fill="${c2}"/>`;
    default: return '';
  }
}

// crest: { shape, pattern, c1, c2, initials }
export function crest(c, size = 40) {
  const id = uid('c');
  const shape = c.shape === 'circle'
    ? '<circle cx="50" cy="50" r="45"/>'
    : `<path d="${CREST_PATHS[c.shape] || CREST_PATHS.shield}"/>`;
  const fs = c.initials.length >= 3 ? 24 : 30;
  // The initials sit on a white plate so they read on any pattern.
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
<defs><clipPath id="${id}">${shape}</clipPath></defs>
<g clip-path="url(#${id})"><rect width="100" height="100" fill="${c.c1}"/>${crestPattern(c.pattern, c.c2)}</g>
<g fill="none" stroke="#fff" stroke-width="6">${shape}</g>
<g fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5">${shape}</g>
<rect x="22" y="34" width="56" height="32" rx="5" fill="#fff" stroke="${c.c1}" stroke-width="3"/>
<text x="50" y="${50 + fs * 0.35}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${fs}" fill="${c.c1 === '#f4f4f4' ? c.c2 : c.c1}">${c.initials}</text>
</svg>`;
}

// flag: { layout, colors, emblem }
export function flag(f, w = 22) {
  const h = Math.round((w * 2) / 3);
  const [a, b, c] = f.colors;
  let body;
  switch (f.layout) {
    case 'vtri': body = `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`; break;
    case 'nordic': body = `<rect width="30" height="20" fill="${a}"/><rect x="8" width="6" height="20" fill="${b}"/><rect y="7" width="30" height="6" fill="${b}"/><rect x="9.5" width="3" height="20" fill="${c}"/><rect y="8.5" width="30" height="3" fill="${c}"/>`; break;
    case 'diag': body = `<rect width="30" height="20" fill="${b}"/><polygon points="0,0 22,0 0,20" fill="${a}"/><polygon points="30,0 30,20 8,20" fill="${c}"/>`; break;
    case 'hbi': body = `<rect width="30" height="10" fill="${a}"/><rect y="10" width="30" height="10" fill="${b}"/>`; break;
    // Real flags.
    case 'cross': body = `<rect width="30" height="20" fill="${a}"/><rect x="12.5" width="5" height="20" fill="${b}"/><rect y="7.5" width="30" height="5" fill="${b}"/>`; break;
    case 'esp': body = `<rect width="30" height="20" fill="${a}"/><rect y="5" width="30" height="10" fill="${b}"/>`; break;
    case 'htri': body = `<rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.67" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`; break;
    case 'cze': body = `<rect width="30" height="10" fill="${a}"/><rect y="10" width="30" height="10" fill="${b}"/><polygon points="0,0 15,10 0,20" fill="${c}"/>`; break;
    case 'hband': default: body = `<rect width="30" height="20" fill="${a}"/><rect y="5" width="30" height="10" fill="${b}"/>`;
  }
  const emblem = f.emblem ? `<circle cx="15" cy="10" r="3.4" fill="${f.emblem}"/>` : '';
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 30 20" preserveAspectRatio="none">${body}${emblem}</svg>`;
}

// A simple evening-stadium illustration in the club's colours.
export function stadiumArt(club, w = 280, h = 168) {
  const id = uid('s');
  const { primary, secondary } = club.colors;
  const big = club.stadium.capacity > 25000;
  const lights = [24, 256].map((x) => `<line x1="${x}" y1="18" x2="${x}" y2="70" stroke="#9fb3cc" stroke-width="2"/>
    <rect x="${x - 9}" y="10" width="18" height="9" rx="1" fill="#eef6ff"/><circle cx="${x}" cy="14" r="16" fill="url(#${id}l)"/>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 280 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
  <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1f4a"/><stop offset="1" stop-color="#2d5fa8"/></linearGradient>
  <radialGradient id="${id}l"><stop offset="0" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></radialGradient>
  <pattern id="${id}c" width="6" height="5" patternUnits="userSpaceOnUse"><rect width="6" height="5" fill="${primary}"/><circle cx="2" cy="2" r="1.1" fill="${secondary}" opacity=".8"/><circle cx="5" cy="4" r="1" fill="#f0d6b0" opacity=".6"/></pattern>
</defs>
<rect width="280" height="168" fill="url(#${id}s)"/>
${big ? `<polygon points="0,40 280,40 280,78 0,78" fill="url(#${id}c)"/><rect x="0" y="36" width="280" height="5" fill="#cfd8e6"/>` : ''}
<polygon points="0,${big ? 78 : 60} 280,${big ? 78 : 60} 280,112 0,112" fill="url(#${id}c)"/>
<rect x="0" y="${big ? 76 : 57}" width="280" height="4" fill="#e3e9f2"/>
<polygon points="34,112 246,112 280,168 0,168" fill="#2c9a3a"/>
<polygon points="61,112 88,112 66,168 30,168" fill="#33a943" opacity=".7"/><polygon points="140,112 165,112 175,168 135,168" fill="#33a943" opacity=".7"/>
<polygon points="215,112 240,112 270,168 228,168" fill="#33a943" opacity=".7"/>
<g fill="none" stroke="#e8f5e8" stroke-width="1.3" opacity=".85"><polygon points="40,114 240,114 272,166 8,166"/><line x1="140" y1="114" x2="140" y2="166"/><ellipse cx="140" cy="138" rx="26" ry="9"/></g>
${lights}
</svg>`;
}

const ICONS = {
  contract: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 12h6M9.5 15h6M9.5 18h4"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14c3.3-.6 6 1.5 6 4.5"/>',
  shirt: '<path d="M8 3 4 5.5 2.5 10l3 1.3V21h13v-9.7l3-1.3L20 5.5 16 3c-.6 1.6-2.2 2.5-4 2.5S8.6 4.6 8 3z"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  career: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  cart: '<path d="M2.5 4h3l2.3 11h11l2-8H7"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 3-1.5 4.8h-5L8 10.5z"/><path d="M12 3v4.5M20.5 9.5 16 10.5M17 19l-2.5-3.7M7 19l2.5-3.7M3.5 9.5 8 10.5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4c0 3 1.5 4.5 3.3 4.8M17 6h3c0 3-1.5 4.5-3.3 4.8"/><path d="M12 14v4M8 20.5h8"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 9h17M3.5 14h17M9 4v16"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><circle cx="12" cy="12" r="3"/><path d="M6 9v6M18 9v6"/>',
  save: '<path d="M4 4h13l3 3v13H4z"/><rect x="8" y="4" width="8" height="5"/><rect x="7" y="13" width="10" height="7"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  import: '<path d="M12 15V3M7 10l5 5 5-5"/><path d="M4 15v5h16v-5"/>',
  power: '<path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>',
  youth: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  chart: '<path d="M3.5 20.5h17"/><rect x="5" y="12" width="3.2" height="8.5"/><rect x="10.4" y="7" width="3.2" height="13.5"/><rect x="15.8" y="3.5" width="3.2" height="17"/>',
  stadium: '<ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9"/>',
};

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
