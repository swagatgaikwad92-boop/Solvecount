/* SolveCount — the add flows.
 *   +1 with proof : camera → photo → subject (+ optional difficulty) → "Add 1 question"
 *   Quick +1      : counted immediately, no photo
 */
import { el, bus, clear } from './utils.js';
import { openSheet, closeOverlay, icon, toast } from './ui.js';
import { Camera, cameraSupported, cameraErrorMessage, compressFile } from './camera.js';
import { state, addQuestion, removeQuestion, defaultSubjectId, subjectOf, put } from './state.js';

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' }
];

/* ---------- subject chips (shared) ---------- */
export function subjectChips({ selectedId, onSelect }) {
  const wrap = el('div', { class: 'subj-chips', role: 'radiogroup', 'aria-label': 'Subject' });
  const paint = (id) => {
    wrap.querySelectorAll('.subj-chip').forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
  };
  for (const s of state.active) {
    wrap.append(el('button', {
      type: 'button', class: 'subj-chip', role: 'radio', dataset: { id: s.id }, style: { '--c': s.color },
      onClick: () => { paint(s.id); onSelect(s.id); }
    }, el('span', { class: 'subj-emoji' }, s.emoji), el('span', { class: 'subj-name' }, s.name)));
  }
  paint(selectedId);
  return wrap;
}

/* ---------- small subject picker sheet ---------- */
export function openSubjectPicker({ title = 'Pick a subject', selectedId, onPick }) {
  const box = el('div', { class: 'picker' });
  const o = openSheet(box, { title });
  box.append(subjectChips({
    selectedId,
    onSelect: (id) => { onPick(id); setTimeout(() => closeOverlay(o), 120); }
  }));
  return o;
}

/* ---------- Quick +1 ---------- */
async function doQuick(subjectId) {
  bus.emit('add-start');
  try {
    const res = await addQuestion({ subjectId });
    bus.emit('question-added', { ...res, kind: 'quick' });
    const s = subjectOf(subjectId);
    toast(`+1 ${s.emoji} ${s.name}`, {
      action: {
        label: 'Undo',
        onClick: async () => { await removeQuestion(res.entry.id); toast('Removed'); }
      }
    });
  } catch (err) {
    console.error(err);
    bus.emit('add-failed');
    toast('Could not save that one. Try again.', { tone: 'warn' });
  }
}

export function quickAdd() {
  const last = state.settings.lastSubject;
  if (last && state.active.some((s) => s.id === last)) return doQuick(last);
  // First time only: ask which subject quick adds should go to.
  openSubjectPicker({
    title: 'Which subject for quick adds?',
    selectedId: null,
    onPick: (id) => setTimeout(() => doQuick(id), 200)
  });
  return null;
}

export function pickQuickSubject() {
  openSubjectPicker({
    title: 'Subject for the next question',
    selectedId: defaultSubjectId(),
    onPick: (id) => put('lastSubject', id)
  });
}

