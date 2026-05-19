/**
 * Bill parameters component.
 * Manages total discount and shipping inputs.
 */

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

function render() {
  containerEl.innerHTML = '';

  // Discount field
  const discountGroup = document.createElement('div');
  discountGroup.className = 'input-group';
  const discountLabel = document.createElement('label');
  discountLabel.setAttribute('for', 'total-discount');
  discountLabel.textContent = 'Total Discount (Rp)';
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
  shippingLabel.textContent = 'Total Shipping (Rp)';
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
