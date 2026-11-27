// @vitest-environment jsdom
// App-level regression tests for audit findings (drive the real DOM via initApp).
/* global HTMLElement, Storage */

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
  q('#participants .participants-add').click();
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
const loadHistoryRaw = () => JSON.parse(localStorage.getItem('bagiadil_history') || '[]');
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

describe('history Share link keeps payment (audit H3b)', () => {
  it('includes the payment saved with the entry', async () => {
    q('#pay-bank').value = 'BCA';
    q('#pay-account-number').value = '111';
    q('#pay-bank').dispatchEvent(new Event('input'));
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();

    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (txt) => { copied = txt; } },
      configurable: true,
    });
    q('#history .history-share').click();
    await new Promise((r) => setTimeout(r, 10));
    const { decodeSnapshot } = await import('../../src/ui/snapshot.js');
    expect(decodeSnapshot(copied.split('#share=')[1]).payment).toEqual({
      bank: 'BCA',
      accountNumber: '111',
      accountName: '',
    });
  });
});

describe('shared view matches the host screen (audit H1 rounding order)', () => {
  it('bills the rounding extra to the same person after encode/decode', async () => {
    addPerson('Ani');
    addPerson('Budi');
    addItem('Ayam', 10040, 1);
    addItem('Bakso', 10040, 1);
    assign(0, 'Budi', 1); // first item -> Budi
    assign(1, 'Ani', 1);
    q('#calculate').click();
    const local = Object.fromEntries(
      qa('#results .result-card').map((c) => [
        c.querySelector('.result-card-name').textContent,
        c.querySelector('.result-card-final strong').textContent,
      ]),
    );
    const entry = JSON.parse(localStorage.getItem('bagiadil_history'))[0];
    const { computeSplit, encodeSnapshot, decodeSnapshot } = await import('../../src/ui/snapshot.js');
    const { formatCurrency } = await import('../../src/engine/formatter.js');
    const shared = Object.fromEntries(
      computeSplit(decodeSnapshot(encodeSnapshot(entry))).result.participants.map((p) => [
        p.name,
        formatCurrency(p.finalPayment),
      ]),
    );
    expect(shared).toEqual(local);
  });
});

describe('item names are not HTML (audit XSS)', () => {
  it('renders a fully-assigned item name as text', () => {
    addPerson('Ani');
    addItem('<img src=x id=pwn>', 1000, 1);
    assign(0, 'Ani', 1);
    expect(document.getElementById('pwn')).toBeNull();
    expect(q('#table-assigner .td-item-name').textContent).toContain('<img src=x id=pwn>');
  });
});

describe('Calculate goes through computeSplit (L4, M7)', () => {
  it('toasts when every subtotal is Rp 0 and renders no result cards', async () => {
    const { t } = await import('../../src/i18n/index.js');
    addPerson('Ani');
    addItem('Gratis', 0, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    expect(qa('#results .result-card').length).toBe(0);
    expect(qa('.toast').map((e) => e.textContent)).toContain(t('validation.noPayable'));
    expect(loadHistoryRaw()).toEqual([]);
  });

  it('toasts history.saveFailed when the history write throws, results still show', async () => {
    const { t } = await import('../../src/i18n/index.js');
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'bagiadil_history') throw new Error('QuotaExceededError');
      return orig.call(this, k, v);
    };
    try {
      addPerson('Ani');
      addItem('Nasi', 20000, 1);
      assign(0, 'Ani', 1);
      q('#calculate').click();
    } finally {
      Storage.prototype.setItem = orig;
    }
    expect(cardNames()).toEqual(['Ani']);
    expect(qa('.toast--error').map((e) => e.textContent)).toContain(t('history.saveFailed'));
  });
});

