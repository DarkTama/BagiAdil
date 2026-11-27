/**
 * Export functionality: PDF export and WhatsApp text summary.
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';
import { encodeSnapshot } from './snapshot.js';
import { loadPaymentInfo, savePaymentInfo } from './storage.js';

let containerEl = null;
let getResultsFn = null;
let getParamsFn = null;
let getItemsMapFn = null;
let getSnapshotFn = null;

/**
 * Initialize the export component.
 * @param {HTMLElement} el - Container element
 * @param {function} resultsFn - Function that returns current results object
 * @param {function} [paramsFn] - Function that returns current params
 * @param {function} [itemsMapFn] - Function that returns current items map
 * @param {function} [snapshotFn] - Function that returns the current split snapshot
 */
export function initExport(el, resultsFn, paramsFn, itemsMapFn, snapshotFn) {
  containerEl = el;
  getResultsFn = resultsFn;
  getParamsFn = paramsFn || null;
  getItemsMapFn = itemsMapFn || null;
  getSnapshotFn = snapshotFn || null;
  render();
}

function render() {
  containerEl.innerHTML = '';

  // Payment destination form
  const payCard = document.createElement('div');
  payCard.className = 'payment-card';

  const payHeader = document.createElement('div');
  payHeader.className = 'payment-card-header';
  const payTitle = document.createElement('strong');
  payTitle.setAttribute('data-i18n', 'payment.title');
  payTitle.textContent = t('payment.title');
  payHeader.appendChild(payTitle);
  payCard.appendChild(payHeader);

  const payBody = document.createElement('div');
  payBody.className = 'payment-card-body';

  const storedPayment = loadPaymentInfo() || {};

  // Bank field
  const bankGroup = document.createElement('div');
  bankGroup.className = 'input-group';
  const bankLabel = document.createElement('label');
  bankLabel.setAttribute('for', 'pay-bank');
  bankLabel.setAttribute('data-i18n', 'payment.bank');
  bankLabel.textContent = t('payment.bank');
  const bankInput = document.createElement('input');
  bankInput.type = 'text';
  bankInput.id = 'pay-bank';
  bankInput.setAttribute('list', 'banks-list');
  bankInput.placeholder = t('payment.bankPlaceholder');
  bankInput.value = storedPayment.bank || '';
  bankGroup.appendChild(bankLabel);
  bankGroup.appendChild(bankInput);

  // Bank datalist
  const datalist = document.createElement('datalist');
  datalist.id = 'banks-list';
  ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'GoPay', 'OVO', 'DANA', 'ShopeePay'].forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b;
    datalist.appendChild(opt);
  });
  bankGroup.appendChild(datalist);

  // Account number field
  const numGroup = document.createElement('div');
  numGroup.className = 'input-group';
  const numLabel = document.createElement('label');
  numLabel.setAttribute('for', 'pay-account-number');
  numLabel.setAttribute('data-i18n', 'payment.accountNumber');
  numLabel.textContent = t('payment.accountNumber');
  const numInput = document.createElement('input');
  numInput.type = 'text';
  numInput.id = 'pay-account-number';
  numInput.placeholder = '1234567890';
  numInput.value = storedPayment.accountNumber || '';
  numGroup.appendChild(numLabel);
  numGroup.appendChild(numInput);

  // Account holder name field
  const nameGroup = document.createElement('div');
  nameGroup.className = 'input-group';
  const nameLabel = document.createElement('label');
  nameLabel.setAttribute('for', 'pay-account-name');
  nameLabel.setAttribute('data-i18n', 'payment.accountName');
  nameLabel.textContent = t('payment.accountName');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'pay-account-name';
  nameInput.placeholder = 'Budi';
  nameInput.value = storedPayment.accountName || '';
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);

  const saveCurrentPayment = () => {
    savePaymentInfo({
      bank: bankInput.value,
      accountNumber: numInput.value,
      accountName: nameInput.value,
    });
  };
  bankInput.addEventListener('input', saveCurrentPayment);
  numInput.addEventListener('input', saveCurrentPayment);
  nameInput.addEventListener('input', saveCurrentPayment);

  payBody.appendChild(bankGroup);
  payBody.appendChild(numGroup);
  payBody.appendChild(nameGroup);
  payCard.appendChild(payBody);

  containerEl.appendChild(payCard);
  const wrapper = document.createElement('div');
  wrapper.className = 'export-buttons';

  // PDF export button
  const pdfBtn = document.createElement('button');
  pdfBtn.type = 'button';
  pdfBtn.className = 'btn btn-primary export-btn export-pdf-btn';
  pdfBtn.innerHTML = `\u{1F4C4} ${t('export.pdf')}`;
  pdfBtn.addEventListener('click', handlePdfExport);
  wrapper.appendChild(pdfBtn);

  // WhatsApp copy button
  const waBtn = document.createElement('button');
  waBtn.type = 'button';
  waBtn.className = 'btn btn-primary export-btn export-wa-btn';
  waBtn.innerHTML = `\u{1F4CB} ${t('export.whatsapp')}`;
  waBtn.addEventListener('click', handleWhatsAppCopy);
  wrapper.appendChild(waBtn);

  // Share link button
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-primary export-btn export-share-btn';
  shareBtn.innerHTML = `\u{1F517} ${t('export.shareLink')}`;
  shareBtn.addEventListener('click', handleShareLink);
  wrapper.appendChild(shareBtn);

  containerEl.appendChild(wrapper);
}

