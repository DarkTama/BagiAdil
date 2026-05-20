/**
 * Unified assignment table component.
 * Manages unassigned items table, assign popup, and assigned items grouped by person.
 */

import { t } from '../i18n/index.js';
import { formatCurrency } from '../engine/formatter.js';

let containerEl = null;
let unassignedItems = []; // [{name, unitPrice, remainingQty, originalQty}]
let assignments = {}; // {personName: [{name, unitPrice, qty}]}
let participants = [];
let onAssignmentChangeCallback = null;
let openPopupIndex = null; // index of item with open popup

/**
 * Initialize the assignment table component.
 * @param {HTMLElement} el - Container element
 * @param {object} options
 * @param {string[]} options.participants - Participant names
 * @param {function} options.onAssignmentChange - Callback when assignments change
 */
export function initAssignmentTable(el, options = {}) {
  containerEl = el;
  participants = options.participants || [];
  onAssignmentChangeCallback = options.onAssignmentChange || null;
  unassignedItems = [];
  assignments = {};
  openPopupIndex = null;
  render();
}

/**
 * Add a single item to the unassigned list.
 * @param {{name: string, unitPrice: number, qty: number}} item
 */
export function addItem(item) {
  unassignedItems.push({
    name: item.name,
    unitPrice: item.unitPrice,
    remainingQty: item.qty,
    originalQty: item.qty,
  });
  openPopupIndex = null;
  render();
  notifyChange();
}

/**
 * Replace all items (for OCR). Resets assignments.
 * @param {Array<{name: string, unitPrice: number, qty: number}>} items
 */
export function setItems(items) {
  unassignedItems = items.map((item) => ({
    name: item.name,
    unitPrice: item.unitPrice,
    remainingQty: item.qty,
    originalQty: item.qty,
  }));
  assignments = {};
  openPopupIndex = null;
  render();
  notifyChange();
}

/**
 * Update participant list. Removes assignments for removed participants.
 * @param {string[]} newParticipants
 */
export function updateParticipants(newParticipants) {
  const removed = participants.filter((p) => !newParticipants.includes(p));
  participants = [...newParticipants];

  // Return items from removed participants back to unassigned
  removed.forEach((name) => {
    if (assignments[name]) {
      assignments[name].forEach((entry) => {
        // Find matching unassigned item and restore qty
        const item = unassignedItems.find(
          (u) => u.name === entry.name && u.unitPrice === entry.unitPrice
        );
        if (item) {
          item.remainingQty += entry.qty;
        }
      });
      delete assignments[name];
    }
  });

  render();
  notifyChange();
}

/**
 * Get the current assignment state.
 * @returns {{allAssigned: boolean, totalRemaining: number, assignments: object}}
 */
export function getAssignmentState() {
  const totalRemaining = unassignedItems.reduce((sum, item) => sum + item.remainingQty, 0);
  return {
    allAssigned: unassignedItems.length > 0 && totalRemaining === 0,
    totalRemaining,
    assignments: buildAssignmentOutput(),
  };
}

/**
 * Update translations without resetting state.
 */
export function updateTranslations() {
  if (!containerEl) return;
  render();
}

function buildAssignmentOutput() {
  const result = {};
  Object.entries(assignments).forEach(([personName, items]) => {
    const expandedItems = [];
    let subtotal = 0;
    items.forEach((entry) => {
      for (let i = 0; i < entry.qty; i++) {
        expandedItems.push({ name: entry.name, price: entry.unitPrice });
      }
      subtotal += entry.unitPrice * entry.qty;
    });
    result[personName] = { items: expandedItems, subtotal };
  });
  return result;
}

function notifyChange() {
  if (onAssignmentChangeCallback) {
    onAssignmentChangeCallback(buildAssignmentOutput());
  }
}

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  // Unassigned items table
  renderUnassignedTable();

  // Assigned items section
  renderAssignedSection();
}