describe('broken share link (F7)', () => {
  it('opens the normal editor with a toast and clears the hash', async () => {
    const { encodeSnapshot } = await import('../../src/ui/snapshot.js');
    const { t } = await import('../../src/i18n/index.js');
    const valid = encodeSnapshot({
      participants: ['Ani'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [{ name: 'Nasi', unitPrice: 20000, totalQty: 1, assignments: [{ person: 'Ani', qty: 1 }] }],
    });
    vi.resetModules();
    loadDom();
    location.hash = '#share=' + valid.slice(0, 20);
    const { initApp } = await import('../../src/ui/app.js');
    initApp();
    expect(q('#participants')).not.toBeNull();
    expect(q('#manual-section').style.display).not.toBe('none');
    expect(qa('.toast').map((e) => e.textContent)).toContain(t('share.invalid'));
    expect(location.hash).toBe('');
  });
});

describe('loading history is read-only (Q6) and applies people before items', () => {
  it('does not re-save the entry and restores people that differ from the editor', async () => {
    addPerson('Ani');
    addPerson('Budi');
    addItem('Nasi', 20000, 2);
    assign(0, 'Ani', 1);
    assign(0, 'Budi', 1);
    q('#calculate').click();
    const before = loadHistoryRaw();
    expect(before.length).toBe(1);

    // Editor now holds different people and items.
    qa('.chip-remove').forEach((b) => b.click());
    addPerson('Cici');
    addItem('Teh', 5000, 1);

    q('#history .history-load').click();
    expect(cardNames().sort()).toEqual(['Ani', 'Budi']);
    expect(qa('#table-assigner tbody tr[data-item-id]').length).toBe(1);
    const after = loadHistoryRaw();
    expect(after.length).toBe(1);
    expect(after[0].updatedAt).toBe(before[0].updatedAt);
  });
});

describe('payment lives in the session (L10)', () => {
  const type = (sel, v) => {
    q(sel).value = v;
    q(sel).dispatchEvent(new Event('input'));
  };

  it('loading an entry shows its payment without overwriting the saved default', () => {
    type('#pay-bank', 'BCA');
    type('#pay-account-number', '111');
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    // Pretend the stored entry came from another host.
    const hist = JSON.parse(localStorage.getItem('bagiadil_history'));
    hist[0].payment = { bank: 'Mandiri', accountNumber: '999', accountName: '' };
    localStorage.setItem('bagiadil_history', JSON.stringify(hist));
    q('.lang-btn:not(.active)').click(); // re-renders the history list from storage
    q('#history .history-load').click();
    expect(q('#pay-account-number').value).toBe('999');
    expect(q('#pay-bank').value).toBe('Mandiri');
    expect(JSON.parse(localStorage.getItem('bagiadil_payment')).accountNumber).toBe('111');
    expect(q('#results .payment-account-text').textContent).toContain('999');
    // Typing again becomes the new default.
    type('#pay-account-number', '555');
    expect(JSON.parse(localStorage.getItem('bagiadil_payment')).accountNumber).toBe('555');
  });

  it('keeps raw typing (trailing space) intact in the input', () => {
    type('#pay-account-name', 'Budi ');
    expect(q('#pay-account-name').value).toBe('Budi ');
  });
});

describe('stale results (W3 H4)', () => {
  const setup2 = () => {
    addPerson('Ani');
    addPerson('Budi');
    addItem('Nasi', 20000, 1);
    addItem('Teh', 5000, 1);
    assign(0, 'Ani', 1);
    assign(1, 'Budi', 1);
    q('#calculate').click();
  };
  const shareDisabled = () => q('.export-share-btn').disabled;

  it('removing a participant marks results stale and disables export; recalc clears it', () => {
    setup2();
    expect(q('#results .stale-banner')).toBeNull();
    expect(shareDisabled()).toBe(false);
    qa('.chip-remove')[1].click(); // remove Budi, Teh goes back to remaining
    expect(q('#results .stale-banner')).not.toBeNull();
    expect(q('#results').classList.contains('is-stale')).toBe(true);
    expect(shareDisabled()).toBe(true);
    expect(q('.export-wa-btn').disabled).toBe(true);
    expect(q('.export-pdf-btn').disabled).toBe(true);
    assign(1, 'Ani', 1);
    q('#calculate').click();
    expect(q('#results .stale-banner')).toBeNull();
    expect(q('#results').classList.contains('is-stale')).toBe(false);
    expect(shareDisabled()).toBe(false);
  });

  it('editing payment after calculate is not stale', () => {
    setup2();
    q('#pay-bank').value = 'BCA';
    q('#pay-bank').dispatchEvent(new Event('input'));
    expect(q('#results .stale-banner')).toBeNull();
    expect(shareDisabled()).toBe(false);
  });

  it('reverting an edit clears the banner', () => {
    setup2();
    const d = q('#total-discount');
    d.value = '5000';
    d.dispatchEvent(new Event('input'));
    expect(q('#results .stale-banner')).not.toBeNull();
    d.value = '';
    d.dispatchEvent(new Event('input'));
    expect(q('#results .stale-banner')).toBeNull();
    expect(shareDisabled()).toBe(false);
  });

  it('paid toggles stay available while stale and are not a stale trigger', () => {
    setup2();
    q('#results .paid-toggle').click();
    expect(q('#results .stale-banner')).toBeNull();
    q('#total-shipping').value = '3000';
    q('#total-shipping').dispatchEvent(new Event('input'));
    expect(q('#results .stale-banner')).not.toBeNull();
    expect(q('#results .paid-toggle').disabled).toBe(false);
  });
});
