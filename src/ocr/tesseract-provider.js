import { splitOcrIntoTitles } from './index.js';

/**
 * Tesseract.js-backed OCR.
 *
 * Lazy-loads the ~10MB wasm bundle only when first called. This keeps the
 * initial page weight down — `/map` never pays the cost, only `/contribute`.
 */
let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // English-only for now. Pass an array here (['eng', 'fra', 'jpn']) when
      // we add language selection in the contribute UI.
      return createWorker('eng');
    })();
  }
  return workerPromise;
}

/**
 * @param {Blob | File} image
 * @param {{signal?: AbortSignal}} [opts]
 */
export async function extractTitles(image, _opts) {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(image);
  return {
    raw: text ?? '',
    titles: splitOcrIntoTitles(text ?? ''),
  };
}

/** Tear down the worker if the user leaves the upload flow. */
export async function terminateOcr() {
  if (!workerPromise) return;
  const w = await workerPromise;
  await w.terminate();
  workerPromise = null;
}
