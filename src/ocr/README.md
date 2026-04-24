# OCR providers

The contribute flow calls `extractTitles(image)` from `./index.js`. The
function returns `{ raw, titles }` where `titles` is a deduplicated array
of plausible book-title strings.

## Current provider

`tesseract-provider.js` uses Tesseract.js (in-browser, English language
model). Accuracy is around 50–65% on well-lit spines. It's free and keeps
all data client-side.

## Adding a new provider (e.g. a vision-LLM fallback)

1. Create `my-provider.js` with a default-exported `extractTitles` that
   matches the signature in `./index.js`.
2. Call `setOcrProvider(myExtract)` at app startup (or per-photo based on
   Tesseract's confidence).
3. Keep `raw` populated so the `books` table retains the source OCR text
   for debugging.

The split-into-candidate-titles logic lives in `splitOcrIntoTitles` and
is shared across providers.
