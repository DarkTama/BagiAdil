/**
 * Results display component.
 * Renders the bill splitting calculation results.
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';

/**
 * The discount that was actually applied. The engine clamps a discount larger
 * than the food total to the food total (verification.discountClamped).
 * @param {object} result - Result from splitBill()
 * @param {number} [requested=0] - the discount that was typed in
 * @returns {number}
 */
export function effectiveDiscount(result, requested = 0) {
  if (!result.verification?.discountClamped) return requested;
  return result.participants.reduce((sum, p) => sum + Number(p.originalOrder), 0);
}

/**
 * Localised one-line notice for a clamped discount.
 * @param {object} result
 * @returns {string}
 */
export function clampedDiscountNotice(result) {
  return t('results.discountClamped').replace('{amount}', formatCurrency(effectiveDiscount(result)));
}

/**
 * Render calculation results into the container.
 * @param {object} result - Result from splitBill()
 * @param {HTMLElement} containerEl
 * @param {object|null} [itemsMap] - Map of participant name -> assigned items
 * @param {object} [options]
 * @param {object} [options.paid] - Map of participant name -> true when paid
 * @param {function} [options.onTogglePaid] - (name, isPaid) => void. When
 *   provided, a "mark as paid" toggle is shown on each participant card.
 * @param {boolean} [options.stale] - the editor changed since Calculate; shows a banner
 * @param {object} [options.params] - {totalDiscount, totalShipping} the split used;
 *   enables the "food - discount + shipping = total" proof line
 */
export function renderResults(result, containerEl, itemsMap = null, options = {}) {
  containerEl.innerHTML = '';

  if (!result) return;

  const { participants, grandTotal, verification } = result;
  const paid = options.paid || {};
  const onTogglePaid = options.onTogglePaid || null;

  if (options.stale) {
    const banner = document.createElement('div');
    banner.className = 'stale-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = t('results.stale');
    containerEl.appendChild(banner);
  }

  if (verification.discountClamped) {
    const notice = document.createElement('div');
    notice.className = 'discount-clamped-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = clampedDiscountNotice(result);
    containerEl.appendChild(notice);
  }

  // Internal arithmetic check: only worth showing when it fails.
  if (!verification.balanced) {
    const badge = document.createElement('div');
    badge.className = 'badge badge-warning';
    badge.textContent = t('results.unbalanced');
    containerEl.appendChild(badge);
  }

  // Grand total
  const totalEl = document.createElement('div');
  totalEl.className = 'grand-total';
  totalEl.innerHTML = `<span class="grand-total-label">${t('results.grandTotal')}</span> <span class="grand-total-amount">${formatCurrency(grandTotal)}</span>`;
  containerEl.appendChild(totalEl);

  const proof = renderProof(result, options.params);
  if (proof) containerEl.appendChild(proof);
  // Payment destination
  const payment = options.payment || null;
  if (payment && (payment.bank || payment.accountNumber)) {
    const payBox = document.createElement('div');
    payBox.className = 'payment-info-box';

    const payHeader = document.createElement('div');
    payHeader.className = 'payment-info-header';
    payHeader.textContent = `\u{1F4B3} ${t('payment.payTo')}:`;
    payBox.appendChild(payHeader);

    const payDetails = document.createElement('div');
    payDetails.className = 'payment-info-details';

    const accountLine = document.createElement('span');
    accountLine.className = 'payment-account-text';
    const textParts = [];
    if (payment.bank) textParts.push(payment.bank);
    if (payment.accountNumber) textParts.push(payment.accountNumber);
    if (payment.accountName) textParts.push(`(${t('export.wa.accountHolder')} ${payment.accountName})`);
    accountLine.textContent = textParts.join(' ');
    payDetails.appendChild(accountLine);

    if (payment.accountNumber) {
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-secondary btn-copy-account';
      copyBtn.textContent = `\u{1F4CB} ${t('payment.copyAccount')}`;
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(payment.accountNumber);
          copyBtn.textContent = `\u2705 ${t('payment.accountCopied')}`;
          setTimeout(() => {
            copyBtn.textContent = `\u{1F4CB} ${t('payment.copyAccount')}`;
          }, 2000);
        } catch {
          // fallback
        }
      });
      payDetails.appendChild(copyBtn);
    }

    payBox.appendChild(payDetails);
    containerEl.appendChild(payBox);
  }

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

    // Colour-coded paid status badge (paid tracker only).
    if (onTogglePaid) {
      const status = document.createElement('span');
      status.className = isPaid
        ? 'result-status result-status--paid'
        : 'result-status result-status--unpaid';
      status.textContent = isPaid ? t('results.paid') : t('results.unpaid');
      card.appendChild(status);
    }

    // The amount to pay leads the card.
    const finalEl = document.createElement('div');
    finalEl.className = 'result-card-final';
    const finalLabel = document.createElement('span');
    finalLabel.textContent = t('results.finalPayment');
    const finalAmount = document.createElement('strong');
    finalAmount.textContent = formatCurrency(p.finalPayment);
    finalEl.append(finalLabel, ' ', finalAmount);
    card.appendChild(finalEl);

    const delta = roundingDelta(p);
    if (delta !== 0) {
      const roundEl = document.createElement('div');
      roundEl.className = 'result-card-rounding';
      roundEl.textContent = `${t('results.rounding')} ${signedCurrency(delta)}`;
      card.appendChild(roundEl);
    }

    if (itemsMap && itemsMap[p.name] && itemsMap[p.name].length > 0) {
      const itemsList = document.createElement('ul');
      itemsList.className = 'result-card-items';
      itemsMap[p.name].forEach((item) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'result-item-name';
        label.textContent =
          item.qty && item.qty > 1
            ? `${item.qty}x ${item.name} @ ${formatCurrency(item.unitPrice)}`
            : item.name;
        const price = document.createElement('span');
        price.className = 'result-item-price';
        price.textContent = formatCurrency(item.price);
        li.append(label, price);
        itemsList.appendChild(li);
      });
      card.appendChild(itemsList);
    }

    // The full breakdown is one tap away instead of five rows per person.
    const details = document.createElement('details');
    details.className = 'result-card-details';
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = t('results.breakdown');
    details.appendChild(summaryEl);

    details.appendChild(createDetailRow(t('results.originalOrder'), formatCurrency(p.originalOrder)));
    details.appendChild(createDetailRow(t('results.discount'), `- ${formatCurrency(p.discount)}`));
    details.appendChild(createDetailRow(t('results.afterDiscount'), formatCurrency(p.discountedOrder)));
    details.appendChild(createDetailRow(t('results.shippingShare'), formatCurrency(p.shippingShare)));
    details.appendChild(createDetailRow(t('results.preRounding'), formatCurrency(p.preRoundingTotal)));

    card.appendChild(details);

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

