/**
 * Unified table-based assignment component.
 * Each item row has a row of participant chips: tap a chip to give that person
 * one more unit (or one more share of a shared item), tap its − to take one
 * back. "Bagi rata" turns an item into a shared item (see snapshot.js).
 */

import { t } from '../i18n/index.js';
import { formatCurrency } from '../engine/formatter.js';
import { showToast } from './toast.js';
import { aggregateByPerson } from './snapshot.js';
import { attachCurrencyInput, getCurrencyValue, setCurrencyValue } from './currency-input.js';

// Accepts plain digits ("25000") or Rupiah-grouped text ("Rp 25.000", "25.000").
// Anything with decimals or other separators ("15000.75") is rejected.
const RUPIAH_PRICE_PATTERN = /^(?:Rp\s?)?(?:\d+|\d{1,3}(?:\.\d{3})+)$/;
const PLAIN_INTEGER_PATTERN = /^\d+$/;

let containerEl = null;
let items = []; // [{id, name, unitPrice, totalQty, split?, assignments: [{person, qty}]}]
let participants = [];
let onStateChange = null;
let nextId = 1;
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
  editingItemId = null;
  render();
}

/**
 * Get the current state of the table assigner.
 * @returns {object} {items, allAssigned, remainingCount, assignments}
 */
export function getTableState() {
  const assignments = aggregateByPerson(participants, items);

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
  // Drop assignments of removed people so their quantity returns to "remaining".
  items.forEach((item) => {
    item.assignments = item.assignments.filter((a) => participants.includes(a.person));
  });
  render();
  notifyChange();
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
  editingItemId = null;
  items = (itemsArray || []).map((item) => ({
    id: nextId++,
    name: item.name,
    unitPrice: item.unitPrice,
    totalQty: item.totalQty,
    ...(item.split ? { split: true } : {}),
    assignments: (item.assignments || []).map((a) => ({
      person: a.person,
      qty: a.qty,
    })),
  }));
  render();
  notifyChange();
}

function assignedQty(item) {
  return item.assignments.reduce((sum, a) => sum + a.qty, 0);
}

// A shared item is done as soon as anyone shares it.
function getRemainingQty(item) {
  if (item.split) return item.assignments.length > 0 ? 0 : item.totalQty;
  return item.totalQty - assignedQty(item);
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
  // The whole list is rebuilt, so keep focus on the same control (by key).
  const active = document.activeElement;
  const focusKey = active && containerEl.contains(active) ? active.dataset.focusKey : null;
  containerEl.innerHTML = '';
  renderContent();
  if (focusKey) restoreFocus(focusKey);
}

// Keys look like "kind:itemId[:person]". If that control is gone (last unit
// taken back, row completed), fall back to the item's chip, then its toggle.
function restoreFocus(key) {
  const [kind, itemId] = key.split(':');
  const person = key.slice(kind.length + itemId.length + 2);
  const els = [...containerEl.querySelectorAll('[data-focus-key]')];
  const target =
    els.find((el) => el.dataset.focusKey === key) ||
    els.find((el) => el.dataset.focusKey === `add:${itemId}:${person}`) ||
    els.find((el) => el.dataset.focusKey === `split:${itemId}`) ||
    els.find((el) => el.dataset.focusKey === `edit:${itemId}`);
  if (target) target.focus();
}

