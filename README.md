# BagiAdil

Split your GoFood, ShopeeFood, and GrabFood bills fairly and automatically. A client-side web app using OCR to read receipts, proportional discount distribution, even shipping split, and intelligent rounding to nearest Rp 100.

## Features

- Receipt OCR (GoFood, ShopeeFood, GrabFood)
- PDF receipt support
- Proportional Discount Distribution
- Even Shipping Split
- Intelligent Rounding to nearest Rp 100
- Interactive drag-and-drop Assignment
- Real-Time Calculation
- PDF Export and WhatsApp text summary
- PWA Support
- Privacy-First (all client-side)
- Mobile-First Design
- Bilingual (Indonesian and English)

## Getting Started

### Prerequisites

- Node 18+
- npm 9+

### Installation

```bash
git clone https://github.com/DarkTama/BagiAdil.git
cd BagiAdil
npm install
```

### Usage

```bash
npm run dev       # development
npm run build     # production
npm run preview   # preview build
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run test suite with Vitest |
| `npm run lint` | Lint code with ESLint |
| `npm run format` | Format code with Prettier |

## Project Structure

```
BagiAdil/
├── index.html
├── src/
│   ├── main.js
│   ├── engine/
│   │   ├── calculator.js
│   │   └── formatter.js
│   ├── i18n/
│   │   ├── index.js
│   │   ├── id.js
│   │   └── en.js
│   ├── ocr/
│   │   ├── ocr-engine.js
│   │   ├── confidence.js
│   │   └── parsers/
│   │       ├── index.js
│   │       ├── gofood.js
│   │       ├── grabfood.js
│   │       └── shopeefood.js
│   ├── styles/
│   │   └── main.css
│   └── ui/
│       ├── app.js
│       ├── assigner.js
│       ├── bill-params.js
│       ├── export.js
│       ├── items.js
│       ├── ocr-results.js
│       ├── participants.js
│       ├── results.js
│       ├── storage.js
│       └── upload.js
├── tests/
│   ├── engine/
│   ├── ocr/
│   └── ui/
├── package.json
├── vite.config.js
└── manifest.json
```

## How It Works

A. **Input** - Enter participants and their food items with prices, or scan a receipt using OCR

B. **Recognition** - OCR engine (Tesseract.js) extracts text from receipt images, parsers identify items and prices for GoFood, ShopeeFood, and GrabFood formats

C. **Assignment** - Drag and drop items to assign them to participants, or use the dropdown selector

D. **Discount Distribution** - Total discount is distributed proportionally based on each participant's order subtotal

E. **Shipping Split** - Delivery fee is split evenly among all participants

F. **Rounding** - Final amounts are rounded to the nearest Rp 100 using intelligent rounding that preserves the total

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Vanilla JS | Core application logic |
| Vite | Build tool and dev server |
| decimal.js | Precise decimal arithmetic |
| Tesseract.js | OCR engine for receipt scanning |
| pdfjs-dist | PDF receipt support |
| html2pdf.js | PDF export generation |
| Vitest | Unit and integration testing |
| ESLint + Prettier | Code quality and formatting |

## Testing

The project has comprehensive tests covering the calculation engine, OCR parsers, and UI components. Run with `npm test` or `npx vitest run`.

## Design Principles

- **Mobile-First** - Designed for phone use at the dinner table
- **Privacy-First** - All processing happens in the browser, no server calls
- **Accuracy-First** - Uses decimal.js for precise arithmetic, intelligent rounding preserves totals
- **Indonesian Locale** - Defaults to Indonesian language and Rupiah formatting

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.
