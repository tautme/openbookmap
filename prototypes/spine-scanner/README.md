# Book Spine Scanner — prototype

A self-contained, fully-offline browser app that uses the rear camera +
in-browser OCR (Tesseract.js / PaddleOCR-grade alternative TBD) to:

1. **Index** book spines as you scan them.
2. **Search** the local index for any title/author keyword.
3. **Find** a specific book on the shelf in front of you, live.

This is a side prototype for OpenBookMap — separate from the main Vite
app under the project root. It does not share auth, database, or
deployment with `openbookmap.org`. Standalone by design.

## Run

You need a static HTTP server. Because cameras require either `localhost`
or HTTPS, opening `book-scanner.html` directly with `file://` will not
work.

```bash
cd prototypes/spine-scanner
python3 -m http.server 8000
# then open http://localhost:8000/book-scanner.html
```

Any other static server works too (`npx serve .`, `caddy file-server`,
etc.). After the first load all assets are cached by the browser; the
app then runs fully offline.

## Browser support

- **Chrome / Edge / desktop Safari**: works on `localhost` directly.
- **Firefox**: works on `localhost` directly.
- **iOS Safari**: requires HTTPS (or `localhost` via Safari on the same
  Mac for development). Camera also requires `playsinline` and `muted`
  attributes on the video, plus a user gesture before `getUserMedia` —
  both are handled in this app.
- **Android Chrome**: works on `localhost` and HTTPS.

To test on a phone against your laptop, options:

- macOS: enable "Wireless debugging" in Safari and connect over USB.
- Use [`ngrok http 8000`](https://ngrok.com/) or [`tailscale serve`](https://tailscale.com/kb/1242/tailscale-serve/) to get an HTTPS URL.

## Files

```
book-scanner.html          # the entire app (HTML + CSS + ES module)
README.md                  # this file
vendor/
  tesseract/dist/
    tesseract.min.js       # Tesseract.js v5 main bundle
    worker.min.js          # OCR worker
  tesseract-core/
    tesseract-core-lstm.{js,wasm,wasm.js}            # ~3 MB wasm core
    tesseract-core-simd-lstm.{js,wasm,wasm.js}       # SIMD variant
  fuse/dist/fuse.min.mjs   # Fuse.js v7 — fuzzy search
  idb/dist/index.js        # idb-keyval v6 — thin IndexedDB wrapper
  lang/eng.traineddata.gz  # English traineddata (~1.9 MB)
```

Total vendor footprint: ~17 MB (mostly the wasm OCR engine). Cached on
first load.

## How it works

- **Index mode** (default tab): live rear-camera preview. Captures a
  still frame every 2 seconds (or on demand). Each frame is OCRed at
  three rotations (0°, 90°, 270°) and the result with the highest mean
  word confidence is kept — book spines are usually rotated. Each
  capture is stored in IndexedDB along with a 120 px JPEG thumbnail.
- **Search mode**: types a query, fuzzy-matches it across every line
  ever indexed (Fuse.js, threshold 0.4). Results show thumbnails with
  the matched line highlighted. Click a result to open the original
  capture.
- **Find mode**: enter a target string. The camera scans live; every
  ~1.5 s a frame is OCRed, fuzzy-matched against the target. On match,
  short beep + green border flash + the matching line shown below.
- **Backpressure**: in live mode the OCR call holds an `inflight` flag.
  Frames that arrive while OCR is running are dropped, not queued. OCR
  is much slower than camera framerate (~5–15 s vs ~30 fps), so without
  this the queue would grow unboundedly.
- **Debug strip** at the bottom: last OCR latency, last capture time,
  current queue depth, current FPS, and total entries. If something
  feels stuck, glance there first.

## Known limits

- OCR latency on mobile is 3–10 s per frame for full-frame Tesseract.
  The "find" mode feels sluggish until a future spine-segmentation +
  smaller crops makes per-frame work cheaper. Hooks for that are
  marked with comments in `ocrBestRotation()`.
- English only — adding a language is two files to `vendor/lang/` and
  one config change.
- IndexedDB is per-origin. Captures done from `localhost:8000` are not
  visible from `localhost:9000`.
- Audio beep on iOS may be silent on the very first match if the
  AudioContext wasn't successfully primed during the Start gesture.

## Out of scope (not implemented)

- Cloud sync of the index.
- Barcode / ISBN scanning.
- A spine-segmentation ML model (a hook for one is left in the OCR
  pipeline).
- Title/author parsing — we just store raw lines and search them.
