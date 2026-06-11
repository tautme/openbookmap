// Spine Scanner prototype — single-file, no build step.
//
// Loads YOLOv11n via onnxruntime-web from a CDN, opens the rear camera,
// draws live detection boxes, and saves captured frames + crops to
// IndexedDB. OCR happens later; this is just the collection layer.
//
// Model: fetched at runtime from Hugging Face (see DEFAULT_MODEL_URL).
// Override with ?model=<https url> for testing other exports.

import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort.bundle.min.mjs';

// Single-threaded WASM avoids needing COOP/COEP headers — GH Pages and
// Hugging Face don't serve them. WebGPU (preferred) doesn't care.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const DEFAULT_MODEL_URL =
  'https://huggingface.co/deepghs/yolos/resolve/main/yolo11n/model.onnx';
const MODEL_STORAGE_KEY = 'obm.scan.model';
const INPUT_SIZE = 640;
const BOOK_CLASS_INDEX = 73; // COCO class "book"
const SCORE_THRESHOLD = 0.4;
const IOU_THRESHOLD = 0.45;
const DETECT_INTERVAL_MS = 180; // ~5.5 FPS upper bound; actual depends on backend.

const DB_NAME = 'obm-scan';
const DB_VERSION = 1;
const STORE = 'captures';

// Read `?model=<url>` (and persist to localStorage so the choice survives
// navigation). `?model=default` clears the override. Default is the
// YOLOv11n weights from the deepghs/yolos community re-export on
// Hugging Face — fetched at runtime, ~10.6 MB, cached by the browser.
function resolveModelUrl() {
  let chosen = DEFAULT_MODEL_URL;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('model')) {
      const v = (params.get('model') || '').trim();
      try {
        if (v && v !== 'default') {
          window.localStorage?.setItem(MODEL_STORAGE_KEY, v);
        } else {
          window.localStorage?.removeItem(MODEL_STORAGE_KEY);
        }
      } catch {
        // localStorage may be disabled (private mode, sandboxed iframe).
      }
      if (v && v !== 'default') chosen = v;
    } else {
      const stored = window.localStorage?.getItem(MODEL_STORAGE_KEY);
      if (stored) chosen = stored;
    }
  } catch (err) {
    console.warn('resolveModelUrl: falling back to default', err);
  }
  if (chosen !== DEFAULT_MODEL_URL) {
    console.warn(
      `Scan model override: ${chosen}. Use ?model=default to reset.`,
    );
  }
  return chosen;
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

const state = {
  ortSession: null,
  outputKey: null,
  modelUrl: DEFAULT_MODEL_URL,
  stream: null,
  running: false,
  sessionLabel: '',
  sessionCount: 0,
  visibleCount: 0,
  lastDetections: [],
  orientation: null, // {alpha, beta, gamma, captureTime}
  coords: null, // {lat, lon, accuracy, capturedAt}
  totals: { today: 0, allTime: 0 },
  // Inference health
  loggedShape: false,
  shapeMismatch: null, // populated if first inference returns unexpected dims
  fpsSamples: [], // timestamps of the last ~30 detection ticks
};

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------

const el = (id) => document.getElementById(id);
const dom = {
  setup: el('setup'),
  setupError: el('setupError'),
  sessionLabel: el('sessionLabel'),
  modelHint: el('modelHint'),
  webgpuWarning: el('webgpuWarning'),
  startBtn: el('startBtn'),
  loadingState: el('loadingState'),
  progressFill: el('progressFill'),
  progressLabel: el('progressLabel'),
  scanner: el('scanner'),
  video: el('video'),
  overlay: el('overlay'),
  visibleCount: el('visibleCount'),
  sessionCount: el('sessionCount'),
  fpsCount: el('fpsCount'),
  bursts: el('bursts'),
  captureBtn: el('captureBtn'),
  stopBtn: el('stopBtn'),
  sensorMeta: el('sensorMeta'),
  summary: el('summary'),
  summarySession: el('summarySession'),
  summaryToday: el('summaryToday'),
  summaryAllTime: el('summaryAllTime'),
  gallery: el('gallery'),
  resetBtn: el('resetBtn'),
  toast: el('toast'),
};

