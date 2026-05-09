# Training

Fine-tune a vision-language model on `dataset.jsonl` produced by
`../data/prepare.py`.

## What we fine-tune

**Florence-2-base** (Microsoft, ~270M params, MIT-licensed). It already
knows OCR as a task; we're nudging it toward spine-shaped inputs.

Alternatives we've considered:

| Base model     | Size  | Why we didn't use it (yet)                |
|----------------|-------|-------------------------------------------|
| PaliGemma 3B   | ~3 GB | Too big for browser delivery without aggressive quantization. |
| Qwen2-VL 2B    | ~2 GB | Same. Strong candidate for v1 if we move inference to a server. |
| Donut          | ~700 MB | OCR-specific but lower headline accuracy. Fallback choice. |
| TrOCR (HF)     | ~1 GB | Word-level, not great on multi-line spines. |

Florence-2 is the smallest credible base that can beat PaddleOCR on
spines after fine-tuning. v1 may switch to Qwen-VL if we add a hosted
inference fallback for non-mobile users.

## Run it

The notebook (`finetune.ipynb`) is structured to run on **Google Colab
free tier** (T4 GPU, 12 GB RAM). One pass takes 1–3 hours depending
on dataset size. Steps:

1. Open `finetune.ipynb` in Colab.
2. Upload your `dataset.jsonl` (and the `images/` directory it
   references) into the Colab file pane.
3. Run all cells. The last one downloads `model.onnx` to your
   computer.
4. Drop `model.onnx` into the parent project's `public/spine-vision/`
   directory so the browser adapter can load it.

## Re-training cadence

Run roughly monthly, or whenever the live site has accumulated 100+
new contributions. Each retrain:

1. Re-export from Supabase: `cd ../data && python prepare.py raw.csv ../training/dataset.jsonl`
2. Run `finetune.ipynb` with the fresh dataset.
3. Score the new model: `cd ../eval && node score.js model.onnx`
4. If it beats the current model per `BENCHMARKS.md` promotion
   criteria, swap it in.

## Tips

- **Train/val split** is automatic in the notebook (10% val).
- **Augmentations**: random rotation ±5° (spines aren't perfectly
  vertical in real photos), random brightness ±15%, no horizontal
  flip (would mirror text). All in the notebook's data pipeline.
- **Early stopping** at 5 epochs without val improvement, max 30
  epochs.
- **Gradient checkpointing** is on by default; turn off only if you
  have a beefier GPU.
