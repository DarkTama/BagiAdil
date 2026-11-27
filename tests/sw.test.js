import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const swPath = resolve(root, 'public/sw.js');

describe('service worker file', () => {
  it('ships from public/ and not from the repo root', () => {
    expect(existsSync(swPath)).toBe(true);
    expect(existsSync(resolve(root, 'sw.js'))).toBe(false);
  });

  it('has no absolute root-relative precache entries', () => {
    const src = readFileSync(swPath, 'utf8');
    expect(src).not.toMatch(/['"]\/['"]/);
    expect(src).not.toMatch(/['"]\/index\.html['"]/);
  });
});

function loadWorker({ fetchImpl, cacheStore = new Map() }) {
  const listeners = {};
  const cache = {
    addAll: vi.fn(async (urls) => urls.forEach((u) => cacheStore.set(u, { url: u }))),
    put: vi.fn(async (req, res) => cacheStore.set(req.url, res)),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(),
    match: vi.fn(async (req) => cacheStore.get(typeof req === 'string' ? req : req.url)),
  };
  const self = {
    location: new URL('https://example.github.io/BagiAdil/sw.js'),
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const Response = { error: () => ({ error: true }) };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', readFileSync(swPath, 'utf8'))(
    self,
    caches,
    fetchImpl,
    Response,
    URL,
  );
  return { listeners, cache, caches, cacheStore, self };
}

function fire(listeners, type, event) {
  let promise;
  listeners[type]({ ...event, waitUntil: (p) => (promise = p), respondWith: (p) => (promise = p) });
  return promise;
}

const okResponse = () => ({
  ok: true,
  type: 'basic',
  clone() {
    return this;
  },
});

describe('service worker behaviour', () => {
  it('precaches scope-relative URLs on install', async () => {
    const { listeners, cache, self } = loadWorker({ fetchImpl: vi.fn() });
    await fire(listeners, 'install', {});
    expect(cache.addAll).toHaveBeenCalledWith([
      'https://example.github.io/BagiAdil/',
      'https://example.github.io/BagiAdil/index.html',
      'https://example.github.io/BagiAdil/manifest.json',
    ]);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it('caches same-origin GET responses', async () => {
    const res = okResponse();
    const { listeners, cache } = loadWorker({ fetchImpl: vi.fn(async () => res) });
    const req = {
      method: 'GET',
      url: 'https://example.github.io/BagiAdil/assets/app.js',
      mode: 'cors',
    };
    const out = await fire(listeners, 'fetch', { request: req });
    await Promise.resolve();
    expect(out).toBe(res);
    expect(cache.put).toHaveBeenCalledWith(req, res);
  });

  it('serves cached index.html for offline navigation', async () => {
    const shell = { shell: true };
    const store = new Map([['https://example.github.io/BagiAdil/index.html', shell]]);
    const { listeners } = loadWorker({
      fetchImpl: vi.fn(async () => {
        throw new Error('offline');
      }),
      cacheStore: store,
    });
    const req = {
      method: 'GET',
      url: 'https://example.github.io/BagiAdil/some/route',
      mode: 'navigate',
    };
    expect(await fire(listeners, 'fetch', { request: req })).toBe(shell);
  });

  it('does not intercept cross-origin or non-GET requests', () => {
    const { listeners, cache } = loadWorker({ fetchImpl: vi.fn(async () => okResponse()) });
    const respondWith = vi.fn();
    listeners.fetch({
      request: { method: 'GET', url: 'https://cdn.example.com/x.js' },
      respondWith,
    });
    listeners.fetch({
      request: { method: 'POST', url: 'https://example.github.io/BagiAdil/api' },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not intercept /api/ or /s/ shortlink endpoints', () => {
    const { listeners, cache } = loadWorker({ fetchImpl: vi.fn(async () => okResponse()) });
    const respondWith = vi.fn();
    listeners.fetch({
      request: { method: 'GET', url: 'https://example.github.io/api/s' },
      respondWith,
    });
    listeners.fetch({
      request: { method: 'GET', url: 'https://example.github.io/s/abc123def456' },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