// ---------------------------------------------------------------------
// IndexedDB (minimal wrapper — no external deps)
// ---------------------------------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-session', 'sessionLabel');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCapture(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllCaptures() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function refreshTotals() {
  const all = await loadAllCaptures();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.getTime();
  state.totals.allTime = all.reduce((s, c) => s + c.detectionCount, 0);
  state.totals.today = all
    .filter((c) => c.timestamp >= startOfDay)
    .reduce((s, c) => s + c.detectionCount, 0);
}

// ---------------------------------------------------------------------
// Permissions / sensors
// ---------------------------------------------------------------------

async function requestOrientation() {
  const Cls = window.DeviceOrientationEvent;
  if (!Cls) return false;
  if (typeof Cls.requestPermission === 'function') {
    try {
      const result = await Cls.requestPermission();
      if (result !== 'granted') return false;
    } catch {
      return false;
    }
  }
  window.addEventListener(
    'deviceorientation',
    (e) => {
      state.orientation = {
        alpha: round1(e.alpha),
        beta: round1(e.beta),
        gamma: round1(e.gamma),
      };
    },
    { passive: true },
  );
  return true;
}

function requestGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: pos.timestamp,
        };
        resolve(true);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function startCamera() {
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  dom.video.srcObject = state.stream;
  await new Promise((resolve) => {
    if (dom.video.readyState >= 2) resolve();
    else dom.video.addEventListener('loadeddata', resolve, { once: true });
  });
  await dom.video.play();
}

// ---------------------------------------------------------------------
// YOLOv8/v11 inference (same output layout)
// ---------------------------------------------------------------------

async function loadModel() {
  // Fetch the bytes ourselves so we can show a real progress bar. The
  // browser still caches the response, so subsequent loads are instant.
  const bytes = await fetchModelWithProgress(
    state.modelUrl,
    onModelProgress,
  );
  state.ortSession = await ort.InferenceSession.create(bytes, {
    // WebGPU first, fall back to WASM (single-threaded; see ort.env above).
    executionProviders: ['webgpu', 'wasm'],
  });
  state.outputKey = state.ortSession.outputNames[0];
  console.log('Input names:', state.ortSession.inputNames);
  console.log('Output names:', state.ortSession.outputNames);
}

async function fetchModelWithProgress(url, onProgress) {
  setLoadingState(true, 'Fetching model…', 0);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Model fetch failed: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get('Content-Length')) || 0;
  const reader = response.body?.getReader?.();
  // Fallback: no streaming reader available — read all at once.
  if (!reader) {
    const buf = await response.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return new Uint8Array(buf);
  }
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

function onModelProgress(loaded, total) {
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : null;
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  if (pct == null) {
    setLoadingState(true, `Fetching model… ${mb(loaded)} MB`, null);
  } else {
    setLoadingState(
      true,
      `Fetching model… ${mb(loaded)} / ${mb(total)} MB`,
      pct,
    );
  }
}

// Preprocess: letterbox the video frame into a 640x640 RGB tensor,
// normalized to [0,1], NCHW. Returns the tensor and the letterbox
// transform so detections can be mapped back to original frame coords.
function preprocess(video) {
  const inW = video.videoWidth;
  const inH = video.videoHeight;
  const scale = INPUT_SIZE / Math.max(inW, inH);
  const sw = inW * scale;
  const sh = inH * scale;
  const dx = (INPUT_SIZE - sw) / 2;
  const dy = (INPUT_SIZE - sh) / 2;

  const c = preprocess.canvas ||= document.createElement('canvas');
  c.width = INPUT_SIZE;
  c.height = INPUT_SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(video, dx, dy, sw, sh);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const tensorData = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    tensorData[i] = data[i * 4] / 255; // R
    tensorData[i + plane] = data[i * 4 + 1] / 255; // G
    tensorData[i + 2 * plane] = data[i * 4 + 2] / 255; // B
  }
  return {
    tensor: new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    letterbox: { scale, dx, dy, inW, inH },
  };
}

