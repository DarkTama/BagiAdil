import { describe, it, expect } from 'vitest';
import worker from '../../worker/index.js';
import { encodeSnapshot, decodeSnapshot } from '../../src/ui/snapshot.js';

// Mirrors worker/index.js (a Worker module may only export handlers).
const MAX_BYTES = 32 * 1024;
const TTL_SECONDS = 90 * 24 * 60 * 60;

function makeEnv() {
  const store = new Map();
  return {
    store,
    SHARES: {
      async put(k, v, opts) { store.set(k, { v, opts }); },
      async get(k) { return store.get(k)?.v ?? null; },
    },
    ASSETS: { fetch: async () => new Response('asset') },
  };
}

const snap = {
  participants: ['Ani', 'Budi'],
  params: { totalDiscount: 5000, totalShipping: 4000 },
  items: [{ name: 'Nasi', unitPrice: 10000, totalQty: 2, assignments: [{ person: 'Ani', qty: 1 }, { person: 'Budi', qty: 1 }] }],
  payment: { bank: 'BCA', accountNumber: '123', accountName: 'Ani' },
};
const ORIGIN = 'https://bagiadil.test';
const post = (body, headers = {}) =>
  new Request(`${ORIGIN}/api/s`, { method: 'POST', body, headers: { origin: ORIGIN, ...headers } });

describe('shortlink worker', () => {
  it('stores a valid snapshot with a 90-day TTL and serves it back', async () => {
    const env = makeEnv();
    const res = await worker.fetch(post(encodeSnapshot(snap)), env);
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(env.store.get(id).opts.expirationTtl).toBe(TTL_SECONDS);

    const page = await worker.fetch(new Request(`${ORIGIN}/s/${id}`), env);
    expect(page.status).toBe(200);
    const html = await page.text();
    const payload = html.match(/#share=([^"]+)"/)[1];
    expect(decodeSnapshot(payload)).toEqual(decodeSnapshot(encodeSnapshot(snap)));
  });

  it('rejects garbage, oversize bodies, other origins and wrong methods', async () => {
    const env = makeEnv();
    expect((await worker.fetch(post('not-a-snapshot'), env)).status).toBe(400);
    expect((await worker.fetch(post('x'.repeat(MAX_BYTES + 1)), env)).status).toBe(413);
    expect((await worker.fetch(post(encodeSnapshot(snap), { origin: 'https://evil.test' }), env)).status).toBe(403);
    expect((await worker.fetch(new Request(`${ORIGIN}/api/s`), env)).status).toBe(405);
    expect(env.store.size).toBe(0);
  });

  it('sends unknown or malformed ids to the app\'s invalid-link path', async () => {
    const env = makeEnv();
    for (const path of ['/s/AAAAAAAAAAAA', '/s/short', '/s/']) {
      const res = await worker.fetch(new Request(`${ORIGIN}${path}`), env);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('"/#share="');
    }
  });

  it('passes every other path to the static assets', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/index.html`), makeEnv());
    expect(await res.text()).toBe('asset');
  });

  it('returns 503 on POST and 404 on GET when the KV binding is absent', async () => {
    const noKvEnv = { ASSETS: { fetch: async () => new Response('asset') } };
    const postRes = await worker.fetch(post(encodeSnapshot(snap)), noKvEnv);
    expect(postRes.status).toBe(503);

    const getRes = await worker.fetch(new Request(`${ORIGIN}/s/AAAAAAAAAAAA`), noKvEnv);
    expect(getRes.status).toBe(404);
    expect(await getRes.text()).toContain('"/#share="');
  });
});
