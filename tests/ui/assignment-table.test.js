// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initAssignmentTable,
  addItem,
  setItems,
  updateParticipants,
  getAssignmentState,
} from '../../src/ui/assignment-table.js';

describe('Assignment Table', () => {
  let containerEl;
  let assignmentChanges;

  beforeEach(() => {
    document.body.innerHTML = '<div id="table-container"></div>';
    containerEl = document.getElementById('table-container');
    assignmentChanges = [];
    initAssignmentTable(containerEl, {
      participants: ['Alice', 'Bob'],
      onAssignmentChange: (data) => assignmentChanges.push(data),
    });
  });

  describe('addItem', () => {
    it('should add an item to the unassigned list', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 });

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(2);
      expect(state.allAssigned).toBe(false);
    });

    it('should render item in the table', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      const table = containerEl.querySelector('.assignment-table');
      expect(table).not.toBeNull();
      const rows = table.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.item-name-cell').textContent).toContain('Nasi Goreng');
    });

    it('should show assign button for each item', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      const assignBtns = containerEl.querySelectorAll('.btn-assign');
      expect(assignBtns.length).toBe(1);
      expect(assignBtns[0].disabled).toBe(false);
    });
  });

  describe('setItems', () => {
    it('should replace all items and reset assignments', () => {
      addItem({ name: 'Old Item', unitPrice: 10000, qty: 1 });

      setItems([
        { name: 'Item A', unitPrice: 20000, qty: 3 },
        { name: 'Item B', unitPrice: 15000, qty: 2 },
      ]);

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(5);

      const rows = containerEl.querySelectorAll('.assignment-table tbody tr');
      expect(rows.length).toBe(2);
    });
  });

  describe('assign and unassign', () => {
    it('should assign item to participant via popup', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 });

      // Open popup
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      // Popup should appear
      const popup = containerEl.querySelector('.assign-popup');
      expect(popup).not.toBeNull();

      // Select participant and qty
      const select = popup.querySelector('select');
      select.value = 'Alice';
      const qtyInput = popup.querySelector('.qty-input');
      qtyInput.value = '1';

      // Confirm
      const confirmBtn = popup.querySelector('.btn-confirm-assign');
      confirmBtn.click();

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(1);
      expect(state.assignments['Alice']).toBeDefined();
      expect(state.assignments['Alice'].subtotal).toBe(25000);
      expect(state.assignments['Alice'].items.length).toBe(1);
    });

    it('should disable assign button when remainingQty is 0', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      // Assign all qty
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      // Button should be disabled
      const btns = containerEl.querySelectorAll('.btn-assign');
      expect(btns[0].disabled).toBe(true);
    });

    it('should mark row as completed when remainingQty is 0', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      // Assign
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Bob';
      popup.querySelector('.btn-confirm-assign').click();

      const completedRow = containerEl.querySelector('.row-completed');
      expect(completedRow).not.toBeNull();
    });

    it('should undo an assignment', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      // Assign
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      expect(getAssignmentState().totalRemaining).toBe(0);

      // Undo
      const undoBtn = containerEl.querySelector('.btn-undo');
      expect(undoBtn).not.toBeNull();
      undoBtn.click();

      expect(getAssignmentState().totalRemaining).toBe(1);
      expect(getAssignmentState().allAssigned).toBe(false);
    });

    it('should fire onAssignmentChange callback', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      // addItem fires once, assign fires once
      expect(assignmentChanges.length).toBeGreaterThan(0);
      const lastChange = assignmentChanges[assignmentChanges.length - 1];
      expect(lastChange['Alice']).toBeDefined();
      expect(lastChange['Alice'].subtotal).toBe(25000);
    });

    it('should expand items in callback (each unit as separate entry)', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 3 });

      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Bob';
      popup.querySelector('.qty-input').value = '2';
      popup.querySelector('.btn-confirm-assign').click();

      const lastChange = assignmentChanges[assignmentChanges.length - 1];
      expect(lastChange['Bob'].items.length).toBe(2);
      expect(lastChange['Bob'].items[0]).toEqual({ name: 'Nasi Goreng', price: 25000 });
      expect(lastChange['Bob'].subtotal).toBe(50000);
    });

    it('should cancel popup on cancel button', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      const popup = containerEl.querySelector('.assign-popup');
      expect(popup).not.toBeNull();

      const cancelBtn = popup.querySelector('.btn-cancel');
      cancelBtn.click();

      // Popup should be gone
      expect(containerEl.querySelector('.assign-popup')).toBeNull();
    });
  });

  describe('getAssignmentState', () => {
    it('should return allAssigned true when all items fully assigned', () => {
      addItem({ name: 'Item A', unitPrice: 10000, qty: 1 });
      addItem({ name: 'Item B', unitPrice: 20000, qty: 1 });

      // Assign Item A to Alice
      let assignBtns = containerEl.querySelectorAll('.btn-assign');
      assignBtns[0].click();
      let popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      // Assign Item B to Bob
      assignBtns = containerEl.querySelectorAll('.btn-assign');
      const activeBtn = Array.from(assignBtns).find((b) => !b.disabled);
      activeBtn.click();
      popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Bob';
      popup.querySelector('.btn-confirm-assign').click();

      const state = getAssignmentState();
      expect(state.allAssigned).toBe(true);
      expect(state.totalRemaining).toBe(0);
    });

    it('should return allAssigned false when no items exist', () => {
      const state = getAssignmentState();
      expect(state.allAssigned).toBe(false);
    });
  });

  describe('updateParticipants', () => {
    it('should return assignments of removed participants back to unassigned', () => {
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });

      // Assign to Alice
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      expect(getAssignmentState().totalRemaining).toBe(0);

      // Remove Alice from participants
      updateParticipants(['Bob']);

      expect(getAssignmentState().totalRemaining).toBe(1);
      expect(getAssignmentState().allAssigned).toBe(false);
    });

    it('should update participant options in popup', () => {
      updateParticipants(['Charlie', 'Diana']);

      addItem({ name: 'Item', unitPrice: 10000, qty: 1 });
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();

      const options = containerEl.querySelectorAll('.assign-popup select option');
      // First option is placeholder, then Charlie, Diana
      expect(options.length).toBe(3);
      expect(options[1].value).toBe('Charlie');
      expect(options[2].value).toBe('Diana');
    });
  });

  describe('assigned items display', () => {
    it('should show assigned items grouped by person', () => {
      addItem({ name: 'Item A', unitPrice: 10000, qty: 1 });
      addItem({ name: 'Item B', unitPrice: 20000, qty: 1 });

      // Assign Item A to Alice
      let assignBtns = containerEl.querySelectorAll('.btn-assign');
      assignBtns[0].click();
      let popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      // Assign Item B to Alice
      assignBtns = containerEl.querySelectorAll('.btn-assign');
      const activeBtn = Array.from(assignBtns).find((b) => !b.disabled);
      activeBtn.click();
      popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.btn-confirm-assign').click();

      // Check assigned section
      const cards = containerEl.querySelectorAll('.assigned-person-card');
      expect(cards.length).toBe(1);
      expect(cards[0].querySelector('h4').textContent).toBe('Alice');

      const lines = cards[0].querySelectorAll('.assigned-item-line');
      expect(lines.length).toBe(2);
    });

    it('should show subtotal per person', () => {
      addItem({ name: 'Item A', unitPrice: 10000, qty: 2 });

      // Assign 2x to Alice
      const assignBtn = containerEl.querySelector('.btn-assign');
      assignBtn.click();
      const popup = containerEl.querySelector('.assign-popup');
      popup.querySelector('select').value = 'Alice';
      popup.querySelector('.qty-input').value = '2';
      popup.querySelector('.btn-confirm-assign').click();

      const subtotalEl = containerEl.querySelector('.assigned-person-subtotal');
      expect(subtotalEl).not.toBeNull();
      expect(subtotalEl.textContent).toContain('20.000');
    });
  });
});
