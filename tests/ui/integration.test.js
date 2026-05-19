// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initParticipants, getParticipants } from '../../src/ui/participants.js';
import { initItems, getItems, updateParticipantOptions } from '../../src/ui/items.js';
import { initBillParams, getParams } from '../../src/ui/bill-params.js';
import { renderResults } from '../../src/ui/results.js';
import { splitBill } from '../../src/engine/calculator.js';

describe('UI Integration', () => {
  let participantsEl;
  let itemsEl;
  let billParamsEl;
  let resultsEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="participants-container"></div>
      <div id="items-container"></div>
      <div id="bill-params-container"></div>
      <div id="results-container"></div>
      <div id="validation-errors"></div>
    `;
    participantsEl = document.getElementById('participants-container');
    itemsEl = document.getElementById('items-container');
    billParamsEl = document.getElementById('bill-params-container');
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

  describe('Items component', () => {
    it('should initialize with empty items list', () => {
      initItems(itemsEl);
      expect(getItems()).toEqual([]);
    });

    it('should add an item', () => {
      initItems(itemsEl);
      const addBtn = itemsEl.querySelector('.btn-add-item');
      addBtn.click();

      const nameInput = itemsEl.querySelector('.item-name');
      const priceInput = itemsEl.querySelector('.item-price');
      nameInput.value = 'Nasi Goreng';
      priceInput.value = '25000';
      nameInput.dispatchEvent(new Event('input'));
      priceInput.dispatchEvent(new Event('input'));

      const items = getItems();
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Nasi Goreng');
      expect(items[0].price).toBe(25000);
    });

    it('should update participant options', () => {
      initItems(itemsEl);
      updateParticipantOptions(['Alice', 'Bob']);

      const addBtn = itemsEl.querySelector('.btn-add-item');
      addBtn.click();

      const select = itemsEl.querySelector('.item-participant');
      const options = select.querySelectorAll('option');
      // Default option + 2 participants
      expect(options.length).toBe(3);
      expect(options[1].value).toBe('Alice');
      expect(options[2].value).toBe('Bob');
    });

    it('should remove an item', () => {
      initItems(itemsEl);
      const addBtn = itemsEl.querySelector('.btn-add-item');
      addBtn.click();
      addBtn.click();

      expect(itemsEl.querySelectorAll('.item-row').length).toBe(2);

      const removeBtn = itemsEl.querySelector('.btn-remove-item');
      removeBtn.click();

      expect(itemsEl.querySelectorAll('.item-row').length).toBe(1);
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
    it('should complete the full bill splitting flow', () => {
      // Initialize components
      initParticipants(participantsEl, {
        onChange: (participants) => updateParticipantOptions(participants),
      });
      initItems(itemsEl);
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

      // Add items
      const addItemBtn = itemsEl.querySelector('.btn-add-item');
      addItemBtn.click();
      addItemBtn.click();

      const nameInputs = itemsEl.querySelectorAll('.item-name');
      const priceInputs = itemsEl.querySelectorAll('.item-price');
      const selects = itemsEl.querySelectorAll('.item-participant');

      nameInputs[0].value = 'Nasi Goreng';
      priceInputs[0].value = '25000';
      selects[0].value = 'Alice';
      nameInputs[0].dispatchEvent(new Event('input'));
      priceInputs[0].dispatchEvent(new Event('input'));
      selects[0].dispatchEvent(new Event('change'));

      nameInputs[1].value = 'Mie Ayam';
      priceInputs[1].value = '35000';
      selects[1].value = 'Bob';
      nameInputs[1].dispatchEvent(new Event('input'));
      priceInputs[1].dispatchEvent(new Event('input'));
      selects[1].dispatchEvent(new Event('change'));

      // Set bill params
      billParamsEl.querySelector('#total-discount').value = '15000';
      billParamsEl.querySelector('#total-shipping').value = '12000';

      // Perform calculation
      const items = getItems();
      const params = getParams();
      const participants = getParticipants();

      expect(items.length).toBe(2);
      expect(params.totalDiscount).toBe(15000);
      expect(params.totalShipping).toBe(12000);

      // Build orders
      const orderMap = {};
      participants.forEach((name) => {
        orderMap[name] = 0;
      });
      items.forEach((item) => {
        orderMap[item.participant] += item.price;
      });
      const orders = participants
        .filter((name) => orderMap[name] > 0)
        .map((name) => ({ name, amount: orderMap[name] }));

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
      initItems(itemsEl);
      initBillParams(billParamsEl);

      const participants = getParticipants();
      const items = getItems();

      // Validate
      const errors = [];
      if (participants.length === 0) {
        errors.push({ field: 'participants', message: 'Add at least one participant' });
      }
      if (items.length === 0) {
        errors.push({ field: 'items', message: 'Add at least one item' });
      }

      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('Add at least one participant');
      expect(errors[1].message).toBe('Add at least one item');
    });
  });
});
