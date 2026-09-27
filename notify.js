/* SolveCount — Pip's notifications.
 *
 * Everything here is local (no push server, nothing leaves the device). Notifications are
 * meant to feel like tiny moments of personality from Pip, the mascot — never a productivity
 * scold. They're organized into four toggleable categories:
 *
 *   milestones        question milestones, streaks, all-time totals
 *   dailySummary      one small recap near the end of the day
 *   reminders         a gentle evening nudge + an optional good-morning hello
 *   mascotMoments     rare, spontaneous chatter — not on any schedule
 *
 * Each notification is picked at random from a pool (never the same line twice in a row) and
 * wears one of Pip's expressions as its icon. A local log (storage.notifLog) makes sure the
 * same milestone or daily nudge never fires twice.
 */
import { state, setting, put, todayTotal, subjectOf } from './state.js';
import { plural, fmtNumber } from './utils.js';
import * as db from './storage.js';

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export async function ask() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/* ---------- Pip's expressions ---------- */
// Static PNGs rendered from the same mascot artwork used on-screen, one per mood, so the
// lock-screen icon actually looks like Pip and not a generic bell.
const MOOD_ICON = {
  happy: './icon-mascot-happy.png',
  sleepy: './icon-mascot-sleepy.png',
  excited: './icon-mascot-excited.png',
  curious: './icon-mascot-curious.png',
  celebrating: './icon-mascot-celebrating.png'
};
const BADGE = './badge-96.png';

/* ---------- message pools ---------- */
// Each pool is an array of {title, body}. pick() avoids repeating the last one shown for that key.
const POOLS = {
  milestoneSmall: [ // 1-5 questions
    { title: '\ud83d\udc40 Your mascot noticed something...', body: 'That question you just solved? It has officially joined today\u2019s collection.' },
    { title: '\ud83d\udcf8 Evidence acquired!', body: 'One more question safely stored in the study vault.' },
    { title: '\ud83d\udc3e +1 for the little guy', body: 'Your study companion just got a tiny burst of happiness.' },
    { title: '\ud83c\udf31 Tiny progress detected', body: 'Your study trail has one more step in it.' },
    { title: '\u2728 Logged', body: 'Small step. Still counts. Pip approves.' }
  ],
  milestoneMid: [ // 10-25
    { title: '\ud83c\udf89 We hit {n}!', body: '{n} questions today. Pip is celebrating like it just found a secret level.' },
    { title: '\u2728 New milestone', body: '{n} questions today. Your mascot has entered celebration mode.' },
    { title: '\ud83d\udd25 Double digits and climbing', body: 'Pip is doing a little victory lap around the counter.' },
    { title: '\ud83d\udcc8 Your study trail is getting interesting', body: '{n} today. Pip cannot stop looking at the counter.' }
  ],
  milestoneBig: [ // 50+
    { title: '\ud83d\ude80 {n}! Are you even human?', body: 'Pip has officially lost count of how impressed it is.' },
    { title: '\ud83d\udc51 Legendary session', body: '{n} questions today. Pip put its crown on for this one.' },
    { title: '\ud83c\udf86 Milestone fireworks', body: 'Pip is throwing actual confetti over {n} questions.' }
  ],
  streak: [
    { title: '\ud83d\udd25 {n}-day streak!', body: 'Your study trail just keeps going. Pip is very proud of you.' },
    { title: '\ud83d\udc3e {n} days in a row', body: 'Pip has been keeping count, and honestly, it is impressed.' },
    { title: '\ud83d\udcc5 {n}-day streak unlocked', body: 'Consistency looks good on you. Pip says so.' }
  ],
  achievement: [
    { title: '\ud83c\udfc6 {n} questions, all time', body: 'That is a serious pile of solved problems. Pip is in awe.' },
    { title: '\ud83c\udf1f Big number alert', body: '{n} total questions. Pip wants everyone to know.' },
    { title: '\ud83c\udf96\ufe0f New all-time total', body: 'Pip just updated its favorite number: {n}.' }
  ],
  reminderEvening: [
    { title: '\ud83e\udee3 Psst...', body: 'Your mascot is still awake. Apparently it believes another question might happen.' },
    { title: '\ud83d\udc3e No pressure', body: 'Pip is just sitting here, next to an empty counter, being patient.' },
    { title: '\ud83d\udcad Just a thought', body: 'One question is all it takes to make today\u2019s counter smile.' },
    { title: '\ud83c\udf19 Whenever you like', body: 'Your study trail is still zero today. Pip is not worried, just curious.' }
  ],
  dailyStart: [
    { title: '\u2600\ufe0f Good morning, explorer', body: 'Your question counter is at zero. What will today\u2019s first +1 be?' },
    { title: '\ud83d\udc3e Your tiny study companion is awake', body: 'New day. Empty counter. Fresh page.' },
    { title: '\ud83c\udf24\ufe0f A brand new counter', body: 'Pip reset overnight and is quietly hopeful about today.' },
    { title: '\ud83e\udded Day one of today', body: 'Zero questions so far \u2014 which, statistically, is the most common time to start.' }
  ],
  mascotMoment: [
    { title: '\ud83e\udee3 Psst...', body: 'Pip just wanted to say hello. That is the whole notification.' },
    { title: '\ud83d\udc3e A small mascot update', body: 'Pip is doing fine. Thought you should know.' },
    { title: '\u2728 Nothing to report', body: 'Pip is just floating around in the app, being a good companion.' },
    { title: '\ud83d\udc40 Pip is watching the counter', body: 'Not judging. Just watching. Mostly just watching.' }
  ]
};

