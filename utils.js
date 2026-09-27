/* SolveCount — small shared helpers */

export const APP_VERSION = '1.0.0';

/* ---------- DOM ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function appendKids(node, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    node.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

/** Tiny hyperscript helper: el('button', {class:'x', onClick: fn}, 'Label') */
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) n.style.setProperty(sk, sv);
        else n.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'for') n.htmlFor = v;
    else if (k in n && typeof v !== 'object') {
      try { n[k] = v; } catch { n.setAttribute(k, v); }
    } else n.setAttribute(k, v === true ? '' : v);
  }
  appendKids(n, kids);
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mountInto(node, ...kids) {
  clear(node);
  appendKids(node, kids);
  return node;
}

/* ---------- events ---------- */
const listeners = new Map();
export const bus = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  },
  emit(name, data) {
    listeners.get(name)?.forEach((fn) => {
      try { fn(data); } catch (err) { console.error(err); }
    });
  }
};

/* ---------- dates (local time, YYYY-MM-DD keys) ---------- */
export const pad = (n) => String(n).padStart(2, '0');

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

/** Monday of the week containing `key`. */
export function weekStart(key) {
  const d = parseDay(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return dayKey(d.getTime());
}

export function monthKey(key) { return key.slice(0, 7); }

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDay(key).toLocaleDateString([], opts);
}

export function fmtLongDay(key) {
  return parseDay(key).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ---------- misc ---------- */
export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function fmtNumber(n) {
  return Number(n).toLocaleString();
}

export function firstGrapheme(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const part of seg.segment(s)) return part.segment;
  }
  return Array.from(s)[0];
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function motionLevel() {
  return document.documentElement.dataset.motion || 'full';
}

export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
