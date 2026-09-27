/* SolveCount — Settings + appearance */
import { el, clear, bus, dayKey, APP_VERSION, formatBytes, fmtNumber } from './utils.js';
import * as db from './storage.js';
import { state, setting, put, load } from './state.js';
import { icon, segmented, toggle, slider, toast, confirmDialog, infoDialog, closeAllOverlays } from './ui.js';
import { openSubjectsScreen } from './subjects.js';
import * as notify from './notify.js';
import { isStandalone, isIOS, canPromptInstall, promptInstall } from './install.js';

/* ---------- appearance ---------- */
export function applyAppearance() {
  const root = document.documentElement;
  const t = setting('theme');
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--gi', String(setting('glass') ?? 0.6));
  const osReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.motion = osReduce ? 'off' : (setting('motion') || 'full');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0b22' : '#efedff');
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyAppearance);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyAppearance);

/* ---------- small builders ---------- */
const group = (title, ...rows) => el('section', { class: 'set-group' },
  title ? el('h2', { class: 'set-title' }, title) : null,
  el('div', { class: 'set-card glass' }, ...rows));

const row = (label, control, { sub, stack = false, icoName } = {}) => el('div', { class: `set-row ${stack ? 'is-stack' : ''}` },
  icoName ? el('span', { class: 'set-ico' }, icon(icoName, 20)) : null,
  el('div', { class: 'set-label' }, el('b', {}, label), sub ? el('small', {}, sub) : null),
  control);

const actionRow = (label, { sub, icoName, onClick, danger = false }) => el('button', {
  type: 'button', class: `set-row set-action ${danger ? 'is-danger' : ''}`, onClick
}, icoName ? el('span', { class: 'set-ico' }, icon(icoName, 20)) : null,
el('div', { class: 'set-label' }, el('b', {}, label), sub ? el('small', {}, sub) : null),
icon('right', 18, 'set-chev'));

