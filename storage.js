/* SolveCount — IndexedDB storage
 *
 * Stores
 *   entries   one record per solved question (id, ts, day, subjectId, difficulty, photoId, kind)
 *   photos    compressed proof images (blobs)
 *   thumbs    small thumbnails for fast lists
 *   subjects  customizable subjects
 *   settings  key/value (appearance, goals, streak cache, reminders…)
 *   daily     per-day totals and subject breakdown (kept in sync with entries)
 */

const DB_NAME = 'solvecount';
const DB_VERSION = 1;
let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const entries = db.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('day', 'day');
      entries.createIndex('ts', 'ts');
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('thumbs', { keyPath: 'id' });
      db.createObjectStore('subjects', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('daily', { keyPath: 'day' });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another tab.'));
  });
  return dbPromise;
}

const wrap = (r) => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

/** Run fn inside one transaction. fn must only await IndexedDB requests. */
async function tx(names, mode, fn) {
  const db = await open();
  const list = [].concat(names);
  const t = db.transaction(list, mode);
  const done = new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  });
  const out = await fn(...list.map((n) => t.objectStore(n)));
  await done;
  return out;
}

/* ---------- defaults ---------- */
export const DEFAULT_SUBJECTS = [
  { id: 'maths', name: 'Maths', color: '#8b6bff', emoji: '📐' },
  { id: 'physics', name: 'Physics', color: '#3fa4ff', emoji: '⚛️' },
  { id: 'chemistry', name: 'Chemistry', color: '#2fd48f', emoji: '🧪' },
  { id: 'biology', name: 'Biology', color: '#ff7eb6', emoji: '🧬' },
  { id: 'english', name: 'English', color: '#ffb84d', emoji: '📖' },
  { id: 'other', name: 'Other', color: '#9aa4c7', emoji: '✨' }
].map((s, i) => ({ ...s, order: i, deleted: false }));

export async function ensureSubjects() {
  const existing = await getSubjects();
  if (existing.length) return existing;
  await putSubjects(DEFAULT_SUBJECTS);
  return DEFAULT_SUBJECTS;
}

/* ---------- subjects ---------- */
export const getSubjects = () => tx('subjects', 'readonly', (S) => wrap(S.getAll()));

export const putSubjects = (list) =>
  tx('subjects', 'readwrite', async (S) => { for (const s of list) S.put(s); });

