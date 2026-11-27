// @vitest-environment jsdom
/* global HTMLElement */

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';

const ALLOWED_ORIGIN = 'https://darktama.github.io';

function loadDom() {
  const html = fs.readFileSync('index.html', 'utf8');
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
  HTMLElement.prototype.scrollIntoView = () => {};
  window.confirm = () => true;
}

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];

function encodeMigrate(payload) {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

function makeHistoryEntry(id, updatedAt, label = 'Lunch') {
  return {
    id,
    label,
    createdAt: 1000,
    updatedAt,
    participants: ['Ani', 'Budi'],
    params: { totalDiscount: 0, totalShipping: 5000 },
    items: [
      {
        name: 'Nasi Goreng',
        unitPrice: 25000,
        totalQty: 2,
        assignments: [
          { person: 'Ani', qty: 1 },
          { person: 'Budi', qty: 1 },
        ],
      },
    ],
    paid: { Ani: true },
    payment: { bank: 'BCA', accountNumber: '12345', accountName: 'Ani' },
  };
}

async function bootApp(hash = '', referrer = `${ALLOWED_ORIGIN}/BagiAdil/`) {
  vi.resetModules();
  loadDom();
  setReferrer(referrer);
  window.history.replaceState(null, '', '/' + (hash ? `#${hash}` : ''));
  const { initApp } = await import('../../src/ui/app.js');
  initApp();
}

beforeEach(() => {
  localStorage.clear();
  setReferrer('');
  window.history.replaceState(null, '', '/');
});

describe('origin migration import', () => {
  it('imports allowed keys into empty storage when referrer and payload.from match, cleans URL, shows move banner, and renders history without receipts', async () => {
    const entry1 = makeHistoryEntry('h1', 2000, 'Dinner');
    const entry2 = makeHistoryEntry('h2', 3000, 'Coffee');
    const payload = {
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_history: JSON.stringify([entry1, entry2]),
        bagiadil_groups: JSON.stringify([{ name: 'Kantor', members: ['Ani', 'Budi'] }]),
        bagiadil_participants: JSON.stringify(['Ani', 'Budi', 'Cici']),
        bagiadil_payment: JSON.stringify({
          bank: 'GoPay',
          accountNumber: '0812',
          accountName: 'Ani',
        }),
        'bagiadil-lang': 'en',
        bagiadil_guide_seen: '1',
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`);

    // URL cleaned
    expect(location.hash).toBe('');

    // Banner shown in imported locale (en), no success toast
    expect(q('.toast.toast--success')).toBeNull();
    const banner = q('.migration-banner[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('.migration-notice-text').textContent).toBe(
      'BagiAdil now lives at bagiadil.darktama.dev. Your data from the old address has been moved. Bookmark the new address!',
    );
    expect(banner.querySelector('.migration-notice-text strong')?.textContent).toBe(
      'bagiadil.darktama.dev',
    );
    const closeBtn = banner.querySelector('.migration-notice-close');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.getAttribute('aria-label')).toBeTruthy();

    // Guide was marked seen before initGuide ran, so no modal popped up
    expect(q('.guide-modal')).toBeNull();

    // Locale switched to en
    expect(localStorage.getItem('bagiadil-lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    // Payment, participants, groups persisted
    expect(JSON.parse(localStorage.getItem('bagiadil_payment')).bank).toBe('GoPay');
    expect(JSON.parse(localStorage.getItem('bagiadil_participants'))).toEqual([
      'Ani',
      'Budi',
      'Cici',
    ]);
    expect(JSON.parse(localStorage.getItem('bagiadil_groups'))).toEqual([
      { name: 'Kantor', members: ['Ani', 'Budi'] },
    ]);

    // History entries render even with no receipt in IndexedDB, and opening works
    const rows = qa('#history .history-entry');
    expect(rows.length).toBe(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(qa('#history .history-receipt').length).toBe(0);

    rows[0].querySelector('.history-load').click();
    expect(qa('#results .result-card').length).toBe(2);
  });

  it('rejects valid payload when document.referrer is empty (nothing written, no toast, URL cleaned)', async () => {
    const payload = {
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_payment: JSON.stringify({ bank: 'EVIL', accountNumber: '666', accountName: 'X' }),
        bagiadil_participants: JSON.stringify(['Victim']),
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`, '');

    // Crafted #migrate= without bridge referrer: no toast, no banner, nothing written
    expect(location.hash).toBe('');
    expect(q('.toast')).toBeNull();
    expect(q('.migration-banner')).toBeNull();
    expect(localStorage.getItem('bagiadil_payment')).toBeNull();
    expect(localStorage.getItem('bagiadil_participants')).toBeNull();
  });

  it('rejects valid payload when document.referrer is from another origin', async () => {
    const payload = {
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_payment: JSON.stringify({ bank: 'EVIL', accountNumber: '666', accountName: 'X' }),
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`, 'https://evil.example/phish.html');

    expect(location.hash).toBe('');
    expect(q('.toast')).toBeNull();
    expect(localStorage.getItem('bagiadil_payment')).toBeNull();
  });

  it('rejects valid payload when referrer matches but payload.from mismatches', async () => {
    const payload = {
      v: 1,
      from: 'https://evil.example',
      at: 1700000000000,
      data: {
        bagiadil_payment: JSON.stringify({ bank: 'EVIL', accountNumber: '666', accountName: 'X' }),
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`, `${ALLOWED_ORIGIN}/BagiAdil/`);

    expect(location.hash).toBe('');
    expect(q('.toast')).toBeNull();
    expect(localStorage.getItem('bagiadil_payment')).toBeNull();
  });

  it('does not write unknown bagiadil_whatever or bagiadil_history_corrupt keys', async () => {
    const payload = {
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_participants: JSON.stringify(['Ani']),
        bagiadil_whatever: 'should-not-exist',
        bagiadil_history_corrupt: '[{"bad"',
        bagiadil_migrated: '2026-11-27T00:00:00.000Z',
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`);

    expect(JSON.parse(localStorage.getItem('bagiadil_participants'))).toEqual(['Ani']);
    expect(localStorage.getItem('bagiadil_whatever')).toBeNull();
    expect(localStorage.getItem('bagiadil_history_corrupt')).toBeNull();
    expect(localStorage.getItem('bagiadil_migrated')).toBeNull();
  });

  it('merges history (newer updatedAt wins + 50-entry cap), groups, participants, and preserves existing singletons', async () => {
    // Seed existing data on the new origin
    const existingNewer = makeHistoryEntry('shared-id', 5000, 'NewOriginVersion');
    const existingOlder = makeHistoryEntry('override-id', 1000, 'StaleOriginVersion');
    const filler = Array.from({ length: 49 }, (_, i) =>
      makeHistoryEntry(`fill-${i}`, 2000 + i, `Fill ${i}`),
    );
    localStorage.setItem(
      'bagiadil_history',
      JSON.stringify([existingNewer, existingOlder, ...filler]),
    );
    localStorage.setItem(
      'bagiadil_groups',
      JSON.stringify([{ name: 'Kantor', members: ['NewMember'] }]),
    );
    localStorage.setItem('bagiadil_participants', JSON.stringify(['Ani', 'Budi']));
    localStorage.setItem(
      'bagiadil_payment',
      JSON.stringify({ bank: 'Mandiri', accountNumber: '999', accountName: 'New' }),
    );
    localStorage.setItem('bagiadil-lang', 'id');
    localStorage.setItem('bagiadil_guide_seen', '1');

    const incomingOlder = makeHistoryEntry('shared-id', 3000, 'OldOriginOlder');
    const incomingNewer = makeHistoryEntry('override-id', 9000, 'OldOriginNewer');
    const incomingBrandNew = makeHistoryEntry('brand-new', 9500, 'BrandNew');

    const incomingDraft = {
      v: 1,
      snapshot: {
        participants: ['Ani'],
        params: { totalDiscount: 0, totalShipping: 0 },
        items: [],
      },
      historyId: null,
      paid: {},
      calculated: false,
    };

    const payload = {
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_history: JSON.stringify([incomingOlder, incomingNewer, incomingBrandNew]),
        bagiadil_groups: JSON.stringify([
          { name: 'kantor', members: ['OldMember'] },
          { name: 'Kuliah', members: ['Dodi'] },
        ]),
        bagiadil_participants: JSON.stringify(['ani', 'Cici']),
        bagiadil_payment: JSON.stringify({ bank: 'BCA', accountNumber: '111', accountName: 'Old' }),
        'bagiadil-lang': 'en',
        bagiadil_draft: JSON.stringify(incomingDraft),
      },
    };

    await bootApp(`migrate=${encodeMigrate(payload)}`);

    // History: 50-entry cap enforced, newer wins on conflict
    const history = JSON.parse(localStorage.getItem('bagiadil_history'));
    expect(history.length).toBe(50);
    expect(history.find((e) => e.id === 'shared-id').label).toBe('NewOriginVersion');
    expect(history.find((e) => e.id === 'override-id').label).toBe('OldOriginNewer');
    expect(history.find((e) => e.id === 'brand-new').label).toBe('BrandNew');

    // Groups: existing 'Kantor' won, 'Kuliah' added
    const groups = JSON.parse(localStorage.getItem('bagiadil_groups'));
    expect(groups).toEqual([
      { name: 'Kantor', members: ['NewMember'] },
      { name: 'Kuliah', members: ['Dodi'] },
    ]);

    // Participants: case-insensitive union
    expect(JSON.parse(localStorage.getItem('bagiadil_participants'))).toEqual([
      'Ani',
      'Budi',
      'Cici',
    ]);

    // Singletons: existing preserved, absent draft copied & restored
    expect(JSON.parse(localStorage.getItem('bagiadil_payment')).bank).toBe('Mandiri');
    expect(localStorage.getItem('bagiadil-lang')).toBe('id');
    expect(JSON.parse(localStorage.getItem('bagiadil_draft')).snapshot.participants).toEqual([
      'Ani',
    ]);
    expect(qa('#participants .chip').map((c) => c.firstChild.textContent.trim())).toContain('Ani');
  });

  it('does not overwrite an existing draft on the new origin', async () => {
    const existingDraft = {
      v: 1,
      snapshot: {
        participants: ['KeepMe'],
        params: { totalDiscount: 0, totalShipping: 0 },
        items: [],
      },
      historyId: null,
      paid: {},
      calculated: false,
    };
    const incomingDraft = {
      v: 1,
      snapshot: {
        participants: ['OldOriginDraft'],
        params: { totalDiscount: 0, totalShipping: 0 },
        items: [],
      },
      historyId: null,
      paid: {},
      calculated: false,
    };
    localStorage.setItem('bagiadil_draft', JSON.stringify(existingDraft));

    await bootApp(
      `migrate=${encodeMigrate({
        v: 1,
        from: ALLOWED_ORIGIN,
        data: { bagiadil_draft: JSON.stringify(incomingDraft) },
      })}`,
    );

    expect(JSON.parse(localStorage.getItem('bagiadil_draft')).snapshot.participants).toEqual([
      'KeepMe',
    ]);
  });

  it.each([
    ['corrupt compressed string', 'not-valid-lz!!!'],
    [
      'wrong version',
      encodeMigrate({ v: 2, from: ALLOWED_ORIGIN, data: { bagiadil_participants: '["A"]' } }),
    ],
    ['non-object data', encodeMigrate({ v: 1, from: ALLOWED_ORIGIN, data: ['nope'] })],
    [
      'disallowed key prefix',
      encodeMigrate({ v: 1, from: ALLOWED_ORIGIN, data: { evil_key: '1' } }),
    ],
    [
      'non-string value',
      encodeMigrate({ v: 1, from: ALLOWED_ORIGIN, data: { bagiadil_participants: ['Ani'] } }),
    ],
  ])(
    'ignores malformed payload (%s) from bridge referrer, warns with toast, and writes nothing',
    async (_label, encoded) => {
      await bootApp(`migrate=${encoded}`);

      expect(location.hash).toBe('');
      const toast = q('.toast.toast--warning');
      expect(toast).toBeTruthy();
      expect(localStorage.getItem('bagiadil_participants')).toBeNull();
      expect(localStorage.getItem('bagiadil_history')).toBeNull();
      expect(localStorage.getItem('evil_key')).toBeNull();
    },
  );

  it('imports data AND shows the shared view when both share= and migrate= are present', async () => {
    const { encodeSnapshot } = await import('../../src/ui/snapshot.js');
    const shareEncoded = encodeSnapshot({
      participants: ['Zed'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        { name: 'Soto', unitPrice: 20000, totalQty: 1, assignments: [{ person: 'Zed', qty: 1 }] },
      ],
    });
    const migrateEncoded = encodeMigrate({
      v: 1,
      from: ALLOWED_ORIGIN,
      at: 1700000000000,
      data: {
        bagiadil_participants: JSON.stringify(['Ani', 'Budi']),
        'bagiadil-lang': 'en',
      },
    });

    await bootApp(`share=${shareEncoded}&migrate=${migrateEncoded}`);

    // migrate= removed, share= kept
    expect(location.hash).toBe(`#share=${shareEncoded}`);

    // Data was imported
    expect(JSON.parse(localStorage.getItem('bagiadil_participants'))).toEqual(['Ani', 'Budi']);
    expect(localStorage.getItem('bagiadil-lang')).toBe('en');

    // Banner shown AND shared view rendered, no success toast
    expect(q('.toast.toast--success')).toBeNull();
    const banner = q('.migration-banner[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('.migration-notice-text').textContent).toBe(
      'BagiAdil now lives at bagiadil.darktama.dev. Your data from the old address has been moved. Bookmark the new address!',
    );
    expect(qa('#results .result-card .result-card-name').map((e) => e.textContent)).toEqual([
      'Zed',
    ]);
    expect(q('#manual-section').style.display).toBe('none');
  });

  it('shows the "nothing" banner when arriving from the bridge without migrate= and writes nothing', async () => {
    await bootApp('');

    expect(q('.toast')).toBeNull();
    const banner = q('.migration-banner[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('.migration-notice-text').textContent).toBe(
      'BagiAdil sekarang ada di bagiadil.darktama.dev. Simpan alamat baru ini ya!',
    );
    expect(banner.querySelector('.migration-notice-text strong')?.textContent).toBe(
      'bagiadil.darktama.dev',
    );
    expect(localStorage.getItem('bagiadil_participants')).toBeNull();
    expect(localStorage.getItem('bagiadil_history')).toBeNull();
  });

  it('shows the "nothing" banner in shared view when arriving from the bridge without migrate=', async () => {
    const { encodeSnapshot } = await import('../../src/ui/snapshot.js');
    const shareEncoded = encodeSnapshot({
      participants: ['Zed'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        { name: 'Soto', unitPrice: 20000, totalQty: 1, assignments: [{ person: 'Zed', qty: 1 }] },
      ],
    });

    await bootApp(`share=${shareEncoded}`);

    const banner = q('.migration-banner[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('.migration-notice-text').textContent).toBe(
      'BagiAdil sekarang ada di bagiadil.darktama.dev. Simpan alamat baru ini ya!',
    );
    expect(qa('#results .result-card .result-card-name').map((e) => e.textContent)).toEqual([
      'Zed',
    ]);
  });

  it('closing the banner hides it for this page load only and shows again on next bridge arrival', async () => {
    await bootApp('');

    const banner = q('.migration-banner[role="status"]');
    expect(banner).toBeTruthy();
    banner.querySelector('.migration-notice-close').click();

    expect(q('.migration-banner')).toBeNull();
    expect(q('#migration-notice').hidden).toBe(true);

    // Switching language after closing must not bring the dismissed banner back
    q('.lang-btn:not(.active)').click();
    expect(q('.migration-banner')).toBeNull();

    // Next arrival from the bridge shows the banner again
    await bootApp('');
    expect(q('.migration-banner[role="status"]')).toBeTruthy();
  });

  it('updates banner language when toggling locale', async () => {
    await bootApp('');
    expect(q('.migration-banner .migration-notice-text').textContent).toBe(
      'BagiAdil sekarang ada di bagiadil.darktama.dev. Simpan alamat baru ini ya!',
    );

    q('.lang-btn[data-lang="en"]').click();
    expect(q('.migration-banner .migration-notice-text').textContent).toBe(
      'BagiAdil now lives at bagiadil.darktama.dev. Bookmark the new address!',
    );
    expect(q('.migration-banner .migration-notice-text strong')?.textContent).toBe(
      'bagiadil.darktama.dev',
    );
  });

  it('returns { fromBridge, outcome } for all importMigrationFromHash paths', async () => {
    const check = async (hash, referrer) => {
      vi.resetModules();
      loadDom();
      setReferrer(referrer);
      window.history.replaceState(null, '', '/' + (hash ? `#${hash}` : ''));
      const { importMigrationFromHash } = await import('../../src/ui/migration.js');
      return importMigrationFromHash();
    };

    expect(await check('', '')).toEqual({ fromBridge: false, outcome: 'none' });
    expect(await check('', `${ALLOWED_ORIGIN}/BagiAdil/`)).toEqual({
      fromBridge: true,
      outcome: 'nothing',
    });
    expect(
      await check(
        `migrate=${encodeMigrate({ v: 1, from: ALLOWED_ORIGIN, data: { bagiadil_participants: '["Ani"]' } })}`,
        '',
      ),
    ).toEqual({ fromBridge: false, outcome: 'rejected' });
    expect(
      await check(
        `migrate=${encodeMigrate({ v: 1, from: 'https://evil.example', data: {} })}`,
        `${ALLOWED_ORIGIN}/BagiAdil/`,
      ),
    ).toEqual({ fromBridge: true, outcome: 'rejected' });
    expect(await check('migrate=corrupt!!!', `${ALLOWED_ORIGIN}/BagiAdil/`)).toEqual({
      fromBridge: true,
      outcome: 'invalid',
    });
    expect(
      await check(
        `migrate=${encodeMigrate({ v: 1, from: ALLOWED_ORIGIN, data: { bagiadil_participants: '["Budi"]' } })}`,
        `${ALLOWED_ORIGIN}/BagiAdil/`,
      ),
    ).toEqual({ fromBridge: true, outcome: 'imported' });
  });
});
