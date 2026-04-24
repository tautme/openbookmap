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
 */
import { extractTitles as tesseractExtract } from './tesseract-provider.js';

let active = tesseractExtract;

/**
 * Swap in a different OCR provider at runtime (e.g. a vision-LLM fallback).
 * @param {(image: Blob, opts?: object) => Promise<{raw: string, titles: string[]}>} fn
 */
export function setOcrProvider(fn) {
  active = fn;
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
 * Split a block of raw OCR text into candidate titles.
 * Exported so the provider can share the logic, and so it's unit-testable.
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
