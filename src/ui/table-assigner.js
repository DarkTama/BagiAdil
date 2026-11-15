/**
 * Unified table-based assignment component.
 * Replaces both items.js assignment and assigner.js drag-and-drop.
 */

import { t } from '../i18n/index.js';
import { formatCurrency } from '../engine/formatter.js';
import { showToast } from './toast.js';

let containerEl = null;
let items = []; // [{id, name, unitPrice, totalQty, assignments: [{person, qty}]}]
let participants = [];
let onStateChange = null;
let nextId = 1;
let activePopupItemId = null;
let editingItemId = null;

/**
 * Initialize the table assigner component.
 * @param {HTMLElement} el - Container element
 * @param {object} options
 * @param {string[]} options.participants - Participant names
 * @param {function} options.onStateChange - Callback with state changes
 */
export function initTableAssigner(el, options) {
  containerEl = el;
  participants = options.participants || [];
  onStateChange = options.onStateChange || null;
  items = [];
  nextId = 1;
  activePopupItemId = null;
  editingItemId = null;
  render();
}

/**
 * Get the current state of the table assigner.
 * @returns {object} {items, allAssigned, remainingCount, assignments}
 */
export function getTableState() {
  const assignments = {};
  participants.forEach((p) => {
    assignments[p] = { items: [], subtotal: 0 };
  });

  items.forEach((item) => {
    item.assignments.forEach((a) => {
      if (!assignments[a.person]) {
        assignments[a.person] = { items: [], subtotal: 0 };
      }
      assignments[a.person].items.push({
        name: item.name,
        qty: a.qty,
        unitPrice: item.unitPrice,
      });
      assignments[a.person].subtotal += a.qty * item.unitPrice;
    });
  });

  const remainingCount = items.filter((item) => getRemainingQty(item) > 0).length;

  return {
    items,
    allAssigned: items.length > 0 && remainingCount === 0,
    remainingCount,
    assignments,
  };
}

/**
 * Add items to the table.
 * @param {Array<{name: string, unitPrice: number, qty: number}>} itemsArray
 */
export function addItems(itemsArray) {
  itemsArray.forEach((item) => {
    items.push({
      id: nextId++,
      name: item.name,
      unitPrice: item.unitPrice,
      totalQty: item.qty,
      assignments: [],
    });
  });
  render();
  notifyChange();
}

/**
 * Add items from OCR format.
 * @param {Array<{name: string, quantity: number, price: number, total: number}>} ocrItems
 */
export function addItemsFromOCR(ocrItems) {
  ocrItems.forEach((item) => {
    const qty = item.quantity || 1;
    const unitPrice = Math.round(item.total / qty);
    items.push({
      id: nextId++,
      name: item.name,
      unitPrice,
      totalQty: qty,
      assignments: [],
    });
  });
  render();
  notifyChange();
}

/**
 * Update the participant dropdown options.
 * @param {string[]} newParticipants
 */
export function updateParticipants(newParticipants) {
  participants = [...newParticipants];
  render();
}

/**
 * Re-render translated labels without losing state.
 */
export function updateTranslations() {
  render();
}

/**
 * Reset to empty state.
 */
export function clearItems() {
  items = [];
  nextId = 1;
  activePopupItemId = null;
  editingItemId = null;
  render();
  notifyChange();
}

/**
 * Replace all items with a saved set (including their assignments).
 * Used when loading a split from history.
 * @param {Array<{name: string, unitPrice: number, totalQty: number, assignments: Array<{person: string, qty: number}>}>} itemsArray
 */
export function loadItems(itemsArray) {
  nextId = 1;
  activePopupItemId = null;
  editingItemId = null;
  items = (itemsArray || []).map((item) => ({
    id: nextId++,
    name: item.name,
    unitPrice: item.unitPrice,
    totalQty: item.totalQty,
    assignments: (item.assignments || []).map((a) => ({
      person: a.person,
      qty: a.qty,
    })),
  }));
  render();
  notifyChange();
}

