/* SolveCount — in-memory state, backed by IndexedDB.
 * Everything the UI needs synchronously (subjects, daily totals, settings, streak)
 * lives here; mutations write to IndexedDB, then refresh and emit "state".
 */
import * as db from './storage.js';
import { bus, dayKey, addDays, uid } from './utils.js';

// Question-count milestones that earn a notification. Edit freely — the mascot
// picks its message/expression by how big the milestone is, not by this exact list.
export const MILESTONES = [1, 5, 10, 25, 50, 75, 100];
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];
export const TOTAL_MILESTONES = [100, 250, 500, 1000, 2500, 5000];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  glass: 0.6,
  motion: null, // resolved on first run from prefers-reduced-motion
  dailyGoal: 25,
  lastSubject: null,
  timelineOrder: 'asc',
  // Friendly reminders: a gentle evening nudge + an optional good-morning hello.
  reminderEnabled: false,
  reminderTime: '19:00',
  lastReminderDay: null,
  dailyStartEnabled: false,
  dailyStartTime: '08:00',
  lastDailyStartDay: null,
  // Milestones: question milestones, streaks and all-time totals.
  milestonesEnabled: false,
  // Daily summary: a small recap sent once, near the end of the day.
  dailySummaryEnabled: false,
  dailySummaryTime: '21:30',
  lastSummaryDay: null,
  // Mascot moments: rare, spontaneous chatter — not on any schedule.
  mascotMomentsEnabled: false,
  lastMascotMomentDay: null
};

export const state = {
  ready: false,
  today: dayKey(),
  subjects: [],       // all, including soft-deleted (needed to render history)
  active: [],         // not deleted, ordered
  subjectMap: new Map(),
  daily: new Map(),   // dayKey -> {day,total,proof,by}
  settings: { ...DEFAULT_SETTINGS },
  streak: { current: 0, best: 0 },
  totalAll: 0
};

const FALLBACK_SUBJECT = { id: '?', name: 'Other', color: '#9aa4c7', emoji: '✨', deleted: true };

export const subjectOf = (id) => state.subjectMap.get(id) || FALLBACK_SUBJECT;
export const setting = (key) => state.settings[key] ?? DEFAULT_SETTINGS[key];
export const dayTotal = (key) => state.daily.get(key)?.total || 0;
export const todayTotal = () => dayTotal(state.today);

export function computeStreak(daily, todayKey) {
  // Today may still be empty without breaking the streak — the day isn't over yet.
  let current = 0;
  let d = (daily.get(todayKey)?.total || 0) > 0 ? todayKey : addDays(todayKey, -1);
  while ((daily.get(d)?.total || 0) > 0) { current += 1; d = addDays(d, -1); }

  const days = [...daily.keys()].filter((k) => daily.get(k).total > 0).sort();
  let best = 0; let run = 0; let prev = null;
  for (const k of days) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return { current, best: Math.max(best, current) };
}

async function loadAll() {
  const [subjects, settings, dailyRows] = await Promise.all([
    db.ensureSubjects(), db.getSettings(), db.getDaily()
  ]);
  state.subjects = subjects.sort((a, b) => a.order - b.order);
  state.active = state.subjects.filter((s) => !s.deleted);
  state.subjectMap = new Map(state.subjects.map((s) => [s.id, s]));
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  state.daily = new Map(dailyRows.map((d) => [d.day, d]));
  state.today = dayKey();
  state.totalAll = dailyRows.reduce((n, d) => n + d.total, 0);
  state.streak = computeStreak(state.daily, state.today);
}

export async function load() {
  await loadAll();
  if (state.settings.motion == null) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    await put('motion', reduce ? 'off' : 'full', true);
  }
  state.ready = true;
  db.setSetting('streak', state.streak).catch(() => {});
}

export async function refresh() {
  await loadAll();
  db.setSetting('streak', state.streak).catch(() => {});
  bus.emit('state');
}

export async function put(key, value, silent = false) {
  state.settings[key] = value;
  await db.setSetting(key, value);
  if (!silent) bus.emit('setting', key);
}

/* ---------- questions ---------- */
export function nextMilestone(prev, next) {
  let hit = null;
  for (const m of MILESTONES) if (prev < m && next >= m) hit = m;
  if (!hit && next > 100 && Math.floor(next / 50) > Math.floor(prev / 50)) hit = Math.floor(next / 50) * 50;
  return hit;
}

/** Add one question. photo = {blob, thumb, w, h} or null (Quick +1). */
export async function addQuestion({ subjectId, difficulty = null, photo = null }) {
  const ts = Date.now();
  const entry = {
    id: uid(), ts, day: dayKey(ts), subjectId, difficulty,
    photoId: photo ? uid() : null,
    kind: photo ? 'proof' : 'quick'
  };
  const before = dayTotal(entry.day);
  const streakBefore = state.streak.current;
  const totalBefore = state.totalAll;
  await db.addEntry(entry, photo);
  db.requestPersistence();
  await put('lastSubject', subjectId, true);
  await refresh();
  const total = dayTotal(entry.day);
  const achievements = [];
  const ms = nextMilestone(before, total);
  if (ms) achievements.push({ type: 'milestone', key: `day-${entry.day}-${ms}`, value: ms });
  if (before === 0 && state.streak.current > streakBefore && STREAK_MILESTONES.includes(state.streak.current)) {
    achievements.push({ type: 'streak', key: `streak-${state.streak.current}`, value: state.streak.current });
  }
  for (const t of TOTAL_MILESTONES) {
    if (totalBefore < t && state.totalAll >= t) achievements.push({ type: 'total', key: `total-${t}`, value: t });
  }
  return { entry, total, milestone: ms, achievements };
}

export async function removeQuestion(id) {
  const e = await db.deleteEntry(id);
  await refresh();
  return e;
}

export async function moveQuestionSubject(id, subjectId) {
  await db.updateEntrySubject(id, subjectId);
  await put('lastSubject', subjectId, true);
  await refresh();
}

/* ---------- subjects ---------- */
export async function saveSubject(subject) {
  const list = [...state.subjects];
  const i = list.findIndex((s) => s.id === subject.id);
  if (i >= 0) list[i] = { ...list[i], ...subject };
  else list.push({ ...subject, order: list.length, deleted: false });
  await db.putSubjects(list);
  await refresh();
}

export async function reorderSubjects(orderedIds) {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const list = state.subjects.map((s) => ({
    ...s, order: rank.has(s.id) ? rank.get(s.id) : 1000 + s.order
  }));
  await db.putSubjects(list);
  await refresh();
}

export async function deleteSubject(id) {
  if (state.active.length <= 1) throw new Error('Keep at least one subject.');
  const list = state.subjects.map((s) => (s.id === id ? { ...s, deleted: true } : s));
  await db.putSubjects(list);
  if (state.settings.lastSubject === id) await put('lastSubject', null, true);
  await refresh();
}

/** Subject to use for the next question: last used, else first active. */
export function defaultSubjectId() {
  const last = state.settings.lastSubject;
  if (last && state.active.some((s) => s.id === last)) return last;
  return state.active[0]?.id;
}

/* ---------- midnight rollover ---------- */
export function checkRollover() {
  const now = dayKey();
  if (now !== state.today) {
    state.today = now;
    state.streak = computeStreak(state.daily, now);
    bus.emit('state');
    bus.emit('rollover');
    return true;
  }
  return false;
}