/**
 * Current snapshot with the live payment form values, so the share link
 * always matches the WhatsApp text (the snapshot itself is frozen at Calculate).
 * @returns {object|null}
 */
function getLiveSnapshot() {
  const snapshot = getSnapshotFn ? getSnapshotFn() : null;
  return snapshot && { ...snapshot, payment: getPaymentInfo() };
}

/**
 * Build the read-only share URL for a snapshot.
 * @param {object} snapshot
 * @returns {string}
 */
function buildShareUrl(snapshot) {
  return `${location.origin}${location.pathname}#share=${encodeSnapshot(snapshot)}`;
}

async function handleShareLink() {
  const snapshot = getLiveSnapshot();
  if (!snapshot) return;

  const url = buildShareUrl(snapshot);
  const btn = containerEl.querySelector('.export-share-btn');

  try {
    await navigator.clipboard.writeText(url);
    showCopySuccess(btn);
  } catch {
    fallbackCopy(url, btn);
  }
}

/**
 * Build the printable PDF content as a detached DOM node.
 * All participant and item names are set via textContent, so names coming
 * from receipts or decoded share links cannot inject markup (XSS-safe).
 * @param {object} results - Result from splitBill()
 * @param {object|null} itemsMap - Map of participant name -> assigned items
 * @returns {HTMLElement}
 */
