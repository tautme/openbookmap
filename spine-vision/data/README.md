# Dataset pipeline

Turn the live OpenBookMap database into a `dataset.jsonl` file ready
for training.

## What gets exported

Every `(photo_url, confirmed_titles[])` pair where `books.confirmed = true`,
joined to the photo it was extracted from. Also pulls the OCR raw text
for debugging.

## Steps

```bash
# 0. one-time: install minimal Python deps (no global venv pollution)
python -m venv .venv && source .venv/bin/activate
pip install requests Pillow

# 1. dump the labeled rows from Supabase
#    SUPABASE_DB_URL is in your Supabase project's Settings → Database
psql "$SUPABASE_DB_URL" -f export.sql > raw.csv

# 2. download photos and pack into JSONL
python prepare.py raw.csv ../training/dataset.jsonl
#   - downloads each photo to images/<id>.jpg (resumable, skips existing)
#   - resizes the long edge to 1024 px (saves disk + faster training)
#   - emits one JSONL row per photo with the full label list
```

Result: `../training/dataset.jsonl`, ready to upload into Colab.

## File formats

`raw.csv` (from `export.sql`):

```
photo_id,storage_path,thumb_path,book_titles,book_authors,raw_ocr_text
abc-123,abc/abc-123/display_1600.jpg,abc/abc-123/thumb_400.jpg,"[""The Bostonians"",""Daisy Miller""]","[""Henry James"",""Henry James""]","..."
```

`dataset.jsonl` (one record per line):

```json
{"image": "images/abc-123.jpg", "lines": ["The Bostonians", "Daisy Miller"], "authors": ["Henry James", "Henry James"], "raw_ocr": "..."}
```

`lines` is the supervised target for the model. `authors` is paired
positionally where known — the v0 model ignores authors and only
learns lines; v1 will learn the (line, author) joint.

## Safety / privacy

- All photos in this export are **already public** — they were
  uploaded under CC-BY-SA 4.0 and are served from a public
  Supabase bucket. No additional privacy concern in dumping them
  for training.
- Contributors are not identified in the JSONL — their `uploader_id`
  is dropped at the SQL stage.
- Don't redistribute `raw.csv` outside the project; it has join keys
  that aren't in the public photo set. `dataset.jsonl` is fine to
  share once stripped of `uploader_id`.

## Re-running

This is meant to run periodically (weekly, monthly) as new
contributions land. The Python script is idempotent — already-
downloaded images are skipped. Just regenerate `raw.csv` and re-run
`prepare.py` to refresh the JSONL.