export function initSettings(host) {
  const body = el('div', { class: 'settings' });
  clear(host);
  host.append(el('header', { class: 'view-head' }, el('h1', { class: 'view-title' }, 'Settings')), body);

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  fileInput.addEventListener('change', onImportFile);
  host.append(fileInput);

  let storageLine = null;

  function render() {
    clear(body);

    /* install */
    if (!isStandalone()) {
      if (canPromptInstall()) {
        body.append(group(null, actionRow('Install SolveCount', {
          sub: 'Add it to your home screen. Works offline.', icoName: 'phone',
          onClick: async () => { await promptInstall(); }
        })));
      } else if (isIOS()) {
        body.append(group(null, actionRow('Install SolveCount', {
          sub: 'Add it to your home screen', icoName: 'phone',
          onClick: () => infoDialog({ title: 'Add to Home Screen', message: 'In Safari, tap the Share button, then choose “Add to Home Screen”. SolveCount then opens like a normal app and works offline.' })
        })));
      }
    }

    /* appearance */
    const osReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.append(group('Appearance',
      row('Theme', segmented({
        label: 'Theme', value: setting('theme'),
        options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }],
        onChange: async (v) => { await put('theme', v); applyAppearance(); }
      }), { stack: true }),
      row('Glass intensity', el('div', { class: 'range-wrap' }, el('small', {}, 'Flat'),
        slider({ min: 0, max: 100, step: 5, value: Math.round(setting('glass') * 100), label: 'Glass intensity',
          onInput: (v) => { document.documentElement.style.setProperty('--gi', String(v / 100)); } }),
        el('small', {}, 'Frosted')), { stack: true }),
      row('Animations', segmented({
        label: 'Animation intensity', value: osReduce ? 'off' : setting('motion'),
        options: [{ value: 'off', label: 'Off' }, { value: 'low', label: 'Gentle' }, { value: 'full', label: 'Full' }],
        onChange: async (v) => { await put('motion', v); applyAppearance(); }
      }), { stack: true, sub: osReduce ? 'Your device asks for reduced motion, so animations stay off.' : 'Counter roll, mascot and confetti.' })));

    // persist glass value when slider is released
    body.querySelector('.range')?.addEventListener('change', (e) => put('glass', Number(e.target.value) / 100));

    /* goals */
    const goalVal = el('b', { class: 'stepper-val' }, setting('dailyGoal') ? String(setting('dailyGoal')) : 'Off');
    const stepGoal = async (d) => {
      const cur = setting('dailyGoal') || 0;
      const next = Math.max(0, Math.min(500, cur + d));
      await put('dailyGoal', next);
      goalVal.textContent = next ? String(next) : 'Off';
    };
    body.append(group('Goal',
      row('Daily goal', el('div', { class: 'stepper' },
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Lower goal', onClick: () => stepGoal(-5) }, icon('down', 18)),
        goalVal,
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Raise goal', onClick: () => stepGoal(5) }, icon('up', 18))),
      { sub: 'A friendly target on the home screen. Never a penalty.' })));

    /* subjects */
    body.append(group('Subjects',
      actionRow('Manage subjects', {
        sub: state.active.map((s) => s.emoji).join(' '), icoName: 'tag', onClick: () => openSubjectsScreen()
      })));

    /* notifications */
    const perm = notify.permission();
    const reminderToggle = toggle({
      checked: setting('reminderEnabled') && perm === 'granted', label: 'Daily reminder',
      onChange: async (on) => {
        if (on) {
          const p = await notify.ask();
          if (p !== 'granted') {
            toast(p === 'unsupported' ? 'Notifications are not supported on this browser.' : 'Notifications are blocked. Allow them in your browser’s site settings.', { tone: 'warn' });
            return false;
          }
        }
        await put('reminderEnabled', on);
        await notify.syncBackgroundReminder(on);
        render();
        return true;
      }
    });
    const milestoneToggle = toggle({
      checked: setting('milestonesEnabled') && perm === 'granted', label: 'Milestone notifications',
      onChange: async (on) => {
        if (on) {
          const p = await notify.ask();
          if (p !== 'granted') {
            toast(p === 'unsupported' ? 'Notifications are not supported on this browser.' : 'Notifications are blocked. Allow them in your browser’s site settings.', { tone: 'warn' });
            return false;
          }
        }
        await put('milestonesEnabled', on);
        return true;
      }
    });
    const timeInput = el('input', { type: 'time', class: 'field time-field', value: setting('reminderTime'), 'aria-label': 'Reminder time' });
    timeInput.addEventListener('change', async () => {
      if (timeInput.value) { await put('reminderTime', timeInput.value); await put('lastReminderDay', null, true); }
    });
    body.append(group('Notifications',
      row('Daily reminder', reminderToggle, { sub: 'A gentle nudge if you have not solved anything yet.' }),
      setting('reminderEnabled') && perm === 'granted' ? row('Reminder time', timeInput) : null,
      row('Milestone notifications', milestoneToggle, { sub: 'Big days, streaks and all-time totals.' }),
      el('p', { class: 'set-note' }, 'Reminders are local to this device. They show up while SolveCount can run in the background, which depends on your browser.')));

    /* data */
    storageLine = el('small', {}, 'Calculating…');
    body.append(group('Data',
      actionRow('Export data', { sub: 'Save a JSON backup, photos included', icoName: 'download', onClick: doExport }),
      actionRow('Import data', { sub: 'Restore from a SolveCount backup', icoName: 'upload', onClick: () => fileInput.click() }),
      actionRow('Clear all data', { sub: 'Delete every question, photo and setting', icoName: 'trash', danger: true, onClick: doClear }),
      el('div', { class: 'set-note', id: 'storageNote' }, storageLine)));
    updateStorage();

    /* about */
    body.append(group('About',
      row('Version', el('span', { class: 'set-value' }, APP_VERSION)),
      el('div', { class: 'about' },
        el('p', {}, 'SolveCount is for students who solve more than they record. Snap the question, count it, watch your study trail grow.'),
        el('p', {}, 'Everything stays on this device. No account, no tracking, no server. Made with care; Pip, the mascot, is drawn in code.'))));
  }

  async function updateStorage() {
    const info = await db.storageInfo();
    const photos = await db.countPhotos().catch(() => 0);
    if (!storageLine) return;
    storageLine.textContent = info
      ? `${fmtNumber(state.totalAll)} questions · ${fmtNumber(photos)} photos · ${formatBytes(info.usage)} used on this device`
      : `${fmtNumber(state.totalAll)} questions · ${fmtNumber(photos)} photos on this device`;
  }

  async function doExport() {
    try {
      toast('Preparing your backup…', { duration: 1500 });
      const blob = await db.exportBackup();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `solvecount-backup-${dayKey()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast(`Backup saved (${formatBytes(blob.size)})`);
    } catch (err) {
      console.error(err);
      toast('Could not create the backup.', { tone: 'warn' });
    }
  }

  async function onImportFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    let obj; let info;
    try {
      obj = JSON.parse(await file.text());
      info = db.validateBackup(obj);
    } catch (err) {
      toast(err.message?.includes('SolveCount') ? err.message : 'That file could not be read as a SolveCount backup.', { tone: 'warn' });
      return;
    }
    const yes = await confirmDialog({
      title: 'Replace your data?',
      message: `This backup has ${fmtNumber(info.entries)} questions and ${fmtNumber(info.photos)} photos. It replaces everything currently in SolveCount.`,
      confirmText: 'Restore backup', danger: true
    });
    if (!yes) return;
    try {
      await db.importBackup(obj);
      await load();
      applyAppearance();
      bus.emit('state');
      render();
      toast('Backup restored');
    } catch (err) {
      console.error(err);
      toast('Restore failed. Your existing data was not changed.', { tone: 'warn' });
    }
  }

  async function doClear() {
    const yes = await confirmDialog({
      title: 'Delete all data?',
      message: 'Every question, proof photo, subject and setting on this device will be erased. This cannot be undone. Export a backup first if you might want it back.',
      confirmText: 'Delete everything', danger: true
    });
    if (!yes) return;
    await db.clearEverything();
    await load();
    applyAppearance();
    bus.emit('state');
    render();
    closeAllOverlays();
    bus.emit('nav', { to: 'home' });
    toast('All data cleared');
  }

  bus.on('state', () => { updateStorage(); });
  bus.on('install-state', render);
  render();
  return { onShow() { render(); } };
}
