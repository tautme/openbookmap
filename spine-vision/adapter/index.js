/**
 * spine-vision · browser adapter
 *
 * Implements `extractTitles(image) → { raw, titles, ... }` matching the
 * existing OCR provider interface in `src/ocr/`.
 *
 * STATUS: shim.
 *   - Until `model.onnx` exists, this re-exports PaddleOCR so callers
 *     that import from spine-vision keep working.
 *   - The real implementation lives below in `extractTitlesNative`,
 *     gated behind the model file existing on the server.
 *
 * Once the first trained model is committed under
 * `public/spine-vision/model.onnx` (in the parent project), the
 * adapter automatically prefers the native path. No code change in
 * the consumer.
 */

import { extractTitles as paddleExtract } from '../../src/ocr/paddle-provider.js';
import { splitOcrIntoTitles } from '../../src/ocr/index.js';

const MODEL_VERSION = 'spine-v0-shim';
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
const MODEL_URL = `${BASE}spine-vision/model.onnx`;

// Cached probe result: did the server actually ship a model file?
let nativeAvailablePromise = null;
function nativeAvailable() {
  if (nativeAvailablePromise) return nativeAvailablePromise;
  nativeAvailablePromise = (async () => {
    try {
      const res = await fetch(MODEL_URL, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  })();
  return nativeAvailablePromise;
}

/**
 * Public entry point. Same signature as the existing providers.
 * @param {Blob | File} image
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{raw: string, titles: string[], modelVersion: string, latencyMs: number, rotation: number}>}
 */
export async function extractTitles(image, opts) {
  const t0 = performance.now();
  const useNative = await nativeAvailable();
  if (useNative) {
    return wrapResult(await extractTitlesNative(image, opts), t0);
  }
  // Shim path: PaddleOCR returns `{ raw, titles, rotation }`. Normalize
  // it to the same enriched shape spine-vision will return.
  const paddle = await paddleExtract(image, opts);
  return wrapResult(
    {
      raw: paddle.raw,
      titles: paddle.titles,
      rotation: paddle.rotation ?? -90,
      modelVersion: 'paddle-shim',
    },
    t0,
  );
}

function wrapResult(r, t0) {
  return {
    raw: r.raw ?? '',
    titles: r.titles ?? [],
    modelVersion: r.modelVersion ?? MODEL_VERSION,
    rotation: r.rotation ?? 0,
    latencyMs: Math.round(performance.now() - t0),
  };
}

/**
 * Native spine-vision inference. Implemented once `model.onnx` exists.
 * Sketch — fill in when the model is trained:
 *
 *   1. Lazy-import onnxruntime-web (already a dep of the main app).
 *   2. Lazy-fetch MODEL_URL into a Uint8Array, build an InferenceSession.
 *   3. Pre-process: rotate 90° CCW, resize to model input (e.g. 768×768),
 *      normalise.
 *   4. Run inference; parse text tokens via the bundled tokenizer.
 *   5. Return { raw, titles, rotation: -90, modelVersion: 'spine-v0.x' }.
 */
async function extractTitlesNative(_image, _opts) {
  // Intentionally not implemented yet. nativeAvailable() should return
  // false until model.onnx ships, but if a misconfigured server returns
  // a 200 here despite no model, fall back to the shim path explicitly.
  console.warn('spine-vision native path stubbed; falling back to shim');
  const paddle = await paddleExtract(_image, _opts);
  return {
    raw: paddle.raw,
    titles: paddle.titles,
    rotation: paddle.rotation ?? -90,
    modelVersion: 'paddle-shim-fallback',
  };
}

// Re-exported so anything wiring this in for tests can sanity-split
// the same way the providers do.
export { splitOcrIntoTitles };
