/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import {
  initParticipants,
  getParticipants,
  updateTranslations as updateParticipantsTranslations,
} from './participants.js';
import { initAddItemForm, updateTranslations as updateItemsTranslations } from './items.js';
import {
  initBillParams,
  getParams,
  setParams,
  updateTranslations as updateBillParamsTranslations,
} from './bill-params.js';
import {
  initAssignmentTable,
  addItem,
  setItems,
  updateParticipants,
  getAssignmentState,
  updateTranslations as updateTableTranslations,
} from './assignment-table.js';
import { renderResults } from './results.js';
import { splitBill } from '../engine/calculator.js';
import { initUpload, updateTranslations as updateUploadTranslations } from './upload.js';
import { renderOCRResults } from './ocr-results.js';
import { parseReceipt } from '../ocr/parsers/index.js';
import { scoreConfidence } from '../ocr/confidence.js';
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
  const addItemEl = document.querySelector('#add-item-section .section-content');
  const assignmentTableEl = document.querySelector('#assignment-table-section .section-content');
  const resultsEl = document.querySelector('#results .section-content');
  const calculateBtn = document.querySelector('#calculate');

  // Initialize storage
  initStorage();

  // Initialize mode tabs
  initModeTabs();

  // Initialize language toggle
  initLangToggle();

  // Initialize participants
  initParticipants(participantsEl, {
    onChange: (participantsList) => {
      updateParticipants(participantsList);
      saveParticipants(participantsList);
      updateCalculateButton();
    },
  });

  // Initialize bill params
  initBillParams(billParamsEl);

  // Initialize add item form
  initAddItemForm(addItemEl, {
    onAddItem: (item) => {
      addItem(item);
      updateCalculateButton();
    },
  });

  // Initialize assignment table
  initAssignmentTable(assignmentTableEl, {
    participants: getParticipants(),
    onAssignmentChange: () => {
      updateCalculateButton();
    },
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
  updateCalculateButton();
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
  updateItemsTranslations();
  updateBillParamsTranslations();
  updateTableTranslations();
  updateUploadTranslations();
  updateExportTranslations();

  // Re-render results if they exist
  if (currentResult) {
    const resultsEl = document.querySelector('#results .section-content');
    if (resultsEl) {
      renderResults(currentResult, resultsEl, currentItemsMap);
    }
  }

  // Update calculate status text
  updateCalculateButton();
}

function initModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  const ocrSection = document.querySelector('#ocr-section');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      if (mode === 'manual') {
        ocrSection.hidden = true;
      } else {
        ocrSection.hidden = false;
      }
    });
  });
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
    populateManualFromOCR(confirmedData);
  });
}

function populateManualFromOCR(data) {
  // Switch to manual mode view
  const tabs = document.querySelectorAll('.mode-tab');
  const ocrSection = document.querySelector('#ocr-section');

  tabs.forEach((t) => t.classList.remove('active'));
  tabs[0].classList.add('active');
  ocrSection.hidden = true;

  // Convert OCR items to assignment table format
  const items = data.items.map((item) => {
    const qty = item.quantity || 1;
    const unitPrice = Math.round(item.total / qty);
    return { name: item.name, unitPrice, qty };
  });

  // Set items in assignment table (replaces all)
  setItems(items);

  // Set bill parameters
  setParams({ totalDiscount: data.discount || 0, totalShipping: data.deliveryFee || 0 });

  updateCalculateButton();
}

function updateCalculateButton() {
  const calculateBtn = document.querySelector('#calculate');
  const statusEl = document.querySelector('#calculate-status');
  if (!calculateBtn || !statusEl) return;

  const state = getAssignmentState();

  if (state.allAssigned) {
    calculateBtn.disabled = false;
    statusEl.textContent = t('table.allAssigned');
    statusEl.className = 'calculate-status success';
  } else {
    calculateBtn.disabled = true;
    if (state.totalRemaining > 0) {
      statusEl.textContent = t('table.itemsRemaining').replace('{n}', String(state.totalRemaining));
      statusEl.className = 'calculate-status warning';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'calculate-status warning';
    }
  }
}

function handleCalculate(resultsEl) {
  // Clear previous errors
  clearAllErrors();

  const participants = getParticipants();
  const state = getAssignmentState();
  const params = getParams();

  if (participants.length === 0) {
    showValidationErrors([{ message: t('validation.noParticipants') }]);
    return;
  }

  if (!state.allAssigned) {
    return;
  }

  // Build orders from assignments
  const assignmentData = state.assignments;
  const orders = [];
  Object.entries(assignmentData).forEach(([name, data]) => {
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
  Object.entries(assignmentData).forEach(([name, data]) => {
    if (data.items && data.items.length > 0) {
      itemsMap[name] = data.items.map((item) => ({ name: item.name, price: item.price }));
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