function getRemainingQty(item) {
  const assigned = item.assignments.reduce((sum, a) => sum + a.qty, 0);
  return item.totalQty - assigned;
}

function notifyChange() {
  if (!onStateChange) return;
  const state = getTableState();
  onStateChange({
    allAssigned: state.allAssigned,
    remainingCount: state.remainingCount,
    itemCount: state.items.length,
    assignments: state.assignments,
  });
}

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (items.length === 0) {
    editingItemId = null;
    activePopupItemId = null;
    const hint = document.createElement('p');
    hint.className = 'table-hint';
    hint.textContent = t('table.addItemsHint');
    containerEl.appendChild(hint);
    return;
  }

  // Unassigned items table
  renderUnassignedTable();

  // Assigned items section
  renderAssignedSection();
}

function renderUnassignedTable() {
  const remainingCount = items.filter((item) => getRemainingQty(item) > 0).length;

  const header = document.createElement('h3');
  header.className = 'table-section-title';
  header.textContent = t('table.unassignedTitle') + ' (' + t('table.itemCount').replace('{n}', remainingCount) + ')';
  containerEl.appendChild(header);

  const table = document.createElement('table');
  table.className = 'assignment-table';

  // Thead
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const cols = [t('label.item'), t('table.remaining'), t('table.unitPrice'), t('table.action')];
  cols.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Tbody
  const tbody = document.createElement('tbody');
  items.forEach((item) => {
    if (editingItemId === item.id) {
      tbody.appendChild(createEditRow(item));
      return;
    }

    const remaining = getRemainingQty(item);
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;

    if (remaining === 0) {
      tr.classList.add('row-completed');
    }

    // Item name
    const tdName = document.createElement('td');
    tdName.className = 'td-item-name';
    tdName.dataset.label = t('label.item');
    tdName.textContent = item.name;
    if (remaining === 0) {
      tdName.innerHTML = '\u2713 ' + item.name;
    }
    tr.appendChild(tdName);

    // Remaining
    const tdRemaining = document.createElement('td');
    tdRemaining.dataset.label = t('table.remaining');
    tdRemaining.textContent = remaining + '/' + item.totalQty;
    tr.appendChild(tdRemaining);

    // Unit price
    const tdPrice = document.createElement('td');
    tdPrice.dataset.label = t('table.unitPrice');
    tdPrice.textContent = formatCurrency(item.unitPrice);
    tr.appendChild(tdPrice);

    // Action
    const tdAction = document.createElement('td');
    tdAction.dataset.label = t('table.action');
    if (remaining > 0) {
      const assignBtn = document.createElement('button');
      assignBtn.type = 'button';
      assignBtn.className = 'btn btn-assign';
      assignBtn.textContent = '+ ' + t('table.assign');
      assignBtn.addEventListener('click', () => {
        activePopupItemId = item.id;
        editingItemId = null;
        render();
      });
      tdAction.appendChild(assignBtn);
    }
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-edit-item';
    editBtn.textContent = '✎';
    editBtn.title = t('table.edit');
    editBtn.setAttribute('aria-label', t('table.edit'));
    editBtn.addEventListener('click', () => {
      editingItemId = item.id;
      activePopupItemId = null;
      render();
    });
    tdAction.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-delete-item';
    deleteBtn.textContent = '✕';
    deleteBtn.title = t('table.remove');
    deleteBtn.setAttribute('aria-label', t('table.remove'));
    deleteBtn.addEventListener('click', () => {
      items = items.filter((i) => i.id !== item.id);
      if (activePopupItemId === item.id) activePopupItemId = null;
      if (editingItemId === item.id) editingItemId = null;
      render();
      notifyChange();
    });
    tdAction.appendChild(deleteBtn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);

    // Inline popup if active
    if (activePopupItemId === item.id && remaining > 0) {
      const popupRow = document.createElement('tr');
      popupRow.className = 'popup-row';
      const popupTd = document.createElement('td');
      popupTd.colSpan = 4;
      popupTd.appendChild(createAssignPopup(item, remaining));
      popupRow.appendChild(popupTd);
      tbody.appendChild(popupRow);
    }
  });

  table.appendChild(tbody);
  containerEl.appendChild(table);
}

