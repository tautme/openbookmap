# Spine Count — KISS POC

The book-spine **counting** idea, reduced to its kernel: open the camera,
run YOLOv11n, and show one big number — how many book spines the model
sees right now. A `peak` high-water mark is the only flourish.

This is the minimalist sibling of `prototypes/scan/` (PR #19). Same
inference path, but with everything else stripped out.

| | `prototypes/scan/` | `prototypes/spine-count/` (this) |
|---|---|---|
| Detect books | ✅ | ✅ |
| Live count | ✅ | ✅ (the whole UI) |
| Tap to capture | ✅ | ❌ |
| Save to IndexedDB | ✅ | ❌ |
| Orientation + geo | ✅ | ❌ |
| Session summary / gallery | ✅ | ❌ |
| Lines of JS | ~780 | ~270 |

## What it shows

- Fullscreen rear camera.
- Green boxes over detected book spines.
- A giant centered number: **books in frame** (live, no dedup).
- **peak** in the corner: the highest count seen this session — a tiny
  game ("how high can you get it?") without needing a tracker.

Nothing is saved. Nothing is uploaded. Reload = fresh start.

## Why live count, not cumulative

Counting unique books as you pan a shelf needs object tracking
(ByteTrack-class) to avoid recounting the same spine every frame — real
work, and out of scope for a KISS POC. The honest minimal version is
"how many are visible right now." If you want a true cumulative tally,
that's the tap-to-capture flow in `prototypes/scan/`, or a future
tracker.

## Model

Fetched at runtime from Hugging Face (`deepghs/yolos`, yolo11n, ~10.6 MB),
cached by the browser after first load. WebGPU when available, else
single-threaded WASM (with an on-screen warning, since the count gets
choppy). On the first inference the output shape is logged and validated
against `[1, 84, 8400]`; a mismatch stops the loop and surfaces an error
rather than silently mis-decoding.

COCO book class index `73`, score threshold `0.4`, NMS IoU `0.45` —
matching `prototypes/scan/`.

## Running it

Hosted (no install):

```
https://raw.githack.com/tautme/openbookmap/claude/spine-count-poc/prototypes/spine-count/index.html
```

Local:

```bash
python3 -m http.server 8000
# open http://localhost:8000/prototypes/spine-count/
```

iOS needs HTTPS for the camera; raw.githack serves HTTPS, so on-device
works directly.

## Wiring

- No build step, no framework, no `npm install`.
- `onnxruntime-web@1.24.3` from jsdelivr.
- `index.html` (UI + CSS) + `count.js` (everything else).
