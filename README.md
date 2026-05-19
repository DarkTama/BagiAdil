# BagiAdil

**Split your GoFood, ShopeeFood, and GrabFood bills fairly and automatically.**

A client-side web app that uses OCR to read food delivery receipts, applies proportional discounts, distributes shipping evenly, and uses intelligent rounding logic to calculate exactly what everyone owes -- no manual math required.

---

## Features

- **Receipt OCR** -- Upload GoFood, ShopeeFood, or GrabFood receipt screenshots; items and prices are extracted automatically via Tesseract.js
- **Proportional Discount Distribution** -- Discounts are split fairly based on each person's order proportion, not divided equally
- **Even Shipping Split** -- Shipping cost is divided equally among all participants
- **Intelligent Rounding** -- Rounds to nearest Rp 100 with reconciliation so the total always balances perfectly
- **Interactive Assignment** -- Tap-to-assign or drag-and-drop items to participants with color-coded visual feedback
- **Real-Time Calculation** -- Results update instantly as items are assigned
- **Export Options** -- PDF export (via html2pdf.js) and WhatsApp-friendly text summary with copy-to-clipboard
- **PWA Support** -- Installable to home screen for quick offline access
- **Privacy-First** -- All processing happens in the browser; no data is sent to any server
- **Mobile-First Design** -- Optimized for phone use where bill splitting actually happens

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm v9 or higher

### Installation

```bash
git clone https://github.com/DarkTama/BagiAdil.git
cd BagiAdil
npm install
```

### Usage

Start the development server with hot module replacement:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Available Scripts

| Script             | Command                  | Description                          |
| ------------------ | ------------------------ | ------------------------------------ |
| `npm run dev`      | `vite`                   | Start dev server with HMR            |
| `npm run build`    | `vite build`             | Production build to `dist/`          |
| `npm run preview`  | `vite preview`           | Preview production build             |
| `npm run test`     | `vitest run`             | Run all unit tests                   |
| `npm run lint`     | `eslint .`               | Lint source files                    |
| `npm run format`   | `prettier --write .`     | Format all files with Prettier       |

---

## Project Structure

```
BagiAdil/
├── index.html              # Entry point
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker for offline support
├── vite.config.js          # Vite configuration
├── package.json
├── src/
│   ├── main.js             # Application entry point
│   ├── engine/
│   │   ├── calculator.js   # Core 6-step calculation engine (decimal.js)
│   │   └── formatter.js    # Indonesian Rupiah formatting (Intl.NumberFormat)
│   ├── ocr/
│   │   ├── ocr-engine.js   # Tesseract.js wrapper with lazy loading
│   │   ├── confidence.js   # OCR confidence scoring
│   │   └── parsers/
│   │       ├── index.js    # Parser registry and auto-detection
│   │       ├── gofood.js   # GoFood receipt parser
│   │       ├── shopeefood.js # ShopeeFood receipt parser
│   │       └── grabfood.js # GrabFood receipt parser
│   ├── ui/
│   │   ├── app.js          # Main app orchestration
│   │   ├── upload.js       # Receipt image upload (drag-and-drop + camera)
│   │   ├── ocr-results.js  # OCR results display with editable fields
│   │   ├── participants.js # Participant management
│   │   ├── items.js        # Food item entry management
│   │   ├── bill-params.js  # Bill parameter inputs (discount, shipping)
│   │   ├── assigner.js     # Interactive drag-and-drop item assignment
│   │   ├── results.js      # Results display with per-person breakdown
│   │   ├── export.js       # PDF export and WhatsApp text summary
│   │   └── storage.js      # localStorage for frequent participants
│   └── styles/
│       └── main.css        # Mobile-first responsive styles
└── tests/
    ├── engine/
    │   ├── calculator.test.js
    │   └── formatter.test.js
    ├── ocr/
    │   ├── confidence.test.js
    │   └── parsers.test.js
    └── ui/
        ├── assigner.test.js
        ├── export.test.js
        ├── integration.test.js
        └── storage.test.js
```

---

## How It Works

BagiAdil uses a deterministic 6-step calculation engine to ensure fair and accurate bill splitting:

### Step A: Total Food Cost

Sum all individual item prices to get the total food cost before adjustments.

### Step B: Proportional Discount

Each person's discount share is calculated proportionally:

```
person_discount = (person_subtotal / total_food_cost) * total_discount
```

Someone who ordered more expensive items bears a larger share of the discount -- this is fairer than an equal split.

### Step C: Even Shipping Split

Shipping cost is divided equally among all participants:

```
person_shipping = total_shipping / number_of_participants
```

### Step D: Pre-Rounding Total

```
person_total = person_subtotal - person_discount + person_shipping
```

### Step E: Rounding

Each person's total is rounded to the nearest Rp 100 using ROUND_HALF_UP:

```
person_rounded = round(person_total, nearest 100)
```

### Step F: Reconciliation

The sum of rounded amounts may differ from the actual total. The difference is added to the person whose pre-rounded amount had the highest fractional component (closest to rounding up). This ensures the group total always matches exactly.

All arithmetic uses [decimal.js](https://github.com/MikeMcl/decimal.js) to avoid floating-point errors common in financial calculations.

---

## Tech Stack

| Layer         | Technology                                                   |
| ------------- | ------------------------------------------------------------ |
| Language      | Vanilla JavaScript (ES6+ modules)                            |
| Build Tool    | [Vite](https://vitejs.dev/) 6.x                             |
| Precision     | [decimal.js](https://github.com/MikeMcl/decimal.js) 10.x    |
| OCR           | [Tesseract.js](https://github.com/naptha/tesseract.js) 7.x  |
| PDF Export    | [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) 0.14|
| Testing       | [Vitest](https://vitest.dev/) 3.x                            |
| Linting       | [ESLint](https://eslint.org/) 9.x + Prettier 3.x            |
| DOM Testing   | [jsdom](https://github.com/jsdom/jsdom) 29.x                |

---

## Testing

Run the full test suite (104 tests):

```bash
npm run test
```

Tests cover:

- **Calculation engine** -- Proportional discount distribution, shipping splits, rounding, reconciliation, edge cases (zero amounts, single participant, large groups)
- **Receipt parsers** -- GoFood, ShopeeFood, and GrabFood format parsing with confidence scoring
- **UI logic** -- Item assignment, unassignment, reassignment, total recalculation, export text generation, localStorage persistence
- **Integration** -- End-to-end flows from item entry through assignment to final results

---

## Design Principles

**Mobile-First** -- The primary use case is splitting a bill at a restaurant or after a delivery arrives. The interface is designed for phones first.

**Privacy-First** -- All processing (OCR, calculation, export) happens entirely in the browser. No data is transmitted to any server. No analytics. No tracking.

**Accuracy-First** -- Financial calculations use decimal.js with ROUND_HALF_UP rounding mode. Floating-point arithmetic is never used for money. The reconciliation step guarantees the group total always balances to the cent.

**Indonesian Locale** -- Currency is formatted as Rp XX.XXX using `Intl.NumberFormat('id-ID')`. Rounding granularity is Rp 100, matching common Indonesian payment conventions.

---

## License

[MIT](LICENSE)
