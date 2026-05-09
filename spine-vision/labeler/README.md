# Labeler

A single-page web app for hand-labeling spine photos. Self-contained,
no build, no backend, runs entirely in your browser. Use it to
produce `labels.jsonl` for training and evaluation.

## Run it

```bash
cd spine-vision/labeler
python3 -m http.server 8000
# open http://localhost:8000
```

(Or any other static server. `npx serve .` works. Opening `index.html`
directly via `file://` is hit-and-miss because some browsers block
local file APIs.)

## Use it

1. **Click "Choose images"** or drag a folder of photos into the
   drop zone. Supports nested subfolders. Files stay in your browser
   — nothing is uploaded.
2. **Type one line per spine** in the textarea. Conventional order:
   title, then author on the next line, then a blank line before the
   next book. The model only learns what you type, so be consistent.
3. **Tab between fields** for language, lighting, and free-text notes.
4. **Move with the buttons or keyboard:**
   - <kbd>↑</kbd> / <kbd>↓</kbd> previous / next photo
   - <kbd>⌘</kbd>+<kbd>Enter</kbd> save and go to next
   - autosaved as you type (300 ms debounce)
5. **Export** when you're done. The browser downloads `labels.jsonl`
   with one record per labeled photo.
6. Drop the JSONL into `spine-vision/eval/seed_set/` (for held-out
   eval) or `spine-vision/training/` (for training).

## Output format

Matches what `data/prepare.py` produces from live Supabase data:

```json
{"image": "0001.jpg", "lines": ["The Bostonians", "Henry James"], "language": "en", "lighting": "indoor", "notes": "tilted spines", "savedAt": "2026-..."}
```

Photos are referenced by their original filename. Keep the filenames
stable when you move the JSONL alongside the images, or the training
script won't be able to find them.

## Storage

Labels are saved to your browser's `localStorage` under the prefix
`spine-vision-labeler:`. They survive browser restarts. They do
**not** sync between devices or browsers. To move work to another
machine, export to JSONL and import on the other side (or just
re-load the same photos and the existing labels reattach by
filename).

To wipe and start over: click **Clear all** in the toolbar (asks
for confirmation).

## Browser support

Modern Chrome, Edge, Safari, Firefox. Mobile Safari works for
single-photo selection but the keyboard shortcuts and folder
drag-drop don't apply on touch devices — desktop is the natural
home for this tool.

## What it doesn't do (yet)

- **Bounding boxes.** v0 of the spine-vision model only needs line
  text, not box coordinates. When v1 starts segmenting individual
  spines, we'll add a Konva canvas layer here for box drawing.
- **Multi-user / real-time collaboration.** localStorage is local.
  For team labeling in the future, consider Label Studio or
  Roboflow Annotate (see `data/README.md`).
- **Undo across photos.** If you delete a label by accident, the
  300 ms autosave already overwrote the saved version. Recovery is
  manual — re-label the photo. No history kept.
- **Auto-skip already-labeled.** Every photo is shown in name order,
  whether labeled or not. The header tracks how many are done so
  you can find your place visually. Click into the textarea on a
  labeled photo to edit.

## Tip: labeling workflow

1. Drop in 30 photos.
2. First pass: **just the obvious titles**, one line per spine.
   Don't worry about authors yet. Goal: cover all 30 photos.
3. Second pass: go back, add authors and notes for the photos
   where it matters.
4. Export.

This beats trying to "perfectly" label each photo on first sight —
you'll find your eye gets faster after a dozen, and the labeling
language settles down.
