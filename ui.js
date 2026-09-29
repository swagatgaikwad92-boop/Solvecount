/* SolveCount — UI primitives: icons, overlays (sheets/screens/dialogs), toasts, controls */
import { el, motionLevel } from './utils.js';

/* ---------- icons (stroke, 24x24) ---------- */
const ICONS = {
  camera: '<path d="M4 8h3l1.5-2.2A1 1 0 0 1 9.4 5.4h5.2a1 1 0 0 1 .9.4L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6.2L10.5 21.5 19 10.5h-6.2z"/>',
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.4l2.8 1.8"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M8 3v4M16 3v4M4 10.5h16"/>',
  chart: '<path d="M6 20v-7M12 20V5M18 20v-10"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l4.6-4.6 3.5 3.5 3-3L20 16"/>',
  refresh: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>',
  trash: '<path d="M5 7h14M9.5 7V5h5v2M7 7l.9 12h8.2L17 7M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>',
  upload: '<path d="M12 16V5M7.5 9 12 4.5 16.5 9M5 20h14"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2H4.4zM10 20.5a2 2 0 0 0 4 0"/>',
  palette: '<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.8 1.4-1.8-.4-1 .2-2.2 1.4-2.2H17a3 3 0 0 0 3-3A8 8 0 0 0 12 4z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="11" r="1"/>',
  tag: '<path d="M4 12.5V5.5a1.5 1.5 0 0 1 1.5-1.5h7L20 11.5l-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="M11 17.5h2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  sortNew: '<path d="M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.4"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4M11 8.5v5M8.5 11h5"/>'
};

export function icon(name, size = 22, cls = '') {
  const span = document.createElement('span');
  span.className = `ico ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/* ---------- overlay stack with Android back-button support ---------- */
const stack = [];
const layer = () => document.getElementById('overlays');
let lastFocus = null;

function register(o) {
  stack.push(o);
  history.pushState({ sc: stack.length }, '');
  document.body.classList.add('has-overlay');
  lastFocus = lastFocus || document.activeElement;
}

function dispose(o) {
  o.node.classList.remove('is-open');
  o.node.classList.add('is-closing');
  const wait = motionLevel() === 'off' ? 0 : 280;
  setTimeout(() => o.node.remove(), wait);
  try { o.onClose?.(); } catch (e) { console.error(e); }
  if (!stack.length) {
    document.body.classList.remove('has-overlay');
    try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    lastFocus = null;
  }
}

window.addEventListener('popstate', () => {
  if (!stack.length) return;
  const o = stack.pop();
  dispose(o);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  if (top.dismissible !== false) closeOverlay(top);
});

export function closeOverlay(o) {
  if (!o || o.closing) return;
  o.closing = true;
  if (stack.includes(o)) history.back();
}

/** Close every open overlay (used after import/clear). */
export function closeAllOverlays() {
  [...stack].reverse().forEach(closeOverlay);
}

function openLayer(node, o) {
  o.node = node;
  layer().append(node);
  register(o);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-open')));
  const focusTarget = node.querySelector('[data-autofocus]') || node.querySelector('.ov-panel');
  setTimeout(() => focusTarget?.focus?.({ preventScroll: true }), 60);
  return o;
}

/** Register a custom-built overlay node (used by the photo viewer). */
export function openCustomLayer(node, o) {
  if (o.dismissible === undefined) o.dismissible = true;
  return openLayer(node, o);
}

/* ----- bottom sheet ----- */
export function openSheet(content, { title = '', onClose, dismissible = true, tall = false, className = '' } = {}) {
  const o = { onClose, dismissible };
  const closeBtn = el('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: () => closeOverlay(o) }, icon('x', 20));
  const grip = el('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  const titleEl = el('h2', { class: 'sheet-title' }, title);
  const head = el('header', { class: 'sheet-head' }, titleEl, dismissible ? closeBtn : null);
  const body = el('div', { class: 'sheet-body' }, content);
  const panel = el('section',
    { class: `ov-panel sheet glass ${tall ? 'is-tall' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog', tabindex: '-1' },
    grip, head, body);
  const scrim = el('div', { class: 'ov-scrim', onClick: () => dismissible && closeOverlay(o) });
  const node = el('div', { class: 'ov ov-sheet' }, scrim, panel);

  // drag down to dismiss (grip + header only)
  if (dismissible) {
    let startY = null; let dy = 0;
    const down = (ev) => { startY = ev.clientY; dy = 0; panel.style.transition = 'none'; ev.currentTarget.setPointerCapture?.(ev.pointerId); };
    const move = (ev) => { if (startY == null) return; dy = Math.max(0, ev.clientY - startY); panel.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      if (startY == null) return;
      panel.style.transition = ''; panel.style.transform = '';
      if (dy > 110) closeOverlay(o);
      startY = null;
    };
    for (const h of [grip, titleEl]) {
      h.style.touchAction = 'none';
      h.addEventListener('pointerdown', down);
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    }
  }
  openLayer(node, o);
  o.body = body;
  o.panel = panel;
  o.setTitle = (t) => { titleEl.textContent = t; };
  return o;
}

