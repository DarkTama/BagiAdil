/**
 * Add Item form component.
 * Simple form for adding items to the table-assigner.
 */

import { t } from '../i18n/index.js';
import { attachCurrencyInput, getCurrencyValue } from './currency-input.js';

let containerEl = null;
let onAddItemCallback = null;

/**
 * Initialize the add item form.
 * @param {HTMLElement} el - Container element
 * @param {object} options
 * @param {function} options.onAddItem - Callback with {name, unitPrice, qty}
 */
export function initAddItemForm(el, options = {}) {
  containerEl = el;
  onAddItemCallback = options.onAddItem || null;
  render();
}

/**
 * Update translated text without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const nameInput = containerEl.querySelector('.add-item-name');
  if (nameInput) nameInput.placeholder = t('table.itemName');
  const addBtn = containerEl.querySelector('.btn-add-item');
  if (addBtn) addBtn.textContent = '+ ' + t('table.addItem');
}

// Backward-compatible stubs for old API
export function initItems(el) {
  containerEl = el;
  render();
}

export function getItems() {
  return [];
}

export function setItems() {}

export function addItemsFromOCR() {}

export function updateParticipantOptions() {}

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'add-item-form';

  // Name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'add-item-name';
  nameInput.placeholder = t('table.itemName');
  form.appendChild(nameInput);

  // Unit price input
  const priceInput = document.createElement('input');
  priceInput.className = 'add-item-price';
  priceInput.placeholder = 'Rp 0';
  attachCurrencyInput(priceInput);
  form.appendChild(priceInput);

  // Quantity input
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'add-item-qty';
  qtyInput.placeholder = '1';
  qtyInput.min = '1';
  qtyInput.value = '1';
  form.appendChild(qtyInput);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary btn-add-item';
  addBtn.textContent = '+ ' + t('table.addItem');
  addBtn.addEventListener('click', () => handleSubmit(nameInput, priceInput, qtyInput));
  form.appendChild(addBtn);

  // Enter key support on all inputs
  [nameInput, priceInput, qtyInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSubmit(nameInput, priceInput, qtyInput);
      }
    });
  });

  containerEl.appendChild(form);
}

function handleSubmit(nameInput, priceInput, qtyInput) {
  const name = nameInput.value.trim();
  const unitPrice = getCurrencyValue(priceInput);
  const qty = parseInt(qtyInput.value, 10) || 1;

  // Validate
  if (!name) return;
  if (unitPrice <= 0) return;
  if (qty < 1) return;

  if (onAddItemCallback) {
    onAddItemCallback({ name, unitPrice, qty });
  }

  // Clear fields and refocus
  nameInput.value = '';
  priceInput.value = '';
  qtyInput.value = '1';
  nameInput.focus();
}
