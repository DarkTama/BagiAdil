// @vitest-environment jsdom
// App-level regression tests for audit findings (drive the real DOM via initApp).
/* global HTMLElement */

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

function loadDom() {
  const html = fs.readFileSync('index.html', 'utf8');
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
  HTMLElement.prototype.scrollIntoView = () => {};
  window.confirm = () => true;
  window.prompt = () => 'Grp';
}
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const addPerson = (n) => {
  q('#participant-name').value = n;
  q('#participants .btn-primary').click();
};
const addItem = (name, price, qty) => {
  const f = q('#add-item-form .section-content');
  f.querySelector('.add-item-name').value = name;
  const p = f.querySelector('.add-item-price');
  p.value = String(price);
  p.dispatchEvent(new Event('input'));
  f.querySelector('.add-item-qty').value = String(qty);
  f.querySelector('.btn-add-item').click();
};
const assign = (itemIdx, person, qty) => {
  const rows = qa('#table-assigner tbody tr[data-item-id]');
  rows[itemIdx].querySelector('.btn-assign').click();
  const pop = q('.assign-popup');
  pop.querySelector('select').value = person;
  pop.querySelector('.popup-qty-input').value = String(qty);
  pop.querySelector('.btn-popup-confirm').click();
};
const cardNames = () => qa('#results .result-card .result-card-name').map((e) => e.textContent);

beforeEach(async () => {
  localStorage.clear();
  location.hash = '';
  vi.resetModules();
  loadDom();
  const { initApp } = await import('../../src/ui/app.js');
  initApp();
});

describe('removed participant (audit H1)', () => {
  it('drops the removed person from results and returns their items to remaining', () => {
    addPerson('Ani');
    addPerson('Budi');
    addPerson('Cici');
    addItem('Nasi', 20000, 1);
    addItem('Teh', 5000, 1);
    assign(0, 'Ani', 1);
    assign(1, 'Cici', 1);
    qa('.chip-remove')[2].click(); // remove Cici
    // Teh is unassigned again, so Calculate must refuse.
    q('#calculate').click();
    expect(qa('#results .result-card').length).toBe(0);
    expect(q('#calculate-status').textContent).toMatch(/1/);
    assign(1, 'Budi', 1); // Teh is back to remaining
    q('#calculate').click();
    expect(cardNames().sort()).toEqual(['Ani', 'Budi']);
  });

  it('keeps assignments intact when loading a history entry', () => {
    addPerson('Ani');
    addPerson('Budi');
    addItem('Nasi', 20000, 2);
    assign(0, 'Ani', 1);
    assign(0, 'Budi', 1);
    q('#calculate').click();
    // Wipe the editor state, then load the saved entry back.
    qa('.chip-remove').forEach((b) => b.click());
    q('#history .history-load').click();
    expect(cardNames().sort()).toEqual(['Ani', 'Budi']);
    expect(q('#calculate-status').className).toContain('status-success');
  });
});

describe('payment box persists across re-renders (audit C1)', () => {
  const setup = () => {
    q('#pay-bank').value = 'BCA';
    q('#pay-account-number').value = '111';
    q('#pay-bank').dispatchEvent(new Event('input'));
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    expect(q('#results .payment-info-box')).not.toBeNull();
  };

  it('keeps the payment box after marking someone paid', () => {
    setup();
    q('#results .paid-toggle').click();
    expect(q('#results .payment-info-box')).not.toBeNull();
  });

  it('keeps the payment box after a language switch', () => {
    setup();
    q('.lang-btn:not(.active)').click();
    expect(q('#results .payment-info-box')).not.toBeNull();
  });
});

describe('share link uses live payment info (audit H3)', () => {
  it('link payment matches what was edited after Calculate and the WhatsApp text', async () => {
    q('#pay-bank').value = 'BCA';
    q('#pay-account-number').value = '111';
    q('#pay-bank').dispatchEvent(new Event('input'));
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    q('#pay-account-number').value = '999';
    q('#pay-account-number').dispatchEvent(new Event('input'));

    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (txt) => { copied = txt; } },
      configurable: true,
    });
    const { decodeSnapshot } = await import('../../src/ui/snapshot.js');

    q('.export-share-btn').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(decodeSnapshot(copied.split('#share=')[1]).payment.accountNumber).toBe('999');

    q('.export-wa-btn').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(copied).toContain('999');
    const waLink = copied.match(/#share=(\S+)/)[1];
    expect(decodeSnapshot(waLink).payment.accountNumber).toBe('999');
  });
});
