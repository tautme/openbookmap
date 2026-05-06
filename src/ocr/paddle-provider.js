import { splitOcrIntoTitles } from './index.js';

/**
 * PaddleOCR-via-ONNX provider. Lazy-loads ~16 MB of detection + recognition
 * models from `${BASE_URL}ocr-models/` on first use; never loaded on /map.
 *
 * Spines come in many orientations; OCR is far better on horizontal text.
 * extractTitles() runs OCR on the original plus 90° CCW and 90° CW rotations
 * and keeps the result with the highest mean recognition confidence.
 *
 * Models live under /public/ocr-models/ so Vite copies them to the build
 * output. We resolve their URL via Vite's BASE_URL so they work under any
 * URL prefix (openbookmap.org/, tautme.github.io/openbookmap/, …).
 */

const BASE = import.meta.env.BASE_URL || './';
const MODELS = `${BASE}ocr-models/`;

let ocrPromise = null;

async function getOcr() {
  if (ocrPromise) return ocrPromise;
  ocrPromise = (async () => {
    // Configure onnxruntime-web BEFORE the wrapper imports it.
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = MODELS;
    // GitHub Pages doesn't ship the COOP/COEP headers needed for threaded
    // wasm, so use the single-threaded build. Slower but reliable.
    ort.env.wasm.numThreads = 1;

    const Ocr = (await import('@gutenye/ocr-browser')).default;
    return Ocr.create({
      models: {
        detectionPath: `${MODELS}ch_PP-OCRv4_det_infer.onnx`,
        recognitionPath: `${MODELS}ch_PP-OCRv4_rec_infer.onnx`,
        dictionaryPath: `${MODELS}ppocr_keys_v1.txt`,
      },
    });
  })();
  return ocrPromise;
}

/**
 * Rotate a Blob image by `deg` (-90, 0, or 90). Returns a new JPEG Blob.
 */
async function rotateBlob(image, deg) {
  if (deg === 0) return image;
  const bitmap = await createImageBitmap(image);
  const w = bitmap.width;
  const h = bitmap.height;
  const swap = deg === 90 || deg === -90;
  const cw = swap ? h : w;
  const ch = swap ? w : h;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(cw, ch)
      : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const ctx = canvas.getContext('2d');
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2);
  bitmap.close?.();
  return canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    : new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
}

/**
 * Run OCR on a single Blob and return the lines + their mean confidence.
 */
async function ocrOnce(image) {
  const ocr = await getOcr();
  const url = URL.createObjectURL(image);
  try {
    const lines = (await ocr.detect(url)) || [];
    const good = lines.filter((l) => l && l.text);
    const meanConf = good.length ? good.reduce((s, l) => s + (l.mean ?? 0), 0) / good.length : 0;
    return { lines: good, meanConf };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {Blob | File} image
 * @returns {Promise<{raw: string, titles: string[], rotation: number}>}
 */
export async function extractTitles(image) {
  // Sequenced (not parallel) because the ORT session can't run more than
  // one inference at a time and we want predictable peak memory.
  const candidates = [];
  for (const deg of [0, -90, 90]) {
    const rotated = deg === 0 ? image : await rotateBlob(image, deg);
    const result = await ocrOnce(rotated);
    candidates.push({ ...result, rotation: deg });
  }

  // Pick by mean confidence first; if all zero, fall back to line count.
  const best = candidates.reduce((b, c) => {
    if (!b) return c;
    if (c.meanConf !== b.meanConf) return c.meanConf > b.meanConf ? c : b;
    return c.lines.length > b.lines.length ? c : b;
  }, null);

  const text = best.lines.map((l) => l.text).join('\n');
  return {
    raw: text,
    titles: splitOcrIntoTitles(text),
    rotation: best.rotation,
  };
}
