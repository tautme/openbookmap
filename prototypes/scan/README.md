# Spine Scanner — prototype

A single-page, build-step-free experiment that opens the rear camera,
runs **YOLOv8n** in the browser, and lets you tap to **count + save**
the books visible in the current frame. OCR is intentionally *not*
invoked — this prototype exists to collect captured spine images,
device orientation, and geolocation for later analysis.

It is **not** part of the main app's Vite build and is not linked from
the nav. Live at `prototypes/scan/index.html`.

## What it does

- Live camera feed with detection boxes drawn over books in real time.
- Two counters in the HUD: **visible** (current frame, updates ~5×/sec)
  and **scanned** (session total, only ticks up on tap).
- **Capture** button: saves the full frame + per-detection crops +
  device orientation snapshot + geolocation to **IndexedDB** under the
  database name `obm-scan`, store `captures`.
- **+N** burst animation and short vibration on each capture.
- **Stop** ends the session and shows a summary: this-session / today /
  all-time totals + a gallery of cropped spines.

Nothing is uploaded. All data lives in the browser. Open DevTools →
Application → IndexedDB → `obm-scan` → `captures` to inspect records.

## Running it

You need a static server (camera APIs require a secure context, and
`localhost` counts as secure). Two easy options from the repo root:

```bash
# Option A: Python (built into macOS)
python3 -m http.server 8000
# then open http://localhost:8000/prototypes/scan/

# Option B: Node, if you have a modern Node installed
npx serve .
# then open http://localhost:3000/prototypes/scan/
```

iOS requires HTTPS for camera + motion sensors, so on-device testing
needs a tunnel like `cloudflared` or `ngrok` pointing at your local
server. Desktop browsers work fine over plain `localhost`.

## Getting the YOLOv8n model

The model file is **not** committed to the repo (~12 MB). Place
`yolov8n.onnx` in `prototypes/scan/models/`. The file must be the
**standard YOLOv8n COCO export at 640×640 input** — anything else and
the decoding math in `scan.js` will be wrong.

Easiest source: install Ultralytics in any Python environment and
export from the official weights:

```bash
pip install ultralytics
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=640, dynamic=False, simplify=True)"
mv yolov8n.onnx prototypes/scan/models/
```

If you can't run Python locally, search the Hugging Face Hub for a
pre-converted `yolov8n.onnx` (640×640, static shape) and drop it in
that directory.

## Wiring

- **No build step.** `index.html` loads `scan.js` as an ES module
  directly. `scan.js` imports `onnxruntime-web` from jsdelivr's CDN.
- **No external JS deps** are vendored. The CDN pin is at the top of
  `scan.js` if you want to upgrade ort.
- **No framework.** Plain DOM, ~600 lines of vanilla JS, ~280 lines of
  CSS/HTML.

## Why this shape

A few decisions deserve a note:

- **Tap-to-capture, not live tracking.** Naive frame-by-frame counting
  would multiply the same shelf by ~5 (the detection rate) every
  second. A real tracker (ByteTrack-class) is a real engineering
  project; tap-to-capture sidesteps the whole problem and matches how
  someone actually scans a shelf — pan, hold, tap, move on.
- **YOLOv8n COCO, not a custom spine model.** COCO has a "book" class
  out of the box. Custom training waits for the data this prototype
  will collect. Class index `73` is hardcoded in `scan.js`.
- **CDN ort, not vendored.** Keeps the prototype runnable without an
  `npm install` (which is blocked on environments stuck on old npm).
- **IDB only, no Supabase upload.** Collection layer first. A sync
  button can be added once we know what shape the records want to be.

## What's stored per capture

```jsonc
{
  "id": "uuid",
  "sessionLabel": "Living room shelf",
  "timestamp": 1736379100000,
  "detectionCount": 12,
  "detections": [{ "x": 134, "y": 22, "w": 48, "h": 280, "score": 0.71 }, ...],
  "frameBlob": "<Blob image/jpeg>",         // full frame
  "cropBlobs": ["<Blob image/jpeg>", ...],  // one per detection
  "orientation": { "alpha": 12.3, "beta": -4.1, "gamma": 88.7 },
  "coords": { "lat": 38.93, "lon": -119.98, "accuracy": 14, "capturedAt": ... },
  "frameW": 1280,
  "frameH": 720
}
```

`orientation` and `coords` are `null` if the user denied permission.

## Known limitations

- Detection threshold (`SCORE_THRESHOLD = 0.35`) is conservative; tune
  it for your bookshelves. NMS IoU is `0.45`.
- Tall, thin spines occasionally get merged by NMS at high book density
  — the prototype doesn't try to recover from that.
- No way to delete or sync captures yet. Open DevTools → IndexedDB to
  clear during testing.
- The page hangs onto `URL.createObjectURL` blobs until reload; for
  long-running sessions you'll want to revoke them.
