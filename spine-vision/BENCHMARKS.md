# Benchmarks

How we score a candidate model and decide if it's better than what
came before.

## Test set

`eval/seed_set/` — a small (~30 image) collection of spine photos with
hand-curated ground-truth labels in `labels.jsonl`. Each row:

```json
{
  "image": "eval/seed_set/0001.jpg",
  "lines": ["The Bostonians", "Henry James"],
  "tilt_degrees": 90,
  "language": "en",
  "lighting": "indoor",
  "notes": "shrink-wrapped, glare on top"
}
```

Hand-labeled by humans. Lines are listed in the order they appear top-
to-bottom on the spine.

The seed set lives in the repo so any contributor can clone, train,
and run scoring offline. It's small on purpose — we want to test
diverse hard cases, not average performance on a million spines.

## The score

For each predicted line, find the best matching ground-truth line by
**character-level Levenshtein** distance, normalised by the longer
string's length. A line is "correct" if its best-match similarity is
≥ 0.85.

Per image:

- **precision** = correct predictions / total predictions
- **recall**    = correct predictions / total ground-truth lines
- **F1**        = harmonic mean

Aggregate across the test set with **macro-F1** (mean of per-image F1)
to weight every photo equally regardless of how many spines it
contains.

```
score = mean(F1 per image)
```

## What we report

```
$ node eval/score.js paddle
Model:        paddleocr-pp-ocrv4 (90° CCW preprocess)
Test set:     eval/seed_set, 30 images
Per-image F1:  0.61 ± 0.18
Macro-F1:      0.61
Latency p50:   8.3 s
Latency p95:  14.1 s
```

We track:

1. **Macro-F1** — the headline number. Higher is better. Baseline to
   beat: PaddleOCR with 90° CCW preprocessing.
2. **Per-image F1 standard deviation** — proxy for consistency. Lower
   is better. A model with macro-F1 0.7 ± 0.3 is worse in practice
   than 0.65 ± 0.05.
3. **Latency p50 / p95** — measured on a desktop CPU as a stable
   reference point. Mobile is slower; we extrapolate.
4. **Model size** — gated to 200 MB max for browser delivery.

## Promotion criteria

A new model replaces the production default if **all** of:

- Macro-F1 ≥ baseline + 5pp (or current default + 2pp for incremental
  improvements)
- Per-image F1 std ≤ baseline std (we don't accept a more-erratic model)
- Latency p95 ≤ 1.5× baseline (we don't accept a 5× slower model just
  for accuracy)
- Model size ≤ 200 MB

Otherwise the candidate is logged in `eval/runs.jsonl` for posterity
but doesn't ship.

## What we *don't* score (yet)

- ISBN extraction accuracy — coming with v1.
- Spine localization (bounding boxes) — coming with v1.
- Multilingual accuracy — coming when we have a French or Spanish
  test set.
- Real-world inference on phones — too noisy. We extrapolate from
  desktop p95.
