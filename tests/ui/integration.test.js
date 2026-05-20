// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initParticipants, getParticipants } from '../../src/ui/participants.js';
import { initAddItemForm } from '../../src/ui/items.js';
import { initBillParams, getParams } from '../../src/ui/bill-params.js';
import { renderResults } from '../../src/ui/results.js';
import { splitBill } from '../../src/engine/calculator.js';
import {
  initTableAssigner,
  getTableState,
  addItems,
  updateParticipants,
} from '../../src/ui/table-assigner.js';

describe('UI Integration', () => {
  let participantsEl;
  let addItemFormEl;
  let billParamsEl;
  let resultsEl;
  let tableEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="participants-container"></div>
      <div id="add-item-form-container"></div>
      <div id="table-container"></div>
      <div id="bill-params-container"></div>
      <div id="results-container"></div>
      <div id="validation-errors"></div>
    `;
    participantsEl = document.getElementById('participants-container');
    addItemFormEl = document.getElementById('add-item-form-container');
    billParamsEl = document.getElementById('bill-params-container');
    resultsEl = document.getElementById('results-container');
    tableEl = document.getElementById('table-container');
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

  describe('Add Item Form component', () => {
    it('should render with inputs and a button', () => {
      initAddItemForm(addItemFormEl, { onAddItem: () => {} });
      expect(addItemFormEl.querySelector('.add-item-name')).not.toBeNull();
      expect(addItemFormEl.querySelector('.add-item-price')).not.toBeNull();
      expect(addItemFormEl.querySelector('.add-item-qty')).not.toBeNull();
      expect(addItemFormEl.querySelector('.btn-add-item')).not.toBeNull();
    });

    it('should call onAddItem with correct data when submitted', () => {
      const addedItems = [];
      initAddItemForm(addItemFormEl, { onAddItem: (item) => addedItems.push(item) });

      const nameInput = addItemFormEl.querySelector('.add-item-name');
      const priceInput = addItemFormEl.querySelector('.add-item-price');
      const qtyInput = addItemFormEl.querySelector('.add-item-qty');
      const addBtn = addItemFormEl.querySelector('.btn-add-item');

      nameInput.value = 'Nasi Goreng';
      priceInput.value = '25000';
      qtyInput.value = '2';
      addBtn.click();

      expect(addedItems.length).toBe(1);
      expect(addedItems[0]).toEqual({ name: 'Nasi Goreng', unitPrice: 25000, qty: 2 });
    });

    it('should not submit with empty name', () => {
      const addedItems = [];
      initAddItemForm(addItemFormEl, { onAddItem: (item) => addedItems.push(item) });

      const priceInput = addItemFormEl.querySelector('.add-item-price');
      const addBtn = addItemFormEl.querySelector('.btn-add-item');

      priceInput.value = '25000';
      addBtn.click();

      expect(addedItems.length).toBe(0);
    });

    it('should not submit with zero or negative price', () => {
      const addedItems = [];
      initAddItemForm(addItemFormEl, { onAddItem: (item) => addedItems.push(item) });

      const nameInput = addItemFormEl.querySelector('.add-item-name');
      const priceInput = addItemFormEl.querySelector('.add-item-price');
      const addBtn = addItemFormEl.querySelector('.btn-add-item');

      nameInput.value = 'Nasi Goreng';
      priceInput.value = '0';
      addBtn.click();

      expect(addedItems.length).toBe(0);
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

  describe('Full flow integration with table assigner', () => {
    it('should complete the full bill splitting flow', () => {
      const stateChanges = [];

      // Initialize participants
      initParticipants(participantsEl, {
        onChange: (participants) => updateParticipants(participants),
      });

      // Initialize table assigner
      initTableAssigner(tableEl, {
        participants: [],
        onStateChange: (state) => stateChanges.push(state),
      });

      initBillParams(billParamsEl);

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

      // Add items to table
      addItems([
        { name: 'Nasi Goreng', unitPrice: 25000, qty: 1 },
        { name: 'Mie Ayam', unitPrice: 35000, qty: 1 },
      ]);

      // Assign Nasi Goreng to Alice
      let assignBtn = tableEl.querySelector('.btn-assign');
      assignBtn.click();
      let select = tableEl.querySelector('.popup-person-select');
      select.value = 'Alice';
      let confirmBtn = tableEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      // Assign Mie Ayam to Bob
      assignBtn = tableEl.querySelector('.btn-assign');
      assignBtn.click();
      select = tableEl.querySelector('.popup-person-select');
      select.value = 'Bob';
      confirmBtn = tableEl.querySelector('.btn-popup-confirm');
      confirmBtn.click();

      // Verify all assigned
      const state = getTableState();
      expect(state.allAssigned).toBe(true);

      // Set bill params
      billParamsEl.querySelector('#total-discount').value = '15000';
      billParamsEl.querySelector('#total-shipping').value = '12000';

      const params = getParams();
      expect(params.totalDiscount).toBe(15000);
      expect(params.totalShipping).toBe(12000);

      // Build orders from assignments
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
      initTableAssigner(tableEl, { participants: [], onStateChange: () => {} });
      initBillParams(billParamsEl);

      const participants = getParticipants();
      const state = getTableState();

      // Validate
      const errors = [];
      if (participants.length === 0) {
        errors.push({ field: 'participants', message: 'Add at least one participant' });
      }
      if (state.items.length === 0) {
        errors.push({ field: 'items', message: 'Add at least one item' });
      }

      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('Add at least one participant');
      expect(errors[1].message).toBe('Add at least one item');
    });
  });
});
