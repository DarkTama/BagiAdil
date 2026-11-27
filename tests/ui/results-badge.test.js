// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderResults } from '../../src/ui/results.js';

const base = {
  participants: [],
  grandTotal: 0,
};

describe('results balance badge (audit L4)', () => {
  it('is hidden when balanced and shown as a warning when not', () => {
    const el = document.createElement('div');
    renderResults({ ...base, verification: { balanced: true } }, el);
    expect(el.querySelector('.badge')).toBeNull();

    renderResults({ ...base, verification: { balanced: false } }, el);
    expect(el.querySelector('.badge-warning')).not.toBeNull();
  });

  it('renders the item list without bullets', () => {
    const el = document.createElement('div');
    const p = { name: 'A', originalOrder: 1, discount: 0, discountedOrder: 1, shippingShare: 0, preRoundingTotal: 1, finalPayment: 1 };
    renderResults({ participants: [p], grandTotal: 1, verification: { balanced: true } }, el, {
      A: [{ name: 'Nasi', qty: 1, unitPrice: 1, price: 1 }],
    });
    expect(el.querySelector('ul.result-card-items')).not.toBeNull();
  });
});
