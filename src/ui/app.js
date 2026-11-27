/**
 * Main UI controller.
 * Initializes and coordinates all UI components.
 */

import { initParticipants, getParticipants, setParticipants, updateTranslations as updateParticipantsTranslations } from './participants.js';
import { initAddItemForm, updateTranslations as updateAddItemFormTranslations } from './items.js';
import { initBillParams, getParams, setParams, updateTranslations as updateBillParamsTranslations } from './bill-params.js';
import { renderResults } from './results.js';
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
import {
  saveParticipants, saveHistoryEntry, loadHistory, getHistoryEntry,
  saveDraft, loadDraft, clearDraft,
} from './storage.js';
import { initHistory, refreshHistory, updateTranslations as updateHistoryTranslations } from './history.js';
import { putReceipt, pruneReceipts } from './image-store.js';
import { buildSnapshot, computeSplit, decodeSnapshot, validateSnapshot } from './snapshot.js';
import { getSession, getPayment, subscribe, update, setCalculated, resetSession, editorChanged } from './session.js';
import { showToast } from './toast.js';
import { initGuide } from './guide.js';
import { t, getLocale, setLocale } from '../i18n/index.js';

// Re-entrancy guard (not state): true while applySnapshot / OCR populate write
// the editor programmatically, so their intermediate states are not tracked.
let applying = false;

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
  // A share link that cannot be decoded: drop it and open the normal editor.
  const brokenShareLink = /share=/.test(location.hash || '');
  if (brokenShareLink) {
    window.history.replaceState(null, '', location.pathname + location.search);
  }

  const participantsEl = document.querySelector('#participants .section-content');
  const billParamsEl = document.querySelector('#bill-params .section-content');
  const addItemFormEl = document.querySelector('#add-item-form .section-content');
  const tableAssignerEl = document.querySelector('#table-assigner .section-content');
  const calculateBtn = document.querySelector('#calculate');

  // Session payment starts from the saved default.
  resetSession();

  // Initialize mode tabs
  initModeTabs();

  // Initialize language toggle
  initLangToggle();

  // Initialize in-app guide (help button + first-run popup)
  initGuide();

  // Initialize components
  initParticipants(participantsEl, {
    onChange: (participants) => {
      tableUpdateParticipants(participants);
      saveParticipants(participants);
      onEditorChange();
    },
  });

  // Initialize add item form
  initAddItemForm(addItemFormEl, {
    onAddItem: (item) => tableAddItems([item]),
  });

  initBillParams(billParamsEl, { onChange: onEditorChange });

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
    initExport(exportEl);
  }

  // Initialize split history
  const historyEl = document.querySelector('#history .section-content');
  if (historyEl) {
    initHistory(historyEl, {
      onLoad: loadSplit,
      // A deleted entry must not stay the save target (paid toggles would recreate a ghost).
      onDelete: (id) => {
        if (getSession().historyId === id) update({ historyId: null });
      },
    });
  }

  // Results and export visibility follow the session; so does the draft.
  subscribe(render);
  subscribe(persistDraft);

  // Wire up calculate button
  calculateBtn.addEventListener('click', handleCalculate);
  document.querySelector('#new-split')?.addEventListener('click', newSplit);

  // Listen for locale changes
  document.addEventListener('locale-changed', () => {
    updateAllTranslations();
  });

  // Reopen the last in-progress split (after every component exists).
  restoreDraft();

  // Apply initial translations
  updateAllTranslations();

  if (brokenShareLink) showToast(t('share.invalid'), 'warning');
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

  render();
}

/**
 * Session subscriber: the one place results and export visibility are drawn.
 * Also the single path that re-renders the payment box (read live from the
 * export form), so it is never dropped.
 */
function render(state = getSession()) {
  const resultsEl = document.querySelector('#results .section-content');
  if (resultsEl) {
    if (state.calc) {
      renderResults(state.calc.result, resultsEl, state.calc.itemsMap, {
        paid: state.paid,
        onTogglePaid: handleTogglePaid,
        payment: getPayment(),
        stale: state.stale,
      });
    } else {
      resultsEl.innerHTML = '';
    }
  }
  document.querySelector('#results')?.classList.toggle('is-stale', state.stale);
  const exportSection = document.querySelector('#export-section');
  if (exportSection) exportSection.hidden = !state.calc;
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
  onEditorChange();
  // The Calculate button stays clickable at all times - clicking it while the
  // split is incomplete surfaces a toast explaining what is missing, rather
  // than silently doing nothing (a disabled button gives no feedback).
  const statusEl = document.querySelector('#calculate-status');
  if (!statusEl) return;

  if (state.itemCount === 0) {
    statusEl.textContent = '';
    statusEl.className = '';
    return;
  }

  if (state.allAssigned) {
    statusEl.textContent = t('table.allAssigned');
    statusEl.className = 'status-success';
  } else {
    statusEl.textContent = t('table.itemsRemaining').replace('{n}', state.remainingCount);
    statusEl.className = 'status-warning';
  }
}

