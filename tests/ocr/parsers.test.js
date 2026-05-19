import { describe, it, expect } from 'vitest';
import { parseGoFoodReceipt } from '../../src/ocr/parsers/gofood.js';
import { parseShopeeReceipt } from '../../src/ocr/parsers/shopeefood.js';
import { parseGrabReceipt } from '../../src/ocr/parsers/grabfood.js';
import { detectPlatform, parseReceipt } from '../../src/ocr/parsers/index.js';

describe('GoFood receipt parser', () => {
  it('extracts items with "1x Item Name  Price" format', () => {
    const text = `GoFood
1x Nasi Goreng Spesial  Rp 25.000
2x Es Teh Manis  Rp 5.000
Subtotal  Rp 35.000
Diskon  Rp 10.000
Ongkos Kirim  Rp 8.000`;

    const result = parseGoFoodReceipt(text);

    expect(result.platform).toBe('gofood');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Nasi Goreng Spesial');
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].price).toBe(25000);
    expect(result.items[0].total).toBe(25000);
    expect(result.items[1].name).toBe('Es Teh Manis');
    expect(result.items[1].quantity).toBe(2);
    expect(result.items[1].price).toBe(5000);
    expect(result.items[1].total).toBe(10000);
    expect(result.subtotal).toBe(35000);
    expect(result.discount).toBe(10000);
    expect(result.deliveryFee).toBe(8000);
  });

  it('extracts items with "Item Name\\n  Qty x Price" format', () => {
    const text = `GoFood
Ayam Geprek
1 x Rp 18.000
Mie Goreng
2 x Rp 15.000
Total Harga  Rp 48.000
Promo  Rp 5.000
Biaya Pengiriman  Rp 12.000`;

    const result = parseGoFoodReceipt(text);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Ayam Geprek');
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].price).toBe(18000);
    expect(result.items[1].name).toBe('Mie Goreng');
    expect(result.items[1].quantity).toBe(2);
    expect(result.items[1].price).toBe(15000);
    expect(result.subtotal).toBe(48000);
    expect(result.discount).toBe(5000);
    expect(result.deliveryFee).toBe(12000);
  });

  it('handles prices without dots (plain number)', () => {
    const text = `GoFood
1x Bakso  Rp25000
Subtotal  Rp25000
Ongkos Kirim  Rp7000`;

    const result = parseGoFoodReceipt(text);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].price).toBe(25000);
    expect(result.subtotal).toBe(25000);
    expect(result.deliveryFee).toBe(7000);
  });

  it('handles prices with comma separator', () => {
    const text = `GoFood
1x Sate Ayam  Rp 30,000
Subtotal  Rp 30,000`;

    const result = parseGoFoodReceipt(text);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].price).toBe(30000);
  });

  it('returns empty items for unparseable text', () => {
    const text = `Some random text
that does not look like a receipt`;

    const result = parseGoFoodReceipt(text);

    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBe(0);
    expect(result.platform).toBe('gofood');
  });
});

describe('ShopeeFood receipt parser', () => {
  it('extracts items with "Item Name  xQty  Price" format', () => {
    const text = `ShopeeFood Order
Nasi Padang  x2  Rp 28.000
Teh Botol  x3  Rp 5.000
Subtotal  Rp 71.000
Voucher  Rp 15.000
Ongkir  Rp 9.000`;

    const result = parseShopeeReceipt(text);

    expect(result.platform).toBe('shopeefood');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Nasi Padang');
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].price).toBe(28000);
    expect(result.items[0].total).toBe(56000);
    expect(result.items[1].name).toBe('Teh Botol');
    expect(result.items[1].quantity).toBe(3);
    expect(result.items[1].price).toBe(5000);
    expect(result.items[1].total).toBe(15000);
    expect(result.subtotal).toBe(71000);
    expect(result.discount).toBe(15000);
    expect(result.deliveryFee).toBe(9000);
  });

  it('extracts items with implied qty 1 and Rp prefix', () => {
    const text = `Shopee Food
Burger Keju  Rp 35.000
Kentang Goreng  Rp 18.000
Subtotal  Rp 53.000
Diskon ShopeeFood  Rp 8.000
Biaya Kirim  Rp 6.000`;

    const result = parseShopeeReceipt(text);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Burger Keju');
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].price).toBe(35000);
    expect(result.items[1].name).toBe('Kentang Goreng');
    expect(result.items[1].quantity).toBe(1);
    expect(result.items[1].price).toBe(18000);
    expect(result.subtotal).toBe(53000);
    expect(result.discount).toBe(8000);
    expect(result.deliveryFee).toBe(6000);
  });

  it('returns empty items for malformed text', () => {
    const text = `Random text with no structure`;

    const result = parseShopeeReceipt(text);

    expect(result.items).toHaveLength(0);
    expect(result.platform).toBe('shopeefood');
  });
});

