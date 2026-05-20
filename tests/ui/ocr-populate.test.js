// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initAssignmentTable,
  setItems,
  getAssignmentState,
} from '../../src/ui/assignment-table.js';
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

  describe('setItems (from OCR)', () => {
    it('should populate items from OCR data and render them', () => {
      initAssignmentTable(tableEl, { participants: ['Alice'] });

      // Simulate OCR items converted to assignment table format
      setItems([
        { name: 'Nasi Goreng', unitPrice: 15000, qty: 2 },
        { name: 'Es Teh', unitPrice: 5000, qty: 1 },
      ]);

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(3); // 2 + 1
    });

    it('should render item rows in the DOM', () => {
      initAssignmentTable(tableEl, { participants: ['Alice'] });

      setItems([{ name: 'Mie Ayam', unitPrice: 20000, qty: 1 }]);

      const rows = tableEl.querySelectorAll('.assignment-table tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.item-name-cell').textContent).toContain('Mie Ayam');
    });

    it('should handle items with multiple quantities', () => {
      initAssignmentTable(tableEl, { participants: ['Alice'] });

      setItems([{ name: 'Ayam Geprek', unitPrice: 20300, qty: 4 }]);

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(4);

      const rows = tableEl.querySelectorAll('.assignment-table tbody tr');
      expect(rows.length).toBe(1);
    });

    it('should replace existing items on second call', () => {
      initAssignmentTable(tableEl, { participants: ['Alice'] });

      setItems([{ name: 'Item A', unitPrice: 10000, qty: 1 }]);
      setItems([{ name: 'Item B', unitPrice: 5000, qty: 2 }]);

      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(2);

      const rows = tableEl.querySelectorAll('.assignment-table tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.item-name-cell').textContent).toContain('Item B');
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
    it('should populate items and params like populateManualFromOCR would', () => {
      initAssignmentTable(tableEl, { participants: ['Alice', 'Bob'] });
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

      // This is what populateManualFromOCR does - convert items for assignment table
      const items = confirmedData.items.map((item) => {
        const qty = item.quantity || 1;
        const unitPrice = Math.round(item.total / qty);
        return { name: item.name, unitPrice, qty };
      });
      setItems(items);
      setParams({ totalDiscount: confirmedData.discount, totalShipping: confirmedData.deliveryFee });

      // Verify items
      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(3); // 2 + 1

      // Verify params
      const params = getParams();
      expect(params.totalDiscount).toBe(5000);
      expect(params.totalShipping).toBe(8000);
    });

    it('should replace items on re-confirm instead of appending', () => {
      initAssignmentTable(tableEl, { participants: ['Alice'] });

      // First confirm
      setItems([{ name: 'Item A', unitPrice: 10000, qty: 1 }]);

      // Second confirm (simulates re-scan and re-confirm)
      setItems([{ name: 'Item B', unitPrice: 5000, qty: 2 }]);

      // Should only have the second set of items, not both
      const state = getAssignmentState();
      expect(state.totalRemaining).toBe(2);

      const rows = tableEl.querySelectorAll('.assignment-table tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.item-name-cell').textContent).toContain('Item B');
    });
  });
});