function renderContent() {
  if (items.length === 0) {
    editingItemId = null;
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
    tdName.textContent = (remaining === 0 ? '\u2713 ' : '') + item.name;
    tr.appendChild(tdName);

    // Remaining
    const tdRemaining = document.createElement('td');
    tdRemaining.dataset.label = t('table.remaining');
    tdRemaining.textContent =
      item.split && item.assignments.length > 0
        ? t('table.sharedBy').replace('{n}', item.assignments.length)
        : remaining + '/' + item.totalQty;
    tr.appendChild(tdRemaining);

    // Unit price
    const tdPrice = document.createElement('td');
    tdPrice.dataset.label = t('table.unitPrice');
    tdPrice.textContent = formatCurrency(item.unitPrice);
    tr.appendChild(tdPrice);

    // Action
    const tdAction = document.createElement('td');
    tdAction.dataset.label = t('table.action');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-edit-item';
    editBtn.textContent = '✎';
    editBtn.title = t('table.edit');
    editBtn.setAttribute('aria-label', t('table.edit'));
    editBtn.dataset.focusKey = `edit:${item.id}`;
    editBtn.addEventListener('click', () => {
      editingItemId = item.id;
      render();
    });
    tdAction.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-delete-item';
    deleteBtn.textContent = '✕';
    deleteBtn.title = t('table.remove');
    deleteBtn.setAttribute('aria-label', t('table.remove'));
    deleteBtn.dataset.focusKey = `del:${item.id}`;
    deleteBtn.addEventListener('click', () => {
      // Focus moves to the next row's delete button (or the previous one).
      const idx = items.indexOf(item);
      const neighbor = items[idx + 1] || items[idx - 1];
      items = items.filter((i) => i.id !== item.id);
      if (editingItemId === item.id) editingItemId = null;
      render();
      notifyChange();
      if (neighbor) restoreFocus(`del:${neighbor.id}`);
    });
    tdAction.appendChild(deleteBtn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);

    tbody.appendChild(createChipRow(item, remaining));
  });

  table.appendChild(tbody);
  containerEl.appendChild(table);
}

