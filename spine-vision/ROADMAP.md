# spine-vision roadmap

Honest, dated milestones. Each box gets ticked when the corresponding
artifact is committed and reproducible from the listed inputs.

---

## v0 — "it runs at all" (~1 week, 1 person)

The minimum viable model. Goal: prove the data pipeline works and a
fine-tuned model beats raw PaddleOCR by ≥10 percentage points on the
seed set.

- [x] Repo scaffold (this directory)
- [ ] **Seed set** — hand-label 30 spine photos with ground-truth lines.
      Photos in `eval/seed_set/`, labels in `eval/seed_set/labels.jsonl`.
      One contributor, one afternoon.
- [ ] **Data export from Supabase** — `data/export.sql` returns every
      `(photo_url, confirmed_titles[])` from the `books` table where
      `confirmed = true`. Currently empty until the live site has
      contributions.
- [ ] **Florence-2 fine-tune** — run `training/finetune.ipynb` in Colab
      on the seed set + any live-site contributions. Output: a
      `pytorch_model.bin` checkpoint.
- [ ] **ONNX export** — convert the checkpoint to `model.onnx` ≤ 200 MB.
- [ ] **Eval baseline** — `node eval/score.js paddle` records the
      current PaddleOCR numbers as the baseline to beat.
- [ ] **v0 model evaluated** — `node eval/score.js spine-v0` and compare.

**Definition of done:** v0 model line-accuracy ≥ baseline + 10pp on the
seed set, model file under 200 MB.

---

## v0.5 — "browser-ready" (~1 week)

- [ ] **Adapter implementation** — `adapter/index.js` loads the ONNX
      model via `onnxruntime-web` (already vendored in main app) and
      implements `extractTitles(blob) → { titles, rawDetections, ... }`.
- [ ] **Wire into OpenBookMap** — change one line in `src/ocr/index.js`
      to import `./adapter/index.js` as the primary provider, keeping
      Tesseract as fallback.
- [ ] **Mobile-tested** — verified on iOS Safari + Android Chrome that
      a 1600 px photo OCRs in under 5 s.
- [ ] **Confidence calibration** — provider returns reliable per-line
      confidence so the contribute page can highlight low-confidence
      titles for review.

**Definition of done:** the live site uses `spine-vision` as default,
PaddleOCR/Tesseract as fallback, contributors notice no regression
or notice an improvement.

---

## v1 — "compounding" (~1 month)

- [ ] **Self-improving loop** — every confirmed contribution on the
      live site becomes a new training row automatically. Re-train
      monthly on Colab.
- [ ] **ISBN barcode support** — secondary task: detect any ISBN
      barcode visible in the photo and decode it.
- [ ] **Spine segmentation** — instead of OCR-ing the whole frame,
      detect each individual spine and OCR per crop. Bigger model
      improvement than any other change.
- [ ] **Multilingual** — currently English-only via the dictionary.
      Add at least French + Spanish.
- [ ] **Public benchmark site** — host the seed set + leaderboard at
      a github.io URL. Anyone can submit their model and see how it
      ranks.

**Definition of done:** any open-source contributor can fork
`spine-vision`, train, and publish a model that's measurably ranked
against ours.

---

## v2 — "spin out" (~3+ months)

- [ ] **Move to its own repo** at `github.com/tautme/spine-vision`.
- [ ] **`@spine-vision/adapter` on npm** — installable, versioned.
- [ ] **Dataset card on Hugging Face** — formal release of the
      training data with licensing + sheet of statistics.
- [ ] **Used at one bookshop** — real bookshop owner uses it for
      their own inventory, validates the use case beyond OpenBookMap.

---

## What's NOT on the roadmap (intentional)

- Building a model from scratch. Always fine-tune from a published
  base (Florence-2 / PaliGemma / Donut). Reinventing transformers
  for spines is a rabbit hole.
- Real-time video OCR. Stays out of scope until inference is < 200 ms.
- Cloud inference API. Stays in-browser for the privacy story and
  the $0 hosting cost. If we ever need a server, it's v3.
- Author/title parsing past raw line extraction. The model returns
  *lines*; matching them against an ISBN database is a downstream
  problem for OpenBookMap.
