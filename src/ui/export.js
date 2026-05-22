/**
 * Export functionality: PDF export and WhatsApp text summary.
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';
import { encodeSnapshot } from './snapshot.js';

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
 * Build the read-only share URL for a snapshot.
 * @param {object} snapshot
 * @returns {string}
 */
function buildShareUrl(snapshot) {
  return `${location.origin}${location.pathname}#share=${encodeSnapshot(snapshot)}`;
}

async function handleShareLink() {
  const snapshot = getSnapshotFn ? getSnapshotFn() : null;
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
export function buildPdfContent(results, itemsMap) {
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
    const pdfContainer = buildPdfContent(results, itemsMap);
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
  const snapshot = getSnapshotFn ? getSnapshotFn() : null;
  const shareUrl = snapshot ? buildShareUrl(snapshot) : '';
  const text = generateWhatsAppText(results, params, shareUrl);
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
}

/**
 * Generate a WhatsApp-formatted text summary from results.
 * @param {object} results - Result from splitBill()
 * @param {object} [params] - Optional params (discount, shipping)
 * @param {string} [shareUrl] - Optional share link, appended at the end
 * @returns {string}
 */
export function generateWhatsAppText(results, params = {}, shareUrl = '') {
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

  if (shareUrl) {
    text += `\n\n${t('export.wa.detail')}: ${shareUrl}`;
  }

  return text;
}