// Expected YOLOv8/v11 detection output shape: [1, 84, 8400]. Layout per
// anchor:
//   [0..3]  : cx, cy, w, h (in 640x640 letterboxed coords)
//   [4..83] : 80 COCO class scores (no objectness in v8/v11)
// We only care about class 73 (book). Variants with NMS baked in (shape
// like [1, N, 6]) hit the validation path in detectTick first.
function postprocess(output, letterbox) {
  const data = output.data;
  const numAnchors = output.dims[2];
  const out = [];
  const classOffset = 4 + BOOK_CLASS_INDEX;
  for (let i = 0; i < numAnchors; i++) {
    const score = data[classOffset * numAnchors + i];
    if (score < SCORE_THRESHOLD) continue;
    const cx = data[0 * numAnchors + i];
    const cy = data[1 * numAnchors + i];
    const w = data[2 * numAnchors + i];
    const h = data[3 * numAnchors + i];
    // Convert from letterboxed 640x640 back to original frame.
    const x = (cx - w / 2 - letterbox.dx) / letterbox.scale;
    const y = (cy - h / 2 - letterbox.dy) / letterbox.scale;
    const bw = w / letterbox.scale;
    const bh = h / letterbox.scale;
    out.push({
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: Math.min(letterbox.inW - x, bw),
      h: Math.min(letterbox.inH - y, bh),
      score,
    });
  }
  return nms(out, IOU_THRESHOLD);
}

function nms(boxes, iouThresh) {
  boxes.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const b of boxes) {
    let drop = false;
    for (const k of kept) {
      if (iou(b, k) > iouThresh) {
        drop = true;
        break;
      }
    }
    if (!drop) kept.push(b);
  }
  return kept;
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// ---------------------------------------------------------------------
// Detection loop
// ---------------------------------------------------------------------

let detectTimer = null;

async function detectTick() {
  if (!state.running) return;
  try {
    if (dom.video.readyState >= 2 && state.ortSession) {
      const { tensor, letterbox } = preprocess(dom.video);
      const inputName = state.ortSession.inputNames[0];
      const result = await state.ortSession.run({ [inputName]: tensor });
      const primary = result[state.outputKey];

      if (!state.loggedShape) {
        state.loggedShape = true;
        const summary = Object.fromEntries(
          state.ortSession.outputNames.map((n) => [n, result[n].dims]),
        );
        console.log('Output shape (first inference):', summary);
        const mismatch = expectedShapeMismatch(primary.dims);
        if (mismatch) {
          state.shapeMismatch = primary.dims;
          state.running = false;
          showShapeMismatchError(primary.dims, mismatch);
          return;
        }
      }

      const detections = postprocess(primary, letterbox);
      state.lastDetections = detections;
      state.visibleCount = detections.length;
      drawOverlay(detections, letterbox);
      dom.visibleCount.textContent = detections.length;
      recordFpsTick();
    }
  } catch (err) {
    console.error('detect tick failed', err);
  } finally {
    if (state.running) {
      detectTimer = setTimeout(detectTick, DETECT_INTERVAL_MS);
    }
  }
}

function expectedShapeMismatch(dims) {
  // Standard COCO YOLOv8/v11 export: [1, 84, 8400]. Anything else means
  // the postprocess decoder can't safely run, so we bail to the UI.
  if (!Array.isArray(dims) || dims.length !== 3) {
    return `expected rank 3 [1, 84, 8400], got rank ${dims?.length}`;
  }
  if (dims[1] !== 84 || dims[2] !== 8400) {
    return `expected [1, 84, 8400], got [${dims.join(', ')}]`;
  }
  return null;
}

function recordFpsTick() {
  const now = performance.now();
  state.fpsSamples.push(now);
  // Keep only ticks in the last second.
  const cutoff = now - 1000;
  while (state.fpsSamples.length && state.fpsSamples[0] < cutoff) {
    state.fpsSamples.shift();
  }
  if (dom.fpsCount) {
    dom.fpsCount.textContent = state.fpsSamples.length;
  }
}

function drawOverlay(detections, letterbox) {
  const c = dom.overlay;
  // Match canvas internal pixels to video native pixels so detection
  // coordinates (in original-frame space) draw correctly.
  if (c.width !== letterbox.inW || c.height !== letterbox.inH) {
    c.width = letterbox.inW;
    c.height = letterbox.inH;
  }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
  ctx.font = '14px ui-monospace, monospace';
  for (const d of detections) {
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeRect(d.x, d.y, d.w, d.h);
  }
}

