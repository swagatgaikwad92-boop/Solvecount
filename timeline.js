/* SolveCount — proof timeline (one day) + full-screen proof viewer */
import { el, clear, mountInto, bus, fmtTime, fmtDay, plural } from './utils.js';
import * as db from './storage.js';
import { state, subjectOf, setting, put, removeQuestion } from './state.js';
import { openScreen, openSheet, openCustomLayer, closeOverlay, confirmDialog, icon, toast, subjectDot } from './ui.js';
import { createMascot, moodFor } from './mascot.js';

const GAP_MS = 30 * 60 * 1000;
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/* ---------- grouping ---------- */
/** Consecutive entries of the same subject, within 30 minutes of each other, become one timeline row. */
export function groupEntries(entries) {
  const groups = [];
  for (const e of entries) {
    const g = groups[groups.length - 1];
    if (g && g.subjectId === e.subjectId && e.ts - g.end <= GAP_MS) {
      g.entries.push(e);
      g.end = e.ts;
    } else {
      groups.push({ subjectId: e.subjectId, start: e.ts, end: e.ts, entries: [e] });
    }
  }
  for (const g of groups) g.proofs = g.entries.filter((e) => e.photoId);
  return groups;
}

/* ---------- thumbnail URL helper ---------- */
export async function loadThumbURLs(entries) {
  const ids = entries.filter((e) => e.photoId).map((e) => e.photoId);
  const blobs = await db.getThumbs(ids);
  const urls = new Map();
  for (const [id, blob] of blobs) urls.set(id, URL.createObjectURL(blob));
  return {
    urls,
    dispose() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); }
  };
}

export function diffPill(difficulty) {
  if (!difficulty) return null;
  return el('span', { class: `diff-pill ${difficulty}` }, DIFF_LABEL[difficulty] || difficulty);
}