/* ---------- settings ---------- */
export async function getSettings() {
  const rows = await tx('settings', 'readonly', (S) => wrap(S.getAll()));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const setSetting = (key, value) =>
  tx('settings', 'readwrite', (S) => wrap(S.put({ key, value })));

/* ---------- daily ---------- */
export const getDaily = () => tx('daily', 'readonly', (D) => wrap(D.getAll()));

/* ---------- entries ---------- */
/** entry: {id, ts, day, subjectId, difficulty, photoId|null, kind}. photo: {blob, thumb, w, h}|null */
export function addEntry(entry, photo) {
  return tx(['entries', 'photos', 'thumbs', 'daily'], 'readwrite', async (E, P, T, D) => {
    if (photo) {
      await wrap(P.put({ id: entry.photoId, blob: photo.blob, w: photo.w, h: photo.h }));
      await wrap(T.put({ id: entry.photoId, blob: photo.thumb }));
    }
    await wrap(E.put(entry));
    const cur = (await wrap(D.get(entry.day))) || { day: entry.day, total: 0, proof: 0, by: {} };
    cur.total += 1;
    if (entry.photoId) cur.proof += 1;
    cur.by[entry.subjectId] = (cur.by[entry.subjectId] || 0) + 1;
    await wrap(D.put(cur));
  });
}

export function deleteEntry(id) {
  return tx(['entries', 'photos', 'thumbs', 'daily'], 'readwrite', async (E, P, T, D) => {
    const e = await wrap(E.get(id));
    if (!e) return null;
    await wrap(E.delete(id));
    if (e.photoId) { await wrap(P.delete(e.photoId)); await wrap(T.delete(e.photoId)); }
    const cur = await wrap(D.get(e.day));
    if (cur) {
      cur.total = Math.max(0, cur.total - 1);
      if (e.photoId) cur.proof = Math.max(0, (cur.proof || 0) - 1);
      cur.by[e.subjectId] = Math.max(0, (cur.by[e.subjectId] || 0) - 1);
      if (!cur.by[e.subjectId]) delete cur.by[e.subjectId];
      if (cur.total === 0) await wrap(D.delete(e.day));
      else await wrap(D.put(cur));
    }
    return e;
  });
}

export function updateEntrySubject(id, subjectId) {
  return tx(['entries', 'daily'], 'readwrite', async (E, D) => {
    const e = await wrap(E.get(id));
    if (!e || e.subjectId === subjectId) return e;
    const cur = await wrap(D.get(e.day));
    if (cur) {
      cur.by[e.subjectId] = Math.max(0, (cur.by[e.subjectId] || 0) - 1);
      if (!cur.by[e.subjectId]) delete cur.by[e.subjectId];
      cur.by[subjectId] = (cur.by[subjectId] || 0) + 1;
      await wrap(D.put(cur));
    }
    e.subjectId = subjectId;
    await wrap(E.put(e));
    return e;
  });
}

export async function getEntriesForDay(day) {
  const list = await tx('entries', 'readonly', (E) => wrap(E.index('day').getAll(day)));
  return list.sort((a, b) => a.ts - b.ts);
}

export function getRecentProofs(limit = 10) {
  return tx('entries', 'readonly', (E) => new Promise((resolve, reject) => {
    const out = [];
    let scanned = 0;
    const req = E.index('ts').openCursor(null, 'prev');
    req.onsuccess = () => {
      const c = req.result;
      if (!c || out.length >= limit || scanned > 600) return resolve(out);
      scanned += 1;
      if (c.value.photoId) out.push(c.value);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  }));
}

export const getPhoto = (id) => tx('photos', 'readonly', (P) => wrap(P.get(id)));

/** Thumbnails for many photo ids at once → Map(id → Blob) */
export async function getThumbs(ids) {
  const list = await tx('thumbs', 'readonly', async (T) => {
    const out = [];
    for (const id of ids) out.push(await wrap(T.get(id)));
    return out;
  });
  return new Map(list.filter(Boolean).map((t) => [t.id, t.blob]));
}

export const countPhotos = () => tx('photos', 'readonly', (P) => wrap(P.count()));

/* ---------- export / import / clear ---------- */
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

export async function exportBackup(onProgress) {
  const [subjects, settings, entries, daily] = await Promise.all([
    getSubjects(),
    getSettings(),
    tx('entries', 'readonly', (E) => wrap(E.getAll())),
    getDaily()
  ]);
  const head = JSON.stringify({
    app: 'SolveCount',
    format: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    settings,
    entries,
    daily
  });
  const parts = [head.slice(0, -1), ',"photos":['];
  const ids = await tx('photos', 'readonly', (P) => wrap(P.getAllKeys()));
  let i = 0;
  for (const id of ids) {
    const p = await getPhoto(id);
    if (!p) continue;
    const item = { id, w: p.w, h: p.h, data: await blobToDataURL(p.blob) };
    parts.push((i ? ',' : '') + JSON.stringify(item));
    i += 1;
    onProgress?.(i / ids.length);
  }
  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}

export function validateBackup(obj) {
  if (!obj || obj.app !== 'SolveCount' || !Array.isArray(obj.entries) || !Array.isArray(obj.subjects)) {
    throw new Error('This file is not a SolveCount backup.');
  }
  return {
    entries: obj.entries.length,
    photos: Array.isArray(obj.photos) ? obj.photos.length : 0,
    subjects: obj.subjects.length
  };
}

function rebuildDaily(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = map.get(e.day) || { day: e.day, total: 0, proof: 0, by: {} };
    d.total += 1;
    if (e.photoId) d.proof += 1;
    d.by[e.subjectId] = (d.by[e.subjectId] || 0) + 1;
    map.set(e.day, d);
  }
  return [...map.values()];
}

export async function importBackup(obj) {
  validateBackup(obj);
  const photoRecords = [];
  for (const p of obj.photos || []) {
    try {
      photoRecords.push({ id: p.id, w: p.w, h: p.h, blob: await dataURLToBlob(p.data) });
    } catch (err) { console.warn('Skipped a photo during import', err); }
  }
  const photoIds = new Set(photoRecords.map((p) => p.id));
  const entries = obj.entries
    .filter((e) => e && e.id && e.ts && e.day && e.subjectId)
    .map((e) => ({ ...e, photoId: e.photoId && photoIds.has(e.photoId) ? e.photoId : null }));
  const subjects = obj.subjects.length ? obj.subjects : DEFAULT_SUBJECTS;
  const settings = obj.settings || {};

  // thumbnails are rebuilt from the photos (backups stay small)
  const thumbRecords = [];
  for (const p of photoRecords) {
    try {
      const bmp = await createImageBitmap(p.blob);
      const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.7));
      thumbRecords.push({ id: p.id, blob: blob || p.blob });
    } catch { thumbRecords.push({ id: p.id, blob: p.blob }); }
  }

  await tx(['entries', 'photos', 'thumbs', 'subjects', 'settings', 'daily'], 'readwrite',
    async (E, P, TH, S, T, D) => {
      await Promise.all([E.clear(), P.clear(), TH.clear(), S.clear(), T.clear(), D.clear()].map(wrap));
      for (const e of entries) E.put(e);
      for (const p of photoRecords) P.put(p);
      for (const t of thumbRecords) TH.put(t);
      for (const s of subjects) S.put(s);
      for (const [key, value] of Object.entries(settings)) T.put({ key, value });
      for (const d of rebuildDaily(entries)) D.put(d);
    });
  return { entries: entries.length, photos: photoRecords.length };
}

export async function clearEverything() {
  await tx(['entries', 'photos', 'thumbs', 'subjects', 'settings', 'daily'], 'readwrite',
    async (E, P, TH, S, T, D) => {
      await Promise.all([E.clear(), P.clear(), TH.clear(), S.clear(), T.clear(), D.clear()].map(wrap));
      for (const s of DEFAULT_SUBJECTS) S.put(s);
    });
}

export async function storageInfo() {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch { /* ignore */ }
  return null;
}

export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
