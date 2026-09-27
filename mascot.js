/* SolveCount — Pip, the study companion.
 * An original mascot: a soft glass pebble with a glowing visor face and a little idea-bulb antenna.
 * Mood is driven by today's count; CSS in animations.css turns parts on and off.
 */

let uidCounter = 0;

function star(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }
  return d + 'Z';
}

function sparkle(cx, cy, s) {
  return `M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`;
}

export function pipSVG(n = 0) {
  return `
<svg class="pip" data-mood="calm" viewBox="0 0 200 205" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="pb${n}" x1=".08" y1="0" x2=".92" y2="1">
      <stop offset="0" stop-color="#d3c7ff"/><stop offset=".5" stop-color="#8f7dff"/><stop offset="1" stop-color="#4b9cff"/>
    </linearGradient>
    <linearGradient id="pv${n}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2377"/><stop offset="1" stop-color="#140f43"/>
    </linearGradient>
    <radialGradient id="pg${n}">
      <stop offset="0" stop-color="#9ff5ff" stop-opacity=".6"/><stop offset="1" stop-color="#9ff5ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pbulb${n}">
      <stop offset="0" stop-color="#fff7c2"/><stop offset="1" stop-color="#ffc63d"/>
    </radialGradient>
  </defs>

  <ellipse class="pip-shadow" cx="100" cy="196" rx="50" ry="7" fill="#05031a" opacity=".28"/>

  <g class="pip-bob">
    <g class="pip-halo"><ellipse cx="100" cy="22" rx="32" ry="7.5" fill="none" stroke="#ffd65c" stroke-width="4.5"/></g>

    <g class="pip-antenna">
      <path d="M100 38Q98 21 113 14" stroke="#b9abff" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle class="bulb-glow" cx="114" cy="13" r="16" fill="#ffd65c" opacity=".3"/>
      <circle class="bulb" cx="114" cy="13" r="8.5" fill="url(#pbulb${n})"/>
    </g>

    <g class="pip-crown">
      <path d="M74 44L78 17L91 30L100 10L109 30L122 17L126 44Z" fill="#ffd65c" stroke="#ffb400" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="100" cy="31" r="4" fill="#ff7eb6"/><circle cx="84" cy="36" r="2.6" fill="#46c8ff"/><circle cx="116" cy="36" r="2.6" fill="#46c8ff"/>
    </g>

    <g class="arm arm-l" style="transform-origin:42px 120px"><ellipse cx="26" cy="124" rx="15" ry="10.5" fill="url(#pb${n})"/></g>
    <g class="arm arm-r" style="transform-origin:158px 120px"><ellipse cx="174" cy="124" rx="15" ry="10.5" fill="url(#pb${n})"/></g>
    <ellipse cx="76" cy="178" rx="17" ry="9.5" fill="#5b50d8"/>
    <ellipse cx="124" cy="178" rx="17" ry="9.5" fill="#5b50d8"/>

    <path class="pip-body" d="M100 32C145 32 172 63 172 106C172 150 143 177 100 177C57 177 28 150 28 106C28 63 55 32 100 32Z"
      fill="url(#pb${n})" stroke="rgba(255,255,255,.4)" stroke-width="2"/>
    <path d="M54 66Q68 45 98 42" stroke="#fff" stroke-opacity=".6" stroke-width="7" fill="none" stroke-linecap="round"/>
    <ellipse cx="146" cy="150" rx="16" ry="8" fill="#fff" opacity=".12" transform="rotate(-35 146 150)"/>

    <rect x="45" y="79" width="110" height="72" rx="36" fill="url(#pv${n})" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>

    <g class="cheeks"><ellipse cx="60" cy="131" rx="8" ry="5" fill="#ff7eb6" opacity=".6"/><ellipse cx="140" cy="131" rx="8" ry="5" fill="#ff7eb6" opacity=".6"/></g>

    <g class="eyes-open">
      <g class="eye"><ellipse cx="76" cy="110" rx="15" ry="18" fill="url(#pg${n})"/><ellipse cx="76" cy="110" rx="8" ry="11" fill="#9ff5ff"/><circle cx="73" cy="105" r="3.2" fill="#fff"/></g>
      <g class="eye"><ellipse cx="124" cy="110" rx="15" ry="18" fill="url(#pg${n})"/><ellipse cx="124" cy="110" rx="8" ry="11" fill="#9ff5ff"/><circle cx="121" cy="105" r="3.2" fill="#fff"/></g>
    </g>
    <g class="eyes-happy" fill="none" stroke="#9ff5ff" stroke-width="6" stroke-linecap="round">
      <path d="M65 115Q76 97 87 115"/><path d="M113 115Q124 97 135 115"/>
    </g>
    <g class="eyes-star">
      <path d="${star(76, 108, 15, 6.5)}" fill="#ffe27a" stroke="#ffe27a" stroke-width="2" stroke-linejoin="round"/>
      <path d="${star(124, 108, 15, 6.5)}" fill="#ffe27a" stroke="#ffe27a" stroke-width="2" stroke-linejoin="round"/>
    </g>

    <g fill="none" stroke="#9ff5ff" stroke-width="4.5" stroke-linecap="round">
      <path class="m-calm" d="M92 129Q100 134 108 129"/>
      <path class="m-smile" d="M88 127Q100 142 112 127"/>
    </g>
    <path class="m-open" d="M87 125Q100 151 113 125Z" fill="#9ff5ff"/>
    <path class="m-open m-tongue" d="M94 135Q100 141 106 135Q100 131 94 135Z" fill="#ff7eb6"/>
  </g>

  <g class="sparkles">
    <path class="sp sp1" d="${sparkle(30, 50, 10)}" fill="#fff"/>
    <path class="sp sp2" d="${sparkle(172, 58, 8)}" fill="#ffe27a"/>
    <path class="sp sp3" d="${sparkle(20, 150, 7)}" fill="#ffe27a"/>
    <path class="sp sp4" d="${sparkle(182, 148, 10)}" fill="#fff"/>
  </g>
</svg>`;
}

