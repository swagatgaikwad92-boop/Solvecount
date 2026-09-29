/* SolveCount — study timer: state + storage (no DOM, so it can be reused or unit-tested).
 *
 * TimerState keeps only three facts — the same three that get persisted:
 *   running          is it counting right now?
 *   startedAt        epoch ms when the current running stretch began (null while paused)
 *   accumulatedMs    study time banked from earlier stretches
 * Elapsed time is always *derived* from timestamps (accumulated + now - startedAt), never
 * incremented by a timer tick, so it stays exact when the browser throttles JS, the phone
 * sleeps, or the page is reloaded mid-session.
 *
 * Hook for later integrations (SolveCount stats, DABSy, Ghibli Calendar, analytics):
 * subscribe with timer.subscribe(fn). Every change calls fn(event, snapshot) where event is
 * 'start' | 'resume' | 'pause' | 'reset' | 'sync' and snapshot includes sessionStartedAt,
 * elapsedMs and running. A future "session finished" feature can persist the snapshot that
 * arrives with 'reset' (or 'pause') — nothing here needs to change for that.
 */

const KEY = 'solvecount.timer.v1';

/* ---------- TimerStorage ---------- */
export const TimerStorage = {
  key: KEY,
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || raw.v !== 1) return null;
      const acc = Number(raw.accumulatedMs);
      const started = raw.startedAt == null ? null : Number(raw.startedAt);
      const session = raw.sessionStartedAt == null ? null : Number(raw.sessionStartedAt);
      if (!Number.isFinite(acc) || acc < 0) return null;
      if (started != null && !Number.isFinite(started)) return null;
      return {
        running: !!raw.running && started != null,
        startedAt: started,
        accumulatedMs: acc,
        sessionStartedAt: Number.isFinite(session) ? session : null
      };
    } catch { return null; }
  },
  save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, running: s.running, startedAt: s.startedAt,
        accumulatedMs: s.accumulatedMs, sessionStartedAt: s.sessionStartedAt
      }));
    } catch { /* private mode / quota: the timer still works, it just won't survive a reload */ }
  },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
};

/* ---------- TimerState ---------- */
export class TimerState {
  constructor(storage = TimerStorage) {
    this.storage = storage;
    this.listeners = new Set();
    this.running = false;
    this.startedAt = null;
    this.accumulatedMs = 0;
    this.sessionStartedAt = null;
    this.restore();
  }

  restore() {
    const s = this.storage.load();
    if (!s) return;
    Object.assign(this, s);
  }

  /** Milliseconds studied so far. Clamped at 0 so a wall-clock change can never show negative time. */
  elapsed(now = Date.now()) {
    const live = this.running && this.startedAt != null ? now - this.startedAt : 0;
    return Math.max(0, this.accumulatedMs + Math.max(0, live));
  }

  get isIdle() { return !this.running && this.accumulatedMs === 0; }

  snapshot(now = Date.now()) {
    return {
      running: this.running, elapsedMs: this.elapsed(now),
      startedAt: this.startedAt, accumulatedMs: this.accumulatedMs,
      sessionStartedAt: this.sessionStartedAt
    };
  }

  start(now = Date.now()) {
    if (this.running) return;
    const first = this.accumulatedMs === 0 && this.sessionStartedAt == null;
    if (first) this.sessionStartedAt = now;
    this.running = true;
    this.startedAt = now;
    this.commit(first ? 'start' : 'resume', now);
  }

  pause(now = Date.now()) {
    if (!this.running) return;
    this.accumulatedMs = this.elapsed(now);
    this.running = false;
    this.startedAt = null;
    this.commit('pause', now);
  }

  toggle(now = Date.now()) { this.running ? this.pause(now) : this.start(now); }

  reset(now = Date.now()) {
    const finalSnapshot = this.snapshot(now); // what a future "save session" would want
    this.running = false;
    this.startedAt = null;
    this.accumulatedMs = 0;
    this.sessionStartedAt = null;
    this.commit('reset', now, finalSnapshot);
  }

  /** Another tab changed the stored state — adopt it. */
  sync() {
    const s = this.storage.load();
    if (s) Object.assign(this, s);
    else Object.assign(this, { running: false, startedAt: null, accumulatedMs: 0, sessionStartedAt: null });
    this.emit('sync', this.snapshot());
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(event, snap) { for (const fn of this.listeners) { try { fn(event, snap); } catch (e) { console.error(e); } } }

  commit(event, now, snap) {
    if (this.isIdle && event === 'reset') this.storage.clear(); else this.storage.save(this);
    this.emit(event, snap || this.snapshot(now));
  }
}

/* ---------- formatting ---------- */
const pad = (n) => String(n).padStart(2, '0');

/** Split into whole h/m/s. */
export function parts(ms) {
  const total = Math.floor(ms / 1000);
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
}

/** Expanded view: always HH:MM:SS. */
export function formatFull(ms) {
  const { h, m, s } = parts(ms);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Bubble view: MM:SS, growing to H:MM:SS once past an hour so it stays compact. */
export function formatCompact(ms) {
  const { h, m, s } = parts(ms);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Spoken form for screen readers, e.g. "1 hour 5 minutes 3 seconds". */
export function formatSpoken(ms) {
  const { h, m, s } = parts(ms);
  const bits = [];
  if (h) bits.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) bits.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (s || !bits.length) bits.push(`${s} ${s === 1 ? 'second' : 'seconds'}`);
  return bits.join(' ');
}
