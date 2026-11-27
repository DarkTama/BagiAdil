// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initTableAssigner,
  getTableState,
  addItems,
  addItemsFromOCR,
  updateParticipants,
  clearItems,
  loadItems,
} from '../../src/ui/table-assigner.js';
import {
  buildSnapshot,
  encodeSnapshot,
  decodeSnapshot,
} from '../../src/ui/snapshot.js';

describe('Table Assigner UI', () => {
  let containerEl;
  let stateChanges;
  const sampleParticipants = ['Alice', 'Bob'];

  beforeEach(() => {
    document.body.innerHTML = '<div id="table-container"></div>';
    containerEl = document.getElementById('table-container');
    stateChanges = [];
  });

  // Tap a person's chip on an item row, `times` times.
  function tap(person, times = 1, itemIdx = 0) {
    for (let i = 0; i < times; i++) chip(person, itemIdx).click();
  }

  function chip(person, itemIdx = 0) {
    const row = containerEl.querySelectorAll('tr.chip-row')[itemIdx];
    return [...row.querySelectorAll('.assign-chip')].find((c) => c.dataset.person === person);
  }

  function setup(participants = sampleParticipants) {
    initTableAssigner(containerEl, {
      participants,
      onStateChange: (state) => stateChanges.push(state),
    });
  }

  describe('initTableAssigner', () => {
    it('should render empty state with hint message', () => {
      setup();
      const hint = containerEl.querySelector('.table-hint');
      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain('item');
    });
  });

  describe('addItems', () => {
    it('should add rows to the unassigned table', () => {
      setup();
      addItems([
        { name: 'Nasi Goreng', unitPrice: 25000, qty: 2 },
        { name: 'Es Teh', unitPrice: 5000, qty: 1 },
      ]);

      const table = containerEl.querySelector('.assignment-table');
      expect(table).not.toBeNull();

      const rows = containerEl.querySelectorAll('.assignment-table tbody tr[data-item-id]');
      expect(rows.length).toBe(2);
    });

    it('should display item name, remaining qty, and unit price', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 3 }]);

      const row = containerEl.querySelector('.assignment-table tbody tr');
      expect(row.textContent).toContain('Nasi Goreng');
      expect(row.textContent).toContain('3/3');
      expect(row.textContent).toContain('25.000');
    });
  });

  describe('delete item', () => {
    it('should remove only the deleted row', () => {
      setup();
      addItems([
        { name: 'Wrong Item', unitPrice: 2000, qty: 1 },
        { name: 'Nasi Goreng', unitPrice: 25000, qty: 2 },
      ]);

      containerEl.querySelector('.btn-delete-item').click();

      const state = getTableState();
      expect(state.items.length).toBe(1);
      expect(state.items[0].name).toBe('Nasi Goreng');
    });

    it('should drop assignments along with the deleted item', () => {
      setup();
      addItems([{ name: 'Wrong Item', unitPrice: 2000, qty: 1 }]);

      // Assign it to Alice first
      tap('Alice');

      containerEl.querySelector('.btn-delete-item').click();

      const state = getTableState();
      expect(state.items.length).toBe(0);
      expect(state.assignments['Alice'].items.length).toBe(0);
    });
  });

  describe('assignment chips', () => {
    it('shows one chip per participant under each item, no select', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      const chips = [...containerEl.querySelectorAll('tr.chip-row .assign-chip')];
      expect(chips.map((c) => c.dataset.person)).toEqual(['Alice', 'Bob']);
      expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
      expect(containerEl.querySelector('select')).toBeNull();
    });

    it('adds one unit per tap and reports state', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 3 }]);
      tap('Alice', 2);

      const row = containerEl.querySelector('.assignment-table tbody tr[data-item-id]');
      expect(row.textContent).toContain('1/3');
      expect(chip('Alice').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Alice').textContent).toContain('2');

      const lastChange = stateChanges[stateChanges.length - 1];
      expect(lastChange.allAssigned).toBe(false);
      expect(lastChange.remainingCount).toBe(1);
      expect(lastChange.assignments['Alice'].items[0].name).toBe('Nasi Goreng');
      expect(lastChange.assignments['Alice'].items[0].qty).toBe(2);
      expect(lastChange.assignments['Alice'].subtotal).toBe(50000);
    });

    it('does not over-assign, and a finished row keeps only the assigned chips', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 }]);
      tap('Alice');

      const row = containerEl.querySelector('.assignment-table tbody tr[data-item-id]');
      expect(row.classList.contains('row-completed')).toBe(true);
      expect(chip('Bob', 0)).toBeUndefined();
      expect(chip('Alice').getAttribute('aria-disabled')).toBe('true');
      tap('Alice');
      expect(getTableState().items[0].assignments).toEqual([{ person: 'Alice', qty: 1 }]);
    });

    it('takes back one unit with the minus button', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      tap('Alice', 2);
      containerEl.querySelector('.assign-chip-dec').click();
      expect(getTableState().items[0].assignments).toEqual([{ person: 'Alice', qty: 1 }]);
      containerEl.querySelector('.assign-chip-dec').click();
      expect(getTableState().items[0].assignments).toEqual([]);
      expect(containerEl.querySelector('.assign-chip-dec')).toBeNull();
    });

    it('keeps focus on the tapped control across re-renders', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      chip('Alice').focus();
      chip('Alice').click();
      expect(document.activeElement).toBe(chip('Alice'));

      const dec = containerEl.querySelector('.assign-chip-dec');
      dec.focus();
      dec.click();
      // The minus button is gone, focus falls back to the same person's chip.
      expect(document.activeElement).toBe(chip('Alice'));
    });
  });

  describe('shared items', () => {
    it('splits a shared item evenly in whole rupiah', () => {
      setup(['Alice', 'Bob', 'Cici']);
      addItems([{ name: 'Pizza', unitPrice: 10000, qty: 1 }]);
      containerEl.querySelector('.assign-everyone').click();

      const state = getTableState();
      expect(state.allAssigned).toBe(true);
      expect(state.items[0].split).toBe(true);
      const subs = ['Alice', 'Bob', 'Cici'].map((p) => state.assignments[p].subtotal);
      expect(subs).toEqual([3334, 3333, 3333]);
      expect(state.assignments['Alice'].items[0].name).toBe('Pizza (1/3)');
      expect(containerEl.querySelector('tbody tr[data-item-id]').textContent).toContain('3');
    });

    it('share toggle turns taps into share weights', () => {
      setup();
      addItems([{ name: 'Pitcher', unitPrice: 30000, qty: 1 }]);
      containerEl.querySelector('.assign-split-toggle').click();
      expect(getTableState().allAssigned).toBe(false); // nobody shares it yet
      tap('Alice', 2);
      tap('Bob');
      const state = getTableState();
      expect(state.assignments['Alice'].subtotal).toBe(20000);
      expect(state.assignments['Bob'].subtotal).toBe(10000);
    });

    it('a sole sharer pays the whole item as a normal line', () => {
      setup();
      addItems([{ name: 'Es Teh', unitPrice: 5000, qty: 3 }]);
      containerEl.querySelector('.assign-split-toggle').click();
      tap('Alice');
      const line = getTableState().assignments['Alice'].items[0];
      expect(line).toMatchObject({ name: 'Es Teh', qty: 3, price: 15000 });
    });

    it('toggling share off keeps weights that fit as units, clears the rest', () => {
      setup();
      addItems([{ name: 'Es Teh', unitPrice: 5000, qty: 2 }]);
      containerEl.querySelector('.assign-everyone').click();
      containerEl.querySelector('.assign-split-toggle').click();
      expect(getTableState().items[0].assignments).toHaveLength(2);
      expect(getTableState().items[0].split).toBeUndefined();

      containerEl.querySelector('.assign-split-toggle').click();
      tap('Alice', 2);
      containerEl.querySelector('.assign-split-toggle').click();
      expect(getTableState().items[0].assignments).toEqual([]);
    });

    it('removing a sharer redistributes the cost', () => {
      setup(['Alice', 'Bob', 'Cici']);
      addItems([{ name: 'Pizza', unitPrice: 9000, qty: 1 }]);
      containerEl.querySelector('.assign-everyone').click();
      updateParticipants(['Alice', 'Bob']);
      const state = getTableState();
      expect(state.assignments['Alice'].subtotal).toBe(4500);
      expect(state.assignments['Bob'].subtotal).toBe(4500);
      expect(state.assignments['Cici']).toBeUndefined();
    });

    it('allows lowering qty of a shared item below its share count', () => {
      setup(['Alice', 'Bob', 'Cici']);
      addItems([{ name: 'Pizza', unitPrice: 9000, qty: 2 }]);
      containerEl.querySelector('.assign-everyone').click();
      containerEl.querySelector('.btn-edit-item').click();
      containerEl.querySelector('.edit-item-qty').value = '1';
      containerEl.querySelector('.btn-save-item').click();
      expect(getTableState().items[0].totalQty).toBe(1);
      expect(getTableState().assignments['Alice'].subtotal).toBe(3000);
    });

    it('round-trips through snapshot encode/decode and loadItems', () => {
      setup(['Alice', 'Bob', 'Cici']);
      addItems([{ name: 'Pizza', unitPrice: 10000, qty: 1 }]);
      containerEl.querySelector('.assign-everyone').click();
      const snap = buildSnapshot(['Alice', 'Bob', 'Cici'], { totalDiscount: 0, totalShipping: 0 }, getTableState().items);
      const decoded = decodeSnapshot(encodeSnapshot(snap));
      expect(decoded.items[0].split).toBe(true);
      loadItems(decoded.items);
      expect(getTableState().items[0].split).toBe(true);
      expect(getTableState().assignments['Alice'].subtotal).toBe(3334);
    });
  });

  describe('undo', () => {
    it('should return qty to unassigned on undo', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      tap('Alice', 2);
      expect(containerEl.querySelector('.row-completed')).not.toBeNull();

      const undoBtn = containerEl.querySelector('.undo-btn');
      expect(undoBtn).not.toBeNull();
      undoBtn.click();

      expect(containerEl.querySelector('.row-completed')).toBeNull();
      const row = containerEl.querySelector('.assignment-table tbody tr[data-item-id]');
      expect(row.textContent).toContain('2/2');
    });
  });

  describe('addItemsFromOCR', () => {
    it('should convert OCR format correctly (unitPrice = total/qty)', () => {
      setup();
      addItemsFromOCR([
        { name: 'Ayam Geprek', quantity: 4, price: 20300, total: 81200 },
      ]);

      const state = getTableState();
      expect(state.items.length).toBe(1);
      expect(state.items[0].name).toBe('Ayam Geprek');
      expect(state.items[0].unitPrice).toBe(20300);
      expect(state.items[0].totalQty).toBe(4);
    });

    it('should handle single quantity items', () => {
      setup();
      addItemsFromOCR([
        { name: 'Es Teh', quantity: 1, price: 5000, total: 5000 },
      ]);

      const state = getTableState();
      expect(state.items.length).toBe(1);
      expect(state.items[0].unitPrice).toBe(5000);
      expect(state.items[0].totalQty).toBe(1);
    });
  });

  describe('getTableState', () => {
    it('should return correct structure', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      const state = getTableState();
      expect(state.items).toHaveLength(1);
      expect(state.allAssigned).toBe(false);
      expect(state.remainingCount).toBe(1);
      expect(state.assignments).toHaveProperty('Alice');
      expect(state.assignments).toHaveProperty('Bob');
    });

    it('should report allAssigned true only when all items have remaining = 0', () => {
      setup();
      addItems([
        { name: 'Nasi Goreng', unitPrice: 25000, qty: 1 },
        { name: 'Es Teh', unitPrice: 5000, qty: 1 },
      ]);

      // Assign first item
      tap('Alice', 1, 0);

      let state = getTableState();
      expect(state.allAssigned).toBe(false);

      // Assign second item
      tap('Bob', 1, 1);

      state = getTableState();
      expect(state.allAssigned).toBe(true);
      expect(state.remainingCount).toBe(0);
    });
  });

  describe('updateParticipants', () => {
    it('should update the participant chips', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 }]);

      updateParticipants(['Charlie', 'Dave']);

      const options = [...containerEl.querySelectorAll('.assign-chip')].map((c) => c.dataset.person);
      expect(options).toContain('Charlie');
      expect(options).toContain('Dave');
      expect(options).not.toContain('Alice');
    });
  });

  describe('clearItems', () => {
    it('should reset to empty state', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 }]);
      clearItems();

      const hint = containerEl.querySelector('.table-hint');
      expect(hint).not.toBeNull();
      expect(containerEl.querySelector('.assignment-table')).toBeNull();
    });
  });

  describe('in-place editing of items', () => {
    it('should switch row into edit mode when edit button is clicked', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      const editBtn = containerEl.querySelector('.btn-edit-item');
      expect(editBtn).not.toBeNull();
      expect(editBtn.textContent).toBe('✎');
      expect(editBtn.getAttribute('aria-label')).toBeTruthy();
      expect(editBtn.getAttribute('title')).toBeTruthy();

      editBtn.click();

      const editRow = containerEl.querySelector('.edit-row');
      expect(editRow).not.toBeNull();

      const nameInput = editRow.querySelector('.edit-item-name');
      const qtyInput = editRow.querySelector('.edit-item-qty');
      const priceInput = editRow.querySelector('.edit-item-price');
      const saveBtn = editRow.querySelector('.btn-save-item');
      const cancelBtn = editRow.querySelector('.btn-cancel-item');

      expect(nameInput.value).toBe('Nasi Goreng');
      expect(qtyInput.value).toBe('2');
      expect(priceInput.value).toBe('Rp 25.000');
      expect(priceInput.getAttribute('inputmode')).toBe('numeric');
      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    it('should format price as Rupiah while typing and store an integer on save', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      containerEl.querySelector('.btn-edit-item').click();

      const priceInput = containerEl.querySelector('.edit-item-price');
      priceInput.value = '30000';
      priceInput.dispatchEvent(new window.Event('input', { bubbles: true }));
      expect(priceInput.value).toBe('Rp 30.000');

      containerEl.querySelector('.btn-save-item').click();

      expect(containerEl.querySelector('.edit-row')).toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(30000);
    });

    it('should accept a typed formatted price such as "Rp 30.000"', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      containerEl.querySelector('.btn-edit-item').click();

      containerEl.querySelector('.edit-item-price').value = 'Rp 30.000';
      containerEl.querySelector('.btn-save-item').click();

      expect(getTableState().items[0].unitPrice).toBe(30000);
    });

    it('should reject an empty price and keep edit mode', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);
      containerEl.querySelector('.btn-edit-item').click();

      containerEl.querySelector('.edit-item-price').value = '';
      containerEl.querySelector('.btn-save-item').click();

      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(25000);
    });

    it('should accept a price of 0 (free item)', () => {
      setup();
      addItems([{ name: 'Kerupuk', unitPrice: 5000, qty: 1 }]);
      containerEl.querySelector('.btn-edit-item').click();

      containerEl.querySelector('.edit-item-price').value = '0';
      containerEl.querySelector('.btn-save-item').click();

      expect(containerEl.querySelector('.edit-row')).toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(0);
    });

    it('should show "Rp 0" for an existing free item in edit mode', () => {
      setup();
      addItems([{ name: 'Kerupuk', unitPrice: 0, qty: 1 }]);
      containerEl.querySelector('.btn-edit-item').click();

      expect(containerEl.querySelector('.edit-item-price').value).toBe('Rp 0');
    });

    it('should edit name/price/qty of an unassigned item and reflect in getTableState', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      containerEl.querySelector('.btn-edit-item').click();

      const editRow = containerEl.querySelector('.edit-row');
      const nameInput = editRow.querySelector('.edit-item-name');
      const qtyInput = editRow.querySelector('.edit-item-qty');
      const priceInput = editRow.querySelector('.edit-item-price');

      nameInput.value = 'Nasi Goreng Spesial';
      qtyInput.value = '3';
      priceInput.value = '30000';

      editRow.querySelector('.btn-save-item').click();

      // Edit row closed
      expect(containerEl.querySelector('.edit-row')).toBeNull();

      // State updated
      const state = getTableState();
      expect(state.items[0].name).toBe('Nasi Goreng Spesial');
      expect(state.items[0].unitPrice).toBe(30000);
      expect(state.items[0].totalQty).toBe(3);

      // DOM updated
      const row = containerEl.querySelector('.assignment-table tbody tr');
      expect(row.textContent).toContain('Nasi Goreng Spesial');
      expect(row.textContent).toContain('3/3');
      expect(row.textContent).toContain('30.000');

      // notifyChange called
      expect(stateChanges.length).toBeGreaterThan(1);
    });

    it('should edit price of an item with assignments, keep assignments and recompute subtotals', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      // Assign 1 to Alice, 1 to Bob
      tap('Alice');
      tap('Bob');

      // Row is now completed (0/2 remaining)
      const completedRow = containerEl.querySelector('.row-completed');
      expect(completedRow).not.toBeNull();

      // Edit button must be clickable even on completed row
      completedRow.querySelector('.btn-edit-item').click();

      const editRow = containerEl.querySelector('.edit-row');
      expect(editRow).not.toBeNull();
      // While editing, completed styling is not applied
      expect(editRow.classList.contains('row-completed')).toBe(false);

      // Change price from 25000 to 35000
      editRow.querySelector('.edit-item-price').value = '35000';
      editRow.querySelector('.btn-save-item').click();

      const state = getTableState();
      expect(state.items[0].unitPrice).toBe(35000);
      expect(state.items[0].assignments).toHaveLength(2);
      expect(state.assignments['Alice'].subtotal).toBe(35000);
      expect(state.assignments['Alice'].items[0].unitPrice).toBe(35000);
      expect(state.assignments['Bob'].subtotal).toBe(35000);
      expect(state.assignments['Bob'].items[0].unitPrice).toBe(35000);

      // DOM assigned section updated
      const assignedCards = containerEl.querySelectorAll('.assigned-person-card');
      expect(assignedCards[0].textContent).toContain('35.000');
      expect(assignedCards[1].textContent).toContain('35.000');
    });

    it('should change name keeping existing assignments intact', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      tap('Alice', 1);

      containerEl.querySelector('.btn-edit-item').click();
      containerEl.querySelector('.edit-item-name').value = 'Nasi Uduk';
      containerEl.querySelector('.btn-save-item').click();

      const state = getTableState();
      expect(state.items[0].name).toBe('Nasi Uduk');
      expect(state.items[0].assignments).toHaveLength(1);
      expect(state.assignments['Alice'].items[0].name).toBe('Nasi Uduk');
      expect(state.assignments['Alice'].subtotal).toBe(25000);
    });

    it('should block save and keep state unchanged when qty is reduced below assigned amount', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 3 }]);

      // Assign 2 to Alice
      tap('Alice', 2);

      // Edit item qty to 1 (assigned is 2)
      containerEl.querySelector('.btn-edit-item').click();
      const editRow = containerEl.querySelector('.edit-row');
      editRow.querySelector('.edit-item-qty').value = '1';
      editRow.querySelector('.btn-save-item').click();

      // State unchanged
      const state = getTableState();
      expect(state.items[0].totalQty).toBe(3);

      // Still in edit mode
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();

      // Error toast shown
      const toast = document.querySelector('.toast--error');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBeTruthy();
    });

    it('should reject invalid inputs and keep edit mode', () => {
      setup();
      addItems([{ name: 'Ayam Goreng', unitPrice: 20000, qty: 2 }]);
      containerEl.querySelector('.btn-edit-item').click();

      const editRow = containerEl.querySelector('.edit-row');
      const nameInput = editRow.querySelector('.edit-item-name');
      const priceInput = editRow.querySelector('.edit-item-price');
      const qtyInput = editRow.querySelector('.edit-item-qty');
      const saveBtn = editRow.querySelector('.btn-save-item');

      // 1. Empty name
      nameInput.value = '   ';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].name).toBe('Ayam Goreng');

      // 2. Negative price
      nameInput.value = 'Ayam Bakar';
      priceInput.value = '-500';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(20000);

      // 3. Non-integer price
      priceInput.value = '15000.75';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(20000);

      // 4. Empty price
      priceInput.value = '';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].unitPrice).toBe(20000);

      // 5. Qty 0
      priceInput.value = '22000';
      qtyInput.value = '0';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].totalQty).toBe(2);

      // 6. Negative qty
      qtyInput.value = '-2';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].totalQty).toBe(2);

      // 7. Non-integer qty
      qtyInput.value = '2.5';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].totalQty).toBe(2);

      // 8. Empty qty
      qtyInput.value = '';
      saveBtn.click();
      expect(containerEl.querySelector('.edit-row')).not.toBeNull();
      expect(getTableState().items[0].totalQty).toBe(2);
    });

    it('should revert state when Cancel button is clicked', () => {
      setup();
      addItems([{ name: 'Teh Manis', unitPrice: 5000, qty: 1 }]);

      containerEl.querySelector('.btn-edit-item').click();
      const editRow = containerEl.querySelector('.edit-row');

      editRow.querySelector('.edit-item-name').value = 'Kopi Susu';
      editRow.querySelector('.edit-item-price').value = '15000';
      editRow.querySelector('.edit-item-qty').value = '4';

      editRow.querySelector('.btn-cancel-item').click();

      // Edit row closed
      expect(containerEl.querySelector('.edit-row')).toBeNull();

      // State unchanged
      const state = getTableState();
      expect(state.items[0].name).toBe('Teh Manis');
      expect(state.items[0].unitPrice).toBe(5000);
      expect(state.items[0].totalQty).toBe(1);
    });

    it('should cancel on Escape key and save on Enter key', () => {
      setup();
      addItems([{ name: 'Teh Manis', unitPrice: 5000, qty: 1 }]);

      // Test Escape
      containerEl.querySelector('.btn-edit-item').click();
      let editRow = containerEl.querySelector('.edit-row');
      editRow.querySelector('.edit-item-name').value = 'Kopi Susu';

      editRow.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(containerEl.querySelector('.edit-row')).toBeNull();
      expect(getTableState().items[0].name).toBe('Teh Manis');

      // Test Enter
      containerEl.querySelector('.btn-edit-item').click();
      editRow = containerEl.querySelector('.edit-row');
      editRow.querySelector('.edit-item-name').value = 'Kopi Susu';

      editRow.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(containerEl.querySelector('.edit-row')).toBeNull();
      expect(getTableState().items[0].name).toBe('Kopi Susu');
    });

    it('should allow only one row in edit mode at a time', () => {
      setup();
      addItems([
        { name: 'Item 1', unitPrice: 10000, qty: 1 },
        { name: 'Item 2', unitPrice: 20000, qty: 2 },
      ]);

      const editBtns = containerEl.querySelectorAll('.btn-edit-item');
      expect(editBtns).toHaveLength(2);

      // Open edit mode on Item 1
      editBtns[0].click();
      let editRows = containerEl.querySelectorAll('.edit-row');
      expect(editRows).toHaveLength(1);
      expect(editRows[0].querySelector('.edit-item-name').value).toBe('Item 1');

      // Now click edit on Item 2
      const item2EditBtn = containerEl.querySelector('.btn-edit-item');
      item2EditBtn.click();

      editRows = containerEl.querySelectorAll('.edit-row');
      expect(editRows).toHaveLength(1);
      expect(editRows[0].querySelector('.edit-item-name').value).toBe('Item 2');
    });

    it('should round-trip edited items through snapshot encode and decode, and reload with loadItems', () => {
      setup();
      addItems([{ name: 'Mie Ayam', unitPrice: 15000, qty: 2 }]);

      // Assign 1 to Alice
      tap('Alice', 1);

      // Edit item
      containerEl.querySelector('.btn-edit-item').click();
      const editRow = containerEl.querySelector('.edit-row');
      editRow.querySelector('.edit-item-name').value = 'Mie Ayam Bakso';
      editRow.querySelector('.edit-item-price').value = '22000';
      editRow.querySelector('.edit-item-qty').value = '3';
      editRow.querySelector('.btn-save-item').click();

      // Build snapshot from current state
      const state = getTableState();
      const snapshot = buildSnapshot(['Alice', 'Bob'], { totalDiscount: 2000, totalShipping: 5000 }, state.items);

      // Encode and decode
      const encoded = encodeSnapshot(snapshot);
      const decoded = decodeSnapshot(encoded);

      expect(decoded.items).toHaveLength(1);
      expect(decoded.items[0].name).toBe('Mie Ayam Bakso');
      expect(decoded.items[0].unitPrice).toBe(22000);
      expect(decoded.items[0].totalQty).toBe(3);
      expect(decoded.items[0].assignments).toEqual([{ person: 'Alice', qty: 1 }]);

      // Load decoded items back into assigner (simulating history load)
      loadItems(decoded.items);
      const reloadedState = getTableState();
      expect(reloadedState.items[0].name).toBe('Mie Ayam Bakso');
      expect(reloadedState.items[0].unitPrice).toBe(22000);
      expect(reloadedState.items[0].totalQty).toBe(3);
      expect(reloadedState.assignments['Alice'].subtotal).toBe(22000);
    });
  });

  describe('focus after row actions', () => {
    it('undo returns focus to that person chip', () => {
      setup();
      addItems([{ name: 'Nasi', unitPrice: 1000, qty: 1 }]);
      tap('Alice');
      const undo = containerEl.querySelector('.undo-btn');
      undo.focus();
      undo.click();
      expect(document.activeElement).toBe(chip('Alice'));
    });

    it('edit lands on the name input, save returns to the edit button', () => {
      setup();
      addItems([{ name: 'Nasi', unitPrice: 1000, qty: 1 }]);
      const edit = containerEl.querySelector('.btn-edit-item');
      edit.focus();
      edit.click();
      expect(document.activeElement).toBe(containerEl.querySelector('.edit-item-name'));
      const save = containerEl.querySelector('.btn-save-item');
      save.focus();
      save.click();
      expect(document.activeElement).toBe(containerEl.querySelector('.btn-edit-item'));
    });

    it('delete moves focus to the next row', () => {
      setup();
      addItems([
        { name: 'A', unitPrice: 1000, qty: 1 },
        { name: 'B', unitPrice: 1000, qty: 1 },
      ]);
      const del = containerEl.querySelector('.btn-delete-item');
      del.focus();
      del.click();
      expect(document.activeElement).toBe(containerEl.querySelector('.btn-delete-item'));
    });
  });
});
