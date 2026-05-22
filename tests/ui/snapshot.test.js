// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  computeSplit,
  encodeSnapshot,
  decodeSnapshot,
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
});
