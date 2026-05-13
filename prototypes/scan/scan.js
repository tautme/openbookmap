// Spine Scanner prototype — single-file, no build step.
//
// Loads YOLOv8n via onnxruntime-web from a CDN, opens the rear camera,
// draws live detection boxes, and saves captured frames + crops to
// IndexedDB. OCR happens later; this is just the collection layer.
//
// Model: place yolov8n.onnx in ./models/ (see README).

import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort.bundle.min.mjs';

// Tell ort where the wasm assets live. We use the same CDN so a single
// fetch warms the cache for both the main JS and the wasm worker.
ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const MODEL_URL = './models/yolov8n.onnx';
const INPUT_SIZE = 640;
const BOOK_CLASS_INDEX = 73; // COCO class "book"
const SCORE_THRESHOLD = 0.35;
const IOU_THRESHOLD = 0.45;
const DETECT_INTERVAL_MS = 180; // ~5.5 FPS — plenty for visual feedback

const DB_NAME = 'obm-scan';
const DB_VERSION = 1;
const STORE = 'captures';

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

const state = {
  ortSession: null,
  outputKey: null,
  stream: null,
  running: false,
  sessionLabel: '',
  sessionCount: 0,
  visibleCount: 0,
  lastDetections: [],
  orientation: null, // {alpha, beta, gamma, captureTime}
  coords: null, // {lat, lon, accuracy, capturedAt}
  totals: { today: 0, allTime: 0 },
};

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------

const el = (id) => document.getElementById(id);
const dom = {
  setup: el('setup'),
  setupError: el('setupError'),
  sessionLabel: el('sessionLabel'),
  startBtn: el('startBtn'),
  scanner: el('scanner'),
  video: el('video'),
  overlay: el('overlay'),
  visibleCount: el('visibleCount'),
  sessionCount: el('sessionCount'),
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
// YOLOv8 inference
// ---------------------------------------------------------------------

async function loadModel() {
  state.ortSession = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
  });
  state.outputKey = state.ortSession.outputNames[0];
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

// YOLOv8 output shape: [1, 84, 8400]. Layout per anchor:
//   [0..3]  : cx, cy, w, h (in 640x640 letterboxed coords)
//   [4..83] : 80 COCO class scores (no objectness in v8)
// We only care about class 73 (book).
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
      const detections = postprocess(result[state.outputKey], letterbox);
      state.lastDetections = detections;
      state.visibleCount = detections.length;
      drawOverlay(detections, letterbox);
      dom.visibleCount.textContent = detections.length;
    }
  } catch (err) {
    console.error('detect tick failed', err);
  } finally {
    if (state.running) {
      detectTimer = setTimeout(detectTick, DETECT_INTERVAL_MS);
    }
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

// ---------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------

dom.startBtn.addEventListener('click', async () => {
  setSetupError(null);
  dom.startBtn.disabled = true;
  dom.startBtn.textContent = 'Starting…';
  try {
    state.sessionLabel =
      dom.sessionLabel.value.trim() ||
      `scan-${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    // Request sensor permissions in parallel with model load.
    await Promise.all([
      requestOrientation(),
      requestGeo(),
      loadModel(),
      startCamera(),
    ]);
    await refreshTotals();
    state.sessionCount = 0;
    dom.sessionCount.textContent = 0;
    dom.visibleCount.textContent = 0;
    updateSensorMeta();
    dom.setup.hidden = true;
    dom.scanner.hidden = false;
    state.running = true;
    detectTick();
  } catch (err) {
    console.error('Failed to start', err);
    const msg = err?.message || String(err);
    setSetupError(
      msg.includes('yolov8n.onnx')
        ? 'Model not found. Drop yolov8n.onnx into prototypes/scan/models/ (see README).'
        : `Failed to start: ${msg}`,
    );
    dom.startBtn.disabled = false;
    dom.startBtn.textContent = 'Start scanning';
  }
});

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