function createEditRow(item) {
  const tr = document.createElement('tr');
  tr.className = 'edit-row';
  tr.dataset.itemId = item.id;

  // Item name
  const tdName = document.createElement('td');
  tdName.className = 'td-item-name td-edit-name';
  tdName.dataset.label = t('label.item');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'edit-item-name';
  nameInput.value = item.name;
  nameInput.placeholder = t('placeholder.itemName');
  nameInput.setAttribute('aria-label', t('label.item'));
  tdName.appendChild(nameInput);
  tr.appendChild(tdName);

  // Qty
  const tdQty = document.createElement('td');
  tdQty.className = 'td-edit-qty';
  tdQty.dataset.label = t('table.qty');
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'edit-item-qty';
  qtyInput.value = String(item.totalQty);
  qtyInput.min = '1';
  qtyInput.step = '1';
  qtyInput.placeholder = t('table.qty');
  qtyInput.setAttribute('aria-label', t('table.qty'));
  tdQty.appendChild(qtyInput);
  tr.appendChild(tdQty);

  // Unit price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'td-edit-price';
  tdPrice.dataset.label = t('table.unitPrice');
  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.className = 'edit-item-price';
  priceInput.value = String(item.unitPrice);
  priceInput.min = '0';
  priceInput.step = '1';
  priceInput.placeholder = t('label.price');
  priceInput.setAttribute('aria-label', t('table.unitPrice'));
  tdPrice.appendChild(priceInput);
  tr.appendChild(tdPrice);

  // Action
  const tdAction = document.createElement('td');
  tdAction.className = 'td-edit-action';
  tdAction.dataset.label = t('table.action');

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-save-item';
  saveBtn.textContent = t('table.save');
  saveBtn.title = t('table.save');
  saveBtn.setAttribute('aria-label', t('table.save'));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-cancel-item';
  cancelBtn.textContent = t('table.cancel');
  cancelBtn.title = t('table.cancel');
  cancelBtn.setAttribute('aria-label', t('table.cancel'));

  tdAction.appendChild(saveBtn);
  tdAction.appendChild(cancelBtn);
  tr.appendChild(tdAction);

  const handleSave = () => {
    const rawName = nameInput.value;
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      showToast(t('table.errorItemName'), 'error');
      try {
        nameInput.focus();
      } catch {
        // ignore
      }
      return;
    }

    const rawPrice = priceInput.value.trim();
    if (rawPrice === '' || !/^\d+$/.test(rawPrice)) {
      showToast(t('table.errorItemPrice'), 'error');
      try {
        priceInput.focus();
      } catch {
        // ignore
      }
      return;
    }
    const priceNum = parseInt(rawPrice, 10);
    if (priceNum < 0) {
      showToast(t('table.errorItemPrice'), 'error');
      try {
        priceInput.focus();
      } catch {
        // ignore
      }
      return;
    }

    const rawQty = qtyInput.value.trim();
    if (rawQty === '' || !/^\d+$/.test(rawQty)) {
      showToast(t('table.errorItemQty'), 'error');
      try {
        qtyInput.focus();
      } catch {
        // ignore
      }
      return;
    }
    const qtyNum = parseInt(rawQty, 10);
    if (qtyNum < 1) {
      showToast(t('table.errorItemQty'), 'error');
      try {
        qtyInput.focus();
      } catch {
        // ignore
      }
      return;
    }

    const assignedQty = (item.assignments || []).reduce((sum, a) => sum + a.qty, 0);
    if (qtyNum < assignedQty) {
      showToast(t('table.qtyBelowAssigned'), 'error');
      try {
        qtyInput.focus();
      } catch {
        // ignore
      }
      return;
    }

    item.name = trimmedName;
    item.unitPrice = priceNum;
    item.totalQty = qtyNum;
    editingItemId = null;

    render();
    notifyChange();
  };

  const handleCancel = () => {
    editingItemId = null;
    render();
  };

  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', handleCancel);

  tr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  });

  return tr;
}

