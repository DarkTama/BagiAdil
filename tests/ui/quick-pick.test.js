// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initParticipants,
  getParticipants,
  setParticipants,
} from '../../src/ui/participants.js';
import { saveParticipants, loadQuickPickParticipants } from '../../src/ui/storage.js';
import { setLocale } from '../../src/i18n/index.js';

describe('Quick-pick participants UI', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    setLocale('id');
    document.body.innerHTML = '<div id="participants"></div>';
    container = document.getElementById('participants');
  });

  it('removes the saved-groups UI while seeding legacy group members as quick-pick chips', () => {
    localStorage.setItem(
      'bagiadil_groups',
      JSON.stringify([{ name: 'Kantor', members: ['Budi', 'Sari'] }]),
    );
    initParticipants(container);
    setParticipants(['Eka', 'Farid']);

    expect(container.querySelector('.groups-row')).toBeNull();
    expect(container.querySelector('.groups-select')).toBeNull();

    const chips = [...container.querySelectorAll('.quick-pick-chip')].map(
      (el) => el.textContent,
    );
    expect(chips).toEqual(['+ Budi', '+ Sari']);
  });

  it('adds participant in 1 tap without moving focus to the text input, and returns removed chips', () => {
    localStorage.setItem(
      'bagiadil_history',
      JSON.stringify([
        { id: '1', participants: ['Budi', 'Sari'], items: [], updatedAt: 2000 },
      ]),
    );
    const onChange = vi.fn();
    initParticipants(container, { onChange });

    const inputBefore = container.querySelector('#participant-name');
    const budiBtn = container.querySelector('.quick-pick-chip');
    expect(budiBtn.textContent).toBe('+ Budi');

    budiBtn.focus();
    budiBtn.click();

    expect(getParticipants()).toEqual(['Budi']);
    expect(onChange).toHaveBeenCalledWith(['Budi']);
    expect(document.activeElement).not.toBe(container.querySelector('#participant-name'));
    expect(container.querySelector('.chip-text').textContent).toBe('Budi');
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['+ Sari']);

    // Removing selected chip returns Budi to quick-pick
    container.querySelector('.chip-remove').click();
    expect(getParticipants()).toEqual([]);
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['+ Budi', '+ Sari']);
    expect(inputBefore).not.toBeNull();
  });

  it('filters quick-pick chips live while typing without replacing the input element', () => {
    saveParticipants(['Budi', 'Sari', 'Bunga']);
    initParticipants(container);

    const input = container.querySelector('#participant-name');
    input.focus();
    input.value = 'bu';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(container.querySelector('#participant-name')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['+ Budi', '+ Bunga']);
  });

  it('supports comma and newline batch entry and flags all-duplicate submit accessibly', () => {
    initParticipants(container);

    const input = container.querySelector('#participant-name');
    const addBtn = container.querySelector('.participants-add');

    input.value = 'Budi, Sari,\n budi, Dimas';
    addBtn.click();

    expect(getParticipants()).toEqual(['Budi', 'Sari', 'Dimas']);

    const inputAfter = container.querySelector('#participant-name');
    inputAfter.value = 'budi, SARI';
    container.querySelector('.participants-add').click();

    expect(getParticipants()).toEqual(['Budi', 'Sari', 'Dimas']);
    expect(inputAfter.getAttribute('aria-invalid')).toBe('true');
    expect(inputAfter.getAttribute('aria-describedby')).toBe('participant-error');
    expect(container.querySelector('#participant-error').textContent.length).toBeGreaterThan(0);
  });

  it('caps quick-pick chips at 8 with expand/collapse toggle and shows beyond-8 matches when filtering', () => {
    const names = Array.from({ length: 11 }, (_, i) => `Teman${String(i + 1).padStart(2, '0')}`);
    saveParticipants(names);
    initParticipants(container);

    expect(container.querySelectorAll('.quick-pick-chip')).toHaveLength(8);
    const moreBtn = container.querySelector('.quick-pick-more');
    expect(moreBtn.textContent).toBe('+3 lagi');

    moreBtn.click();
    expect(container.querySelectorAll('.quick-pick-chip')).toHaveLength(11);
    expect(container.querySelector('.quick-pick-more').textContent).toBe(
      'Tampilkan lebih sedikit',
    );

    container.querySelector('.quick-pick-more').click();
    expect(container.querySelectorAll('.quick-pick-chip')).toHaveLength(8);

    const input = container.querySelector('#participant-name');
    input.value = '11';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['+ Teman11']);
    expect(container.querySelector('.quick-pick-more')).toBeNull();
  });

  it('supports Manage mode to permanently hide names from suggestions even when present in history', () => {
    localStorage.setItem(
      'bagiadil_history',
      JSON.stringify([
        { id: '1', participants: ['Typoo', 'Budi'], items: [], updatedAt: 2000 },
      ]),
    );
    initParticipants(container);

    const manageBtn = container.querySelector('.quick-pick-manage');
    expect(manageBtn.textContent).toBe('Kelola');
    manageBtn.click();

    expect(container.querySelector('.quick-pick-manage').textContent).toBe('Selesai');
    const chips = [...container.querySelectorAll('.quick-pick-chip')];
    expect(chips.map((el) => el.textContent)).toEqual(['Budi \u00d7', 'Typoo \u00d7']);
    expect(chips[1].classList.contains('quick-pick-chip-manage')).toBe(true);

    chips[1].click();
    expect(loadQuickPickParticipants()).toEqual(['Budi']);
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['Budi \u00d7']);

    container.querySelector('.quick-pick-manage').click();
    expect(
      [...container.querySelectorAll('.quick-pick-chip')].map((el) => el.textContent),
    ).toEqual(['+ Budi']);
  });
});
