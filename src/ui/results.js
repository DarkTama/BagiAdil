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
 * @param {object|null} [itemsMap] - Map of participant name -> assigned items
 * @param {object} [options]
 * @param {object} [options.paid] - Map of participant name -> true when paid
 * @param {function} [options.onTogglePaid] - (name, isPaid) => void. When
 *   provided, a "mark as paid" toggle is shown on each participant card.
 */
export function renderResults(result, containerEl, itemsMap = null, options = {}) {
  containerEl.innerHTML = '';

  if (!result) return;

  const { participants, grandTotal, verification } = result;
  const paid = options.paid || {};
  const onTogglePaid = options.onTogglePaid || null;

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

  // Paid summary (only when the paid tracker is enabled)
  if (onTogglePaid) {
    const paidCount = participants.filter((p) => paid[p.name]).length;
    const summary = document.createElement('div');
    summary.className = 'paid-summary';
    summary.textContent = t('results.paidSummary')
      .replace('{n}', paidCount)
      .replace('{total}', participants.length);
    containerEl.appendChild(summary);
  }

  // Participant cards
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'result-cards';

  participants.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    const isPaid = !!paid[p.name];
    if (onTogglePaid && isPaid) {
      card.classList.add('result-card--paid');
    }

    const nameEl = document.createElement('h3');
    nameEl.className = 'result-card-name';
    nameEl.textContent = p.name;
    card.appendChild(nameEl);

    if (itemsMap && itemsMap[p.name] && itemsMap[p.name].length > 0) {
      const itemsList = document.createElement('ul');
      itemsList.className = 'result-card-items';
      itemsMap[p.name].forEach((item) => {
        const li = document.createElement('li');
        if (item.qty && item.qty > 1) {
          li.textContent = `${item.qty}x ${item.name} @ ${formatCurrency(item.unitPrice)} - ${formatCurrency(item.price)}`;
        } else {
          li.textContent = `${item.name} - ${formatCurrency(item.price)}`;
        }
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

    // Mark-as-paid toggle (omitted in the read-only shared view)
    if (onTogglePaid) {
      const paidBtn = document.createElement('button');
      paidBtn.type = 'button';
      paidBtn.className = isPaid ? 'btn paid-toggle paid-toggle--on' : 'btn paid-toggle';
      paidBtn.textContent = isPaid ? `✓ ${t('results.paid')}` : t('results.markPaid');
      paidBtn.addEventListener('click', () => onTogglePaid(p.name, !isPaid));
      card.appendChild(paidBtn);
    }

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
