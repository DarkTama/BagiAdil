/**
 * Results display component.
 * Renders the bill splitting calculation results.
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';

/**
 * Render calculation results into the container.
 * @param {object} result - Result from splitBill()
 * @param {HTMLElement} containerEl
 */
export function renderResults(result, containerEl, itemsMap = null) {
  containerEl.innerHTML = '';

  if (!result) return;

  const { participants, grandTotal, verification } = result;

  // Verification badge
  const badge = document.createElement('div');
  badge.className = verification.balanced ? 'badge badge-success' : 'badge badge-warning';
  badge.textContent = verification.balanced ? t('results.balanced') : t('results.unbalanced');
  containerEl.appendChild(badge);

  // Grand total
  const totalEl = document.createElement('div');
  totalEl.className = 'grand-total';
  totalEl.innerHTML = `<span class="grand-total-label">${t('results.grandTotal')}</span> <span class="grand-total-amount">${formatCurrency(grandTotal)}</span>`;
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

    if (itemsMap && itemsMap[p.name] && itemsMap[p.name].length > 0) {
      const itemsList = document.createElement('ul');
      itemsList.className = 'result-card-items';
      itemsMap[p.name].forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.name} - ${formatCurrency(item.price)}`;
        itemsList.appendChild(li);
      });
      card.appendChild(itemsList);
    }

    const details = document.createElement('div');
    details.className = 'result-card-details';

    details.appendChild(createDetailRow(t('results.originalOrder'), formatCurrency(p.originalOrder)));
    details.appendChild(createDetailRow(t('results.discount'), `- ${formatCurrency(p.discount)}`));
    details.appendChild(createDetailRow(t('results.afterDiscount'), formatCurrency(p.discountedOrder)));
    details.appendChild(createDetailRow(t('results.shippingShare'), formatCurrency(p.shippingShare)));
    details.appendChild(createDetailRow(t('results.preRounding'), formatCurrency(p.preRoundingTotal)));

    card.appendChild(details);

    const finalEl = document.createElement('div');
    finalEl.className = 'result-card-final';
    finalEl.innerHTML = `<span>${t('results.finalPayment')}</span> <strong>${formatCurrency(p.finalPayment)}</strong>`;
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
