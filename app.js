/* SolveCount — bootstrap, tab navigation, service worker */
import './install.js';
import { el, $, bus } from './utils.js';
import { load, checkRollover } from './state.js';
import { icon, toast } from './ui.js';
import { applyAppearance, initSettings } from './settings.js';
import { initHome } from './home.js';
import { initHistory } from './history.js';
import { initStats } from './statistics.js';
import { startReminderLoop } from './notify.js';

const TABS = [
  { id: 'home', label: 'Today', icon: 'today' },
  { id: 'history', label: 'History', icon: 'calendar' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'sliders' }
];

const views = {};
let current = 'home';

function buildTabs() {
  const nav = $('#tabbar');
  nav.replaceChildren(...TABS.map((t) => el('button', {
    type: 'button', class: 'tab', dataset: { tab: t.id }, 'aria-label': t.label,
    onClick: () => show(t.id)
  }, el('span', { class: 'tab-pill' }, icon(t.icon, 22)), el('span', { class: 'tab-label' }, t.label))));
}

function show(name) {
  if (!views[name]) return;
  current = name;
  for (const t of TABS) {
    const section = $(`#view-${t.id}`);
    section.hidden = t.id !== name;
  }
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  window.scrollTo({ top: 0 });
  views[name].onShow?.();
}

function fatal(err) {
  console.error(err);
  $('#splash')?.remove();
  document.body.append(el('main', { class: 'fatal' },
    el('h1', {}, 'SolveCount can’t start'),
    el('p', {}, 'It needs your browser’s local storage (IndexedDB). This can be blocked in private browsing. Open SolveCount in a normal window and try again.'),
    el('button', { class: 'btn btn-primary', onClick: () => location.reload() }, 'Try again')));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('SolveCount was updated', { duration: 9000, action: { label: 'Reload', onClick: () => location.reload() } });
    hadController = true;
  });
  const go = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('Service worker not registered', e));
  // The window 'load' event may already have fired by the time we get here (boot() awaits
  // IndexedDB first), so check readyState instead of only listening for an event we could miss.
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

async function boot() {
  try {
    await load();
  } catch (err) {
    fatal(err);
    return;
  }
  applyAppearance();
  buildTabs();

  views.home = initHome($('#view-home'));
  views.history = initHistory($('#view-history'));
  views.stats = initStats($('#view-stats'));
  views.settings = initSettings($('#view-settings'));

  bus.on('nav', ({ to }) => show(to));
  show('home');

  // midnight rollover: today's counter resets, history stays
  const roll = () => { if (checkRollover()) views.home?.onShow?.(); };
  setInterval(roll, 20 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) roll(); });
  window.addEventListener('focus', roll);

  history.replaceState(null, '');
  startReminderLoop();
  registerServiceWorker();

  const splash = $('#splash');
  if (splash) {
    splash.classList.add('is-gone');
    setTimeout(() => splash.remove(), 400);
  }
  document.body.classList.add('is-ready');
}

boot();