describe('GrabFood receipt parser', () => {
  it('extracts items with "Qty x Item Name  Price" format', () => {
    const text = `GrabFood
2 x Rendang  Rp 45.000
1 x Es Jeruk  Rp 8.000
Subtotal  Rp 98.000
Promo  Rp 20.000
Delivery Fee  Rp 10.000`;

    const result = parseGrabReceipt(text);

    expect(result.platform).toBe('grabfood');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Rendang');
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].price).toBe(45000);
    expect(result.items[0].total).toBe(90000);
    expect(result.items[1].name).toBe('Es Jeruk');
    expect(result.items[1].quantity).toBe(1);
    expect(result.items[1].price).toBe(8000);
    expect(result.items[1].total).toBe(8000);
    expect(result.subtotal).toBe(98000);
    expect(result.discount).toBe(20000);
    expect(result.deliveryFee).toBe(10000);
  });

  it('extracts items with "Item Name\\nRp XX.XXX" format', () => {
    const text = `GrabFood Order
Nasi Uduk
Rp 15.000
Soto Ayam
Rp 22.000
Subtotal  Rp 37.000
GrabFood Discount  Rp 7.000
Biaya Antar  Rp 11.000`;

    const result = parseGrabReceipt(text);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Nasi Uduk');
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].price).toBe(15000);
    expect(result.items[1].name).toBe('Soto Ayam');
    expect(result.items[1].quantity).toBe(1);
    expect(result.items[1].price).toBe(22000);
    expect(result.subtotal).toBe(37000);
    expect(result.discount).toBe(7000);
    expect(result.deliveryFee).toBe(11000);
  });

  it('handles partial receipts gracefully', () => {
    const text = `GrabFood
1 x Mystery Item  Rp 12.000`;

    const result = parseGrabReceipt(text);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Mystery Item');
    expect(result.subtotal).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.deliveryFee).toBe(0);
  });
});

describe('Platform auto-detection', () => {
  it('detects GoFood from text', () => {
    expect(detectPlatform('Your GoFood order is ready')).toBe('gofood');
    expect(detectPlatform('Order from Go-Food')).toBe('gofood');
    expect(detectPlatform('GO FOOD receipt')).toBe('gofood');
  });

  it('detects ShopeeFood from text', () => {
    expect(detectPlatform('ShopeeFood delivery')).toBe('shopeefood');
    expect(detectPlatform('Ordered via Shopee Food')).toBe('shopeefood');
    expect(detectPlatform('Thanks for using Shopee')).toBe('shopeefood');
  });

  it('detects GrabFood from text', () => {
    expect(detectPlatform('GrabFood order summary')).toBe('grabfood');
    expect(detectPlatform('Your Grab Food receipt')).toBe('grabfood');
    expect(detectPlatform('Ordered with Grab')).toBe('grabfood');
  });

  it('returns unknown for unrecognized text', () => {
    expect(detectPlatform('Random restaurant receipt')).toBe('unknown');
    expect(detectPlatform('')).toBe('unknown');
  });
});

describe('parseReceipt with auto-detection', () => {
  it('routes to GoFood parser when GoFood detected', () => {
    const text = `GoFood
1x Nasi Goreng  Rp 20.000
Subtotal  Rp 20.000`;

    const result = parseReceipt(text);
    expect(result.platform).toBe('gofood');
    expect(result.items).toHaveLength(1);
  });

  it('routes to ShopeeFood parser when ShopeeFood detected', () => {
    const text = `ShopeeFood
Ayam Bakar  x1  Rp 30.000
Subtotal  Rp 30.000`;

    const result = parseReceipt(text);
    expect(result.platform).toBe('shopeefood');
    expect(result.items).toHaveLength(1);
  });

  it('uses explicit platform override', () => {
    const text = `Some receipt
1 x Nasi Goreng  Rp 20.000`;

    const result = parseReceipt(text, 'grabfood');
    expect(result.platform).toBe('grabfood');
  });

  it('returns error for unknown platform', () => {
    const text = `Unknown receipt format`;
    const result = parseReceipt(text);
    expect(result.error).toBeDefined();
  });
});
