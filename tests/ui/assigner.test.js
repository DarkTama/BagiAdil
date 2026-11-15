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

      const rows = containerEl.querySelectorAll('.assignment-table tbody tr:not(.popup-row)');
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
      containerEl.querySelector('.btn-assign').click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Alice';
      popup.querySelector('.btn-popup-confirm').click();

      containerEl.querySelector('.btn-delete-item').click();

      const state = getTableState();
      expect(state.items.length).toBe(0);
      expect(state.assignments['Alice'].items.length).toBe(0);
    });
  });

  describe('assignment popup', () => {
    it('should show inline popup when assign button is clicked', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      const popup = containerEl.querySelector('.assign-popup');
      expect(popup).not.toBeNull();

      const select = popup.querySelector('.popup-person-select');
      expect(select).not.toBeNull();
      expect(select.options.length).toBe(3); // default + Alice + Bob

      const qtyInput = popup.querySelector('.popup-qty-input');
      expect(qtyInput).not.toBeNull();
      expect(qtyInput.value).toBe('2'); // max = remaining
    });

    it('should close popup on cancel', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      const cancelBtn = containerEl.querySelector('.btn-popup-cancel');
      cancelBtn.click();

      const popup = containerEl.querySelector('.assign-popup');
      expect(popup).toBeNull();
    });
  });

  describe('confirming assignment', () => {
    it('should update remaining qty and trigger onStateChange', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 3 }]);

      // Open popup
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      // Select person and set qty
      const select = containerEl.querySelector('.popup-person-select');
      select.value = 'Alice';

      const qtyInput = containerEl.querySelector('.popup-qty-input');
      qtyInput.value = '2';

      // Confirm
      const confirmBtn = containerEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      // Check remaining display
      const row = containerEl.querySelector('.assignment-table tbody tr:not(.popup-row)');
      expect(row.textContent).toContain('1/3');

      // Check state change callback
      const lastChange = stateChanges[stateChanges.length - 1];
      expect(lastChange.allAssigned).toBe(false);
      expect(lastChange.remainingCount).toBe(1);
      expect(lastChange.assignments['Alice'].items[0].name).toBe('Nasi Goreng');
      expect(lastChange.assignments['Alice'].items[0].qty).toBe(2);
      expect(lastChange.assignments['Alice'].subtotal).toBe(50000);
    });

    it('should grey out row when fully assigned', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 }]);

      // Open popup
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      // Select person
      const select = containerEl.querySelector('.popup-person-select');
      select.value = 'Alice';

      // Confirm (qty defaults to max = 1)
      const confirmBtn = containerEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      const row = containerEl.querySelector('.assignment-table tbody tr');
      expect(row.classList.contains('row-completed')).toBe(true);
    });
  });

  describe('undo', () => {
    it('should return qty to unassigned on undo', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 }]);

      // Assign
      let assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const select = containerEl.querySelector('.popup-person-select');
      select.value = 'Alice';
      const confirmBtn = containerEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      // Verify assigned
      expect(containerEl.querySelector('.row-completed')).not.toBeNull();

      // Undo
      const undoBtn = containerEl.querySelector('.undo-btn');
      expect(undoBtn).not.toBeNull();
      undoBtn.click();

      // Should be back to unassigned
      expect(containerEl.querySelector('.row-completed')).toBeNull();
      const row = containerEl.querySelector('.assignment-table tbody tr:not(.popup-row)');
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
      let assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      let select = containerEl.querySelector('.popup-person-select');
      select.value = 'Alice';
      let confirmBtn = containerEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      let state = getTableState();
      expect(state.allAssigned).toBe(false);

      // Assign second item
      assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      select = containerEl.querySelector('.popup-person-select');
      select.value = 'Bob';
      confirmBtn = containerEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      state = getTableState();
      expect(state.allAssigned).toBe(true);
      expect(state.remainingCount).toBe(0);
    });
  });

  describe('updateParticipants', () => {
    it('should update dropdown options', () => {
      setup();
      addItems([{ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 }]);

      updateParticipants(['Charlie', 'Dave']);

      // Open popup
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      const select = containerEl.querySelector('.popup-person-select');
      const options = Array.from(select.options).map((o) => o.value);
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
      expect(priceInput.value).toBe('25000');
      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
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
      containerEl.querySelector('.btn-assign').click();
      let popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Alice';
      popup.querySelector('.popup-qty-input').value = '1';
      popup.querySelector('.btn-popup-confirm').click();

      containerEl.querySelector('.btn-assign').click();
      popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Bob';
      popup.querySelector('.popup-qty-input').value = '1';
      popup.querySelector('.btn-popup-confirm').click();

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

      containerEl.querySelector('.btn-assign').click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Alice';
      popup.querySelector('.popup-qty-input').value = '1';
      popup.querySelector('.btn-popup-confirm').click();

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
      containerEl.querySelector('.btn-assign').click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Alice';
      popup.querySelector('.popup-qty-input').value = '2';
      popup.querySelector('.btn-popup-confirm').click();

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
      containerEl.querySelector('.btn-assign').click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('.popup-person-select').value = 'Alice';
      popup.querySelector('.popup-qty-input').value = '1';
      popup.querySelector('.btn-popup-confirm').click();

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
});
