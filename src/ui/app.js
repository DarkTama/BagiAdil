/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import { initParticipants, getParticipants, setParticipants, updateTranslations as updateParticipantsTranslations } from './participants.js';
import { initAddItemForm, updateTranslations as updateAddItemFormTranslations } from './items.js';
import { initBillParams, getParams, setParams, updateTranslations as updateBillParamsTranslations } from './bill-params.js';
import { renderResults } from './results.js';
import { splitBill } from '../engine/calculator.js';
import { initUpload, updateTranslations as updateUploadTranslations } from './upload.js';
import { renderOCRResults } from './ocr-results.js';
import { parseReceipt } from '../ocr/parsers/index.js';
import { scoreConfidence } from '../ocr/confidence.js';
import {
  initTableAssigner,
  getTableState,
  addItemsFromOCR as tableAddItemsFromOCR,
  updateParticipants as tableUpdateParticipants,
  updateTranslations as updateTableTranslations,
  addItems as tableAddItems,
  clearItems as tableClearItems,
  loadItems as tableLoadItems,
} from './table-assigner.js';
import { initExport, updateTranslations as updateExportTranslations } from './export.js';
import { initStorage, saveParticipants, saveHistoryEntry } from './storage.js';
import { initHistory, refreshHistory, updateTranslations as updateHistoryTranslations } from './history.js';
import { buildSnapshot, computeSplit, decodeSnapshot } from './snapshot.js';
import { t, getLocale, setLocale } from '../i18n/index.js';

let currentResult = null;
let currentItemsMap = null;
let currentSnapshot = null;
let currentHistoryId = null;

/**
 * Initialize the entire app UI.
 */
export function initApp() {
  // Shared link: if the URL carries a split snapshot, show a read-only result.
  const sharedSnapshot = getSharedSnapshot();
  if (sharedSnapshot) {
    renderSharedView(sharedSnapshot);
    return;
  }

  const participantsEl = document.querySelector('#participants .section-content');
  const billParamsEl = document.querySelector('#bill-params .section-content');
  const addItemFormEl = document.querySelector('#add-item-form .section-content');
  const tableAssignerEl = document.querySelector('#table-assigner .section-content');
  const resultsEl = document.querySelector('#results .section-content');
  const calculateBtn = document.querySelector('#calculate');

  // Initialize storage
  initStorage();

  // Initialize mode tabs
  initModeTabs();

  // Initialize language toggle
  initLangToggle();

  // Initialize components
  initParticipants(participantsEl, {
    onChange: (participants) => {
      tableUpdateParticipants(participants);
      saveParticipants(participants);
    },
  });

  // Initialize add item form
  initAddItemForm(addItemFormEl, {
    onAddItem: (item) => tableAddItems([item]),
  });

  initBillParams(billParamsEl);

  // Initialize table assigner
  initTableAssigner(tableAssignerEl, {
    participants: [],
    onStateChange: handleTableStateChange,
  });

  // Initialize OCR upload
  const ocrUploadEl = document.querySelector('#ocr-upload .section-content');
  initUpload(ocrUploadEl, (ocrResult) => {
    handleOCRResult(ocrResult);
  });

  // Initialize export
  const exportEl = document.querySelector('#export-section .section-content');
  if (exportEl) {
    initExport(
      exportEl,
      () => currentResult,
      () => getParams(),
      () => currentItemsMap,
      () => currentSnapshot,
    );
  }

  // Initialize split history
  const historyEl = document.querySelector('#history .section-content');
  if (historyEl) {
    initHistory(historyEl, { onLoad: loadSplit });
  }

  // Wire up calculate button
  calculateBtn.addEventListener('click', () => {
    handleCalculate(resultsEl);
  });

  // Listen for locale changes
  document.addEventListener('locale-changed', () => {
    updateAllTranslations();
  });

  // Apply initial translations
  updateAllTranslations();
}

function initLangToggle() {
  const langBtns = document.querySelectorAll('.lang-btn');
  const currentLang = getLocale();

  // Set initial active state
  langBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLocale(lang);
      langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    });
  });
}

