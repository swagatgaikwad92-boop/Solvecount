/* SolveCount — floating study timer (UI). State lives in timer-state.js.
 *
 * One small glass bubble that floats above every view. Tap it to start (it expands to show
 * controls); "×" tucks it back into the bubble, which keeps showing the running time.
 * Drag it and it snaps to the nearest screen corner, so it can always be moved off whatever
 * the student is reading. All the "liquid" is CSS (transform/opacity only) — the only JS
 * per second is a text update, scheduled on the second boundary and only while running.
 */
import { el, bus } from './utils.js';
import { icon } from './ui.js';
import { TimerState, TimerStorage, formatFull, formatCompact, formatSpoken } from './timer-state.js';

const UI_KEY = 'solvecount.timer.ui.v1';
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const DRAG_THRESHOLD = 8;

/* ---------- small UI-preference storage (mode + corner) ---------- */
const UIStorage = {
  load() {
    try {
      const v = JSON.parse(localStorage.getItem(UI_KEY));
      return {
        mode: v?.mode === 'expanded' ? 'expanded' : 'bubble',
        corner: CORNERS.includes(v?.corner) ? v.corner : 'br'
      };
    } catch { return { mode: 'bubble', corner: 'br' }; }
  },
  save(v) { try { localStorage.setItem(UI_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
};

export class TimerUI {
  constructor(timer) {
    this.timer = timer;
    Object.assign(this, UIStorage.load()); // mode, corner
    this.lastSecond = -1;
    this.tickHandle = null;
    this.dragging = false;
    this.drag = null;
    this.build();
    this.bind();
    this.applyMode(false);
    this.render(true);
    this.schedule();
  }

  /* ---------- DOM ---------- */
  build() {
    this.digits = [];
    const timeRow = el('div', { class: 'st-time', role: 'timer', 'aria-live': 'off' });
    for (let i = 0; i < 8; i++) {
      const sep = i === 2 || i === 5;
      const c = el('span', { class: sep ? 'st-sep' : 'st-d' }, sep ? ':' : '0');
      timeRow.append(c);
      if (!sep) this.digits.push(c);
    }
    this.timeRow = timeRow;

    this.mini = el('span', { class: 'st-mini' }, '00:00');
    this.face = el('button', { class: 'st-face', type: 'button', onClick: () => this.onFace() },
      icon('today', 15, 'st-face-ico'), this.mini);

    this.primary = el('button', { class: 'st-btn st-primary', type: 'button', onClick: () => this.onPrimary() });
    this.reset = el('button', { class: 'st-btn st-reset', type: 'button', 'aria-label': 'Reset timer', onClick: () => this.onReset() }, icon('refresh', 20));
    this.close = el('button', { class: 'st-btn st-close', type: 'button', 'aria-label': 'Minimize timer', onClick: () => this.setMode('bubble') }, icon('x', 20));
    this.panel = el('div', { class: 'st-panel', role: 'group', 'aria-label': 'Study timer' },
      timeRow, el('div', { class: 'st-actions' }, this.reset, this.primary, this.close));

    this.live = el('span', { class: 'sr-only', 'aria-live': 'polite' });

    this.root = el('div', { id: 'study-timer', class: 'study-timer' },
      el('span', { class: 'st-halo', 'aria-hidden': 'true' }),
      el('span', { class: 'st-glass', 'aria-hidden': 'true' },
        el('i', { class: 'st-liquid st-liquid-a' }), el('i', { class: 'st-liquid st-liquid-b' }),
        el('i', { class: 'st-shine' }),
        el('i', { class: 'st-p st-p1' }), el('i', { class: 'st-p st-p2' }), el('i', { class: 'st-p st-p3' })),
      this.face, this.panel, this.live);
    document.body.append(this.root);
    document.body.classList.add('has-study-timer');
  }

  bind() {
    this.unsub = this.timer.subscribe((ev) => this.onTimerEvent(ev));
    this.root.addEventListener('pointerdown', (e) => this.dragStart(e));
    this.root.addEventListener('pointermove', (e) => this.dragMove(e));
    this.root.addEventListener('pointerup', (e) => this.dragEnd(e));
    this.root.addEventListener('pointercancel', (e) => this.dragEnd(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'expanded') { e.stopPropagation(); this.setMode('bubble'); }
    });
    // Timestamps make the time right on return; these just repaint immediately.
    const refresh = () => { this.render(true); this.schedule(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); else this.stopTick(); });
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    // another tab/window of the app changed the timer
    window.addEventListener('storage', (e) => { if (e.key === TimerStorage.key || e.key === null) this.timer.sync(); });
  }

  /* ---------- state -> view ---------- */
  get runState() { return this.timer.running ? 'running' : this.timer.isIdle ? 'idle' : 'paused'; }

  render(force = false) {
    const ms = this.timer.elapsed();
    const sec = Math.floor(ms / 1000);
    const run = this.runState;
    if (!force && sec === this.lastSecond && this.root.dataset.run === run) return;
    this.lastSecond = sec;

    const full = formatFull(ms);
    const compact = formatCompact(ms);
    this.mini.textContent = compact;
    this.face.dataset.long = compact.length > 5 ? '1' : '0';
    let di = 0;
    for (const ch of full) if (ch !== ':') { const d = this.digits[di++]; if (d.textContent !== ch) d.textContent = ch; }

    this.root.dataset.run = run;
    const label = run === 'running' ? 'Pause' : run === 'paused' ? 'Resume' : 'Start';
    this.primary.setAttribute('aria-label', `${label} study timer`);
    this.primary.replaceChildren(icon(run === 'running' ? 'pause' : 'play', 26));
    // spoken label is refreshed on state change and once a minute, not every second
    if (force || sec % 60 === 0) {
      const spoken = formatSpoken(ms);
      this.face.setAttribute('aria-label', run === 'idle'
        ? 'Study timer. Tap to start'
        : `Study timer, ${spoken}, ${run}. Tap to open controls`);
      this.timeRow.setAttribute('aria-label', `Study time ${spoken}`);
    }
  }

  applyMode(animate = true) {
    const open = this.mode === 'expanded';
    this.root.dataset.mode = this.mode;
    this.root.dataset.corner = this.corner;
    this.root.classList.toggle('is-animated', animate);
    this.face.tabIndex = open ? -1 : 0;
    this.face.setAttribute('aria-hidden', open ? 'true' : 'false');
    this.panel.inert = !open;
    this.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  setMode(mode, { focus = true } = {}) {
    if (this.mode === mode) return;
    this.mode = mode;
    UIStorage.save({ mode: this.mode, corner: this.corner });
    this.applyMode(true);
    if (focus) {
      // focus after the crossfade has started so the moved-to control is actually visible
      setTimeout(() => (mode === 'expanded' ? this.primary : this.face).focus({ preventScroll: true }), 60);
    }
  }

  /* ---------- actions ---------- */
  onFace() {
    if (this.timer.isIdle) this.timer.start(); // first tap: start counting and open controls
    this.setMode('expanded');
  }
  onPrimary() { this.timer.toggle(); }
  onReset() { this.timer.reset(); }

  onTimerEvent(ev) {
    this.render(true);
    this.schedule();
    const say = { start: 'Timer started', resume: 'Timer resumed', pause: 'Timer paused', reset: 'Timer reset' }[ev];
    if (say) this.live.textContent = say;
  }

  /* ---------- ticking: wake on each second boundary, only while running & visible ---------- */
  schedule() {
    this.stopTick();
    if (!this.timer.running || document.hidden) return;
    const wait = 1000 - (this.timer.elapsed() % 1000) + 15;
    this.tickHandle = setTimeout(() => { this.render(); this.schedule(); }, wait);
  }
  stopTick() { clearTimeout(this.tickHandle); this.tickHandle = null; }

  /* ---------- dragging (snaps to the nearest corner) ---------- */
  /* ---------- dragging (snaps to the nearest corner) ----------
   * The pointer is captured immediately on pointerdown, not once a drag is confirmed: the
   * bubble is only 64px across, so an ordinary flick can carry the pointer off it before the
   * next event fires, and without capture that event would target whatever is now underneath
   * instead of the timer. Capturing early does mean the eventual "click" retargets to this.root
   * instead of the face button, so a plain tap is dispatched explicitly from dragEnd (buttons in
   * the expanded panel bail out of dragging below and keep their ordinary clicks). */
  dragStart(e) {
    if (e.button > 0 || this.snapping) return;
    if (this.mode === 'expanded' && e.target.closest('button')) return;
    this.drag = { x: e.clientX, y: e.clientY, rect: this.root.getBoundingClientRect(), id: e.pointerId };
    this.dragging = false;
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  dragMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    let dx = e.clientX - d.x;
    let dy = e.clientY - d.y;
    if (!this.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this.dragging = true;
      this.root.classList.add('is-dragging');
    }
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = d.rect;
    dx = Math.min(Math.max(dx, 6 - r.left), vw - 6 - r.right);
    dy = Math.min(Math.max(dy, 6 - r.top), vh - 6 - r.bottom);
    this.root.style.transform = `translate(${dx}px, ${dy}px)`;
    d.dx = dx; d.dy = dy;
  }

  dragEnd(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try { this.root.releasePointerCapture(d.id); } catch { /* ignore */ }
    if (!this.dragging) {
      // A plain tap: the pointer was captured on down, so the browser's own "click" retargets
      // to this.root rather than the face button — dispatch the tap action ourselves instead.
      if (this.mode !== 'expanded') this.onFace();
      return;
    }
    this.dragging = false;

    // pick the corner nearest to where it was dropped
    const cx = d.rect.left + d.rect.width / 2 + (d.dx || 0);
    const cy = d.rect.top + d.rect.height / 2 + (d.dy || 0);
    const corner = (cy < window.innerHeight / 2 ? 't' : 'b') + (cx < document.documentElement.clientWidth / 2 ? 'l' : 'r');

    // FLIP: jump to the new corner, but visually stay where the finger left it, then glide home
    const before = this.root.getBoundingClientRect();
    this.root.classList.remove('is-dragging');
    this.root.style.transform = '';
    this.corner = corner;
    this.root.dataset.corner = corner;
    const after = this.root.getBoundingClientRect();
    this.root.classList.remove('is-snapping');
    this.root.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`;
    void this.root.offsetWidth;
    this.snapping = true;
    this.root.classList.add('is-snapping');
    this.root.style.transform = '';
    const done = () => { this.snapping = false; this.root.classList.remove('is-snapping'); };
    this.root.addEventListener('transitionend', function once(ev) {
      if (ev.target !== this || ev.propertyName !== 'transform') return;
      this.removeEventListener('transitionend', once); done();
    });
    setTimeout(done, 700);
    UIStorage.save({ mode: this.mode, corner: this.corner });
  }
}

/** Boot the timer. Call once after the app has rendered. */
export function initStudyTimer() {
  const timer = new TimerState();
  // Bridge to the app's existing event bus so future features (stats, DABSy, calendar,
  // analytics) can listen with bus.on('timer', ({ event, ...snapshot }) => ...).
  timer.subscribe((event, snap) => bus.emit('timer', { event, ...snap }));
  const ui = new TimerUI(timer);
  return { timer, ui };
}
