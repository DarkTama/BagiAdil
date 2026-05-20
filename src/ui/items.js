/**
 * Simple Add Item form component.
 * Provides a form to add items (name, unit price, quantity) to the assignment table.
 */

import { t } from '../i18n/index.js';

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
  if (addBtn) addBtn.textContent = `+ ${t('table.addItem')}`;
  const nameLabel = containerEl.querySelector('.label-name');
  if (nameLabel) nameLabel.textContent = t('label.item');
  const priceLabel = containerEl.querySelector('.label-price');
  if (priceLabel) priceLabel.textContent = t('table.unitPrice');
  const qtyLabel = containerEl.querySelector('.label-qty');
  if (qtyLabel) qtyLabel.textContent = t('table.qty');
}

function render() {
  containerEl.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'add-item-form';

  // Item name input group
  const nameGroup = document.createElement('div');
  nameGroup.className = 'input-group';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'label-name';
  nameLabel.textContent = t('label.item');
  nameGroup.appendChild(nameLabel);
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'add-item-name';
  nameInput.placeholder = t('table.itemName');
  nameGroup.appendChild(nameInput);
  form.appendChild(nameGroup);

  // Unit price input group
  const priceGroup = document.createElement('div');
  priceGroup.className = 'input-group';
  const priceLabel = document.createElement('label');
  priceLabel.className = 'label-price';
  priceLabel.textContent = t('table.unitPrice');
  priceGroup.appendChild(priceLabel);
  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.className = 'add-item-price';
  priceInput.placeholder = 'Rp';
  priceInput.min = '0';
  priceGroup.appendChild(priceInput);
  form.appendChild(priceGroup);

  // Quantity input group
  const qtyGroup = document.createElement('div');
  qtyGroup.className = 'input-group';
  const qtyLabel = document.createElement('label');
  qtyLabel.className = 'label-qty';
  qtyLabel.textContent = t('table.qty');
  qtyGroup.appendChild(qtyLabel);
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'add-item-qty';
  qtyInput.min = '1';
  qtyInput.value = '1';
  qtyGroup.appendChild(qtyInput);
  form.appendChild(qtyGroup);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary btn-add-item';
  addBtn.textContent = `+ ${t('table.addItem')}`;
  addBtn.addEventListener('click', () => handleSubmit(nameInput, priceInput, qtyInput));
  form.appendChild(addBtn);

  // Handle enter key on inputs
  [nameInput, priceInput, qtyInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(nameInput, priceInput, qtyInput);
      }
    });
  });

  containerEl.appendChild(form);
}

function handleSubmit(nameInput, priceInput, qtyInput) {
  const name = nameInput.value.trim();
  const price = Number(priceInput.value);
  const qty = parseInt(qtyInput.value, 10) || 1;

  // Validate
  if (!name) {
    nameInput.classList.add('input-error');
    return;
  }
  if (!price || price <= 0) {
    priceInput.classList.add('input-error');
    return;
  }

  nameInput.classList.remove('input-error');
  priceInput.classList.remove('input-error');

  if (onAddItemCallback) {
    onAddItemCallback({ name, unitPrice: price, qty: Math.max(1, qty) });
  }

  // Clear form
  nameInput.value = '';
  priceInput.value = '';
  qtyInput.value = '1';
  nameInput.focus();
}
