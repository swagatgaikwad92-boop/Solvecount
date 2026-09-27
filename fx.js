/* SolveCount — success effects (visual only, no audio). Transform/opacity only for smooth mid-range Android. */
import { el, motionLevel } from './utils.js';

const layer = () => document.getElementById('fx');
const scale = () => (motionLevel() === 'full' ? 1 : motionLevel() === 'low' ? 0.4 : 0);

const PALETTE = ['#8b6bff', '#46c8ff', '#ff7eb6', '#ffd65c', '#3ddc97', '#ffffff'];

export function burst(x, y, { count = 16, colors = PALETTE, power = 1 } = {}) {
  const k = scale();
  if (!k) return;
  const n = Math.max(3, Math.round(count * k));
  const host = layer();
  for (let i = 0; i < n; i++) {
    const size = 6 + Math.random() * 6;
    const p = el('i', { class: 'fx-p' });
    p.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;background:${colors[i % colors.length]};border-radius:${Math.random() > 0.5 ? '50%' : '3px'}`;
    host.append(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = (50 + Math.random() * 90) * power;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 46 * power;
    const rot = (Math.random() - 0.5) * 600;
    const anim = p.animate([
      { transform: `translate(${x}px,${y}px) scale(.3) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x + dx}px,${y + dy}px) scale(1) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x + dx * 1.08}px,${y + dy + 80}px) scale(.5) rotate(${rot}deg)`, opacity: 0 }
    ], { duration: 750 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.3,1)' });
    anim.onfinish = () => p.remove();
  }
}

export function floatText(x, y, text, color = '#fff') {
  if (!scale()) return;
  const t = el('span', { class: 'fx-float' }, text);
  t.style.color = color;
  layer().append(t);
  t.animate([
    { transform: `translate(${x}px,${y}px) translate(-50%,0) scale(.7)`, opacity: 0 },
    { transform: `translate(${x}px,${y - 34}px) translate(-50%,0) scale(1.15)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${x}px,${y - 96}px) translate(-50%,0) scale(1)`, opacity: 0 }
  ], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => t.remove();
}

/** Confetti rain for milestones. */
export function confetti(intensity = 1) {
  const k = scale();
  if (!k) return;
  const n = Math.round(56 * k * intensity);
  const host = layer();
  const w = window.innerWidth; const h = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const size = 7 + Math.random() * 7;
    const p = el('i', { class: 'fx-p' });
    p.style.cssText = `width:${size}px;height:${size * (Math.random() > 0.5 ? 1 : 0.5)}px;background:${PALETTE[i % PALETTE.length]};border-radius:2px`;
    host.append(p);
    const x0 = Math.random() * w;
    const sway = (Math.random() - 0.5) * 160;
    const delay = Math.random() * 500;
    p.animate([
      { transform: `translate(${x0}px,${-20}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x0 + sway}px,${h * 0.5}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x0 + sway * 1.4}px,${h + 20}px) rotate(${720 + Math.random() * 360}deg)`, opacity: 0.9 }
    ], { duration: 1700 + Math.random() * 900, delay, easing: 'cubic-bezier(.3,.5,.5,1)', fill: 'backwards' })
      .onfinish = () => p.remove();
  }
}

/** Big centered banner: "50!" */
export function banner(title, sub = '') {
  const node = el('div', { class: 'fx-banner' }, el('b', {}, title), sub ? el('span', {}, sub) : null);
  layer().append(node);
  const k = scale();
  const anim = node.animate([
    { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 },
    { transform: 'translate(-50%,-56%) scale(.98)', opacity: 0 }
  ], { duration: k ? 2100 : 1600, easing: 'ease-out' });
  anim.onfinish = () => node.remove();
}

export function haptic(ms = 14) {
  if (motionLevel() === 'off') return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}
