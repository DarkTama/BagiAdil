# Feature #3: Better shareable receipt

Date: 2026-11-27. Source: audit `w3-design-ux.md` §3(3).

## 1. "Seimbang" proof and rounding (`src/ui/results.js`)

- Under the grand total, `.result-proof` shows two lines:
  - `Makanan Rp X − Diskon Rp Y + Ongkir Rp Z = Rp Total`. A term that is zero is left out.
  - `Jumlah semua pembayaran = Rp Total ✓`. It shows ✗ and a warning colour if the two ever differ.
- Y is `effectiveDiscount()`, the clamped discount. Z is the split's own `params.totalShipping`, passed in as `renderResults(..., { params })` by both the host view and the shared view. Nothing is rebuilt from the per-person Decimal shares, because division residue (10000/3) would break the equality.
- The proof is omitted when `params` is unknown.
- Each card shows `Pembulatan ±Rp n` when `roundingDelta(p) = finalPayment − round(preRoundingTotal)` is not zero. That is the difference between the two numbers the card displays, so the rows always add up. Across all cards the deltas sum to 0.

## 2. Receipt hierarchy and sharing

- **Card order:** name, paid status, then the final payment (large), then the rounding line, then the item list (name left, price right). The five breakdown rows sit in a collapsed `<details>` labelled "Rincian".
- **Shared view:** the page title becomes `Rp <total> - BagiAdil`.
- **Share button** (`Bagikan Tautan`): devices with a coarse pointer and `navigator.share` open the share sheet. `AbortError` counts as a cancel. Everything else copies to the clipboard, with the existing execCommand fallback.
- **WhatsApp text:** the first line is now labelled `Total Makanan`, which is the food subtotal (the old label "Total Tagihan" was wrong). Each person's items are listed under their line.

## 3. `html2pdf.js` replaced with print CSS

- The dependency is removed, along with its ~985 kB lazy chunk.
- `Simpan PDF / Cetak` calls `window.print()`. The `@media print` rules hide everything except `#results`, switch it to a light theme, and avoid breaking cards across pages. They also add a `BagiAdil <date>` header from `#results[data-print-date]`.
- Printed text is real text: crisp and selectable, with zero JS. "Save as PDF" is built into every desktop and mobile print dialog.
- `vite.config.js` still carries the html2pdf comment and `chunkSizeWarningLimit: 1000`. That file was outside this task's boundary, so both are left for a follow-up.

## 4. Opt-in shortlink

The Worker is `worker/index.js`. The routing in `wrangler.json` is:

```json
"main": "worker/index.js",
"assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/api/*", "/s/*"] },
"kv_namespaces": [{ "binding": "SHARES" }]
```

Only `/api/*` and `/s/*` run the Worker. Every other path is served from static assets as before, and `_headers` still applies.

### `POST /api/s`

- The body is the existing `#share=` payload as text.
- Requests are refused with 403 when `Origin` is a different site.
- The body is read with a 32 KB cap on the bytes actually received, not on `Content-Length`. Larger bodies get 413.
- The payload is decoded with the app's own `decodeSnapshot` (which runs `validateSnapshot`). It must also produce a payable split through `computeSplit`; otherwise the response is 400.
- What gets stored is `encodeSnapshot(snapshot)`, a canonical re-encode, never the raw body. It is stored under a 72-bit random id (12 base64url chars from `crypto.getRandomValues`) with `expirationTtl` set to 90 days. The response is `201 {id}`.

### `GET /s/:id`

- Returns a tiny `no-store`, `noindex`, `no-referrer` HTML page that runs `location.replace('/#share=<payload>')`. An HTML hop avoids relying on a ~32 KB `Location` header.
- An unknown, expired or malformed id gets a 404 page pointing at `/#share=`. The app already reports that as "Tautan pembagian tidak valid".

### Client (`src/ui/export.js`)

- The checkbox "Pakai tautan pendek (disimpan di server BagiAdil selama 90 hari)" is off by default. The long `#share=` link stays the default, because it works offline and never leaves the device.
- Ticking the box creates the shortlink right away.
- The opt-in covers the current calculated split only. When the results go stale or a new split starts, the box is unticked and disabled.
- While the box stays ticked, editing the payment fields uploads the new payload 1.5 s after typing stops. Each pause in typing can store one version, and every stored version is kept for 90 days.
- Links are cached per payload in a `Map`, so Share and WhatsApp reuse them and each distinct split costs one KV write.
- If creating the shortlink fails, the box is unticked and a toast is shown. Share and WhatsApp then fall back to the long link.
- The privacy footer now says data is sent to a server only when a short link is chosen. The copy is in `index.html`, `id.js` and `en.js`.

### Not built (add when needed)

- Rate limiting: add a Cloudflare rate-limiting rule on `POST /api/s` if abuse shows up.
- Delete-my-link.
- Paid status in the snapshot. `snapshot.js` was out of scope.
- `public/sw.js` caches every successful same-origin GET. A `/s/<id>` hop page a visitor opened therefore probably lands in that device's Cache Storage despite `no-store`. The payload is already in their URL history, but excluding `/s/` in `sw.js` would tidy this up.
- `eslint.config.js` does not ignore `.wrangler/`, so `npm run lint` fails after a local `wrangler dev` until that folder is deleted.

## Deploy notes

- `kv_namespaces` has no `id`. `deploy --dry-run` accepts that. Wrangler 4.x is expected to provision the namespace on the first real `wrangler deploy`, but that was not verified against the live account. The token or Workers Builds would need the *Workers KV Storage: Edit* permission.
- Alternatively, run `npx wrangler kv namespace create SHARES` and add the returned `id` to `wrangler.json`.

## Verification

- `tests/worker/shortlink.test.js` covers the KV round trip, the TTL, and the 400/403/405/413 responses. It also checks unknown ids and that other paths fall through to the assets.
- `tests/ui/results-badge.test.js` covers the proof and the rounding lines. `tests/ui/app-audit.test.js` covers the clamped discount in the proof, and print.
- `wrangler dev --local` was checked with curl:
  - POST returns 201 and GET serves the redirect page.
  - Missing ids give 404, a garbage body 400 and an oversize body 413.
  - `/`, `/assets/*` and `/sw.js` keep their `_headers`.
- In the browser, at 375 px, `scrollWidth == clientWidth` for both the host view and the shared view.
- The print rules were forced on in the browser and the result screenshotted: a light receipt with the date header and no dark boxes.
- `tests/ui/share-receipt.test.js` covers the share sheet: the URL is passed, `AbortError` does not copy, and any other error copies. It also covers the opt-in:
  - off by default, with one upload after opting in, cached for both Share and WhatsApp
  - unticked when the results go stale
  - falls back to the long link on a server error