/* ----- full screen (pushed) ----- */
export function openScreen({ title = '', actions = [], build, onClose, className = '' }) {
  const o = { onClose };
  const back = el('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: () => closeOverlay(o) }, icon('left', 22));
  const titleEl = el('h1', { class: 'screen-title' }, title);
  const head = el('header', { class: 'screen-head' }, back, titleEl, el('div', { class: 'screen-actions' }, actions));
  const body = el('div', { class: 'screen-body' });
  const panel = el('section', { class: `ov-panel screen ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, head, body);
  const node = el('div', { class: 'ov ov-screen' }, panel);
  openLayer(node, o);
  o.body = body;
  o.panel = panel;
  o.setTitle = (t) => { titleEl.textContent = t; };
  o.setActions = (list) => { const box = head.querySelector('.screen-actions'); box.replaceChildren(...list); };
  build?.(body, o);
  return o;
}

/* ----- confirm dialog ----- */
export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const o = { dismissible: true, onClose: () => resolve(result) };
    const done = (v) => { result = v; closeOverlay(o); };
    const panel = el('section', { class: 'ov-panel dialog glass', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
      el('h2', { class: 'dialog-title' }, title),
      message ? el('p', { class: 'dialog-msg' }, message) : null,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', 'data-autofocus': '', onClick: () => done(false) }, cancelText),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => done(true) }, confirmText)));
    const scrim = el('div', { class: 'ov-scrim', onClick: () => done(false) });
    openLayer(el('div', { class: 'ov ov-dialog' }, scrim, panel), o);
  });
}

/* ----- info dialog (no alert()) ----- */
export function infoDialog({ title, message, okText = 'Got it' }) {
  return new Promise((resolve) => {
    const o = { dismissible: true, onClose: resolve };
    const panel = el('section', { class: 'ov-panel dialog glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
      el('h2', { class: 'dialog-title' }, title),
      el('p', { class: 'dialog-msg' }, message),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-primary', 'data-autofocus': '', onClick: () => closeOverlay(o) }, okText)));
    const scrim = el('div', { class: 'ov-scrim', onClick: () => closeOverlay(o) });
    openLayer(el('div', { class: 'ov ov-dialog' }, scrim, panel), o);
  });
}

/* ---------- toasts ---------- */
let toastTimer = null;
export function toast(message, { action, duration = 3600, tone = '' } = {}) {
  const host = document.getElementById('toasts');
  host.replaceChildren();
  clearTimeout(toastTimer);
  const node = el('div', { class: `toast glass ${tone}`, role: 'status' },
    el('span', { class: 'toast-msg' }, message),
    action ? el('button', {
      class: 'toast-action',
      onClick: () => { clearTimeout(toastTimer); node.remove(); action.onClick(); }
    }, action.label) : null);
  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  toastTimer = setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 300);
  }, duration);
}

/* ---------- controls ---------- */
export function segmented({ options, value, onChange, label }) {
  const wrap = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || '' });
  const buttons = options.map((opt) => {
    const b = el('button', {
      type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(opt.value === value),
      dataset: { value: opt.value },
      onClick: () => { set(opt.value); onChange?.(opt.value); }
    }, opt.label);
    return b;
  });
  const set = (v) => {
    buttons.forEach((b) => {
      const on = b.dataset.value === String(v);
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
    });
  };
  wrap.append(...buttons);
  set(value);
  wrap.set = set;
  return wrap;
}

export function toggle({ checked, onChange, label }) {
  const b = el('button', {
    type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label || ''
  }, el('span', { class: 'switch-knob' }));
  const set = (v) => { b.setAttribute('aria-checked', String(!!v)); };
  b.addEventListener('click', async () => {
    const next = b.getAttribute('aria-checked') !== 'true';
    const accepted = await onChange?.(next);
    if (accepted !== false) set(next);
  });
  b.set = set;
  return b;
}

export function slider({ min = 0, max = 100, step = 1, value, onInput, label }) {
  const input = el('input', { type: 'range', class: 'range', min, max, step, value, 'aria-label': label || '' });
  const paint = () => input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
  input.addEventListener('input', () => { paint(); onInput?.(Number(input.value)); });
  paint();
  return input;
}

/** Colored subject chip: emoji in a tinted disc + name. */
export function subjectDot(subject, size = 34) {
  return el('span', {
    class: 'sdot', style: { '--c': subject.color, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.52)}px` }
  }, subject.emoji);
}
