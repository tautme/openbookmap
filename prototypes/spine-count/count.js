// Spine Count — KISS POC.
//
// The counting idea from the full scan prototype, stripped to its kernel:
// open the camera, run YOLOv11n, show how many book spines are visible
// right now. No capture, no IndexedDB, no orientation/geo, no summary.
// Just a live count + a peak high-water mark (the gamification seed).
//
// Inference path (model fetch, letterbox, decode, NMS) is the same proven
// code as prototypes/scan/ — only the surrounding app is KISS.

import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort.bundle.min.mjs';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';

const MODEL_URL =
  'https://huggingface.co/deepghs/yolos/resolve/main/yolo11n/model.onnx';
const INPUT_SIZE = 640;
const BOOK_CLASS_INDEX = 73; // COCO "book"
const SCORE_THRESHOLD = 0.4;
const IOU_THRESHOLD = 0.45;
const DETECT_INTERVAL_MS = 180;

const el = (id) => document.getElementById(id);
const dom = {
  video: el('video'),
  canvas: el('overlayCanvas'),
  count: el('count'),
  countNum: el('countNum'),
  peak: el('peak'),
  peakNum: el('peakNum'),
  overlay: el('overlay'),
  warn: el('warn'),
  startBtn: el('startBtn'),
  loading: el('loading'),
  barFill: el('barFill'),
  loadingLabel: el('loadingLabel'),
  err: el('err'),
};

let session = null;
let outputKey = null;
let running = false;
let timer = null;
let peak = 0;
let loggedShape = false;

// ---- model ------------------------------------------------------------

async function loadModel() {
  const bytes = await fetchWithProgress(MODEL_URL, (loaded, total) => {
    const mb = (n) => (n / 1048576).toFixed(1);
    if (total > 0) {
      dom.barFill.style.width = `${((loaded / total) * 100).toFixed(0)}%`;
      dom.loadingLabel.textContent = `Loading model… ${mb(loaded)} / ${mb(total)} MB`;
    } else {
      dom.loadingLabel.textContent = `Loading model… ${mb(loaded)} MB`;
    }
  });
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['webgpu', 'wasm'],
  });
  outputKey = session.outputNames[0];
  console.log('Output names:', session.outputNames);
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Model fetch failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body?.getReader?.();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
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

// ---- inference --------------------------------------------------------

let _preCanvas = null;

function preprocess(video) {
  const inW = video.videoWidth;
  const inH = video.videoHeight;
  const scale = INPUT_SIZE / Math.max(inW, inH);
  const sw = inW * scale;
  const sh = inH * scale;
  const dx = (INPUT_SIZE - sw) / 2;
  const dy = (INPUT_SIZE - sh) / 2;

  _preCanvas ||= document.createElement('canvas');
  _preCanvas.width = INPUT_SIZE;
  _preCanvas.height = INPUT_SIZE;
  const ctx = _preCanvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(video, dx, dy, sw, sh);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const t = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    t[i] = data[i * 4] / 255;
    t[i + plane] = data[i * 4 + 1] / 255;
    t[i + 2 * plane] = data[i * 4 + 2] / 255;
  }
  return {
    tensor: new ort.Tensor('float32', t, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    letterbox: { scale, dx, dy, inW, inH },
  };
}

// YOLOv8/v11 detection output: [1, 84, 8400]. Per anchor: cx,cy,w,h then
// 80 class scores. We only read class 73.
function postprocess(output, lb) {
  const data = output.data;
  const numAnchors = output.dims[2];
  const classOffset = 4 + BOOK_CLASS_INDEX;
  const out = [];
  for (let i = 0; i < numAnchors; i++) {
    const score = data[classOffset * numAnchors + i];
    if (score < SCORE_THRESHOLD) continue;
    const cx = data[i];
    const cy = data[numAnchors + i];
    const w = data[2 * numAnchors + i];
    const h = data[3 * numAnchors + i];
    const x = (cx - w / 2 - lb.dx) / lb.scale;
    const y = (cy - h / 2 - lb.dy) / lb.scale;
    out.push({
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: w / lb.scale,
      h: h / lb.scale,
      score,
    });
  }
  return nms(out, IOU_THRESHOLD);
}

function nms(boxes, iouThresh) {
  boxes.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const b of boxes) {
    if (!kept.some((k) => iou(b, k) > iouThresh)) kept.push(b);
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

// ---- loop + render ----------------------------------------------------

async function tick() {
  if (!running) return;
  try {
    if (dom.video.readyState >= 2 && session) {
      const { tensor, letterbox } = preprocess(dom.video);
      const result = await session.run({
        [session.inputNames[0]]: tensor,
      });
      const output = result[outputKey];
      if (!loggedShape) {
        loggedShape = true;
        console.log('Output shape (first inference):', output.dims);
        if (
          output.dims.length !== 3 ||
          output.dims[1] !== 84 ||
          output.dims[2] !== 8400
        ) {
          running = false;
          fail(
            `Unexpected model output shape [${output.dims.join(', ')}]. ` +
              `Expected [1, 84, 8400]. Stopped — tell Claude before patching.`,
          );
          return;
        }
      }
      const detections = postprocess(output, letterbox);
      render(detections, letterbox);
    }
  } catch (err) {
    console.error('tick failed', err);
  } finally {
    if (running) timer = setTimeout(tick, DETECT_INTERVAL_MS);
  }
}

function render(detections, lb) {
  const n = detections.length;
  setCount(n);

  const c = dom.canvas;
  if (c.width !== lb.inW || c.height !== lb.inH) {
    c.width = lb.inW;
    c.height = lb.inH;
  }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
  for (const d of detections) {
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeRect(d.x, d.y, d.w, d.h);
  }
}

let lastCount = 0;
function setCount(n) {
  if (n !== lastCount) {
    lastCount = n;
    dom.countNum.textContent = n;
    dom.count.classList.add('bump');
    setTimeout(() => dom.count.classList.remove('bump'), 120);
  }
  if (n > peak) {
    peak = n;
    dom.peakNum.textContent = peak;
  }
}

// ---- camera + start ---------------------------------------------------

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  dom.video.srcObject = stream;
  await new Promise((resolve) => {
    if (dom.video.readyState >= 2) resolve();
    else dom.video.addEventListener('loadeddata', resolve, { once: true });
  });
  await dom.video.play();
}

function fail(msg) {
  dom.err.textContent = msg;
  dom.err.hidden = false;
  dom.loading.hidden = true;
  dom.startBtn.disabled = false;
  dom.startBtn.textContent = 'Retry';
  dom.overlay.hidden = false;
}

dom.startBtn.addEventListener('click', async () => {
  dom.err.hidden = true;
  dom.startBtn.disabled = true;
  dom.loading.hidden = false;
  try {
    await Promise.all([loadModel(), startCamera()]);
    dom.overlay.hidden = true;
    dom.count.hidden = false;
    dom.peak.hidden = false;
    running = true;
    tick();
  } catch (err) {
    console.error(err);
    fail(`Failed to start: ${err.message || err}`);
  }
});

// WebGPU availability hint — the counter is far smoother on WebGPU.
if (!navigator.gpu) {
  dom.warn.hidden = false;
  dom.warn.innerHTML =
    '⚠️ WebGPU unavailable — falling back to single-threaded WASM. ' +
    'The count will update slowly (≈ 1–2× per second) on this device.';
}
