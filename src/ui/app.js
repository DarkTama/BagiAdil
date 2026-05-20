/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import { initParticipants, getParticipants, updateTranslations as updateParticipantsTranslations } from './participants.js';
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
} from './table-assigner.js';
import { initExport, updateTranslations as updateExportTranslations } from './export.js';
import { initStorage, saveParticipants } from './storage.js';
import { t, getLocale, setLocale } from '../i18n/index.js';

let currentResult = null;
let currentItemsMap = null;

/**
 * Initialize the entire app UI.
 */
export function initApp() {
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
    initExport(exportEl, () => currentResult, () => getParams());
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

  // Re-render results if they exist
  if (currentResult) {
    const resultsEl = document.querySelector('#results .section-content');
    if (resultsEl) {
      renderResults(currentResult, resultsEl, currentItemsMap);
    }
  }
}

function initModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  const manualSection = document.querySelector('#manual-section');
  const ocrSection = document.querySelector('#ocr-section');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      if (mode === 'manual') {
        manualSection.hidden = false;
        ocrSection.hidden = true;
      } else {
        manualSection.hidden = true;
        ocrSection.hidden = false;
      }
    });
  });
}

function handleTableStateChange(state) {
  const calculateBtn = document.querySelector('#calculate');
  const statusEl = document.querySelector('#calculate-status');

  if (!calculateBtn || !statusEl) return;

  const tableState = getTableState();

  if (tableState.items.length === 0) {
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
  // Add items to table assigner from OCR
  tableAddItemsFromOCR(data.items);

  // Set bill parameters
  setParams({ totalDiscount: data.discount, totalShipping: data.deliveryFee });

  // Hide OCR section, show manual section (so user can see participants/params)
  const ocrSection = document.querySelector('#ocr-section');
  const manualSection = document.querySelector('#manual-section');
  const tabs = document.querySelectorAll('.mode-tab');

  tabs.forEach((t) => t.classList.remove('active'));
  tabs[0].classList.add('active');
  manualSection.hidden = false;
  ocrSection.hidden = true;
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

  // Scroll to results
  const resultsSection = document.querySelector('#results');
  if (resultsSection) {
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }
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
