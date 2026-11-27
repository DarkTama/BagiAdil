/**
 * Participant management component.
 * Manages adding/removing participants with validation and quick-pick chips.
 */

import { t } from '../i18n/index.js';
import { loadQuickPickParticipants, hideQuickPickParticipant } from './storage.js';
import { showToast } from './toast.js';

const QUICK_PICK_LIMIT = 8;

let participants = [];
let containerEl = null;
let onChangeCallback = null;
let quickPickExpanded = false;
let manageQuickPick = false;
let filterText = '';

/**
 * Initialize the participants component.
 * @param {HTMLElement} el - Container element
 * @param {object} [options]
 * @param {function} [options.onChange] - Callback when participants list changes
 */
export function initParticipants(el, options = {}) {
  containerEl = el;
  participants = [];
  onChangeCallback = options.onChange || null;
  quickPickExpanded = false;
  manageQuickPick = false;
  filterText = '';
  render();
}

/**
 * Get the current list of participant names.
 * @returns {string[]}
 */
export function getParticipants() {
  return [...participants];
}

/**
 * Replace the participant list (used when loading a saved split).
 * @param {string[]} names
 */
export function setParticipants(names) {
  participants = Array.isArray(names) ? [...names] : [];
  render();
  if (onChangeCallback) {
    onChangeCallback(getParticipants());
  }
}

/**
 * Refresh the quick-pick suggestions slot if mounted.
 */
export function refreshQuickPick() {
  if (containerEl) renderQuickPick();
}

function render() {
  containerEl.innerHTML = '';

  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group';

  const label = document.createElement('label');
  label.setAttribute('for', 'participant-name');
  label.textContent = t('section.participants');
  inputGroup.appendChild(label);

  const row = document.createElement('div');
  row.className = 'input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'participant-name';
  input.placeholder = t('placeholder.addParticipant');
  input.autocomplete = 'off';
  input.value = filterText;
  row.appendChild(input);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary participants-add';
  addBtn.textContent = t('btn.add');
  addBtn.addEventListener('click', () => addParticipant(input));
  row.appendChild(addBtn);

  inputGroup.appendChild(row);

  const errorEl = document.createElement('span');
  errorEl.className = 'error-message';
  errorEl.id = 'participant-error';
  inputGroup.appendChild(errorEl);

  containerEl.appendChild(inputGroup);

  input.addEventListener('input', () => {
    filterText = input.value.trim();
    clearError(errorEl, input);
    renderQuickPick();
  });

  // Handle enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParticipant(input);
    }
  });

  // Render participant chips
  if (participants.length > 0) {
    const chipContainer = document.createElement('div');
    chipContainer.className = 'chip-container';

    participants.forEach((name, index) => {
      const chip = document.createElement('span');
      chip.className = 'chip';

      const chipText = document.createElement('span');
      chipText.className = 'chip-text';
      chipText.textContent = name;
      chip.appendChild(chipText);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'chip-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.setAttribute('aria-label', t('participants.remove').replace('{name}', name));
      removeBtn.addEventListener('click', () => removeParticipant(index));
      chip.appendChild(removeBtn);

      chipContainer.appendChild(chip);
    });

    containerEl.appendChild(chipContainer);
  }

  const quickPickSlot = document.createElement('div');
  quickPickSlot.className = 'quick-pick-slot';
  containerEl.appendChild(quickPickSlot);
  renderQuickPick();
}

