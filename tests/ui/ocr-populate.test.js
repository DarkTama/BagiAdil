// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initItems, getItems, addItemsFromOCR, setItems } from '../../src/ui/items.js';
import { initBillParams, getParams, setParams } from '../../src/ui/bill-params.js';

describe('OCR Populate', () => {
  let itemsEl;
  let billParamsEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="items-container"></div>
      <div id="bill-params-container"></div>
    `;
    itemsEl = document.getElementById('items-container');
    billParamsEl = document.getElementById('bill-params-container');
  });

  describe('addItemsFromOCR', () => {
    it('should populate items from OCR data and render them', () => {
      initItems(itemsEl);

      addItemsFromOCR([
        { name: 'Nasi Goreng', quantity: 2, price: 15000, total: 30000 },
        { name: 'Es Teh', quantity: 1, price: 5000, total: 5000 },
      ]);

      const items = getItems();
      expect(items.length).toBe(2);
      expect(items[0]).toEqual({ name: 'Nasi Goreng', price: 30000, participant: '' });
      expect(items[1]).toEqual({ name: 'Es Teh', price: 5000, participant: '' });
    });

    it('should render item rows in the DOM', () => {
      initItems(itemsEl);

      addItemsFromOCR([{ name: 'Mie Ayam', quantity: 1, price: 20000, total: 20000 }]);

      const rows = itemsEl.querySelectorAll('.item-row');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.item-name').value).toBe('Mie Ayam');
      expect(rows[0].querySelector('.item-price').value).toBe('20000');
    });

    it('should append to existing items', () => {
      initItems(itemsEl);

      addItemsFromOCR([{ name: 'Item A', quantity: 1, price: 10000, total: 10000 }]);
      addItemsFromOCR([{ name: 'Item B', quantity: 2, price: 5000, total: 10000 }]);

      const items = getItems();
      expect(items.length).toBe(2);
      expect(items[0].name).toBe('Item A');
      expect(items[1].name).toBe('Item B');
    });
  });

  describe('setItems', () => {
    it('should replace items array and render', () => {
      initItems(itemsEl);

      addItemsFromOCR([{ name: 'Old Item', quantity: 1, price: 5000, total: 5000 }]);

      setItems([
        { name: 'New Item 1', price: 12000, participant: '' },
        { name: 'New Item 2', price: 8000, participant: '' },
      ]);

      const items = getItems();
      expect(items.length).toBe(2);
      expect(items[0]).toEqual({ name: 'New Item 1', price: 12000, participant: '' });
      expect(items[1]).toEqual({ name: 'New Item 2', price: 8000, participant: '' });
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
      initItems(itemsEl);
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

      // This is what populateManualFromOCR does (uses setItems to replace, not append)
      setItems(
        confirmedData.items.map((item) => ({ name: item.name, price: item.total, participant: '' })),
      );
      setParams({ totalDiscount: confirmedData.discount, totalShipping: confirmedData.deliveryFee });

      // Verify items
      const items = getItems();
      expect(items.length).toBe(2);
      expect(items[0]).toEqual({ name: 'Nasi Goreng', price: 30000, participant: '' });
      expect(items[1]).toEqual({ name: 'Ayam Bakar', price: 35000, participant: '' });

      // Verify params
      const params = getParams();
      expect(params.totalDiscount).toBe(5000);
      expect(params.totalShipping).toBe(8000);
    });

    it('should replace items on re-confirm instead of appending', () => {
      initItems(itemsEl);

      // First confirm
      const firstData = [
        { name: 'Item A', quantity: 1, price: 10000, total: 10000 },
      ];
      setItems(firstData.map((item) => ({ name: item.name, price: item.total, participant: '' })));

      // Second confirm (simulates re-scan and re-confirm)
      const secondData = [
        { name: 'Item B', quantity: 2, price: 5000, total: 10000 },
      ];
      setItems(
        secondData.map((item) => ({ name: item.name, price: item.total, participant: '' })),
      );

      // Should only have the second set of items, not both
      const items = getItems();
      expect(items.length).toBe(1);
      expect(items[0]).toEqual({ name: 'Item B', price: 10000, participant: '' });
    });
  });
});
