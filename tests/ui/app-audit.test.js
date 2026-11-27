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
  // Tap the person's chip in the item's chip row once per unit.
  for (let i = 0; i < qty; i++) {
    const chipRows = qa('#table-assigner tbody tr.chip-row');
    [...chipRows[itemIdx].querySelectorAll('.assign-chip')].find((c) => c.dataset.person === person).click();
  }
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

describe('new split and auto new entry (W1 H2)', () => {
  const deleteItem = () => q('#table-assigner .btn-delete-item').click();
  const removePerson = (i) => qa('.chip-remove')[i].click();
  const hist = loadHistoryRaw;

  const probe = (removeBeforeDelete) => {
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    q('#results .paid-toggle').click();
    if (removeBeforeDelete) {
      removePerson(0);
      deleteItem();
    } else {
      deleteItem();
      removePerson(0);
    }
    addPerson('Budi');
    addItem('Bakso', 15000, 1);
    assign(0, 'Budi', 1);
    q('#calculate').click();
    const entries = hist();
    expect(entries.length).toBe(2);
    const fresh = entries.find((e) => e.items[0].name === 'Bakso');
    const old = entries.find((e) => e.items[0].name === 'Nasi');
    expect(fresh.paid).toEqual({});
    expect(old.paid).toEqual({ Ani: true });
  };

  it('items deleted, then person removed: second bill gets its own entry', () => probe(false));
  it('person removed, then items deleted: second bill gets its own entry', () => probe(true));

  it('Split baru after a fresh saved calculation does not confirm and blanks the editor', () => {
    let asked = 0;
    window.confirm = () => { asked++; return true; };
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    q('#new-split').click();
    expect(asked).toBe(0);
    expect(qa('.chip').length).toBe(0);
    expect(qa('#table-assigner tbody tr[data-item-id]').length).toBe(0);
    expect(cardNames()).toEqual([]);
    expect(q('#export-section').hidden).toBe(true);
    expect(hist().length).toBe(1);
  });

  it('Split baru asks first when the work is unsaved, and keeps it on cancel', () => {
    let asked = 0;
    window.confirm = () => { asked++; return false; };
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    q('#new-split').click();
    expect(asked).toBe(1);
    expect(qa('.chip').length).toBe(1);
  });
});

describe('deleting the open history entry (M6)', () => {
  it('forgets the entry: no ghost on paid toggle, recalculate makes a labelled one', () => {
    addPerson('Ani');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
    q('#calculate').click();
    expect(loadHistoryRaw().length).toBe(1);
    q('#history .history-delete').click();
    expect(loadHistoryRaw().length).toBe(0);
    q('#results .paid-toggle').click();
    expect(loadHistoryRaw().length).toBe(0);
    q('#calculate').click();
    const entries = loadHistoryRaw();
    expect(entries.length).toBe(1);
    expect(entries[0].label).toBeTruthy();
  });
});

