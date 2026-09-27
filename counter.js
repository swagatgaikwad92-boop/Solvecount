/* SolveCount — big rolling counter (odometer). Digits roll upward when the count increases. */
import { el, motionLevel } from './utils.js';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // two runs so wraps (9 → 0) keep rolling upward

export class RollingNumber {
  constructor(host) {
    this.host = host;
    this.cols = [];
    this.value = null;
    this.label = el('span', { class: 'sr-only' }, '0');
    this.wrap = el('span', { class: 'roll', 'aria-hidden': 'true' });
    host.append(this.label, this.wrap);
  }

  _makeCol(startDigit = 0) {
    const inner = el('span', { class: 'roll-col' }, DIGITS.map((d) => el('span', { class: 'roll-cell' }, String(d))));
    const col = el('span', { class: 'roll-digit' }, inner);
    const state = { col, inner, digit: startDigit };
    inner.style.setProperty('--i', startDigit);
    inner.addEventListener('transitionend', () => {
      if (state.digit >= 10) { // second run finished: snap back to the first run, same digit
        inner.style.transition = 'none';
        state.digit -= 10;
        inner.style.setProperty('--i', state.digit);
        void inner.offsetHeight;
        inner.style.transition = '';
      }
    });
    return state;
  }

  set(value, { animate = true } = {}) {
    const n = Math.max(0, Math.floor(value));
    const digits = String(n).split('').map(Number);
    const anim = animate && motionLevel() !== 'off' && this.value !== null;
    const prev = this.value ?? 0;
    this.label.textContent = String(n);

    // grow / shrink columns (aligned on the right edge)
    while (this.cols.length < digits.length) {
      const c = this._makeCol(anim ? 0 : digits[digits.length - this.cols.length - 1]);
      c.col.classList.add(anim ? 'is-new' : 'is-still');
      this.cols.unshift(c);
      this.wrap.prepend(c.col);
    }
    while (this.cols.length > digits.length) {
      const c = this.cols.shift();
      c.col.remove();
    }

    if (anim) void this.wrap.offsetWidth; // let new columns paint at 0 before rolling
    this.cols.forEach((c, i) => {
      const target = digits[i];
      if (!anim) {
        c.inner.style.transition = 'none';
        c.inner.style.setProperty('--i', target);
        c.digit = target;
        void c.inner.offsetHeight;
        c.inner.style.transition = '';
        return;
      }
      const goingUp = n >= prev;
      // counting up: if the digit would have to roll backwards (9 → 0), continue into the second run
      let index = (c.digit >= 10 ? 10 : 0) + target;
      if (goingUp && index < c.digit) index += 10;
      if (index > 19) index = target;
      const dur = motionLevel() === 'low' ? 260 : 620 + Math.min(300, i * 60);
      c.inner.style.transitionDuration = `${dur}ms`;
      c.inner.style.setProperty('--i', index);
      c.digit = index;
    });

    this.value = n;
    this.wrap.classList.remove('bump');
    if (anim) { void this.wrap.offsetWidth; this.wrap.classList.add('bump'); }
  }
}
