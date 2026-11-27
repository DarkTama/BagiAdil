/**
 * Export: print / save as PDF, WhatsApp text, and the share link
 * (long #share= link by default, opt-in server shortlink).
 */

import { formatCurrency } from '../engine/formatter.js';
import { t } from '../i18n/index.js';
import { buildShareUrl, encodeSnapshot } from './snapshot.js';
import { effectiveDiscount } from './results.js';
import { getSession, getPayment, subscribe, update } from './session.js';
import { savePaymentInfo } from './storage.js';
import { showToast } from './toast.js';

let containerEl = null;
// Shortlinks created this page load, keyed by encoded payload: one KV write
// per distinct split, reused by both share and WhatsApp.
const shortLinks = new Map();
let prefetchTimer = null;

/**
 * Initialize the export component. Results, items and the calculated snapshot
 * are read from the session.
 * @param {HTMLElement} el - Container element
 */
export function initExport(el) {
  containerEl = el;
  render();
  subscribe(onSession);
  onSession(getSession());
}

const PAYMENT_FIELDS = [
  ['bank', '#pay-bank'],
  ['accountNumber', '#pay-account-number'],
  ['accountName', '#pay-account-name'],
];

function onSession(state) {
  syncPaymentInputs(state);
  // Share, WhatsApp and PDF only make sense for results that match the editor.
  const disabled = !state.calc || state.stale;
  containerEl.querySelector('.export-share-btn').disabled = disabled;
  containerEl.querySelector('.export-wa-btn').disabled = disabled;
  containerEl.querySelector('.export-pdf-btn').disabled = disabled;
  // The opt-in covers this calculated split only: a new or edited split must
  // be opted in again before anything is uploaded.
  const shortBox = containerEl.querySelector('#share-short');
  shortBox.disabled = disabled;
  if (disabled) shortBox.checked = false;
  // Opted in and the payment changed: make the new shortlink once typing
  // settles, so a later click can copy without waiting on the network.
  clearTimeout(prefetchTimer);
  if (!disabled && shortBox.checked) {
    prefetchTimer = setTimeout(() => ensureShortLink().catch(() => {}), 1500);
  }
}

/**
 * Mirror session.payment into the inputs when it changed from outside
 * (e.g. a history load). Typing never differs, so focus and caret are safe.
 */
function syncPaymentInputs(state) {
  PAYMENT_FIELDS.forEach(([field, sel]) => {
    const input = containerEl.querySelector(sel);
    if (input && input.value !== state.payment[field]) input.value = state.payment[field];
  });
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

  const storedPayment = getSession().payment;

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

  // Typing updates the session and, as before, becomes the saved default.
  const saveCurrentPayment = () => {
    const raw = {
      bank: bankInput.value,
      accountNumber: numInput.value,
      accountName: nameInput.value,
    };
    update({ payment: raw });
    savePaymentInfo(raw);
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

  // Print / save as PDF: the browser prints the results section (@media print).
  const pdfBtn = document.createElement('button');
  pdfBtn.type = 'button';
  pdfBtn.className = 'btn btn-secondary export-btn export-pdf-btn';
  pdfBtn.innerHTML = `\u{1F4C4} ${t('export.pdf')}`;
  pdfBtn.addEventListener('click', handlePrint);
  wrapper.appendChild(pdfBtn);

  // WhatsApp copy button
  const waBtn = document.createElement('button');
  waBtn.type = 'button';
  waBtn.className = 'btn btn-secondary export-btn export-wa-btn';
  waBtn.innerHTML = `\u{1F4CB} ${t('export.whatsapp')}`;
  waBtn.addEventListener('click', handleWhatsAppCopy);
  wrapper.appendChild(waBtn);

  // Share link button
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-secondary export-btn export-share-btn';
  shareBtn.innerHTML = `\u{1F517} ${t('export.shareLink')}`;
  shareBtn.addEventListener('click', handleShareLink);
  wrapper.appendChild(shareBtn);

  containerEl.appendChild(wrapper);

  // Opt-in shortlink. Off by default: the long link keeps the split in the URL only.
  const shortLabel = document.createElement('label');
  shortLabel.className = 'share-short-option';
  const shortBox = document.createElement('input');
  shortBox.type = 'checkbox';
  shortBox.id = 'share-short';
  shortBox.addEventListener('change', () => {
    if (!shortBox.checked) return;
    ensureShortLink().catch(() => {
      shortBox.checked = false;
      showToast(t('export.shortLinkFailed'), 'warning');
    });
  });
  const shortText = document.createElement('span');
  shortText.className = 'share-short-text';
  shortText.textContent = t('export.shortLink');
  shortLabel.appendChild(shortBox);
  shortLabel.appendChild(shortText);
  containerEl.appendChild(shortLabel);
}

function shortLinkOptedIn() {
  return !!containerEl?.querySelector('#share-short')?.checked;
}

/**
 * Create (once per payload) the server shortlink for the live snapshot.
 * @returns {Promise<string>} the /s/<id> URL
 */
function ensureShortLink() {
  const snapshot = getLiveSnapshot();
  if (!snapshot) return Promise.reject(new Error('no split'));
  const payload = encodeSnapshot(snapshot);
  if (!shortLinks.has(payload)) {
    const pending = fetch('/api/s', { method: 'POST', body: payload })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(({ id }) => `${location.origin}/s/${id}`);
    shortLinks.set(payload, pending);
    pending.catch(() => shortLinks.delete(payload));
  }
  return shortLinks.get(payload);
}

/**
 * The link to hand out: the shortlink when opted in, else the long #share= link.
 * A failed shortlink falls back to the long link rather than sharing nothing.
 * @returns {Promise<string>}
 */
async function getShareUrl() {
  const snapshot = getLiveSnapshot();
  if (!snapshot) return '';
  if (shortLinkOptedIn()) {
    try {
      return await ensureShortLink();
    } catch {
      showToast(t('export.shortLinkFailed'), 'warning');
    }
  }
  return buildShareUrl(snapshot);
}

/**
 * Current snapshot with the live payment form values, so the share link
 * always matches the WhatsApp text (the snapshot itself is frozen at Calculate).
 * @returns {object|null}
 */
function getLiveSnapshot() {
  const { calc } = getSession();
  return calc && { ...calc.snapshot, payment: getPayment() };
}

async function handleShareLink() {
  const url = await getShareUrl();
  if (!url) return;
  const btn = containerEl.querySelector('.export-share-btn');

  // Phones get the native share sheet; desktops copy to the clipboard.
  if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: t('export.wa.title'), url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // the user closed the sheet
    }
  }
  await copyText(url, btn);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess(btn);
  } catch {
    fallbackCopy(text, btn);
  }
}