const lastPick = new Map();
function pick(poolKey) {
  const pool = POOLS[poolKey];
  if (!pool || !pool.length) return null;
  if (pool.length === 1) return pool[0];
  let i;
  do { i = Math.floor(Math.random() * pool.length); } while (i === lastPick.get(poolKey));
  lastPick.set(poolKey, i);
  return pool[i];
}
const fill = (msg, n) => ({ title: msg.title.replace('{n}', n), body: msg.body.replace('{n}', n) });

/* ---------- notification actions ---------- */
// Chrome/Android render up to ~2 actions; other browsers silently ignore the `actions` field
// and just show the notification body, which still opens the app on click.
const ACTIONS = {
  milestone: [{ action: 'add', title: 'Add Question' }, { action: 'view-today', title: 'View Today' }],
  streak: [{ action: 'view-history', title: 'View History' }, { action: 'view-today', title: 'View Today' }],
  achievement: [{ action: 'view-stats', title: 'View Stats' }, { action: 'view-today', title: 'View Today' }],
  dailySummary: [{ action: 'view-history', title: 'View History' }, { action: 'view-today', title: 'View Today' }],
  reminder: [{ action: 'add', title: 'Add Question' }, { action: 'view-today', title: 'View Today' }],
  mascotMoment: [{ action: 'view-today', title: 'View Today' }]
};

/* ---------- core show() ---------- */
async function show({ title, body, tag, mood = 'happy', route = 'home', actionsKey, dedupeKey } = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  if (dedupeKey && (await db.wasNotified(dedupeKey))) return false;
  const opts = {
    body,
    tag,
    icon: MOOD_ICON[mood] || MOOD_ICON.happy,
    badge: BADGE,
    data: { route }
  };
  const actions = actionsKey && ACTIONS[actionsKey];
  if (actions) opts.actions = actions;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, opts);
  } catch {
    try { new Notification(title, { body, tag, icon: opts.icon }); } catch { return false; }
  }
  if (dedupeKey) await db.logNotified(dedupeKey, tag, state.today);
  return true;
}

/* ---------- milestones, streaks, totals (fired right after a question is added) ---------- */
function moodForMilestone(n) {
  if (n >= 50) return 'celebrating';
  if (n >= 10) return 'excited';
  return 'happy';
}

export async function notifyAchievements(list = []) {
  if (!setting('milestonesEnabled')) return;
  for (const a of list) {
    if (a.type === 'milestone') {
      const pool = a.value >= 50 ? 'milestoneBig' : a.value >= 10 ? 'milestoneMid' : 'milestoneSmall';
      const msg = fill(pick(pool), a.value);
      await show({
        ...msg, tag: `milestone-${a.key}`, mood: moodForMilestone(a.value),
        route: 'home', actionsKey: 'milestone', dedupeKey: `ms:${a.key}`
      });
    } else if (a.type === 'streak') {
      const msg = fill(pick('streak'), a.value);
      await show({
        ...msg, tag: `streak-${a.key}`, mood: 'celebrating',
        route: 'history', actionsKey: 'streak', dedupeKey: `sk:${a.key}`
      });
    } else if (a.type === 'total') {
      const msg = fill(pick('achievement'), fmtNumber(a.value));
      await show({
        ...msg, tag: `total-${a.key}`, mood: 'excited',
        route: 'stats', actionsKey: 'achievement', dedupeKey: `tt:${a.key}`
      });
    }
  }
}

/* ---------- daily summary ---------- */
function topSubjectFor(day) {
  const d = state.daily.get(day);
  if (!d || !d.by) return null;
  let bestId = null; let bestN = 0;
  for (const [id, n] of Object.entries(d.by)) if (n > bestN) { bestN = n; bestId = id; }
  return bestId ? subjectOf(bestId).name : null;
}