/** Snapshot of what the editor currently holds. */
function readEditor(payment = getPayment()) {
  return buildSnapshot(getParticipants(), getParams(), getTableState().items, payment);
}

/**
 * Session subscriber: keep the in-progress split in localStorage, or drop it
 * once the editor is blank. The draft carries the RAW payment strings so the
 * inputs restore exactly.
 */
function persistDraft(state) {
  const snapshot = readEditor(state.payment);
  if (snapshot.participants.length === 0 && snapshot.items.length === 0) {
    clearDraft();
    return;
  }
  saveDraft({
    v: 1,
    snapshot,
    historyId: state.historyId,
    paid: state.paid,
    calculated: state.calc !== null && !state.stale,
  });
}

/** Reopen the draft written by persistDraft. No history write, toast or scroll. */
function restoreDraft() {
  const draft = loadDraft();
  if (!draft || draft.v !== 1 || !validateSnapshot(draft.snapshot)) {
    clearDraft();
    return;
  }
  applySnapshot(draft.snapshot);
  resetSession({
    historyId: draft.historyId && getHistoryEntry(draft.historyId) ? draft.historyId : null,
    paid: draft.paid || {},
    payment: draft.snapshot.payment,
  });
  if (draft.calculated) showCalculated();
}

function whileApplying(write) {
  applying = true;
  try {
    write();
  } finally {
    applying = false;
  }
}

/**
 * The only programmatic editor writer for whole snapshots. Participants go
 * first, because updateParticipants strips assignments of unknown names.
 */
function applySnapshot(snap) {
  whileApplying(() => {
    setParticipants(snap.participants || []);
    tableLoadItems(snap.items || []);
    setParams(snap.params || { totalDiscount: 0, totalShipping: 0 });
  });
}

function onEditorChange() {
  if (applying) return;
  const snapshot = readEditor();
  const { historyId, calc } = getSession();
  // Items emptied out of a split that was saved or calculated: whatever comes
  // next is a different bill and must get its own history entry.
  if (snapshot.items.length === 0 && (historyId || calc)) {
    resetSession();
    return;
  }
  editorChanged(snapshot);
}

/** "Split baru": blank editor and a fresh session. History keeps the old entry. */
function newSplit() {
  const { participants, items } = readEditor();
  const { historyId, calc, stale } = getSession();
  const blank = participants.length === 0 && items.length === 0;
  const unsaved = !historyId || stale || calc === null;
  if (!blank && unsaved && !window.confirm(t('split.newConfirm'))) return;

  applySnapshot({ participants: [], items: [], params: { totalDiscount: 0, totalShipping: 0 } });
  resetSession();
  const ocrResults = document.querySelector('#ocr-results-section');
  if (ocrResults) ocrResults.hidden = true;
  setMode('manual');
}

function handleOCRResult(ocrResult) {
  const ocrResultsSection = document.querySelector('#ocr-results-section');
  const ocrResultsEl = ocrResultsSection.querySelector('.section-content');

  if (ocrResult.error) {
    ocrResultsSection.hidden = false;
    ocrResultsEl.innerHTML = '';
    const errEl = document.createElement('p');
    errEl.className = 'validation-error';
    errEl.textContent = ocrResult.error;
    ocrResultsEl.appendChild(errEl);
    return;
  }

  const parsedData = parseReceipt(ocrResult.text);
  const confidence = scoreConfidence(ocrResult.confidence, parsedData);

  ocrResultsSection.hidden = false;
  // The receipt image is held by this closure until the user confirms and populates the split.
  const receiptBlob = ocrResult.receiptBlob || null;
  renderOCRResults(parsedData, confidence, ocrResultsEl, (confirmedData) => {
    populateFromOCR(confirmedData, receiptBlob);
  });
}

function populateFromOCR(data, receiptBlob = null) {
  // Clear existing items before adding OCR items (prevents duplicates on re-confirm)
  whileApplying(() => {
    tableClearItems();
    tableAddItemsFromOCR(data.items);
    setParams({ totalDiscount: data.discount, totalShipping: data.deliveryFee });
  });

  // A freshly scanned receipt starts a new split, not an edit of a saved one.
  resetSession({ receiptBlob });

  // Switch to manual mode so the user can see participants/params.
  setMode('manual');
}

