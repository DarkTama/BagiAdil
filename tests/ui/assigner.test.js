// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initTableAssigner,
  getTableState,
  addItems,
  addItemsFromOCR,
  updateParticipants,
  clearItems,
} from '../../src/ui/table-assigner.js';

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
});