/* ---------- +1 with proof ---------- */
export function openProofFlow() {
  let photo = null;
  let previewURL = null;
  let camera = null;
  let subjectId = defaultSubjectId();
  let difficulty = null;

  const root = el('div', { class: 'flow' });
  const o = openSheet(root, {
    title: 'Snap the question', tall: true, className: 'flow-sheet',
    onClose: () => {
      camera?.stop();
      if (previewURL) URL.revokeObjectURL(previewURL);
    }
  });

  const galleryInput = el('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  const appInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  root.append(galleryInput, appInput);

  async function onFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      root.classList.add('is-busy');
      photo = await compressFile(file);
      camera?.stop();
      showDetails();
    } catch (err) {
      toast(err.message || 'Could not read that photo.', { tone: 'warn' });
    } finally {
      root.classList.remove('is-busy');
    }
  }
  galleryInput.addEventListener('change', onFile);
  appInput.addEventListener('change', onFile);

  const stage = el('div', { class: 'flow-stage' });
  root.append(stage);

  /* ----- step 1: camera ----- */
  function showCamera() {
    photo = null;
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
    o.setTitle('Snap the question');
    clear(stage);

    const video = el('video', { class: 'cam-video', playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    const msg = el('div', { class: 'cam-msg', hidden: true });
    const flash = el('div', { class: 'cam-flash', 'aria-hidden': 'true' });
    const view = el('div', { class: 'cam-view' }, video, msg, flash);

    const flipBtn = el('button', { type: 'button', class: 'cam-side', 'aria-label': 'Switch camera', hidden: true, onClick: async () => {
      try { await camera.flip(); } catch (err) { showFallback(cameraErrorMessage(err)); }
    } }, icon('refresh', 24), el('small', {}, 'Flip'));

    const shutter = el('button', { type: 'button', class: 'shutter', 'aria-label': 'Take photo', disabled: true, onClick: capture }, el('span'));
    const galleryBtn = el('button', { type: 'button', class: 'cam-side', 'aria-label': 'Choose from gallery', onClick: () => galleryInput.click() },
      icon('image', 24), el('small', {}, 'Gallery'));
    const controls = el('div', { class: 'cam-controls' }, galleryBtn, shutter, flipBtn);
    const cancel = el('button', { type: 'button', class: 'btn btn-ghost cam-cancel', onClick: () => closeOverlay(o) }, 'Cancel');

    stage.append(view, controls, cancel);

    function showFallback(text) {
      msg.hidden = false;
      clear(msg);
      msg.append(
        el('div', { class: 'cam-msg-ico' }, icon('camera', 34)),
        el('p', {}, text),
        el('div', { class: 'cam-msg-actions' },
          el('button', { type: 'button', class: 'btn btn-primary', onClick: () => appInput.click() }, 'Open camera app'),
          el('button', { type: 'button', class: 'btn btn-glass', onClick: () => galleryInput.click() }, 'Choose from gallery'),
          cameraSupported() ? el('button', { type: 'button', class: 'btn btn-ghost', onClick: startCamera }, 'Try camera again') : null));
      shutter.disabled = true;
    }

    async function startCamera() {
      msg.hidden = true;
      if (!cameraSupported()) {
        showFallback('Live camera is not available here. You can open your camera app or pick a photo.');
        return;
      }
      try {
        camera = camera || new Camera(video);
        camera.video = video;
        await camera.start();
        shutter.disabled = false;
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        flipBtn.hidden = devices.filter((d) => d.kind === 'videoinput').length < 2;
      } catch (err) {
        showFallback(cameraErrorMessage(err));
      }
    }

    async function capture() {
      if (shutter.disabled) return;
      shutter.disabled = true;
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      try {
        photo = await camera.snap();
        camera.stop();
        showDetails();
      } catch (err) {
        toast(err.message || 'Could not take the photo.', { tone: 'warn' });
        shutter.disabled = false;
      }
    }

    startCamera();
  }

  /* ----- step 2: preview + subject + difficulty + confirm ----- */
  function showDetails() {
    o.setTitle('Which subject?');
    clear(stage);
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(photo.blob);

    const preview = el('div', { class: 'flow-preview' },
      el('img', { src: previewURL, alt: 'Your proof photo' }),
      el('button', { type: 'button', class: 'chip-btn preview-retake', onClick: showCamera }, icon('refresh', 16), 'Retake'));

    const chips = subjectChips({ selectedId: subjectId, onSelect: (id) => { subjectId = id; } });

    const diffWrap = el('div', { class: 'diff', role: 'group', 'aria-label': 'Difficulty (optional)' });
    for (const d of DIFFICULTIES) {
      diffWrap.append(el('button', {
        type: 'button', class: `diff-btn diff-${d.value}`, 'aria-pressed': 'false', dataset: { v: d.value },
        onClick: () => {
          difficulty = difficulty === d.value ? null : d.value;
          diffWrap.querySelectorAll('.diff-btn').forEach((b) => {
            const on = b.dataset.v === difficulty;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
          });
        }
      }, d.label));
    }

    const confirmBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg confirm', onClick: confirm }, 'Add 1 question');
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeOverlay(o) }, 'Cancel');

    stage.append(
      preview,
      el('p', { class: 'flow-label' }, 'Subject'),
      chips,
      el('p', { class: 'flow-label' }, 'How hard was it? ', el('span', { class: 'muted' }, 'optional')),
      diffWrap,
      el('div', { class: 'flow-actions' }, confirmBtn, cancelBtn));

    async function confirm() {
      confirmBtn.disabled = true;
      confirmBtn.classList.add('is-loading');
      bus.emit('add-start');
      try {
        const res = await addQuestion({ subjectId, difficulty, photo });
        closeOverlay(o);
        setTimeout(() => bus.emit('question-added', { ...res, kind: 'proof' }), 260);
      } catch (err) {
        console.error(err);
        bus.emit('add-failed');
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('is-loading');
        toast('Could not save. Your device storage may be full.', { tone: 'warn' });
      }
    }
  }

  showCamera();
  return o;
}
