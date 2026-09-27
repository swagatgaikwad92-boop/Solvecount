/* SolveCount — Today (home) screen */
import { el, clear, bus, fmtDay, fmtNumber, plural } from './utils.js';
import * as db from './storage.js';
import { state, subjectOf, todayTotal, setting } from './state.js';
import { icon, subjectDot } from './ui.js';
import { RollingNumber } from './counter.js';
import { createMascot, moodFor, idleMessage, addMessage } from './mascot.js';
import { burst, floatText, confetti, banner, haptic } from './fx.js';
import { openProofFlow, quickAdd, pickQuickSubject } from './addflow.js';
import { openDayScreen, openViewer, loadThumbURLs } from './timeline.js';
import { defaultSubjectId } from './state.js';
import { notifyAchievements } from './notify.js';

export function initHome(host) {
  let hold = false;
  let holdTimer = null;
  let thumbs = null;
  let recentToken = 0;

  /* ----- static skeleton ----- */
  const streakNum = el('b', {}, '0');
  const streakLbl = el('span', {}, 'day streak');
  const streakChip = el('button', { class: 'chip streak', type: 'button', 'aria-label': 'Open statistics', onClick: () => bus.emit('nav', { to: 'stats' }) },
    el('span', { class: 'flame', 'aria-hidden': 'true' }, '🔥'), streakNum, streakLbl);
  const dateEl = el('div', { class: 'home-date' });

  const pipHost = el('div', { class: 'pip-host' });
  const mascot = createMascot(pipHost);
  const bubbleText = el('p', { class: 'bubble-text' });
  const bubble = el('div', { class: 'bubble' }, bubbleText);

  const counterHost = el('div', { class: 'counter-num' });
  const counter = new RollingNumber(counterHost);
  const goalBar = el('i', {});
  const goalText = el('span', { class: 'goal-text' });
  const goal = el('div', { class: 'goal' },
    el('div', { class: 'goal-bar', role: 'progressbar', 'aria-label': 'Daily goal progress' }, goalBar), goalText);

  const plusBtn = el('button', { class: 'btn-plus', type: 'button', onClick: () => openProofFlow() },
    el('span', { class: 'btn-plus-ico' }, icon('camera', 30)),
    el('span', { class: 'btn-plus-main' }, '+1'),
    el('span', { class: 'btn-plus-txt' }, el('b', {}, 'SOLVED'), el('small', {}, 'with proof photo')));

  const quickBtn = el('button', { class: 'btn-quick', type: 'button', onClick: () => quickAdd() },
    icon('bolt', 22), el('span', {}, 'Quick +1'), el('small', {}, 'no photo'));
  const subjBtn = el('button', { class: 'btn-subject', type: 'button', 'aria-label': 'Change subject for quick adds', onClick: () => pickQuickSubject() });

  const breakdown = el('section', { class: 'breakdown glass', 'aria-label': 'Today by subject' });
  const recentStrip = el('div', { class: 'recent-strip' });
  const recent = el('section', { class: 'recent' },
    el('h2', { class: 'section-title' }, 'Recent proof'), recentStrip);

  const links = el('div', { class: 'link-row' },
    el('button', { class: 'btn btn-glass', type: 'button', onClick: () => openDayScreen(state.today) }, icon('today', 20), "Today's timeline"),
    el('button', { class: 'btn btn-glass', type: 'button', onClick: () => bus.emit('nav', { to: 'stats' }) }, icon('chart', 20), 'Statistics'));

  clear(host);
  host.append(
    el('header', { class: 'home-top' }, streakChip, dateEl),
    el('div', { class: 'companion' }, pipHost, bubble),
    el('section', { class: 'counter', 'aria-label': 'Questions solved today' },
      counterHost, el('p', { class: 'counter-label' }, 'Questions today'), goal),
    el('div', { class: 'actions' }, plusBtn, el('div', { class: 'quick-row' }, quickBtn, subjBtn)),
    breakdown, recent, links);

  /* ----- helpers ----- */
  function setBubble(text) {
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubbleText.textContent = text;
    bubble.classList.add('pop');
  }

  function paintGoal(total) {
    const g = setting('dailyGoal');
    goal.hidden = !g;
    if (!g) return;
    const pct = Math.min(1, total / g);
    goalBar.style.transform = `scaleX(${pct})`;
    goalBar.parentElement.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    goalText.textContent = total >= g ? 'Goal reached. Bonus round!' : total === 0 ? `Daily goal: ${g}` : `${g - total} to your daily goal`;
    goal.classList.toggle('is-done', total >= g);
  }

  function paintSubjectButton() {
    const s = subjectOf(defaultSubjectId());
    clear(subjBtn);
    subjBtn.style.setProperty('--c', s.color);
    subjBtn.append(el('span', { class: 'sb-emoji' }, s.emoji), el('span', { class: 'sb-name' }, s.name), icon('down', 16));
  }

  function paintBreakdown() {
    clear(breakdown);
    const day = state.daily.get(state.today);
    const rows = day ? Object.entries(day.by).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
    if (!rows.length) {
      breakdown.append(el('p', { class: 'breakdown-empty' }, 'Your subjects light up here as you solve.'),
        el('div', { class: 'breakdown-ghost' }, state.active.slice(0, 5).map((s) => el('span', { style: { '--c': s.color } }, s.emoji))));
      return;
    }
    const max = rows[0][1];
    for (const [id, n] of rows) {
      const s = subjectOf(id);
      breakdown.append(el('div', { class: 'brow', style: { '--c': s.color } },
        subjectDot(s, 34),
        el('div', { class: 'brow-main' },
          el('div', { class: 'brow-top' }, el('b', {}, s.name), el('span', { class: 'brow-n' }, String(n))),
          el('div', { class: 'brow-bar' }, el('i', { style: { transform: `scaleX(${Math.max(0.05, n / max)})` } })))));
    }
  }

  async function paintRecent() {
    const my = ++recentToken;
    const list = await db.getRecentProofs(10);
    if (my !== recentToken) return;
    const t = await loadThumbURLs(list);
    if (my !== recentToken) { t.dispose(); return; }
    thumbs?.dispose();
    thumbs = t;
    clear(recentStrip);
    if (!list.length) {
      recentStrip.append(el('div', { class: 'recent-empty' }, icon('camera', 22),
        el('span', {}, 'Photos you add will collect here.')));
      return;
    }
    list.forEach((e, idx) => {
      const s = subjectOf(e.subjectId);
      recentStrip.append(el('button', {
        class: 'thumb', style: { '--c': s.color }, 'aria-label': `Open proof photo, ${s.name}`,
        onClick: () => openViewer(list, idx)
      }, el('img', { src: t.urls.get(e.photoId) || '', alt: '', loading: 'lazy' }), el('span', { class: 'thumb-badge' }, s.emoji)));
    });
  }

  function paintStatic() {
    streakNum.textContent = String(state.streak.current);
    streakLbl.textContent = state.streak.current === 1 ? 'day streak' : 'day streak';
    streakChip.classList.toggle('is-off', state.streak.current === 0);
    dateEl.textContent = fmtDay(state.today, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  function renderAll({ counterToo = true } = {}) {
    const total = todayTotal();
    paintStatic();
    paintGoal(total);
    paintBreakdown();
    paintSubjectButton();
    mascot.setMood(moodFor(total));
    if (counterToo && !hold) counter.set(total);
    paintRecent();
  }

  /* ----- reactions ----- */
  function onAdded({ total, milestone, kind, entry, achievements = [] }) {
    hold = false;
    clearTimeout(holdTimer);
    counter.set(total);
    paintGoal(total);
    mascot.setMood(moodFor(total));

    const src = (kind === 'quick' ? quickBtn : plusBtn).getBoundingClientRect();
    const x = src.left + src.width / 2;
    const y = src.top + src.height / 2;
    const s = subjectOf(entry.subjectId);
    burst(x, y, { count: milestone ? 34 : 16, power: milestone ? 1.5 : 1, colors: [s.color, '#ffffff', '#ffd65c', '#46c8ff', '#ff7eb6'] });
    floatText(x, src.top + 6, '+1', '#fff');
    haptic(milestone ? [20, 40, 30] : 14);

    mascot.react(milestone && milestone >= 25 ? 'spin' : milestone ? 'wiggle' : 'jump');
    setBubble(addMessage({ count: total, kind, milestone }));

    if (milestone && milestone >= 10) {
      confetti(milestone >= 50 ? 1.4 : 1);
      banner(`${milestone}!`, 'questions today');
    }
    notifyAchievements(achievements);
  }

  bus.on('add-start', () => {
    hold = true;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { hold = false; renderAll(); }, 5000);
  });
  bus.on('add-failed', () => { hold = false; renderAll(); });
  bus.on('question-added', onAdded);
  bus.on('state', () => renderAll());
  bus.on('rollover', () => { setBubble(idleMessage(0)); });

  // first paint
  counter.set(todayTotal(), { animate: false });
  renderAll({ counterToo: false });
  setBubble(idleMessage(todayTotal()));

  return {
    onShow() { renderAll(); },
    updateNumber: () => counter.set(todayTotal())
  };
}
