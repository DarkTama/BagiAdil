/**
 * Bill parameters component.
 * Manages total discount and shipping inputs.
 */

import { t } from '../i18n/index.js';
import { attachCurrencyInput, getCurrencyValue, setCurrencyValue } from './currency-input.js';

let containerEl = null;
let onChangeCallback = null;

/**
 * Initialize the bill params component.
 * @param {HTMLElement} el - Container element
 * @param {object} [options]
 * @param {function} [options.onChange] - Called when the user types in either
 *   field (not on programmatic setParams)
 */
export function initBillParams(el, options = {}) {
  containerEl = el;
  onChangeCallback = options.onChange || null;
  render();
}

/**
 * Get the current bill parameters.
 * @returns {{totalDiscount: number, totalShipping: number}}
 */
export function getParams() {
  const discountInput = containerEl.querySelector('#total-discount');
  const shippingInput = containerEl.querySelector('#total-shipping');
  return {
    totalDiscount: getCurrencyValue(discountInput),
    totalShipping: getCurrencyValue(shippingInput),
  };
}

/**
 * Programmatically set bill parameters.
 * @param {{totalDiscount: number, totalShipping: number}} params
 */
export function setParams({ totalDiscount, totalShipping }) {
  const discountInput = containerEl.querySelector('#total-discount');
  const shippingInput = containerEl.querySelector('#total-shipping');
  setCurrencyValue(discountInput, totalDiscount);
  setCurrencyValue(shippingInput, totalShipping);
}

function notifyChange() {
  if (onChangeCallback) onChangeCallback();
}

function render() {
  containerEl.innerHTML = '';

  // Discount field
  const discountGroup = document.createElement('div');
  discountGroup.className = 'input-group';
  const discountLabel = document.createElement('label');
  discountLabel.setAttribute('for', 'total-discount');
  discountLabel.textContent = t('label.discount');
  discountGroup.appendChild(discountLabel);
  const discountInput = document.createElement('input');
  discountInput.id = 'total-discount';
  discountInput.placeholder = 'Rp 0';
  attachCurrencyInput(discountInput);
  discountInput.addEventListener('input', notifyChange);
  discountGroup.appendChild(discountInput);
  containerEl.appendChild(discountGroup);

  // Shipping field
  const shippingGroup = document.createElement('div');
  shippingGroup.className = 'input-group';
  const shippingLabel = document.createElement('label');
  shippingLabel.setAttribute('for', 'total-shipping');
  shippingLabel.textContent = t('label.shipping');
  shippingGroup.appendChild(shippingLabel);
  const shippingInput = document.createElement('input');
  shippingInput.id = 'total-shipping';
  shippingInput.placeholder = 'Rp 0';
  attachCurrencyInput(shippingInput);
  shippingInput.addEventListener('input', notifyChange);
  shippingGroup.appendChild(shippingInput);
  containerEl.appendChild(shippingGroup);
}

/**
 * Update translated text in the bill-params component without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const discountLabel = containerEl.querySelector('label[for="total-discount"]');
  if (discountLabel) discountLabel.textContent = t('label.discount');
  const shippingLabel = containerEl.querySelector('label[for="total-shipping"]');
  if (shippingLabel) shippingLabel.textContent = t('label.shipping');
}