/* ---------- viewer ---------- */
export function openViewer(list, startIndex = 0) {
  let items = [...list];
  let i = Math.min(Math.max(0, startIndex), items.length - 1);
  let currentURL = null;
  let zoomed = false;
  let token = 0;

  const img = el('img', { class: 'viewer-img', alt: 'Proof photo', draggable: false });
  const stage = el('div', { class: 'viewer-stage' }, img);
  const counter = el('span', { class: 'viewer-count' });
  const meta = el('div', { class: 'viewer-meta glass' });
  const prev = el('button', { class: 'icon-btn viewer-nav prev', 'aria-label': 'Previous photo', onClick: () => go(-1) }, icon('left', 24));
  const next = el('button', { class: 'icon-btn viewer-nav next', 'aria-label': 'Next photo', onClick: () => go(1) }, icon('right', 24));

  const o = { onClose: () => { if (currentURL) URL.revokeObjectURL(currentURL); } };
  const closeBtn = el('button', { class: 'icon-btn glass-btn', 'aria-label': 'Close viewer', onClick: () => closeOverlay(o) }, icon('x', 22));
  const delBtn = el('button', { class: 'icon-btn glass-btn', 'aria-label': 'Delete this question', onClick: remove }, icon('trash', 20));
  const top = el('header', { class: 'viewer-top' }, closeBtn, counter, delBtn);
  const panel = el('section', { class: 'ov-panel viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Proof photo', tabindex: '-1' },
    top, stage, prev, next, meta);
  const node = el('div', { class: 'ov ov-viewer' }, panel);

  const handle = openCustomLayer(node, o);

  function go(d) {
    if (items.length < 2) return;
    setZoom(false);
    show((i + d + items.length) % items.length);
  }

  function setZoom(on, ev) {
    zoomed = on;
    stage.classList.toggle('is-zoomed', on);
    if (on && ev) {
      const r = img.getBoundingClientRect();
      requestAnimationFrame(() => {
        const fx = (ev.clientX - r.left) / r.width;
        const fy = (ev.clientY - r.top) / r.height;
        stage.scrollLeft = fx * img.scrollWidth - stage.clientWidth / 2;
        stage.scrollTop = fy * img.scrollHeight - stage.clientHeight / 2;
      });
    }
  }

  async function show(k) {
    i = k;
    const entry = items[i];
    const my = ++token;
    counter.textContent = `${i + 1} / ${items.length}`;
    prev.hidden = next.hidden = items.length < 2;
    const s = subjectOf(entry.subjectId);
    mountInto(meta,
      el('span', { class: 'viewer-subj', style: { '--c': s.color } }, subjectDot(s, 30), el('b', {}, s.name)),
      diffPill(entry.difficulty),
      el('span', { class: 'viewer-when' }, `${fmtDay(entry.day)} · ${fmtTime(entry.ts)}`));
    const photo = await db.getPhoto(entry.photoId);
    if (my !== token) return;
    const url = photo ? URL.createObjectURL(photo.blob) : '';
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = url;
    img.src = url;
  }

  async function remove() {
    const entry = items[i];
    const yes = await confirmDialog({
      title: 'Delete this question?',
      message: 'The photo is removed and today’s count goes down by one.',
      confirmText: 'Delete', danger: true
    });
    if (!yes) return;
    await removeQuestion(entry.id);
    items.splice(i, 1);
    toast('Question removed');
    if (!items.length) { closeOverlay(o); return; }
    show(Math.min(i, items.length - 1));
  }

  // tap to zoom, swipe to change photo
  let sx = null; let sy = 0; let moved = false;
  stage.addEventListener('pointerdown', (ev) => { sx = ev.clientX; sy = ev.clientY; moved = false; });
  stage.addEventListener('pointermove', (ev) => {
    if (sx != null && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) moved = true;
  });
  stage.addEventListener('pointerup', (ev) => {
    if (sx == null) return;
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    sx = null;
    if (!zoomed && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { go(dx < 0 ? 1 : -1); return; }
    if (!moved) setZoom(!zoomed, ev);
  });
  document.addEventListener('keydown', keyNav);
  const origClose = o.onClose;
  o.onClose = () => { document.removeEventListener('keydown', keyNav); origClose(); };
  function keyNav(ev) {
    if (ev.key === 'ArrowLeft') go(-1);
    if (ev.key === 'ArrowRight') go(1);
  }

  show(i);
  return handle;
}

/* ---------- day screen ---------- */
export function openDayScreen(day) {
  let disposeThumbs = null;
  let renderToken = 0;
  const isToday = () => day === state.today;

  const orderBtn = el('button', {
    class: 'icon-btn', 'aria-label': 'Reverse order', onClick: async () => {
      await put('timelineOrder', setting('timelineOrder') === 'asc' ? 'desc' : 'asc');
      toast(setting('timelineOrder') === 'asc' ? 'Oldest first' : 'Newest first', { duration: 1400 });
    }
  }, icon('sortNew', 22));

  let unsub = () => {};
  const screen = openScreen({
    title: isToday() ? 'Today' : fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' }),
    actions: [orderBtn],
    className: 'day-screen',
    onClose: () => { unsub(); disposeThumbs?.dispose(); },
    build: (body) => {
      const render = async () => {
        const my = ++renderToken;
        const entries = await db.getEntriesForDay(day);
        if (my !== renderToken) return;
        const thumbs = await loadThumbURLs(entries);
        if (my !== renderToken) { thumbs.dispose(); return; }
        disposeThumbs?.dispose();
        disposeThumbs = thumbs;
        draw(body, day, entries, thumbs);
        screen.setTitle(isToday() ? 'Today' : fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' }));
      };
      render();
      const offs = [bus.on('state', render), bus.on('setting', (k) => { if (k === 'timelineOrder') render(); })];
      unsub = () => offs.forEach((f) => f());
    }
  });
  return screen;
}

function draw(body, day, entries, thumbs) {
  clear(body);
  const total = entries.length;
  const by = {};
  for (const e of entries) by[e.subjectId] = (by[e.subjectId] || 0) + 1;
  const proofCount = entries.filter((e) => e.photoId).length;

  // header numbers
  body.append(el('section', { class: 'day-summary' },
    el('div', { class: 'day-total' }, String(total)),
    el('div', { class: 'day-total-label' }, `${total === 1 ? 'question' : 'questions'} · ${plural(proofCount, 'proof photo')}`),
    Object.keys(by).length ? el('div', { class: 'day-chips' },
      Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
        const s = subjectOf(id);
        return el('span', { class: 'mini-chip', style: { '--c': s.color } }, el('span', {}, s.emoji), ` ${s.name} `, el('b', {}, String(n)));
      })) : null));

  if (!total) {
    const host = el('div', { class: 'pip-mini' });
    body.append(el('div', { class: 'empty' }, host,
      el('p', { class: 'empty-title' }, day === state.today ? 'Nothing here yet' : 'Nothing logged this day'),
      el('p', { class: 'empty-sub' }, day === state.today ? 'Your study trail starts with one question.' : 'Days without a count are just rest days.')));
    createMascot(host).setMood(moodFor(0));
    return;
  }

  let groups = groupEntries(entries);
  if (setting('timelineOrder') === 'desc') groups = groups.reverse();

  const list = el('ol', { class: 'tl' });
  const proofsAll = entries.filter((e) => e.photoId);
  for (const g of groups) {
    const s = subjectOf(g.subjectId);
    const quickN = g.entries.length - g.proofs.length;
    const thumbRow = g.proofs.length ? el('div', { class: 'tl-thumbs' },
      g.proofs.slice(0, 6).map((e, idx) => el('button', {
        class: 'thumb', 'aria-label': `Open proof photo ${idx + 1}`,
        onClick: () => openViewer(proofsAll, proofsAll.indexOf(e))
      }, thumbs.urls.get(e.photoId) ? el('img', { src: thumbs.urls.get(e.photoId), alt: '', loading: 'lazy' }) : null,
      e.difficulty ? el('i', { class: `thumb-diff ${e.difficulty}`, title: DIFF_LABEL[e.difficulty] }) : null)),
      g.proofs.length > 6 ? el('button', { class: 'thumb thumb-more', onClick: () => openViewer(proofsAll, proofsAll.indexOf(g.proofs[6])) }, `+${g.proofs.length - 6}`) : null) : null;

    list.append(el('li', { class: 'tl-item', style: { '--c': s.color } },
      el('div', { class: 'tl-time' }, fmtTime(g.start)),
      el('div', { class: 'tl-rail', 'aria-hidden': 'true' }, el('i', { class: 'tl-dot' })),
      el('div', { class: 'tl-card glass-flat' },
        el('div', { class: 'tl-head' },
          subjectDot(s, 30), el('b', { class: 'tl-subj' }, s.name),
          el('button', { class: 'icon-btn tl-more', 'aria-label': `Manage ${s.name} entries`, onClick: () => openManage(g) }, icon('more', 20))),
        el('div', { class: 'tl-stats' },
          el('strong', {}, `+${g.entries.length} ${g.entries.length === 1 ? 'question' : 'questions'}`),
          el('span', {}, [
            g.proofs.length ? plural(g.proofs.length, 'proof photo') : null,
            quickN ? `${quickN} quick` : null
          ].filter(Boolean).join(' · '))),
        thumbRow)));
  }
  body.append(list);
}

