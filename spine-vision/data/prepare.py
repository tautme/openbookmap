#!/usr/bin/env python3
"""
spine-vision · dataset preparation

Reads raw.csv (from `psql -f export.sql`), downloads each photo from
Supabase Storage (public bucket), resizes to a max long-edge of 1024 px,
and emits one JSONL row per image suitable for fine-tuning.

Usage:
    python prepare.py raw.csv ../training/dataset.jsonl

Idempotent: already-downloaded images are skipped. Crashes mid-run leave
a usable partial dataset; just rerun to fill in the rest.

Dependencies (pip install): requests, Pillow.
No optional ML deps — kept tiny on purpose so this runs anywhere.
"""

from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image

SUPABASE_PUBLIC_URL = os.environ.get(
    "SUPABASE_PUBLIC_URL",
    "https://jmikulhgpgfaarqzwrgl.supabase.co",
)
BUCKET = "shelf-photos"
MAX_EDGE = 1024
JPEG_QUALITY = 88
TIMEOUT = 30


def storage_url(path: str) -> str:
    """Public URL for a file in the shelf-photos bucket."""
    return f"{SUPABASE_PUBLIC_URL}/storage/v1/object/public/{BUCKET}/{quote(path)}"


def download_and_resize(url: str, dest: Path) -> bool:
    """Download `url` to `dest`, resize to MAX_EDGE long edge.
    Returns True on success, False on any error. Skips if dest exists."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = requests.get(url, timeout=TIMEOUT, stream=True)
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        tmp.write_bytes(r.content)
        with Image.open(tmp) as img:
            img = img.convert("RGB")
            img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)
        tmp.unlink(missing_ok=True)
        return True
    except Exception as e:
        print(f"  ! failed: {e}", file=sys.stderr)
        return False


def main(in_csv: str, out_jsonl: str) -> None:
    images_dir = Path("images")
    images_dir.mkdir(exist_ok=True)

    out_path = Path(out_jsonl)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    n_total = n_ok = 0
    with open(in_csv, newline="") as fin, open(out_path, "w") as fout:
        reader = csv.DictReader(fin)
        for row in reader:
            n_total += 1
            photo_id = row["photo_id"]
            storage_path = row["storage_path"]
            titles = json.loads(row.get("book_titles") or "[]")
            authors = json.loads(row.get("book_authors") or "[]")
            if not titles:
                continue
            url = storage_url(storage_path)
            dest = images_dir / f"{photo_id}.jpg"
            print(f"[{n_total}] {photo_id}", file=sys.stderr)
            if not download_and_resize(url, dest):
                continue
            fout.write(
                json.dumps(
                    {
                        "image": str(dest),
                        "photo_id": photo_id,
                        "lines": [t for t in titles if t],
                        "authors": [a for a in authors],
                        "country": row.get("country") or None,
                        "raw_ocr": row.get("raw_ocr_text") or "",
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            n_ok += 1
    print(f"done. {n_ok}/{n_total} rows exported to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
