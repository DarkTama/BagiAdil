/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import { initParticipants, getParticipants } from './participants.js';
import { initItems, getItems, updateParticipantOptions } from './items.js';
import { initBillParams, getParams } from './bill-params.js';
import { renderResults } from './results.js';
import { splitBill } from '../engine/calculator.js';
import { initUpload } from './upload.js';
import { renderOCRResults } from './ocr-results.js';
import { parseReceipt } from '../ocr/parsers/index.js';
import { scoreConfidence } from '../ocr/confidence.js';
import { initAssigner } from './assigner.js';
import { initExport } from './export.js';
import { initStorage, saveParticipants } from './storage.js';

let currentResult = null;

/**
 * Initialize the entire app UI.
 */
export function initApp() {
  const participantsEl = document.querySelector('#participants .section-content');
  const itemsEl = document.querySelector('#items .section-content');
  const billParamsEl = document.querySelector('#bill-params .section-content');
  const resultsEl = document.querySelector('#results .section-content');
  const calculateBtn = document.querySelector('#calculate');

  // Initialize storage
  initStorage();

  // Initialize mode tabs
  initModeTabs();

  // Initialize components
  initParticipants(participantsEl, {
    onChange: (participants) => {
      updateParticipantOptions(participants);
      saveParticipants(participants);
    },
  });

  initItems(itemsEl);
  initBillParams(billParamsEl);

  // Initialize OCR upload
  const ocrUploadEl = document.querySelector('#ocr-upload .section-content');
  initUpload(ocrUploadEl, (ocrResult) => {
    handleOCRResult(ocrResult);
  });

  // Initialize export
  const exportEl = document.querySelector('#export-section .section-content');
  if (exportEl) {
    initExport(exportEl, () => currentResult);
  }

  // Wire up calculate button
  calculateBtn.addEventListener('click', () => {
    handleCalculate(resultsEl);
  });

  // Wire up assigner section
  const assignerBtn = document.querySelector('#show-assigner');
  if (assignerBtn) {
    assignerBtn.addEventListener('click', () => {
      showAssigner();
    });
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
  // Switch to manual mode
  const tabs = document.querySelectorAll('.mode-tab');
  const manualSection = document.querySelector('#manual-section');
  const ocrSection = document.querySelector('#ocr-section');

  tabs.forEach((t) => t.classList.remove('active'));
  tabs[0].classList.add('active');
  manualSection.hidden = false;
  ocrSection.hidden = true;

  // Populate items - dispatch a custom event for the items component to handle
  const event = new CustomEvent('ocr-items-confirmed', { detail: data });
  document.dispatchEvent(event);
}

function showAssigner() {
  const assignerSection = document.querySelector('#assigner-section');
  const assignerEl = document.querySelector('#assigner-section .section-content');
  const resultsEl = document.querySelector('#results .section-content');

  if (!assignerSection || !assignerEl) return;

  const participants = getParticipants();
  const rawItems = getItems();

  if (participants.length === 0 || rawItems.length === 0) {
    return;
  }

  // Map items for assigner (only need name and price)
  const assignerItems = rawItems.map((item) => ({
    name: item.name,
    price: item.price,
  }));

  assignerSection.hidden = false;

  initAssigner(assignerEl, {
    items: assignerItems,
    participants,
    onAssignmentChange: (assignmentData) => {
      handleAssignmentChange(assignmentData, resultsEl);
    },
  });

  assignerSection.scrollIntoView({ behavior: 'smooth' });
}

function handleAssignmentChange(assignmentData, resultsEl) {
  const params = getParams();
  const participants = getParticipants();

  // Build orders from assignments
  const orders = [];
  participants.forEach((name) => {
    const data = assignmentData[name];
    if (data && data.subtotal > 0) {
      orders.push({ name, amount: data.subtotal });
    }
  });

  if (orders.length === 0) {
    resultsEl.innerHTML = '';
    currentResult = null;
    updateExportVisibility(false);
    return;
  }

  // Call engine
  const result = splitBill({
    orders,
    totalDiscount: params.totalDiscount,
    totalShipping: params.totalShipping,
  });

  currentResult = result;

  // Render results
  renderResults(result, resultsEl);
  updateExportVisibility(true);
}

function updateExportVisibility(show) {
  const exportSection = document.querySelector('#export-section');
  if (exportSection) {
    exportSection.hidden = !show;
  }
}

function handleCalculate(resultsEl) {
  // Clear previous errors
  clearAllErrors();

  const participants = getParticipants();
  const items = getItems();
  const params = getParams();

  // Validate
  const errors = validate(participants, items);
  if (errors.length > 0) {
    showValidationErrors(errors);
    return;
  }

  // Build orders array: for each participant, sum all their assigned item prices
  const orderMap = {};
  participants.forEach((name) => {
    orderMap[name] = 0;
  });

  items.forEach((item) => {
    orderMap[item.participant] += item.price;
  });

  const orders = participants
    .filter((name) => orderMap[name] > 0)
    .map((name) => ({
      name,
      amount: orderMap[name],
    }));

  // Call engine
  const result = splitBill({
    orders,
    totalDiscount: params.totalDiscount,
    totalShipping: params.totalShipping,
  });

  currentResult = result;

  // Render results
  renderResults(result, resultsEl);
  updateExportVisibility(true);

  // Save participants
  saveParticipants(participants);

  // Scroll to results
  const resultsSection = document.querySelector('#results');
  if (resultsSection) {
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }
}

function validate(participants, items) {
  const errors = [];

  if (participants.length === 0) {
    errors.push({ field: 'participants', message: 'Add at least one participant' });
  }

  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one item' });
  }

  items.forEach((item, index) => {
    if (!item.name.trim()) {
      errors.push({ field: `item-name-${index}`, message: `Item ${index + 1}: name is required` });
    }
    if (item.price < 0) {
      errors.push({
        field: `item-price-${index}`,
        message: `Item ${index + 1}: price cannot be negative`,
      });
    }
    if (!item.participant) {
      errors.push({
        field: `item-participant-${index}`,
        message: `Item ${index + 1}: must be assigned to a participant`,
      });
    }
  });

  return errors;
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
