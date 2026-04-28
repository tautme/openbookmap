import { splitOcrIntoTitles } from './index.js';

/**
 * PaddleOCR-via-ONNX provider. Lazy-loads ~16 MB of detection + recognition
 * models from /ocr-models/ on first use; never loaded on /map.
 *
 * Browser path: image (Blob | File) → object URL → @gutenye/ocr-browser
 * → PaddleOCR PP-OCRv4 detection + recognition → array of text lines.
 *
 * Models live under /public/ocr-models/ so Vite serves them as static
 * assets at the same origin as the page (avoids cross-origin wasm issues).
 */

let ocrPromise = null;

async function getOcr() {
  if (ocrPromise) return ocrPromise;
  ocrPromise = (async () => {
    // Configure onnxruntime-web BEFORE the wrapper imports it. The .wasm
    // glue files were copied into /ocr-models/ during the build; pointing
    // ORT there avoids the default `import.meta.url` resolution that breaks
    // when bundlers move the JS but not the wasm.
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/ocr-models/';
    // GitHub Pages doesn't ship the COOP/COEP headers needed for threaded
    // wasm, so use the single-threaded build. Slower but reliable.
    ort.env.wasm.numThreads = 1;

    const Ocr = (await import('@gutenye/ocr-browser')).default;
    return Ocr.create({
      models: {
        detectionPath: '/ocr-models/ch_PP-OCRv4_det_infer.onnx',
        recognitionPath: '/ocr-models/ch_PP-OCRv4_rec_infer.onnx',
        dictionaryPath: '/ocr-models/ppocr_keys_v1.txt',
      },
    });
  })();
  return ocrPromise;
}

/**
 * @param {Blob | File} image
 * @param {{signal?: AbortSignal}} [_opts]  Reserved; PaddleOCR doesn't expose abort yet.
 * @returns {Promise<{raw: string, titles: string[]}>}
 */
export async function extractTitles(image, _opts) {
  const ocr = await getOcr();
  // The wrapper takes a URL string; convert the Blob to a temporary blob: URL.
  const url = URL.createObjectURL(image);
  try {
    const lines = await ocr.detect(url);
    const text = (lines || [])
      .map((l) => l.text)
      .filter(Boolean)
      .join('\n');
    return {
      raw: text,
      titles: splitOcrIntoTitles(text),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
