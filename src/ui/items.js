/**
 * Food item entry component.
 * Manages adding/removing food items with participant assignment.
 */

import { t } from '../i18n/index.js';

let items = [];
let containerEl = null;
let participantsList = [];

/**
 * Initialize the items component.
 * @param {HTMLElement} el - Container element
 */
export function initItems(el) {
  containerEl = el;
  items = [];
  participantsList = [];
  render();
}

/**
 * Get the current list of items.
 * @returns {Array<{name: string, price: number, participant: string}>}
 */
export function getItems() {
  // Read current values from DOM inputs
  syncItemsFromDOM();
  return items.map((item) => ({
    name: item.name,
    price: Number(item.price) || 0,
    participant: item.participant,
  }));
}

/**
 * Update the participant options available in dropdowns.
 * @param {string[]} participants
 */
export function updateParticipantOptions(participants) {
  participantsList = [...participants];
  // Update existing dropdowns
  const selects = containerEl.querySelectorAll('.item-participant');
  selects.forEach((select) => {
    const currentValue = select.value;
    populateSelect(select);
    // Restore value if still valid
    if (participantsList.includes(currentValue)) {
      select.value = currentValue;
    }
  });
}

function render() {
  containerEl.innerHTML = '';

  const itemsList = document.createElement('div');
  itemsList.className = 'items-list';

  items.forEach((item, index) => {
    itemsList.appendChild(createItemRow(item, index));
  });

  containerEl.appendChild(itemsList);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary btn-add-item';
  addBtn.textContent = t('btn.addItem');
  addBtn.addEventListener('click', () => addItem());
  containerEl.appendChild(addBtn);
}

function createItemRow(item, index) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.index = index;

  // Item name
  const nameGroup = document.createElement('div');
  nameGroup.className = 'item-field';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = t('label.item');
  nameGroup.appendChild(nameLabel);
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'item-name';
  nameInput.placeholder = t('placeholder.itemName');
  nameInput.value = item.name;
  nameInput.addEventListener('input', () => {
    items[index].name = nameInput.value;
  });
  nameGroup.appendChild(nameInput);
  row.appendChild(nameGroup);

  // Price
  const priceGroup = document.createElement('div');
  priceGroup.className = 'item-field';
  const priceLabel = document.createElement('label');
  priceLabel.textContent = t('label.price');
  priceGroup.appendChild(priceLabel);
  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.className = 'item-price';
  priceInput.placeholder = '0';
  priceInput.min = '0';
  priceInput.value = item.price || '';
  priceInput.addEventListener('input', () => {
    items[index].price = priceInput.value;
  });
  priceGroup.appendChild(priceInput);
  row.appendChild(priceGroup);

  // Participant select
  const participantGroup = document.createElement('div');
  participantGroup.className = 'item-field';
  const participantLabel = document.createElement('label');
  participantLabel.textContent = t('label.for');
  participantGroup.appendChild(participantLabel);
  const select = document.createElement('select');
  select.className = 'item-participant';
  populateSelect(select);
  if (item.participant && participantsList.includes(item.participant)) {
    select.value = item.participant;
  }
  select.addEventListener('change', () => {
    items[index].participant = select.value;
  });
  participantGroup.appendChild(select);
  row.appendChild(participantGroup);

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-danger btn-remove-item';
  removeBtn.textContent = '\u00d7';
  removeBtn.setAttribute('aria-label', 'Remove item');
  removeBtn.addEventListener('click', () => removeItem(index));
  row.appendChild(removeBtn);

  return row;
}

function populateSelect(select) {
  select.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = t('placeholder.select');
  select.appendChild(defaultOpt);

  participantsList.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function addItem() {
  items.push({ name: '', price: '', participant: '' });
  render();
  // Focus the new item's name input
  const rows = containerEl.querySelectorAll('.item-row');
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const nameInput = lastRow.querySelector('.item-name');
    if (nameInput) nameInput.focus();
  }
}

function removeItem(index) {
  items.splice(index, 1);
  render();
}

function syncItemsFromDOM() {
  const rows = containerEl.querySelectorAll('.item-row');
  rows.forEach((row, index) => {
    if (items[index]) {
      const nameInput = row.querySelector('.item-name');
      const priceInput = row.querySelector('.item-price');
      const select = row.querySelector('.item-participant');
      if (nameInput) items[index].name = nameInput.value;
      if (priceInput) items[index].price = priceInput.value;
      if (select) items[index].participant = select.value;
    }
  });
}

/**
 * Update translated text in the items component without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const addBtn = containerEl.querySelector('.btn-add-item');
  if (addBtn) addBtn.textContent = t('btn.addItem');
  const rows = containerEl.querySelectorAll('.item-row');
  rows.forEach((row) => {
    const labels = row.querySelectorAll('.item-field label');
    if (labels[0]) labels[0].textContent = t('label.item');
    if (labels[1]) labels[1].textContent = t('label.price');
    if (labels[2]) labels[2].textContent = t('label.for');
    const nameInput = row.querySelector('.item-name');
    if (nameInput) nameInput.placeholder = t('placeholder.itemName');
    const select = row.querySelector('.item-participant');
    if (select) {
      const defaultOpt = select.querySelector('option[value=""]');
      if (defaultOpt) defaultOpt.textContent = t('placeholder.select');
    }
  });
}
