import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decompressFromEncodedURIComponent } from 'lz-string';
import { buildMigrationHash } from '../../bridge/migrate-core.js';

function decodeMigrateHash(hash) {
  const match = hash.match(/(?:^|&)migrate=([^&]+)/);
  if (!match) return null;
  return JSON.parse(decompressFromEncodedURIComponent(match[1]));
}

describe('bridge/migrate-core buildMigrationHash', () => {
  it('returns empty string when there is no data and no share fragment', () => {
    expect(buildMigrationHash([], '')).toBe('');
    expect(buildMigrationHash([['unrelated_key', '123']], '')).toBe('');
  });

  it('preserves share fragment when there is no data', () => {
    expect(buildMigrationHash([], '#share=abc123')).toBe('share=abc123');
    expect(buildMigrationHash([], 'other=1&share=xyz_99')).toBe('share=xyz_99');
  });

  it('omits migrate param when bagiadil_migrated is already set', () => {
    const entries = [
      ['bagiadil_migrated', '2026-11-27T00:00:00.000Z'],
      ['bagiadil_participants', '["Ani","Budi"]'],
      ['bagiadil-lang', 'en'],
    ];
    expect(buildMigrationHash(entries, '')).toBe('');
    expect(buildMigrationHash(entries, '#share=keepMe')).toBe('share=keepMe');
  });

  it('packs bagiadil_* keys and bagiadil-lang and preserves share fragment', () => {
    const entries = [
      ['bagiadil_participants', '["Ani"]'],
      ['bagiadil-lang', 'en'],
      ['ignored_other', 'nope'],
    ];
    const hash = buildMigrationHash(entries, '#share=link123', 1_500_000, {
      from: 'https://darktama.github.io',
      at: 1700000000000,
    });
    expect(hash.startsWith('share=link123&migrate=')).toBe(true);
    const payload = decodeMigrateHash(hash);
    expect(payload).toEqual({
      v: 1,
      from: 'https://darktama.github.io',
      at: 1700000000000,
      data: {
        bagiadil_participants: '["Ani"]',
        'bagiadil-lang': 'en',
      },
    });
  });

  it('drops draft first when oversize, keeping history if it fits', () => {
    const history = [
      { id: 'h1', updatedAt: 100, label: 'Split 1', participants: ['Ani'], items: [] },
    ];
    const draft = {
      v: 1,
      snapshot: {
        participants: ['Ani'],
        items: [{ name: 'LongItem ' + 'x'.repeat(200), unitPrice: 1000, totalQty: 1 }],
      },
    };
    const entries = [
      ['bagiadil_history', JSON.stringify(history)],
      ['bagiadil_draft', JSON.stringify(draft)],
    ];

    const withoutDraft = buildMigrationHash(
      [['bagiadil_history', JSON.stringify(history)]],
      '',
      1_500_000,
      { from: 'https://example.com', at: 1 },
    );
    const withDraft = buildMigrationHash(entries, '', 1_500_000, {
      from: 'https://example.com',
      at: 1,
    });
    const maxLen = withoutDraft.length + 5;
    expect(withDraft.length).toBeGreaterThan(maxLen);

    const trimmed = buildMigrationHash(entries, '', maxLen, {
      from: 'https://example.com',
      at: 1,
    });
    expect(trimmed.length).toBeLessThanOrEqual(maxLen);
    const payload = decodeMigrateHash(trimmed);
    expect(payload.data.bagiadil_draft).toBeUndefined();
    expect(JSON.parse(payload.data.bagiadil_history)).toEqual(history);
  });

  it('trims history newest-first by updatedAt after dropping draft when still oversize', () => {
    const makeEntry = (id, updatedAt) => ({
      id,
      updatedAt,
      label: `Split ${id} ${id.repeat(40)}`,
      participants: ['Ani', 'Budi'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [{ name: `Nasi ${id} ${'z'.repeat(80)}`, unitPrice: 15000, totalQty: 1 }],
    });
    // Intentionally unsorted order in storage.
    const history = [
      makeEntry('old1', 1000),
      makeEntry('newest', 5000),
      makeEntry('old2', 2000),
      makeEntry('mid', 3000),
      makeEntry('newer', 4000),
    ];
    const entries = [
      ['bagiadil_draft', JSON.stringify({ big: 'd'.repeat(500) })],
      ['bagiadil_history', JSON.stringify(history)],
    ];

    const twoNewestOnly = buildMigrationHash(
      [['bagiadil_history', JSON.stringify([history[1], history[4]])]],
      '',
      1_500_000,
      { from: 'https://example.com', at: 1 },
    );
    const maxLen = twoNewestOnly.length + 10;

    const result = buildMigrationHash(entries, '', maxLen, {
      from: 'https://example.com',
      at: 1,
    });
    expect(result.length).toBeLessThanOrEqual(maxLen);
    const payload = decodeMigrateHash(result);
    expect(payload.data.bagiadil_draft).toBeUndefined();
    const kept = JSON.parse(payload.data.bagiadil_history);
    expect(kept.length).toBeGreaterThanOrEqual(1);
    expect(kept.length).toBeLessThan(history.length);
    expect(kept.map((e) => e.id)).toEqual(
      ['newest', 'newer', 'mid', 'old2', 'old1'].slice(0, kept.length),
    );
  });
});

describe('bridge/public/sw.js kill switch', () => {
  it('deletes caches, unregisters, and navigates window clients', async () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const swSrc = readFileSync(resolve(root, 'bridge/public/sw.js'), 'utf8');
    const listeners = {};
    const caches = {
      keys: vi.fn(async () => ['bagiadil-v1', 'bagiadil-v2']),
      delete: vi.fn(async () => true),
    };
    const nav1 = vi.fn(async () => null);
    const nav2 = vi.fn(async () => null);
    const self = {
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      skipWaiting: vi.fn(),
      registration: {
        unregister: vi.fn(async () => true),
      },
      clients: {
        matchAll: vi.fn(async () => [
          { url: 'https://darktama.github.io/BagiAdil/', navigate: nav1 },
          { url: 'https://darktama.github.io/BagiAdil/#share=x', navigate: nav2 },
        ]),
      },
    };

    new Function('self', 'caches', swSrc)(self, caches);

    listeners.install();
    expect(self.skipWaiting).toHaveBeenCalled();

    let done;
    listeners.activate({ waitUntil: (p) => (done = p) });
    await done;

    expect(caches.delete).toHaveBeenCalledWith('bagiadil-v1');
    expect(caches.delete).toHaveBeenCalledWith('bagiadil-v2');
    expect(self.registration.unregister).toHaveBeenCalled();
    expect(self.clients.matchAll).toHaveBeenCalledWith({ type: 'window' });
    expect(nav1).toHaveBeenCalledWith('https://darktama.github.io/BagiAdil/');
    expect(nav2).toHaveBeenCalledWith('https://darktama.github.io/BagiAdil/#share=x');
  });
});
