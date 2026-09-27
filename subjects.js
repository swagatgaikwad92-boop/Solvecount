/* SolveCount — subject manager: add, rename, recolor, change emoji, reorder, delete */
import { el, clear, bus, uid, firstGrapheme } from './utils.js';
import { state, saveSubject, reorderSubjects, deleteSubject } from './state.js';
import { openScreen, openSheet, closeOverlay, confirmDialog, icon, toast, subjectDot } from './ui.js';

const EMOJIS = ['📐', '🧮', '➗', '📊', '⚛️', '🔭', '⚡', '🧲', '🧪', '⚗️', '🔬', '🧬', '🌱', '🌿', '🦠', '🫀',
  '📖', '✍️', '📝', '🗣️', '🌍', '🏛️', '⏳', '💻', '🤖', '🎨', '🎵', '⚽', '💰', '📈', '⚖️', '🧠',
  '🔢', '🔤', '🧩', '🗺️', '📚', '🎓', '⭐', '✨'];

const COLORS = ['#8b6bff', '#3fa4ff', '#2fd48f', '#ff7eb6', '#ffb84d', '#9aa4c7',
  '#ff6b6b', '#22d3ee', '#a3e635', '#f472b6', '#fb923c', '#c084fc'];

export function openSubjectsScreen() {
  let unsub = () => {};
  openScreen({
    title: 'Subjects',
    className: 'subjects-screen',
    onClose: () => unsub(),
    build: (body) => {
      const render = () => {
        clear(body);
        body.append(el('p', { class: 'screen-hint' }, 'Tap a subject to rename it, change its color or emoji. Colors are used everywhere in the app.'));
        const list = el('ul', { class: 'subj-list' });
        const ids = state.active.map((s) => s.id);
        state.active.forEach((s, i) => {
          list.append(el('li', { class: 'subj-row glass-flat', style: { '--c': s.color } },
            el('button', { class: 'subj-main', type: 'button', onClick: () => openSubjectEditor(s), 'aria-label': `Edit ${s.name}` },
              subjectDot(s, 44), el('span', { class: 'subj-row-name' }, s.name), icon('right', 18, 'subj-chev')),
            el('div', { class: 'subj-move' },
              el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Move ${s.name} up`, disabled: i === 0, onClick: () => move(ids, i, -1) }, icon('up', 18)),
              el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Move ${s.name} down`, disabled: i === ids.length - 1, onClick: () => move(ids, i, 1) }, icon('down', 18)))));
        });
        body.append(list, el('button', { class: 'btn btn-primary btn-lg add-subject', type: 'button', onClick: () => openSubjectEditor(null) }, icon('plus', 20), 'Add subject'));
      };
      render();
      unsub = bus.on('state', render);
    }
  });
}

function move(ids, i, d) {
  const next = [...ids];
  const j = i + d;
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  reorderSubjects(next);
}

export function openSubjectEditor(subject) {
  const isNew = !subject;
  const draft = subject
    ? { ...subject }
    : { id: `s-${uid().slice(0, 8)}`, name: '', color: COLORS[state.active.length % COLORS.length], emoji: '📚' };

  const preview = el('div', { class: 'ed-preview' });
  const nameInput = el('input', {
    class: 'field', type: 'text', maxlength: '24', placeholder: 'Subject name', value: draft.name,
    autocomplete: 'off', 'aria-label': 'Subject name', 'data-autofocus': ''
  });
  const err = el('p', { class: 'field-err', hidden: true }, 'Give it a name.');
  const emojiGrid = el('div', { class: 'emoji-grid', role: 'radiogroup', 'aria-label': 'Emoji' });
  const emojiInput = el('input', { class: 'field emoji-field', type: 'text', maxlength: '8', placeholder: 'Or type any emoji', 'aria-label': 'Custom emoji' });
  const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
  const colorInput = el('input', { class: 'color-input', type: 'color', value: draft.color, 'aria-label': 'Custom color' });

  const paintPreview = () => {
    preview.style.setProperty('--c', draft.color);
    clear(preview);
    preview.append(subjectDot(draft, 52), el('b', {}, nameInput.value.trim() || 'Subject name'));
  };
  const paintEmoji = () => emojiGrid.querySelectorAll('.emoji-btn').forEach((b) => {
    const on = b.dataset.e === draft.emoji;
    b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on));
  });
  const paintColor = () => {
    swatches.querySelectorAll('.swatch[data-c]').forEach((b) => {
      const on = b.dataset.c.toLowerCase() === draft.color.toLowerCase();
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on));
    });
    colorInput.value = draft.color;
  };

  for (const e of EMOJIS) {
    emojiGrid.append(el('button', {
      type: 'button', class: 'emoji-btn', role: 'radio', dataset: { e }, 'aria-label': e,
      onClick: () => { draft.emoji = e; emojiInput.value = ''; paintEmoji(); paintPreview(); }
    }, e));
  }
  for (const c of COLORS) {
    swatches.append(el('button', {
      type: 'button', class: 'swatch', role: 'radio', dataset: { c }, style: { '--c': c }, 'aria-label': `Color ${c}`,
      onClick: () => { draft.color = c; paintColor(); paintPreview(); }
    }));
  }
  swatches.append(el('label', { class: 'swatch swatch-custom', title: 'Custom color' }, icon('palette', 18), colorInput));

  nameInput.addEventListener('input', () => { err.hidden = true; paintPreview(); });
  emojiInput.addEventListener('input', () => {
    const g = firstGrapheme(emojiInput.value);
    if (g) { draft.emoji = g; paintEmoji(); paintPreview(); }
  });
  colorInput.addEventListener('input', () => { draft.color = colorInput.value; paintColor(); paintPreview(); });

  const canDelete = !isNew && state.active.length > 1;
  const form = el('div', { class: 'editor' },
    preview,
    el('label', { class: 'flow-label', for: 'subjName' }, 'Name'), nameInput, err,
    el('p', { class: 'flow-label' }, 'Emoji'), emojiGrid, emojiInput,
    el('p', { class: 'flow-label' }, 'Color'), swatches);
  nameInput.id = 'subjName';

  const sheet = openSheet(form, { title: isNew ? 'New subject' : 'Edit subject', tall: true });

  const save = el('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: async () => {
    const name = nameInput.value.trim();
    if (!name) { err.hidden = false; nameInput.focus(); return; }
    await saveSubject({ ...draft, name });
    closeOverlay(sheet);
    toast(isNew ? `${draft.emoji} ${name} added` : 'Subject updated', { duration: 1800 });
  } }, isNew ? 'Add subject' : 'Save changes');

  form.append(el('div', { class: 'flow-actions' }, save,
    canDelete ? el('button', { class: 'btn btn-danger-ghost', type: 'button', onClick: async () => {
      const yes = await confirmDialog({
        title: `Delete ${draft.name}?`,
        message: 'Your past questions stay in History under this subject. You just will not be able to pick it for new ones.',
        confirmText: 'Delete subject', danger: true
      });
      if (!yes) return;
      try {
        await deleteSubject(draft.id);
        closeOverlay(sheet);
        toast('Subject deleted', { duration: 1800 });
      } catch (e) { toast(e.message, { tone: 'warn' }); }
    } }, 'Delete subject') : null));

  paintEmoji(); paintColor(); paintPreview();
  return sheet;
}
