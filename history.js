/* SolveCount — History: month calendar. Tap a day to open its timeline and proof photos. */
import { el, clear, bus, dayKey, pad, daysInMonth, fmtNumber } from './utils.js';
import { state, subjectOf } from './state.js';
import { icon } from './ui.js';
import { openDayScreen } from './timeline.js';

export function initHistory(host) {
  let cursor = { y: new Date().getFullYear(), m: new Date().getMonth() };

  const title = el('h2', { class: 'cal-title' });
  const sub = el('p', { class: 'cal-sub' });
  const grid = el('div', { class: 'cal-grid', role: 'grid' });
  const prev = el('button', { class: 'icon-btn', 'aria-label': 'Previous month', onClick: () => step(-1) }, icon('left', 22));
  const next = el('button', { class: 'icon-btn', 'aria-label': 'Next month', onClick: () => step(1) }, icon('right', 22));
  const todayBtn = el('button', { class: 'chip-btn', onClick: () => { const n = new Date(); cursor = { y: n.getFullYear(), m: n.getMonth() }; paint(); } }, 'Today');

  const weekdays = el('div', { class: 'cal-week', 'aria-hidden': 'true' });
  const monday = new Date(2024, 0, 1, 12); // a Monday
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    weekdays.append(el('span', {}, d.toLocaleDateString([], { weekday: 'narrow' })));
  }

  const legend = el('div', { class: 'cal-legend' },
    el('span', {}, 'Fewer'),
    ...[1, 2, 3, 4].map((l) => el('i', { class: `lvl lvl-${l}` })),
    el('span', {}, 'More'));

  clear(host);
  host.append(
    el('header', { class: 'view-head' }, el('h1', { class: 'view-title' }, 'History')),
    el('section', { class: 'cal glass' },
      el('div', { class: 'cal-head' }, prev, el('div', { class: 'cal-head-mid' }, title, sub), next),
      weekdays, grid, legend),
    el('div', { class: 'cal-foot' }, todayBtn));

  function step(d) {
    let m = cursor.m + d; let y = cursor.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    cursor = { y, m };
    paint();
  }

  function level(n, max) {
    if (!n) return 0;
    const r = n / max;
    return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
  }

  function paint() {
    const { y, m } = cursor;
    const first = new Date(y, m, 1, 12);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const dim = daysInMonth(y, m);
    title.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });

    let monthTotal = 0; let activeDays = 0; let max = 1;
    for (let d = 1; d <= dim; d++) {
      const t = state.daily.get(`${y}-${pad(m + 1)}-${pad(d)}`)?.total || 0;
      monthTotal += t; if (t) activeDays += 1; if (t > max) max = t;
    }
    sub.textContent = monthTotal
      ? `${fmtNumber(monthTotal)} questions · ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}`
      : 'No questions this month';

    const now = new Date();
    next.disabled = y === now.getFullYear() && m >= now.getMonth();

    clear(grid);
    for (let i = 0; i < lead; i++) grid.append(el('span', { class: 'cal-cell is-blank', 'aria-hidden': 'true' }));
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const rec = state.daily.get(key);
      const total = rec?.total || 0;
      const future = key > state.today;
      // tint each active day with its dominant subject
      let dom = null;
      if (rec) dom = Object.entries(rec.by).sort((a, b) => b[1] - a[1])[0]?.[0];
      const color = dom ? subjectOf(dom).color : null;
      const cell = el('button', {
        type: 'button',
        class: `cal-cell lvl-${level(total, max)} ${key === state.today ? 'is-today' : ''} ${future ? 'is-future' : ''}`,
        style: color ? { '--c': color } : {},
        disabled: future,
        'aria-label': `${new Date(y, m, d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${total} ${total === 1 ? 'question' : 'questions'}`,
        onClick: () => openDayScreen(key)
      }, el('span', { class: 'cal-d' }, String(d)), total ? el('span', { class: 'cal-n' }, String(total)) : null);
      grid.append(cell);
    }
  }

  bus.on('state', paint);
  bus.on('rollover', paint);
  paint();
  return { onShow() { const n = new Date(); cursor = { y: n.getFullYear(), m: n.getMonth() }; paint(); } };
}