function createAssignPopup(item, maxQty) {
  const popup = document.createElement('div');
  popup.className = 'assign-popup';

  // Person dropdown
  const select = document.createElement('select');
  select.className = 'popup-person-select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = t('table.assignTo');
  select.appendChild(defaultOpt);
  participants.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  popup.appendChild(select);

  // Qty input
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'popup-qty-input';
  qtyInput.min = '1';
  qtyInput.max = String(maxQty);
  qtyInput.value = String(maxQty);
  qtyInput.placeholder = t('table.qty');
  popup.appendChild(qtyInput);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-popup-cancel';
  cancelBtn.textContent = t('table.cancel');
  cancelBtn.addEventListener('click', () => {
    activePopupItemId = null;
    render();
  });
  popup.appendChild(cancelBtn);

  // Confirm button
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary btn-popup-confirm';
  confirmBtn.textContent = t('table.assign');
  confirmBtn.addEventListener('click', () => {
    const person = select.value;
    const qty = Math.min(Math.max(1, parseInt(qtyInput.value, 10) || 1), maxQty);
    if (!person) return;

    // Add assignment
    const existing = item.assignments.find((a) => a.person === person);
    if (existing) {
      existing.qty += qty;
    } else {
      item.assignments.push({ person, qty });
    }

    activePopupItemId = null;
    render();
    notifyChange();
  });
  popup.appendChild(confirmBtn);

  return popup;
}

function renderAssignedSection() {
  // Build per-person assignment data
  const personData = {};
  items.forEach((item) => {
    item.assignments.forEach((a) => {
      if (!personData[a.person]) {
        personData[a.person] = { items: [], subtotal: 0 };
      }
      personData[a.person].items.push({
        itemId: item.id,
        name: item.name,
        qty: a.qty,
        unitPrice: item.unitPrice,
        total: a.qty * item.unitPrice,
      });
      personData[a.person].subtotal += a.qty * item.unitPrice;
    });
  });

  const hasAssignments = Object.keys(personData).length > 0;
  if (!hasAssignments) return;

  const section = document.createElement('div');
  section.className = 'assigned-section';

  const title = document.createElement('h3');
  title.className = 'table-section-title';
  title.textContent = t('table.assignedTitle');
  section.appendChild(title);

  Object.entries(personData).forEach(([person, data]) => {
    const card = document.createElement('div');
    card.className = 'assigned-person-card';

    const nameEl = document.createElement('h4');
    nameEl.textContent = person;
    card.appendChild(nameEl);

    data.items.forEach((assignedItem) => {
      const line = document.createElement('div');
      line.className = 'assigned-item-line';

      const desc = document.createElement('span');
      desc.textContent = assignedItem.qty + 'x ' + assignedItem.name + ' @ ' + formatCurrency(assignedItem.unitPrice) + ' = ' + formatCurrency(assignedItem.total);
      line.appendChild(desc);

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn undo-btn';
      undoBtn.textContent = t('table.undo');
      undoBtn.addEventListener('click', () => {
        // Find the item and remove this assignment
        const item = items.find((i) => i.id === assignedItem.itemId);
        if (item) {
          const idx = item.assignments.findIndex((a) => a.person === person);
          if (idx !== -1) {
            item.assignments.splice(idx, 1);
          }
        }
        render();
        notifyChange();
      });
      line.appendChild(undoBtn);

      card.appendChild(line);
    });

    // Subtotal
    const subtotalEl = document.createElement('div');
    subtotalEl.className = 'person-subtotal';
    subtotalEl.textContent = t('table.subtotal') + ': ' + formatCurrency(data.subtotal);
    card.appendChild(subtotalEl);

    section.appendChild(card);
  });

  containerEl.appendChild(section);
}
