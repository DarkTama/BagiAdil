// @vitest-environment jsdom
// Share flow (feature #3): native share sheet and the opt-in shortlink.
/* global HTMLElement */

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 10));

function calculatedSplit() {
  q('#participant-name').value = 'Ani';
  q('#participants .participants-add').click();
  const f = q('#add-item-form .section-content');
  f.querySelector('.add-item-name').value = 'Nasi';
  const p = f.querySelector('.add-item-price');
  p.value = '20000';
  p.dispatchEvent(new Event('input'));
  f.querySelector('.add-item-qty').value = '1';
  f.querySelector('.btn-add-item').click();
  [...qa('#table-assigner tbody tr.chip-row')[0].querySelectorAll('.assign-chip')]
    .find((c) => c.dataset.person === 'Ani')
    .click();
  q('#calculate').click();
}

let copied;
beforeEach(async () => {
  localStorage.clear();
  location.hash = '';
  vi.resetModules();
  document.documentElement.innerHTML = fs.readFileSync('index.html', 'utf8').replace(/<!doctype html>/i, '');
  HTMLElement.prototype.scrollIntoView = () => {};
  window.confirm = () => true;
  copied = null;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (txt) => { copied = txt; } },
    configurable: true,
  });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
  window.matchMedia = () => ({ matches: false });
  const { initApp } = await import('../../src/ui/app.js');
  initApp();
  calculatedSplit();
});

describe('share button on touch devices', () => {
  beforeEach(() => {
    window.matchMedia = (m) => ({ matches: m === '(pointer: coarse)' });
  });

  it('opens the share sheet with the link instead of copying', async () => {
    const shared = [];
    navigator.share = async (data) => { shared.push(data); };
    q('.export-share-btn').click();
    await tick();
    expect(shared[0].url).toContain('#share=');
    expect(copied).toBeNull();
  });

  it('treats a closed sheet as a cancel, and other failures as a reason to copy', async () => {
    navigator.share = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); };
    q('.export-share-btn').click();
    await tick();
    expect(copied).toBeNull();

    navigator.share = async () => { throw new Error('not allowed'); };
    q('.export-share-btn').click();
    await tick();
    expect(copied).toContain('#share=');
  });
});

describe('opt-in shortlink', () => {
  it('is off by default and only uploads after opting in', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'abcdefghijkl' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchSpy);

    q('.export-share-btn').click();
    await tick();
    expect(copied).toContain('#share=');
    expect(fetchSpy).not.toHaveBeenCalled();

    q('#share-short').click();
    await tick();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/s');

    q('.export-share-btn').click();
    await tick();
    expect(copied).toBe(`${location.origin}/s/abcdefghijkl`);
    q('.export-wa-btn').click();
    await tick();
    expect(copied).toContain(`${location.origin}/s/abcdefghijkl`);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // cached per payload
    vi.unstubAllGlobals();
  });

  it('is cleared when the split changes, so a new split needs a new opt-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'abcdefghijkl' }), { status: 201 })));
    q('#share-short').click();
    await tick();
    q('.chip-remove').click(); // editor changes: results go stale
    expect(q('#share-short').checked).toBe(false);
    expect(q('#share-short').disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it('falls back to the long link and unticks when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    q('#share-short').click();
    await tick();
    expect(q('#share-short').checked).toBe(false);
    q('.export-share-btn').click();
    await tick();
    expect(copied).toContain('#share=');
    vi.unstubAllGlobals();
  });
});