function renderQuickPick() {
  const slot = containerEl?.querySelector('.quick-pick-slot');
  if (!slot) return;
  slot.innerHTML = '';

  const allSuggestions = loadQuickPickParticipants();
  if (allSuggestions.length === 0) {
    manageQuickPick = false;
    return;
  }

  const selectedKeys = new Set(participants.map((p) => p.toLowerCase()));
  const unselected = allSuggestions.filter((name) => !selectedKeys.has(name.toLowerCase()));
  if (unselected.length === 0) {
    manageQuickPick = false;
    return;
  }

  const query = filterText.toLowerCase();
  const visiblePool = query
    ? unselected.filter((name) => name.toLowerCase().includes(query))
    : unselected;

  if (visiblePool.length === 0) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'quick-pick';

  const header = document.createElement('div');
  header.className = 'quick-pick-header';

  const title = document.createElement('span');
  title.className = 'quick-pick-label';
  title.textContent = t('quickPick.title');
  header.appendChild(title);

  const manageBtn = document.createElement('button');
  manageBtn.type = 'button';
  manageBtn.className = 'quick-pick-manage';
  manageBtn.textContent = manageQuickPick ? t('quickPick.done') : t('quickPick.manage');
  manageBtn.addEventListener('click', () => {
    manageQuickPick = !manageQuickPick;
    renderQuickPick();
  });
  header.appendChild(manageBtn);

  wrapper.appendChild(header);

  const chipsEl = document.createElement('div');
  chipsEl.className = 'quick-pick-chips';

  const showAll = quickPickExpanded || Boolean(query);
  const shown = showAll ? visiblePool : visiblePool.slice(0, QUICK_PICK_LIMIT);

  shown.forEach((name) => {
    const chipBtn = document.createElement('button');
    chipBtn.type = 'button';
    chipBtn.className = manageQuickPick
      ? 'quick-pick-chip quick-pick-chip-manage'
      : 'quick-pick-chip';
    chipBtn.textContent = manageQuickPick ? `${name} \u00d7` : `+ ${name}`;
    chipBtn.setAttribute(
      'aria-label',
      t(manageQuickPick ? 'quickPick.removeAria' : 'quickPick.addAria').replace('{name}', name),
    );
    chipBtn.addEventListener('click', () => {
      if (manageQuickPick) {
        hideQuickPickParticipant(name);
        showToast(t('quickPick.removed').replace('{name}', name), 'info');
        renderQuickPick();
      } else {
        pickParticipant(name);
      }
    });
    chipsEl.appendChild(chipBtn);
  });

  if (!query && visiblePool.length > QUICK_PICK_LIMIT) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'quick-pick-more';
    moreBtn.textContent = quickPickExpanded
      ? t('quickPick.less')
      : t('quickPick.more').replace('{n}', visiblePool.length - QUICK_PICK_LIMIT);
    moreBtn.addEventListener('click', () => {
      quickPickExpanded = !quickPickExpanded;
      renderQuickPick();
    });
    chipsEl.appendChild(moreBtn);
  }

  wrapper.appendChild(chipsEl);
  slot.appendChild(wrapper);
}

function pickParticipant(name) {
  if (participants.some((p) => p.toLowerCase() === name.toLowerCase())) return;
  participants.push(name);
  filterText = '';
  render();
  if (onChangeCallback) {
    onChangeCallback(getParticipants());
  }
}

function addParticipant(inputEl) {
  const errorEl = containerEl.querySelector('#participant-error');
  const tokens = inputEl.value
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    showError(errorEl, inputEl, t('validation.nameEmpty'));
    return;
  }

  const seen = new Set(participants.map((p) => p.toLowerCase()));
  const newNames = [];
  for (const name of tokens) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    newNames.push(name);
  }

  if (newNames.length === 0) {
    showError(errorEl, inputEl, t('validation.nameExists'));
    return;
  }

  clearError(errorEl, inputEl);
  participants.push(...newNames);
  inputEl.value = '';
  filterText = '';
  render();

  if (onChangeCallback) {
    onChangeCallback(getParticipants());
  }

  // Focus back on input
  const newInput = containerEl.querySelector('#participant-name');
  if (newInput) newInput.focus();
}

function removeParticipant(index) {
  participants.splice(index, 1);
  render();

  if (onChangeCallback) {
    onChangeCallback(getParticipants());
  }
}

function showError(errorEl, inputEl, message) {
  errorEl.textContent = message;
  inputEl.classList.add('input-error');
  inputEl.setAttribute('aria-invalid', 'true');
  inputEl.setAttribute('aria-describedby', errorEl.id);
}

function clearError(errorEl, inputEl) {
  errorEl.textContent = '';
  inputEl.classList.remove('input-error');
  inputEl.removeAttribute('aria-invalid');
  inputEl.removeAttribute('aria-describedby');
}

/**
 * Re-render translated labels without losing the participant list.
 */
export function updateTranslations() {
  if (containerEl) render();
}
