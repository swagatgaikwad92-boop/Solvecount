/* SolveCount — "Add to Home screen" support */
import { bus } from './utils.js';

let deferred = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  bus.emit('install-state');
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  bus.emit('install-state');
});

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canPromptInstall = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  bus.emit('install-state');
  return outcome;
}
