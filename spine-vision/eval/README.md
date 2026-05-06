# Evaluation

Score a candidate model against a fixed seed set so any change is
measurable.

## The seed set

`seed_set/` is a small (≈30) collection of hand-labeled spine photos.
**It does not change once shipped.** That's the point: stable
ground-truth so a year of model iterations is comparable.

Format:

```
seed_set/
├── 0001.jpg
├── 0002.jpg
├── ...
└── labels.jsonl
```

Each `labels.jsonl` row:

```json
{"image": "0001.jpg", "lines": ["The Bostonians", "Henry James"], "tilt_degrees": 90, "language": "en", "lighting": "indoor"}
```

`labels.jsonl` is the canonical ground-truth. Adding new labeled rows
means evolving v2 of the seed set — increment the version, don't
silently mutate v1.

## Running a score

```bash
node score.js paddle           # baseline: current PaddleOCR provider
node score.js spine model.onnx # candidate spine-vision model
```

Output:

```
Model:        spine-v0.1
Test set:     seed_set, 30 images
Macro-F1:      0.74
Per-image F1:  0.74 ± 0.11
Latency p50:   1.2 s
Latency p95:   2.4 s
Model size:    178 MB
PASS: macro-F1 0.74 > baseline + 5pp (0.66)
```

## Status

- `score.js` is a stub: takes `--help`, prints the planned interface.
- The real implementation lands once we have:
  1. The seed set committed (need ≥10 labeled images first)
  2. A baseline number from PaddleOCR to compare against
- Both blocked on the live site having any contributions to label.
