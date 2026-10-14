// IndexedDB storage for save games (localStorage's ~5 MB cap is too small for
// long careers). Values are serialized JSON strings, compressed (see put).

const DB = 'touchline-manager';
const STORE = 'saves';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

// Values are stored gzip-compressed where the browser can (CompressionStream:
// Safari 16.4+, Chrome, Edge): a 20 MB save takes a few MB. Older entries
// (plain strings) still load.
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function zip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { gz: await new Response(stream).arrayBuffer() };
}

async function unzip(value) {
  const stream = new Blob([value.gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function put(key, text) {
  const value = canZip ? await zip(text) : text;
  return tx('readwrite', (s) => s.put(value, key));
}

export async function get(key) {
  const value = await tx('readonly', (s) => s.get(key));
  return value && typeof value === 'object' && value.gz ? unzip(value) : value;
}
export const remove = (key) => tx('readwrite', (s) => s.delete(key));

// The stored value as it is (compressed or not), for copying saves to backups.
export const getRaw = (key) => tx('readonly', (s) => s.get(key));
export const putRaw = (key, value) => tx('readwrite', (s) => s.put(value, key));

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => resolve(input.files[0] ? await input.files[0].text() : null);
    input.click();
  });
}
