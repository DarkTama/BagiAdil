// @vitest-environment jsdom
/* global Storage */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveParticipants,
  loadParticipants,
  getSuggestions,
  clearStorage,
  saveHistoryEntry,
  loadHistory,
  getHistoryEntry,
  deleteHistoryEntry,
  renameHistoryEntry,
  clearHistory,
  savePaymentInfo,
  loadPaymentInfo,
  clearPaymentInfo,
  saveDraft,
  loadDraft,
  clearDraft,
} from '../../src/ui/storage.js';

describe('Storage - localStorage integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('save and load participants', () => {
    it('should save and load participant names', () => {
      saveParticipants(['Alice', 'Bob', 'Charlie']);
      const loaded = loadParticipants();
      expect(loaded).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should return empty array when nothing is saved', () => {
      const loaded = loadParticipants();
      expect(loaded).toEqual([]);
    });

    it('should merge new names with existing ones', () => {
      saveParticipants(['Alice', 'Bob']);
      saveParticipants(['Charlie', 'Alice']); // Alice already exists

      const loaded = loadParticipants();
      expect(loaded).toContain('Alice');
      expect(loaded).toContain('Bob');
      expect(loaded).toContain('Charlie');
      expect(loaded.length).toBe(3);
    });

    it('should handle case-insensitive deduplication', () => {
      saveParticipants(['Alice']);
      saveParticipants(['alice']); // Same as Alice, different case

      const loaded = loadParticipants();
      expect(loaded.length).toBe(1);
    });
  });

  describe('getSuggestions', () => {
    it('should return matching names by prefix', () => {
      saveParticipants(['Alice', 'Alicia', 'Bob', 'Charlie']);

      const suggestions = getSuggestions('Ali');
      expect(suggestions).toContain('Alice');
      expect(suggestions).toContain('Alicia');
      expect(suggestions).not.toContain('Bob');
    });

    it('should be case-insensitive', () => {
      saveParticipants(['Alice', 'Bob']);

      const suggestions = getSuggestions('ali');
      expect(suggestions).toContain('Alice');
    });

    it('should return empty array for empty input', () => {
      saveParticipants(['Alice', 'Bob']);

      expect(getSuggestions('')).toEqual([]);
      expect(getSuggestions('  ')).toEqual([]);
    });

    it('should return empty array when no matches', () => {
      saveParticipants(['Alice', 'Bob']);

      const suggestions = getSuggestions('Xyz');
      expect(suggestions).toEqual([]);
    });
  });

  describe('clearStorage', () => {
    it('should remove all saved data', () => {
      saveParticipants(['Alice', 'Bob']);
      expect(loadParticipants().length).toBe(2);

      clearStorage();
      expect(loadParticipants()).toEqual([]);
    });
  });

  describe('split history', () => {
    const sampleSnapshot = () => ({
      label: 'Lunch',
      participants: ['Alice', 'Bob'],
      params: { totalDiscount: 5000, totalShipping: 10000 },
      items: [
        { name: 'Nasi', unitPrice: 20000, totalQty: 1, assignments: [{ person: 'Alice', qty: 1 }] },
      ],
    });

    it('should create a new entry and return its id', () => {
      const id = saveHistoryEntry(sampleSnapshot());
      expect(typeof id).toBe('string');

      const history = loadHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(id);
      expect(history[0].label).toBe('Lunch');
      expect(history[0].createdAt).toBeTypeOf('number');
    });

    it('should update an existing entry instead of duplicating', () => {
      const id = saveHistoryEntry(sampleSnapshot());

      const updated = sampleSnapshot();
      updated.id = id;
      updated.params.totalShipping = 15000;
      saveHistoryEntry(updated);

      const history = loadHistory();
      expect(history.length).toBe(1);
      expect(history[0].params.totalShipping).toBe(15000);
    });

    it('should retrieve a single entry by id', () => {
      const id = saveHistoryEntry(sampleSnapshot());
      const entry = getHistoryEntry(id);
      expect(entry).not.toBeNull();
      expect(entry.id).toBe(id);
      expect(getHistoryEntry('does-not-exist')).toBeNull();
    });

    it('should delete an entry by id', () => {
      const id = saveHistoryEntry(sampleSnapshot());
      saveHistoryEntry(sampleSnapshot());
      expect(loadHistory().length).toBe(2);

      deleteHistoryEntry(id);
      const history = loadHistory();
      expect(history.length).toBe(1);
      expect(history.some((e) => e.id === id)).toBe(false);
    });

    it('should rename an entry', () => {
      const id = saveHistoryEntry(sampleSnapshot());
      renameHistoryEntry(id, 'Dinner');
      expect(getHistoryEntry(id).label).toBe('Dinner');
    });

    it('should clear all history', () => {
      saveHistoryEntry(sampleSnapshot());
      saveHistoryEntry(sampleSnapshot());
      expect(loadHistory().length).toBe(2);

      clearHistory();
      expect(loadHistory()).toEqual([]);
    });

    it('should return an empty array when no history exists', () => {
      expect(loadHistory()).toEqual([]);
    });
  });

  describe('history safety', () => {
    const entry = (label) => ({
      label,
      participants: ['A'],
      params: { totalDiscount: 0, totalShipping: 0 },
      items: [{ name: 'X', unitPrice: 1000, totalQty: 1, assignments: [{ person: 'A', qty: 1 }] }],
    });

    afterEach(() => vi.restoreAllMocks());

    it('returns null when the write fails', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(saveHistoryEntry(entry('x'))).toBeNull();
    });

    it('backs up an unparsable history value once before it is overwritten', () => {
      localStorage.setItem('bagiadil_history', '[{"id":"a"');
      saveHistoryEntry(entry('fresh'));
      expect(localStorage.getItem('bagiadil_history_corrupt')).toBe('[{"id":"a"');
      expect(loadHistory().length).toBe(1);
      // A second corrupt read must not overwrite the first backup.
      localStorage.setItem('bagiadil_history', 'garbage');
      loadHistory();
      expect(localStorage.getItem('bagiadil_history_corrupt')).toBe('[{"id":"a"');
    });

    it('evicts by updatedAt, so an edited old entry survives the 50 cap', () => {
      let now = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => now++);
      const ids = [];
      for (let i = 0; i < 50; i++) ids.push(saveHistoryEntry(entry(`e${i}`)));
      saveHistoryEntry({ ...entry('e0 edited'), id: ids[0] }); // oldest, now freshest
      saveHistoryEntry(entry('newest'));
      const kept = loadHistory();
      expect(kept.length).toBe(50);
      expect(kept.some((e) => e.id === ids[0])).toBe(true);
      expect(kept.some((e) => e.id === ids[1])).toBe(false);
    });

    it('does not create a ghost entry for a partial update of an unknown id', () => {
      saveHistoryEntry(entry('real'));
      expect(saveHistoryEntry({ id: 'nope', paid: { A: true } })).toBeNull();
      expect(loadHistory().length).toBe(1);
    });

    it('delete and rename report success as a boolean', () => {
      const id = saveHistoryEntry(entry('x'));
      expect(renameHistoryEntry(id, 'y')).toBe(true);
      expect(renameHistoryEntry('nope', 'y')).toBe(false);
      expect(deleteHistoryEntry(id)).toBe(true);
    });
  });

  describe('draft', () => {
    it('round-trips and clears', () => {
      const draft = { v: 1, snapshot: { participants: ['A'] }, historyId: null, paid: {}, calculated: false };
      expect(saveDraft(draft)).toBe(true);
      expect(loadDraft()).toEqual(draft);
      clearDraft();
      expect(loadDraft()).toBeNull();
    });

    it('returns null for a corrupt draft', () => {
      localStorage.setItem('bagiadil_draft', '{oops');
      expect(loadDraft()).toBeNull();
    });
  });

  describe('payment info', () => {
    it('should save and load payment info', () => {
      savePaymentInfo({ bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' });
      expect(loadPaymentInfo()).toEqual({
        bank: 'BCA',
        accountNumber: '1234567890',
        accountName: 'Budi',
      });
    });

    it('should return null when no payment info is stored', () => {
      expect(loadPaymentInfo()).toBeNull();
    });

    it('should return null when all fields are empty or whitespace', () => {
      savePaymentInfo({ bank: '  ', accountNumber: '', accountName: ' ' });
      expect(loadPaymentInfo()).toBeNull();
    });

    it('should clear payment info', () => {
      savePaymentInfo({ bank: 'GoPay', accountNumber: '08123456789', accountName: 'Budi' });
      clearPaymentInfo();
      expect(loadPaymentInfo()).toBeNull();
    });
  });
});
