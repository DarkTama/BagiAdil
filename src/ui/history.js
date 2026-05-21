/**
 * Split history component.
 * Lists past splits saved in localStorage and lets the user reload, rename,
 * share, or delete them. All data stays in the browser.
 */

import { t } from '../i18n/index.js';
import { formatCurrency } from '../engine/formatter.js';
import { computeSplit, encodeSnapshot } from './snapshot.js';
import { loadHistory, deleteHistoryEntry, renameHistoryEntry } from './storage.js';
import { getReceipt, deleteReceipt } from './image-store.js';

let containerEl = null;
let onLoadCallback = null;
// Object URLs for receipt thumbnails, revoked on each re-render.
let objectUrls = [];

/**
 * Initialize the history component.
 * @param {HTMLElement} el - Container element
 * @param {object} options
 * @param {function} options.onLoad - Called with a history entry when "Load" is clicked
 */
export function initHistory(el, options = {}) {
  containerEl = el;
  onLoadCallback = options.onLoad || null;
  render();
}

/**
 * Re-render the history list (call after a split is saved).
 */
export function refreshHistory() {
  render();
}

/**
 * Re-render translated labels without losing state.
 */
export function updateTranslations() {
  render();
}

/**
 * Build a shareable URL for a history entry.
 * @param {object} entry
 * @returns {string}
 */
export function buildShareUrl(entry) {
  const snapshot = {
    participants: entry.participants || [],
    params: entry.params || {},
    items: entry.items || [],
  };
  return `${location.origin}${location.pathname}#share=${encodeSnapshot(snapshot)}`;
}

function render() {
  if (!containerEl) return;
  // Release receipt thumbnail URLs created by the previous render.
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  containerEl.innerHTML = '';

  const entries = loadHistory();

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = t('history.empty');
    containerEl.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'history-list';
  entries.forEach((entry) => list.appendChild(renderEntry(entry)));
  containerEl.appendChild(list);
}

function renderEntry(entry) {
  const row = document.createElement('div');
  row.className = 'history-entry';

  // Editable label
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'history-label';
  labelInput.value = entry.label || '';
  labelInput.setAttribute('aria-label', t('history.rename'));
  labelInput.addEventListener('change', () => {
    const next = labelInput.value.trim();
    if (next) {
      renameHistoryEntry(entry.id, next);
    } else {
      labelInput.value = entry.label || '';
    }
  });
  row.appendChild(labelInput);

  // Meta line: date + people count + grand total
  const meta = document.createElement('div');
  meta.className = 'history-meta';
  const date = new Date(entry.createdAt || Date.now()).toLocaleString();
  let summary = '';
  try {
    const { result } = computeSplit(entry);
    const count = (entry.participants || []).length;
    summary =
      ' · ' +
      t('history.peopleCount').replace('{n}', count) +
      ' · ' +
      formatCurrency(result.grandTotal);
  } catch {
    summary = '';
  }
  meta.textContent = date + summary;
  row.appendChild(meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'history-actions';

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'btn btn-primary history-load';
  loadBtn.textContent = t('history.load');
  loadBtn.addEventListener('click', () => {
    if (onLoadCallback) onLoadCallback(entry);
  });
  actions.appendChild(loadBtn);

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn history-share';
  shareBtn.textContent = t('history.share');
  shareBtn.addEventListener('click', () => {
    copyText(buildShareUrl(entry));
    const orig = shareBtn.textContent;
    shareBtn.textContent = t('share.linkCopied');
    setTimeout(() => {
      shareBtn.textContent = orig;
    }, 2000);
  });
  actions.appendChild(shareBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger history-delete';
  deleteBtn.textContent = t('history.delete');
  deleteBtn.addEventListener('click', () => {
    if (window.confirm(t('history.deleteConfirm'))) {
      deleteHistoryEntry(entry.id);
      deleteReceipt(entry.id);
      render();
    }
  });
  actions.appendChild(deleteBtn);

  row.appendChild(actions);

  // Receipt thumbnail, loaded asynchronously from IndexedDB (if one exists).
  getReceipt(entry.id).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'history-receipt';
    link.title = t('history.viewReceipt');
    const img = document.createElement('img');
    img.className = 'history-receipt-thumb';
    img.src = url;
    img.alt = t('history.viewReceipt');
    img.loading = 'lazy';
    link.appendChild(img);
    row.appendChild(link);
  });

  return row;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(textarea);
  }
}
