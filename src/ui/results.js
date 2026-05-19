/**
 * Results display component.
 * Renders the bill splitting calculation results.
 */

import { formatCurrency } from '../engine/formatter.js';

/**
 * Render calculation results into the container.
 * @param {object} result - Result from splitBill()
 * @param {HTMLElement} containerEl
 */
export function renderResults(result, containerEl) {
  containerEl.innerHTML = '';

  if (!result) return;

  const { participants, grandTotal, verification } = result;

  // Verification badge
  const badge = document.createElement('div');
  badge.className = verification.balanced ? 'badge badge-success' : 'badge badge-warning';
  badge.textContent = verification.balanced ? 'Balanced' : 'Unbalanced';
  containerEl.appendChild(badge);

  // Grand total
  const totalEl = document.createElement('div');
  totalEl.className = 'grand-total';
  totalEl.innerHTML = `<span class="grand-total-label">Grand Total:</span> <span class="grand-total-amount">${formatCurrency(grandTotal)}</span>`;
  containerEl.appendChild(totalEl);

  // Participant cards
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'result-cards';

  participants.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'result-card-name';
    nameEl.textContent = p.name;
    card.appendChild(nameEl);

    const details = document.createElement('div');
    details.className = 'result-card-details';

    details.appendChild(createDetailRow('Original Order', formatCurrency(p.originalOrder)));
    details.appendChild(createDetailRow('Discount', `- ${formatCurrency(p.discount)}`));
    details.appendChild(createDetailRow('After Discount', formatCurrency(p.discountedOrder)));
    details.appendChild(createDetailRow('Shipping Share', formatCurrency(p.shippingShare)));
    details.appendChild(createDetailRow('Pre-rounding Total', formatCurrency(p.preRoundingTotal)));

    card.appendChild(details);

    const finalEl = document.createElement('div');
    finalEl.className = 'result-card-final';
    finalEl.innerHTML = `<span>Final Payment</span> <strong>${formatCurrency(p.finalPayment)}</strong>`;
    card.appendChild(finalEl);

    cardsContainer.appendChild(card);
  });

  containerEl.appendChild(cardsContainer);
}

function createDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${value}</span>`;
  return row;
}
