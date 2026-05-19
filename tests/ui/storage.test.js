// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveParticipants,
  loadParticipants,
  getSuggestions,
  clearStorage,
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
});
