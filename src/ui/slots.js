// Career save slots in this browser: three slots, each with the last two
// weekly backups. Slot 1 uses the key of the old single save, so careers from
// before the slots appear there.
//
// A small summary of every slot (club, season, date...) is kept under its own
// key, so the Load screen doesn't have to unpack whole saves.

import * as storage from './storage.js';
import { deserialize } from '../core/save.js';

export const SLOTS = [1, 2, 3];
// Tests use their own keys, so running them never touches real careers.
let NS = '';
export const setNamespace = (ns) => { NS = ns; };
const META = () => `${NS}slots-meta`;
const BACKUPS = 2;
// A new backup is taken when the newest one is a week (of game time) old.
const BACKUP_DAYS = 7;

export const slotKey = (n) => NS + (n === 1 ? 'career' : `career-${n}`);
export const backupKey = (n, i) => `${slotKey(n)}-bak${i + 1}`;

export function summarize(game) {
  const club = game.clubs[game.userClubId];
  return {
    club: club?.name || 'Unemployed',
    crest: club?.crest || null,
    manager: game.manager?.name || '',
    year: game.season.year,
    day: game.day,
    savedAt: new Date().toISOString(),
  };
}

async function readMeta() {
  try {
    const text = await storage.get(META());
    return text ? JSON.parse(text) : {};
  } catch { return {}; }
}
const writeMeta = (meta) => storage.put(META(), JSON.stringify(meta));

// Every slot's summary ({ [n]: { ...summary, backups: [summary] } } with
// `last`: the slot saved last). Saves without a summary (from before the
// slots) are read once to make one.
export async function listSlots() {
  const meta = await readMeta();
  let changed = false;
  for (const n of SLOTS) {
    if (meta[n]) continue;
    const text = await storage.get(slotKey(n)).catch(() => null);
    if (!text) continue;
    try {
      meta[n] = { ...summarize(deserialize(text)), savedAt: null, backups: [] };
    } catch {
      meta[n] = { club: 'Unreadable save', year: '', day: 0, savedAt: null, backups: [] };
    }
    if (!meta.last) meta.last = n;
    changed = true;
  }
  if (changed) await writeMeta(meta);
  return meta;
}

export const freeSlot = (meta) => SLOTS.find((n) => !meta[n]) || null;

// Saves into slot n; the save it replaces becomes the newest backup when the
// last backup is a week old (or from another career). force: always back up.
export async function writeSlot(n, game, text, { force = false } = {}) {
  const meta = await readMeta();
  const cur = meta[n];
  const backups = cur?.backups || [];
  const newest = backups[0];
  const due = force || !newest || game.day - newest.day >= BACKUP_DAYS || newest.day > game.day || newest.year > game.season.year;
  if (cur && due) {
    const old = await storage.getRaw(slotKey(n));
    if (old) {
      for (let i = BACKUPS - 1; i > 0; i--) {
        const prev = await storage.getRaw(backupKey(n, i - 1));
        if (prev) await storage.putRaw(backupKey(n, i), prev);
      }
      await storage.putRaw(backupKey(n, 0), old);
      const { backups: _drop, ...info } = cur;
      backups.unshift(info);
      backups.length = Math.min(backups.length, BACKUPS);
    }
  }
  await storage.put(slotKey(n), text);
  meta[n] = { ...summarize(game), backups };
  meta.last = n;
  await writeMeta(meta);
}

export const readSlot = (n) => storage.get(slotKey(n));
export const readBackup = (n, i) => storage.get(backupKey(n, i));

export async function deleteSlot(n) {
  await storage.remove(slotKey(n));
  for (let i = 0; i < BACKUPS; i++) await storage.remove(backupKey(n, i));
  const meta = await readMeta();
  delete meta[n];
  if (meta.last === n) meta.last = SLOTS.find((x) => meta[x]) || null;
  await writeMeta(meta);
}