// ---------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------

async function capture() {
  if (!state.lastDetections.length) {
    toast('No books visible');
    return;
  }
  const detections = state.lastDetections.slice();
  const frameBlob = await frameToBlob(dom.video);
  const cropBlobs = await Promise.all(
    detections.map((d) => cropToBlob(dom.video, d)),
  );

  const record = {
    id: crypto.randomUUID(),
    sessionLabel: state.sessionLabel,
    timestamp: Date.now(),
    detectionCount: detections.length,
    detections,
    frameBlob,
    cropBlobs,
    orientation: state.orientation ? { ...state.orientation } : null,
    coords: state.coords ? { ...state.coords } : null,
    frameW: dom.video.videoWidth,
    frameH: dom.video.videoHeight,
  };
  await saveCapture(record);

  state.sessionCount += detections.length;
  state.totals.allTime += detections.length;
  state.totals.today += detections.length;
  dom.sessionCount.textContent = state.sessionCount;
  burst(detections.length);
  if (navigator.vibrate) navigator.vibrate(40);
  updateSensorMeta();
}

function frameToBlob(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.82));
}

function cropToBlob(video, det) {
  // Pad crops a touch so spines aren't sheared off at the edges.
  const pad = 4;
  const sx = Math.max(0, Math.round(det.x - pad));
  const sy = Math.max(0, Math.round(det.y - pad));
  const sw = Math.min(video.videoWidth - sx, Math.round(det.w + pad * 2));
  const sh = Math.min(video.videoHeight - sy, Math.round(det.h + pad * 2));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
}

function burst(n) {
  const el = document.createElement('div');
  el.className = 'burst';
  el.textContent = `+${n}`;
  dom.bursts.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// ---------------------------------------------------------------------
// UI flow
// ---------------------------------------------------------------------

function updateSensorMeta() {
  const parts = [];
  if (state.orientation) {
    const { alpha, beta, gamma } = state.orientation;
    parts.push(`orient α${fmt(alpha)} β${fmt(beta)} γ${fmt(gamma)}`);
  } else {
    parts.push('orient: —');
  }
  if (state.coords) {
    parts.push(
      `geo ${state.coords.lat.toFixed(4)}, ${state.coords.lon.toFixed(4)} ±${Math.round(state.coords.accuracy)}m`,
    );
  } else {
    parts.push('geo: —');
  }
  parts.push(`session "${state.sessionLabel}"`);
  dom.sensorMeta.innerHTML = parts.map((p) => `<code>${p}</code>`).join('  ');
}

function fmt(v) {
  return v == null ? '—' : Math.round(v);
}

function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}

async function showSummary() {
  await refreshTotals();
  dom.summarySession.textContent = state.sessionCount;
  dom.summaryToday.textContent = state.totals.today;
  dom.summaryAllTime.textContent = state.totals.allTime;

  const all = await loadAllCaptures();
  const recent = all
    .filter((c) => c.sessionLabel === state.sessionLabel)
    .sort((a, b) => b.timestamp - a.timestamp);
  dom.gallery.innerHTML = '';
  for (const cap of recent) {
    for (const blob of cap.cropBlobs) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.loading = 'lazy';
      dom.gallery.appendChild(img);
    }
  }

  dom.scanner.hidden = true;
  dom.summary.hidden = false;
}

function resetToSetup() {
  state.sessionCount = 0;
  state.visibleCount = 0;
  state.lastDetections = [];
  dom.sessionLabel.value = '';
  dom.summary.hidden = true;
  dom.setup.hidden = false;
}

function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => dom.toast.classList.remove('show'), 1400);
}

function setSetupError(msg) {
  if (!msg) {
    dom.setupError.hidden = true;
    return;
  }
  dom.setupError.textContent = msg;
  dom.setupError.hidden = false;
}

function setLoadingState(visible, label, pct) {
  if (!dom.loadingState) return;
  dom.loadingState.hidden = !visible;
  if (label != null) dom.progressLabel.textContent = label;
  if (pct == null) {
    // Indeterminate — no Content-Length. Just show a thin animated bar.
    dom.progressFill.style.width = '100%';
    dom.progressFill.classList.add('indeterminate');
  } else {
    dom.progressFill.classList.remove('indeterminate');
    dom.progressFill.style.width = `${pct.toFixed(1)}%`;
  }
}

