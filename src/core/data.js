// Static game data: nations, formations, kit colours.

import { REAL_NATIONS } from './realworld.js';

export const GAME_VERSION = 13;
export const START_YEAR = 2026;

// New careers are played in the real-country world (see realworld.js).
export const NATIONS = REAL_NATIONS;

// The original fictional world (kept for reference; older saves carry their
// own nations and keep playing in them).
export const FICTIONAL_NATIONS = [
  {
    id: 'VAL', name: 'Valdoria', adj: 'Valdorian', style: 'romance', strength: 0,
    flag: { layout: 'hband', colors: ['#7a1f3d', '#f2e3c6', '#7a1f3d'], emblem: '#d4a017' },
    leagues: ['Liga Valdora', 'Liga Valdora Segunda'], cup: 'Coppa Valdora', sizes: [18, 18],
  },
  {
    id: 'SKA', name: 'Skarnland', adj: 'Skarnish', style: 'nordic', strength: -3,
    flag: { layout: 'nordic', colors: ['#3a2f6b', '#ececec', '#e07a1f'] },
    leagues: ['Skarnligaen', 'Skarn First Division'], cup: 'Skarn Cup', sizes: [16, 16],
  },
  {
    id: 'BRV', name: 'Brevania', adj: 'Brevan', style: 'slavic', strength: -5,
    flag: { layout: 'diag', colors: ['#123c69', '#f4f4f4', '#d1495b'] },
    leagues: ['Brevan First League', 'Brevan Second League'], cup: 'Brevan Cup', sizes: [18, 16],
  },
  // Nations without a playable league (yet). They only supply foreign players.
  { id: 'KES', name: 'Kesmar', adj: 'Kesmari', style: 'west', strength: -6,
    flag: { layout: 'vtri', colors: ['#e0a526', '#1d6b45', '#e0a526'], emblem: '#c0392b' } },
  { id: 'ISL', name: 'Isloria', adj: 'Islorian', style: 'anglo', strength: -4,
    flag: { layout: 'hbi', colors: ['#1a4d8f', '#f2f2f2'], emblem: '#d62828' } },
];

// Pitch coordinates for "My Team": x 0..100 left to right, y 0..100 from the
// opponent's goal (top) to our own goal (bottom).
const BACK4 = [['LB', 12, 72], ['CB', 37, 77], ['CB', 63, 77], ['RB', 88, 72]];
export const FORMATIONS = {
  '4-4-2': [['GK', 50, 93], ...BACK4, ['LM', 12, 45], ['CM', 37, 50], ['CM', 63, 50], ['RM', 88, 45],
    ['ST', 35, 18], ['ST', 65, 18]],
  '4-3-3': [['GK', 50, 93], ...BACK4, ['CM', 25, 50], ['CM', 50, 54], ['CM', 75, 50],
    ['LW', 15, 22], ['ST', 50, 15], ['RW', 85, 22]],
  '4-5-1': [['GK', 50, 93], ...BACK4, ['LM', 10, 44], ['CM', 30, 51], ['CM', 50, 55], ['CM', 70, 51],
    ['RM', 90, 44], ['ST', 50, 17]],
  '3-5-2': [['GK', 50, 93], ['CB', 25, 76], ['CB', 50, 78], ['CB', 75, 76], ['LM', 8, 50], ['CM', 30, 52],
    ['CM', 50, 56], ['CM', 70, 52], ['RM', 92, 50], ['ST', 35, 18], ['ST', 65, 18]],
  '5-3-2': [['GK', 50, 93], ['LWB', 8, 64], ['CB', 28, 76], ['CB', 50, 78], ['CB', 72, 76], ['RWB', 92, 64],
    ['CM', 28, 47], ['CM', 50, 51], ['CM', 72, 47], ['ST', 35, 18], ['ST', 65, 18]],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

export const ROLE_POS = {
  GK: 'G', CB: 'D', LB: 'D', RB: 'D', LWB: 'D', RWB: 'D',
  CM: 'M', LM: 'M', RM: 'M', DM: 'M', AM: 'M', ST: 'F', LW: 'F', RW: 'F',
};

export const PLAY_STYLES = ['normal', 'passing', 'crosses', 'through'];
export const PLAY_STYLE_LABELS = { normal: 'Normal', passing: 'Passing', crosses: 'Crosses', through: 'Through-balls' };

export const KIT_COLORS = ['#c8102e', '#7b1e2b', '#1f4fbf', '#13254f', '#6cb4ee', '#1b8a3a', '#0f5132', '#f5c400',
  '#ef7d00', '#f4f4f4', '#1b1b1b', '#5b2a86', '#0f8b8d', '#9aa0a6', '#d94f8a'];
export const KIT_PATTERNS = ['plain', 'plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves', 'pinstripes'];
export const CREST_SHAPES = ['shield', 'circle', 'badge', 'shield', 'round'];
export const CREST_PATTERNS = ['plain', 'halves', 'stripes', 'chevron', 'quarters', 'band'];

export const SQUAD_TEMPLATE = ['G', 'G', 'G', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'M', 'M', 'M', 'M',
  'M', 'F', 'F', 'F', 'F', 'F', 'F'];
