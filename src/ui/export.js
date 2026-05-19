/**
 * Export functionality: PDF export and WhatsApp text summary.
 */

import { formatCurrency } from '../engine/formatter.js';

let containerEl = null;
let getResultsFn = null;

/**
 * Initialize the export component.
 * @param {HTMLElement} el - Container element
 * @param {function} resultsFn - Function that returns current results object
 */
export function initExport(el, resultsFn) {
  containerEl = el;
  getResultsFn = resultsFn;
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
  pdfBtn.innerHTML = '\u{1F4C4} Export PDF';
  pdfBtn.addEventListener('click', handlePdfExport);
  wrapper.appendChild(pdfBtn);

  // WhatsApp copy button
  const waBtn = document.createElement('button');
  waBtn.type = 'button';
  waBtn.className = 'btn btn-primary export-btn export-wa-btn';
  waBtn.innerHTML = '\u{1F4CB} Copy for WhatsApp';
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

    const resultsSection = document.querySelector('#results');
    if (!resultsSection) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `BagiAdil-${dateStr}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    lib(resultsSection).set(opt).save();
  } catch {
    // html2pdf may fail in some environments
    alert('PDF export is not available in this environment.');
  }
}

async function handleWhatsAppCopy() {
  const results = getResultsFn ? getResultsFn() : null;
  if (!results) return;

  const text = generateWhatsAppText(results);
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

  let text = '*BagiAdil - Bill Split*\n\n';
  text += `Total Tagihan: ${formatCurrency(totalTagihan)}\n`;
  text += `Diskon: ${formatCurrency(totalDiscount)}\n`;
  text += `Ongkir: ${formatCurrency(totalShipping)}\n\n`;
  text += '*Pembagian:*\n';

  participants.forEach((p) => {
    text += `- ${p.name}: ${formatCurrency(p.finalPayment)}\n`;
  });

  text += `\n_Total: ${formatCurrency(grandTotal)} (${verification.balanced ? 'balanced' : 'unbalanced'})_`;

  return text;
}
