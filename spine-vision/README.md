# spine-vision

A custom vision model for extracting **title, author, and ISBN** from photos
of book spines. Fast, accurate, runs in a browser.

This is the **core technology** behind OpenBookMap. The architecture
deliberately separates the model from the product so that:

- libraries cataloging stacks,
- second-hand bookshops digitizing inventory,
- archives,
- personal "what's on my shelf?" tools

…can all use the same model and contribute to the same dataset.

> **Status: pre-v0 scaffold.** No trained weights yet. Training pipeline,
> dataset export, evaluation harness, and browser adapter are wired up.
> First fine-tuning run requires a one-time pass through Colab (free GPU
> tier is enough). Roadmap below.

This directory will eventually move to its own repo (`tautme/spine-vision`).
Lives here for now because the dataset comes from OpenBookMap's Supabase
and the first customer is OpenBookMap's `/contribute` page.

---

## Why this exists

Off-the-shelf OCR is mediocre on book spines. Tesseract.js manages
~50–65% line accuracy on well-lit print. PaddleOCR is better but slow
(~5–10 s per photo) and still hallucinates on ornate fonts, curved type,
and mixed-language spines.

Spines have specific properties that a focused model can exploit:

- text is usually rotated 90° (vertical reading)
- typography is restricted: title + author + sometimes a small
  publisher mark
- prior probabilities are strong: "WORDS WORDS · Author Name" is a
  realistic spine; "9j2!fkk38" is not
- large public ground-truth exists (every published book has a known
  title and author)

A 50–200 MB fine-tuned vision-language model (PaliGemma, Florence-2,
Donut, Qwen-VL) trained on shelf photos should clear 90% line accuracy
and run in 1–2 s per crop on a phone CPU.

---

## Public API (target)

```js
import { extractTitles } from '@spine-vision/adapter';

const result = await extractTitles(blob);
//   {
//     titles: [
//       { title: 'The Bostonians', author: 'Henry James', isbn: null,
//         confidence: 0.91, bbox: [x, y, w, h] },
//       …
//     ],
//     rawDetections: [...],          // raw model output for debugging
//     modelVersion: 'spine-v0.1',
//     latencyMs: 1240,
//   }
```

Same `extractTitles(image)` signature as the current Tesseract / PaddleOCR
providers in `src/ocr/`, so the eventual swap is a one-line import change
in `src/ocr/index.js`.

---

## How it fits in OpenBookMap today

```
  contribute.html
        │
        ▼
  src/ocr/index.js  ──► tesseract-provider.js   (current default)
                   ──► paddle-provider.js
                   ──► spine-vision/adapter/    (target, once trained)
```

When this directory has a working model, you change one line in
`src/ocr/index.js` to point the active provider at `./adapter/index.js`.
Tesseract stays available as a fallback.

---

## Layout

```
spine-vision/
├── README.md          you are here
├── ROADMAP.md         milestones with checkboxes
├── BENCHMARKS.md      what we measure, how, and why
├── data/              dataset export + preparation
│   ├── README.md
│   ├── export.sql     Supabase SQL: all confirmed-title contributions
│   └── prepare.py     download photos, normalise, write JSONL
├── training/          model fine-tuning
│   ├── README.md
│   └── finetune.ipynb starter Colab notebook (Florence-2)
├── eval/              hold-out scoring
│   ├── README.md
│   ├── seed_set/      hand-labeled "did we regress?" set
│   └── score.js       line-level precision/recall scorer
└── adapter/           browser drop-in
    ├── README.md
    └── index.js       implements extractTitles() interface
```

---

## Quick start

You probably want to read **`ROADMAP.md`** first to see what state we're in.

If you're here to **train the first model**:
```bash
cd spine-vision/data
# 1. dump the latest labeled examples from Supabase:
psql "$SUPABASE_DB_URL" -f export.sql > raw.csv
# 2. download photos and pack into JSONL:
python prepare.py raw.csv ../training/dataset.jsonl
# 3. open training/finetune.ipynb in Colab; upload the JSONL
```

If you're here to **wire the trained model into the OpenBookMap app**:
- See `adapter/README.md`
- Edit `src/ocr/index.js` in the parent project to import from
  `./adapter/index.js` instead of `./paddle-provider.js`.

If you're here to **benchmark a candidate model**:
- See `eval/README.md`
- Drop your model's ONNX file in `eval/`, run `node score.js model.onnx`
- Compare against the held-out set in `eval/seed_set/`

---

## License

MIT for code. CC-BY-SA 4.0 for the dataset (so contributors retain
attribution). Model weights, when published, will be released under
Apache 2.0 to match Florence-2 / PaliGemma upstream.