describe('draft autosave and restore (W3 M5)', () => {
  const reload = async () => {
    vi.resetModules();
    loadDom();
    const { initApp } = await import('../../src/ui/app.js');
    initApp();
  };
  const twoPeopleOneAssigned = () => {
    addPerson('Ani');
    addPerson('Budi');
    addItem('Nasi', 20000, 1);
    assign(0, 'Ani', 1);
  };

  it('(a) restores people and an assigned item, without results', async () => {
    twoPeopleOneAssigned();
    await reload();
    expect(qa('.chip').length).toBe(2);
    expect(qa('#table-assigner tbody tr[data-item-id]').length).toBe(1);
    expect(q('#calculate-status').className).toContain('status-success');
    expect(cardNames()).toEqual([]);
    expect(q('#export-section').hidden).toBe(true);
  });

  it('(b) after Calculate a reload shows fresh results, no new history write', async () => {
    twoPeopleOneAssigned();
    q('#calculate').click();
    const before = loadHistoryRaw();
    await reload();
    expect(cardNames()).toEqual(['Ani']);
    expect(q('#results .stale-banner')).toBeNull();
    expect(q('.export-share-btn').disabled).toBe(false);
    const after = loadHistoryRaw();
    expect(after.length).toBe(1);
    expect(after[0].updatedAt).toBe(before[0].updatedAt);
    // Recalculating reuses the same entry.
    q('#calculate').click();
    expect(loadHistoryRaw().length).toBe(1);
  });

  it('(b2) a stale draft reloads without results', async () => {
    twoPeopleOneAssigned();
    q('#calculate').click();
    addPerson('Cici');
    await reload();
    expect(qa('.chip').length).toBe(3);
    expect(cardNames()).toEqual([]);
  });

  it('(c) Split baru removes the draft', async () => {
    twoPeopleOneAssigned();
    expect(localStorage.getItem('bagiadil_draft')).not.toBeNull();
    q('#new-split').click();
    expect(localStorage.getItem('bagiadil_draft')).toBeNull();
    await reload();
    expect(qa('.chip').length).toBe(0);
  });

  it('(d) a draft pointing at a deleted entry makes the next calculate save a new one', async () => {
    twoPeopleOneAssigned();
    q('#calculate').click();
    localStorage.removeItem('bagiadil_history');
    await reload();
    expect(cardNames()).toEqual(['Ani']);
    q('#calculate').click();
    const entries = loadHistoryRaw();
    expect(entries.length).toBe(1);
    expect(entries[0].label).toBeTruthy();
  });

  it('(e) a valid share link leaves the draft untouched', async () => {
    twoPeopleOneAssigned();
    const draft = localStorage.getItem('bagiadil_draft');
    const { encodeSnapshot } = await import('../../src/ui/snapshot.js');
    const link = encodeSnapshot({
      participants: ['Zed'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [{ name: 'X', unitPrice: 1000, totalQty: 1, assignments: [{ person: 'Zed', qty: 1 }] }],
    });
    vi.resetModules();
    loadDom();
    location.hash = '#share=' + link;
    const { initApp } = await import('../../src/ui/app.js');
    initApp();
    expect(cardNames()).toEqual(['Zed']);
    expect(localStorage.getItem('bagiadil_draft')).toBe(draft);
  });

  it('discards a draft the engine cannot compute instead of throwing on load', async () => {
    localStorage.setItem('bagiadil_draft', JSON.stringify({
      v: 1,
      snapshot: {
        participants: ['Ani'],
        params: { totalDiscount: 0, totalShipping: 0 },
        items: [{ name: 'X', unitPrice: 1000.5, totalQty: 1, assignments: [{ person: 'Ani', qty: 1 }] }],
      },
      historyId: null,
      paid: {},
      calculated: true,
    }));
    await reload();
    expect(qa('.chip').length).toBe(0);
    expect(localStorage.getItem('bagiadil_draft')).toBeNull();
  });

  it('discards a corrupt draft', async () => {
    localStorage.setItem('bagiadil_draft', JSON.stringify({ v: 1, snapshot: { participants: 'x' } }));
    await reload();
    expect(qa('.chip').length).toBe(0);
    expect(localStorage.getItem('bagiadil_draft')).toBeNull();
  });

  it('restores the raw payment typing', async () => {
    q('#pay-account-name').value = 'Budi ';
    q('#pay-account-name').dispatchEvent(new Event('input'));
    addPerson('Ani');
    await reload();
    expect(q('#pay-account-name').value).toBe('Budi ');
  });
});

describe('clamped discount is shown as applied', () => {
  it('uses the effective discount in the WhatsApp text and shows a notice', async () => {
    const { t } = await import('../../src/i18n/index.js');
    const { formatCurrency } = await import('../../src/engine/formatter.js');
    addPerson('Ani');
    addItem('Nasi', 15000, 1);
    assign(0, 'Ani', 1);
    q('#total-discount').value = '20000';
    q('#total-discount').dispatchEvent(new Event('input'));
    q('#calculate').click();
    const notice = q('#results .discount-clamped-notice');
    expect(notice.textContent).toBe(t('results.discountClamped').replace('{amount}', formatCurrency(15000)));
    expect(notice.textContent).toContain('15.000');

    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (txt) => { copied = txt; } },
      configurable: true,
    });
    q('.export-wa-btn').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(copied).toContain(`${t('export.wa.discount')}: ${formatCurrency(15000)}`);
    expect(copied).not.toContain(formatCurrency(20000));
  });

  it('PDF content carries the same notice', async () => {
    const { buildPdfContent } = await import('../../src/ui/export.js');
    const { splitBill } = await import('../../src/engine/calculator.js');
    const { t } = await import('../../src/i18n/index.js');
    const { formatCurrency } = await import('../../src/engine/formatter.js');
    const result = splitBill({ orders: [{ name: 'Ani', amount: 15000 }], totalDiscount: 20000, totalShipping: 0 });
    const node = buildPdfContent(result, null);
    expect(node.textContent).toContain(t('results.discountClamped').replace('{amount}', formatCurrency(15000)));
  });
});

describe('shared item end to end (feature #2)', () => {
  const cards = () =>
    Object.fromEntries(
      qa('#results .result-card').map((c) => [
        c.querySelector('.result-card-name').textContent,
        c.querySelector('.result-card-final strong').textContent,
      ]),
    );

  it('calculates, saves, reloads and shares a split-evenly item', async () => {
    addPerson('Ani');
    addPerson('Budi');
    addPerson('Cici');
    addItem('Pizza', 10000, 1);
    q('#table-assigner .assign-everyone').click();
    q('#calculate').click();

    const lines = qa('#results .result-card-items li').map((li) => li.textContent);
    expect(lines.filter((l) => l.includes('Pizza (1/3)'))).toHaveLength(3);
    const local = cards();
    expect(Object.keys(local).sort()).toEqual(['Ani', 'Budi', 'Cici']);

    const entry = loadHistoryRaw()[0];
    expect(entry.items[0].split).toBe(true);

    // Reload from history keeps the split.
    q('#new-split').click();
    q('#history .history-load').click();
    expect(cards()).toEqual(local);
    expect(q('#table-assigner .assign-split-toggle').getAttribute('aria-pressed')).toBe('true');

    // The share link renders the same amounts.
    const { encodeSnapshot } = await import('../../src/ui/snapshot.js');
    const link = encodeSnapshot(entry);
    vi.resetModules();
    loadDom();
    location.hash = '#share=' + link;
    const { initApp } = await import('../../src/ui/app.js');
    initApp();
    expect(cards()).toEqual(local);
    location.hash = '';
  });
});