function createEditRow(item) {
  const tr = document.createElement('tr');
  tr.className = 'edit-row';
  tr.dataset.itemId = item.id;
  const focusKey = `edit:${item.id}`;

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
  // Every edit-row control shares the edit button's key: opening edit lands on
  // this input (first match), and Save/Cancel land back on the edit button.
  [nameInput].forEach((el) => (el.dataset.focusKey = focusKey));
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
  priceInput.className = 'edit-item-price';
  priceInput.placeholder = t('label.price');
  priceInput.setAttribute('aria-label', t('table.unitPrice'));
  attachCurrencyInput(priceInput);
  setCurrencyValue(priceInput, item.unitPrice);
  // setCurrencyValue renders 0 as blank; show "Rp 0" so a free item stays visible and savable.
  if (!priceInput.value) priceInput.value = formatCurrency(0);
  tdPrice.appendChild(priceInput);
  tr.appendChild(tdPrice);

  // Action
  const tdAction = document.createElement('td');
  tdAction.className = 'td-edit-action';
  tdAction.dataset.label = t('table.action');

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-secondary btn-save-item';
  saveBtn.textContent = t('table.save');
  saveBtn.title = t('table.save');
  saveBtn.setAttribute('aria-label', t('table.save'));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-cancel-item';
  cancelBtn.textContent = t('table.cancel');
  cancelBtn.title = t('table.cancel');
  cancelBtn.setAttribute('aria-label', t('table.cancel'));

  [qtyInput, priceInput, saveBtn, cancelBtn].forEach((el) => (el.dataset.focusKey = focusKey));
  tdAction.appendChild(saveBtn);
  tdAction.appendChild(cancelBtn);
  tr.appendChild(tdAction);

  // Shows an error toast and moves focus to the offending field.
  const rejectField = (input, messageKey) => {
    showToast(t(messageKey), 'error');
    try {
      input.focus();
    } catch {
      // ignore
    }
  };

  const handleSave = () => {
    const trimmedName = nameInput.value.trim();
    if (!trimmedName) {
      rejectField(nameInput, 'table.errorItemName');
      return;
    }

    const rawPrice = priceInput.value.trim();
    if (!RUPIAH_PRICE_PATTERN.test(rawPrice)) {
      rejectField(priceInput, 'table.errorItemPrice');
      return;
    }
    const priceNum = getCurrencyValue(priceInput);

    const rawQty = qtyInput.value.trim();
    if (!PLAIN_INTEGER_PATTERN.test(rawQty) || parseInt(rawQty, 10) < 1) {
      rejectField(qtyInput, 'table.errorItemQty');
      return;
    }
    const qtyNum = parseInt(rawQty, 10);

    if (!item.split && qtyNum < assignedQty(item)) {
      rejectField(qtyInput, 'table.qtyBelowAssigned');
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

function createChipRow(item, remaining) {
  const tr = document.createElement('tr');
  tr.className = 'chip-row';
  const td = document.createElement('td');
  td.colSpan = 4;
  const group = document.createElement('div');
  group.className = 'assign-chips';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', item.name);

  if (participants.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'assign-chips-hint';
    hint.textContent = t('table.addParticipantsHint');
    group.appendChild(hint);
  }

  participants.forEach((person) => {
    const assignment = item.assignments.find((a) => a.person === person);
    const qty = assignment ? assignment.qty : 0;
    // A finished unit item only keeps the chips of people who have some of it.
    if (!item.split && remaining === 0 && qty === 0) return;

    const wrap = document.createElement('span');
    wrap.className = 'assign-chip-group';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'assign-chip';
    chip.dataset.person = person;
    chip.dataset.focusKey = `add:${item.id}:${person}`;
    chip.setAttribute('aria-pressed', String(qty > 0));
    chip.setAttribute('aria-label', t('table.addOne').replace('{name}', person) + (qty > 0 ? ` (${qty})` : ''));
    const canAdd = item.split || remaining > 0;
    // aria-disabled, not disabled: the chip must stay focusable after the last unit.
    if (!canAdd) chip.setAttribute('aria-disabled', 'true');
    const label = document.createElement('span');
    label.className = 'assign-chip-name';
    label.textContent = person;
    chip.appendChild(label);
    if (qty > 0) {
      const count = document.createElement('span');
      count.className = 'assign-chip-count';
      count.textContent = item.split ? `${qty}/${assignedQty(item)}` : '×' + qty;
      chip.appendChild(count);
    }
    chip.addEventListener('click', () => {
      if (!canAdd) return;
      if (assignment) assignment.qty += 1;
      else item.assignments.push({ person, qty: 1 });
      render();
      notifyChange();
    });
    wrap.appendChild(chip);

    if (qty > 0) {
      const dec = document.createElement('button');
      dec.type = 'button';
      dec.className = 'assign-chip-dec';
      dec.dataset.focusKey = `dec:${item.id}:${person}`;
      dec.textContent = '−';
      dec.setAttribute('aria-label', t('table.removeOne').replace('{name}', person));
      dec.addEventListener('click', () => {
        assignment.qty -= 1;
        if (assignment.qty === 0) item.assignments = item.assignments.filter((a) => a !== assignment);
        render();
        notifyChange();
      });
      wrap.appendChild(dec);
    }
    group.appendChild(wrap);
  });

  if (participants.length > 1) {
    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'assign-split-toggle';
    splitBtn.dataset.focusKey = `split:${item.id}`;
    splitBtn.setAttribute('aria-pressed', String(!!item.split));
    splitBtn.textContent = t('table.share');
    splitBtn.addEventListener('click', () => {
      if (item.split) {
        // Back to units: weights that still fit are kept as units.
        delete item.split;
        if (assignedQty(item) > item.totalQty) item.assignments = [];
      } else {
        // Units become weights; only a fully assigned item keeps the same money.
        if (assignedQty(item) < item.totalQty) item.assignments = [];
        item.split = true;
      }
      render();
      notifyChange();
    });
    group.appendChild(splitBtn);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'assign-everyone';
    allBtn.dataset.focusKey = `all:${item.id}`;
    allBtn.textContent = t('table.everyone');
    allBtn.addEventListener('click', () => {
      item.split = true;
      item.assignments = participants.map((person) => ({ person, qty: 1 }));
      render();
      notifyChange();
    });
    group.appendChild(allBtn);
  }

  td.appendChild(group);
  tr.appendChild(td);
  return tr;
}

function renderAssignedSection() {
  // Only people who actually have assigned items get a card.
  const personData = Object.fromEntries(
    Object.entries(aggregateByPerson(participants, items)).filter(([, d]) => d.items.length > 0),
  );

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
      desc.textContent = assignedItem.share
        ? assignedItem.name + ' = ' + formatCurrency(assignedItem.price)
        : assignedItem.qty + 'x ' + assignedItem.name + ' @ ' + formatCurrency(assignedItem.unitPrice) + ' = ' + formatCurrency(assignedItem.price);
      line.appendChild(desc);

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn undo-btn';
      undoBtn.dataset.focusKey = `undo:${assignedItem.itemId}:${person}`;
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
