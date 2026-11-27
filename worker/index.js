// Only the default export: workerd rejects any other named export from the entry module.
/**
 * Cloudflare Worker: opt-in shortlinks for share links.
 * Only /api/* and /s/* reach this code (assets.run_worker_first); every other
 * path is served straight from the static assets.
 *
 *   POST /api/s   body: the #share= payload (text). -> { id }
 *   GET  /s/:id   -> tiny page that opens /#share=<payload>
 *
 * The stored value is re-encoded from a validated snapshot, so KV only ever
 * holds a well-formed split.
 */

import { decodeSnapshot, encodeSnapshot, computeSplit } from '../src/ui/snapshot.js';

const MAX_BYTES = 32 * 1024;
const TTL_SECONDS = 90 * 24 * 60 * 60;
const ID_RE = /^\/s\/([A-Za-z0-9_-]{12})$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** 12 url-safe chars = 72 random bits: unguessable, since receipts carry account numbers. */
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

/** Read the body, giving up as soon as it passes MAX_BYTES (Content-Length can lie). */
async function readCapped(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function create(request, env, url) {
  // Browsers always send Origin on a POST; refuse other sites' pages.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'origin' }, 403);
  if (!env?.SHARES) return json({ error: 'unavailable' }, 503);

  const body = await readCapped(request);
  if (body === null) return json({ error: 'too_large' }, 413);

  const snap = decodeSnapshot(body.trim());
  if (!snap || !computeSplit(snap).result) return json({ error: 'invalid' }, 400);

  const id = newId();
  await env.SHARES.put(id, encodeSnapshot(snap), { expirationTtl: TTL_SECONDS });
  return json({ id }, 201);
}

async function open(id, env) {
  const payload = id && env?.SHARES ? await env.SHARES.get(id) : null;
  // A missing or expired link lands on "#share=" with nothing after it, which
  // the app already reports as an invalid link.
  const target = `/#share=${payload || ''}`;
  // An HTML hop instead of a redirect: a ~32 KB Location header is not safe everywhere.
  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>BagiAdil</title><script>location.replace(${JSON.stringify(target)})</script><a href="${target}">BagiAdil</a>`;
  return new Response(html, {
    status: payload ? 200 : 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/s') {
      return request.method === 'POST' ? create(request, env, url) : json({ error: 'method' }, 405);
    }
    if (url.pathname.startsWith('/s/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method' }, 405);
      return open(url.pathname.match(ID_RE)?.[1], env);
    }
    return env.ASSETS.fetch(request);
  },
};
