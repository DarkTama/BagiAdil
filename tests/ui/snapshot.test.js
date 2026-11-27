// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import {
  aggregateByPerson,
  buildSnapshot,
  computeSplit,
  encodeSnapshot,
  decodeSnapshot,
  validateSnapshot,
} from '../../src/ui/snapshot.js';

describe('snapshot encode/decode', () => {
  const sample = {
    participants: ['Eka', 'Eka 2'],
    params: { totalDiscount: 42400, totalShipping: 19500 },
    items: [
      {
        name: 'L Original Pot Besar',
        unitPrice: 20300,
        totalQty: 4,
        assignments: [
          { person: 'Eka 2', qty: 2 },
          { person: 'Eka', qty: 2 },
        ],
      },
      {
        name: 'Original Pot Kecil',
        unitPrice: 16100,
        totalQty: 4,
        assignments: [
          { person: 'Eka 2', qty: 2 },
          { person: 'Eka', qty: 2 },
        ],
      },
    ],
  };

  it('round-trips items and params through encode/decode', () => {
    const decoded = decodeSnapshot(encodeSnapshot(sample));
    expect(decoded.items).toEqual(sample.items);
    expect(decoded.params).toEqual(sample.params);
    // Participants are re-derived from item assignments; order may differ.
    expect([...decoded.participants].sort()).toEqual(
      [...sample.participants].sort(),
    );
  });

  it('produces a compressed URL-safe string', () => {
    expect(encodeSnapshot(sample)).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  it('encodes more compactly than the raw snapshot JSON', () => {
    expect(encodeSnapshot(sample).length).toBeLessThan(
      JSON.stringify(sample).length,
    );
  });

  it('omits participants who were not assigned any item', () => {
    const snap = {
      participants: ['Alice', 'Bob', 'Carol'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'Soup',
          unitPrice: 10000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
      ],
    };
    expect(decodeSnapshot(encodeSnapshot(snap)).participants).toEqual(['Alice']);
  });

  it('handles non-ASCII participant and item names', () => {
    const snap = {
      participants: ['Café'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'Té manis 日本語',
          unitPrice: 5000,
          totalQty: 1,
          assignments: [{ person: 'Café', qty: 1 }],
        },
      ],
    };
    expect(decodeSnapshot(encodeSnapshot(snap)).items).toEqual(snap.items);
  });

  it('still decodes legacy (pre-compression) base64 links', () => {
    const compact = [['Alice', 'Bob'], 0, 0, [['Soup', 10000, 1, [[0, 1]]]]];
    const legacy = btoa(JSON.stringify(compact))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = decodeSnapshot(legacy);
    expect(decoded.items[0].name).toBe('Soup');
    expect(decoded.items[0].assignments[0].person).toBe('Alice');
  });

  it('returns null for malformed input', () => {
    expect(decodeSnapshot('')).toBeNull();
    expect(decodeSnapshot('not valid base64 $$$')).toBeNull();
    // base64url of {"a":1} - valid base64/JSON but not the expected array shape
    expect(decodeSnapshot('eyJhIjoxfQ')).toBeNull();
  });
});

describe('buildSnapshot', () => {
  it('strips the runtime id from table-assigner items', () => {
    const snap = buildSnapshot(
      ['Alice'],
      { totalDiscount: 1000, totalShipping: 2000 },
      [
        {
          id: 7,
          name: 'Soup',
          unitPrice: 15000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
      ],
    );
    expect(snap.items[0]).not.toHaveProperty('id');
    expect(snap.items[0].name).toBe('Soup');
    expect(snap.participants).toEqual(['Alice']);
    expect(snap.params).toEqual({ totalDiscount: 1000, totalShipping: 2000 });
  });
});

describe('computeSplit', () => {
  it('computes a balanced split from a snapshot', () => {
    const snap = {
      participants: ['Alice', 'Bob'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'A',
          unitPrice: 10000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
        {
          name: 'B',
          unitPrice: 20000,
          totalQty: 1,
          assignments: [{ person: 'Bob', qty: 1 }],
        },
      ],
    };
    const { result, itemsMap } = computeSplit(snap);
    expect(Number(result.grandTotal)).toBe(30000);
    expect(result.verification.balanced).toBe(true);
    expect(itemsMap.Alice).toHaveLength(1);
    expect(itemsMap.Bob[0].name).toBe('B');
  });

  it('passes through payment info when present', () => {
    const snap = {
      participants: ['Alice'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'A',
          unitPrice: 10000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
      ],
      payment: { bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' },
    };
    const { payment } = computeSplit(snap);
    expect(payment).toEqual({ bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' });
  });

  it('round-trips payment info through encode/decode', () => {
    const snap = {
      participants: ['Alice'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'A',
          unitPrice: 10000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
      ],
      payment: { bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' },
    };
    const decoded = decodeSnapshot(encodeSnapshot(snap));
    expect(decoded.payment).toEqual({ bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' });
  });

  it('handles snapshots without payment gracefully in decode', () => {
    const snap = {
      participants: ['Alice'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [
        {
          name: 'A',
          unitPrice: 10000,
          totalQty: 1,
          assignments: [{ person: 'Alice', qty: 1 }],
        },
      ],
    };
    const decoded = decodeSnapshot(encodeSnapshot(snap));
    expect(decoded.payment).toBeUndefined();
  });
});

describe('aggregateByPerson / computeSplit (single compute path)', () => {
  const item = (name, unitPrice, assignments) => ({
    name,
    unitPrice,
    totalQty: assignments.reduce((n, a) => n + a.qty, 0),
    assignments,
  });

  it('seeds in participant order, then adds assigned-but-unlisted people', () => {
    const agg = aggregateByPerson(['Ani', 'Budi'], [
      item('X', 1000, [{ person: 'Zed', qty: 1 }, { person: 'Budi', qty: 2 }]),
    ]);
    expect(Object.keys(agg)).toEqual(['Ani', 'Budi', 'Zed']);
    expect(agg.Budi.subtotal).toBe(2000);
    expect(agg.Budi.items[0]).toMatchObject({ name: 'X', qty: 2, unitPrice: 1000, price: 2000 });
    expect(agg.Ani.items).toEqual([]);
  });

  it('returns result null when nobody has a subtotal above zero', () => {
    const out = computeSplit({
      participants: ['Ani'],
      params: { totalDiscount: 0, totalShipping: 5000 },
      items: [item('Free', 0, [{ person: 'Ani', qty: 1 }])],
    });
    expect(out.result).toBeNull();
    expect(out.itemsMap.Ani).toHaveLength(1);
  });
});

describe('versioned share links and validation (L1, L2)', () => {
  const link = (compact) => compressToEncodedURIComponent(JSON.stringify(compact));
  const good = { participants: ['Ani'], params: { totalDiscount: 0, totalShipping: 0 },
    items: [{ name: 'A', unitPrice: 1000, totalQty: 2, assignments: [{ person: 'Ani', qty: 1 }] }] };

  it('encodes v2 and round-trips', () => {
    const enc = encodeSnapshot(good);
    expect(JSON.parse(decompressFromEncodedURIComponent(enc))[0]).toBe(2);
    expect(decodeSnapshot(enc).items).toEqual(good.items);
  });

  it('still decodes a legacy v1 compact link', () => {
    const snap = decodeSnapshot(link([['Ani'], 0, 0, [['A', 1000, 1, [[0, 1]]]]]));
    expect(snap.participants).toEqual(['Ani']);
  });

  it('rejects an unknown future version', () => {
    expect(decodeSnapshot(link([4, ['Ani'], 0, 0, [['A', 1000, 1, [[0, 1]]]]]))).toBeNull();
  });

  it('rejects an out-of-range person index', () => {
    expect(decodeSnapshot(link([2, ['Ani'], 0, 0, [['A', 1000, 1, [[5, 1]]]]]))).toBeNull();
  });

  it('rejects a negative discount', () => {
    expect(decodeSnapshot(link([2, ['Ani'], -50000, 0, [['A', 1000, 1, [[0, 1]]]]]))).toBeNull();
  });

  it('rejects a string price', () => {
    expect(decodeSnapshot(link([2, ['Ani'], 0, 0, [['A', '20000', 1, [[0, 1]]]]]))).toBeNull();
  });

  it('rejects assigned quantity above totalQty', () => {
    expect(decodeSnapshot(link([2, ['Ani'], 0, 0, [['A', 1000, 1, [[0, 2]]]]]))).toBeNull();
  });

  it('rejects fractional rupiah, which the engine cannot compute', () => {
    expect(decodeSnapshot(link([2, ['Ani'], 0, 0, [['A', 1000.5, 1, [[0, 1]]]]]))).toBeNull();
    expect(decodeSnapshot(link([2, ['Ani'], 0.5, 0, [['A', 1000, 1, [[0, 1]]]]]))).toBeNull();
    expect(decodeSnapshot(link([2, ['Ani'], 0, 1500.25, [['A', 1000, 1, [[0, 1]]]]]))).toBeNull();
  });

  it('accepts free (Rp 0) items and a payment block; rejects non-string payment', () => {
    expect(validateSnapshot({ ...good, items: [{ ...good.items[0], unitPrice: 0 }] })).toBe(true);
    expect(validateSnapshot({ ...good, payment: { bank: 'BCA', accountNumber: '1', accountName: '' } })).toBe(true);
    expect(validateSnapshot({ ...good, payment: { bank: 1, accountNumber: '1', accountName: '' } })).toBe(false);
  });

  it('buildSnapshot stamps v: 1', () => {
    expect(buildSnapshot(['A'], { totalDiscount: 0, totalShipping: 0 }, []).v).toBe(1);
  });
});

describe('shared items (split flag)', () => {
  const link = (compact) => compressToEncodedURIComponent(JSON.stringify(compact));
  const unpack = (str) => JSON.parse(decompressFromEncodedURIComponent(str));
  const legacy = {
    participants: ['Ani', 'Budi'],
    params: { totalDiscount: 1000, totalShipping: 2000 },
    items: [{ name: 'Nasi', unitPrice: 15000, totalQty: 2, assignments: [{ person: 'Ani', qty: 1 }, { person: 'Budi', qty: 1 }] }],
  };
  const shared = {
    participants: ['Ani', 'Budi', 'Cici'],
    params: { totalDiscount: 0, totalShipping: 5000 },
    items: [
      {
        name: 'Pizza',
        unitPrice: 10000,
        totalQty: 1,
        split: true,
        // Assignment order differs from participant order on purpose.
        assignments: [{ person: 'Cici', qty: 1 }, { person: 'Ani', qty: 1 }, { person: 'Budi', qty: 1 }],
      },
      { name: 'Teh', unitPrice: 4000, totalQty: 1, assignments: [{ person: 'Budi', qty: 1 }] },
    ],
  };

  it('keeps links without shared items byte-identical to v2', () => {
    expect(encodeSnapshot(legacy)).toBe(
      link([2, ['Ani', 'Budi'], 1000, 2000, [['Nasi', 15000, 2, [[0, 1], [1, 1]]]]]),
    );
  });

  it('writes v3 with a per-item flag only when an item is shared', () => {
    const compact = unpack(encodeSnapshot(shared));
    expect(compact[0]).toBe(3);
    expect(compact[4][0][4]).toBe(1);
    expect(compact[4][1]).toHaveLength(4);
  });

  it('round-trips a shared item and computes the same split', () => {
    const decoded = decodeSnapshot(encodeSnapshot(shared));
    expect(decoded.items[0].split).toBe(true);
    expect(decoded.items[1].split).toBeUndefined();
    const before = computeSplit(shared).result.participants.map((p) => [p.name, p.finalPayment.toNumber()]);
    const after = computeSplit(decoded).result.participants.map((p) => [p.name, p.finalPayment.toNumber()]);
    expect(after).toEqual(before);
  });

  it('allocates shared parts in whole rupiah that sum to the item, first sharer gets the extra', () => {
    const by = aggregateByPerson(shared.participants, shared.items);
    expect([by.Cici.subtotal, by.Ani.subtotal, by.Budi.subtotal]).toEqual([3334, 3333, 3333 + 4000]);
    const { result } = computeSplit(shared);
    expect(result.verification.balanced).toBe(true);
    expect(result.grandTotal.toNumber()).toBe(19000);
  });

  it('weights split proportionally', () => {
    const by = aggregateByPerson(['A', 'B'], [
      { name: 'X', unitPrice: 1000, totalQty: 1, split: true, assignments: [{ person: 'A', qty: 2 }, { person: 'B', qty: 1 }] },
    ]);
    expect([by.A.subtotal, by.B.subtotal]).toEqual([667, 333]);
    expect(by.A.items[0].name).toBe('X (2/3)');
  });

  it('buildSnapshot keeps the flag only on shared items', () => {
    const snap = buildSnapshot(shared.participants, shared.params, shared.items);
    expect(snap.items[0].split).toBe(true);
    expect('split' in snap.items[1]).toBe(false);
  });

  it('validates the flag and share weights', () => {
    const base = { participants: ['A', 'B'], params: { totalDiscount: 0, totalShipping: 0 } };
    const item = (extra) => ({ name: 'X', unitPrice: 1000, totalQty: 1, assignments: [{ person: 'A', qty: 3 }], ...extra });
    expect(validateSnapshot({ ...base, items: [item({ split: true })] })).toBe(true); // weight > qty is fine
    expect(validateSnapshot({ ...base, items: [item({})] })).toBe(false); // units may not exceed qty
    expect(validateSnapshot({ ...base, items: [item({ split: 'yes' })] })).toBe(false);
    expect(
      validateSnapshot({ ...base, items: [{ ...item({ split: true }), assignments: [{ person: 'A', qty: 2 ** 50 }] }] }),
    ).toBe(false);
    expect(decodeSnapshot(link([3, ['A'], 0, 0, [['X', 1000, 1, [[0, 1]], 2]]]))).toBeNull();
  });
});
