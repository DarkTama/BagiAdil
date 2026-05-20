/**
 * Export functionality: PDF export and WhatsApp text summary.
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';

let containerEl = null;
let getResultsFn = null;
let getParamsFn = null;

/**
 * Initialize the export component.
 * @param {HTMLElement} el - Container element
 * @param {function} resultsFn - Function that returns current results object
 */
export function initExport(el, resultsFn, paramsFn) {
  containerEl = el;
  getResultsFn = resultsFn;
  getParamsFn = paramsFn || null;
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

  containerEl.appendChild(wrapper);
}

async function handlePdfExport() {
  const results = getResultsFn ? getResultsFn() : null;
  if (!results) return;

  try {
    const html2pdf = await import('html2pdf.js');
    const lib = html2pdf.default || html2pdf;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    // Create temporary light-themed container for PDF
    const pdfContainer = document.createElement('div');
    pdfContainer.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;background:#ffffff;color:#1a1a2e;font-family:system-ui,-apple-system,sans-serif;padding:20px;';

    // Title and date
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:20px;';
    header.innerHTML = `<h1 style="margin:0;font-size:24px;color:#1a1a2e;">BagiAdil</h1><p style="margin:5px 0;color:#555;">${now.toLocaleDateString()}</p>`;
    pdfContainer.appendChild(header);

    // Grand total
    const totalDiv = document.createElement('div');
    totalDiv.style.cssText = 'text-align:center;margin-bottom:20px;padding:10px;background:#f0f0f5;border-radius:8px;';
    totalDiv.innerHTML = `<strong>${t('results.grandTotal')}</strong> ${formatCurrency(results.grandTotal)}`;
    pdfContainer.appendChild(totalDiv);

    // Participant cards
    results.participants.forEach((p) => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:12px;';

      let cardHTML = `<h3 style="margin:0 0 8px 0;color:#1a1a2e;">${p.name}</h3>`;
      cardHTML += `<div style="font-size:13px;color:#444;">`;
      cardHTML += `<div>${t('results.originalOrder')}: ${formatCurrency(p.originalOrder)}</div>`;
      cardHTML += `<div>${t('results.discount')}: -${formatCurrency(p.discount)}</div>`;
      cardHTML += `<div>${t('results.shippingShare')}: ${formatCurrency(p.shippingShare)}</div>`;
      cardHTML += `</div>`;
      cardHTML += `<div style="margin-top:8px;font-weight:bold;font-size:15px;">${t('results.finalPayment')}: ${formatCurrency(p.finalPayment)}</div>`;

      card.innerHTML = cardHTML;
      pdfContainer.appendChild(card);
    });

    document.body.appendChild(pdfContainer);

    // Wait for DOM render before capturing
    await new Promise(r => setTimeout(r, 100));

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `BagiAdil-${dateStr}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    await lib(pdfContainer).set(opt).save();
    document.body.removeChild(pdfContainer);
  } catch {
    alert('PDF export is not available in this environment.');
  }
}

async function handleWhatsAppCopy() {
  const results = getResultsFn ? getResultsFn() : null;
  if (!results) return;

  const params = getParamsFn ? getParamsFn() : {};
  const text = generateWhatsAppText(results, params);
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
}

/**
 * Generate a WhatsApp-formatted text summary from results.
 * @param {object} results - Result from splitBill()
 * @param {object} [params] - Optional params (discount, shipping)
 * @returns {string}
 */
export function generateWhatsAppText(results, params = {}) {
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

  return text;
}
