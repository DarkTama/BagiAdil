/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import { initParticipants, getParticipants } from './participants.js';
import { initItems, getItems, updateParticipantOptions } from './items.js';
import { initBillParams, getParams } from './bill-params.js';
import { renderResults } from './results.js';
import { splitBill } from '../engine/calculator.js';

/**
 * Initialize the entire app UI.
 */
export function initApp() {
  const participantsEl = document.querySelector('#participants .section-content');
  const itemsEl = document.querySelector('#items .section-content');
  const billParamsEl = document.querySelector('#bill-params .section-content');
  const resultsEl = document.querySelector('#results .section-content');
  const calculateBtn = document.querySelector('#calculate');

  // Initialize components
  initParticipants(participantsEl, {
    onChange: (participants) => {
      updateParticipantOptions(participants);
    },
  });

  initItems(itemsEl);
  initBillParams(billParamsEl);

  // Wire up calculate button
  calculateBtn.addEventListener('click', () => {
    handleCalculate(resultsEl);
  });
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

  // Render results
  renderResults(result, resultsEl);

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