function showShapeMismatchError(dims, reason) {
  const msg =
    `Unexpected model output shape — ${reason}. ` +
    `Got dims [${dims?.join(', ')}]. ` +
    `Detection halted; tell Claude before patching the decoder.`;
  console.error(msg);
  setSetupError(msg);
  // Bounce back to the setup screen so the warning is visible.
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  if (detectTimer) clearTimeout(detectTimer);
  dom.scanner.hidden = true;
  dom.setup.hidden = false;
  dom.startBtn.disabled = false;
  dom.startBtn.textContent = 'Start scanning';
}

function maybeRenderWebGpuWarning() {
  if (!dom.webgpuWarning) return;
  if (navigator.gpu) {
    dom.webgpuWarning.hidden = true;
    return;
  }
  dom.webgpuWarning.innerHTML =
    '⚠️ <strong>WebGPU unavailable</strong> — will fall back to ' +
    'single-threaded WASM. Expect &lt; 2 FPS on phones (iOS Safari ' +
    'before 18, Firefox without flags). Detection still works, just slower.';
  dom.webgpuWarning.hidden = false;
}

// ---------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------

dom.startBtn.addEventListener('click', async () => {
  setSetupError(null);
  dom.startBtn.disabled = true;
  dom.startBtn.textContent = 'Starting…';
  state.loggedShape = false;
  state.shapeMismatch = null;
  state.fpsSamples = [];
  try {
    state.modelUrl = resolveModelUrl();
    state.sessionLabel =
      dom.sessionLabel.value.trim() ||
      `scan-${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    // Request sensor permissions in parallel with model load. Model load
    // owns the progress UI; the others just complete in the background.
    await Promise.all([
      requestOrientation(),
      requestGeo(),
      loadModel(),
      startCamera(),
    ]);
    setLoadingState(false);
    await refreshTotals();
    state.sessionCount = 0;
    dom.sessionCount.textContent = 0;
    dom.visibleCount.textContent = 0;
    if (dom.fpsCount) dom.fpsCount.textContent = '—';
    updateSensorMeta();
    dom.setup.hidden = true;
    dom.scanner.hidden = false;
    state.running = true;
    detectTick();
  } catch (err) {
    console.error('Failed to start', err);
    setLoadingState(false);
    setSetupError(modelLoadErrorMessage(err) || `Failed to start: ${err?.message || err}`);
    dom.startBtn.disabled = false;
    dom.startBtn.textContent = 'Start scanning';
  }
});

function modelLoadErrorMessage(err) {
  const msg = err?.message || String(err);
  const looksLikeModelLoad =
    /onnx|InferenceSession|fetch|protobuf|CORS|Failed to load|HTTP \d{3}/i.test(
      msg,
    );
  if (!looksLikeModelLoad) return null;
  return (
    `Couldn't load model from "${state.modelUrl}". ` +
    `Check the URL is a direct .onnx download served with CORS, or pass ?model=default to reset. ` +
    `(${msg})`
  );
}

dom.captureBtn.addEventListener('click', capture);

dom.stopBtn.addEventListener('click', async () => {
  state.running = false;
  if (detectTimer) clearTimeout(detectTimer);
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  dom.startBtn.disabled = false;
  dom.startBtn.textContent = 'Start scanning';
  await showSummary();
});

dom.resetBtn.addEventListener('click', resetToSetup);

// Surface the resolved model URL and likely performance ceiling so the
// user knows what to expect before they tap Start.
renderModelHint();
maybeRenderWebGpuWarning();

function renderModelHint() {
  const url = resolveModelUrl();
  state.modelUrl = url;
  const safe = url.replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c],
  );
  if (url === DEFAULT_MODEL_URL) {
    dom.modelHint.innerHTML =
      `Model: <code>${safe}</code> (default, ~10.6 MB). ` +
      'Pass <code>?model=&lt;https URL&gt;</code> to load a different one.';
  } else {
    dom.modelHint.innerHTML =
      `Model: <code>${safe}</code>. ` +
      'Pass <code>?model=default</code> to reset.';
  }
}