/** Print the results only (see @media print); the date heads the page. */
function handlePrint() {
  const results = document.querySelector('#results');
  if (results) {
    const locale = document.documentElement.lang === 'en' ? 'en-GB' : 'id-ID';
    results.dataset.printDate = new Date().toLocaleString(locale);
  }
  window.print();
}

async function handleWhatsAppCopy() {
  const { calc } = getSession();
  if (!calc) return;
  const results = calc.result;

  // Calculated params, not live inputs: the text must match the results on screen.
  const params = calc.snapshot.params;
  const shareUrl = await getShareUrl();
  const text = generateWhatsAppText(results, params, shareUrl, getPayment(), calc.itemsMap);
  await copyText(text, containerEl.querySelector('.export-wa-btn'));
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
    alert(t('export.copyFailed'));
  }
  document.body.removeChild(textarea);
}

function showCopySuccess(btn) {
  if (!btn) return;
  const originalText = btn.innerHTML;
  btn.innerHTML = `\u2705 ${t('export.copied')}`;
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
  const shortText = containerEl.querySelector('.share-short-text');
  if (shortText) shortText.textContent = t('export.shortLink');
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
 * @param {object|null} [payment] - Optional payment destination
 * @param {object|null} [itemsMap] - Optional map of name -> assigned items, listed under each person
 * @returns {string}
 */
export function generateWhatsAppText(results, params = {}, shareUrl = '', payment = null, itemsMap = null) {
  const { participants, grandTotal } = results;

  // The engine caps a discount above the food total; show what was applied.
  const totalDiscount = effectiveDiscount(results, params.totalDiscount || 0);
  const totalShipping = params.totalShipping || 0;
  const foodTotal = participants.reduce((sum, p) => sum + Number(p.originalOrder), 0);

  let text = `*${t('export.wa.title')}*\n\n`;
  text += `${t('export.wa.totalBill')}: ${formatCurrency(foodTotal)}\n`;
  text += `${t('export.wa.discount')}: ${formatCurrency(totalDiscount)}\n`;
  text += `${t('export.wa.shipping')}: ${formatCurrency(totalShipping)}\n\n`;
  text += `*${t('export.wa.split')}:*\n`;

  participants.forEach((p) => {
    text += `- ${p.name}: ${formatCurrency(p.finalPayment)}\n`;
    (itemsMap?.[p.name] || []).forEach((item) => {
      text += `   · ${item.qty > 1 ? `${item.qty}x ` : ''}${item.name}\n`;
    });
  });

  text += `\n_Total: ${formatCurrency(grandTotal)}_`;

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
