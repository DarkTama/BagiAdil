/**
 * OCR Results display component.
 * Shows parsed items with confidence indicators and editable fields.
 */

import { t } from '../i18n/index.js';

/**
 * Render OCR results with editable fields and confidence badges.
 * @param {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}} parsedData
 * @param {{overall: number, level: string, issues: string[]}} confidence
 * @param {HTMLElement} containerEl
 * @param {function} onConfirm - Callback receiving confirmed/corrected data
 */
export function renderOCRResults(parsedData, confidence, containerEl, onConfirm) {
  const badgeClass = confidence.level === 'high' ? 'badge-high' : confidence.level === 'medium' ? 'badge-medium' : 'badge-low';
  const confidenceLabel = t(`confidence.${confidence.level}`);

  let itemsHtml = '';
  if (parsedData.items && parsedData.items.length > 0) {
    parsedData.items.forEach((item, index) => {
      itemsHtml += `
        <div class="ocr-item-row" data-index="${index}">
          <div class="ocr-item-field">
            <label>${t('label.item')}</label>
            <input type="text" class="ocr-item-name" value="${escapeHtml(item.name)}" data-field="name" />
          </div>
          <div class="ocr-item-field ocr-item-qty">
            <label>Qty</label>
            <input type="number" class="ocr-item-quantity" value="${item.quantity}" min="1" data-field="quantity" />
          </div>
          <div class="ocr-item-field">
            <label>${t('label.price')}</label>
            <input type="number" class="ocr-item-price" value="${item.price}" min="0" data-field="price" />
          </div>
        </div>
      `;
    });
  }

  containerEl.innerHTML = `
    <div class="ocr-results">
      <div class="ocr-confidence">
        <span class="confidence-badge ${badgeClass}">
          Confidence: ${confidence.overall}% (${confidenceLabel})
        </span>
        ${confidence.issues.length > 0 ? `<ul class="confidence-issues">${confidence.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="ocr-platform">
        <span>Platform: <strong>${escapeHtml(parsedData.platform)}</strong></span>
      </div>
      <div class="ocr-items-list">
        <h3>${t('ocr.detectedItems')}</h3>
        ${itemsHtml || `<p class="ocr-no-items">${t('ocr.noItems')}</p>`}
      </div>
      <div class="ocr-summary-fields">
        <div class="input-group">
          <label>${t('label.discount')}</label>
          <input type="number" id="ocr-discount" value="${parsedData.discount}" min="0" />
        </div>
        <div class="input-group">
          <label>${t('label.deliveryFee')}</label>
          <input type="number" id="ocr-delivery-fee" value="${parsedData.deliveryFee}" min="0" />
        </div>
      </div>
      <button type="button" class="btn btn-primary ocr-confirm-btn" id="ocr-confirm">
        ${t('ocr.confirmUse')}
      </button>
    </div>
  `;

  // Wire up confirm button
  const confirmBtn = containerEl.querySelector('#ocr-confirm');
  confirmBtn.addEventListener('click', () => {
    const correctedData = collectCorrectedData(containerEl, parsedData);
    if (onConfirm) {
      onConfirm(correctedData);
    }
  });
}

function collectCorrectedData(containerEl, originalData) {
  const items = [];
  const itemRows = containerEl.querySelectorAll('.ocr-item-row');
  itemRows.forEach((row) => {
    const name = row.querySelector('.ocr-item-name').value.trim();
    const quantity = parseInt(row.querySelector('.ocr-item-quantity').value, 10) || 1;
    const price = parseInt(row.querySelector('.ocr-item-price').value, 10) || 0;
    items.push({ name, quantity, price, total: quantity * price });
  });

  const discount = parseInt(containerEl.querySelector('#ocr-discount').value, 10) || 0;
  const deliveryFee = parseInt(containerEl.querySelector('#ocr-delivery-fee').value, 10) || 0;

  return {
    items,
    discount,
    deliveryFee,
    platform: originalData.platform,
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML.replace(/"/g, '&quot;');
}