function updateAllTranslations() {
  // Update all static [data-i18n] elements
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  // Update dynamic component labels without resetting state
  updateParticipantsTranslations();
  updateAddItemFormTranslations();
  updateBillParamsTranslations();
  updateUploadTranslations();
  updateExportTranslations();
  updateTableTranslations();
  updateHistoryTranslations();

  // Re-render results if they exist
  if (currentResult) {
    const resultsEl = document.querySelector('#results .section-content');
    if (resultsEl) {
      renderResults(currentResult, resultsEl, currentItemsMap);
    }
  }
}

function initModeTabs() {
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });
}

/**
 * Switch the active tab/mode: 'manual', 'ocr', or 'history'.
 * The split workflow (table assigner, calculate, results, export) is shown
 * for manual and ocr, and hidden for history.
 * @param {string} mode
 */
function setMode(mode) {
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  const show = (sel, visible) => {
    const el = document.querySelector(sel);
    if (el) el.hidden = !visible;
  };
  show('#manual-section', mode === 'manual');
  show('#ocr-section', mode === 'ocr');
  show('#history', mode === 'history');
  show('#split-workflow', mode !== 'history');
}

function handleTableStateChange(state) {
  const calculateBtn = document.querySelector('#calculate');
  const statusEl = document.querySelector('#calculate-status');

  if (!calculateBtn || !statusEl) return;

  if (state.itemCount === 0) {
    calculateBtn.disabled = true;
    statusEl.textContent = '';
    statusEl.className = '';
    return;
  }

  if (state.allAssigned) {
    calculateBtn.disabled = false;
    statusEl.textContent = t('table.allAssigned');
    statusEl.className = 'status-success';
    statusEl.id = 'calculate-status';
  } else {
    calculateBtn.disabled = true;
    statusEl.textContent = t('table.itemsRemaining').replace('{n}', state.remainingCount);
    statusEl.className = 'status-warning';
    statusEl.id = 'calculate-status';
  }
}

function handleOCRResult(ocrResult) {
  const ocrResultsSection = document.querySelector('#ocr-results-section');
  const ocrResultsEl = ocrResultsSection.querySelector('.section-content');

  if (ocrResult.error) {
    ocrResultsSection.hidden = false;
    ocrResultsEl.innerHTML = `<p class="validation-error">${ocrResult.error}</p>`;
    return;
  }

  const parsedData = parseReceipt(ocrResult.text);
  const confidence = scoreConfidence(ocrResult.confidence, parsedData);

  ocrResultsSection.hidden = false;
  renderOCRResults(parsedData, confidence, ocrResultsEl, (confirmedData) => {
    populateFromOCR(confirmedData);
  });
}

function populateFromOCR(data) {
  // A freshly scanned receipt starts a new split, not an edit of a saved one.
  currentHistoryId = null;

  // Clear existing items before adding OCR items (prevents duplicates on re-confirm)
  tableClearItems();

  // Add items to table assigner from OCR
  tableAddItemsFromOCR(data.items);

  // Set bill parameters
  setParams({ totalDiscount: data.discount, totalShipping: data.deliveryFee });

  // Switch to manual mode so the user can see participants/params.
  setMode('manual');
}

function handleCalculate(resultsEl) {
  // Clear previous errors
  clearAllErrors();

  const participants = getParticipants();
  const state = getTableState();
  const params = getParams();

  // Validate
  const errors = [];
  if (participants.length === 0) {
    errors.push({ field: 'participants', message: t('validation.noParticipants') });
  }
  if (state.items.length === 0) {
    errors.push({ field: 'items', message: t('validation.noItems') });
  }
  if (!state.allAssigned && state.items.length > 0) {
    errors.push({ field: 'assignments', message: t('table.itemsRemaining').replace('{n}', state.remainingCount) });
  }

  if (errors.length > 0) {
    showValidationErrors(errors);
    return;
  }

  // Build orders from assignments
  const orders = [];
  Object.entries(state.assignments).forEach(([name, data]) => {
    if (data.subtotal > 0) {
      orders.push({ name, amount: data.subtotal });
    }
  });

  if (orders.length === 0) {
    return;
  }

  // Call engine
  const result = splitBill({
    orders,
    totalDiscount: params.totalDiscount,
    totalShipping: params.totalShipping,
  });

  currentResult = result;

  // Build items map for results display
  const itemsMap = {};
  Object.entries(state.assignments).forEach(([person, data]) => {
    if (data.items.length > 0) {
      itemsMap[person] = data.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        price: item.qty * item.unitPrice,
      }));
    }
  });
  currentItemsMap = itemsMap;

  // Render results
  renderResults(result, resultsEl, itemsMap);
  updateExportVisibility(true);

  // Save participants
  saveParticipants(participants);

  // Auto-save this split to history. Reusing currentHistoryId means a
  // reload-then-recalculate updates the same entry instead of duplicating it.
  currentSnapshot = buildSnapshot(participants, params, state.items);
  const historyEntry = { ...currentSnapshot };
  if (currentHistoryId) {
    historyEntry.id = currentHistoryId;
  } else {
    historyEntry.label = defaultHistoryLabel();
  }
  currentHistoryId = saveHistoryEntry(historyEntry);
  refreshHistory();

  // Scroll to results
  const resultsSection = document.querySelector('#results');
  if (resultsSection) {
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }
}

