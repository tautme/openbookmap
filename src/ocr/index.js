/**
 * OCR provider interface.
 *
 * Any provider exports a single async function with the signature:
 *   extractTitles(image: Blob | File, opts?: { signal?: AbortSignal })
 *     => Promise<{ raw: string, titles: string[] }>
 *
 * - `raw` is the unprocessed OCR output (kept for debugging in the `books`
 *   table).
 * - `titles` is an array of plausible book-title candidates (one per line,
 *   normalized, deduplicated).
 *
 * A contributor reviews and confirms each title before we save it. Never
 * insert unconfirmed titles directly.
 *
 * Default provider: PaddleOCR via onnxruntime-web (more accurate on rotated /
 * stylized spines than Tesseract). Tesseract.js is kept as an automatic
 * fallback for browsers where ONNX wasm fails to load.
 */
import { extractTitles as paddleExtract } from './paddle-provider.js';
import { extractTitles as tesseractExtract } from './tesseract-provider.js';

const STORAGE_KEY = 'obm.ocr';

// Names accepted by `?ocr=<name>` and persisted in localStorage. A named
// provider runs alone (no fallback) so A/B comparison is clean; `default`
// restores the paddle→tesseract chain.
const NAMED_PROVIDERS = {
  paddle: paddleExtract,
  tesseract: tesseractExtract,
};

let active = defaultProvider();

function defaultProvider() {
  return withFallback(paddleExtract, tesseractExtract);
}

/**
 * Swap in a different OCR provider at runtime (e.g. a vision-LLM fallback).
 * Pass `null` to reset to the default.
 * @param {((image: Blob, opts?: object) => Promise<{raw: string, titles: string[]}>) | null} fn
 */
export function setOcrProvider(fn) {
  active = fn ?? defaultProvider();
}

/**
 * Run OCR on a single image.
 * @param {Blob | File} image
 * @param {{signal?: AbortSignal}} [opts]
 */
export function extractTitles(image, opts) {
  return active(image, opts);
}

/**
 * Build a provider that tries `primary` first and silently falls back to
 * `secondary` on any error. The fallback latches: once we hit an error,
 * subsequent calls go straight to `secondary` to avoid re-paying the cost
 * of a failing primary on every photo.
 */
function withFallback(primary, secondary) {
  let primaryFailed = false;
  return async function fallback(image, opts) {
    if (primaryFailed) return secondary(image, opts);
    try {
      return await primary(image, opts);
    } catch (err) {
      console.error('Primary OCR provider failed; falling back', err);
      primaryFailed = true;
      return secondary(image, opts);
    }
  };
}

/**
 * Split a block of raw OCR text into candidate titles.
 * Exported so providers can share the logic, and so it's unit-testable.
 * @param {string} raw
 * @returns {string[]}
 */
export function splitOcrIntoTitles(raw) {
  if (!raw) return [];
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    // drop short/gibberish lines — tune thresholds as real data arrives
    .filter((l) => l.length >= 4 && /[A-Za-zÀ-ɏ]/.test(l))
    // collapse repeated whitespace
    .map((l) => l.replace(/\s+/g, ' '));
  // dedupe preserving order
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// Boot-time provider selection for testing. Reads `?ocr=<name>` (and
// persists it to localStorage so the choice survives navigation), or the
// stored value if no URL param. `?ocr=default` clears the override.
// Browser-only — vitest imports this module in a node env.
if (typeof window !== 'undefined') applyProviderOverride();

function applyProviderOverride() {
  let choice;
  let source;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('ocr')) {
      choice = params.get('ocr');
      source = 'url';
      try {
        if (choice && choice !== 'default') {
          window.localStorage?.setItem(STORAGE_KEY, choice);
        } else {
          window.localStorage?.removeItem(STORAGE_KEY);
        }
      } catch {
        // localStorage may be disabled (private mode, sandboxed iframe).
      }
    } else {
      choice = window.localStorage?.getItem(STORAGE_KEY) ?? undefined;
      source = 'storage';
    }
  } catch (err) {
    console.warn('OCR provider override: failed to read URL/localStorage', err);
    return;
  }

  if (!choice || choice === 'default') return;

  const validNames = [...Object.keys(NAMED_PROVIDERS), 'default'].join(', ');
  const provider = NAMED_PROVIDERS[choice];
  if (provider) {
    setOcrProvider(provider);
    console.warn(
      `OCR provider override: ${choice} (from ${source}). ` +
        `Use ?ocr=default to reset. Valid: ${validNames}.`,
    );
  } else {
    console.warn(
      `Unknown OCR provider "${choice}" (from ${source}). ` +
        `Valid: ${validNames}. Using default.`,
    );
  }
}