function renderUnassignedTable() {
  const remainingCount = unassignedItems.filter((item) => item.remainingQty > 0).length;

  const headerEl = document.createElement('h3');
  headerEl.className = 'unassigned-header';
  const countText = t('table.itemCount').replace('{n}', String(remainingCount));
  headerEl.textContent = `${t('table.unassignedTitle')} (${countText})`;
  containerEl.appendChild(headerEl);

  if (unassignedItems.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-message';
    emptyMsg.textContent = t('table.allAssigned');
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontStyle = 'italic';
    containerEl.appendChild(emptyMsg);
    return;
  }

  const table = document.createElement('table');
  table.className = 'assignment-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [
    t('label.item'),
    t('table.remaining'),
    t('table.unitPrice'),
    t('table.action'),
  ];
  headers.forEach((text) => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  unassignedItems.forEach((item, index) => {
    const row = document.createElement('tr');
    if (item.remainingQty === 0) {
      row.className = 'row-completed';
    }

    // Item name
    const nameCell = document.createElement('td');
    nameCell.className = 'item-name-cell';
    if (item.remainingQty === 0) {
      const checkmark = document.createElement('span');
      checkmark.className = 'checkmark';
      checkmark.textContent = '\u2713';
      nameCell.appendChild(checkmark);
    }
    const nameText = document.createTextNode(item.name);
    nameCell.appendChild(nameText);
    row.appendChild(nameCell);

    // Remaining qty
    const qtyCell = document.createElement('td');
    qtyCell.textContent = `${item.remainingQty}/${item.originalQty}`;
    row.appendChild(qtyCell);

    // Unit price
    const priceCell = document.createElement('td');
    priceCell.textContent = formatCurrency(item.unitPrice);
    row.appendChild(priceCell);

    // Action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'action-cell';

    if (openPopupIndex === index && item.remainingQty > 0) {
      // Render inline assign popup
      renderAssignPopup(actionCell, item, index);
    } else {
      // Render assign button
      const assignBtn = document.createElement('button');
      assignBtn.type = 'button';
      assignBtn.className = 'btn btn-assign';
      assignBtn.textContent = `+ ${t('table.assign')}`;
      assignBtn.disabled = item.remainingQty === 0;
      assignBtn.addEventListener('click', () => {
        openPopupIndex = index;
        render();
      });
      actionCell.appendChild(assignBtn);
    }
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  containerEl.appendChild(table);
}

function renderAssignPopup(cell, item, index) {
  const popup = document.createElement('div');
  popup.className = 'assign-popup';

  // Person select
  const select = document.createElement('select');
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
  qtyInput.min = '1';
  qtyInput.max = String(item.remainingQty);
  qtyInput.value = '1';
  qtyInput.className = 'qty-input';
  popup.appendChild(qtyInput);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-cancel';
  cancelBtn.textContent = t('table.cancel');
  cancelBtn.addEventListener('click', () => {
    openPopupIndex = null;
    render();
  });
  popup.appendChild(cancelBtn);

  // Assign button
  const assignBtn = document.createElement('button');
  assignBtn.type = 'button';
  assignBtn.className = 'btn btn-primary btn-confirm-assign';
  assignBtn.textContent = t('table.assign');
  assignBtn.addEventListener('click', () => {
    const person = select.value;
    const qty = Math.min(Math.max(1, parseInt(qtyInput.value, 10) || 1), item.remainingQty);

    if (!person) return;

    // Decrease remaining qty
    item.remainingQty -= qty;

    // Add to assignments
    if (!assignments[person]) {
      assignments[person] = [];
    }

    // Check if same item already assigned to this person
    const existing = assignments[person].find(
      (a) => a.name === item.name && a.unitPrice === item.unitPrice
    );
    if (existing) {
      existing.qty += qty;
    } else {
      assignments[person].push({ name: item.name, unitPrice: item.unitPrice, qty });
    }

    openPopupIndex = null;
    render();
    notifyChange();
  });
  popup.appendChild(assignBtn);

  // Focus the select when popup opens
  setTimeout(() => select.focus(), 0);

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      openPopupIndex = null;
      render();
    }
  };
  popup.addEventListener('keydown', handleEscape);

  cell.appendChild(popup);
}

function renderAssignedSection() {
  const personNames = Object.keys(assignments).filter(
    (name) => assignments[name] && assignments[name].length > 0
  );

  if (personNames.length === 0) return;

  const section = document.createElement('div');
  section.className = 'assigned-section';

  const sectionHeader = document.createElement('h3');
  sectionHeader.textContent = t('table.assignedTitle');
  section.appendChild(sectionHeader);

  personNames.forEach((personName) => {
    const items = assignments[personName];
    if (!items || items.length === 0) return;

    const card = document.createElement('div');
    card.className = 'assigned-person-card';

    const nameEl = document.createElement('h4');
    nameEl.textContent = personName;
    card.appendChild(nameEl);

    let personSubtotal = 0;

    items.forEach((entry, entryIndex) => {
      const lineTotal = entry.unitPrice * entry.qty;
      personSubtotal += lineTotal;

      const line = document.createElement('div');
      line.className = 'assigned-item-line';

      const textSpan = document.createElement('span');
      textSpan.textContent = `${entry.qty}x ${entry.name} @ ${formatCurrency(entry.unitPrice)} = ${formatCurrency(lineTotal)}`;
      line.appendChild(textSpan);

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn btn-undo';
      undoBtn.textContent = t('table.undo');
      undoBtn.addEventListener('click', () => {
        // Return qty to unassigned
        const unassignedItem = unassignedItems.find(
          (u) => u.name === entry.name && u.unitPrice === entry.unitPrice
        );
        if (unassignedItem) {
          unassignedItem.remainingQty += entry.qty;
        }

        // Remove from assignments
        assignments[personName].splice(entryIndex, 1);
        if (assignments[personName].length === 0) {
          delete assignments[personName];
        }

        render();
        notifyChange();
      });
      line.appendChild(undoBtn);

      card.appendChild(line);
    });

    // Subtotal
    const subtotalEl = document.createElement('div');
    subtotalEl.className = 'assigned-person-subtotal';
    subtotalEl.textContent = `${t('table.subtotal')}: ${formatCurrency(personSubtotal)}`;
    card.appendChild(subtotalEl);

    section.appendChild(card);
  });

  containerEl.appendChild(section);
}
