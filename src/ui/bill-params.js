/**
 * Bill parameters component.
 * Manages total discount and shipping inputs.
 */

import { t } from '../i18n/index.js';

let containerEl = null;

/**
 * Initialize the bill params component.
 * @param {HTMLElement} el - Container element
 */
export function initBillParams(el) {
  containerEl = el;
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
    totalDiscount: Number(discountInput?.value) || 0,
    totalShipping: Number(shippingInput?.value) || 0,
  };
}

/**
 * Programmatically set bill parameters.
 * @param {{totalDiscount: number, totalShipping: number}} params
 */
export function setParams({ totalDiscount, totalShipping }) {
  const discountInput = containerEl.querySelector('#total-discount');
  const shippingInput = containerEl.querySelector('#total-shipping');
  if (discountInput) discountInput.value = totalDiscount || 0;
  if (shippingInput) shippingInput.value = totalShipping || 0;
}

function render() {
  containerEl.innerHTML = '';

  // Discount field
  const discountGroup = document.createElement('div');
  discountGroup.className = 'input-group';
  const discountLabel = document.createElement('label');
  discountLabel.setAttribute('for', 'total-discount');
  discountLabel.textContent = `${t('label.discount')} (Rp)`;
  discountGroup.appendChild(discountLabel);
  const discountInput = document.createElement('input');
  discountInput.type = 'number';
  discountInput.id = 'total-discount';
  discountInput.min = '0';
  discountInput.value = '0';
  discountInput.placeholder = '0';
  discountGroup.appendChild(discountInput);
  containerEl.appendChild(discountGroup);

  // Shipping field
  const shippingGroup = document.createElement('div');
  shippingGroup.className = 'input-group';
  const shippingLabel = document.createElement('label');
  shippingLabel.setAttribute('for', 'total-shipping');
  shippingLabel.textContent = `${t('label.shipping')} (Rp)`;
  shippingGroup.appendChild(shippingLabel);
  const shippingInput = document.createElement('input');
  shippingInput.type = 'number';
  shippingInput.id = 'total-shipping';
  shippingInput.min = '0';
  shippingInput.value = '0';
  shippingInput.placeholder = '0';
  shippingGroup.appendChild(shippingInput);
  containerEl.appendChild(shippingGroup);
}

/**
 * Update translated text in the bill-params component without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const discountLabel = containerEl.querySelector('label[for="total-discount"]');
  if (discountLabel) discountLabel.textContent = `${t('label.discount')} (Rp)`;
  const shippingLabel = containerEl.querySelector('label[for="total-shipping"]');
  if (shippingLabel) shippingLabel.textContent = `${t('label.shipping')} (Rp)`;
}
