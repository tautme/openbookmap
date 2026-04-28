# OCR providers

The contribute flow calls `extractTitles(image)` from `./index.js`. The
function returns `{ raw, titles }` where `titles` is a deduplicated array
of plausible book-title strings.

## Active stack

1. **`paddle-provider.js`** — default. PaddleOCR PP-OCRv4 detection +
   recognition, run client-side via `onnxruntime-web`. Better than
   Tesseract on rotated, ornate, or stylized spines. ~16 MB of model
   weights, lazy-loaded only on `/contribute`.
2. **`tesseract-provider.js`** — automatic fallback when the Paddle
   provider fails to load (e.g., browser without WebAssembly SIMD, or a
   blocked model fetch). The fallback latches: once a primary call has
   failed, subsequent calls go straight to Tesseract until the page
   reloads.

## Where the models live

- `public/ocr-models/ch_PP-OCRv4_det_infer.onnx` — text detection (~5 MB).
- `public/ocr-models/ch_PP-OCRv4_rec_infer.onnx` — text recognition (~11 MB).
- `public/ocr-models/ppocr_keys_v1.txt` — recognition dictionary.
- `public/ocr-models/ort-wasm-simd-threaded.{mjs,wasm}` — onnxruntime-web wasm
  glue, copied from `node_modules/onnxruntime-web/dist/`.

These are committed to the repo so GitHub Pages can serve them at the same
origin as the page (avoids cross-origin wasm restrictions).

If you upgrade `onnxruntime-web` or `@gutenye/ocr-models`, refresh the
copies under `public/ocr-models/` to match.

## Adding a new provider (e.g. a vision-LLM)

1. Create `my-provider.js` exporting `extractTitles(image, opts)` matching
   the signature in `./index.js`.
2. Call `setOcrProvider(myExtract)` at app startup, or wrap with
   `withFallback(myExtract, paddleExtract)` to chain.
3. Keep `raw` populated so the `books` table retains source OCR text for
   debugging.

The split-into-candidate-titles logic lives in `splitOcrIntoTitles` and
is shared across providers.
