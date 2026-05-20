// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initParticipants, getParticipants } from '../../src/ui/participants.js';
import { initAddItemForm } from '../../src/ui/items.js';
import { initBillParams, getParams } from '../../src/ui/bill-params.js';
import { renderResults } from '../../src/ui/results.js';
import { splitBill } from '../../src/engine/calculator.js';
import {
  initAssignmentTable,
  addItem,
  updateParticipants,
  getAssignmentState,
} from '../../src/ui/assignment-table.js';

describe('UI Integration', () => {
  let participantsEl;
  let addItemEl;
  let billParamsEl;
  let resultsEl;
  let assignmentTableEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="participants-container"></div>
      <div id="add-item-container"></div>
      <div id="bill-params-container"></div>
      <div id="assignment-table-container"></div>
      <div id="results-container"></div>
      <div id="validation-errors"></div>
    `;
    participantsEl = document.getElementById('participants-container');
    addItemEl = document.getElementById('add-item-container');
    billParamsEl = document.getElementById('bill-params-container');
    assignmentTableEl = document.getElementById('assignment-table-container');
    resultsEl = document.getElementById('results-container');
  });

  describe('Participants component', () => {
    it('should initialize with empty participant list', () => {
      initParticipants(participantsEl);
      expect(getParticipants()).toEqual([]);
    });

    it('should add a participant', () => {
      initParticipants(participantsEl);
      const input = participantsEl.querySelector('#participant-name');
      const addBtn = participantsEl.querySelector('.btn-primary');

      input.value = 'Alice';
      addBtn.click();

      expect(getParticipants()).toEqual(['Alice']);
    });

    it('should not add empty name', () => {
      initParticipants(participantsEl);
      const input = participantsEl.querySelector('#participant-name');
      const addBtn = participantsEl.querySelector('.btn-primary');

      input.value = '';
      addBtn.click();

      expect(getParticipants()).toEqual([]);
      const error = participantsEl.querySelector('#participant-error');
      expect(error.textContent).toBe('Name cannot be empty');
    });

    it('should not add duplicate name', () => {
      initParticipants(participantsEl);
      const input = participantsEl.querySelector('#participant-name');
      const addBtn = participantsEl.querySelector('.btn-primary');

      input.value = 'Alice';
      addBtn.click();

      // Re-query input after re-render
      const input2 = participantsEl.querySelector('#participant-name');
      const addBtn2 = participantsEl.querySelector('.btn-primary');
      input2.value = 'alice';
      addBtn2.click();

      expect(getParticipants()).toEqual(['Alice']);
      const error = participantsEl.querySelector('#participant-error');
      expect(error.textContent).toBe('This name already exists');
    });

    it('should remove a participant', () => {
      initParticipants(participantsEl);
      const input = participantsEl.querySelector('#participant-name');
      const addBtn = participantsEl.querySelector('.btn-primary');

      input.value = 'Alice';
      addBtn.click();

      const removeBtn = participantsEl.querySelector('.chip-remove');
      removeBtn.click();

      expect(getParticipants()).toEqual([]);
    });

    it('should call onChange when participants change', () => {
      const changes = [];
      initParticipants(participantsEl, { onChange: (p) => changes.push([...p]) });

      const input = participantsEl.querySelector('#participant-name');
      const addBtn = participantsEl.querySelector('.btn-primary');

      input.value = 'Alice';
      addBtn.click();

      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual(['Alice']);
    });
  });

  describe('Add Item form', () => {
    it('should render the add item form with inputs', () => {
      const addedItems = [];
      initAddItemForm(addItemEl, { onAddItem: (item) => addedItems.push(item) });

      const nameInput = addItemEl.querySelector('.add-item-name');
      const priceInput = addItemEl.querySelector('.add-item-price');
      const qtyInput = addItemEl.querySelector('.add-item-qty');
      const addBtn = addItemEl.querySelector('.btn-add-item');

      expect(nameInput).not.toBeNull();
      expect(priceInput).not.toBeNull();
      expect(qtyInput).not.toBeNull();
      expect(addBtn).not.toBeNull();
    });

    it('should add an item when form is valid', () => {
      const addedItems = [];
      initAddItemForm(addItemEl, { onAddItem: (item) => addedItems.push(item) });

      const nameInput = addItemEl.querySelector('.add-item-name');
      const priceInput = addItemEl.querySelector('.add-item-price');
      const qtyInput = addItemEl.querySelector('.add-item-qty');
      const addBtn = addItemEl.querySelector('.btn-add-item');

      nameInput.value = 'Nasi Goreng';
      priceInput.value = '25000';
      qtyInput.value = '2';
      addBtn.click();

      expect(addedItems.length).toBe(1);
      expect(addedItems[0]).toEqual({ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 });
    });

    it('should not add item with empty name', () => {
      const addedItems = [];
      initAddItemForm(addItemEl, { onAddItem: (item) => addedItems.push(item) });

      const priceInput = addItemEl.querySelector('.add-item-price');
      const addBtn = addItemEl.querySelector('.btn-add-item');

      priceInput.value = '25000';
      addBtn.click();

      expect(addedItems.length).toBe(0);
    });

    it('should not add item with zero price', () => {
      const addedItems = [];
      initAddItemForm(addItemEl, { onAddItem: (item) => addedItems.push(item) });

      const nameInput = addItemEl.querySelector('.add-item-name');
      const priceInput = addItemEl.querySelector('.add-item-price');
      const addBtn = addItemEl.querySelector('.btn-add-item');

      nameInput.value = 'Test';
      priceInput.value = '0';
      addBtn.click();

      expect(addedItems.length).toBe(0);
    });

    it('should clear form after successful add', () => {
      initAddItemForm(addItemEl, { onAddItem: () => {} });

      const nameInput = addItemEl.querySelector('.add-item-name');
      const priceInput = addItemEl.querySelector('.add-item-price');
      const qtyInput = addItemEl.querySelector('.add-item-qty');
      const addBtn = addItemEl.querySelector('.btn-add-item');

      nameInput.value = 'Nasi Goreng';
      priceInput.value = '25000';
      qtyInput.value = '3';
      addBtn.click();

      expect(nameInput.value).toBe('');
      expect(priceInput.value).toBe('');
      expect(qtyInput.value).toBe('1');
    });
  });

  describe('Bill params component', () => {
    it('should initialize with defaults of 0', () => {
      initBillParams(billParamsEl);
      const params = getParams();
      expect(params.totalDiscount).toBe(0);
      expect(params.totalShipping).toBe(0);
    });

    it('should read user input values', () => {
      initBillParams(billParamsEl);
      const discountInput = billParamsEl.querySelector('#total-discount');
      const shippingInput = billParamsEl.querySelector('#total-shipping');

      discountInput.value = '15000';
      shippingInput.value = '12000';

      const params = getParams();
      expect(params.totalDiscount).toBe(15000);
      expect(params.totalShipping).toBe(12000);
    });
  });

  describe('Results component', () => {
    it('should render calculation results', () => {
      const result = splitBill({
        orders: [
          { name: 'Alice', amount: 25000 },
          { name: 'Bob', amount: 35000 },
        ],
        totalDiscount: 10000,
        totalShipping: 8000,
      });

      renderResults(result, resultsEl);

      expect(resultsEl.querySelector('.badge-success')).not.toBeNull();
      expect(resultsEl.querySelector('.grand-total-amount').textContent).toContain('Rp');
      const cards = resultsEl.querySelectorAll('.result-card');
      expect(cards.length).toBe(2);
      expect(cards[0].querySelector('.result-card-name').textContent).toBe('Alice');
      expect(cards[1].querySelector('.result-card-name').textContent).toBe('Bob');
    });

    it('should display formatted currency amounts', () => {
      const result = splitBill({
        orders: [{ name: 'Alice', amount: 50000 }],
        totalDiscount: 0,
        totalShipping: 10000,
      });

      renderResults(result, resultsEl);

      const grandTotal = resultsEl.querySelector('.grand-total-amount').textContent;
      expect(grandTotal).toContain('Rp');
      expect(grandTotal).toContain('60.000');
    });
  });

  describe('Full flow integration', () => {
    it('should complete the full bill splitting flow with assignment table', () => {
      // Initialize components
      initParticipants(participantsEl, {
        onChange: (participants) => updateParticipants(participants),
      });
      initBillParams(billParamsEl);
      initAssignmentTable(assignmentTableEl, {
        participants: [],
        onAssignmentChange: () => {},
      });

      // Add participants
      let input = participantsEl.querySelector('#participant-name');
      let addBtn = participantsEl.querySelector('.btn-primary');
      input.value = 'Alice';
      addBtn.click();

      input = participantsEl.querySelector('#participant-name');
      addBtn = participantsEl.querySelector('.btn-primary');
      input.value = 'Bob';
      addBtn.click();

      expect(getParticipants()).toEqual(['Alice', 'Bob']);

      // Add items to assignment table
      addItem({ name: 'Nasi Goreng', unitPrice: 25000, qty: 1 });
      addItem({ name: 'Mie Ayam', unitPrice: 35000, qty: 1 });

      // Verify items appear in table
      const table = assignmentTableEl.querySelector('.assignment-table');
      expect(table).not.toBeNull();
      const rows = table.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      // Assign Nasi Goreng to Alice via popup
      const assignBtns = assignmentTableEl.querySelectorAll('.btn-assign');
      assignBtns[0].click(); // Open popup for first item

      const popup = assignmentTableEl.querySelector('.assign-popup');
      expect(popup).not.toBeNull();

      const select = popup.querySelector('select');
      select.value = 'Alice';
      const confirmBtn = popup.querySelector('.btn-confirm-assign');
      confirmBtn.click();

      // Assign Mie Ayam to Bob
      const assignBtns2 = assignmentTableEl.querySelectorAll('.btn-assign');
      // Find the non-disabled button
      const activeBtns = Array.from(assignBtns2).filter((b) => !b.disabled);
      activeBtns[0].click();

      const popup2 = assignmentTableEl.querySelector('.assign-popup');
      const select2 = popup2.querySelector('select');
      select2.value = 'Bob';
      const confirmBtn2 = popup2.querySelector('.btn-confirm-assign');
      confirmBtn2.click();

      // Verify all assigned
      const state = getAssignmentState();
      expect(state.allAssigned).toBe(true);
      expect(state.totalRemaining).toBe(0);

      // Set bill params
      billParamsEl.querySelector('#total-discount').value = '15000';
      billParamsEl.querySelector('#total-shipping').value = '12000';

      // Build orders from assignments
      const params = getParams();
      const orders = [];
      Object.entries(state.assignments).forEach(([name, data]) => {
        if (data.subtotal > 0) {
          orders.push({ name, amount: data.subtotal });
        }
      });

      const result = splitBill({
        orders,
        totalDiscount: params.totalDiscount,
        totalShipping: params.totalShipping,
      });

      // Render results
      renderResults(result, resultsEl);

      // Verify results are displayed
      expect(resultsEl.querySelector('.badge')).not.toBeNull();
      expect(resultsEl.querySelectorAll('.result-card').length).toBe(2);
      expect(resultsEl.querySelector('.grand-total-amount').textContent).toContain('Rp');
    });

    it('should prevent calculation with no participants or items', () => {
      initParticipants(participantsEl);
      initAssignmentTable(assignmentTableEl, { participants: [] });

      const participants = getParticipants();
      const state = getAssignmentState();

      // Validate
      const errors = [];
      if (participants.length === 0) {
        errors.push({ field: 'participants', message: 'Add at least one participant' });
      }
      if (state.totalRemaining === 0 && !state.allAssigned) {
        errors.push({ field: 'items', message: 'Add at least one item' });
      }

      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('Add at least one participant');
    });
  });
});