export function createMascot(host) {
  uidCounter += 1;
  host.classList.add('pip-wrap');
  host.innerHTML = pipSVG(uidCounter);
  const root = host.firstElementChild;
  let timer = null;
  return {
    root,
    setMood(mood) { root.dataset.mood = mood; },
    react(kind = 'jump') {
      host.classList.remove('r-jump', 'r-spin', 'r-wiggle');
      void host.offsetWidth; // restart animation
      host.classList.add(`r-${kind}`);
      clearTimeout(timer);
      timer = setTimeout(() => host.classList.remove(`r-${kind}`), 1300);
    }
  };
}

/* ---------- mood + messages ---------- */
export function moodFor(n) {
  if (n <= 0) return 'calm';
  if (n < 5) return 'happy';
  if (n < 10) return 'excited';
  if (n < 25) return 'celebrating';
  if (n < 50) return 'wild';
  if (n < 100) return 'special';
  return 'major';
}

const MSG = {
  idle0: ['Ready when you are.', 'A fresh page. No rush.', 'Your study trail starts with one.', 'Whenever you are.'],
  idleN: ['Welcome back.', 'Your study trail is growing.', 'Still with you.', 'Pick up whenever you like.'],
  add: ['That one counts.', 'Nice start.', "You're moving.", 'Your study trail is growing.', 'Another one down.', 'Clean work.', 'Step by step.', 'Counted.', 'Nicely done.', 'Look at you go.'],
  quick: ['Quick one, counted.', 'That counts too.', 'Logged. Keep going.', 'Counted.', 'Easy. Next?'],
  tier: {
    happy: ["You're moving.", 'That one counts.', 'Nice start.'],
    excited: ["You're on a roll.", 'Getting into flow.', 'Nice rhythm today.'],
    celebrating: ["Look at that streak of questions!", "You're in the zone.", 'Great pace. Really.'],
    wild: ["This is a big session.", "Wow, you're flying.", 'So much thinking today.'],
    special: ['What a day of solving.', 'Seriously impressive focus.', 'Fifty and counting.'],
    major: ['Legend day.', 'Triple digits. Wow.', 'Unstoppable.']
  },
  milestone: {
    1: 'First one today. Nice start.',
    5: 'Five! Nice rhythm.',
    10: 'Double digits!',
    25: '25 questions. Wow.',
    50: 'Fifty! That is a big day.',
    100: 'One hundred!! Incredible.'
  }
};

const lastPick = new Map();
function pick(pool, key) {
  if (pool.length === 1) return pool[0];
  let i;
  do { i = Math.floor(Math.random() * pool.length); } while (i === lastPick.get(key));
  lastPick.set(key, i);
  return pool[i];
}

export function idleMessage(count) {
  return count > 0 ? pick(MSG.idleN, 'idleN') : pick(MSG.idle0, 'idle0');
}

export function addMessage({ count, kind, milestone }) {
  if (milestone && MSG.milestone[milestone]) return MSG.milestone[milestone];
  if (milestone) return `${milestone}! Amazing.`;
  if (kind === 'quick' && Math.random() < 0.6) return pick(MSG.quick, 'quick');
  const tier = MSG.tier[moodFor(count)];
  if (tier && Math.random() < 0.4) return pick(tier, `tier-${moodFor(count)}`);
  return pick(MSG.add, 'add');
}
