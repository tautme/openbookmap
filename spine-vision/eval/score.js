#!/usr/bin/env node
/**
 * spine-vision · evaluation runner
 *
 * Usage:
 *   node score.js paddle              # baseline provider
 *   node score.js spine model.onnx    # candidate spine-vision model
 *
 * Reads seed_set/labels.jsonl, runs the chosen provider on each image,
 * computes per-line macro-F1 with Levenshtein-based matching as
 * defined in BENCHMARKS.md.
 *
 * STATUS: skeleton. Real provider runs and Levenshtein scoring land
 * once the seed set has ≥10 labeled images.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_SET = path.join(__dirname, 'seed_set');
const LABELS_PATH = path.join(SEED_SET, 'labels.jsonl');

const SIM_THRESHOLD = 0.85;

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  const n = Math.max(a.length, b.length);
  if (!n) return 1;
  return 1 - levenshtein(a.toLowerCase().trim(), b.toLowerCase().trim()) / n;
}

function scoreImage(predicted, truth) {
  // Greedy bipartite match: for each prediction, pick the best
  // unmatched ground-truth line. Both are unordered sets.
  const matched = new Set();
  let correct = 0;
  for (const p of predicted) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < truth.length; i++) {
      if (matched.has(i)) continue;
      const s = similarity(p, truth[i]);
      if (s > bestSim) {
        bestSim = s;
        bestIdx = i;
      }
    }
    if (bestSim >= SIM_THRESHOLD && bestIdx >= 0) {
      matched.add(bestIdx);
      correct++;
    }
  }
  const precision = predicted.length ? correct / predicted.length : 0;
  const recall = truth.length ? correct / truth.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, correct, predicted: predicted.length, truth: truth.length };
}

async function loadLabels() {
  try {
    const raw = await fs.readFile(LABELS_PATH, 'utf8');
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(
        `seed set not found at ${LABELS_PATH}.\n` +
          'Add labeled spine photos there before running scoring.',
      );
      process.exit(2);
    }
    throw e;
  }
}

async function runProvider(_provider, _modelPath, _imagePath) {
  // TODO: wire to the real providers once they're installable from
  // here. Two paths:
  //   - 'paddle': import the parent project's paddle-provider.js,
  //     run it on the image (need to feed it a Blob; in Node use
  //     a polyfill or call Tesseract directly via tesseract.js Node).
  //   - 'spine': load the ONNX model via onnxruntime-node, run
  //     inference per the adapter's preprocessing.
  // For now: stub return.
  return { lines: [] };
}

async function main(argv) {
  const provider = argv[2];
  const modelPath = argv[3];
  if (!provider || provider === '--help') {
    console.log('Usage: node score.js <provider> [model.onnx]');
    console.log('  provider: paddle | spine');
    process.exit(provider === '--help' ? 0 : 2);
  }

  const labels = await loadLabels();
  if (!labels.length) {
    console.error('seed set is empty. Add at least one labeled image.');
    process.exit(2);
  }

  const perImage = [];
  for (const row of labels) {
    const img = path.join(SEED_SET, row.image);
    const t0 = performance.now();
    const out = await runProvider(provider, modelPath, img);
    const dt = performance.now() - t0;
    const score = scoreImage(out.lines || [], row.lines || []);
    perImage.push({ ...score, latency: dt });
  }

  const macroF1 = perImage.reduce((s, r) => s + r.f1, 0) / perImage.length;
  const variance =
    perImage.reduce((s, r) => s + (r.f1 - macroF1) ** 2, 0) / perImage.length;
  const stddev = Math.sqrt(variance);
  const latencies = perImage.map((r) => r.latency).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log(`Model:        ${provider}${modelPath ? ' ' + path.basename(modelPath) : ''}`);
  console.log(`Test set:     seed_set, ${perImage.length} images`);
  console.log(`Macro-F1:     ${macroF1.toFixed(2)}`);
  console.log(`Per-image F1: ${macroF1.toFixed(2)} ± ${stddev.toFixed(2)}`);
  console.log(`Latency p50:  ${(p50 / 1000).toFixed(2)} s`);
  console.log(`Latency p95:  ${(p95 / 1000).toFixed(2)} s`);
}

main(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
