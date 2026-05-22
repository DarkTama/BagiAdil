/**
 * Participant management component.
 * Manages adding/removing participants with validation.
 */

import { t } from '../i18n/index.js';
import { loadGroups, saveGroup, deleteGroup } from './storage.js';
import { showToast } from './toast.js';

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

  // Saved participant groups
  containerEl.appendChild(renderGroupsRow());

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

/**
 * Build the saved-groups row: a group picker with Load / Delete, and a
 * Save-as-group button.
 * @returns {HTMLElement}
 */
function renderGroupsRow() {
  const groups = loadGroups();
  const wrap = document.createElement('div');
  wrap.className = 'groups-row';

  const select = document.createElement('select');
  select.className = 'groups-select';
  select.setAttribute('aria-label', t('groups.select'));
  if (groups.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('groups.none');
    select.appendChild(opt);
    select.disabled = true;
  } else {
    groups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.name;
      opt.textContent = `${g.name} (${g.members.length})`;
      select.appendChild(opt);
    });
  }
  wrap.appendChild(select);

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'btn groups-load';
  loadBtn.textContent = t('groups.load');
  loadBtn.disabled = groups.length === 0;
  loadBtn.addEventListener('click', () => loadGroupByName(select.value));
  wrap.appendChild(loadBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-danger groups-delete';
  delBtn.textContent = t('groups.delete');
  delBtn.disabled = groups.length === 0;
  delBtn.addEventListener('click', () => {
    if (!select.value) return;
    deleteGroup(select.value);
    showToast(t('groups.deleted'), 'info');
    render();
  });
  wrap.appendChild(delBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary groups-save';
  saveBtn.textContent = t('groups.save');
  saveBtn.addEventListener('click', () => {
    if (participants.length === 0) {
      showToast(t('groups.saveEmpty'), 'warning');
      return;
    }
    const name = window.prompt(t('groups.namePrompt'));
    if (!name || !name.trim()) return;
    saveGroup(name, participants);
    showToast(t('groups.saved'), 'success');
    render();
  });
  wrap.appendChild(saveBtn);

  return wrap;
}

/**
 * Load a saved group, merging its members into the current list
 * (case-insensitive, skipping duplicates).
 * @param {string} name
 */
function loadGroupByName(name) {
  const group = loadGroups().find((g) => g.name === name);
  if (!group) return;
  let added = 0;
  group.members.forEach((member) => {
    if (!participants.some((p) => p.toLowerCase() === member.toLowerCase())) {
      participants.push(member);
      added += 1;
    }
  });
  render();
  if (onChangeCallback) {
    onChangeCallback(getParticipants());
  }
  if (added > 0) {
    showToast(t('groups.loaded').replace('{n}', added), 'success');
  } else {
    showToast(t('groups.loadedNone'), 'info');
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
 * Re-render translated labels without losing the participant list.
 */
export function updateTranslations() {
  if (containerEl) render();
}