/**
 * Rounding added to (or taken off) one person, as the visible rows show it:
 * final payment minus the pre-rounding total as displayed (whole rupiah).
 * @param {object} p - a participant from splitBill()
 * @returns {number}
 */
export function roundingDelta(p) {
  return Number(p.finalPayment) - Math.round(Number(p.preRoundingTotal));
}

function signedCurrency(n) {
  return `${n < 0 ? '−' : '+'}${formatCurrency(Math.abs(n))}`;
}

/**
 * "Food − discount + shipping = total" and "sum of payments = total ✓".
 * Uses the discount actually applied (clamped) and the split's own params, so
 * the line always adds up. Omitted when params are unknown.
 * @param {object} result
 * @param {object} [params]
 * @returns {HTMLElement|null}
 */
function renderProof(result, params) {
  if (!params) return null;
  const food = result.participants.reduce((sum, p) => sum + Number(p.originalOrder), 0);
  const discount = effectiveDiscount(result, params.totalDiscount || 0);
  const shipping = params.totalShipping || 0;
  const paid = result.participants.reduce((sum, p) => sum + Number(p.finalPayment), 0);

  const box = document.createElement('div');
  box.className = 'result-proof';

  let equation = `${t('results.proofFood')} ${formatCurrency(food)}`;
  if (discount) equation += ` − ${t('results.discount')} ${formatCurrency(discount)}`;
  if (shipping) equation += ` + ${t('results.proofShipping')} ${formatCurrency(shipping)}`;
  equation += ` = ${formatCurrency(result.grandTotal)}`;
  const eqEl = document.createElement('p');
  eqEl.className = 'result-proof-line';
  eqEl.textContent = equation;
  box.appendChild(eqEl);

  const sumEl = document.createElement('p');
  sumEl.className = 'result-proof-line result-proof-sum';
  const ok = paid === Number(result.grandTotal);
  sumEl.textContent = `${t('results.proofSum')} = ${formatCurrency(paid)} ${ok ? '✓' : '✗'}`;
  if (!ok) sumEl.classList.add('result-proof-sum--bad');
  box.appendChild(sumEl);
  return box;
}

function createDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${value}</span>`;
  return row;
}