export function buildPdfContent(results, itemsMap, payment = null) {
  const pdfContainer = document.createElement('div');
  pdfContainer.style.cssText =
    'position:absolute;top:0;left:0;width:210mm;z-index:-1;background:#ffffff;color:#1a1a2e;font-family:system-ui,-apple-system,sans-serif;padding:20px;';

  // Title and date
  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:20px;';
  const h1 = document.createElement('h1');
  h1.style.cssText = 'margin:0;font-size:24px;color:#1a1a2e;';
  h1.textContent = 'BagiAdil';
  const dateP = document.createElement('p');
  dateP.style.cssText = 'margin:5px 0;color:#555;';
  dateP.textContent = new Date().toLocaleDateString();
  header.appendChild(h1);
  header.appendChild(dateP);
  pdfContainer.appendChild(header);

  // Grand total
  const totalDiv = document.createElement('div');
  totalDiv.style.cssText =
    'text-align:center;margin-bottom:20px;padding:10px;background:#f0f0f5;border-radius:8px;';
  const totalStrong = document.createElement('strong');
  totalStrong.textContent = t('results.grandTotal');
  totalDiv.appendChild(totalStrong);
  totalDiv.appendChild(
    document.createTextNode(' ' + formatCurrency(results.grandTotal)),
  );
  pdfContainer.appendChild(totalDiv);

  // Participant cards
  results.participants.forEach((p) => {
    const card = document.createElement('div');
    card.style.cssText =
      'border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:12px;';

    const nameEl = document.createElement('h3');
    nameEl.style.cssText = 'margin:0 0 8px 0;color:#1a1a2e;';
    nameEl.textContent = p.name;
    card.appendChild(nameEl);

    const items = itemsMap && itemsMap[p.name];
    if (items && items.length > 0) {
      const ul = document.createElement('ul');
      ul.style.cssText =
        'list-style:none;padding:0;margin:0 0 8px 0;font-size:12px;color:#555;';
      items.forEach((item) => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:2px 0;';
        if (item.qty && item.qty > 1) {
          li.textContent = `${item.qty}x ${item.name} @ ${formatCurrency(item.unitPrice)} - ${formatCurrency(item.price)}`;
        } else {
          li.textContent = `${item.name} - ${formatCurrency(item.price)}`;
        }
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    const details = document.createElement('div');
    details.style.cssText = 'font-size:13px;color:#444;';
    [
      [t('results.originalOrder'), formatCurrency(p.originalOrder)],
      [t('results.discount'), '-' + formatCurrency(p.discount)],
      [t('results.shippingShare'), formatCurrency(p.shippingShare)],
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      row.textContent = `${label}: ${value}`;
      details.appendChild(row);
    });
    card.appendChild(details);

    const finalEl = document.createElement('div');
    finalEl.style.cssText = 'margin-top:8px;font-weight:bold;font-size:15px;';
    finalEl.textContent = `${t('results.finalPayment')}: ${formatCurrency(p.finalPayment)}`;
    card.appendChild(finalEl);

    pdfContainer.appendChild(card);
  });
  if (payment && (payment.bank || payment.accountNumber)) {
    const payDiv = document.createElement('div');
    payDiv.style.cssText =
      'margin-top:15px;padding:10px;border-top:1px dashed #ccc;font-size:13px;color:#333;';
    const payTitle = document.createElement('strong');
    payTitle.textContent = `${t('export.wa.payment')}: `;
    payDiv.appendChild(payTitle);
    const parts = [];
    if (payment.bank) parts.push(payment.bank);
    if (payment.accountNumber) parts.push(payment.accountNumber);
    if (payment.accountName) parts.push(`(${t('export.wa.accountHolder')} ${payment.accountName})`);
    payDiv.appendChild(document.createTextNode(parts.join(' ')));
    pdfContainer.appendChild(payDiv);
  }

  return pdfContainer;
}

async function handlePdfExport() {
  const results = getResultsFn ? getResultsFn() : null;
  if (!results) return;

  const pdfBtn = containerEl.querySelector('.export-pdf-btn');
  if (pdfBtn.disabled) return;
  pdfBtn.disabled = true;

  try {
    const html2pdf = await import('html2pdf.js');
    const lib = html2pdf.default || html2pdf;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    const itemsMap = getItemsMapFn ? getItemsMapFn() : null;
    const payment = getPaymentInfo();
    const pdfContainer = buildPdfContent(results, itemsMap, payment);
    document.body.appendChild(pdfContainer);

    // Allow browser to render the container before capturing
    await new Promise(resolve => setTimeout(resolve, 300));

    // html2canvas mis-measures an off-screen (absolute/fixed) element as
    // zero-height, which produces a blank PDF. Pass the container's real
    // rendered dimensions explicitly so the full content is captured.
    const captureWidth = pdfContainer.scrollWidth;
    const captureHeight = pdfContainer.scrollHeight;

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `BagiAdil-${dateStr}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    await lib().from(pdfContainer).set(opt).save();
    document.body.removeChild(pdfContainer);
  } catch {
    alert('PDF export is not available in this environment.');
  } finally {
    const btn = containerEl.querySelector('.export-pdf-btn');
    if (btn) btn.disabled = false;
  }
}

async function handleWhatsAppCopy() {
  const results = getResultsFn ? getResultsFn() : null;
  if (!results) return;

  const params = getParamsFn ? getParamsFn() : {};
  const snapshot = getLiveSnapshot();
  const shareUrl = snapshot ? buildShareUrl(snapshot) : '';
  const payment = getPaymentInfo();
  const text = generateWhatsAppText(results, params, shareUrl, payment);
  const btn = containerEl.querySelector('.export-wa-btn');

  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess(btn);
  } catch {
    // Fallback for older browsers
    fallbackCopy(text, btn);
  }
}

function fallbackCopy(text, btn) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showCopySuccess(btn);
  } catch {
    alert('Failed to copy to clipboard');
  }
  document.body.removeChild(textarea);
}

function showCopySuccess(btn) {
  if (!btn) return;
  const originalText = btn.innerHTML;
  btn.innerHTML = '\u2705 Copied!';
  btn.classList.add('export-btn-success');
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove('export-btn-success');
  }, 2000);
}

/**
 * Get current payment destination from inputs or storage.
 * @returns {{bank: string, accountNumber: string, accountName: string}|null}
 */
export function getPaymentInfo() {
  if (!containerEl) return loadPaymentInfo();
  const bankInput = containerEl.querySelector('#pay-bank');
  const numInput = containerEl.querySelector('#pay-account-number');
  const nameInput = containerEl.querySelector('#pay-account-name');
  if (!bankInput || !numInput || !nameInput) return loadPaymentInfo();
  const bank = bankInput.value.trim();
  const accountNumber = numInput.value.trim();
  const accountName = nameInput.value.trim();
  if (!bank && !accountNumber && !accountName) return null;
  return { bank, accountNumber, accountName };
}

/**
 * Set payment destination inputs programmatically.
 * @param {{bank?: string, accountNumber?: string, accountName?: string}|null} info
 */
export function setPaymentInfo(info) {
  if (!containerEl) return;
  const bankInput = containerEl.querySelector('#pay-bank');
  const numInput = containerEl.querySelector('#pay-account-number');
  const nameInput = containerEl.querySelector('#pay-account-name');
  if (bankInput) bankInput.value = (info && info.bank) || '';
  if (numInput) numInput.value = (info && info.accountNumber) || '';
  if (nameInput) nameInput.value = (info && info.accountName) || '';
  if (info) savePaymentInfo(info);
}
/**
 * Update translated text in the export component without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  const pdfBtn = containerEl.querySelector('.export-pdf-btn');
  if (pdfBtn) pdfBtn.innerHTML = `\u{1F4C4} ${t('export.pdf')}`;
  const waBtn = containerEl.querySelector('.export-wa-btn');
  if (waBtn) waBtn.innerHTML = `\u{1F4CB} ${t('export.whatsapp')}`;
  const shareBtn = containerEl.querySelector('.export-share-btn');
  if (shareBtn) shareBtn.innerHTML = `\u{1F517} ${t('export.shareLink')}`;
  const payTitle = containerEl.querySelector('.payment-card-header strong');
  if (payTitle) payTitle.textContent = t('payment.title');
  const bankLabel = containerEl.querySelector('label[for="pay-bank"]');
  if (bankLabel) bankLabel.textContent = t('payment.bank');
  const bankInput = containerEl.querySelector('#pay-bank');
  if (bankInput) bankInput.placeholder = t('payment.bankPlaceholder');
  const numLabel = containerEl.querySelector('label[for="pay-account-number"]');
  if (numLabel) numLabel.textContent = t('payment.accountNumber');
  const nameLabel = containerEl.querySelector('label[for="pay-account-name"]');
  if (nameLabel) nameLabel.textContent = t('payment.accountName');
}
/**
 * Generate a WhatsApp-formatted text summary from results.
 * @param {object} results - Result from splitBill()
 * @param {object} [params] - Optional params (discount, shipping)
 * @param {string} [shareUrl] - Optional share link, appended at the end
 * @returns {string}
 */
export function generateWhatsAppText(results, params = {}, shareUrl = '', payment = null) {
  const { participants, grandTotal, verification } = results;

  const totalDiscount = params.totalDiscount || 0;
  const totalShipping = params.totalShipping || 0;

  // Calculate total tagihan (original total before discount/shipping adjustments)
  const totalTagihan = participants.reduce((sum, p) => sum + Number(p.originalOrder), 0);

  let text = `*${t('export.wa.title')}*\n\n`;
  text += `${t('export.wa.totalBill')}: ${formatCurrency(totalTagihan)}\n`;
  text += `${t('export.wa.discount')}: ${formatCurrency(totalDiscount)}\n`;
  text += `${t('export.wa.shipping')}: ${formatCurrency(totalShipping)}\n\n`;
  text += `*${t('export.wa.split')}:*\n`;

  participants.forEach((p) => {
    text += `- ${p.name}: ${formatCurrency(p.finalPayment)}\n`;
  });

  const balancedText = verification.balanced ? t('results.balanced') : t('results.unbalanced');
  text += `\n_Total: ${formatCurrency(grandTotal)} (${balancedText})_`;

  if (payment && (payment.bank || payment.accountNumber)) {
    text += `\n\n*${t('export.wa.payment')}:*`;
    if (payment.bank && payment.accountNumber) {
      text += `\n${payment.bank}: ${payment.accountNumber}`;
    } else if (payment.accountNumber) {
      text += `\n${payment.accountNumber}`;
    } else if (payment.bank) {
      text += `\n${payment.bank}`;
    }
    if (payment.accountName) {
      text += `\n${t('export.wa.accountHolder')} ${payment.accountName}`;
    }
  }
  if (shareUrl) {
    text += `\n\n${t('export.wa.detail')}: ${shareUrl}`;
  }

  return text;
}
