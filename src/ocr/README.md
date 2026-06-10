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

## Picking a provider

On boot the OCR module walks a three-step cascade:

1. `?ocr=<name>` URL parameter (highest priority, persisted to
   `localStorage`).
2. Previously-chosen provider stored under `localStorage['obm.ocr']`.
3. **Auto-pick based on this device**: if `navigator.gpu` is present
   (WebGPU) → `paddle`; otherwise → `tesseract`. Logged to the console
   at load: `OCR: auto-picked tesseract (no WebGPU).`

The contribute page surfaces a compact picker at the top of the upload
card — `OCR: **Paddle** [auto] · 2.4s last run · [Switch to Tesseract]`.
Tapping the switch button writes the chosen provider to `localStorage`
(and rewrites `?ocr=` if it's in the URL) so subsequent uploads use it.

### Forcing a provider for testing

`?ocr=<name>` still works for ad-hoc A/B testing without code changes:

- `?ocr=paddle` — PaddleOCR only.
- `?ocr=tesseract` — Tesseract only.
- `?ocr=default` — clear the override; restore the auto-pick.

The choice persists in `localStorage` under `obm.ocr`, so subsequent
navigations keep the override until you pass `?ocr=default` (or clear
site data). The active override logs a `console.warn` at boot so a
stale value can't silently skew a session weeks later.

To register a new name, add it to `NAMED_PROVIDERS` in `index.js`.

## Adding a new provider (e.g. a vision-LLM)

1. Create `my-provider.js` exporting `extractTitles(image, opts)` matching
   the signature in `./index.js`.
2. Call `setOcrProvider(myExtract)` at app startup, or wrap with
   `withFallback(myExtract, paddleExtract)` to chain.
3. Keep `raw` populated so the `books` table retains source OCR text for
   debugging.

The split-into-candidate-titles logic lives in `splitOcrIntoTitles` and
is shared across providers.
