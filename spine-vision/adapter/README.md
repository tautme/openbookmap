# Browser adapter

Implements the same `extractTitles(image) → { titles, ... }` interface
used by `src/ocr/tesseract-provider.js` and `src/ocr/paddle-provider.js`,
backed by the spine-vision ONNX model.

## How it works

1. Lazy-loads `model.onnx` from `${BASE_URL}spine-vision/model.onnx` on
   first call. ~150 MB on the wire; cached after first load.
2. Lazy-loads `onnxruntime-web` (already a dep of the main app, so no
   new dependency cost).
3. Pre-rotates the input 90° CCW (spines are vertical → horizontal).
4. Runs inference, parses the model's text output into `{ title,
   author, isbn, confidence }` per line.
5. Returns the same shape the existing OCR providers do.

## Wiring it in

When `model.onnx` is available, edit `src/ocr/index.js` of the parent
project:

```diff
- import { extractTitles as paddleExtract } from './paddle-provider.js';
+ import { extractTitles as spineExtract } from '../../spine-vision/adapter/index.js';
  import { extractTitles as tesseractExtract } from './tesseract-provider.js';

- let active = withFallback(paddleExtract, tesseractExtract);
+ let active = withFallback(spineExtract, tesseractExtract);
```

Tesseract stays as the safety net.

## Status

`index.js` is currently a **shim**: it re-exports PaddleOCR so callers
that import from this directory don't break, and includes a `TODO`
where the real ONNX inference goes once weights exist. The shim lets
the rest of the codebase reference this adapter without breaking
builds.

## Output schema

```ts
type ExtractResult = {
  titles: Array<{
    title: string;
    author?: string;
    isbn?: string;
    confidence: number;     // 0..1
    bbox?: [x: number, y: number, w: number, h: number];  // pixels
  }>;
  rawDetections: unknown[]; // model-specific, kept for debugging
  modelVersion: string;     // 'spine-v0.1' | 'spine-v0.2' | 'paddle-shim'
  rotation: number;         // degrees applied before inference
  latencyMs: number;
};
```
