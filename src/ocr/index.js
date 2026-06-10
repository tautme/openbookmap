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
 * Boot-time selection cascade (highest priority first):
 *   1. ?ocr=<name> URL param (persisted to localStorage)
 *   2. localStorage previous choice
 *   3. Auto-pick based on navigator.gpu (WebGPU → paddle, else → tesseract)
 *
 * This matters because we run primarily on smartphone browsers. iOS Safari
 * before 18 has no WebGPU and paddle on single-threaded WASM is painfully
 * slow there. Auto-pick gives a sane default; the UI exposes a manual
 * switch wired via `setOcrProviderByName`.
 */
import { extractTitles as paddleExtract } from './paddle-provider.js';
import { extractTitles as tesseractExtract } from './tesseract-provider.js';

const STORAGE_KEY = 'obm.ocr';
const TIMING_KEY = 'obm.ocr.timings';

const NAMED_PROVIDERS = {
  paddle: paddleExtract,
  tesseract: tesseractExtract,
};

const state = {
  /** @type {'paddle' | 'tesseract' | null} */
  name: null,
  /** @type {'url' | 'storage' | 'auto' | 'manual' | 'default'} */
  source: 'default',
  /** @type {(image: Blob, opts?: object) => Promise<{raw: string, titles: string[]}>} */
  fn: defaultProvider(),
};

/**
 * Run OCR on a single image. Wraps the active provider with a per-provider
 * timing measurement (persisted to localStorage so the UI can show
 * "2.4s last run" without keeping it in memory).
 */
export async function extractTitles(image, opts) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = await state.fn(image, opts);
  if (state.name && typeof window !== 'undefined') {
    const ms = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    );
    try {
      const timings = readTimings();
      timings[state.name] = ms;
      window.localStorage?.setItem(TIMING_KEY, JSON.stringify(timings));
    } catch {
      // Storage may be disabled (private mode, sandboxed iframe).
    }
  }
  return result;
}

/**
 * Inspect the currently-active OCR provider — used by UI to render the
 * picker indicator.
 * @returns {{name: 'paddle'|'tesseract'|null, source: 'url'|'storage'|'auto'|'manual'|'default'}}
 */
export function getActiveOcr() {
  return { name: state.name, source: state.source };
}

/**
 * Most recent measured runtime per provider, in ms. Empty until the user
 * runs OCR at least once with that provider in this browser.
 * @returns {{paddle?: number, tesseract?: number}}
 */
export function getOcrTimings() {
  if (typeof window === 'undefined') return {};
  return readTimings();
}

/**
 * Swap in a named provider. Optionally persist the choice to localStorage
 * (so the next page load re-uses it) and update the URL `?ocr=` param if
 * one is present (so a pinned URL stays in sync with the user's switch).
 * @param {'paddle' | 'tesseract'} name
 * @param {{persist?: boolean, source?: 'manual' | 'auto' | 'url' | 'storage'}} [opts]
 * @returns {boolean} true if the name was recognized.
 */
export function setOcrProviderByName(name, opts = {}) {
  const { persist = false, source = 'manual' } = opts;
  const fn = NAMED_PROVIDERS[name];
  if (!fn) return false;
  state.fn = fn;
  state.name = name;
  state.source = source;
  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(STORAGE_KEY, name);
    } catch {
      // Storage may be disabled.
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('ocr')) {
        url.searchParams.set('ocr', name);
        window.history.replaceState({}, '', url);
      }
    } catch {
      // URL mutation isn't safe in every embedding context.
    }
  }
  return true;
}

/**
 * Low-level escape hatch — pass a custom async fn (e.g. a vision-LLM
 * provider in a test). Pass null to reset to the auto-picked default.
 * @param {((image: Blob, opts?: object) => Promise<{raw: string, titles: string[]}>) | null} fn
 */
export function setOcrProvider(fn) {
  if (fn) {
    state.fn = fn;
    state.name = null;
    state.source = 'manual';
  } else {
    autoPick();
  }
}

/**
 * Clear URL `?ocr=` and localStorage override, then re-pick the provider
 * based on this device. Used by the contribute UI's "Reset to auto" path.
 */
export function resetOcrOverride() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('ocr')) {
      url.searchParams.delete('ocr');
      window.history.replaceState({}, '', url);
    }
  } catch {
    // ignore
  }
  autoPick();
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

// ---------- internals -------------------------------------------------

function defaultProvider() {
  return withFallback(paddleExtract, tesseractExtract);
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
 * navigator.gpu present → paddle (more accurate, GPU-accelerated)
 * navigator.gpu absent  → tesseract (lighter, faster on phones without WebGPU)
 *
 * Single binary signal is intentionally KISS. A timed benchmark would be
 * more honest but adds 0.5–1s to first load; WebGPU presence captures the
 * load-bearing distinction for the device classes we actually see.
 */
function pickProviderForDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) return 'paddle';
  return 'tesseract';
}

function autoPick() {
  const picked = pickProviderForDevice();
  setOcrProviderByName(picked, { source: 'auto' });
  const hasGpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  // Use warn so the boot decision is visible without violating the
  // project's no-console-log rule (eslint allows warn / error only).
  console.warn(`OCR: auto-picked ${picked} (${hasGpu ? 'WebGPU available' : 'no WebGPU'}).`);
}

function readTimings() {
  try {
    const raw = window.localStorage?.getItem(TIMING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ---------- boot ------------------------------------------------------

// Browser-only — vitest imports this module in a node env where window
// is undefined; the default fallback chain at the top of `state.fn`
// suffices for tests that don't actually run OCR.
if (typeof window !== 'undefined') initOcr();

function initOcr() {
  // 1. URL `?ocr=<name>` — highest priority, persisted to storage.
  let urlChoice = null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('ocr')) urlChoice = (params.get('ocr') || '').trim();
  } catch {
    // ignore — fall through to next step
  }

  if (urlChoice === 'default') {
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    autoPick();
    return;
  }
  if (urlChoice && NAMED_PROVIDERS[urlChoice]) {
    setOcrProviderByName(urlChoice, { persist: true, source: 'url' });
    console.warn(`OCR: pinned to ${urlChoice} via URL. Use ?ocr=default to reset.`);
    return;
  }
  if (urlChoice) {
    console.warn(
      `OCR: unknown provider "${urlChoice}". Valid: ${Object.keys(NAMED_PROVIDERS).join(', ')}. Falling back to auto.`,
    );
  }

  // 2. localStorage previous choice (set last time the user switched).
  let stored = null;
  try {
    stored = window.localStorage?.getItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  if (stored && NAMED_PROVIDERS[stored]) {
    setOcrProviderByName(stored, { source: 'storage' });
    return;
  }

  // 3. Auto-pick based on this device's WebGPU support.
  autoPick();
}