function handleCalculate() {
  // Clear previous errors
  clearAllErrors();

  const participants = getParticipants();
  const state = getTableState();

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
    showToast(errors[0].message, 'warning');
    return;
  }

  // Compute through the single shared path (same as history and the shared view).
  const snapshot = readEditor();
  const { result, itemsMap } = computeSplit(snapshot);
  if (!result) {
    // Every subtotal is Rp 0 (free items only): nobody pays anything.
    showToast(t('validation.noPayable'), 'warning');
    return;
  }

  // A brand-new split (not yet saved) starts with a clean paid state.
  if (!getSession().historyId) update({ paid: {} });
  setCalculated(snapshot, { result, itemsMap });
  saveParticipants(participants);
  saveToHistory();

  scrollToResults();
}

function scrollToResults() {
  const resultsSection = document.querySelector('#results');
  if (resultsSection) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    resultsSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

/**
 * Auto-save the calculated split. Reusing historyId means a
 * reload-then-recalculate updates the same entry instead of duplicating it.
 */
function saveToHistory() {
  const { calc, historyId, paid, receiptBlob } = getSession();
  const entry = { ...calc.snapshot, paid };
  if (historyId) {
    entry.id = historyId;
  } else {
    entry.label = defaultHistoryLabel();
  }
  const id = saveHistoryEntry(entry);
  if (!id) {
    // Write failed: keep the receipt blob and skip pruning, which would
    // otherwise delete images of entries the failed write did not persist.
    showToast(t('history.saveFailed'), 'error');
    return;
  }
  // Attach the scanned receipt image to this split. Consumed once, so a later
  // recalculation of the same entry keeps the receipt instead of clearing it.
  if (receiptBlob) putReceipt(id, receiptBlob);
  update({ historyId: id, receiptBlob: null });
  pruneReceipts(loadHistory().map((e) => e.id));
  refreshHistory();
}

function defaultHistoryLabel() {
  return new Date().toLocaleString();
}

/**
 * Toggle a participant's paid status, persist it to history, and re-render.
 * @param {string} name
 * @param {boolean} isPaid
 */
function handleTogglePaid(name, isPaid) {
  const next = { ...getSession().paid };
  if (isPaid) {
    next[name] = true;
  } else {
    delete next[name];
  }
  update({ paid: next });
  const { historyId } = getSession();
  if (historyId) {
    saveHistoryEntry({ id: historyId, paid: next });
    refreshHistory();
  }
}

/**
 * Show results for what the editor currently holds, when it is complete.
 * Always computed from the editor (never from a stored entry), so the results
 * match what is on screen. No history write, toast or scroll.
 */
function showCalculated() {
  const { items, allAssigned } = getTableState();
  if (getParticipants().length === 0 || items.length === 0 || !allAssigned) return;
  const snapshot = readEditor();
  const out = computeSplit(snapshot);
  if (out.result) setCalculated(snapshot, out);
}

/**
 * Restore a saved split into the editor and show its result. Read-only: the
 * history entry is not re-saved.
 * @param {object} entry - history entry (snapshot + id/label)
 */
function loadSplit(entry) {
  applySnapshot(entry);
  // Loading a saved split is not a new scan - keep its stored receipt as-is.
  // Its payment shows in the inputs without becoming the saved default (L10);
  // an entry without payment falls back to the saved default.
  resetSession({ historyId: entry.id || null, paid: entry.paid || {}, payment: entry.payment });

  // Switch to manual mode so the editor is visible.
  setMode('manual');

  showCalculated();
  scrollToResults();
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
  // Hide every editor control. Use inline display:none rather than the hidden
  // attribute - .mode-tabs has display:flex, which would override [hidden].
  // #split-workflow and #results stay visible so the result can render.
  [
    '.mode-tabs', '#manual-section', '#ocr-section', '#history',
    '#table-assigner', '#calculate-status', '#calculate', '#new-split',
    '#validation-errors', '#export-section',
  ].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  });

  initLangToggle();

  const resultsEl = document.querySelector('#results .section-content');

  function renderShared() {
    resultsEl.innerHTML = '';

    const resultsContainer = document.createElement('div');
    resultsEl.appendChild(resultsContainer);
    try {
      const { result, itemsMap, payment } = computeSplit(snapshot);
      if (!result) throw new Error('nothing to split');
      renderResults(result, resultsContainer, itemsMap, { payment });
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
