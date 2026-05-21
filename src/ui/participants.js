/**
 * Participant management component.
 * Manages adding/removing participants with validation.
 */

import { t } from '../i18n/index.js';

let participants = [];
let containerEl = null;
let onChangeCallback = null;

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
  row.appendChild(input);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = t('btn.add');
  addBtn.addEventListener('click', () => addParticipant(input));
  row.appendChild(addBtn);

  inputGroup.appendChild(row);

  const errorEl = document.createElement('span');
  errorEl.className = 'error-message';
  errorEl.id = 'participant-error';
  inputGroup.appendChild(errorEl);

  containerEl.appendChild(inputGroup);

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
      removeBtn.setAttribute('aria-label', `Remove ${name}`);
      removeBtn.addEventListener('click', () => removeParticipant(index));
      chip.appendChild(removeBtn);

      chipContainer.appendChild(chip);
    });

    containerEl.appendChild(chipContainer);
  }
}

function addParticipant(inputEl) {
  const errorEl = containerEl.querySelector('#participant-error');
  const name = inputEl.value.trim();

  // Validate
  if (!name) {
    showError(errorEl, inputEl, 'Name cannot be empty');
    return;
  }

  if (participants.some((p) => p.toLowerCase() === name.toLowerCase())) {
    showError(errorEl, inputEl, 'This name already exists');
    return;
  }

  clearError(errorEl, inputEl);
  participants.push(name);
  inputEl.value = '';
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
}

function clearError(errorEl, inputEl) {
  errorEl.textContent = '';
  inputEl.classList.remove('input-error');
}

/**
 * Update translated text in the participants component without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const label = containerEl.querySelector('label[for="participant-name"]');
  if (label) label.textContent = t('section.participants');
  const input = containerEl.querySelector('#participant-name');
  if (input) input.placeholder = t('placeholder.addParticipant');
  const addBtn = containerEl.querySelector('.btn.btn-primary');
  if (addBtn) addBtn.textContent = t('btn.add');
}
