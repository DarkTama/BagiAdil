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

describe('results proof and rounding (feature #3)', () => {
  it('reconciles food - discount + shipping to the total and sums the payments', async () => {
    const { splitBill } = await import('../../src/engine/calculator.js');
    const { formatCurrency } = await import('../../src/engine/formatter.js');
    const params = { totalDiscount: 10000, totalShipping: 10000 };
    const result = splitBill({
      orders: [{ name: 'A', amount: 25000 }, { name: 'B', amount: 35000 }, { name: 'C', amount: 15000 }],
      ...params,
    });
    const el = document.createElement('div');
    renderResults(result, el, null, { params });
    const lines = [...el.querySelectorAll('.result-proof-line')].map((n) => n.textContent);
    expect(lines[0]).toContain(`${formatCurrency(75000)} − `);
    expect(lines[0]).toContain(`${formatCurrency(10000)} + `);
    expect(lines[0]).toMatch(new RegExp(`= ${formatCurrency(75000)}$`));
    expect(lines[1]).toMatch(new RegExp(`= ${formatCurrency(75000)} ✓$`));

    // Every shown rounding line equals final - pre-rounding (as displayed).
    el.querySelectorAll('.result-card').forEach((card, i) => {
      const p = result.participants[i];
      const delta = Number(p.finalPayment) - Math.round(Number(p.preRoundingTotal));
      const line = card.querySelector('.result-card-rounding');
      if (delta === 0) expect(line).toBeNull();
      else expect(line.textContent).toContain(`${delta < 0 ? '−' : '+'}${formatCurrency(Math.abs(delta))}`);
    });
    expect(el.querySelectorAll('.result-card-rounding').length).toBeGreaterThan(0);
  });

  it('omits the proof when params are unknown', () => {
    const el = document.createElement('div');
    renderResults({ ...base, verification: { balanced: true } }, el);
    expect(el.querySelector('.result-proof')).toBeNull();
  });
});
