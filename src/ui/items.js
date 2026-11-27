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
  const labels = {
    'add-item-name': t('table.itemName'),
    'add-item-price': t('table.unitPrice'),
    'add-item-qty': t('table.qty'),
  };
  Object.entries(labels).forEach(([id, text]) => {
    const label = containerEl.querySelector(`label[for="${id}"]`);
    if (label) label.textContent = text;
  });
  const addBtn = containerEl.querySelector('.btn-add-item');
  if (addBtn) addBtn.textContent = '+ ' + t('table.addItem');
  const error = containerEl.querySelector('.add-item-error');
  if (error && error.dataset.key) error.textContent = t(error.dataset.key);
}

function createField(id, labelKey, input) {
  input.id = id;
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.setAttribute('for', id);
  label.textContent = t(labelKey);
  const frag = document.createDocumentFragment();
  frag.append(label, input);
  return frag;
}

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
  form.appendChild(createField('add-item-name', 'table.itemName', nameInput));

  // Unit price input
  const priceInput = document.createElement('input');
  priceInput.className = 'add-item-price';
  priceInput.placeholder = 'Rp 0';
  attachCurrencyInput(priceInput);
  form.appendChild(createField('add-item-price', 'table.unitPrice', priceInput));

  // Quantity input
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'add-item-qty';
  qtyInput.placeholder = '1';
  qtyInput.min = '1';
  qtyInput.value = '1';
  form.appendChild(createField('add-item-qty', 'table.qty', qtyInput));

  // Add button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary btn-add-item';
  addBtn.textContent = '+ ' + t('table.addItem');
  addBtn.addEventListener('click', () => handleSubmit(nameInput, priceInput, qtyInput));
  form.appendChild(addBtn);

  // Inline error (announced), shared by name and qty
  const errorEl = document.createElement('span');
  errorEl.className = 'error-message add-item-error';
  errorEl.id = 'add-item-error';
  errorEl.setAttribute('role', 'alert');

  // Enter key support on all inputs
  [nameInput, priceInput, qtyInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSubmit(nameInput, priceInput, qtyInput);
      }
    });
    input.addEventListener('input', () => clearError(nameInput, qtyInput, errorEl));
  });

  containerEl.append(form, errorEl);
}

function showError(input, errorEl, key) {
  errorEl.dataset.key = key;
  errorEl.textContent = t(key);
  input.classList.add('input-error');
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', errorEl.id);
  input.focus();
}

function clearError(nameInput, qtyInput, errorEl) {
  errorEl.textContent = '';
  delete errorEl.dataset.key;
  [nameInput, qtyInput].forEach((input) => {
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
}

function handleSubmit(nameInput, priceInput, qtyInput) {
  const errorEl = containerEl.querySelector('.add-item-error');
  clearError(nameInput, qtyInput, errorEl);

  const name = nameInput.value.trim();
  // An empty price field is Rp 0, same as the inline edit row (free items are allowed).
  const unitPrice = getCurrencyValue(priceInput);
  const qty = parseInt(qtyInput.value, 10) || 1;

  if (!name) return showError(nameInput, errorEl, 'table.errorItemName');
  if (qty < 1) return showError(qtyInput, errorEl, 'table.errorItemQty');

  if (onAddItemCallback) {
    onAddItemCallback({ name, unitPrice, qty });
  }

  // Clear fields and refocus
  nameInput.value = '';
  priceInput.value = '';
  qtyInput.value = '1';
  nameInput.focus();
}