async function checkDailySummary() {
  if (!setting('dailySummaryEnabled') || permission() !== 'granted') return;
  if (!document.hidden) return;
  const now = new Date();
  const [h, m] = (setting('dailySummaryTime') || '21:30').split(':').map(Number);
  const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  if (!due || setting('lastSummaryDay') === state.today) return;
  await put('lastSummaryDay', state.today, true);
  const total = todayTotal();
  if (total === 0) {
    await show({
      title: '\ud83c\udf19 Quiet day', body: 'Nothing wrong with a quiet day. Tomorrow\u2019s counter is waiting whenever you\u2019re ready.',
      tag: 'daily-summary', mood: 'sleepy', route: 'history', actionsKey: 'dailySummary', dedupeKey: `sum:${state.today}`
    });
    return;
  }
  const subject = topSubjectFor(state.today);
  const body = subject
    ? `${plural(total, 'question')} explored.\n${subject} led the expedition.\nYour mascot is extremely pleased.`
    : `${plural(total, 'question')} explored today. Your mascot is extremely pleased.`;
  await show({
    title: '\ud83c\udf19 Today\u2019s little adventure', body,
    tag: 'daily-summary', mood: total >= 25 ? 'celebrating' : 'happy',
    route: 'history', actionsKey: 'dailySummary', dedupeKey: `sum:${state.today}`
  });
}

/* ---------- daily start ---------- */
async function checkDailyStart() {
  if (!setting('dailyStartEnabled') || permission() !== 'granted') return;
  if (!document.hidden) return;
  const now = new Date();
  const [h, m] = (setting('dailyStartTime') || '08:00').split(':').map(Number);
  const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  if (!due || setting('lastDailyStartDay') === state.today) return;
  await put('lastDailyStartDay', state.today, true);
  if (todayTotal() > 0) return; // already solving — no need to say good morning
  const msg = pick('dailyStart');
  await show({
    ...msg, tag: 'daily-start', mood: 'curious', route: 'home',
    actionsKey: 'reminder', dedupeKey: `start:${state.today}`
  });
}

/* ---------- friendly reminder (evening nudge) ---------- */
async function checkFriendlyReminder() {
  if (!setting('reminderEnabled') || permission() !== 'granted') return;
  if (!document.hidden) return; // no need to nudge while you are already in the app
  const now = new Date();
  const [h, m] = (setting('reminderTime') || '19:00').split(':').map(Number);
  const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  if (due && todayTotal() === 0 && setting('lastReminderDay') !== state.today) {
    await put('lastReminderDay', state.today, true);
    const msg = pick('reminderEvening');
    await show({ ...msg, tag: 'daily-reminder', mood: 'sleepy', route: 'home', actionsKey: 'reminder', dedupeKey: `rem:${state.today}` });
  }
}

/* ---------- mascot moments: rare, playful, unscheduled ---------- */
// Fires at most once a day, only while you're mid-session (some questions already solved
// today) and only occasionally — a little "still here" wink, never a nag.
async function checkMascotMoment() {
  if (!setting('mascotMomentsEnabled') || permission() !== 'granted') return;
  if (!document.hidden) return;
  if (todayTotal() === 0) return;
  if (setting('lastMascotMomentDay') === state.today) return;
  if (Math.random() > 0.12) return; // low, non-spammy odds each time the check runs
  await put('lastMascotMomentDay', state.today, true);
  const msg = pick('mascotMoment');
  await show({ ...msg, tag: 'mascot-moment', mood: 'happy', route: 'home', actionsKey: 'mascotMoment', dedupeKey: `mm:${state.today}` });
}

/* ---------- background sync registration (best-effort, Chrome/Android only) ---------- */
export async function syncBackgroundReminder(enabled) {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;
    if (!enabled) { await reg.periodicSync.unregister('solvecount-reminder'); return false; }
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('solvecount-reminder', { minInterval: 6 * 60 * 60 * 1000 });
    return true;
  } catch { return false; }
}

/* ---------- main loop ---------- */
let pruned = false;
export function startNotificationLoop() {
  const runAll = () => {
    checkFriendlyReminder();
    checkDailyStart();
    checkDailySummary();
    checkMascotMoment();
  };
  setInterval(runAll, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setTimeout(runAll, 1500); });
  if (setting('reminderEnabled')) syncBackgroundReminder(true);
  if (!pruned) { pruned = true; db.pruneNotificationLog(30).catch(() => {}); }
}

/* ---------- routing a click back into the app ---------- */
// The service worker posts {type:'sc-navigate', route} when a notification (or one of its
// actions) is clicked while a window is already open; a fresh launch uses the URL hash instead.
export function handleNavigateRoute(route) {
  if (route === 'add') { import('./addflow.js').then((m) => m.openProofFlow()); return; }
  const to = ['home', 'history', 'stats', 'settings'].includes(route) ? route : 'home';
  import('./utils.js').then((m) => m.bus.emit('nav', { to }));
}
