/* SolveCount — Statistics screen: simple, real numbers. */
import { el, clear, bus, addDays, weekStart, fmtDay, fmtNumber, parseDay } from './utils.js';
import { state, subjectOf, todayTotal, dayTotal } from './state.js';
import { icon, segmented } from './ui.js';

function sumDays(startKey, endKey) {
  let n = 0;
  let k = startKey;
  let guard = 0;
  while (k <= endKey && guard++ < 800) { n += dayTotal(k); k = addDays(k, 1); }
  return n;
}

function bySubject(startKey, endKey) {
  const acc = {};
  let k = startKey;
  let guard = 0;
  while (k <= endKey && guard++ < 4000) {
    const d = state.daily.get(k);
    if (d) for (const [id, n] of Object.entries(d.by)) acc[id] = (acc[id] || 0) + n;
    k = addDays(k, 1);
  }
  return acc;
}

function bestDay() {
  let best = null;
  for (const d of state.daily.values()) if (!best || d.total > best.total) best = d;
  return best;
}

export function initStats(host) {
  let weekOffset = 0;
  let distRange = 'week';
  let animWeek = true;
  let animDist = true;

  const summary = el('section', { class: 'stat-grid glass', 'aria-label': 'Totals' });
  const weekBox = el('section', { class: 'chart-box', 'aria-label': 'Week chart' });
  const distBox = el('section', { class: 'chart-box', 'aria-label': 'Subject distribution' });

  clear(host);
  host.append(
    el('header', { class: 'view-head' }, el('h1', { class: 'view-title' }, 'Statistics')),
    summary, weekBox, distBox);

  function paintSummary() {
    const today = state.today;
    const wk = sumDays(weekStart(today), today);
    const mo = sumDays(today.slice(0, 8) + '01', today);
    const best = bestDay();
    const cell = (value, label, sub) => el('div', { class: 'stat' },
      el('b', { class: 'stat-n' }, fmtNumber(value)), el('span', { class: 'stat-l' }, label), sub ? el('small', {}, sub) : null);
    clear(summary);
    summary.append(
      cell(todayTotal(), 'Today'),
      cell(wk, 'This week'),
      cell(mo, 'This month'),
      cell(state.totalAll, 'All time'),
      cell(state.streak.current, state.streak.current === 1 ? 'Day streak' : 'Day streak', state.streak.best > state.streak.current ? `Best ${state.streak.best}` : null),
      cell(best ? best.total : 0, 'Best day', best ? fmtDay(best.day, { day: 'numeric', month: 'short' }) : null));
  }

  function paintWeek() {
    const start = addDays(weekStart(state.today), weekOffset * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const totals = days.map((d) => dayTotal(d));
    const max = Math.max(1, ...totals);
    const weekSum = totals.reduce((a, b) => a + b, 0);
    const range = weekOffset === 0 ? 'This week'
      : `${fmtDay(days[0], { day: 'numeric', month: 'short' })} – ${fmtDay(days[6], { day: 'numeric', month: 'short' })}`;

    const prev = el('button', { class: 'icon-btn', 'aria-label': 'Previous week', onClick: () => { weekOffset -= 1; animWeek = true; paintWeek(); } }, icon('left', 20));
    const next = el('button', { class: 'icon-btn', 'aria-label': 'Next week', disabled: weekOffset >= 0, onClick: () => { weekOffset += 1; animWeek = true; paintWeek(); } }, icon('right', 20));

    const bars = el('div', { class: `bars ${animWeek ? '' : 'no-anim'}` });
    days.forEach((d, i) => {
      const day = state.daily.get(d);
      const future = d > state.today;
      const col = el('div', { class: `bar-col ${d === state.today ? 'is-today' : ''} ${future ? 'is-future' : ''}`, style: { '--i': i } });
      const stack = el('div', { class: 'bar-stack' });
      if (day && day.total) {
        const h = Math.max(6, (day.total / max) * 100);
        const inner = el('div', { class: 'bar-fill', style: { height: `${h}%` }, role: 'img', 'aria-label': `${fmtDay(d)}: ${day.total} questions` });
        Object.entries(day.by).sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
          inner.append(el('i', { class: 'bar-seg', style: { flexGrow: n, '--c': subjectOf(id).color } }));
        });
        stack.append(inner);
      } else {
        stack.append(el('div', { class: 'bar-empty' }));
      }
      col.append(
        el('span', { class: 'bar-val' }, day && day.total ? String(day.total) : ''),
        stack,
        el('span', { class: 'bar-day' }, parseDay(d).toLocaleDateString([], { weekday: 'short' })));
      bars.append(col);
    });

    clear(weekBox);
    weekBox.append(
      el('div', { class: 'chart-head' },
        el('div', {}, el('h2', { class: 'section-title' }, range), el('p', { class: 'chart-sub' }, `${fmtNumber(weekSum)} ${weekSum === 1 ? 'question' : 'questions'}`)),
        el('div', { class: 'chart-nav' }, prev, next)),
      bars);
    animWeek = false;
  }

  function paintDist() {
    const today = state.today;
    let acc;
    if (distRange === 'week') acc = bySubject(weekStart(today), today);
    else if (distRange === 'month') acc = bySubject(today.slice(0, 8) + '01', today);
    else acc = bySubject('2000-01-01', today);
    const rows = Object.entries(acc).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, [, n]) => s + n, 0);

    const seg = segmented({
      label: 'Range', value: distRange,
      options: [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }],
      onChange: (v) => { distRange = v; animDist = true; paintDist(); }
    });

    const R = 15.9155;
    const ring = el('div', { class: 'donut' });
    let svg = `<svg viewBox="0 0 42 42" role="img" aria-label="Subject distribution"><circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--track)" stroke-width="5.2"/>`;
    let offset = 25; // start at 12 o'clock
    for (const [id, n] of rows) {
      const pct = (n / total) * 100;
      const gap = rows.length > 1 ? 1.2 : 0;
      svg += `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${subjectOf(id).color}" stroke-width="5.2" stroke-linecap="round" stroke-dasharray="${Math.max(0.1, pct - gap)} ${100 - Math.max(0.1, pct - gap)}" stroke-dashoffset="${offset}"/>`;
      offset -= pct;
    }
    svg += '</svg>';
    ring.innerHTML = svg;
    ring.append(el('div', { class: 'donut-mid' }, el('b', {}, fmtNumber(total)), el('span', {}, 'questions')));

    const legend = el('ul', { class: 'legend' });
    if (!rows.length) legend.append(el('li', { class: 'legend-empty' }, 'Solve a question and your mix shows up here.'));
    for (const [id, n] of rows) {
      const s = subjectOf(id);
      legend.append(el('li', { style: { '--c': s.color } },
        el('i', { class: 'legend-dot' }), el('span', { class: 'legend-name' }, `${s.emoji} ${s.name}`),
        el('b', {}, fmtNumber(n)), el('span', { class: 'legend-pct' }, `${Math.round((n / total) * 100)}%`)));
    }

    clear(distBox);
    distBox.append(
      el('div', { class: 'chart-head' }, el('h2', { class: 'section-title' }, 'Subjects')),
      seg,
      el('div', { class: `dist ${animDist ? '' : 'no-anim'}` }, ring, legend));
    animDist = false;
  }

  function paint() { paintSummary(); paintWeek(); paintDist(); }

  bus.on('state', paint);
  paint();
  return { onShow() { animWeek = true; animDist = true; weekOffset = 0; paint(); } };
}