function defaultHistoryLabel() {
  return new Date().toLocaleString();
}

/**
 * Restore a saved split into the editor and recalculate it.
 * @param {object} entry - history entry (snapshot + id/label)
 */
function loadSplit(entry) {
  // Restore participants first so the table assigner knows the names.
  setParticipants(entry.participants || []);
  tableLoadItems(entry.items || []);
  setParams(entry.params || { totalDiscount: 0, totalShipping: 0 });
  currentHistoryId = entry.id || null;

  // Switch to manual mode so the editor is visible.
  const tabs = document.querySelectorAll('.mode-tab');
  tabs.forEach((tab) => tab.classList.remove('active'));
  if (tabs[0]) tabs[0].classList.add('active');
  const manualSection = document.querySelector('#manual-section');
  const ocrSection = document.querySelector('#ocr-section');
  if (manualSection) manualSection.hidden = false;
  if (ocrSection) ocrSection.hidden = true;

  // Recalculate so the result is shown immediately.
  const resultsEl = document.querySelector('#results .section-content');
  handleCalculate(resultsEl);
}

/**
 * Read a shared snapshot from the URL hash (#share=...).
 * @returns {object|null}
 */
function getSharedSnapshot() {
  const match = (location.hash || '').match(/share=([^&]+)/);
  if (!match) return null;
  return decodeSnapshot(match[1]);
}

/**
 * Render a read-only shared split result, hiding all editor controls.
 * @param {object} snapshot
 */
function renderSharedView(snapshot) {
  ['.mode-tabs', '#manual-section', '#ocr-section', '#table-assigner',
    '#calculate', '#calculate-status', '#validation-errors',
    '#export-section', '#history'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.hidden = true;
  });

  initLangToggle();

  const resultsEl = document.querySelector('#results .section-content');

  function renderShared() {
    resultsEl.innerHTML = '';

    const banner = document.createElement('div');
    banner.className = 'share-banner';
    banner.textContent = t('share.banner');
    resultsEl.appendChild(banner);

    const resultsContainer = document.createElement('div');
    resultsEl.appendChild(resultsContainer);
    try {
      const { result, itemsMap } = computeSplit(snapshot);
      renderResults(result, resultsContainer, itemsMap);
    } catch {
      resultsContainer.textContent = t('share.invalid');
    }

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'btn btn-primary share-new-btn';
    newBtn.textContent = t('share.newSplit');
    newBtn.addEventListener('click', () => {
      location.hash = '';
      location.reload();
    });
    resultsEl.appendChild(newBtn);
  }

  document.addEventListener('locale-changed', () => {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    renderShared();
  });

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  renderShared();
}

function updateExportVisibility(show) {
  const exportSection = document.querySelector('#export-section');
  if (exportSection) {
    exportSection.hidden = !show;
  }
}

function showValidationErrors(errors) {
  const errorContainer = document.querySelector('#validation-errors');
  if (!errorContainer) return;

  errorContainer.innerHTML = '';
  errors.forEach((err) => {
    const errEl = document.createElement('div');
    errEl.className = 'validation-error';
    errEl.textContent = err.message;
    errorContainer.appendChild(errEl);
  });
}

function clearAllErrors() {
  const errorContainer = document.querySelector('#validation-errors');
  if (errorContainer) {
    errorContainer.innerHTML = '';
  }
}
