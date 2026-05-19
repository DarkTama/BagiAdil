# BagiAdil - Project Plan & Progress

> Split your GoFood and ShopeeFood bills fairly and automatically.

---

## 1. Project Overview

BagiAdil is a client-side web application built with Vanilla JavaScript. Its primary purpose is to simplify and automate the process of splitting group food delivery bills (such as GoFood, ShopeeFood, and GrabFood). By porting the existing proportional discount and rounding logic from Python to the browser, and introducing OCR (Optical Character Recognition) capabilities, BagiAdil will eliminate the manual data entry currently required to calculate fair shares.

---

## 2. Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Receipt Parsing (OCR) | Upload screenshots or PDFs of receipts to automatically extract food items, quantities, and prices. | Planned |
| Interactive Assignment | Drag-and-drop or dropdown UI to assign extracted items to specific participants. | Planned |
| Proportional Math Engine | Calculates discounts proportionally based on the individual's subtotal relative to the whole order. | Planned |
| Intelligent Rounding | Rounds each person's final total to the nearest hundred Rupiah, ensuring the sum of all rounded payments exactly matches the total bill. | Planned |
| Automated Receipt Generation | Exports a clean, finalized receipt (HTML/PDF) showing what everyone owes. | Planned |

---

## 3. Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| Core | HTML5, CSS3, Vanilla JavaScript (ES6+) | Application foundation |
| Build Tool | Vite | Zero-config dev server, HMR, optimized builds |
| Financial Math | decimal.js or big.js | Replicating Python's `Decimal` behavior for exact calculations |
| OCR Engine | Tesseract.js | Client-side text recognition from receipt images |
| PDF Parsing | pdf.js (Mozilla) | Optional - extract text from PDF receipts |
| Export/Reporting | html2pdf.js or jspdf | Generate PDF summaries |
| Formatting | `Intl.NumberFormat('id-ID')` | Consistent Rupiah currency display |

---

## 4. Execution Phases & Progress

### Phase 0: Project Setup & Tooling
- [ ] Define folder structure (`src/`, `src/engine/`, `src/ocr/`, `src/ui/`, `assets/`, `tests/`)
- [ ] Initialize project with Vite
- [ ] Configure ESLint + Prettier
- [ ] Set up basic HTML shell with mobile-first responsive layout
- [ ] Add PWA manifest for offline use and "Add to Home Screen"

### Phase 1: Core Engine & Manual UI (The Foundation)
- [ ] Build basic UI structure (participant lists, manual entry fields)
- [ ] Implement decimal.js for exact financial calculations
- [ ] Implement Step A: Calculate Base Totals
- [ ] Implement Step B: Distribute Discount Proportionally
- [ ] Implement Step C: Distribute Shipping Evenly
- [ ] Implement Step D: Calculate Pre-Rounding Payments
- [ ] Implement Step E: Rounding to Nearest Hundred
- [ ] Implement Step F: Reconcile Rounding Differences
- [ ] Input validation (no negative prices, no empty names)
- [ ] Test against historical manual data to verify parity with the Python script

### Phase 2: OCR & Data Extraction
- [ ] Integrate Tesseract.js
- [ ] Develop Regex patterns for GoFood receipts
- [ ] Develop Regex patterns for ShopeeFood receipts
- [ ] Develop Regex patterns for GrabFood receipts
- [ ] Implement OCR confidence scoring (flag uncertain items for manual review)
- [ ] Error handling for blurry images or unrecognized text

### Phase 3: The Interactive Assigner UI
- [ ] Create dynamic list of extracted food items
- [ ] Build UI to add/manage "Participants"
- [ ] Allow users to assign items to participants (tap-to-assign + drag-and-drop)
- [ ] Implement real-time recalculations as items are assigned
- [ ] Mobile touch-friendly interactions

### Phase 4: Export, Polish, & Quality of Life
- [ ] Implement html2pdf.js for PDF export
- [ ] WhatsApp-friendly text summary (copy to clipboard)
- [ ] Add localStorage to remember frequent participants
- [ ] Privacy badge/note (all processing is client-side)
- [ ] Final UI polish and responsive testing

---

## 5. Core Calculation Logic

> Ported from `app-gofood-bat-latest.py`. Must be implemented using `decimal.js` with `ROUND_HALF_UP` precision.

### Step A: Calculate Base Totals
```
Total Food Cost = Sum of all individual orders
```

### Step B: Distribute Discount Proportionally
```
For each person:
  Discount = (Individual Order / Total Food Cost) * Total Discount
  Discounted Order = Individual Order - Discount
```

### Step C: Distribute Shipping Evenly
```
Shipping Per Person = Total Shipping Cost / Total Number of People
```

### Step D: Calculate Pre-Rounding Payments
```
For each person:
  Total Before Rounding = Discounted Order + Shipping Per Person
```

### Step E: Rounding to Nearest Hundred
```
For each person:
  Rounded Payment = int( (Total Before Rounding / 100) rounded HALF_UP ) * 100
```

### Step F: Reconcile Rounding Differences
```
Original Total = Sum of all (Total Before Rounding)
Rounded Total = Sum of all (Rounded Payments)
Difference = Original Total - Rounded Total
Find the Decimal Fraction for each person: (Total Before Rounding - Rounded Payment)
Identify the person with the HIGHEST Decimal Fraction
Add the 'Difference' to that person's Rounded Payment
Round their total to the nearest hundred again
```

### Edge Cases to Handle
| Case | Handling |
|------|----------|
| Single participant | Skip discount splitting, apply flat |
| Zero discount / zero shipping | Graceful handling when fields are empty or zero |
| Step F tie-breaking | Deterministic tiebreaker: first person in list order wins |
| Negative totals after discount | Guard against discounts exceeding item prices |

---

## 6. Future Enhancements

| Enhancement | Notes | Priority |
|-------------|-------|----------|
| Payment Integrations (QRIS, GoPay, DANA, BCA) | Requires backend/server component | Low |
| Multi-Receipt Merging | Support uploading multiple screenshots for a single large order | Medium |
| Dark Mode | UI theme toggle | Low |
| Receipt History | Store past splits in localStorage/IndexedDB | Medium |

---

## 7. Design Principles

- **Mobile-First**: Designed for phone use (splitting bills at restaurants or after ordering).
- **Privacy-First**: All processing happens client-side. No data leaves the browser.
- **Accuracy-First**: Financial math uses arbitrary-precision decimals, never floating point.
- **Indonesian Locale**: All currency formatted as `Rp XX.XXX` using `Intl.NumberFormat('id-ID')`.

---

## 8. Testing Strategy

- **Unit Tests**: Math engine (Phase 1) — critical to verify parity with Python.
- **Snapshot Tests**: OCR regex patterns against sample receipt images.
- **Integration Tests**: End-to-end flow from OCR → assignment → calculation → export.
- **Test Harness**: Historical data from the Python script used as ground truth.

---

*Last Updated: May 19, 2025*
