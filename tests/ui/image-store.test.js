// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  putReceipt,
  getReceipt,
  deleteReceipt,
  pruneReceipts,
} from '../../src/ui/image-store.js';

describe('image-store (IndexedDB receipts)', () => {
  it('stores and retrieves a receipt blob', async () => {
    const blob = new Blob(['receipt-image-bytes'], { type: 'image/jpeg' });
    await putReceipt('split-a', blob);

    // A stored receipt round-trips back as a truthy value.
    const got = await getReceipt('split-a');
    expect(got).toBeTruthy();
  });

  it('returns null for a missing receipt', async () => {
    expect(await getReceipt('does-not-exist')).toBe(null);
  });

  it('ignores empty ids and blobs', async () => {
    await putReceipt('', new Blob(['x']));
    await putReceipt('split-x', null);
    expect(await getReceipt('')).toBe(null);
    expect(await getReceipt('split-x')).toBe(null);
  });

  it('deletes a receipt', async () => {
    await putReceipt('split-b', new Blob(['b'], { type: 'image/jpeg' }));
    await deleteReceipt('split-b');
    expect(await getReceipt('split-b')).toBe(null);
  });

  it('prunes receipts whose id is not in the valid set', async () => {
    await putReceipt('keep-me', new Blob(['k'], { type: 'image/jpeg' }));
    await putReceipt('drop-me', new Blob(['d'], { type: 'image/jpeg' }));

    await pruneReceipts(['keep-me']);

    expect(await getReceipt('keep-me')).toBeTruthy();
    expect(await getReceipt('drop-me')).toBe(null);
  });
});