/* ---------- manage a timeline row ---------- */
async function openManage(group) {
  const thumbs = await loadThumbURLs(group.entries);
  const proofs = group.proofs;
  const box = el('div', { class: 'manage' });
  const sheet = openSheet(box, {
    title: `${subjectOf(group.subjectId).name} · ${fmtTime(group.start)}`,
    onClose: () => thumbs.dispose()
  });
  for (const e of group.entries) {
    box.append(el('div', { class: 'manage-row' },
      e.photoId
        ? el('button', { class: 'thumb sm', 'aria-label': 'Open proof', onClick: () => openViewer(proofs, proofs.indexOf(e)) },
          el('img', { src: thumbs.urls.get(e.photoId) || '', alt: '' }))
        : el('span', { class: 'thumb sm quick-ico' }, icon('bolt', 20)),
      el('div', { class: 'manage-info' },
        el('b', {}, e.photoId ? 'With proof' : 'Quick +1'),
        el('span', {}, [fmtTime(e.ts), e.difficulty ? DIFF_LABEL[e.difficulty] : null].filter(Boolean).join(' · '))),
      el('button', {
        class: 'icon-btn danger', 'aria-label': 'Delete this question',
        onClick: async () => {
          const yes = await confirmDialog({
            title: 'Delete this question?',
            message: e.photoId ? 'Its proof photo is deleted too.' : 'Your count goes down by one.',
            confirmText: 'Delete', danger: true
          });
          if (!yes) return;
          await removeQuestion(e.id);
          closeOverlay(sheet);
          toast('Question removed');
        }
      }, icon('trash', 20))));
  }
}

