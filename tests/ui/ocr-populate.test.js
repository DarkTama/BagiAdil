// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initTableAssigner,
  getTableState,
  addItemsFromOCR,
  clearItems,
} from '../../src/ui/table-assigner.js';
import { initBillParams, getParams, setParams } from '../../src/ui/bill-params.js';

describe('OCR Populate', () => {
  let tableEl;
  let billParamsEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="table-container"></div>
      <div id="bill-params-container"></div>
    `;
    tableEl = document.getElementById('table-container');
    billParamsEl = document.getElementById('bill-params-container');
  });

  describe('addItemsFromOCR', () => {
    it('should populate items from OCR data with correct unit price and qty', () => {
      initTableAssigner(tableEl, { participants: ['Alice'], onStateChange: () => {} });

      addItemsFromOCR([
        { name: 'Nasi Goreng', quantity: 2, price: 15000, total: 30000 },
        { name: 'Es Teh', quantity: 1, price: 5000, total: 5000 },
      ]);

      const state = getTableState();
      expect(state.items.length).toBe(2);
      expect(state.items[0].name).toBe('Nasi Goreng');
      expect(state.items[0].unitPrice).toBe(15000);
      expect(state.items[0].totalQty).toBe(2);
      expect(state.items[1].name).toBe('Es Teh');
      expect(state.items[1].unitPrice).toBe(5000);
      expect(state.items[1].totalQty).toBe(1);
    });

    it('should render item rows in the table', () => {
      initTableAssigner(tableEl, { participants: ['Alice'], onStateChange: () => {} });

      addItemsFromOCR([{ name: 'Mie Ayam', quantity: 1, price: 20000, total: 20000 }]);

      const table = tableEl.querySelector('.assignment-table');
      expect(table).not.toBeNull();
      const rows = tableEl.querySelectorAll('.assignment-table tbody tr:not(.popup-row)');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Mie Ayam');
    });

    it('should use unitPrice = Math.round(total/qty) for items with qty > 1', () => {
      initTableAssigner(tableEl, { participants: ['Alice'], onStateChange: () => {} });

      addItemsFromOCR([{ name: 'Ayam Geprek', quantity: 4, price: 20300, total: 81200 }]);

      const state = getTableState();
      expect(state.items.length).toBe(1);
      expect(state.items[0].name).toBe('Ayam Geprek');
      expect(state.items[0].unitPrice).toBe(20300);
      expect(state.items[0].totalQty).toBe(4);
    });

    it('should append to existing items', () => {
      initTableAssigner(tableEl, { participants: ['Alice'], onStateChange: () => {} });

      addItemsFromOCR([{ name: 'Item A', quantity: 1, price: 10000, total: 10000 }]);
      addItemsFromOCR([{ name: 'Item B', quantity: 2, price: 5000, total: 10000 }]);

      const state = getTableState();
      expect(state.items.length).toBe(2);
      expect(state.items[0].name).toBe('Item A');
      expect(state.items[1].name).toBe('Item B');
      expect(state.items[1].unitPrice).toBe(5000);
      expect(state.items[1].totalQty).toBe(2);
    });
  });

  describe('clearItems', () => {
    it('should reset items and show empty state', () => {
      initTableAssigner(tableEl, { participants: ['Alice'], onStateChange: () => {} });

      addItemsFromOCR([{ name: 'Old Item', quantity: 1, price: 5000, total: 5000 }]);
      clearItems();

      const state = getTableState();
      expect(state.items.length).toBe(0);
      expect(tableEl.querySelector('.table-hint')).not.toBeNull();
    });
  });

  describe('setParams', () => {
    it('should set discount and shipping values', () => {
      initBillParams(billParamsEl);

      setParams({ totalDiscount: 5000, totalShipping: 8000 });

      const params = getParams();
      expect(params.totalDiscount).toBe(5000);
      expect(params.totalShipping).toBe(8000);
    });

    it('should handle zero values', () => {
      initBillParams(billParamsEl);

      setParams({ totalDiscount: 0, totalShipping: 0 });

      const params = getParams();
      expect(params.totalDiscount).toBe(0);
      expect(params.totalShipping).toBe(0);
    });

    it('should handle undefined values gracefully', () => {
      initBillParams(billParamsEl);

      setParams({ totalDiscount: undefined, totalShipping: undefined });

      const params = getParams();
      expect(params.totalDiscount).toBe(0);
      expect(params.totalShipping).toBe(0);
    });
  });

  describe('Integration: OCR confirm flow', () => {
    it('should populate table and params like populateFromOCR would', () => {
      initTableAssigner(tableEl, { participants: ['Alice', 'Bob'], onStateChange: () => {} });
      initBillParams(billParamsEl);

      // Simulate the confirmed data shape from ocr-results.js
      const confirmedData = {
        items: [
          { name: 'Nasi Goreng', quantity: 2, price: 15000, total: 30000 },
          { name: 'Ayam Bakar', quantity: 1, price: 35000, total: 35000 },
        ],
        discount: 5000,
        deliveryFee: 8000,
        platform: 'grabfood',
      };

      // This is what populateFromOCR does
      addItemsFromOCR(confirmedData.items);
      setParams({ totalDiscount: confirmedData.discount, totalShipping: confirmedData.deliveryFee });

      // Verify items
      const state = getTableState();
      expect(state.items.length).toBe(2);
      expect(state.items[0].name).toBe('Nasi Goreng');
      expect(state.items[0].unitPrice).toBe(15000);
      expect(state.items[0].totalQty).toBe(2);
      expect(state.items[1].name).toBe('Ayam Bakar');
      expect(state.items[1].unitPrice).toBe(35000);
      expect(state.items[1].totalQty).toBe(1);

      // Verify params
      const params = getParams();
      expect(params.totalDiscount).toBe(5000);
      expect(params.totalShipping).toBe(8000);
    });
  });
});
