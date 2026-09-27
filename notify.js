/* SolveCount — reminders + milestone notifications.
 *
 * Everything is local (no push server). A daily reminder is shown when SolveCount can run:
 *   • while the app is open in the background, and
 *   • via Periodic Background Sync on Chrome/Android when the app is installed (best effort).
 */
import { state, setting, put, todayTotal } from './state.js';

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export async function ask() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export async function show(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body, tag,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: './' }
    });
    return true;
  } catch {
    try { new Notification(title, { body, tag, icon: './icon-192.png' }); return true; } catch { return false; }
  }
}

export function notifyAchievement(a) {
  if (!setting('milestonesEnabled')) return;
  show(a.title, a.body, `milestone-${a.key}`);
}

/** Register/unregister the background check used by the service worker. */
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

function checkReminder() {
  if (!setting('reminderEnabled') || permission() !== 'granted') return;
  if (!document.hidden) return; // no need to nudge while you are already in the app
  const now = new Date();
  const [h, m] = (setting('reminderTime') || '19:00').split(':').map(Number);
  const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  if (due && todayTotal() === 0 && setting('lastReminderDay') !== state.today) {
    put('lastReminderDay', state.today, true);
    show('Ready for a question or two?', 'Your study trail is waiting. Snap one and watch it grow.', 'daily-reminder');
  }
}

export function startReminderLoop() {
  setInterval(checkReminder, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setTimeout(checkReminder, 1500); });
  if (setting('reminderEnabled')) syncBackgroundReminder(true);
}
